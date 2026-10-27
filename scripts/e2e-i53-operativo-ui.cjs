/* I-5.3: recorrido real UI + SQL Server E2E; sólo crea registros marcados. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PASSWORD, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
const { spawnSync } = require('node:child_process');

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter(x => x.includes('=')).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'));
  await waitHealthy();
  const vars = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter(x => x && !x.trim().startsWith('#') && x.includes('=')).map(x => { const i=x.indexOf('='); return [x.slice(0,i).trim(), x.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));
  const admin = (await ok('/auth/login',{method:'POST',body:{username:vars.BOOTSTRAP_ADMIN_USERNAME,password:vars.BOOTSTRAP_ADMIN_PASSWORD}})).accessToken;
  console.log('Preparando cuentas de ensayo…');
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'i53ops');
  const commander = await createUser(admin, 'COMANDANTE', 'i53cmd');
  await provision(admin, commander);
  let province, airports;
  for (const p of await ok('/catalogs/provinces',{token:ops.token})) { const a=await ok(`/catalogs/airports?provinceId=${p.id}`,{token:ops.token}); if(a.length>=3){province=p;airports=a;break;} }
  assert.ok(province);
  await call(`/catalogs/commanders/${commander.id}/location`,{method:'POST',token:ops.token,body:{locationId:province.id}});
  const plane=await ok('/catalogs/aircraft',{method:'POST',token:admin,body:{matricula:(MARK+'I53').toUpperCase(),modelo:'E2E',tipo:'PRUEBA',capacidadPacientes:1,capacidadTripulacion:3,aeropuertoActualId:airports[0].id,activo:true}});
  const types=await ok('/catalogs/flight-types?operationalOnly=true',{token:ops.token}); assert.ok(types.length); assert.ok(types.every(t=>t.codigo!=='SANITARIO'));
  const depart=futureSlot(); depart.setHours(9,0,0,0); const arrive=new Date(depart.getTime()+7200000);
  const motive='UI I53 '+MARK;
  console.log('Preparación completa; iniciando navegador.');
  const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const login=async(name)=>{const ctx=await browser.newContext();const p=await ctx.newPage();p.on('response',r=>{if(r.url().includes('/api/'))console.log('API HTTP',r.status(),new URL(r.url()).pathname);});p.setDefaultTimeout(30000);await p.goto(process.env.E2E_UI_URL||'http://127.0.0.1:18081/');await p.getByLabel('Usuario',{exact:true}).fill(name);await p.getByLabel('Contraseña',{exact:true}).fill(PASSWORD);await p.getByRole('button',{name:'Iniciar sesión'}).click();return p;};
  try {
    const o=await login(ops.name);
    const form=o.getByRole('heading',{name:'Nuevo vuelo operativo'}).locator('..');
    await form.getByRole('option',{name:types[0].nombre,exact:true}).waitFor({state:'attached'});
    assert.deepEqual(await form.getByLabel('Tipo').locator('option').evaluateAll(xs=>xs.slice(1).map(x=>x.value)),types.map(x=>x.codigo));
    await form.getByLabel('Tipo').selectOption(types[0].codigo);
    try { await form.getByLabel('Aeronave').selectOption(String(plane.id),{timeout:10000}); }
    catch(e) { console.error('Opciones de aeronave:',await form.getByLabel('Aeronave').locator('option').allTextContents()); console.error('Mensajes de la pantalla:',await o.locator('.error').allTextContents()); throw e; }
    await form.locator('label').filter({hasText:/^Comandante/}).locator('select').selectOption(String(commander.id),{timeout:90000});
    await form.locator('label').filter({hasText:/^Destino/}).locator('select').selectOption(String(airports[1].id));
    await form.getByLabel('Salida').fill(fmt(depart).slice(0,16)); await form.getByLabel('Llegada').fill(fmt(arrive).slice(0,16));
    await form.getByLabel('Motivo').fill(motive); await form.getByRole('button',{name:'Crear vuelo operativo'}).click();
    await o.getByText('Vuelo operativo creado; queda pendiente de confirmación del comandante').waitFor();
    const id=Number(one(`SELECT id_vuelos FROM vuelos WHERE motivo_vuelo=N'${motive}'`)); assert.ok(id);
    assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN tipos_vuelo t ON t.id_tipos_vuelo=v.id_tipos_vuelo WHERE v.id_vuelos=${id} AND t.codigo_tipo_vuelo=N'${types[0].codigo}' AND v.id_aeronaves=${plane.id} AND v.id_usuario_comandante=${commander.id} AND v.id_aeropuerto_origen=${airports[0].id} AND v.id_aeropuerto_destino=${airports[1].id}`),1);
    console.log('PASS: Operaciones crea el vuelo desde el catálogo y persiste tipo, motivo y recursos en SQL.');
    const c=await login(commander.name); const card=c.getByRole('heading',{name:'Planificación operativa',exact:true}).locator('..');
    await card.locator('select').first().selectOption(String(id),{timeout:90000}); await c.getByRole('button',{name:'Aceptar asignación'}).click();
    await c.getByText('Respuesta enviada a Operaciones').waitFor();
    await c.getByLabel('Recorrido y puntos intermedios en orden').fill('Ruta de ensayo '+MARK);
    await c.getByLabel('Buscar aeropuerto alternativo').fill(airports[2].nombre);
    await c.locator('label').filter({hasText:/^Aeropuerto alternativo/}).locator('select').selectOption(String(airports[2].id));
    await c.getByRole('button',{name:'Guardar y presentar a Operaciones'}).click();
    await c.getByText('Ruta presentada a Operaciones').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${id} AND es_version_actual=1 AND recorrido_planificado=N'Ruta de ensayo ${MARK}' AND id_aeropuerto_alternativo=${airports[2].id} AND estado_revision=N'PENDIENTE_REVISION'`),1);
    console.log('PASS: comandante acepta, planifica y presenta ruta con aeropuerto activo; SQL conserva la versión.');
  } finally { await browser.close(); }
})().catch(e=>{console.error('FALLO I-5.3 UI:',e.stack||e);process.exitCode=1;});
