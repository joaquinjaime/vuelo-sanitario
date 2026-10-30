/* Chrome real (Playwright) sobre el stack aislado :18081 / :18080 (base vuelos_sanitarios_e2e): el titular registra un contacto LABORAL en
 * "Mi cuenta"; Centro de Operaciones consulta explícitamente los contactos laborales de la tripulación desde el detalle del vuelo, ve sólo los
 * laborales, los datos desaparecen al ocultar/recargar/cambiar la tripulación, y un vuelo cerrado no los entrega. Cada paso se verifica en SQL.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { ROOT, MARK, PASSWORD, PDF, BASE, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, verifyEmail } = require('./e2e-cierre-support.cjs');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
const HOUR = 3600000;
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const personOf = (u) => Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${u.id}`));
const views = (flightId) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'FLIGHT_CREW_CONTACT' AND operacion=N'VIEW' AND id_vuelos=${flightId}`);

async function provisionRole(admin, user, roleCode) {
  await call(`/crew-qualifications/${user.id}/${roleCode}`, { method: 'PUT', token: admin, expect: [204] });
  const credential = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode, type: 'Documento de prueba', number: 'UI-' + roleCode + '-' + user.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
  const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
  const up = await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form }); assert.equal(up.status, 200);
  await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
}

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 54); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'tuops');
  const cmd = await createUser(admin, 'COMANDANTE', 'tucmd'); await provision(admin, cmd);
  const med = await createUser(admin, 'DTS', 'tumed'), enf = await createUser(admin, 'DTS', 'tuenf'), copi = await createUser(admin, 'DTS', 'tucopi');
  await provisionRole(admin, med, 'MEDICO'); await provisionRole(admin, enf, 'ENFERMERO'); await provisionRole(admin, copi, 'COPILOTO');
  let province, airports;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (a.length >= 3) { province = p; airports = a; break; } }
  await call(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0;
  const flight = async (commander, plane) => { const d = futureSlot(); d.setHours(9, 0, 0, 0); const f = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'UI contactos ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(d), llegada: fmt(new Date(d.getTime() + 2 * HOUR)) } })).id; await ok(`/flights/${f}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } }); return f; };
  const newPlane = () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'T' + (++seq)).toUpperCase(), modelo: 'UI', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 5, aeropuertoActualId: airports[0].id, activo: true } });
  const f = await flight(cmd, await newPlane());
  for (const [u, role] of [[med, 'MEDICO'], [enf, 'ENFERMERO'], [copi, 'COPILOTO']]) await call(`/flights/${f}/crew`, { method: 'POST', token: ops.token, body: { userId: u.id, crewRoleCode: role }, expect: [204] });
  const fClosed = await flight((() => cmd)(), await newPlane());   // el mismo comandante en otro horario
  // contactos: createUser deja el correo / teléfono PERSONALES '3815551234' y '<usuario>@example.test'
  const L = { cmdPhone: '+54 381 610-0001', cmdMail: `cmd.${MARK}@trabajo.test`, medPhone: '+54 381 610-0002', enfPhone: '+54 381 610-0003', enfPriv: '+54 381 610-0004' };   // valores tal como se guardan y se muestran (formato internacional)
  await ok('/auth/me/telefonos', { method: 'POST', token: cmd.token, body: { pais: 'AR', numero: L.cmdPhone, tipo: 'LABORAL' } }); const cmdMail = await ok('/auth/me/correos', { method: 'POST', token: cmd.token, body: { direccion: L.cmdMail, tipo: 'LABORAL' } }); await verifyEmail(cmd, cmdMail.id, L.cmdMail);   // un correo laboral sólo se muestra tras verificarlo
  await ok('/auth/me/telefonos', { method: 'POST', token: enf.token, body: { pais: 'AR', numero: L.enfPhone, tipo: 'LABORAL' } }); await ok('/auth/me/telefonos', { method: 'POST', token: enf.token, body: { pais: 'AR', numero: L.enfPriv, tipo: 'PERSONAL' } });
  // copi: sin contactos vigentes (la API impide quedarse sin ninguno; se simulan bajas lógicas históricas)
  sql(`UPDATE telefonos SET fecha_baja=SYSUTCDATETIME(), motivo_baja=N'RETIRO', es_principal=0, id_usuario_baja=${copi.id} WHERE id_personas=${personOf(copi)} AND fecha_baja IS NULL; UPDATE correos_electronicos SET fecha_baja=SYSUTCDATETIME(), motivo_baja=N'RETIRO', es_principal=0, id_usuario_baja=${copi.id} WHERE id_personas=${personOf(copi)} AND fecha_baja IS NULL`);
  const identity = (u) => one(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT u.hash_contrasena,u.estado_cuenta,u.version_credenciales,p.dni,p.nombre_persona,p.version_identidad FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${u.id} FOR JSON PATH)),2)`);
  const identities = { ops: identity(ops), cmd: identity(cmd), med: identity(med), enf: identity(enf) };

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (user) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.setDefaultTimeout(60000); p.on('dialog', (d) => d.accept()); p.contactRequests = []; p.on('request', (r) => { if (r.url().includes('/crew/contacts')) p.contactRequests.push(r.url()); }); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(user.name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); const resp = p.waitForResponse((r) => r.url().endsWith('/api/auth/login')); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); assert.equal((await resp).status(), 200); return p; };
  const snap = async (p, n) => { if (shots) { try { await p.screenshot({ path: path.join(shots, n + '.png'), timeout: 15000 }); } catch (e) { console.log('(captura omitida: ' + n + ')'); } } };
  try {
    // ---- 1. El titular registra un contacto laboral desde "Mi cuenta" ----
    const m = await login(med);
    await m.getByText('Mi cuenta', { exact: true }).click(); await m.getByRole('heading', { name: 'Mis datos de contacto' }).waitFor();
    await m.getByText(/sólo los contactos laborales pueden ser consultados por el Centro de Operaciones/).waitFor();
    const phoneForm = m.getByRole('form', { name: 'Agregar teléfono' });
    await phoneForm.getByLabel('Nuevo teléfono', { exact: true }).fill('3816100002');   // se escribe el número nacional; el país sugerido es Argentina
    assert.match(await phoneForm.getByRole('note').innerText(), /privado, nunca se muestra al Centro de Operaciones/);
    await phoneForm.getByLabel('Tipo del nuevo teléfono', { exact: true }).selectOption('LABORAL');
    assert.match(await phoneForm.getByRole('note').innerText(), /vuelo abierto.*Centro de Operaciones podrá consultarlo.*auditada/);
    await snap(m, 't01-mi-cuenta-laboral');
    const add = m.waitForResponse((r) => r.url().endsWith('/api/auth/me/telefonos') && r.request().method() === 'POST'); await phoneForm.getByRole('button', { name: 'Agregar' }).click(); assert.equal((await add).status(), 200);
    await m.getByText('✓ Contacto agregado').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${personOf(med)} AND numero=N'${L.medPhone}' AND tipo_telefono=N'LABORAL' AND fecha_baja IS NULL`), 1);
    pass('Mi cuenta: el titular distingue personal de laboral, ve quién podrá consultarlo y lo registra como LABORAL');

    // ---- 2. Operaciones: la consulta es explícita ----
    const o = await login(ops); await o.getByRole('heading', { name: 'Centro de Operaciones' }).waitFor();
    const card = o.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..');
    const select = async (id) => { await card.locator('select').first().selectOption(String(id), { timeout: 90000 }); };
    const crewBox = () => o.locator('div.wide', { has: o.locator('h4', { hasText: /^Tripulación$/ }) }).last();
    await select(f); await crewBox().getByText('E2E tumed').waitFor();
    const contactsBtn = () => crewBox().getByRole('button', { name: 'Consultar contactos de la tripulación' });
    await contactsBtn().waitFor();
    assert.equal(o.contactRequests.length, 0, 'al abrir el vuelo no se piden contactos'); assert.equal(views(f), 0);
    assert.ok(!(await o.locator('body').innerText()).includes(L.medPhone));
    await snap(o, 't02-operaciones-antes');
    const q = o.waitForResponse((r) => r.url().includes(`/flights/${f}/crew/contacts`)); await contactsBtn().click(); assert.equal((await q).status(), 200);
    const panel = o.getByRole('region', { name: 'Contactos laborales de la tripulación' }); await panel.getByText(L.medPhone).waitFor();
    const text = await panel.innerText();
    for (const v of [L.cmdPhone, L.cmdMail, L.medPhone, L.enfPhone]) assert.ok(text.includes(v), 'falta ' + v);
    for (const v of ['555-1234', '@example.test', L.enfPriv]) assert.ok(!text.includes(v), 'contacto personal visible: ' + v);
    assert.ok(!(await o.locator('body').innerText()).match(/555-1234|@example\.test|610-0004/), 'ningún contacto personal en toda la página');
    const items = panel.getByRole('listitem'); assert.equal(await items.count(), 4);
    assert.match(await items.nth(0).innerText(), /E2E tucmd · Comandante[\s\S]*Teléfono: \+54 381 610-0001[\s\S]*Correo: cmd\./);
    assert.match(await items.filter({ hasText: 'tumed' }).innerText(), /Médico[\s\S]*Teléfono: \+54 381 610-0002/);
    assert.match(await items.filter({ hasText: 'tuenf' }).innerText(), /Enfermero[\s\S]*Teléfono: \+54 381 610-0003/);
    assert.match(await items.filter({ hasText: 'tucopi' }).innerText(), /No hay contacto laboral disponible\./);
    assert.match(text, /datos laborales declarados/); assert.match(text, /correos que se muestran fueron verificados/); assert.match(text, /no se verifican por SMS/); assert.ok(!/tel[eé]fono[^.]*verificado/i.test(text));
    assert.equal(o.contactRequests.length, 1);
    assert.equal(views(f), 1);
    const ev = sql(`SELECT TOP 1 CONCAT(u.nombre_usuario,'|',e.valores_nuevos) FROM eventos_auditoria e JOIN usuarios u ON u.id_usuarios=e.id_usuario_actor WHERE e.id_vuelos=${f} AND e.tipo_entidad=N'FLIGHT_CREW_CONTACT' ORDER BY e.id_eventos_auditoria DESC`);
    assert.equal(ev, `${ops.name}|{"tripulantes":4,"contactos":4,"sinContactoLaboral":1}`);
    const stored = await o.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    assert.ok(!stored.match(/610-00\d\d|trabajo\.test/), 'los contactos no se guardan en el navegador');
    await snap(o, 't03-contactos-visibles');
    pass('Operaciones: consulta explícita, sólo laborales (comandante, tripulantes, sin contacto laboral), auditada, sin almacenamiento local');

    // ---- 3. Ocultar el panel descarta los datos ----
    await panel.getByRole('button', { name: 'Ocultar contactos' }).click();
    await contactsBtn().waitFor(); assert.ok(!(await o.locator('body').innerText()).includes(L.medPhone));
    pass('ocultar el panel elimina los contactos de la pantalla');

    // ---- 4. Retirar a un tripulante: los datos obtenidos se descartan y el siguiente resultado ya no lo incluye ----
    await contactsBtn().click(); await panel.getByText(L.medPhone).waitFor(); assert.equal(views(f), 2);
    await crewBox().locator('p', { hasText: 'E2E tumed' }).getByRole('button', { name: 'Retirar' }).click();
    await o.getByText('✓ Tripulante retirado').waitFor();
    await o.getByText(/La tripulación cambió/).waitFor();
    assert.ok(!(await o.locator('body').innerText()).includes(L.medPhone), 'el retirado no se sigue mostrando');
    assert.ok(!(await o.locator('body').innerText()).includes(L.cmdPhone), 'tras el cambio ningún dato previo queda en pantalla');
    assert.equal(o.contactRequests.length, 2, 'la interfaz no vuelve a consultar sola');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${f} AND id_usuarios=${med.id} AND fecha_baja IS NOT NULL AND motivo_baja=N'RETIRO'`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${personOf(med)} AND numero=N'${L.medPhone}' AND fecha_baja IS NULL`), 1, 'el contacto del retirado no se toca');
    await contactsBtn().click(); await panel.getByText(L.enfPhone).waitFor();
    assert.ok(!(await panel.innerText()).includes(L.medPhone)); assert.equal(await panel.getByRole('listitem').count(), 3); assert.equal(views(f), 3);
    await snap(o, 't04-tras-retiro');
    pass('cambio de tripulación: se descartan los datos previos, no hay consulta automática y el retirado deja de figurar');

    // ---- 5. Recargar la página no conserva contactos ----
    await o.reload(); await o.getByRole('heading', { name: 'Centro de Operaciones' }).waitFor(); await select(f); await crewBox().getByText('E2E tuenf').waitFor();
    assert.ok(!(await o.locator('body').innerText()).includes(L.enfPhone)); await contactsBtn().waitFor();
    pass('recargar no conserva contactos privados');

    // ---- 6. Comandante: ve la tripulación pero no puede consultar contactos ----
    const c = await login(cmd); await c.getByRole('heading', { name: 'Planificación operativa' }).waitFor();
    const planning = c.getByRole('heading', { name: 'Planificación operativa' }).locator('..'); await planning.locator('select').first().selectOption(String(f), { timeout: 60000 });
    await c.locator('div.wide', { has: c.locator('h4', { hasText: /^Tripulación$/ }) }).last().getByText('E2E tuenf').waitFor();
    assert.equal(await c.getByRole('button', { name: 'Consultar contactos de la tripulación' }).count(), 0);
    assert.equal((await call(`/flights/${f}/crew/contacts`, { token: cmd.token, expect: [403] })).status, 403);
    pass('el comandante no ve el botón y el servidor rechaza su consulta');

    // ---- 7. Vuelo que se cierra mientras se consulta ----
    await contactsBtn().click(); await panel.getByText(L.enfPhone).waitFor(); await panel.getByRole('button', { name: 'Ocultar contactos' }).click();
    const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((r) => r.codigo !== 'OTRO');
    await ok(`/flights/${f}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } });
    const views0 = views(f);
    const closedResp = o.waitForResponse((r) => r.url().includes(`/flights/${f}/crew/contacts`)); await contactsBtn().click(); assert.equal((await closedResp).status(), 409);
    await o.getByRole('alert').filter({ hasText: 'CANCELADO' }).waitFor();
    assert.ok(!(await o.locator('body').innerText()).includes(L.enfPhone)); assert.equal(views(f), views0, 'el rechazo no se audita');
    await snap(o, 't05-vuelo-cerrado');
    // tras recargar, el vuelo cancelado ya no ofrece la consulta
    await o.reload(); await o.getByRole('heading', { name: 'Centro de Operaciones' }).waitFor();
    pass('vuelo cerrado: el servidor responde 409 sin datos ni auditoría y el panel lo informa');

    // ---- 7b. Descarte automático a los 5 minutos (reloj simulado del navegador) ----
    const t = await login(ops); await t.clock.install();
    await t.getByRole('heading', { name: 'Centro de Operaciones' }).waitFor();
    const tCard = t.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..');
    await tCard.locator('select').first().selectOption(String(fClosed), { timeout: 90000 });
    const tBox = t.locator('div.wide', { has: t.locator('h4', { hasText: /^Tripulación$/ }) }).last();
    await tBox.getByRole('button', { name: 'Consultar contactos de la tripulación' }).click();
    const tPanel = t.getByRole('region', { name: 'Contactos laborales de la tripulación' });
    await tPanel.getByText(L.cmdPhone).waitFor();
    await t.clock.fastForward(4 * 60 * 1000 + 30 * 1000);   // todavía vigente a los 4 min 30 s
    assert.ok((await t.locator('body').innerText()).includes(L.cmdPhone), 'a los 4 min 30 s los datos siguen en pantalla');
    await t.clock.fastForward(60 * 1000);   // se cumplen los 5 minutos
    await t.getByText(/se ocultaron por el tiempo transcurrido/).waitFor();
    assert.ok(!(await t.locator('body').innerText()).includes(L.cmdPhone) && !(await t.locator('body').innerText()).includes(L.cmdMail), 'a los 5 minutos no queda ningún contacto visible');
    assert.equal(t.contactRequests.length, 1, 'el descarte no consulta de nuevo');
    pass('descarte automático: los contactos desaparecen a los 5 minutos y no se vuelven a pedir solos');

    // ---- 8. Invariantes ----
    assert.deepEqual({ ops: identity(ops), cmd: identity(cmd), med: identity(med), enf: identity(enf) }, identities, 'cuentas intactas');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${fClosed}`), 1);
    pass('cuentas y vuelos ajenos intactos');
  } finally { await browser.close(); }
  console.log(`\nOK: ${passed} bloques aprobados`);
})().catch((e) => { console.error(e); process.exit(1); });
