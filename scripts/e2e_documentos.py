"""Flujo documental contra SQL Server E2E aislado; no elimina datos."""
import json, subprocess, time, urllib.request, urllib.error, secrets, os
from datetime import datetime, timedelta
from e2e_clima import ROOT, PROJECT, MARK, PASSWORD, call, sql, login, create_user
from e2e_credential_support import PDF, provision

def upload(path, token, content, name):
    boundary='----E2E'+secrets.token_hex(8)
    fields={'documentTypeCode':'AUTORIZACION','nombreDocumento':'Documento E2E '+MARK} if path.startswith('/flights/') else {}
    chunks=[]
    for key,value in fields.items(): chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()]
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/pdf\r\n\r\n'.encode(),content,f'\r\n--{boundary}--\r\n'.encode()]
    req=urllib.request.Request('http://127.0.0.1:18080/api'+path,data=b''.join(chunks),method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':'multipart/form-data; boundary='+boundary})
    try:
        with urllib.request.urlopen(req,timeout=30) as response: return response.status,json.load(response)
    except urllib.error.HTTPError as exc:return exc.code,exc.read()

def main():
    env={}
    for line in (ROOT/'.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);env[k.strip()]=v.strip().strip('"').strip("'")
    admin=login(env['BOOTSTRAP_ADMIN_USERNAME'],env['BOOTSTRAP_ADMIN_PASSWORD'])['accessToken']
    ops=create_user(admin,'CENTRO_OPERACIONES','docops'); cmd=create_user(admin,'COMANDANTE','doccmd'); other=create_user(admin,'COMANDANTE','docother'); dts=create_user(admin,'DTS','docdts')
    provision(admin,cmd,'COMANDANTE')
    province=next(p for p in call('/catalogs/provinces',token=ops['token']) if len(call('/catalogs/airports?provinceId='+str(p['id']),token=ops['token']))>=2)
    airports=call('/catalogs/airports?provinceId='+str(province['id']),token=ops['token'])
    call(f'/catalogs/commanders/{cmd["id"]}/location','POST',{'locationId':province['id']},ops['token'])
    aircraft=call('/catalogs/aircraft','POST',{'matricula':MARK.upper()+'DOC','modelo':'E2E','tipo':'PRUEBA','capacidadPacientes':1,'capacidadTripulacion':4,'aeropuertoActualId':airports[0]['id'],'activo':True},admin)
    when=(datetime.now()+timedelta(days=5500)).replace(microsecond=0)
    flight=call('/flights/operational','POST',{'tipoVueloCode':'REGRESO_BASE','motivoVuelo':'Documentos '+MARK,'aircraftId':aircraft['id'],'comandanteId':cmd['id'],'destinoId':airports[1]['id'],'salida':when.isoformat(),'llegada':(when+timedelta(hours=2)).isoformat()},ops['token'])['id']
    call(f'/flights/{flight}/commander-assignment/response','POST',{'aceptar':True},cmd['token'])
    types=call('/catalogs/document-types',token=ops['token']); assert any(x['codigo']=='AUTORIZACION' for x in types)
    status,doc=upload(f'/flights/{flight}/documents/pdf',ops['token'],PDF,'v1.pdf');assert status==200,doc
    assert call(f'/flights/{flight}/documents',token=cmd['token'])[0]['id']==doc['id']
    call(f'/flights/{flight}/documents',token=other['token'],expected=(403,)); call(f'/documents/{doc["id"]}/lock','POST',token=dts['token'],expected=(403,))
    lock=call(f'/documents/{doc["id"]}/lock','POST',token=ops['token']); assert lock['mine'] and lock['active']
    status,v2=upload(f'/documents/{doc["id"]}/versions/pdf',ops['token'],PDF+b'\n% v2','v2.pdf');assert status==200,v2
    call(f'/documents/{doc["id"]}/versions',token=dts['token'],expected=(403,)); history=call(f'/documents/{doc["id"]}/versions',token=cmd['token']);assert len(history['versiones'])==2 and history['versiones'][0]['numeroVersion']==2
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM versiones_documento_vuelo WHERE id_documentos_vuelo={doc['id']};")=='2'
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM versiones_documento_vuelo WHERE id_documentos_vuelo={doc['id']} AND es_version_actual=1;")=='1'
    assert sql(f"SET NOCOUNT ON; SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos={flight} AND tipo_entidad IN (N'DOCUMENT',N'DOCUMENT_LOCK');")=='3'
    ui=subprocess.run(['node',str(ROOT/'scripts'/'e2e-documentos-ui.cjs')],input=json.dumps({'ops':ops['name'],'password':PASSWORD,'flightId':str(flight)}),text=True,capture_output=True,env={**os.environ,'NODE_PATH':str(ROOT/'frontend-react'/'node_modules')})
    if ui.returncode: raise AssertionError('Navegador documentos: '+ui.stderr[-2000:])
    print(ui.stdout.strip(),flush=True)
    call(f'/documents/{doc["id"]}/lock','DELETE',token=ops['token'],expected=(404,))
    subprocess.run(['docker','restart',PROJECT+'-backend-1'],check=True,capture_output=True)
    for _ in range(60):
        try:
            if urllib.request.urlopen('http://127.0.0.1:18080/actuator/health',timeout=2).status==200:break
        except Exception:time.sleep(2)
    else:raise AssertionError('Backend E2E no saludable tras reinicio')
    assert call(f'/documents/{doc["id"]}/versions',token=cmd['token'])['versiones'][0]['nombreArchivoOriginal']=='v2.pdf'
    print('PASS documentos SQL, API, permisos, auditoría, versiones y reinicio; vuelo',flight,'documento',doc['id'],'marca',MARK,flush=True)
if __name__=='__main__':main()
