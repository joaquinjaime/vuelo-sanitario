/* Chrome real: DTS vincula una persona con cuenta desde el formulario sanitario. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {ROOT,MARK,PASSWORD,one,count,call,ok,createUser,waitHealthy}=require('./e2e-cierre-support.cjs');

(async()=>{
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'))>=48);
 await waitHealthy();
 const dotenv={};for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){if(line.includes('=')&&!line.trim().startsWith('#')){const i=line.indexOf('=');dotenv[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,'');}}
 const admin=(await ok('/auth/login',{method:'POST',body:{username:dotenv.BOOTSTRAP_ADMIN_USERNAME,password:dotenv.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
 const dts=await createUser(admin,'DTS','uishared');
 const dni=String(70000000+Math.floor(Math.random()*20000000)),surname='Compartida'+MARK,username=MARK+'uiexisting';
 const activation=await ok('/auth/users',{method:'POST',token:admin,body:{nombre:'Lucía',apellido:surname,dni,roles:['DTS'],correos:[{direccion:username+'@example.test'}],telefonos:[{pais: 'AR', numero:'3815551234'}]}});
 await call('/auth/activar-cuenta',{method:'POST',body:{dni,codigo:activation.codigo,username,password:PASSWORD,confirmacionPassword:PASSWORD},expect:[204]});
 const personId=Number(one(`SELECT id_personas FROM personas WHERE dni='${dni}'`));
 const provinces=await ok('/catalogs/provinces',{token:dts.token});
 const province=provinces[0],localities=await ok(`/catalogs/localities?provinceId=${province.id}`,{token:dts.token});assert.ok(localities.length>=2);
 const motive='UI identidad '+MARK;
 const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.E2E_UI_URL||'http://127.0.0.1:18081/');
  await page.getByLabel('Usuario',{exact:true}).fill(dts.name);
  await page.getByLabel('Contraseña',{exact:true}).fill(PASSWORD);
  const login=page.waitForResponse(response=>response.url().endsWith('/api/auth/login'));
  await page.getByRole('button',{name:'Iniciar sesión'}).click();assert.equal((await login).status(),200);
  await page.getByRole('heading',{name:'Nueva solicitud DTS'}).waitFor();
  const form=page.locator('form').first();
  await form.getByLabel('Nombre',{exact:true}).fill('Lucía');
  await form.getByLabel('Apellido',{exact:true}).fill(surname);
  await form.getByLabel('DNI',{exact:true}).fill(`${dni.slice(0,2)}.${dni.slice(2,5)}.${dni.slice(5)}`);
  await form.getByLabel(/Confirmo que cotejé/).check();
  for(const [kind,locality] of [['origen',localities[0]],['destino',localities[1]]]){
   await page.getByLabel(`Provincia ${kind}`).selectOption(String(province.id));
   await page.getByLabel(`Buscar localidad ${kind}`).fill(locality.nombre.slice(0,5));
   await page.getByLabel(`Buscar localidad ${kind}`).focus();
   await page.getByRole('option',{name:new RegExp(locality.nombre.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();
  }
  const day=new Date(Date.now()+7*86400000-3*3600000).toISOString().slice(0,10);
  await form.getByLabel('Fecha y hora solicitada').fill(day+'T12:00');
  await form.getByLabel('Diagnóstico').fill('Control');
  await form.getByLabel('Condición').fill('ESTABLE');
  await form.getByLabel('Motivo').fill(motive);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/flights/with-patient')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Crear solicitud'}).click();assert.equal((await response).status(),200);
  await page.getByText('✓ Solicitud registrada').waitFor();
  assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni='${dni}'`),1);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN vuelos_sanitarios s ON s.id_vuelos=v.id_vuelos JOIN pacientes p ON p.id_pacientes=s.id_pacientes WHERE v.motivo_vuelo=N'${motive}' AND p.id_personas=${personId}`),1);
  assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE id_personas=${personId}`),1);
  console.log('PASS: Chrome DTS vincula persona con cuenta existente, crea solicitud y preserva relaciones en SQL Server');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
