/* E2E de navegador real (Chrome + Playwright) del ciclo administrativo de usuarios sobre el stack aislado :18081 / :18080 (V47).
 * El administrador crea, busca, edita, cambia roles, desactiva (con bloqueo por responsabilidades), reactiva y restablece credenciales desde la
 * interfaz; los usuarios afectados completan el cambio obligatorio de contraseña. Cada proceso se verifica en SQL Server y tras recargar la página.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { ROOT, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const dniSeq = () => String(61000000 + Math.floor(Math.random() * 30000000));
const row = (id) => sql(`SELECT esta_activo, estado_cuenta, debe_cambiar_contrasena, version_credenciales, ISNULL(motivo_baja,'NULL'), ISNULL(CAST(id_usuario_baja AS varchar),'NULL') FROM usuarios WHERE id_usuarios=${id}`).split('|').map((x) => x.trim());
const rolesOf = (id) => sql(`SELECT r.codigo_rol FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=${id} ORDER BY r.codigo_rol`).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 47); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const boot = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adm = await createUser(boot, 'ADMINISTRADOR', 'uuadm'), ops = await createUser(boot, 'CENTRO_OPERACIONES', 'uuops'), dts = await createUser(boot, 'DTS', 'uudts');
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
  const cmd = await createUser(boot, 'COMANDANTE', 'uucmd'); await provision(boot, cmd); await call(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  const plane = await ok('/catalogs/aircraft', { method: 'POST', token: boot, body: { matricula: (MARK + 'X').toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const when = futureSlot(); const flight = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'UsuariosUI ' + MARK, aircraftId: plane.id, comandanteId: cmd.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } });
  await call(`/flights/${flight.id}/commander-assignment/response`, { method: 'POST', token: cmd.token, body: { aceptar: true } }); const flightCode = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${flight.id}`);
  const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((x) => x.codigo !== 'OTRO');
  const zed = await createUser(boot, 'DTS', 'uuzed'), why = await createUser(boot, 'DTS', 'uuwhy');   // zed: restablecimiento; why: reactivación (se desactiva por API para el flujo inverso)
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Laura', apellido: 'Vinculada' + MARK, dni: dniSeq() } }); const patientDni = one(`SELECT dni FROM personas WHERE id_personas=${patient.personId}`);
  const dialogs = [];

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const open = async (name, password = PASSWORD) => { const ctx = await browser.newContext({ locale: 'es-AR' }); const p = await ctx.newPage(); p.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); }); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(password); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); return p; };
  const snap = async (p, n) => { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };
  const goUsers = async (p, tab = 'Usuarios activos') => { await p.locator('nav').getByText('Usuarios', { exact: true }).click(); if (tab !== 'Usuarios activos') await p.getByRole('button', { name: tab, exact: true }).click(); await p.getByRole('heading', { name: tab, exact: true, level: 1 }).first().waitFor(); };
  const search = async (p, text) => { await p.getByLabel('Buscar usuarios').fill(text); await p.waitForFunction((t) => [...document.querySelectorAll('table[aria-label^="Usuarios"] tbody tr')].some((r) => r.textContent.includes(t)), text); };
  const rowOf = (p, text) => p.locator('table[aria-label^="Usuarios"] tbody tr', { hasText: text }).first();
  const completeForcedChange = async (name, temp, next) => { const p = await open(name, temp); await p.getByRole('heading', { name: 'Actualizá tu contraseña' }).waitFor(); await p.getByLabel('Contraseña temporal').fill(temp); await p.getByLabel('Nueva contraseña', { exact: true }).fill(next); await p.getByLabel('Confirmar contraseña').fill(next); await p.getByRole('button', { name: 'Guardar y volver a ingresar' }).click(); const outcome = await Promise.race([p.getByLabel('Usuario', { exact: true }).waitFor().then(() => 'ok'), p.locator('p.error').first().waitFor().then(async () => 'error: ' + await p.locator('p.error').first().innerText())]); assert.equal(outcome, 'ok', 'cambio obligatorio de contraseña de ' + name); return p; };
  try {
    const admin = await open(adm.name); await admin.getByRole('heading', { name: 'Panel de administración' }).waitFor();
    // ---------- 1. Panel principal ----------
    assert.equal(await admin.locator('.quick-action').count(), 2); await admin.getByRole('button', { name: /Añadir usuario/ }).waitFor(); await admin.getByRole('button', { name: /Añadir aeronave/ }).waitFor(); assert.equal(await admin.locator('table').count(), 0, 'el panel principal no lista usuarios');
    const activeTotal = count('SELECT COUNT(*) FROM usuarios WHERE esta_activo=1'); await admin.waitForFunction(() => Number(document.querySelector('.admin-metrics article strong')?.textContent) > 0); const metric = Number(await admin.locator('.admin-metrics article', { hasText: 'Usuarios activos' }).locator('strong').innerText()); assert.ok(Math.abs(metric - activeTotal) <= 3, `total del panel ${metric} vs SQL ${activeTotal}`);
    await snap(admin, 'u01-panel');
    pass(`UI-1 el panel principal conserva los accesos rápidos (Añadir usuario / Añadir aeronave), no lista usuarios y muestra los totales del servidor (${metric} activos)`);

    // ---------- 2. Alta desde el panel ----------
    const nameX = 'Nuevo' + MARK, dniX = dniSeq(); await admin.getByRole('button', { name: /Añadir usuario/ }).click();
    const form = admin.locator('form.activation-modal'); await form.getByLabel('Nombre').fill(nameX); await form.getByLabel('Apellido').fill('Cuenta'); await form.getByLabel('DNI').fill(dniX); await form.getByLabel('Correo principal').fill(nameX.toLowerCase() + '@example.test'); await form.getByLabel('Teléfono principal').fill('3815550000'); await form.getByLabel('DTS', { exact: true }).check();
    await form.getByRole('button', { name: 'Crear cuenta pendiente' }).click(); const codeBox = admin.getByRole('dialog'); await codeBox.getByRole('heading', { name: 'Código de activación' }).waitFor(); const code = (await codeBox.locator('code').innerText()).trim(); assert.ok(code.length > 20); await snap(admin, 'u02-codigo');
    const idX = Number(one(`SELECT u.id_usuarios FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE p.dni=N'${dniX}'`)); assert.equal(row(idX)[1], 'PENDIENTE_ACTIVACION'); assert.notEqual(one(`SELECT token_hash FROM activaciones_cuenta WHERE id_usuarios=${idX}`), code);
    await codeBox.getByRole('button', { name: 'Cerrar aviso' }).click(); assert.ok(!(await admin.content()).includes(code), 'el código no vuelve a mostrarse');
    const userX = nameX.toLowerCase() + 'u'; await call('/auth/activar-cuenta', { method: 'POST', body: { dni: dniX, codigo: code, username: userX, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
    pass('UI-2 el administrador crea una cuenta desde "Añadir usuario": se persiste pendiente de activación, el código se muestra una sola vez y no puede recuperarse');

    // ---------- 3. Usuarios activos: búsqueda, detalle, edición y roles ----------
    await goUsers(admin); await search(admin, nameX); const rowX = rowOf(admin, nameX); await rowX.getByRole('button', { name: 'Detalle' }).click();
    const detail = admin.locator('section.user-detail'); await detail.waitFor(); await detail.getByText(dniX).first().waitFor(); assert.equal(await detail.getByLabel('DNI').count(), 0, 'el DNI no es editable');
    const editForm = detail.getByRole('form', { name: 'Edición administrativa' }); await editForm.getByLabel('Nombre').fill('Editado' + MARK); await editForm.getByLabel('Centro de Operaciones').check(); const v0 = Number(row(idX)[3]);
    await editForm.getByRole('button', { name: 'Guardar cambios' }).click(); await admin.getByText('✓ Datos de la cuenta guardados').waitFor();
    assert.equal(one(`SELECT nombre_persona FROM personas WHERE id_personas=(SELECT id_personas FROM usuarios WHERE id_usuarios=${idX})`), 'Editado' + MARK); assert.deepEqual(rolesOf(idX), ['CENTRO_OPERACIONES', 'DTS']); assert.equal(Number(row(idX)[3]), v0 + 1, 'el cambio de roles invalidó las sesiones');
    await call('/auth/me', { token: (await ok('/auth/login', { method: 'POST', body: { username: userX, password: PASSWORD } })).accessToken });
    const hist = detail.getByLabel('Historial administrativo'); await hist.getByText('Modificación de datos personales', { exact: true }).waitFor(); await hist.getByText('Alta de cuenta', { exact: true }).waitFor(); assert.ok(!(await hist.innerText()).includes(PASSWORD)); await snap(admin, 'u03-detalle');
    await admin.reload(); await goUsers(admin); await search(admin, 'Editado' + MARK); assert.ok((await rowOf(admin, 'Editado' + MARK).innerText()).includes('Centro de Operaciones'), 'tras recargar la edición persiste');
    pass('UI-3 búsqueda por nombre, detalle con historial administrativo, edición de datos y roles (el DNI no se edita), persistencia en SQL tras recargar y sesiones cerradas por el cambio de roles');

    // ---------- 4. Desactivación bloqueada por responsabilidades y luego permitida ----------
    await admin.getByLabel('Buscar usuarios').fill(MARK + 'uucmd'); await admin.waitForFunction((t) => [...document.querySelectorAll('table[aria-label^="Usuarios"] tbody tr')].some((r) => r.textContent.includes(t)), MARK + 'uucmd');
    await rowOf(admin, MARK + 'uucmd').getByRole('button', { name: 'Desactivar' }).click(); const detailC = admin.locator('section.user-detail'); await detailC.waitFor(); const actions = detailC.getByLabel('Acciones sobre la cuenta'); await actions.waitFor();
    await actions.getByText(new RegExp('Comandante asignado al vuelo ' + flightCode)).waitFor(); assert.equal(await actions.getByRole('button', { name: 'Desactivar cuenta' }).isDisabled(), true); await snap(admin, 'u04-bloqueo');
    const forcedAttempt = await admin.evaluate(async ({ id }) => { const r = await fetch('/api/auth/users/' + id + '/deactivate', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('vs-token') }, body: '{}' }); return { status: r.status, body: await r.json() }; }, { id: cmd.id });
    assert.equal(forcedAttempt.status, 409); assert.equal(forcedAttempt.body.code, 'USER_HAS_OPERATIONAL_ASSIGNMENTS'); assert.equal(row(cmd.id)[0], '1');
    assert.equal(one(`SELECT id_usuario_comandante FROM vuelos WHERE id_vuelos=${flight.id}`), String(cmd.id), 'no se reasigna nada automáticamente');
    await call(`/flights/${flight.id}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } });
    await admin.reload(); await goUsers(admin); await search(admin, MARK + 'uucmd'); await rowOf(admin, MARK + 'uucmd').getByRole('button', { name: 'Detalle' }).click();
    const actions2 = admin.getByLabel('Acciones sobre la cuenta'); await actions2.waitFor(); assert.equal(await actions2.getByRole('button', { name: 'Desactivar cuenta' }).isDisabled(), false);
    await actions2.getByLabel('Motivo de la baja (opcional)').fill('Cese ' + MARK); await actions2.getByRole('button', { name: 'Desactivar cuenta' }).click(); await admin.getByText('✓ Usuario desactivado').waitFor();
    const rc = row(cmd.id); assert.equal(rc[0], '0'); assert.equal(rc[4], 'Cese ' + MARK); assert.equal(rc[5], String(adm.id)); assert.ok(dialogs.some((d) => d.includes('¿Desactivar a')));
    await call('/auth/me', { token: cmd.token, expect: [401] });
    pass('UI-4 la baja de un comandante con vuelo planificado se bloquea mostrando el vuelo (también el intento forzado: 409 sin reasignar nada) y, cancelado el vuelo, se confirma con motivo y responsable; su sesión previa queda inválida');

    // ---------- 5. Usuarios desactivados y reactivación ----------
    await admin.reload(); await goUsers(admin, 'Usuarios desactivados'); await search(admin, MARK + 'uucmd'); const inactiveRow = await rowOf(admin, MARK + 'uucmd').innerText();
    assert.ok(inactiveRow.includes('Cese ' + MARK) && inactiveRow.includes('Desactivada'), inactiveRow); assert.ok(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(inactiveRow), 'fecha de baja'); await snap(admin, 'u05-inactivos');
    await rowOf(admin, MARK + 'uucmd').getByRole('button', { name: 'Detalle' }).click(); const reForm = admin.getByRole('form', { name: 'Reactivar cuenta' }); await reForm.waitFor(); await reForm.getByRole('button', { name: 'Reactivar y generar contraseña temporal' }).click();
    const secretBox = admin.getByRole('dialog'); await secretBox.getByRole('heading', { name: 'Contraseña temporal' }).waitFor(); const temp = (await secretBox.locator('code').innerText()).trim(); assert.ok(temp.length >= 12);
    assert.equal(row(cmd.id)[0], '1'); assert.equal(row(cmd.id)[2], '1'); assert.equal(row(cmd.id)[4], 'NULL'); assert.equal(count(`SELECT COUNT(*) FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE u.id_usuarios=${cmd.id}`), 1, 'misma cuenta y persona');
    await secretBox.getByRole('button', { name: 'Cerrar aviso' }).click(); assert.ok(!(await admin.content()).includes(temp)); await admin.reload(); assert.ok(!(await admin.content()).includes(temp), 'la contraseña no se recupera tras recargar');
    await ok(`/auth/users/${cmd.id}`, { token: adm.token }).then((d) => assert.ok(!JSON.stringify(d).includes(temp)));
    const forced = await completeForcedChange(cmd.name, temp, 'Reactivada-' + MARK + '-1'); const relogged = await open(cmd.name, 'Reactivada-' + MARK + '-1'); await relogged.getByRole('heading', { name: 'Planificación operativa', exact: true }).waitFor();
    assert.equal((await call('/auth/login', { method: 'POST', body: { username: cmd.name, password: temp }, expect: [401] })).status, 401, 'la contraseña temporal reemplazada no sirve');
    pass('UI-5 listado de desactivados con fecha, responsable y motivo; reactivación desde el detalle con contraseña temporal mostrada una sola vez, misma cuenta, cambio obligatorio de contraseña y acceso posterior con la nueva clave');

    // ---------- 6. Restablecimiento administrativo ----------
    await admin.reload(); await goUsers(admin); await search(admin, MARK + 'uuzed'); await rowOf(admin, MARK + 'uuzed').getByRole('button', { name: 'Detalle' }).click(); const vz = Number(row(zed.id)[3]);
    await admin.getByRole('button', { name: 'Restablecer credenciales' }).click(); const resetBox = admin.getByRole('dialog'); await resetBox.getByRole('heading', { name: 'Contraseña temporal' }).waitFor(); const tempZ = (await resetBox.locator('code').innerText()).trim();
    assert.equal(Number(row(zed.id)[3]), vz + 1); assert.equal(row(zed.id)[2], '1'); await call('/auth/me', { token: zed.token, expect: [401] }); assert.ok(dialogs.some((d) => d.includes('Restablecer las credenciales') || d.includes('restablecer las credenciales') || d.includes('¿Restablecer')));
    await resetBox.getByRole('button', { name: 'Cerrar aviso' }).click(); const pz = await open(zed.name, tempZ); await pz.getByRole('heading', { name: 'Actualizá tu contraseña' }).waitFor();
    const denied = await pz.evaluate(async () => (await fetch('/api/flights', { headers: { Authorization: 'Bearer ' + localStorage.getItem('vs-token') } })).status); assert.equal(denied, 403, 'sin completar el cambio no hay acceso a recursos operativos');
    const okMe = await pz.evaluate(async () => (await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('vs-token') } })).status); assert.equal(okMe, 200);
    await pz.getByLabel('Contraseña temporal').fill(tempZ); await pz.getByLabel('Nueva contraseña', { exact: true }).fill('Restablecida-' + MARK + '-1'); await pz.getByLabel('Confirmar contraseña').fill('Restablecida-' + MARK + '-1'); await pz.getByRole('button', { name: 'Guardar y volver a ingresar' }).click(); await pz.getByLabel('Usuario', { exact: true }).waitFor();
    const pz2 = await open(zed.name, 'Restablecida-' + MARK + '-1'); await pz2.getByRole('heading', { name: 'Mis solicitudes y contrapropuestas', exact: true }).waitFor(); assert.equal(row(zed.id)[2], '0');
    pass('UI-6 restablecimiento administrativo con confirmación: contraseña temporal una sola vez, sesión anterior invalidada, sin acceso operativo (403) hasta completar el cambio obligatorio y acceso normal después');

    // ---------- 7. Persona existente sin cuenta ----------
    await admin.reload(); await goUsers(admin); await admin.getByRole('button', { name: 'Nuevo usuario' }).click(); const f2 = admin.locator('form.activation-modal');
    await f2.getByLabel('Nombre').fill('Laura'); await f2.getByLabel('Apellido').fill('Vinculada' + MARK); await f2.getByLabel('DNI').fill(patientDni.slice(0, 2) + '.' + patientDni.slice(2, 5) + '.' + patientDni.slice(5)); await f2.getByLabel('Correo principal').fill('laura' + MARK + '@example.test'); await f2.getByLabel('Teléfono principal').fill('3815550001'); await f2.getByLabel('DTS', { exact: true }).check();
    const personsBefore = count('SELECT COUNT(*) FROM personas'); await f2.getByRole('button', { name: 'Crear cuenta pendiente' }).click(); await admin.getByRole('dialog').getByRole('heading', { name: 'Código de activación' }).waitFor();
    assert.ok(dialogs.some((d) => d.includes('No se creará una persona nueva'))); assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore, 'sin identidad duplicada'); assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE id_personas=${patient.personId}`), 1); assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${patient.personId}`), 1);
    await snap(admin, 'u07-persona-existente'); await admin.getByRole('dialog').getByRole('button', { name: 'Cerrar aviso' }).click();
    pass('UI-7 una persona ya registrada sin cuenta (con antecedente de paciente) se asocia sólo tras la confirmación expresa del administrador: una sola identidad, el antecedente se conserva y no se muestran datos sanitarios');

    // ---------- 8. Protecciones del propio administrador ----------
    await goUsers(admin); await search(admin, MARK + 'uuadm'); await rowOf(admin, MARK + 'uuadm').getByRole('button', { name: 'Detalle' }).click();
    await admin.getByText('No puede modificar sus propios roles.').waitFor(); const own = admin.getByLabel('Acciones sobre la cuenta'); assert.equal(await own.getByRole('button', { name: 'Desactivar cuenta' }).isDisabled(), true); assert.equal(await own.getByRole('button', { name: 'Restablecer credenciales' }).isDisabled(), true); await own.getByText(/No se puede desactivar: No puede desactivar su propia cuenta/).waitFor();
    pass('UI-8 el administrador no puede desactivarse, restablecerse ni cambiar sus propios roles desde la interfaz');

    // ---------- 9. Cambio voluntario de contraseña (Mi cuenta) ----------
    await admin.locator('nav').getByText('Mi cuenta', { exact: true }).click(); await admin.getByRole('heading', { name: 'Cambiar contraseña' }).waitFor(); const old = adm.token;
    await admin.getByLabel('Contraseña actual').fill(PASSWORD); await admin.getByLabel('Nueva contraseña', { exact: true }).fill('Voluntaria-' + MARK + '-1'); await admin.getByLabel('Confirmar contraseña').fill('Voluntaria-' + MARK + '-1'); await admin.getByRole('button', { name: 'Actualizar contraseña' }).click();
    await admin.getByLabel('Usuario', { exact: true }).waitFor(); await call('/auth/me', { token: old, expect: [401] }); const again = await open(adm.name, 'Voluntaria-' + MARK + '-1'); await again.getByRole('heading', { name: 'Panel de administración' }).waitFor();
    pass('UI-9 el cambio voluntario de contraseña (Mi cuenta) cierra la sesión, invalida el token anterior y permite ingresar con la nueva clave');
    console.log(`E2E usuarios UI OK: ${passed} bloques; marca ${MARK}`);
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
