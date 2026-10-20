"""Carreras controladas de hangar y ubicación en el SQL Server E2E aislado.

Los triggers de prueba se limitan a las entidades nuevas y mantienen la transacción
activa durante el solapamiento; siempre se retiran al terminar el caso.
"""
import json, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from e2e_clima import ROOT, PROJECT, MARK, call, sql, login, create_user
from e2e_credential_support import provision


def wait_for_gate(resource, future):
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        if future.done():
            future.result()
            raise AssertionError('La primera operación terminó antes de abrir la barrera')
        if sql(f"SET NOCOUNT ON; SELECT APPLOCK_TEST(N'public',N'{resource}',N'Exclusive',N'Session');")=='0':
            return
        time.sleep(.2)
    raise AssertionError('La operación no alcanzó la barrera SQL')


def run_pair(table, predicate, resource, first, second):
    trigger='e2e_hangar_race_'+resource.replace('-','_')
    # El applock permite observar desde otra conexión que la transacción llegó
    # al trigger. El WAITFOR conserva el bloqueo de aeronave mientras se lanza
    # la segunda operación; no interviene en datos de otros vuelos.
    statement=(f"CREATE TRIGGER dbo.{trigger} ON dbo.{table} AFTER {'UPDATE' if table=='aeronaves' else 'INSERT'} AS "
        f"BEGIN SET NOCOUNT ON; IF EXISTS (SELECT 1 FROM inserted WHERE {predicate}) BEGIN "
        f"DECLARE @result int; EXEC @result=sp_getapplock @Resource=N''{resource}'', @LockMode=N''Exclusive'', @LockOwner=N''Transaction'', @LockTimeout=1000; "
        "IF @result < 0 THROW 51000,N''Barrera E2E no disponible'',1; WAITFOR DELAY ''00:00:15''; END END")
    sql(f"EXEC(N'{statement}');")
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first_future=pool.submit(first)
            wait_for_gate(resource,first_future)
            second_future=pool.submit(second)
            time.sleep(2)
            assert not first_future.done() and not second_future.done(), 'Las transacciones no se solaparon como estaba previsto'
            a=first_future.result(timeout=35); b=second_future.result(timeout=35)
            return a,b
    finally:
        sql(f'DROP TRIGGER dbo.{trigger};')


def main():
    info=json.loads(subprocess.run(['docker','inspect',PROJECT+'-backend-1'],check=True,capture_output=True,text=True).stdout)[0]
    env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
    assert 'databaseName=vuelos_sanitarios_e2e;' in env.get('DB_URL','') and sql('SET NOCOUNT ON; SELECT DB_NAME();')=='vuelos_sanitarios_e2e'
    config={}
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);config[k.strip()]=v.strip().strip('"').strip("'")
    admin=login(config['BOOTSTRAP_ADMIN_USERNAME'],config['BOOTSTRAP_ADMIN_PASSWORD'])['accessToken']
    ops=create_user(admin,'CENTRO_OPERACIONES','raceops');cmd=create_user(admin,'COMANDANTE','racecmd');provision(admin,cmd,'COMANDANTE')
    for province in call('/catalogs/provinces',token=ops['token']):
        airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token'])
        if len(airports)>=2:break
    else:raise AssertionError('Faltan aeropuertos de prueba')
    call(f'/catalogs/commanders/{cmd["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    flights=[]
    for i in range(2):
        plane=call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+str(i),'modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
        departure=(datetime.now()+timedelta(days=1100+i)).replace(microsecond=0)
        fid=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Concurrencia hangar '+MARK,'aircraftId':plane['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':departure.isoformat(),'llegada':(departure+timedelta(hours=2)).isoformat()},ops['token'])['id']
        call(f'/flights/{fid}/commander-assignment/response','POST',{'aceptar':True},cmd['token'])
        flights.append((fid,plane['id']))
    body={'version':0,'requiereHangar':True,'preparacionCompleta':True,'observaciones':'Carrera E2E '+MARK}
    fid,plane=flights[0]
    # Movimiento primero: el guardado espera y al reanudar observa la nueva ubicación.
    moved,rejected=run_pair('aeronaves',f'id_aeronaves={plane}',MARK+'a',
        lambda:call(f'/catalogs/aircraft/{plane}/location','POST',{'locationId':airports[1]['id']},ops['token']),
        lambda:call(f'/flights/{fid}/hangar','PUT',body,ops['token'],(409,)))
    assert 'ubicación' in rejected['error'].lower()
    assert call(f'/flights/{fid}/hangar',token=ops['token'])['estado']=='SIN_REGISTRO'
    assert sql(f'SET NOCOUNT ON; SELECT COUNT(*) FROM informacion_hangar WHERE id_vuelos={fid};')=='0'
    fid2,plane2=flights[1]
    # Preparación primero: el movimiento espera; después de su commit, la lectura
    # detecta la discrepancia y no muestra la preparación como vigente completa.
    saved,moved=run_pair('informacion_hangar',f'id_vuelos={fid2}',MARK+'b',
        lambda:call(f'/flights/{fid2}/hangar','PUT',body,ops['token']),
        lambda:call(f'/catalogs/aircraft/{plane2}/location','POST',{'locationId':airports[1]['id']},ops['token']))
    assert saved['estado']=='PREPARACION_COMPLETA'
    view=call(f'/flights/{fid2}/hangar',token=ops['token'])
    assert view['estado']=='REQUIERE_REVISION' and view['versiones'][0]['preparacionCompleta'] is True
    assert sql(f"SET NOCOUNT ON; SELECT CONCAT((SELECT COUNT(*) FROM informacion_hangar WHERE id_vuelos={fid2} AND es_version_actual=1 AND preparacion_completa=1),':',(SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos={fid2} AND tipo_entidad=N'HANGAR_INFO')); ")=='1:1'
    print(f'PASS concurrencia real SQL: movimiento primero -> 409 sin registro; preparación primero -> requiere revisión; vuelos {fid}, {fid2}; marca {MARK}',flush=True)


if __name__=='__main__':main()
