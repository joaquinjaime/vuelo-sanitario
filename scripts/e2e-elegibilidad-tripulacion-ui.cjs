/* I-3: Chrome contra el stack aislado; estado contextual, reemplazo e inicio. */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
const {ROOT,MARK,PASSWORD,PDF,BASE,one,count,call,ok,fmt,futureSlot,createUser,provision,waitHealthy,approveRoute}=require('./e2e-cierre-support.cjs');
const UI=process.env.E2E_UI_URL||'http://127.0.0.1:18081/';
async function qualified(admin,user){
 await call(`/crew-qualifications/${user.id}/COPILOTO`,{method:'PUT',token:admin,expect:[204]});
 const c=await ok(`/users/${user.id}/professional-credentials`,{method:'POST',token:admin,body:{roleCode:'COPILOTO',type:'Documento E2E UI',number:`I3UI-${MARK}-${user.id}`,issuer:'Organismo de prueba',noExpiry:true,notes:'Ensayo aislado'}});
 const body=new FormData();body.append('file',new Blob([PDF],{type:'application/pdf'}),'credencial.pdf');
 assert.equal((await fetch(`${BASE}/professional-credentials/${c.id}/documents`,{method:'POST',headers:{Authorization:'Bearer '+admin},body})).status,200);
 await call(`/professional-credentials/${c.id}/decision/VERIFICADA`,{method:'POST',token:admin,body:{notes:'Revisión E2E UI',confirmsSufficiency:true}});return c.id;
}
(async()=>{
 await waitHealthy();assert.ok(Number(one("SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL"))>=54);
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0&&!line.trim().startsWith('#'))dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const ops=await createUser(admin,'CENTRO_OPERACIONES','ui3ops'),commander=await createUser(admin,'COMANDANTE','ui3cmd');await provision(admin,commander);
 const first=await createUser(admin,'DTS','ui3first'),next=await createUser(admin,'DTS','ui3next');const credential=await qualified(admin,first);await qualified(admin,next);
 let province,airports;for(const p of await ok('/catalogs/provinces',{token:ops.token})){const a=await ok(`/catalogs/airports?provinceId=${p.id}`,{token:ops.token});if(a.length>=2){province=p;airports=a;break;}}
 assert.ok(province);await call(`/catalogs/commanders/${commander.id}/location`,{method:'POST',token:ops.token,body:{locationId:province.id}});
 const plane=await ok('/catalogs/aircraft',{method:'POST',token:admin,body:{matricula:(MARK+'UI3').toUpperCase(),modelo:'E2E',tipo:'PRUEBA',capacidadPacientes:1,capacidadTripulacion:3,aeropuertoActualId:airports[0].id,activo:true}});
 const from=futureSlot(),to=new Date(from.getTime()+2*3600000);
 const flight=await ok('/flights/operational',{method:'POST',token:ops.token,body:{tipoVueloCode:'REGRESO_BASE',motivoVuelo:'Elegibilidad Chrome '+MARK,aircraftId:plane.id,comandanteId:commander.id,destinoId:airports[1].id,salida:fmt(from),llegada:fmt(to)}});
 await call(`/flights/${flight.id}/commander-assignment/response`,{method:'POST',token:commander.token,body:{aceptar:true}});
 await call(`/flights/${flight.id}/crew`,{method:'POST',token:ops.token,body:{userId:first.id,crewRoleCode:'COPILOTO'},expect:[204]});
 await call(`/professional-credentials/${credential}/decision/REVOCADA`,{method:'POST',token:admin,body:{notes:'Revocación E2E UI'}});
 const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let page;try{
  page=await browser.newPage();page.on('dialog',d=>d.accept());page.setDefaultTimeout(60000);
  // La base aislada conserva miles de vuelos de regresiones previas; acotar sólo el índice mantiene reales el detalle y todas las mutaciones.
  await page.route('**/api/flights',async route=>{if(route.request().method()!=='GET')return route.continue();const detail=await ok(`/flights/${flight.id}`,{token:ops.token});await route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'http://127.0.0.1:18081'},body:JSON.stringify([detail.vuelo])});});
  await page.goto(UI);
  await page.getByLabel('Usuario',{exact:true}).fill(ops.name);await page.getByLabel('Contraseña',{exact:true}).fill(PASSWORD);await page.getByRole('button',{name:'Iniciar sesión'}).click();
  const card=page.getByRole('heading',{name:'Centro de Operaciones',exact:true}).locator('..');await card.locator('select').first().selectOption(String(flight.id));
  const crew=page.locator('div.wide',{has:page.locator('h4',{hasText:/^Tripulación$/})}).last();
  await crew.getByText(/Requiere revisión: La verificación de la habilitación fue revocada/).waitFor();
  await page.getByRole('button',{name:'Iniciar vuelo'}).click();await page.locator('p.error').filter({hasText:'La verificación de la habilitación fue revocada'}).waitFor();
  assert.equal(one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${flight.id}`),'PLANIFICADO');
  const row=crew.locator('p',{hasText:first.name.replace(MARK,'')}).first();
  await row.getByRole('button',{name:'Reemplazar'}).click();await crew.getByLabel('Función de tripulación').selectOption('COPILOTO');
  await crew.getByLabel('Personal disponible').waitFor({timeout:180000});await crew.getByLabel('Personal disponible').selectOption(String(next.id));await crew.getByRole('button',{name:'Confirmar reemplazo'}).click();
  await crew.getByText(/Apto/).first().waitFor();await approveRoute(flight.id,commander.token,ops.token);await page.getByRole('button',{name:'Iniciar vuelo'}).click();await page.getByText(/Vuelo iniciado/).first().waitFor();
  assert.equal(one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${flight.id}`),'EN_CURSO');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flight.id} AND id_usuarios=${first.id} AND fecha_baja IS NOT NULL`),1);
  console.log('PASS: Chrome muestra incidencia, deniega inicio, reemplaza y permite iniciar; vuelo '+flight.id);
 }catch(e){if(page){const body=await page.locator('body').innerText();const at=body.indexOf('Tripulación');console.error('Estado UI:',body.slice(Math.max(0,at-250),at+1700));}throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
