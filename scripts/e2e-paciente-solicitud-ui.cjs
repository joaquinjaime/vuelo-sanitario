/* Navegador real sobre :18081, API y SQL Server del proyecto E2E aislado. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { chromium }=require('playwright');
const { ROOT, MARK, PASSWORD, one, count, ok, createUser, waitHealthy }=require('./e2e-cierre-support.cjs');

(async()=>{
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'))>=48);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){if(line.includes('=')&&!line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const dts=await createUser(admin,'DTS','uipatient');
 const provinces=await ok('/catalogs/provinces',{token:dts.token});
 const province=provinces[0],localities=await ok(`/catalogs/localities?provinceId=${province.id}`,{token:dts.token});
 assert.ok(localities.length>=2);
 const dni=String(70000000+Math.floor(Math.random()*20000000));
 const motive='UI paciente '+MARK;
 const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
  await page.goto(process.env.E2E_UI_URL||'http://127.0.0.1:18081/');
  await page.getByLabel('Usuario',{exact:true}).fill(dts.name);
  await page.getByLabel('Contraseña',{exact:true}).fill(PASSWORD);
  const loginResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/login'));
  await page.getByRole('button',{name:'Iniciar sesión'}).click();
  assert.equal((await loginResponse).status(),200);
  await page.getByRole('heading',{name:'Nueva solicitud DTS'}).waitFor();
  const form=page.locator('form').first();
  await form.getByLabel('Nombre',{exact:true}).fill('Paciente');
  await form.getByLabel('Apellido',{exact:true}).fill(MARK);
  await form.getByLabel('DNI',{exact:true}).fill(dni);
  await form.getByLabel('Fecha de nacimiento').fill('1990-01-02');
  await form.getByLabel(/Confirmo que cotejé/).check();
  for(const [kind,locality] of [['origen',localities[0]],['destino',localities[1]]]){
   await page.getByLabel(`Provincia ${kind}`).selectOption(String(province.id));
   await page.getByLabel(`Buscar localidad ${kind}`).fill(locality.nombre.slice(0,5));
   await page.getByLabel(`Buscar localidad ${kind}`).focus();
   await page.getByRole('option',{name:new RegExp(locality.nombre.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();
  }
  const day=new Date(Date.now()+5*86400000-3*3600000).toISOString().slice(0,10);
  await form.getByLabel('Fecha y hora solicitada').fill(day+'T12:00');
  await form.getByLabel('Diagnóstico').fill('Control');
  await form.getByLabel('Condición').fill('ESTABLE');
  await form.getByLabel('Motivo').fill(motive);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/flights/with-patient')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Crear solicitud'}).click();
  assert.equal((await response).status(),200);
  await page.getByText('✓ Solicitud registrada').waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN vuelos_sanitarios s ON s.id_vuelos=v.id_vuelos JOIN pacientes p ON p.id_pacientes=s.id_pacientes JOIN personas x ON x.id_personas=p.id_personas WHERE v.motivo_vuelo=N'${motive}' AND x.dni='${dni}'`),1);
  console.log('PASS: DTS registra paciente y solicitud desde Chrome; ambos quedan relacionados en SQL Server');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
