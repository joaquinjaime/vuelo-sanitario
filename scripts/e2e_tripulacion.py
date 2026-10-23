"""Ejercicio aislado de tripulación. No elimina datos preexistentes."""
import concurrent.futures, json, secrets, subprocess, threading, time, urllib.request
from datetime import datetime, timedelta
from e2e_clima import ROOT, PROJECT, MARK, PASSWORD, call as api_call, sql, login, create_user
from e2e_credential_support import provision

def call(path, method='GET', body=None, token=None, expected=None):
    if expected is None:
        expected=(204,) if method in ('POST','PUT','DELETE') and ('/crew' in path or path.startswith('/crew-qualifications/')) else (200,)
    return api_call(path,method,body,token,expected)

def main():
    info=json.loads(subprocess.run(['docker','inspect',PROJECT+'-backend-1'],check=True,capture_output=True,text=True).stdout)[0]
    env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
    assert 'databaseName=vuelos_sanitarios_e2e;' in env.get('DB_URL','')
    assert any(x.get('HostPort')=='18080' for x in info['NetworkSettings']['Ports'].get('8080/tcp',[]))
    assert sql('SET NOCOUNT ON; SELECT DB_NAME();')=='vuelos_sanitarios_e2e'
    config={}
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1); config[k.strip()]=v.strip().strip('"').strip("'")
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200: break
        except Exception: time.sleep(2)
    else: raise AssertionError('Backend E2E no saludable')
    admin=login(config['BOOTSTRAP_ADMIN_USERNAME'],config['BOOTSTRAP_ADMIN_PASSWORD'])['accessToken']
    ops=create_user(admin,'CENTRO_OPERACIONES','ops')
    cmd1=create_user(admin,'COMANDANTE','cmd1'); cmd2=create_user(admin,'COMANDANTE','cmd2')
    member=create_user(admin,'DTS','member'); replacement=create_user(admin,'DTS','replace')
    concurrent=create_user(admin,'DTS','race'); browser_member=create_user(admin,'DTS','browser'); inactive=create_user(admin,'DTS','inactive')
    for user in [cmd1,cmd2]: provision(admin,user,'COMANDANTE')
    for user in [member,replacement,concurrent,browser_member,inactive]: provision(admin,user,'MEDICO')
    call(f'/auth/users/{inactive["id"]}/deactivate','PATCH',{'motivo':'Prueba aislada'},admin)
    pending_dni=str(100000000000+secrets.randbelow(899999999999))
    call('/auth/users','POST',{'nombre':'E2E','apellido':'pendiente','dni':pending_dni,'roles':['DTS'],'correos':[{'direccion':MARK+'pending@example.test'}],'telefonos':[{'numero':'3815551234'}]},admin)
    pending=next(u for u in call('/auth/users',token=admin) if u['dni']==pending_dni)
    call(f'/crew-qualifications/{pending["id"]}/MEDICO','PUT',token=admin)
    call(f'/crew-qualifications/{member["id"]}/ENFERMERO','PUT',token=ops['token'],expected=(403,))
    provinces=call('/catalogs/provinces',token=ops['token'])
    for province in provinces:
        airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token'])
        if len(airports)>=2: break
    for commander in [cmd1,cmd2]: call(f'/catalogs/commanders/{commander["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    when=(datetime.now()+timedelta(days=4000)).replace(hour=23,minute=0,second=0,microsecond=0)
    flights=[]
    for n,commander in enumerate([cmd1,cmd2]):
        aircraft=call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+str(n),'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
        flight=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Tripulación '+MARK,'aircraftId':aircraft['id'],'comandanteId':commander['id'],'destinoId':airports[1]['id'],'salida':when.isoformat(),'llegada':(when+timedelta(hours=2)).isoformat()},ops['token'])
        flights.append(flight['id'])
    f1,f2=flights
    assert member['id'] in [x['userId'] for x in call(f'/flights/{f1}/crew/available?role=MEDICO',token=ops['token'])]
    assert inactive['id'] not in [x['userId'] for x in call(f'/flights/{f1}/crew/available?role=MEDICO',token=ops['token'])]
    assert pending['id'] not in [x['userId'] for x in call(f'/flights/{f1}/crew/available?role=MEDICO',token=ops['token'])]
    call(f'/flights/{f1}/crew','POST',{'userId':inactive['id'],'crewRoleCode':'MEDICO'},ops['token'],(400,))
    call(f'/flights/{f1}/crew','POST',{'userId':pending['id'],'crewRoleCode':'MEDICO'},ops['token'],(400,))
    call(f'/flights/{f1}/crew','POST',{'userId':member['id'],'crewRoleCode':'ENFERMERO'},ops['token'],(400,))
    call(f'/flights/{f1}/crew','POST',{'userId':member['id'],'crewRoleCode':'MEDICO'},cmd1['token'],(403,))
    call(f'/flights/{f1}/crew','POST',{'userId':member['id'],'crewRoleCode':'MEDICO'},ops['token'])
    rows=call(f'/flights/{f1}/crew',token=cmd1['token']); assignment=next(x for x in rows if x['userId']==member['id'])
    assert any(x['userId']==cmd1['id'] and x['comandante'] for x in rows)
    call(f'/flights/{f1}/crew',token=cmd2['token'],expected=(403,))
    call(f'/flights/{f1}/crew','POST',{'userId':member['id'],'crewRoleCode':'MEDICO'},ops['token'],(409,))
    call(f'/flights/{f2}/crew','POST',{'userId':member['id'],'crewRoleCode':'MEDICO'},ops['token'],(409,))
    later=when+timedelta(days=1)
    third=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Cambio horario '+MARK,'aircraftId':aircraft['id'],'comandanteId':cmd2['id'],'destinoId':airports[1]['id'],'salida':later.isoformat(),'llegada':(later+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{third}/crew','POST',{'userId':member['id'],'crewRoleCode':'MEDICO'},ops['token'])
    call(f'/flights/{f1}/commander-assignment/response','POST',{'aceptar':False,'motivo':'Propuesta E2E','salidaPropuesta':later.isoformat(),'llegadaPropuesta':(later+timedelta(hours=2)).isoformat()},cmd1['token'])
    call(f'/flights/{f1}/commander-proposal/response','POST',{'aceptar':True},ops['token'],(409,))
    assert call(f'/flights/{f1}',token=ops['token'])['vuelo']['salida']==when.isoformat()
    reasons=call('/catalogs/cancellation-reasons',token=ops['token']);reason=next(r for r in reasons if r['codigo']!='OTRO')
    call(f'/flights/{third}/cancel','POST',{'motivoCancelacionId':reason['id']},ops['token'])
    call(f'/flights/{third}/crew','POST',{'userId':replacement['id'],'crewRoleCode':'MEDICO'},ops['token'],(400,))
    replan_time=later+timedelta(days=2)
    another=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Replanificación '+MARK,'aircraftId':aircraft['id'],'comandanteId':cmd1['id'],'destinoId':airports[1]['id'],'salida':replan_time.isoformat(),'llegada':(replan_time+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{another}/commander-assignment/response','POST',{'aceptar':False,'motivo':'Replanificación de prueba'},cmd1['token'])
    call(f'/flights/{another}/operational-replanning','POST',{'aircraftId':aircraft['id'],'comandanteId':cmd2['id'],'destinoId':airports[1]['id'],'salida':replan_time.isoformat(),'llegada':(replan_time+timedelta(hours=2)).isoformat()},ops['token'])
    replan_crew=call(f'/flights/{another}/crew',token=ops['token'])
    assert len(replan_crew)==1 and replan_crew[0]['userId']==cmd2['id'] and replan_crew[0]['comandante']
    assert sql(f"SET NOCOUNT ON; SELECT CONCAT((SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos={f1} AND id_usuarios={member['id']}),':',(SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='FLIGHT_CREW' AND entidad_id={assignment['id']} AND operacion='CREATE'));")=='1:1'
    call(f'/flights/{f1}/crew/{assignment["id"]}','PUT',{'userId':replacement['id'],'crewRoleCode':'MEDICO'},ops['token'])
    assert any(x['userId']==replacement['id'] for x in call(f'/flights/{f1}/crew',token=ops['token']))
    call(f'/crew-qualifications/{replacement["id"]}/MEDICO','DELETE',token=admin,expected=(409,))
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='FLIGHT_CREW' AND entidad_id={assignment['id']} AND operacion='UPDATE';")=='1'
    print('PASS: disponibilidad, clasificación, permisos, SQL, duplicación, solapamiento, cambio horario y reemplazo',flush=True)
    barrier=threading.Barrier(2)
    def race(fid):
        barrier.wait(timeout=10)
        try: call(f'/flights/{fid}/crew','POST',{'userId':concurrent['id'],'crewRoleCode':'MEDICO'},ops['token']);return 'ok'
        except AssertionError as e:
            if 'HTTP 409' in str(e): return str(e)
            raise
    with concurrent_futures() as pool: outcomes=list(pool.map(race,[f1,f2]))
    assert outcomes.count('ok')==1,outcomes
    count=sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_usuarios={concurrent['id']} AND id_vuelos IN ({f1},{f2});")
    assert count=='1',count
    print('PASS: concurrencia SQL; una sola asignación confirmada:',outcomes,flush=True)
    proc=subprocess.run([__import__('os').environ.get('E2E_NODE','node'),str(ROOT/'scripts'/'e2e-crew-ui.cjs')],input=json.dumps({'ops':ops['name'],'cmd':cmd1['name'],'password':PASSWORD,'flightId':str(f1),'memberName':'E2E browser','memberId':str(browser_member['id'])}),text=True,capture_output=True)
    if proc.returncode: raise AssertionError('Navegador: '+proc.stderr[-2500:])
    print(proc.stdout.strip(),flush=True)
    call(f'/flights/{f1}/crew/{assignment["id"]}','DELETE',token=ops['token'])
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='FLIGHT_CREW' AND entidad_id={assignment['id']} AND operacion='DELETE';")=='1'
    call(f'/crew-qualifications/{replacement["id"]}/MEDICO','DELETE',token=admin)
    assert call(f'/crew-qualifications/{replacement["id"]}',token=admin)==[]
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200: break
        except Exception: time.sleep(2)
    else: raise AssertionError('Backend E2E no recuperado')
    assert any(x['userId']==browser_member['id'] for x in call(f'/flights/{f1}/crew',token=cmd1['token']))
    print(f'PASS: retiro auditado y persistencia; marca={MARK} vuelos={f1},{f2} asignación={assignment["id"]}',flush=True)

def concurrent_futures(): return concurrent.futures.ThreadPoolExecutor(max_workers=2)

if __name__=='__main__': main()
