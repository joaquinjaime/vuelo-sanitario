"""Prueba integral no destructiva de hangar contra SQL Server E2E."""
import json, subprocess, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
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
    ops=create_user(admin,'CENTRO_OPERACIONES','hangops');cmd=create_user(admin,'COMANDANTE','hangcmd');san_cmd=create_user(admin,'COMANDANTE','hangsan');other=create_user(admin,'COMANDANTE','hangother');dts=create_user(admin,'DTS','hangdts')
    provision(admin,cmd,'COMANDANTE');provision(admin,san_cmd,'COMANDANTE');provision(admin,other,'COMANDANTE')
    for province in call('/catalogs/provinces',token=ops['token']):
        airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token']);localities=call('/catalogs/localities?provinceId='+str(province['id']),token=ops['token'])
        if len(airports)>=3 and len(localities)>=2:break
    else:raise AssertionError('Faltan aeropuertos y localidades')
    for c in (cmd,san_cmd,other):call(f'/catalogs/commanders/{c["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    planes=[call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+suffix,'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin) for suffix in ('A','B','C','D')]
    when=(datetime.now()+timedelta(days=700)).replace(microsecond=0)
    operational=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Hangar '+MARK,'aircraftId':planes[0]['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':when.isoformat(),'llegada':(when+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{operational}/commander-assignment/response','POST',{'aceptar':True},cmd['token'])
    when+=timedelta(days=1)
    patient=call('/patients','POST',{'nombre':'Hangar','apellido':MARK},dts['token']);priority=call('/catalogs/priorities',token=dts['token'])[0]['codigo']
    sanitary=call('/flights','POST',{'patientId':patient['id'],'localidadOrigenId':localities[0]['id'],'localidadDestinoId':localities[1]['id'],'priorityCode':priority,'motivoVuelo':'Hangar '+MARK,'fechaSolicitada':when.isoformat(),'extremaUrgencia':False,'medical':{'diagnostico':'Prueba','condicionMedica':'ESTABLE','requiereEquipamientoEspecial':False}},dts['token'])['id']
    call(f'/flights/{sanitary}/schedule/accept','POST',token=ops['token']);call(f'/flights/{sanitary}/resources','POST',{'aircraftId':planes[1]['id'],'comandanteId':san_cmd['id']},ops['token']);call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    for fid in (operational,sanitary):assert call(f'/flights/{fid}/hangar',token=ops['token'])['estado']=='SIN_REGISTRO'
    proc=subprocess.run(['node',str(ROOT/'scripts'/'e2e-hangar-ui.cjs')],input=json.dumps({'commanders':[cmd['name'],san_cmd['name']],'ops':ops['name'],'password':PASSWORD,'flights':[operational,sanitary]}),text=True,capture_output=True)
    if proc.returncode:raise AssertionError('Navegador: '+proc.stderr[-4000:])
    print(proc.stdout.strip(),flush=True)
    # El índice filtrado V40 rechaza dos versiones actuales incluso fuera del servicio.
    assert sql(f"SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; BEGIN TRY BEGIN TRAN; INSERT INTO informacion_hangar (id_vuelos,version,es_version_actual,preparacion_completa,id_usuario_registrador,fecha_creacion) SELECT id_vuelos,version+100000,1,0,id_usuario_registrador,SYSDATETIME() FROM informacion_hangar WHERE id_vuelos={operational} AND es_version_actual=1; ROLLBACK; SELECT 0; END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; SELECT ERROR_NUMBER(); END CATCH;") in ('2601','2627')
    for fid,owner in ((operational,cmd),(sanitary,san_cmd)):
        path=f'/flights/{fid}/hangar'; data=call(path,token=ops['token']);assert data['estado']=='PREPARACION_PENDIENTE' and len(data['versiones'])==2
        assert sql(f"SET NOCOUNT ON; SELECT CONCAT(COUNT(*),':',SUM(CAST(es_version_actual AS int))) FROM informacion_hangar WHERE id_vuelos={fid};")=='2:1'
        assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos={fid} AND tipo_entidad=N'HANGAR_INFO';")=='2'
        call(path,token=other['token'],expected=(403,));call(path,token=dts['token'],expected=(403,))
        body={'version':2,'requiereHangar':True,'preparacionCompleta':True,'observaciones':'Preparación lista'}
        call(path,'PUT',body,owner['token'],(403,));call(path+'/commander-observation','PUT',{'version':2,'observaciones':'Ajeno'},other['token'],(403,))
        call(path,'PUT',{**body,'requiereHangar':False},ops['token'],(400,))
        assert call(path,'PUT',body,ops['token'])['estado']=='PREPARACION_COMPLETA'
        call(path,'PUT',body,ops['token'],(409,))
        assert call(path,token=owner['token'])['versiones'][0]['observacionesComandante'].startswith('Observación navegador')
    # Dos escrituras con la misma versión: una sola puede prosperar.
    path=f'/flights/{operational}/hangar';body={'version':3,'requiereHangar':True,'preparacionCompleta':False,'observaciones':'Carrera '+MARK}
    def race(_):return call(path,'PUT',body,ops['token'],(200,409))
    with ThreadPoolExecutor(max_workers=2) as pool: outcomes=list(pool.map(race,range(2)))
    assert sum(isinstance(x,dict) and 'versiones' in x for x in outcomes)==1
    assert sql(f"SET NOCOUNT ON; SELECT CONCAT(COUNT(*),':',SUM(CAST(es_version_actual AS int))) FROM informacion_hangar WHERE id_vuelos={operational};")=='4:1'
    # La falla de auditoría debe revertir la versión y la marca de vigencia.
    trigger='e2e_hangar_audit_'+str(operational)
    sql(f"EXEC(N'CREATE TRIGGER dbo.{trigger} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id_vuelos={operational} AND tipo_entidad=N''HANGAR_INFO'') THROW 51000, N''Fallo de prueba'', 1; END');")
    try:
        call(path,'PUT',{**body,'version':4},ops['token'],(500,))
        assert sql(f"SET NOCOUNT ON; SELECT CONCAT(COUNT(*),':',SUM(CAST(es_version_actual AS int))) FROM informacion_hangar WHERE id_vuelos={operational};")=='4:1'
    finally:sql(f'DROP TRIGGER dbo.{trigger};')
    # Cambiar el origen de la planificación sanitaria hace visible la revisión y no declara presencia física.
    call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[2]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    spath=f'/flights/{sanitary}/hangar';assert call(spath,token=ops['token'])['estado']=='REQUIERE_REVISION'
    call(spath,'PUT',{'version':3,'requiereHangar':True,'preparacionCompleta':True,'observaciones':'Revisar'},ops['token'],(409,))
    call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    # Registrar expresamente que no se requiere y completar sin bloqueo.
    assert call(path,'PUT',{'version':4,'requiereHangar':False,'preparacionCompleta':False,'observaciones':'Sin servicio requerido'},ops['token'])['estado']=='NO_REQUERIDO'
    for fid,version in ((operational,5),(sanitary,3)):
        call(f'/flights/{fid}/start','POST',token=ops['token']);call(f'/flights/{fid}/finish','POST',token=ops['token'])
        call(f'/flights/{fid}/hangar','PUT',{'version':version,'requiereHangar':False,'preparacionCompleta':False},ops['token'],(400,))
    # Cancelación conserva la versión; otro vuelo opera sin crear ningún registro.
    def extra(day):
        departure=when+timedelta(days=day)
        return call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Hangar adicional '+MARK,'aircraftId':planes[2]['id'],'comandanteId':other['id'],'destinoId':airports[1]['id'],'salida':departure.isoformat(),'llegada':(departure+timedelta(hours=2)).isoformat()},ops['token'])['id']
    cancelled=extra(2); cpath=f'/flights/{cancelled}/hangar'
    call(cpath,'PUT',{'version':0,'requiereHangar':True,'preparacionCompleta':False,'observaciones':'Se conserva'},ops['token'])
    call(f'/flights/{cancelled}/commander-assignment/response','POST',{'aceptar':False,'motivo':'Replanificar'},other['token'])
    departure=when+timedelta(days=2)
    call(f'/flights/{cancelled}/operational-replanning','POST',{'aircraftId':planes[3]['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':departure.isoformat(),'llegada':(departure+timedelta(hours=2)).isoformat()},ops['token'])
    assert call(cpath,token=ops['token'])['estado']=='REQUIERE_REVISION'
    call(cpath,token=other['token'],expected=(403,));assert call(cpath,token=cmd['token'])['estado']=='REQUIERE_REVISION'
    reason=next(x for x in call('/catalogs/cancellation-reasons',token=ops['token']) if x['codigo']!='OTRO')
    call(f'/flights/{cancelled}/cancel','POST',{'motivoCancelacionId':reason['id']},ops['token'])
    assert call(cpath,token=ops['token'])['versiones'][0]['observaciones']=='Se conserva'
    call(cpath,'PUT',{'version':1,'requiereHangar':False,'preparacionCompleta':False},ops['token'],(400,))
    nohangar=extra(4);call(f'/flights/{nohangar}/commander-assignment/response','POST',{'aceptar':True},other['token'])
    call(f'/flights/{nohangar}/start','POST',token=ops['token']);call(f'/flights/{nohangar}/finish','POST',token=ops['token'])
    assert sql(f'SET NOCOUNT ON; SELECT COUNT(*) FROM informacion_hangar WHERE id_vuelos={nohangar};')=='0'
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(60):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200:break
        except Exception:time.sleep(2)
    else:raise AssertionError('Backend no saludable tras reinicio')
    assert call(path,token=ops['token'])['estado']=='NO_REQUERIDO'
    assert call(spath,token=ops['token'])['versiones'][0]['observacionesComandante'].startswith('Observación navegador')
    print(f'PASS SQL, permisos, versiones, concurrencia, rollback, cambio de origen, cancelación, finalización, vuelo sin registro y reinicio: operativo {operational}, sanitario {sanitary}, cancelado {cancelled}, sin hangar {nohangar}, marca {MARK}',flush=True)

if __name__=='__main__':main()
