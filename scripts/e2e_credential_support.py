"""Ayudas para credenciales de prueba sobre el backend E2E aislado."""
import json, secrets, urllib.request, urllib.error
from e2e_clima import BASE, call

def sample_pdf():
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>',b'<< /Length 0 >>\nstream\n\nendstream']
    result=b'%PDF-1.4\n';offsets=[]
    for index, obj in enumerate(objects,1):
        offsets.append(len(result));result+=str(index).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    xref=len(result);result+=b'xref\n0 5\n0000000000 65535 f \n'+b''.join(f'{offset:010} 00000 n \n'.encode() for offset in offsets)
    return result+b'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF\n'

PDF=sample_pdf()

def upload(credential_id, token, content=PDF):
    boundary='----E2E'+secrets.token_hex(8)
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="credencial.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
    req=urllib.request.Request(BASE+f'/professional-credentials/{credential_id}/documents',data=body,method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':f'multipart/form-data; boundary={boundary}'})
    with urllib.request.urlopen(req,timeout=30) as response: return json.load(response)

def provision(admin,user,role,expires=None):
    call(f'/crew-qualifications/{user["id"]}/{role}','PUT',token=admin,expected=(204,))
    data={'roleCode':role,'type':'Documento de prueba','number':'E2E-'+str(user['id']),'issuer':'Organismo de prueba','expires':expires,'noExpiry':expires is None,'notes':'Documento creado para pruebas aisladas'}
    credential=call(f'/users/{user["id"]}/professional-credentials','POST',data,admin)
    upload(credential['id'],admin)
    return call(f'/professional-credentials/{credential["id"]}/decision/VERIFICADA','POST',{'notes':'Revisión manual de datos de prueba','confirmsSufficiency':True},admin)
