"""Ruta sanitaria en la base E2E aislada; conserva los datos de prueba."""
import concurrent.futures, json, subprocess, threading, time, urllib.request
from datetime import datetime, timedelta
from e2e_clima import ROOT, PROJECT, MARK, PASSWORD, call, sql, login, create_user
from e2e_credential_support import provision

def main():
    info=json.loads(subprocess.run(['docker','inspect',PROJECT+'-backend-1'],check=True,capture_output=True,text=True).stdout)[0]
    env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
    assert 'databaseName=vuelos_sanitarios_e2e;' in env.get('DB_URL','') and sql('SET NOCOUNT ON; SELECT DB_NAME();')=='vuelos_sanitarios_e2e'
    config={}
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);config[k.strip()]=v.strip().strip('"').strip("'")
    admin=login(config['BOOTSTRAP_ADMIN_USERNAME'],config['BOOTSTRAP_ADMIN_PASSWORD'])['accessToken']
    ops=create_user(admin,'CENTRO_OPERACIONES','sanops');cmd=create_user(admin,'COMANDANTE','sancmd');dts=create_user(admin,'DTS','sandts');other=create_user(admin,'COMANDANTE','sanother')
    provision(admin,cmd,'COMANDANTE')
    for p in call('/catalogs/provinces',token=ops['token']):
        airports=call('/catalogs/airports?provinceId='+str(p['id']),token=ops['token']);loc=call('/catalogs/localities?provinceId='+str(p['id']),token=ops['token'])
        if len(airports)>=3 and len(loc)>=2: break
    call(f'/catalogs/commanders/{cmd["id"]}/location','POST',{'locationId':p['id']},ops['token'])
    plane=call('/catalogs/aircraft','POST',{'matricula':MARK.upper(),'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
    patient=call('/patients','POST',{'nombre':'Ruta','apellido':MARK},dts['token']); when=(datetime.now()+timedelta(days=300)).replace(microsecond=0)
    priority=call('/catalogs/priorities',token=dts['token'])[0]['codigo']
    f=call('/flights','POST',{'patientId':patient['id'],'localidadOrigenId':loc[0]['id'],'localidadDestinoId':loc[1]['id'],'priorityCode':priority,'motivoVuelo':'Ruta sanitaria '+MARK,'fechaSolicitada':when.isoformat(),'extremaUrgencia':False,'medical':{'diagnostico':'Prueba','condicionMedica':'ESTABLE','requiereEquipamientoEspecial':False}},dts['token'])['id']
    call(f'/flights/{f}/schedule/accept','POST',token=ops['token'])
    call(f'/flights/{f}/resources','POST',{'aircraftId':plane['id'],'comandanteId':cmd['id']},ops['token'])
    call(f'/flights/{f}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},cmd['token'])
    path=f'/flights/{f}/route'; body={'version':0,'recorrido':'E2E PUNTO ALFA BRAVO','alternativoId':airports[2]['id'],'distanciaNm':120}
    call(path,'PUT',body,other['token'],(403,)); call(path,token=other['token'],expected=(403,))
    assert call(path,'PUT',body,cmd['token'])['estado']=='COMPLETA'
    assert call(path,token=admin)['estado']=='COMPLETA' and call(path,token=dts['token'])['estado']=='COMPLETA'
    call(path,'PUT',{**body,'version':1},admin,(403,))
    call(path,'PUT',{**body,'version':1,'recorrido':'E2E PUNTO ALFA CHARLIE'},cmd['token'])
    proc=subprocess.run(['node',str(ROOT/'scripts'/'e2e-rutas-ui.cjs')],input=json.dumps({'cmd':cmd['name'],'ops':ops['name'],'password':PASSWORD,'flightId':str(f)}),text=True,capture_output=True)
    if proc.returncode: raise AssertionError('Navegador: '+proc.stderr[-3000:])
    assert sql(f"SET NOCOUNT ON; SELECT CONCAT((SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos={f}),':',(SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos={f}),':',(SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos={f} AND tipo_entidad=N'FLIGHT_ROUTE')); ")=='1:3:3'
    assert call(path,token=ops['token'])['versiones'][0]['recorrido']=='E2E RUTA NAVEGADOR'
    # Otro vuelo ocupa al mismo tripulante inmediatamente después; ampliar el primero debe fallar.
    member=create_user(admin,'DTS','routecrew');provision(admin,member,'MEDICO');provision(admin,other,'COMANDANTE')
    call(f'/catalogs/commanders/{other["id"]}/location','POST',{'locationId':p['id']},ops['token'])
    plane2=call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+'B','modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
    later=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Conflicto de tripulación '+MARK,'aircraftId':plane2['id'],'comandanteId':other['id'],'destinoId':airports[1]['id'],'salida':(when+timedelta(hours=2)).isoformat(),'llegada':(when+timedelta(hours=4)).isoformat()},ops['token'])['id']
    call(f'/flights/{f}/crew','POST',{'userId':member['id'],'crewRoleCode':'MEDICO'},ops['token'],(204,))
    call(f'/flights/{later}/crew','POST',{'userId':member['id'],'crewRoleCode':'MEDICO'},ops['token'],(204,))
    change_plan={'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=3)).isoformat()}
    call(f'/flights/{f}/operational-planning','POST',change_plan,cmd['token'],(409,))
    assert call(path,token=ops['token'])['estado']=='COMPLETA'
    call(f'/flights/{f}/operational-planning','POST',{**change_plan,'llegada':(when+timedelta(hours=1,minutes=30)).isoformat()},cmd['token'])
    assert call(path,token=ops['token'])['estado']=='REQUIERE_REVISION'
    barrier=threading.Barrier(2)
    def change(name):
        barrier.wait(timeout=10)
        try:
            call(path,'PUT',{**body,'version':3,'recorrido':name},cmd['token']);return 'ok'
        except AssertionError as e:
            if 'HTTP 409' in str(e):return 'conflict'
            raise
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: outcomes=list(pool.map(change,['E2E CONCURRENCIA A','E2E CONCURRENCIA B']))
    assert sorted(outcomes)==['conflict','ok'],outcomes
    current=call(path,token=ops['token']); assert current['estado']=='COMPLETA' and current['versiones'][0]['version']==4
    winner=current['versiones'][0]['recorrido']
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos={f} AND es_version_actual=1;")=='1'
    # Inyección controlada de fallo de auditoría en E2E: comprueba rollback de versión.
    trigger=f'e2e_route_audit_failure_{f}'
    sql(f"EXEC(N'CREATE TRIGGER dbo.{trigger} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id_vuelos={f} AND tipo_entidad=N''FLIGHT_ROUTE'') THROW 51000, N''Fallo de prueba'', 1; END');")
    try:
        call(path,'PUT',{**body,'version':4,'recorrido':'NO DEBE PERSISTIR'},cmd['token'],(500,))
        assert sql(f"SET NOCOUNT ON; SELECT CONCAT(COUNT(*),':',SUM(CASE WHEN es_version_actual=1 AND version=4 THEN 1 ELSE 0 END)) FROM rutas_vuelo WHERE id_vuelos={f};")=='4:1'
        assert call(path,token=ops['token'])['versiones'][0]['recorrido']==winner
    finally:
        sql(f'DROP TRIGGER dbo.{trigger};')
    call(f'/flights/{f}/start','POST',token=ops['token']);call(path,'PUT',{**body,'version':4},cmd['token'],(400,))
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200:break
        except Exception:time.sleep(2)
    else:raise AssertionError('Backend E2E no saludable tras reinicio')
    assert call(path,token=ops['token'])['versiones'][0]['recorrido']==winner
    print('PASS sanitario SQL, API, navegador, seguridad, auditoría y reinicio; vuelo',f,'marca',MARK,flush=True)
if __name__=='__main__':main()
