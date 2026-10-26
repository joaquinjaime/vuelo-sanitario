/* Chrome real: cada área de trabajo gestiona los contactos de su propia persona desde "Mi cuenta". Sólo la base E2E. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {ROOT,MARK,PASSWORD,sleep,one,count,ok,call,createUser,waitHealthy,mailboxCode}=require('./e2e-cierre-support.cjs');

(async()=>{
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'))>=49);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){if(line.includes('=')&&!line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const dts=await createUser(admin,'DTS','uicontacto'),cmd=await createUser(admin,'COMANDANTE','uicontactocmd'),ops=await createUser(admin,'CENTRO_OPERACIONES','uicontactoops');
 const person=(userId)=>Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${userId}`));
 const identity=(userId)=>one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT u.hash_contrasena,u.estado_cuenta,u.version_credenciales,p.dni,p.nombre_persona,p.version_identidad FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${userId} FOR JSON PATH)),2)`);
 const before={dts:identity(dts.id),cmd:identity(cmd.id),ops:identity(ops.id)};
 const url=process.env.E2E_UI_URL||'http://127.0.0.1:18081/';
 const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const login=async(user)=>{
  const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('dialog',dialog=>dialog.accept());
  await page.goto(url);
  await page.getByLabel('Usuario',{exact:true}).fill(user.name);
  await page.getByLabel('Contraseña',{exact:true}).fill(PASSWORD);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login'));
  await page.getByRole('button',{name:'Iniciar sesión'}).click();assert.equal((await response).status(),200);
  return page;
 };
 const rowOf=(page,text)=>page.locator('li.contact',{hasText:text});
 try{
  // ---- DTS: agregar, validar, editar, principal, quitar, recargar ----
  const page=await login(dts);
  await page.getByRole('heading',{name:'Nueva solicitud DTS'}).waitFor();
  await page.getByText('Mi cuenta',{exact:true}).click();
  await page.getByRole('heading',{name:'Mis datos de contacto'}).waitFor();
  await page.getByText(/pertenecen a su persona/).waitFor();
  assert.equal(await page.getByText('Vuelos visibles').count(),0,'Mi cuenta reemplaza el panel operativo');
  const mailForm=page.getByRole('form',{name:'Agregar correo electrónico'}),phoneForm=page.getByRole('form',{name:'Agregar teléfono'});
  // formato inválido: se avisa en pantalla y no se envía nada
  const writesBefore=count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad IN (N'PERSON_EMAIL',N'PERSON_PHONE')`);
  await phoneForm.getByLabel('Nuevo teléfono',{exact:true}).fill('12345');await phoneForm.getByRole('button',{name:'Agregar'}).click();
  await page.getByRole('alert').filter({hasText:/muy pocos dígitos|incompleto/}).waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad IN (N'PERSON_EMAIL',N'PERSON_PHONE')`),writesBefore);
  // alta de un correo laboral
  const second=`ui.laboral.${MARK}@example.test`;
  await mailForm.getByLabel('Nuevo correo electrónico',{exact:true}).fill(second);await mailForm.getByLabel('Tipo del nuevo correo electrónico',{exact:true}).selectOption('LABORAL');
  const add=page.waitForResponse(r=>r.url().endsWith('/api/auth/me/correos')&&r.request().method()==='POST');await mailForm.getByRole('button',{name:'Agregar'}).click();assert.equal((await add).status(),200);
  await page.getByText('✓ Contacto agregado').waitFor();await rowOf(page,second).waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${person(dts.id)} AND direccion=N'${second}' AND tipo_correo_electronico=N'LABORAL' AND es_principal=0 AND fecha_baja IS NULL`),1);
  // duplicado (otra grafía): el servidor responde 409 y la interfaz lo explica
  await mailForm.getByLabel('Nuevo correo electrónico',{exact:true}).fill(second.toUpperCase());
  const dupResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/me/correos')&&r.request().method()==='POST');await mailForm.getByRole('button',{name:'Agregar'}).click();assert.equal((await dupResponse).status(),409);
  await page.getByRole('alert').filter({hasText:'Ya tiene registrado'}).waitFor();
  // edición con la versión leída
  await rowOf(page,second).getByRole('button',{name:'Editar'}).click();
  const corrected=`ui.corregido.${MARK}@example.test`;
  await page.getByLabel('Nuevo valor del correo electrónico',{exact:true}).fill(corrected);
  const put=page.waitForResponse(r=>/\/api\/auth\/me\/correos\/\d+$/.test(r.url())&&r.request().method()==='PUT');await page.getByRole('button',{name:'Guardar'}).click();assert.equal((await put).status(),200);
  await rowOf(page,corrected).waitFor();assert.equal(count(`SELECT version_contacto FROM correos_electronicos WHERE id_personas=${person(dts.id)} AND direccion=N'${corrected}'`),1);
  // un correo sin verificar no puede ser principal: se confirma con el código recibido en la bandeja de pruebas
  assert.equal(await rowOf(page,corrected).getByRole('button',{name:'Hacer principal'}).count(),0);
  await sleep(2300);await rowOf(page,corrected).getByRole('button',{name:'Enviar código'}).click();await page.getByText(`Enviamos un código a ${corrected}`).waitFor();
  const verification=await mailboxCode(corrected);await page.getByLabel(`Código de verificación de ${corrected}`).fill(verification.code);
  await rowOf(page,corrected).getByRole('button',{name:'Confirmar código'}).click();await rowOf(page,corrected).getByText('Verificado',{exact:true}).waitFor();
  // hacer principal y quitar el anterior principal
  await rowOf(page,corrected).getByRole('button',{name:'Hacer principal'}).click();
  await rowOf(page,corrected).getByText('Principal',{exact:true}).waitFor();
  assert.equal(count(`SELECT es_principal FROM correos_electronicos WHERE direccion=N'${corrected}'`),1);
  const original=`${dts.name}@example.test`;
  await rowOf(page,original).getByRole('button',{name:'Quitar'}).click();
  await page.getByText('✓ Contacto retirado').waitFor();
  await rowOf(page,original).waitFor({state:'detached'});
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${person(dts.id)} AND direccion=N'${original}' AND fecha_baja IS NOT NULL AND motivo_baja=N'RETIRO' AND id_usuario_baja=${dts.id} AND es_principal=0`),1,'baja lógica, no borrado');
  assert.equal(await rowOf(page,corrected).getByRole('button',{name:'Quitar'}).count(),0,'el único correo no puede quitarse');
  // recarga: la página y los datos persisten
  await page.reload();await page.getByRole('heading',{name:'Mis datos de contacto'}).waitFor();await rowOf(page,corrected).waitFor();
  assert.equal(await rowOf(page,original).count(),0);

  // ---- edición simultánea desde otra sesión: la versión vencida se rechaza y se muestra el estado vigente (sobre un teléfono: la dirección de un correo verificado no se edita) ----
  const other=await login(dts);await other.getByText('Mi cuenta',{exact:true}).click();await other.getByRole('heading',{name:'Mis datos de contacto'}).waitFor();
  const basePhone='+54 381 555-1234';
  await rowOf(page,basePhone).getByRole('button',{name:'Editar'}).click();
  await rowOf(other,basePhone).getByRole('button',{name:'Editar'}).click();
  const winner='+54 381 555-0111',loser='+543815550222';
  await other.getByLabel('Nuevo valor del teléfono',{exact:true}).fill('381 555-0111');await other.getByRole('button',{name:'Guardar'}).click();await rowOf(other,winner).waitFor();
  await page.getByLabel('Nuevo valor del teléfono',{exact:true}).fill('381 555-0222');
  const stale=page.waitForResponse(r=>/\/api\/auth\/me\/telefonos\/\d+$/.test(r.url())&&r.request().method()==='PUT');await page.getByRole('button',{name:'Guardar'}).click();assert.equal((await stale).status(),409);
  await page.getByRole('alert').filter({hasText:'modificado por otra operación'}).waitFor();await rowOf(page,winner).waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE numero_normalizado=N'${loser}' AND id_personas=${person(dts.id)}`),0);
  await other.close();

  // ---- DTS: teléfono con separadores ----
  await phoneForm.getByLabel('Nuevo teléfono',{exact:true}).fill('+54 (381) 555-0123');await phoneForm.getByRole('button',{name:'Agregar'}).click();await rowOf(page,'+54 381 555-0123').waitFor();
  assert.equal(one(`SELECT numero_normalizado FROM telefonos WHERE id_personas=${person(dts.id)} AND numero=N'+54 381 555-0123'`),'+543815550123');

  // ---- Comandante y Centro de Operaciones: la misma funcionalidad en su área ----
  for(const [user,label] of [[cmd,'Comandante'],[ops,'Centro de Operaciones']]){
   const p=await login(user);
   await p.getByText('Mi cuenta',{exact:true}).click();await p.getByRole('heading',{name:'Mis datos de contacto'}).waitFor();
   const number='3814440'+(label==='Comandante'?'001':'002'),shown='+54 381 444-0'+(label==='Comandante'?'001':'002');
   const form=p.getByRole('form',{name:'Agregar teléfono'});await form.getByLabel('Nuevo teléfono',{exact:true}).fill(number);await form.getByRole('button',{name:'Agregar'}).click();await rowOf(p,shown).waitFor();
   assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${person(user.id)} AND numero=N'${shown}' AND fecha_baja IS NULL`),1,label);
   await p.getByText(label,{exact:true}).first().click();await p.getByText('Vuelos visibles').waitFor();   // volver al panel
   await p.close();
  }

  // ---- Administrador: Mi cuenta usa el mismo componente; en el detalle de otra cuenta sólo consulta ----
  const adminName=dotenv.BOOTSTRAP_ADMIN_USERNAME;
  const ap=await browser.newPage();ap.setDefaultTimeout(30000);ap.on('dialog',d=>d.accept());await ap.goto(url);
  await ap.getByLabel('Usuario',{exact:true}).fill(adminName);await ap.getByLabel('Contraseña',{exact:true}).fill(dotenv.BOOTSTRAP_ADMIN_PASSWORD);
  await ap.getByRole('button',{name:'Iniciar sesión'}).click();
  await ap.getByText('Mi cuenta',{exact:true}).click();await ap.getByRole('heading',{name:'Mis datos de contacto'}).waitFor();
  await ap.getByRole('heading',{name:'Seguridad de la cuenta'}).waitFor();
  const adminMail=`ui.admin.${MARK}@example.test`;const af=ap.getByRole('form',{name:'Agregar correo electrónico'});await af.getByLabel('Nuevo correo electrónico',{exact:true}).fill(adminMail);await af.getByRole('button',{name:'Agregar'}).click();await rowOf(ap,adminMail).waitFor();
  await ap.getByText('Usuarios',{exact:true}).click();
  await ap.getByLabel('Buscar usuarios').fill(dts.name);
  await ap.getByRole('row',{name:new RegExp('\\b'+dts.name+'\\b')}).getByRole('button',{name:'Detalle'}).click();
  const detail=ap.getByRole('region',{name:/Detalle de/});
  await detail.getByText(winner).waitFor();   // el administrador consulta el contacto vigente de la cuenta
  assert.equal(await detail.getByText(original).count(),0,'el contacto retirado no figura como vigente');
  assert.equal(await detail.getByRole('button',{name:/contacto|correo|teléfono/i}).count(),0,'sin acciones sobre contactos ajenos');
  await detail.getByText(/Los datos de contacto los mantiene cada usuario/).waitFor();
  await ap.close();

  // ---- Preservación ----
  assert.equal(identity(dts.id),before.dts);assert.equal(identity(cmd.id),before.cmd);assert.equal(identity(ops.id),before.ops);
  await ok('/auth/me',{token:dts.token});   // la sesión anterior sigue vigente
  console.log('PASS: Chrome gestiona contactos desde Mi cuenta en DTS, Comandante, Centro de Operaciones y Administración; validación, duplicado, edición con versión, conflicto entre sesiones, principal, baja lógica, recarga y preservación de credenciales');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
