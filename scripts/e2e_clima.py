"""Non-destructive E2E against the explicitly named isolated compose project.
Creates uniquely marked test records; never removes records or touches the normal DB.
Requires the E2E backend on 18080, E2E UI on 18081, .env and Docker.
"""
import json, os, secrets, subprocess, sys, time, urllib.error, urllib.request
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:18080/api'
PROJECT = 'vuelos-sanitarios-e2e'
CONTAINER = 'vuelos-sanitarios-e2e-sqlserver-1'
PASSWORD = 'E2E-' + secrets.token_urlsafe(18)
MARK = 'e2e' + secrets.token_hex(4)

def call(path, method='GET', body=None, token=None, expected=(200,)):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    if status not in expected:
        raise AssertionError(f'{method} {path}: HTTP {status}, expected {expected}; response={raw[:500].decode(errors="replace")}')
    return json.loads(raw) if raw and raw[:1] in (b'{', b'[') else None

def sql(query):
    command = ['docker','exec',CONTAINER,'bash','-c',
        'exec /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -d vuelos_sanitarios_e2e -W -h -1 -Q "$1"', '--',query]
    p=subprocess.run(command,check=True,text=True,capture_output=True)
    return p.stdout.strip()

def login(name, password):
    return call('/auth/login','POST',{'username':name,'password':password})

def create_user(admin, role, suffix):
    dni=str(100000000000 + secrets.randbelow(899999999999))
    name=MARK+suffix
    req={'nombre':'E2E','apellido':suffix,'dni':dni,'roles':[role],
         'correos':[{'direccion':name+'@example.test'}],'telefonos':[{'numero':'3815551234'}]}
    if role=='COMANDANTE': req['licenciaAeronautica']=name.upper()
    activation=call('/auth/users','POST',req,admin)
    call('/auth/activar-cuenta','POST',{'dni':dni,'codigo':activation['codigo'],'username':name,
        'password':PASSWORD,'confirmacionPassword':PASSWORD},expected=(204,))
    token=login(name,PASSWORD)['accessToken']
    profile=call('/auth/me',token=token)
    assert profile['username']==name and role in profile['roles']
    return {'name':name,'token':token,'id':profile['id']}

def main():
    info=json.loads(subprocess.run(['docker','inspect',PROJECT+'-backend-1'],check=True,capture_output=True,text=True).stdout)[0]
    environment=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
    bindings=info['NetworkSettings']['Ports'].get('8080/tcp') or []
    assert 'databaseName=vuelos_sanitarios_e2e;' in environment.get('DB_URL','')
    assert environment.get('CORS_ALLOWED_ORIGIN')=='http://127.0.0.1:18081', 'Falta overlay E2E de interfaz'
    assert any(x.get('HostPort')=='18080' for x in bindings), 'Puerto E2E incorrecto'
    assert sql('SET NOCOUNT ON; SELECT DB_NAME();') == 'vuelos_sanitarios_e2e'
    env={}
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1); env[k.strip()]=v.strip().strip('"').strip("'")
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200: break
        except Exception: time.sleep(2)
    else: raise AssertionError('Backend E2E no está saludable')
    admin_login=login(env['BOOTSTRAP_ADMIN_USERNAME'],env['BOOTSTRAP_ADMIN_PASSWORD'])
    admin=admin_login['accessToken']
    assert 'ADMINISTRADOR' in admin_login['roles']
    assert call('/auth/me',token=admin)['activo']
    call('/auth/me', token='invalid.jwt.signature',expected=(401,403))
    print('PASS: login administrador, JWT válido/inválido y /me',flush=True)

    ops=create_user(admin,'CENTRO_OPERACIONES','ops')
    commander=create_user(admin,'COMANDANTE','cmd')
    other=create_user(admin,'COMANDANTE','other')
    dts=create_user(admin,'DTS','dts')
    call('/auth/users',token=ops['token'],expected=(403,))
    print('PASS: alta, activación, acceso por rol y bloqueo de administración',flush=True)

    # Use only a newly created account for deactivate/reactivate tests.
    call('/auth/users/'+str(dts['id'])+'/deactivate','PATCH',{'motivo':'Prueba E2E'},admin)
    call('/auth/me',token=dts['token'],expected=(401,403))
    call('/auth/login','POST',{'username':dts['name'],'password':PASSWORD},expected=(401,))
    result=call('/auth/users/'+str(dts['id'])+'/reactivate','PATCH',
        {'nombre':'E2E','apellido':'dts','roles':['DTS']},admin)
    temp=result['contrasenaTemporal']; temp_login=login(dts['name'],temp)
    assert temp_login['debeCambiarContrasena'] is True
    temp_token=temp_login['accessToken']
    call('/catalogs/provinces',token=temp_token,expected=(403,))
    newpass=PASSWORD+'N'
    call('/auth/me/password','POST',{'passwordActual':temp,'nuevaPassword':newpass,'confirmacionPassword':newpass},temp_token)
    call('/auth/me',token=temp_token,expected=(401,403))
    assert login(dts['name'],newpass)['debeCambiarContrasena'] is False
    print('PASS: baja, JWT invalidado, reactivación y cambio obligatorio de contraseña',flush=True)

    provinces=call('/catalogs/provinces',token=ops['token']); assert provinces
    for province in provinces:
        airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token'])
        if len(airports)>=2: break
    else: raise AssertionError('No hay provincia con dos aeropuertos')
    assert call('/catalogs/priorities',token=ops['token'])
    assert call('/catalogs/cancellation-reasons',token=ops['token'])
    call('/catalogs/commanders/'+str(commander['id'])+'/location','POST',{'locationId':province['id']},ops['token'])
    call('/catalogs/commanders/'+str(other['id'])+'/location','POST',{'locationId':province['id']},ops['token'])
    aircraft=call('/catalogs/aircraft','POST',{'matricula':MARK.upper(),'modelo':'E2E','tipo':'PRUEBA',
        'capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
    assert any(a['id']==aircraft['id'] for a in call('/catalogs/aircraft',token=ops['token']))
    call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+'X','modelo':'E2E','tipo':'PRUEBA',
        'capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},ops['token'],(403,))
    departure=datetime.now().replace(microsecond=0)+timedelta(days=3650)
    request={'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Prueba aislada '+MARK,'aircraftId':aircraft['id'],
        'comandanteId':commander['id'],'destinoId':airports[1]['id'],'salida':departure.isoformat(),'llegada':(departure+timedelta(hours=2)).isoformat()}
    flight=call('/flights/operational','POST',request,ops['token']); fid=flight['id']
    assert flight['estadoVuelo']=='PENDIENTE_CONFIRMACION_COMANDANTE'
    # Test each resource independently rather than conflating two conflicts.
    call('/flights/operational','POST',{**request,'comandanteId':other['id']},ops['token'],(409,))
    aircraft2=call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+'B','modelo':'E2E','tipo':'PRUEBA',
        'capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
    call('/flights/operational','POST',{**request,'aircraftId':aircraft2['id']},ops['token'],(409,))
    call(f'/flights/{fid}/commander-assignment/response','POST',{'aceptar':True},commander['token'])
    assert call(f'/flights/{fid}',token=commander['token'])['vuelo']['estadoVuelo']=='PLANIFICADO'
    call(f'/flights/{fid}/weather',token=other['token'],expected=(403,))
    call(f'/flights/{fid}/weather','POST',{'condiciones':'rechazado','favorable':True},other['token'],(403,))
    call(f'/flights/{fid}/weather','POST',{'condiciones':'','favorable':True},commander['token'],(400,))
    weather=call(f'/flights/{fid}/weather','POST',{'condiciones':'Clima API '+MARK,'favorable':False,'observaciones':'Prueba controlada'},commander['token'])
    assert weather['id'] and weather['fechaRegistro'] and not weather['favorable']
    assert any(w['id']==weather['id'] for w in call(f'/flights/{fid}/weather',token=ops['token']))
    print('PASS: catálogos, aeronave, solapamiento, vuelo planificado, clima y permisos HTTP',flush=True)

    counts=sql(f"SET NOCOUNT ON; SELECT CONCAT((SELECT COUNT(*) FROM instantaneas_clima WHERE id_instantaneas_clima={int(weather['id'])} AND id_vuelos={int(fid)}),':',(SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='WEATHER' AND entidad_id={int(weather['id'])} AND operacion='CREATE')); ")
    assert counts=='1:1',counts
    print(f'PASS: SQL Server vuelo={fid} clima={weather["id"]} auditoría={counts}',flush=True)

    report_rows=call('/final-reports/mine',token=commander['token'])
    print('INFO: tipo de respuesta de informes:',type(report_rows).__name__,flush=True)

    # Browser authenticates through the real UI and adds another actual snapshot.
    node=os.environ.get('E2E_NODE','node')
    proc=subprocess.run([node,str(ROOT/'scripts'/'e2e-weather-ui.cjs')],input=json.dumps({
        'username':commander['name'],'opsUsername':ops['name'],'password':PASSWORD,'flightId':str(fid),'apiConditions':'Clima API '+MARK,
        'uiConditions':'Clima UI '+MARK}),text=True,capture_output=True,env=os.environ.copy())
    if proc.returncode: raise AssertionError('UI E2E failed: '+proc.stderr[-2500:])
    print(proc.stdout.strip(),flush=True)
    rows=call(f'/flights/{fid}/weather',token=commander['token'])
    ui=next(w for w in rows if w['condiciones']=='Clima UI '+MARK)
    assert sql(f"SET NOCOUNT ON; SELECT CONCAT((SELECT COUNT(*) FROM instantaneas_clima WHERE id_instantaneas_clima={int(ui['id'])} AND id_vuelos={int(fid)}),':',(SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad='WEATHER' AND entidad_id={int(ui['id'])} AND operacion='CREATE'));")=='1:1'
    print(f'PASS: UI -> API -> SQL, clima={ui["id"]}, auditoría=1',flush=True)
    call('/auth/users/'+str(other['id'])+'/deactivate','PATCH',{'motivo':'Prueba E2E'},admin)
    call('/flights/operational','POST',{**request,'aircraftId':aircraft2['id'],'comandanteId':other['id']},ops['token'],(400,))
    print('PASS: no se asigna un comandante con cuenta inactiva',flush=True)

    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(90):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200: break
        except Exception: time.sleep(2)
    else: raise AssertionError('Backend E2E no volvió a estar saludable')
    rows=call(f'/flights/{fid}/weather',token=commander['token'])
    assert {weather['id'],ui['id']}.issubset({row['id'] for row in rows})
    print('PASS: ambas instantáneas recuperadas tras reiniciar backend E2E',flush=True)
    call(f'/flights/{fid}/start','POST',token=ops['token'])
    finished=call(f'/flights/{fid}/finish','POST',token=ops['token'])
    assert finished['estadoVuelo']=='FINALIZADO'
    moved=next(a for a in call('/catalogs/aircraft',token=ops['token']) if a['id']==aircraft['id'])
    assert moved['aeropuertoActualId']==airports[1]['id']
    next_flight=call('/flights/operational','POST',{**request,'destinoId':airports[0]['id']},ops['token'])
    assert next_flight['estadoVuelo']=='PENDIENTE_CONFIRMACION_COMANDANTE'
    print('PASS: fin actualiza ubicación y libera aeronave y comandante para nueva asignación',flush=True)
    print(f'EVIDENCIA: marca={MARK} vuelo={fid} aeronave={aircraft["id"]} clima_api={weather["id"]} clima_ui={ui["id"]}',flush=True)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('FAIL:',str(exc),file=sys.stderr,flush=True); sys.exit(1)

