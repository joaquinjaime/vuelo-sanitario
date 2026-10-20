"""Validación no destructiva de habilitaciones sobre el proyecto y base E2E aislados."""
import base64, json, os, subprocess, time, urllib.request, urllib.error
from datetime import datetime, timedelta
from e2e_clima import ROOT, BASE, PROJECT, MARK, PASSWORD, call, sql, login, create_user
from e2e_credential_support import provision, upload, PDF

def get_file(document,token,expected=200):
    req=urllib.request.Request(BASE+f'/professional-credential-documents/{document}',headers={'Authorization':'Bearer '+token} if token else {})
    try:
        with urllib.request.urlopen(req,timeout=30) as response: status,data=response.status,response.read()
    except urllib.error.HTTPError as e: status,data=e.code,e.read()
    assert status==expected,(status,expected)
    return data

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
    ops=create_user(admin,'CENTRO_OPERACIONES','ops'); cmd=create_user(admin,'COMANDANTE','cmd'); member=create_user(admin,'DTS','professional'); pending=create_user(admin,'DTS','pendingcred')
    unreviewed=call(f'/users/{pending["id"]}/professional-credentials','POST',{'roleCode':'MEDICO','type':'Matrícula de prueba','number':'P-'+MARK,'issuer':'Prueba'},admin)
    try: upload(unreviewed['id'],admin,b'%PDF-1.4\ncontenido no PDF');raise AssertionError('Se aceptó un archivo inválido')
    except urllib.error.HTTPError as error: assert error.code==400
    assert not call(f'/users/{pending["id"]}/professional-credentials',token=admin)[0]['documents']
    call(f'/professional-credentials/{unreviewed["id"]}/decision/VERIFICADA','POST',{'notes':'Sin archivo','confirmsSufficiency':True},admin,expected=(400,))
    call(f'/professional-credentials/{unreviewed["id"]}/decision/VERIFICADA','POST',{'notes':'Sin confirmación'},admin,expected=(400,))
    upload(unreviewed['id'],admin)
    call(f'/professional-credentials/{unreviewed["id"]}/decision/VERIFICADA','POST',{'notes':'Vencimiento no informado','confirmsSufficiency':True},admin,expected=(400,))
    provinces=call('/catalogs/provinces',token=ops['token'])
    for province in provinces:
        airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token'])
        if len(airports)>=2: break
    call(f'/catalogs/commanders/{cmd["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    aircraft=call('/catalogs/aircraft','POST',{'matricula':MARK.upper(),'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
    when=(datetime.now()+timedelta(days=4000)).replace(hour=12,minute=0,second=0,microsecond=0)
    def make_flight(date,expected=(200,)):
        result=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Habilitaciones '+MARK,'aircraftId':aircraft['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':date.isoformat(),'llegada':(date+timedelta(hours=2)).isoformat()},ops['token'],expected=expected)
        return result['id'] if expected==(200,) else result
    call(f'/crew-qualifications/{cmd["id"]}/COMANDANTE','PUT',token=admin,expected=(204,))
    make_flight(when,(400,))
    provision(admin,cmd,'COMANDANTE')
    flight=make_flight(when);flight2=make_flight(when+timedelta(days=1))
    assignment={'userId':member['id'],'crewRoleCode':'MEDICO'}
    call(f'/flights/{flight}/crew','POST',assignment,ops['token'],expected=(400,))
    assert member['id'] not in [x['userId'] for x in call(f'/flights/{flight}/crew/available?role=MEDICO',token=ops['token'])]
    proc=subprocess.run([os.environ.get('E2E_NODE','node'),str(ROOT/'scripts/e2e-credential-ui.cjs')],input=json.dumps({'admin':config['BOOTSTRAP_ADMIN_USERNAME'],'password':config['BOOTSTRAP_ADMIN_PASSWORD'],'userId':str(member['id']),'flightId':str(flight),'opsToken':ops['token'],'pdf':base64.b64encode(PDF).decode()}),text=True,capture_output=True)
    if proc.returncode: raise AssertionError('Navegador: '+proc.stderr[-2500:])
    print(proc.stdout.strip(),flush=True)
    creds=call(f'/users/{member["id"]}/professional-credentials',token=admin);assert len(creds)==1
    cred=creds[0];assert cred['status']=='VERIFICADA' and cred['current'];doc=cred['documents'][0]['id']
    assert get_file(doc,admin)==PDF
    get_file(doc,ops['token'],403);get_file(doc,'',403)
    call(f'/users/{member["id"]}/professional-credentials',token=ops['token'],expected=(403,))
    assert sql(f"SET NOCOUNT ON; SELECT CONCAT((SELECT COUNT(*) FROM habilitaciones_profesionales h JOIN usuarios u ON u.id_personas=h.id_personas WHERE h.id_habilitaciones_profesionales={cred['id']} AND u.id_usuarios={member['id']} AND h.estado_verificacion='VERIFICADA'),':',(SELECT COUNT(*) FROM documentos_habilitacion WHERE id_habilitaciones_profesionales={cred['id']}));")=='1:1'
    call(f'/flights/{flight}/crew','POST',assignment,ops['token'],expected=(204,))
    call(f'/crew-qualifications/{member["id"]}/ENFERMERO','PUT',token=admin,expected=(204,))
    call(f'/flights/{flight2}/crew','POST',{'userId':member['id'],'crewRoleCode':'ENFERMERO'},ops['token'],expected=(400,))
    call(f'/professional-credentials/{cred["id"]}/decision/REVOCADA','POST',{'notes':'Revocación de prueba'},admin)
    call(f'/flights/{flight2}/crew','POST',assignment,ops['token'],expected=(400,))
    update={'roleCode':'MEDICO','type':'Matrícula de prueba','number':cred['number'],'issuer':cred['issuer'],'expires':'2020-01-01','notes':'Credencial vencida de prueba'}
    updated=call(f'/professional-credentials/{cred["id"]}','PUT',update,admin);assert updated['status']=='PENDIENTE'
    updated=call(f'/professional-credentials/{cred["id"]}/decision/VERIFICADA','POST',{'notes':'Revisión de vencimiento de prueba','confirmsSufficiency':True},admin);assert not updated['current']
    call(f'/flights/{flight2}/crew','POST',assignment,ops['token'],expected=(400,))
    call(f'/professional-credentials/{cred["id"]}/decision/RECHAZADA','POST',{'notes':'Rechazo de prueba'},admin)
    history=call(f'/professional-credentials/{cred["id"]}/history',token=admin)
    assert {'CREATE','UPLOAD_DOCUMENT','VERIFICADA','REVOCADA','UPDATE','RECHAZADA'}.issubset({h['operation'] for h in history})
    assert int(sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='PROFESSIONAL_CREDENTIAL' AND entidad_id={cred['id']};"))>=6
    print('PASS: acreditación requerida, vigencia, revocación, permisos y auditoría SQL',flush=True)
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200: break
        except Exception: time.sleep(2)
    else: raise AssertionError('Backend E2E no recuperado')
    assert get_file(doc,admin)==PDF
    assert call(f'/users/{member["id"]}/professional-credentials',token=admin)[0]['status']=='RECHAZADA'
    print(f'PASS: documento y estado persistentes tras reinicio; marca={MARK} vuelo={flight} persona={cred["personId"]} habilitación={cred["id"]} documento={doc}',flush=True)

if __name__=='__main__': main()
