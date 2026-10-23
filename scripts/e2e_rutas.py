"""Prueba de rutas contra el proyecto E2E aislado. No elimina registros."""
import json, subprocess, time, urllib.request
from datetime import datetime, timedelta
from e2e_clima import ROOT, PROJECT, MARK, PASSWORD, call, sql, login, create_user
from e2e_credential_support import provision

def main():
    info=json.loads(subprocess.run(['docker','inspect',PROJECT+'-backend-1'],check=True,capture_output=True,text=True).stdout)[0]
    env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
    assert 'databaseName=vuelos_sanitarios_e2e;' in env.get('DB_URL','')
    assert sql('SET NOCOUNT ON; SELECT DB_NAME();')=='vuelos_sanitarios_e2e'
    config={}
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1); config[k.strip()]=v.strip().strip('"').strip("'")
    admin=login(config['BOOTSTRAP_ADMIN_USERNAME'],config['BOOTSTRAP_ADMIN_PASSWORD'])['accessToken']
    ops=create_user(admin,'CENTRO_OPERACIONES','routeops'); cmd=create_user(admin,'COMANDANTE','routecmd'); other=create_user(admin,'COMANDANTE','routeother')
    provision(admin,cmd,'COMANDANTE')
    for p in call('/catalogs/provinces',token=ops['token']):
        airports=call('/catalogs/airports?provinceId='+str(p['id']),token=ops['token'])
        if len(airports)>=3: break
    call(f'/catalogs/commanders/{cmd["id"]}/location','POST',{'locationId':p['id']},ops['token'])
    aircraft=call('/catalogs/aircraft','POST',{'matricula':MARK.upper(),'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
    departure=(datetime.now()+timedelta(days=6000)).replace(microsecond=0)
    f=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Ruta '+MARK,'aircraftId':aircraft['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':departure.isoformat(),'llegada':(departure+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{f}/commander-assignment/response','POST',{'aceptar':True},cmd['token'])
    path=f'/flights/{f}/route'; assert call(path,token=cmd['token'])['estado']=='SIN_PLANIFICAR'
    body={'version':0,'recorrido':'E2E PUNTO ALFA BRAVO','alternativoId':airports[2]['id'],'altitudPies':5500,'distanciaNm':150,'tiempoEstimadoMinutos':95,'observaciones':'Ruta interna'}
    call(path,'PUT',body,other['token'],(403,)); call(path,'PUT',body,ops['token'],(403,))
    call(path,'PUT',{**body,'alternativoId':999999999},cmd['token'],(400,))
    saved=call(path,'PUT',body,cmd['token']); assert saved['estado']=='COMPLETA' and saved['versiones'][0]['version']==1
    assert next(x for x in call('/flights/route-statuses',token=ops['token']) if x['flightId']==f)['estado']=='COMPLETA'
    call('/flights/route-statuses',token=cmd['token'],expected=(403,))
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos={f} AND version=1 AND recorrido_planificado=N'E2E PUNTO ALFA BRAVO';")=='1'
    updated=call(path,'PUT',{**body,'version':1,'recorrido':'E2E PUNTO ALFA CHARLIE'},cmd['token']); assert len(updated['versiones'])==2
    call(path,'PUT',{**body,'version':1},cmd['token'],(409,))
    assert call(path,token=ops['token'])['versiones'][0]['recorrido']=='E2E PUNTO ALFA CHARLIE'
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos={f} AND tipo_entidad=N'FLIGHT_ROUTE';")=='2'
    proc=subprocess.run(['node',str(ROOT/'scripts'/'e2e-rutas-ui.cjs')],input=json.dumps({'cmd':cmd['name'],'ops':ops['name'],'password':PASSWORD,'flightId':str(f),'checkSummary':True}),text=True,capture_output=True)
    if proc.returncode: raise AssertionError('Navegador: '+proc.stderr[-3000:])
    print(proc.stdout.strip(),flush=True)
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos={f} AND version=3 AND recorrido_planificado=N'E2E RUTA NAVEGADOR';")=='1'
    call(f'/flights/{f}/start','POST',token=ops['token'])
    call(path,'PUT',{**body,'version':3},cmd['token'],(400,))
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200: break
        except Exception: time.sleep(2)
    else: raise AssertionError('Backend no saludable tras reinicio')
    assert call(path,token=ops['token'])['versiones'][0]['recorrido']=='E2E RUTA NAVEGADOR'
    print('PASS ruta operativa SQL, API, permisos, estado, auditoría, versiones y reinicio; vuelo',f,'marca',MARK,flush=True)
if __name__=='__main__': main()
