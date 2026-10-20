"""Bitácora sobre SQL Server aislado; conserva todos los datos de prueba."""
import json, os, subprocess, time, urllib.request
from datetime import datetime, timedelta, timezone
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
    ops=create_user(admin,'CENTRO_OPERACIONES','logops');cmd=create_user(admin,'COMANDANTE','logcmd');san_cmd=create_user(admin,'COMANDANTE','logsancmd');other=create_user(admin,'COMANDANTE','logother');dts=create_user(admin,'DTS','logdts');provision(admin,cmd,'COMANDANTE');provision(admin,san_cmd,'COMANDANTE')
    for province in call('/catalogs/provinces',token=ops['token']):
        airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token']);localities=call('/catalogs/localities?provinceId='+str(province['id']),token=ops['token'])
        if len(airports)>=2 and len(localities)>=2:break
    else:raise AssertionError('Faltan aeropuertos y localidades')
    call(f'/catalogs/commanders/{cmd["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    call(f'/catalogs/commanders/{san_cmd["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    planes=[call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+suffix,'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin) for suffix in ('A','B','C')]
    when=(datetime.now()+timedelta(days=500)).replace(microsecond=0)
    operational=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Bitácora '+MARK,'aircraftId':planes[0]['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':when.isoformat(),'llegada':(when+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{operational}/commander-assignment/response','POST',{'aceptar':True},cmd['token'])
    when+=timedelta(days=1)
    patient=call('/patients','POST',{'nombre':'Bitacora','apellido':MARK},dts['token']);priority=call('/catalogs/priorities',token=dts['token'])[0]['codigo']
    sanitary=call('/flights','POST',{'patientId':patient['id'],'localidadOrigenId':localities[0]['id'],'localidadDestinoId':localities[1]['id'],'priorityCode':priority,'motivoVuelo':'Bitácora '+MARK,'fechaSolicitada':when.isoformat(),'extremaUrgencia':False,'medical':{'diagnostico':'Prueba','condicionMedica':'ESTABLE','requiereEquipamientoEspecial':False}},dts['token'])['id']
    call(f'/flights/{sanitary}/schedule/accept','POST',token=ops['token']);call(f'/flights/{sanitary}/resources','POST',{'aircraftId':planes[1]['id'],'comandanteId':san_cmd['id']},ops['token']);call(f'/flights/{sanitary}/operational-planning','POST',{'origenId':airports[0]['id'],'destinoId':airports[1]['id'],'llegada':(when+timedelta(hours=2)).isoformat()},san_cmd['token'])
    proc=subprocess.run(['node',str(ROOT/'scripts'/'e2e-bitacora-ui.cjs')],input=json.dumps({'commanders':[cmd['name'],san_cmd['name']],'ops':ops['name'],'password':PASSWORD,'flights':[operational,sanitary]}),text=True,capture_output=True)
    if proc.returncode:raise AssertionError('Navegador: '+proc.stderr[-4000:])
    print(proc.stdout.strip(),flush=True)
    occurred=(datetime.now(timezone.utc)-timedelta(minutes=3)).isoformat();body={'tipo':'DEMORA','descripcion':'Corrección E2E '+MARK,'ocurrido':occurred,'importancia':'IMPORTANTE'}
    ids=[]
    for fid,owner in ((operational,cmd),(sanitary,san_cmd)):
        path=f'/flights/{fid}/log';rows=call(path,token=ops['token'])['entradas'];assert len(rows)==3
        original=next(x for x in rows if x['descripcion'].startswith('Comandante navegador'))
        assert any(x['descripcion'].startswith('Corrección navegador') and x['correccionDe']==original['id'] and x['motivoCorreccion']=='Horario aclarado' for x in rows)
        correction=call(path,'POST',{**body,'correccionDe':original['id'],'motivoCorreccion':'Hora corregida'},owner['token']);ids.append((original['id'],correction['id']))
        history=call(path,token=admin);assert history['puedeRegistrar'] is False and any(x['id']==original['id'] for x in history['entradas']) and correction['correccionDe']==original['id']
        call(path,token=other['token'],expected=(403,));call(path,token=dts['token'],expected=(403,));call(path,'POST',body,admin,(403,));call(path,'POST',{**body,'correccionDe':original['id']},owner['token'],(400,));call(path,'PUT',body,owner['token'],(404,405));call(path,'DELETE',None,owner['token'],(404,405))
        assert sql(f"SET NOCOUNT ON; SELECT CONCAT((SELECT COUNT(*) FROM bitacora_vuelos WHERE id_vuelos={fid} AND origen_acontecimiento=N'MANUAL'),':',(SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos={fid} AND tipo_entidad=N'FLIGHT_LOG')); ")=='4:4'
    call('/flights/999999999/log',token=ops['token'],expected=(404,));call(f'/flights/{sanitary}/log','POST',{**body,'correccionDe':ids[0][0],'motivoCorreccion':'Cruce'},san_cmd['token'],(404,))
    # Incluso SQL directo no puede alterar ni borrar una entrada operativa.
    for statement in (f"UPDATE dbo.bitacora_vuelos SET descripcion_operativa=N'No permitido' WHERE id_bitacora_vuelos={ids[0][0]}",f"DELETE dbo.bitacora_vuelos WHERE id_bitacora_vuelos={ids[0][1]}"):
        try:sql('SET QUOTED_IDENTIFIER ON; '+statement)
        except subprocess.CalledProcessError as exc:
            assert '51001' in (exc.stdout or '')+(exc.stderr or ''), 'El rechazo no provino del control de inmutabilidad'
        else:raise AssertionError('La base permitió alterar una entrada inmutable')
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM bitacora_vuelos WHERE id_bitacora_vuelos={ids[0][0]} AND descripcion_operativa=N'Comandante navegador {operational}';")=='1'
    cancel_when=when+timedelta(days=1)
    cancelled=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Cancelación '+MARK,'aircraftId':planes[2]['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':cancel_when.isoformat(),'llegada':(cancel_when+timedelta(hours=2)).isoformat()},ops['token'])['id']
    reason=next(x for x in call('/catalogs/cancellation-reasons',token=ops['token']) if x['codigo']!='OTRO')
    call(f'/flights/{cancelled}/cancel','POST',{'motivoCancelacionId':reason['id']},ops['token']);call(f'/flights/{cancelled}/cancel','POST',{'motivoCancelacionId':reason['id']},ops['token'],(400,))
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM bitacora_vuelos WHERE id_vuelos={cancelled} AND tipo_acontecimiento=N'CANCELACION' AND origen_acontecimiento=N'AUTOMATICO';")=='1'
    # Una falla SQL controlada de auditoría debe revertir tanto transición como acontecimiento.
    trigger=f'e2e_log_audit_failure_{operational}'
    sql(f"EXEC(N'CREATE TRIGGER dbo.{trigger} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id_vuelos={operational} AND tipo_entidad=N''FLIGHT_LOG'' AND operacion=N''CREATE_AUTO'') THROW 51000, N''Fallo de prueba'', 1; END');")
    try:
        call(f'/flights/{operational}/start','POST',token=ops['token'],expected=(500,))
        assert call(f'/flights/{operational}',token=ops['token'])['vuelo']['estadoVuelo']=='PLANIFICADO'
        assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM bitacora_vuelos WHERE id_vuelos={operational} AND origen_acontecimiento=N'AUTOMATICO';")=='0'
    finally:sql(f'DROP TRIGGER dbo.{trigger};')
    for fid,owner in ((operational,cmd),(sanitary,san_cmd)):
        call(f'/flights/{fid}/start','POST',token=ops['token']);call(f'/flights/{fid}/start','POST',token=ops['token'],expected=(400,))
        call(f'/flights/{fid}/finish','POST',token=ops['token']);call(f'/flights/{fid}/log','POST',{**body,'tipo':'CIERRE','descripcion':'Cierre '+MARK},owner['token'])
        assert sql(f"SET NOCOUNT ON; SELECT CONCAT(SUM(CASE WHEN tipo_acontecimiento=N'INICIO' THEN 1 ELSE 0 END),':',SUM(CASE WHEN tipo_acontecimiento=N'FINALIZACION' THEN 1 ELSE 0 END)) FROM bitacora_vuelos WHERE id_vuelos={fid} AND origen_acontecimiento=N'AUTOMATICO';")=='1:1'
    # Más de una página, con fecha idéntica: el desempate por id permite comprobar el orden.
    for i in range(21):call(f'/flights/{operational}/log','POST',{**body,'descripcion':f'Paginación {MARK} {i:02}'},ops['token'])
    p0=call(f'/flights/{operational}/log?page=0',token=ops['token']);p1=call(f'/flights/{operational}/log?page=1',token=ops['token']);assert len(p0['entradas'])==20 and p0['hayMas'] and not ({x['id'] for x in p0['entradas']}&{x['id'] for x in p1['entradas']})
    times=[(x['ocurrido'],x['id']) for x in p0['entradas']+p1['entradas']];assert times==sorted(times,reverse=True)
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200:break
        except Exception:time.sleep(2)
    else:raise AssertionError('Backend no saludable después del reinicio')
    for fid,pair in zip((operational,sanitary),ids):
        allrows=call(f'/flights/{fid}/log?page=0',token=ops['token'])['entradas']+call(f'/flights/{fid}/log?page=1',token=ops['token'])['entradas'];assert set(pair)<=set(x['id'] for x in allrows)
    print(f'PASS SQL, API, auditoría, permisos, corrección, paginación, rollback y reinicio; marca {MARK}; operativo {operational}, sanitario {sanitary}; original/corrección {ids}',flush=True)
if __name__=='__main__':main()
