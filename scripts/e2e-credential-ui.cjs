const { chromium } = require('playwright');
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>raw+=s);
process.stdin.on('end',async()=>{
 const t=JSON.parse(raw), browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});let p;
 try{
  p=await browser.newPage();p.on('pageerror',e=>console.error('Error de interfaz:',e.message));await p.goto('http://127.0.0.1:18081/');await p.getByLabel('Usuario',{exact:true}).fill(t.admin);await p.getByLabel('Contraseña',{exact:true}).fill(t.password);await p.getByRole('button',{name:'Iniciar sesión'}).click();
  await p.locator('nav').getByText('Usuarios',{exact:true}).click();
  const panel=p.getByRole('heading',{name:'Clasificación administrativa de tripulación'}).locator('..');
  await panel.locator('select').first().selectOption(t.userId);
  const classification=panel.getByRole('checkbox',{name:'Médico'});await classification.click();await p.waitForFunction(el=>el.checked,await classification.elementHandle());
  await panel.getByLabel('Tipo de habilitación').fill('Matrícula de prueba');
  await panel.getByLabel('Número de licencia o matrícula').fill('UI-'+t.userId);
  await panel.getByLabel('Organismo emisor').fill('Organismo de prueba');
  await panel.getByRole('checkbox',{name:'El vencimiento no aplica a esta credencial'}).check();
  await panel.getByRole('button',{name:'Guardar habilitación'}).click();
  await panel.getByText(/Estado: PENDIENTE/).waitFor();
  await panel.getByLabel('Documento PDF').setInputFiles({name:'respaldo.pdf',mimeType:'application/pdf',buffer:Buffer.from(t.pdf,'base64')});
  await panel.getByRole('button',{name:'Adjuntar documento'}).click();
  const downloadButton=panel.getByRole('button',{name:'Descargar respaldo.pdf'});await downloadButton.waitFor();
  const pendingStatus=await p.evaluate(async({flightId,userId,token})=>{const r=await fetch(`/api/flights/${flightId}/crew`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({userId:Number(userId),crewRoleCode:'MEDICO'})});return r.status;},{flightId:t.flightId,userId:t.userId,token:t.opsToken});
  if(pendingStatus!==400)throw Error('La credencial pendiente permitió una asignación: '+pendingStatus);
  const downloadPromise=p.waitForEvent('download');await downloadButton.click();const download=await downloadPromise;if(await download.failure())throw Error('Falló la descarga');
  await panel.getByLabel('Justificación de la revisión').fill('Revisión manual documentada de prueba');
  await panel.getByRole('checkbox',{name:'Confirmo la revisión manual y que la documentación acredita la función indicada'}).check();
  await panel.getByRole('button',{name:'Verificar manualmente'}).click();
  await panel.getByText(/Estado: VERIFICADA/).waitFor();
  await panel.getByLabel('Organismo emisor').fill('Organismo de prueba actualizado');await panel.getByRole('button',{name:'Guardar habilitación'}).click();await panel.getByText(/Estado: PENDIENTE/).waitFor();
  async function verify(){await panel.getByLabel('Justificación de la revisión').fill('Revisión posterior de prueba');await panel.getByRole('checkbox',{name:'Confirmo la revisión manual y que la documentación acredita la función indicada'}).check();await panel.getByRole('button',{name:'Verificar manualmente'}).click();await panel.getByText(/Estado: VERIFICADA/).waitFor();}
  await verify();await panel.getByLabel('Justificación de la revisión').fill('Rechazo de prueba');await panel.getByRole('button',{name:'Rechazar',exact:true}).click();await panel.getByText(/Estado: RECHAZADA/).waitFor();
  await verify();await panel.getByLabel('Justificación de la revisión').fill('Revocación de prueba');await panel.getByRole('button',{name:'Revocar verificación'}).click();await panel.getByText(/Estado: REVOCADA/).waitFor();await verify();
  await panel.getByRole('button',{name:'Consultar historial'}).click();await panel.getByText(/UPLOAD_DOCUMENT/).waitFor();
  console.log('PASS: administración real clasificó, registró, editó, adjuntó, descargó, verificó, rechazó, revocó y consultó historial');
 }catch(e){if(p)console.error('Pantalla:',await p.locator('h1,h2,h3,[role=alert]').allTextContents());throw e;}finally{await browser.close();}
});
