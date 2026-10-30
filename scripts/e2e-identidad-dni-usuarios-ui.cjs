/* E2E de navegador real (Chrome + Playwright) de la rectificación del DNI desde Usuarios > Detalle (I-1b) sobre el stack aislado :18081 / :18080 (base vuelos_sanitarios_e2e).
 * Cada paso se verifica en SQL Server. Sólo crea datos marcados. Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const REASON = 'Documento cotejado por administración ' + MARK;

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 53); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const dts = await createUser(admin, 'DTS', 'dniuidts2');
  const used = new Set(); const newDni = () => { for (;;) { const d = String(60000000 + Math.floor(Math.random() * 30000000)); if (!used.has(d) && count(`SELECT COUNT(*) FROM personas WHERE dni='${d}'`) === 0) { used.add(d); return d; } } };
  const personOf = (userId) => Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${userId}`));
  const dniOf = (personId) => one(`SELECT ISNULL(dni,'NULL') FROM personas WHERE id_personas=${personId}`), versionOf = (personId) => Number(one(`SELECT version_identidad FROM personas WHERE id_personas=${personId}`));
  const snapshot = (userId) => sql(`SELECT CONCAT(nombre_usuario,'|',ISNULL(hash_contrasena,'-'),'|',estado_cuenta,'|',CAST(esta_activo AS varchar),'|',CAST(version_credenciales AS varchar),'|',ISNULL(motivo_baja,'-')) FROM usuarios WHERE id_usuarios=${userId}`).trim();
  const mk = async (label) => { const dni = newDni(), username = MARK + label; const act = await ok('/auth/users', { method: 'POST', token: admin, body: { nombre: 'Cuenta', apellido: label + MARK, dni, roles: ['DTS'], correos: [{ direccion: username + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551234' }] } }); return { dni, username, code: act.codigo, label, id: Number(one(`SELECT u.id_usuarios FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE p.dni='${dni}'`)) }; };
  const activate = (a) => call('/auth/activar-cuenta', { method: 'POST', body: { dni: a.dni, codigo: a.code, username: a.username, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
  const ua = await mk('uia'); await activate(ua);        // activa sin ficha
  const ub = await mk('uib'); await activate(ub);        // activa con ficha
  const uc = await mk('uic');                            // pendiente
  const ud = await mk('uid'); await activate(ud); await call(`/auth/users/${ud.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'Baja UI ' + MARK }, expect: [200] });   // desactivada
  const ue = await mk('uie'); await activate(ue);        // dueña del DNI ocupado
  const provinces = await ok('/catalogs/provinces', { token: dts.token }); let localities;
  for (const prov of provinces) { localities = await ok('/catalogs/localities?provinceId=' + prov.id, { token: dts.token }); if (localities.length >= 2) break; }
  const flight = await ok('/flights/with-patient', { method: 'POST', token: dts.token, body: { patient: { nombre: 'Cuenta', apellido: 'uib' + MARK, dni: ub.dni }, identidadConfirmada: true, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: 'ALTA', motivoVuelo: 'DNI UI usuarios ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Control', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
  const patientB = Number(one(`SELECT id_pacientes FROM vuelos_sanitarios WHERE id_vuelos=${flight.id}`));
  pass('fixtures: cuenta activa sin ficha, cuenta activa con ficha y vuelo, cuenta pendiente, cuenta desactivada y otra cuenta dueña del DNI ocupado');

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const login = async (user, password) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.setDefaultTimeout(30000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(user); await p.getByLabel('Contraseña', { exact: true }).fill(password); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); return p; };
    const page = await login(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD); await page.getByRole('heading', { name: 'Panel de administración' }).waitFor();
    const goUsers = async (tab = 'Usuarios activos') => { await page.locator('nav').getByText('Usuarios', { exact: true }).click(); if (tab !== 'Usuarios activos') await page.getByRole('button', { name: tab, exact: true }).click(); await page.getByRole('heading', { name: tab, exact: true, level: 1 }).first().waitFor(); };
    const detailOf = async (text, tab) => { await goUsers(tab); await page.getByLabel('Buscar usuarios').fill(text); const row = page.locator('table[aria-label^="Usuarios"] tbody tr', { hasText: text }).first(); await row.waitFor(); await row.getByRole('button', { name: 'Detalle' }).click(); const section = page.getByRole('region', { name: /^Detalle de / }); await section.waitFor(); return section; };
    const fillForm = async (form, dni, confirmAccount = true) => { await form.getByLabel('DNI nuevo').fill(dni); await form.getByLabel('Motivo de la rectificación').fill(REASON); await form.getByLabel(/Declaro que cotejé la identidad/).check(); if (confirmAccount) await form.getByLabel(/Confirmo que el cambio de DNI no altera/).check(); };

    // ---------- A: cuenta activa sin ficha: validaciones, DNI ocupado y versión vencida ----------
    let detail = await detailOf(ua.username);
    await detail.getByText(ua.dni).first().waitFor();
    await detail.getByRole('button', { name: 'Rectificar DNI' }).click();
    const form = detail.getByRole('form', { name: 'Rectificación del DNI' }); await form.waitFor();
    await form.getByRole('note').filter({ hasText: /identidad compartida \(cuenta de usuario\)/ }).waitFor();
    const confirm = form.getByRole('button', { name: 'Confirmar rectificación' }); assert.equal(await confirm.isDisabled(), true);
    await form.getByLabel('DNI nuevo').fill('12ab'); await form.getByText(/sólo puede contener/).waitFor();
    await form.getByLabel('DNI nuevo').fill(ua.dni.slice(0, 2) + '.' + ua.dni.slice(2, 5) + '.' + ua.dni.slice(5)); await form.getByText('El DNI nuevo es igual al actual').waitFor();
    await fillForm(form, ue.dni);   // DNI de otra cuenta
    assert.equal(await confirm.isEnabled(), true);
    const takenResponse = page.waitForResponse((r) => r.url().endsWith(`/api/auth/users/${ua.id}/dni`) && r.request().method() === 'PUT');
    await confirm.click(); assert.equal((await takenResponse).status(), 409);
    await form.getByRole('alert').filter({ hasText: /No se fusionan identidades/ }).waitFor();
    assert.equal(dniOf(personOf(ua.id)), ua.dni); assert.equal(dniOf(personOf(ue.id)), ue.dni); assert.equal(await form.getByLabel('DNI nuevo').inputValue(), ue.dni, 'conserva lo escrito');
    // otro administrador cambia la identidad mientras esta pantalla sigue abierta
    await call(`/auth/users/${ua.id}`, { method: 'PUT', token: admin, body: { nombre: 'Cuenta Editada', apellido: 'uia' + MARK, roles: ['DTS'], activo: true } });
    const nA = newDni(); await form.getByLabel('DNI nuevo').fill(nA);
    await confirm.click(); await form.getByRole('alert').filter({ hasText: /vuelva a cargar la ficha/ }).waitFor();
    assert.equal(dniOf(personOf(ua.id)), ua.dni, 'la versión vencida no pisa');
    await form.getByRole('button', { name: 'Volver a cargar la cuenta' }).click();
    await detail.getByText(ua.dni).first().waitFor(); await detail.getByRole('button', { name: 'Rectificar DNI' }).click();
    const before = snapshot(ua.id), personsBefore = count('SELECT COUNT(*) FROM personas'), patientsBefore = count('SELECT COUNT(*) FROM pacientes');
    const form2 = detail.getByRole('form', { name: 'Rectificación del DNI' }); await fillForm(form2, nA.slice(0, 2) + '.' + nA.slice(2, 5) + '.' + nA.slice(5));
    const okResponse = page.waitForResponse((r) => r.url().endsWith(`/api/auth/users/${ua.id}/dni`) && r.request().method() === 'PUT');
    await form2.getByRole('button', { name: 'Confirmar rectificación' }).click(); assert.equal((await okResponse).status(), 200);
    await detail.getByText(nA).first().waitFor(); await page.getByText(/DNI rectificado/).waitFor();
    await detail.getByRole('region', { name: 'Historial administrativo' }).getByText('Rectificación de DNI').first().waitFor();
    assert.equal(dniOf(personOf(ua.id)), nA); assert.equal(snapshot(ua.id), before, 'la cuenta no cambió'); assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore); assert.equal(count('SELECT COUNT(*) FROM pacientes'), patientsBefore);
    await ok('/auth/login', { method: 'POST', body: { username: ua.username, password: PASSWORD } });
    pass('A cuenta activa sin ficha: formulario con validaciones, DNI de otra cuenta = conflicto sin cambios y lo escrito conservado, versión vencida por otro administrador rechazada con "Volver a cargar la cuenta", rectificación con DNI con puntos; se muestra el DNI nuevo y la entrada en el historial administrativo; cuenta, hash y credenciales idénticos en SQL y el ingreso sigue funcionando');

    // ---------- B: cuenta con ficha de paciente ----------
    detail = await detailOf(ub.username); await detail.getByRole('button', { name: 'Rectificar DNI' }).click();
    const formB = detail.getByRole('form', { name: 'Rectificación del DNI' }); await formB.getByRole('note').filter({ hasText: /cuenta de usuario y ficha de paciente/ }).waitFor();
    const nB = newDni(); await fillForm(formB, nB); await formB.getByRole('button', { name: 'Confirmar rectificación' }).click();
    await detail.getByText(nB).first().waitFor();
    assert.equal(dniOf(personOf(ub.id)), nB); assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${personOf(ub.id)}`), 1); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${flight.id} AND id_pacientes=${patientB}`), 1);
    await detail.getByRole('region', { name: 'Historial administrativo' }).getByText('Rectificación de DNI').first().waitFor();
    await page.locator('nav').getByText('Pacientes', { exact: true }).click(); await page.getByRole('heading', { name: 'Identidad de pacientes' }).waitFor();
    await page.getByLabel('DNI exacto').fill(nB); await page.getByRole('button', { name: 'Buscar paciente' }).click(); await page.getByRole('button', { name: 'Revisar ficha' }).click(); await page.getByText('DNI: ' + nB).first().waitFor();
    await page.getByText(/Tiene cuenta de usuario \(activo\)/).waitFor();
    pass('B cuenta con ficha: la rectificación desde Usuarios se ve en la ficha de Pacientes (mismo DNI, con su cuenta), la ficha y el vuelo sanitario se conservan en SQL y el historial de la cuenta muestra la entrada');

    // ---------- C: cuenta pendiente de activación ----------
    detail = await detailOf(uc.dni.slice(0, 8)); await detail.getByText('Pendiente de activación').first().waitFor();
    const beforeC = snapshot(uc.id), codeC = sql(`SELECT token_hash FROM activaciones_cuenta WHERE id_usuarios=${uc.id}`).trim();
    await detail.getByRole('button', { name: 'Rectificar DNI' }).click(); const formC = detail.getByRole('form', { name: 'Rectificación del DNI' });
    await formC.getByRole('note').filter({ hasText: /deberá activarla con el DNI corregido; el código de activación vigente no se regenera/ }).waitFor();
    const nC = newDni(); await fillForm(formC, nC); await formC.getByRole('button', { name: 'Confirmar rectificación' }).click(); await detail.getByText(nC).first().waitFor();
    assert.equal(snapshot(uc.id), beforeC); assert.equal(sql(`SELECT token_hash FROM activaciones_cuenta WHERE id_usuarios=${uc.id}`).trim(), codeC);
    await call('/auth/activar-cuenta', { method: 'POST', body: { dni: uc.dni, codigo: uc.code, username: uc.username, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [404] });
    await call('/auth/activar-cuenta', { method: 'POST', body: { dni: nC, codigo: uc.code, username: uc.username, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
    assert.equal(one(`SELECT estado_cuenta FROM usuarios WHERE id_usuarios=${uc.id}`), 'ACTIVO');
    pass('C cuenta pendiente: la advertencia explica que se activa con el DNI corregido; tras rectificar el código y la cuenta quedan idénticos, el DNI anterior no activa y el corregido, con el mismo código, sí');

    // ---------- D: cuenta desactivada ----------
    detail = await detailOf(ud.username, 'Usuarios desactivados'); const beforeD = snapshot(ud.id);
    await detail.getByRole('button', { name: 'Rectificar DNI' }).click(); const formD = detail.getByRole('form', { name: 'Rectificación del DNI' }); await formD.getByRole('note').filter({ hasText: /cuenta de usuario \(desactivado\)/ }).waitFor();
    const nD = newDni(); await fillForm(formD, nD); await formD.getByRole('button', { name: 'Confirmar rectificación' }).click(); await detail.getByText(nD).first().waitFor();
    assert.equal(dniOf(personOf(ud.id)), nD); assert.equal(snapshot(ud.id), beforeD, 'sigue desactivada'); await detail.getByRole('form', { name: 'Reactivar cuenta' }).waitFor();
    pass('D cuenta desactivada: se rectifica desde la pestaña de desactivadas sin reactivarla ni cambiar su baja, hash o credenciales');

    // ---------- E: otros roles no tienen la acción ----------
    const dtsPage = await login(dts.name, PASSWORD); await dtsPage.getByRole('heading', { name: 'Nueva solicitud DTS' }).waitFor();
    assert.equal(await dtsPage.getByText(/Rectificar DNI|Asignar DNI/).count(), 0); assert.equal(await dtsPage.locator('nav').getByText('Usuarios', { exact: true }).count(), 0);
    pass('E el DTS no tiene acceso a Usuarios ni a ninguna acción de rectificación (el servidor la rechaza con 403, ver e2e-identidad-dni-usuarios)');
  } finally { await browser.close(); }
  console.log(`\nE2E identidad DNI usuarios UI: ${passed} bloques aprobados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
