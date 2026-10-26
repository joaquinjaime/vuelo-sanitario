/* Chrome real: contactos de coordinación en la solicitud DTS y en el detalle de Operaciones. Sólo la base E2E. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {ROOT,MARK,PASSWORD,one,count,ok,call,createUser,waitHealthy}=require('./e2e-cierre-support.cjs');

(async()=>{
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'))>=51);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){if(line.includes('=')&&!line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const dts=await createUser(admin,'DTS','uisolcont'),ops=await createUser(admin,'CENTRO_OPERACIONES','uisolcontops'),cmd=await createUser(admin,'COMANDANTE','uisolcontcmd');
 let province,localities;for(const p of await ok('/catalogs/provinces',{token:dts.token})){const l=await ok(`/catalogs/localities?provinceId=${p.id}`,{token:dts.token});if(l.length>=2){province=p;localities=l;break;}}
 const rnd=()=>String(70000000+Math.floor(Math.random()*20000000));
 const dniExisting=rnd(),dniNew=rnd();
 const existing=await ok('/patients',{method:'POST',token:dts.token,body:{nombre:'Selecta',apellido:'UI'+MARK,dni:dniExisting}});
 const identity=(userId)=>one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT u.hash_contrasena,u.estado_cuenta,u.version_credenciales,p.dni,p.version_identidad FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${userId} FOR JSON PATH)),2)`);
 const before=[identity(dts.id),identity(ops.id),identity(cmd.id)];
 const phonesBefore=count('SELECT COUNT(*) FROM telefonos');
 const url=process.env.E2E_UI_URL||'http://127.0.0.1:18081/';
 const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const login=async(user)=>{const page=await browser.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());await page.goto(url);await page.getByLabel('Usuario',{exact:true}).fill(user.name);await page.getByLabel('Contraseña',{exact:true}).fill(PASSWORD);const r=page.waitForResponse(x=>x.url().endsWith('/api/auth/login'));await page.getByRole('button',{name:'Iniciar sesión'}).click();assert.equal((await r).status(),200);return page;};
 const flightByMotive=(motive)=>Number(one(`SELECT TOP 1 id_vuelos FROM vuelos WHERE motivo_vuelo=N'${motive}' ORDER BY id_vuelos DESC`));
 const contactRows=(flight)=>count(`SELECT COUNT(*) FROM contactos_coordinacion_traslado WHERE id_vuelos=${flight} AND fecha_baja IS NULL`);
 try{
  const page=await login(dts);await page.getByRole('heading',{name:'Nueva solicitud DTS'}).waitFor();
  const form=page.locator('form').first();
  const pickLocalities=async()=>{for(const [kind,locality] of [['origen',localities[0]],['destino',localities[1]]]){
   await page.getByLabel(`Provincia ${kind}`).selectOption(String(province.id));await page.getByLabel(`Buscar localidad ${kind}`).fill(locality.nombre.slice(0,5));await page.getByLabel(`Buscar localidad ${kind}`).focus();
   await page.getByRole('option',{name:new RegExp(locality.nombre.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();}};
  const day=new Date(Date.now()+9*86400000-3*3600000).toISOString().slice(0,10);
  const fillCommon=async(motive)=>{await pickLocalities();await form.getByLabel('Fecha y hora solicitada').fill(day+'T12:00');await form.getByLabel('Diagnóstico').fill('Control');await form.getByLabel('Condición').fill('ESTABLE');await form.locator('textarea').last().fill(motive);};
  const addContact=async(index,relation,name,phone,notes)=>{
   await form.getByRole('button',{name:'Agregar contacto de coordinación'}).click();
   const block=form.locator('.transfer-contact-block').nth(index);
   await block.getByLabel('Relación con el paciente').selectOption(relation);
   if(name)await block.getByLabel(/^Nombre/).fill(name);
   await block.locator('input[type=tel]').fill(phone);
   if(notes)await block.getByLabel(/^Indicaciones/).fill(notes);
  };

  // ---- 1. Paciente existente elegido por búsqueda + dos contactos ----
  const motiveA='UI contactos A '+MARK;
  await form.locator('label',{hasText:/^Paciente/}).locator('select').first().selectOption('search');
  await form.getByLabel('DNI exacto').fill(dniExisting);await form.getByRole('button',{name:'Buscar paciente'}).click();
  await form.locator('.patient-results li').filter({hasText:`DNI ••••${dniExisting.slice(-4)}`}).getByRole('button',{name:'Seleccionar'}).click();
  await fillCommon(motiveA);
  await addContact(0,'FAMILIAR_RESPONSABLE','Hija de la paciente','12','');   // teléfono inválido: se avisa y no se envía
  await form.getByRole('button',{name:'Crear solicitud'}).click();
  await page.getByText(/muy pocos dígitos|incompleto/).first().waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE motivo_vuelo=N'${motiveA}'`),0,'nada se envió con un teléfono inválido');
  await form.locator('.transfer-contact-block').nth(0).locator('input[type=tel]').fill('+54 381 555-2001');
  await addContact(1,'ESTABLECIMIENTO_ORIGEN','Hospital Origen UI','3814442002','Guardia, interno 12');
  const create=page.waitForResponse(r=>r.url().endsWith('/api/flights')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Crear solicitud'}).click();assert.equal((await create).status(),200);
  await page.getByText('✓ Solicitud registrada').waitFor();
  const fA=flightByMotive(motiveA);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${fA} AND id_pacientes=${existing.id}`),1);
  assert.equal(contactRows(fA),2);
  assert.equal(count(`SELECT COUNT(*) FROM contactos_coordinacion_traslado WHERE id_vuelos=${fA} AND relacion_contacto=N'FAMILIAR_RESPONSABLE' AND nombre_contacto=N'Hija de la paciente' AND telefono_normalizado=N'+543815552001' AND es_principal=1 AND id_usuario_alta=${dts.id}`),1);
  assert.equal(count(`SELECT COUNT(*) FROM contactos_coordinacion_traslado WHERE id_vuelos=${fA} AND relacion_contacto=N'ESTABLECIMIENTO_ORIGEN' AND observaciones_contacto=N'Guardia, interno 12' AND es_principal=0`),1);
  assert.equal(await form.locator('.transfer-contact-block').count(),0,'el formulario se reinició');

  // ---- 2. Paciente nuevo, contacto del propio paciente sin nombre ----
  const motiveB='UI contactos B '+MARK;
  await form.locator('label',{hasText:/^Paciente/}).locator('select').first().selectOption('new');
  await form.getByLabel('Nombre',{exact:true}).fill('Nuevo');await form.getByLabel('Apellido',{exact:true}).fill('Paciente'+MARK);await form.getByLabel('DNI',{exact:true}).fill(dniNew);await form.getByLabel(/Confirmo que cotejé/).check();
  await fillCommon(motiveB);await addContact(0,'PACIENTE','','3815553003','');
  const createB=page.waitForResponse(r=>r.url().endsWith('/api/flights/with-patient')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Crear solicitud'}).click();assert.equal((await createB).status(),200);
  await page.getByText('✓ Solicitud registrada').first().waitFor();
  const fB=flightByMotive(motiveB);
  assert.equal(count(`SELECT COUNT(*) FROM contactos_coordinacion_traslado c JOIN vuelos_sanitarios s ON s.id_vuelos=c.id_vuelos JOIN pacientes p ON p.id_pacientes=s.id_pacientes JOIN personas x ON x.id_personas=p.id_personas WHERE c.id_vuelos=${fB} AND x.dni='${dniNew}' AND c.relacion_contacto=N'PACIENTE' AND c.nombre_contacto IS NULL`),1);
  assert.equal(count(`SELECT COUNT(*) FROM telefonos t JOIN personas p ON p.id_personas=t.id_personas WHERE p.dni='${dniNew}'`),0,'no se creó un contacto personal para la persona nueva');
  assert.equal(count('SELECT COUNT(*) FROM telefonos'),phonesBefore,'la tabla de contactos personales no cambió');

  // ---- 3. El solicitante mantiene los contactos desde su solicitud ----
  const mine=page.getByRole('heading',{name:'Mis solicitudes y contrapropuestas'}).locator('..');
  await mine.getByLabel('Solicitud').selectOption(String(fA));
  const section=mine.getByLabel('Contactos de coordinación del traslado');await section.getByText('+54 381 444-2002').waitFor();
  await section.locator('li',{hasText:'+54 381 444-2002'}).getByRole('button',{name:'Editar'}).click();
  const edit=section.getByRole('form',{name:'Editar contacto de coordinación'});
  await edit.locator('input[type=tel]').fill('3814442999');
  const put=page.waitForResponse(r=>/transfer-contacts\/\d+$/.test(r.url())&&r.request().method()==='PUT');await edit.getByRole('button',{name:'Guardar'}).click();assert.equal((await put).status(),200);
  await section.getByText('+54 381 444-2999').waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM contactos_coordinacion_traslado WHERE id_vuelos=${fA} AND telefono_contacto=N'+54 381 444-2999' AND version_contacto=1`),1);
  await section.locator('li',{hasText:'+54 381 444-2999'}).getByRole('button',{name:'Hacer principal'}).click();
  await section.locator('li',{hasText:'+54 381 444-2999'}).getByText(/Principal/).waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM contactos_coordinacion_traslado WHERE id_vuelos=${fA} AND es_principal=1 AND fecha_baja IS NULL AND telefono_contacto=N'+54 381 444-2999'`),1);
  await section.locator('li',{hasText:'+54 381 555-2001'}).getByRole('button',{name:'Retirar'}).click();
  await section.getByText('+54 381 555-2001').waitFor({state:'detached'});
  assert.equal(count(`SELECT COUNT(*) FROM contactos_coordinacion_traslado WHERE id_vuelos=${fA} AND telefono_contacto=N'+54 381 555-2001' AND fecha_baja IS NOT NULL AND id_usuario_baja=${dts.id} AND motivo_baja=N'RETIRO' AND es_principal=0`),1,'baja lógica');
  await section.getByRole('button',{name:'Agregar contacto'}).click();
  const add=section.getByRole('form',{name:'Agregar contacto de coordinación'});await add.getByLabel(/^Nombre/).fill('Otro contacto');await add.locator('input[type=tel]').fill('3814442999');
  await add.getByRole('button',{name:'Agregar'}).click();
  await section.getByRole('alert').filter({hasText:/mismo teléfono/}).waitFor();   // ambigüedad rechazada por el servidor
  assert.equal(contactRows(fA),1,"el duplicado no se registró y el retirado dejó un único contacto vigente");
  await page.reload();await mine.getByLabel('Solicitud').selectOption(String(fA));await mine.getByLabel('Contactos de coordinación del traslado').getByText('+54 381 444-2999').waitFor();   // persiste

  // ---- 4. Centro de Operaciones: consulta contextual, a pedido y auditada ----
  const opsPage=await login(ops);
  const card=opsPage.getByRole('heading',{name:'Centro de Operaciones',exact:true}).locator('..');
  const codeA=one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${fA}`);
  await opsPage.waitForFunction((c)=>[...document.querySelectorAll('option')].some(o=>o.textContent.includes(c)),codeA);
  assert.equal(await opsPage.getByText('+54 381 444-2999').count(),0,'el panel general no muestra teléfonos');
  await card.locator('select').first().selectOption(String(fA));
  const opsSection=opsPage.getByLabel('Contactos de coordinación del traslado');await opsSection.waitFor();
  assert.equal(await opsSection.getByText('+54 381 444-2999').count(),0,'los números se piden a conciencia, no se cargan solos');
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT' AND operacion=N'VIEW' AND id_vuelos=${fA}`),0);
  await opsSection.getByRole('button',{name:'Ver contactos de coordinación'}).click();
  await opsSection.getByText('+54 381 444-2999').waitFor();await opsSection.getByText('Hospital Origen UI').count();
  assert.equal(await opsSection.getByRole('button',{name:/Editar|Retirar|Agregar|principal/i}).count(),0,'Operaciones consulta, no edita');
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT' AND operacion=N'VIEW' AND id_vuelos=${fA} AND id_usuario_actor=${ops.id} AND valores_nuevos LIKE N'%"cantidad":1%'`),1,'la consulta quedó auditada');
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'TRANSFER_CONTACT' AND CONCAT(valores_anteriores,valores_nuevos) LIKE N'%3814442%'`),0,'la auditoría no guarda el número');
  // otra solicitud sin contactos informados
  const fNone=Number((await ok('/flights',{method:'POST',token:dts.token,body:{patientId:existing.id,localidadOrigenId:localities[0].id,localidadDestinoId:localities[1].id,priorityCode:(await ok('/catalogs/priorities',{token:dts.token}))[0].codigo,motivoVuelo:'UI sin contactos '+MARK,fechaSolicitada:day+'T13:00:00',extremaUrgencia:false,medical:{diagnostico:'Dx',condicionMedica:'ESTABLE',requiereEquipamientoEspecial:false}}})).id);
  await opsPage.reload();const card2=opsPage.getByRole('heading',{name:'Centro de Operaciones',exact:true}).locator('..');
  const codeNone=one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${fNone}`);await opsPage.waitForFunction((c)=>[...document.querySelectorAll('option')].some(o=>o.textContent.includes(c)),codeNone);
  await card2.locator('select').first().selectOption(String(fNone));
  const noneSection=opsPage.getByLabel('Contactos de coordinación del traslado');await noneSection.getByRole('button',{name:'Ver contactos de coordinación'}).click();
  await noneSection.getByText(/no informó contactos/).waitFor();
  assert.equal(await opsPage.getByText('+54 381 444-2999').count(),0,'no se arrastran contactos de otra solicitud');

  // ---- 5. Comandante: ninguna pantalla de contactos de coordinación ----
  const cmdPage=await login(cmd);await cmdPage.getByRole('heading',{name:'Planificación operativa'}).waitFor();
  assert.equal(await cmdPage.getByText('Contactos de coordinación del traslado').count(),0);assert.equal(await cmdPage.getByText('+54 381 444-2999').count(),0);
  await cmdPage.close();await opsPage.close();

  assert.equal(identity(dts.id),before[0]);assert.equal(identity(ops.id),before[1]);assert.equal(identity(cmd.id),before[2]);
  await ok('/auth/me',{token:dts.token});
  console.log('PASS: Chrome registra contactos de coordinación con paciente existente (búsqueda) y nuevo, valida, mantiene con versión y baja lógica, Operaciones consulta a pedido con auditoría y sin edición, el comandante no los ve y las credenciales permanecen intactas');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
