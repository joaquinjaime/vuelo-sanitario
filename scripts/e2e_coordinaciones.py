"""Coordinaciones declaradas: prueba SQL/Chrome sólo en el proyecto E2E."""
import json, subprocess, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from e2e_clima import ROOT, PROJECT, MARK, PASSWORD, call, sql, login, create_user
from e2e_credential_support import provision
from e2e_hangar_ubicacion_concurrente import wait_for_gate

def main():
    info=json.loads(subprocess.run(['docker','inspect',PROJECT+'-backend-1'],check=True,capture_output=True,text=True).stdout)[0]
    env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
    assert 'databaseName=vuelos_sanitarios_e2e;' in env.get('DB_URL','') and sql('SET NOCOUNT ON; SELECT DB_NAME();')=='vuelos_sanitarios_e2e'
    config={}
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);config[k.strip()]=v.strip().strip('"').strip("'")
    admin=login(config['BOOTSTRAP_ADMIN_USERNAME'],config['BOOTSTRAP_ADMIN_PASSWORD'])['accessToken']
    ops=create_user(admin,'CENTRO_OPERACIONES','aaops');cmd=create_user(admin,'COMANDANTE','aacmd');san_cmd=create_user(admin,'COMANDANTE','aasan');other=create_user(admin,'COMANDANTE','aaother');dts=create_user(admin,'DTS','aadts')
    for c in (cmd,san_cmd,other):provision(admin,c,'COMANDANTE')
    for province in call('/catalogs/provinces',token=ops['token']):
        airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token']);localities=call('/catalogs/localities?provinceId='+str(province['id']),token=ops['token'])
        if len(airports)>=3 and len(localities)>=2:break
    else:raise AssertionError('Faltan aeropuertos y localidades')
    for c in (cmd,san_cmd,other):call(f'/catalogs/commanders/{c["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    planes=[call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+suffix,'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin) for suffix in ('A','B','C','D','E')]
    when=(datetime.now()+timedelta(days=1800)).replace(microsecond=0)
    operational=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Coordinación E2E simulada '+MARK,'aircraftId':planes[0]['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':when.isoformat(),'llegada':(when+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{operational}/commander-assignment/response','POST',{'aceptar':True},cmd['token']);when+=timedelta(days=1)
    patient=call('/patients','POST',{'nombre':'Coordina','apellido':MARK},dts['token']);priority=call('/catalogs/priorities',token=dts['token'])[0]['codigo']
    sanitary=call('/flights','POST',{'patientId':patient['id'],'localidadOrigenId':localities[0]['id'],'localidadDestinoId':localities[1]['id'],'priorityCode':priority,'motivoVuelo':'Coordinación E2E simulada '+MARK,'fechaSolicitada':when.isoformat(),'extremaUrgencia':True,'justificacionExtremaUrgencia':'Escenario E2E simulado','fechaLimiteTraslado':(when+timedelta(hours=4)).isoformat(),'medical':{'diagnostico':'Prueba E2E','condicionMedica':'ESTABLE','requiereEquipamientoEspecial':False}},dts['token'])['id']
    call(f'/flights/{sanitary}/schedule/accept','POST',token=ops['token']);call(f'/flights/{sanitary}/resources','POST',{'aircraftId':planes[1]['id'],'comandanteId':san_cmd['id']},ops['token']);call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    proc=subprocess.run(['node',str(ROOT/'scripts'/'e2e-coordinaciones-ui.cjs')],input=json.dumps({'commanders':[cmd['name'],san_cmd['name']],'ops':ops['name'],'password':PASSWORD,'flights':[operational,sanitary],'airportName':airports[0]['nombre'],'airportId':airports[0]['id']}),text=True,capture_output=True)
    if proc.returncode:raise AssertionError('Navegador: '+proc.stderr[-4000:])
    print(proc.stdout.strip(),flush=True)
    paths=[];groups=[]
    for fid,owner in ((operational,cmd),(sanitary,san_cmd)):
        path=f'/flights/{fid}/airport-coordinations'; data=call(path,token=ops['token']); current=next(x for x in data['versiones'] if x['actual']);group=current['gestionId'];paths.append(path);groups.append(group)
        assert current['version']==2 and current['estado']=='CONFIRMADO' and current['fuenteRespuesta']=='Prueba E2E simulada'
        assert sql(f"SET NOCOUNT ON; SELECT CONCAT(COUNT(*),':',SUM(CAST(es_version_actual AS int))) FROM coordinaciones_aa2000 WHERE id_vuelos={fid};")=='2:1'
        assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos={fid} AND tipo_entidad=N'AA2000_COORDINATION';")=='2'
        assert len(call(path,token=admin)['versiones'])==2 and len(call(path,token=owner['token'])['versiones'])==2
        call(path,token=other['token'],expected=(403,));call(path,token=dts['token'],expected=(403,))
        item={'version':2,'aeropuertoId':airports[0]['id'],'finalidad':current['finalidad'],'descripcion':current['descripcion'],'estado':'CONFIRMADO','contacto':'Contacto E2E ficticio','canal':'Simulación E2E','fechaComunicacion':'2025-01-01T12:00:00','fechaRespuesta':'2025-01-01T12:15:00','fuenteRespuesta':'Prueba E2E simulada','referenciaExterna':'E2E-SIMULADO','motivoCambio':'Verificación E2E'}
        call(path+'/'+group,'PUT',item,owner['token'],(403,));call(path+'/'+group,'PUT',{**item,'version':1},ops['token'],(409,))
        call(path+'/'+group,'PUT',{**item,'fuenteRespuesta':''},ops['token'],(400,));call(path+'/'+group,'PUT',{**item,'fechaRespuesta':'2024-01-01T12:00:00'},ops['token'],(400,))
        call(path,'POST',{'version':0,'aeropuertoId':999999999,'finalidad':'Prueba','descripcion':'E2E','estado':'PENDIENTE'},ops['token'],(400,))
        call(path,'POST',{'version':0,'aeropuertoId':airports[0]['id'],'finalidad':current['finalidad'],'descripcion':'Duplicado E2E','estado':'PENDIENTE'},ops['token'],(409,))
    path=paths[0];group=groups[0];v=next(x for x in call(path,token=ops['token'])['versiones'] if x['actual'])
    race={'version':2,'aeropuertoId':v['aeropuertoId'],'finalidad':v['finalidad'],'descripcion':v['descripcion'],'estado':'CONFIRMADO','contacto':v['contacto'],'canal':v['canal'],'fechaComunicacion':v['fechaComunicacion'],'fechaRespuesta':v['fechaRespuesta'],'fuenteRespuesta':v['fuenteRespuesta'],'referenciaExterna':v['referenciaExterna'],'motivoCambio':'Concurrencia E2E'}
    with ThreadPoolExecutor(max_workers=2) as pool: outcomes=list(pool.map(lambda _:call(path+'/'+group,'PUT',race,ops['token'],(200,409)),range(2)))
    assert sum(isinstance(x,dict) and x.get('gestionId')==group for x in outcomes)==1
    # Otra gestión independiente del mismo vuelo.
    extra={'version':0,'aeropuertoId':airports[1]['id'],'finalidad':'Otro trámite E2E','descripcion':'Gestión independiente simulada','estado':'PENDIENTE'}
    result=call(path,'POST',extra,ops['token']);assert sum(x['actual'] for x in call(path,token=ops['token'])['versiones'])==2
    second=result['gestionId']
    follow={**extra,'version':1,'estado':'EN_SEGUIMIENTO','contacto':'Contacto ficticio E2E','canal':'Prueba E2E','fechaComunicacion':'2025-01-01T10:00:00','motivoCambio':'Comunicación simulada'}
    # Mantener una escritura abierta y verificar que otra gestión del mismo
    # vuelo puede completar su propia transacción antes de liberar la primera.
    trigger='e2e_coord_parallel_'+str(operational);resource=MARK+'parallel'
    statement=(f"CREATE TRIGGER dbo.{trigger} ON dbo.coordinaciones_aa2000 AFTER UPDATE AS BEGIN SET NOCOUNT ON; "
        f"IF EXISTS (SELECT 1 FROM inserted WHERE identificador_gestion=''{group}'' AND es_version_actual=0) BEGIN "
        f"DECLARE @r int; EXEC @r=sp_getapplock @Resource=N''{resource}'', @LockMode=N''Exclusive'', @LockOwner=N''Transaction'', @LockTimeout=1000; "
        "IF @r < 0 THROW 51000,N''Barrera E2E no disponible'',1; WAITFOR DELAY ''00:00:15''; END END")
    sql(f"EXEC(N'{statement}');")
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(lambda:call(path+'/'+group,'PUT',{**race,'version':3},ops['token']))
            wait_for_gate(resource,first)
            independent=pool.submit(lambda:call(path+'/'+second,'PUT',follow,ops['token']))
            try: result=independent.result(timeout=6)
            except TimeoutError:
                print('Bloqueos E2E:',sql("SET NOCOUNT ON; SELECT CONCAT(r.session_id,':',r.blocking_session_id,':',r.wait_type,':',LEFT(t.text,350)) FROM sys.dm_exec_requests r CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t WHERE r.blocking_session_id<>0;"),flush=True)
                raise
            assert result['version']==2 and not first.done()
            assert first.result(timeout=30)['version']==4
    finally:sql(f'DROP TRIGGER dbo.{trigger};')
    rejection={**follow,'version':2,'estado':'RECHAZADO','fechaRespuesta':'2025-01-01T11:00:00','fuenteRespuesta':'Rechazo simulado E2E','motivoCambio':'Respuesta simulada'}
    assert call(path+'/'+second,'PUT',rejection,ops['token'])['estado']=='RECHAZADO'
    cancellation={**follow,'version':3,'estado':'CANCELADO','motivoCambio':'Cierre simulado'}
    assert call(path+'/'+second,'PUT',cancellation,ops['token'])['estado']=='CANCELADO'
    call(path+'/'+second,'PUT',{**follow,'version':4},ops['token'],(400,))
    trigger='e2e_coord_audit_'+str(operational)
    sql(f"EXEC(N'CREATE TRIGGER dbo.{trigger} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id_vuelos={operational} AND tipo_entidad=N''AA2000_COORDINATION'') THROW 51000, N''Fallo E2E'', 1; END');")
    try:
        call(path+'/'+group,'PUT',{**race,'version':4},ops['token'],(500,))
        assert next(x for x in call(path,token=ops['token'])['versiones'] if x['actual'] and x['gestionId']==group)['version']==4
    finally:sql(f'DROP TRIGGER dbo.{trigger};')
    call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[2]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    assert next(x for x in call(paths[1],token=ops['token'])['versiones'] if x['actual'])['estadoVigencia']=='REQUIERE_REVISION'
    call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    assert next(x for x in call(paths[1],token=ops['token'])['versiones'] if x['actual'])['estadoVigencia']=='VIGENTE'
    call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=3)).isoformat()},san_cmd['token'])
    assert next(x for x in call(paths[1],token=ops['token'])['versiones'] if x['actual'])['estadoVigencia']=='REQUIERE_REVISION'
    call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    reason=next(x for x in call('/catalogs/cancellation-reasons',token=ops['token']) if x['codigo']!='OTRO')
    call(f'/flights/{sanitary}/cancel','POST',{'motivoCancelacionId':reason['id']},ops['token'])
    assert call(paths[1],token=ops['token'])['puedeGestionar'] is False
    call(paths[1]+'/'+groups[1],'PUT',{'version':2,'aeropuertoId':airports[0]['id'],'finalidad':'E2E gestión '+str(sanitary),'descripcion':'E2E','estado':'PENDIENTE','motivoCambio':'Cancelado'},ops['token'],(400,))
    call(f'/flights/{operational}/start','POST',token=ops['token']);call(f'/flights/{operational}/finish','POST',token=ops['token'])
    assert call(path,token=ops['token'])['puedeGestionar'] is False
    # Un vuelo sin coordinación puede iniciar y finalizar.
    departure=when+timedelta(days=3)
    no_coord=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Sin coordinación E2E '+MARK,'aircraftId':planes[2]['id'],'comandanteId':other['id'],'destinoId':airports[1]['id'],'salida':departure.isoformat(),'llegada':(departure+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{no_coord}/commander-assignment/response','POST',{'aceptar':True},other['token']);assert call(f'/flights/{no_coord}/airport-coordinations',token=ops['token'])['versiones']==[]
    call(f'/flights/{no_coord}/start','POST',token=ops['token']);call(f'/flights/{no_coord}/finish','POST',token=ops['token'])
    # Una replanificación cambia aeronave y salida sin alterar la evidencia.
    departure=when+timedelta(days=5)
    replanned=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Replanificación E2E '+MARK,'aircraftId':planes[3]['id'],'comandanteId':other['id'],'destinoId':airports[1]['id'],'salida':departure.isoformat(),'llegada':(departure+timedelta(hours=2)).isoformat()},ops['token'])['id']
    replan_path=f'/flights/{replanned}/airport-coordinations'
    call(replan_path,'POST',{'version':0,'aeropuertoId':airports[0]['id'],'finalidad':'Replanificación E2E','descripcion':'Evidencia simulada','estado':'PENDIENTE'},ops['token'])
    call(f'/flights/{replanned}/commander-assignment/response','POST',{'aceptar':False,'motivo':'Replanificación simulada'},other['token'])
    call(f'/flights/{replanned}/operational-replanning','POST',{'aircraftId':planes[4]['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':(departure+timedelta(hours=1)).isoformat(),'llegada':(departure+timedelta(hours=3)).isoformat()},ops['token'])
    assert call(replan_path,token=ops['token'])['versiones'][0]['estadoVigencia']=='REQUIERE_REVISION'
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200:break
        except Exception:time.sleep(2)
    else:raise AssertionError('Backend no saludable tras reinicio')
    for path,group in zip(paths,groups):assert any(x['actual'] and x['gestionId']==group and x['estado']=='CONFIRMADO' for x in call(path,token=ops['token'])['versiones'])
    print(f'PASS SQL, API, permisos, concurrencia, rollback, replanificación, vuelo sin coordinación y reinicio: vuelos {operational}, {sanitary}, sin coordinación {no_coord}, marca {MARK}',flush=True)

if __name__=='__main__':main()
