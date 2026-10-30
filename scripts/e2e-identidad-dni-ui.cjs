/* E2E de navegador real (Chrome + Playwright) de la rectificación controlada del DNI sobre el stack aislado :18081 / :18080 (base vuelos_sanitarios_e2e).
 * El administrador trabaja desde "Pacientes > Identidad de pacientes"; cada paso se verifica en SQL Server. Sólo crea datos marcados.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, BASE, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const REASON = 'Documento cotejado por administración ' + MARK;

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 48); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const dts = await createUser(admin, 'DTS', 'dniuidts');
  const used = new Set(); const newDni = () => { for (;;) { const d = String(60000000 + Math.floor(Math.random() * 30000000)); if (!used.has(d) && count(`SELECT COUNT(*) FROM personas WHERE dni='${d}'`) === 0) { used.add(d); return d; } } };
  const personDni = (id) => one(`SELECT ISNULL(dni,'NULL') FROM personas WHERE id_personas=${id}`), personVersion = (id) => Number(one(`SELECT version_identidad FROM personas WHERE id_personas=${id}`));
  const dniA = newDni(), dniB = newDni();
  const pa = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Lucía', apellido: 'Rectifica' + MARK, dni: dniA, fechaNacimiento: '1988-07-08' } });
  const pb = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Otra', apellido: 'Persona' + MARK, dni: dniB } });
  const provinces = await ok('/catalogs/provinces', { token: dts.token }); let localities;
  for (const prov of provinces) { localities = await ok('/catalogs/localities?provinceId=' + prov.id, { token: dts.token }); if (localities.length >= 2) break; }
  const flight = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: pa.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo, motivoVuelo: 'DNI UI ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Control', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  // paciente con cuenta activa
  const dniAcc = newDni(), accUser = MARK + 'dniuiacc';
  const code = await ok('/auth/users', { method: 'POST', token: admin, body: { nombre: 'Cuenta', apellido: 'Paciente' + MARK, dni: dniAcc, roles: ['DTS'], correos: [{ direccion: accUser + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551236' }] } });
  await call('/auth/activar-cuenta', { method: 'POST', body: { dni: dniAcc, codigo: code.codigo, username: accUser, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
  const fAcc = await ok('/flights/with-patient', { method: 'POST', token: dts.token, body: { patient: { nombre: 'Cuenta', apellido: 'Paciente' + MARK, dni: dniAcc }, identidadConfirmada: true, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: 'ALTA', motivoVuelo: 'DNI UI cuenta ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Control', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
  const accPatient = Number(one(`SELECT id_pacientes FROM vuelos_sanitarios WHERE id_vuelos=${fAcc.id}`)), accPerson = Number(one(`SELECT id_personas FROM personas WHERE dni='${dniAcc}'`));
  const accSnapshot = () => sql(`SELECT CONCAT(nombre_usuario,'|',hash_contrasena,'|',estado_cuenta,'|',CAST(esta_activo AS varchar),'|',CAST(version_credenciales AS varchar)) FROM usuarios WHERE id_personas=${accPerson}`).trim();
  const accBefore = accSnapshot();
  pass('fixtures: paciente sin cuenta con vuelo, otro paciente con DNI distinto y paciente con cuenta activa (vuelo sanitario)');

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const login = async (user, password) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.setDefaultTimeout(30000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(user); await p.getByLabel('Contraseña', { exact: true }).fill(password); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); return p; };
    const openFicha = async (p, dni) => { await p.getByLabel('DNI exacto').fill(dni); await p.getByRole('button', { name: 'Buscar paciente' }).click(); await p.getByRole('button', { name: 'Revisar ficha' }).click(); await p.getByText('DNI: ' + dni).first().waitFor(); };
    const page = await login(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD);
    await page.getByRole('heading', { name: 'Panel de administración' }).waitFor(); await page.locator('nav').getByText('Pacientes', { exact: true }).click();
    await page.getByRole('heading', { name: 'Identidad de pacientes' }).waitFor();

    // ---------- A: formulario, validaciones y DNI ocupado ----------
    await openFicha(page, dniA);
    await page.getByRole('button', { name: 'Rectificar DNI' }).click();
    const form = page.getByRole('form', { name: 'Rectificación del DNI' }); await form.waitFor();
    await form.getByRole('note').filter({ hasText: /nunca fusiona identidades/ }).waitFor();
    const confirm = form.getByRole('button', { name: 'Confirmar rectificación' });
    assert.equal(await confirm.isDisabled(), true, 'sin datos no se confirma');
    await form.getByLabel('DNI nuevo').fill('12ab'); await form.getByText(/sólo puede contener/).waitFor();
    await form.getByLabel('DNI nuevo').fill('123'); await form.getByText(/entre 7 y 12/).waitFor();
    await form.getByLabel('DNI nuevo').fill(dniA.slice(0, 2) + '.' + dniA.slice(2, 5) + '.' + dniA.slice(5)); await form.getByText('El DNI nuevo es igual al actual').waitFor();
    await form.getByLabel('Motivo de la rectificación').fill(REASON); await form.getByLabel(/Declaro que cotejé la identidad/).check();
    assert.equal(await confirm.isDisabled(), true, 'el DNI igual al actual no se confirma');
    await form.getByLabel('DNI nuevo').fill(dniB);   // pertenece a otra persona
    assert.equal(await confirm.isEnabled(), true);
    const takenResponse = page.waitForResponse((r) => r.url().endsWith(`/api/patients/${pa.id}/dni`) && r.request().method() === 'PUT');
    await confirm.click(); assert.equal((await takenResponse).status(), 409);
    await form.getByRole('alert').filter({ hasText: /No se fusionan identidades/ }).waitFor();
    assert.equal(personDni(pa.personId), dniA); assert.equal(personDni(pb.personId), dniB); assert.equal(await form.getByLabel('DNI nuevo').inputValue(), dniB, 'el formulario conserva lo escrito');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'PATIENT_IDENTITY' AND entidad_id IN (${pa.id},${pb.id}) AND operacion LIKE N'%_DNI'`), 0);
    pass('A formulario: el botón sólo se habilita con DNI válido y distinto del actual, motivo y cotejo declarado; un DNI de otra persona produce el conflicto "no se fusionan identidades" sin cambiar ninguna identidad ni auditar y el formulario conserva lo escrito');

    // ---------- B: rectificación exitosa y conflicto de versión ----------
    const personsBefore = count('SELECT COUNT(*) FROM personas'), patientsBefore = count('SELECT COUNT(*) FROM pacientes'), v0 = personVersion(pa.personId);
    // otro administrador corrige el nombre mientras esta pantalla sigue abierta: la versión de la pantalla queda vencida
    await call(`/patients/${pa.id}/identity`, { method: 'PUT', token: admin, body: { nombre: 'Lucía Corregida', apellido: 'Rectifica' + MARK, fechaNacimiento: '1988-07-08', version: v0, motivo: 'Corrección simultánea de otro administrador' } });
    const newA = newDni(); await form.getByLabel('DNI nuevo').fill(newA);
    await confirm.click(); await form.getByRole('alert').filter({ hasText: /vuelva a cargar la ficha/ }).waitFor();
    assert.equal(personDni(pa.personId), dniA, 'la versión vencida no pisa');
    await form.getByRole('button', { name: 'Volver a cargar la ficha' }).click(); await page.getByText('DNI: ' + dniA).first().waitFor();
    await page.getByRole('button', { name: 'Rectificar DNI' }).click();
    const form2 = page.getByRole('form', { name: 'Rectificación del DNI' });
    await form2.getByLabel('DNI nuevo').fill(newA.slice(0, 2) + '.' + newA.slice(2, 5) + '.' + newA.slice(5)); await form2.getByLabel('Motivo de la rectificación').fill(REASON); await form2.getByLabel(/Declaro que cotejé la identidad/).check();
    const okResponse = page.waitForResponse((r) => r.url().endsWith(`/api/patients/${pa.id}/dni`) && r.request().method() === 'PUT');
    await form2.getByRole('button', { name: 'Confirmar rectificación' }).click(); assert.equal((await okResponse).status(), 200);
    await page.getByText('DNI: ' + newA).first().waitFor(); await page.getByText(/DNI rectificado/).waitFor();
    await page.getByText(new RegExp(`Rectificación de DNI · ${REASON}`)).waitFor(); await page.getByText(`dni: ••••${dniA.slice(-4)} → ••••${newA.slice(-4)}`).waitFor();
    assert.equal(personDni(pa.personId), newA); assert.equal(personVersion(pa.personId), v0 + 2, 'una corrección de nombre y una rectificación');
    assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore); assert.equal(count('SELECT COUNT(*) FROM pacientes'), patientsBefore);
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${flight} AND id_pacientes=${pa.id}`), 1, 'el vuelo conserva su ficha');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'PATIENT_IDENTITY' AND entidad_id=${pa.id} AND operacion=N'RECTIFY_DNI'`), 1);
    await page.reload(); await page.locator('nav').getByText('Pacientes', { exact: true }).click(); await openFicha(page, newA);
    pass('B rectificación: con la pantalla desactualizada el servidor rechaza (versión vencida) sin pisar el cambio del otro administrador; tras recargar se rectifica con el DNI escrito con puntos, se muestra el DNI nuevo y el historial enmascarado, la persona, la ficha y el vuelo se conservan en SQL y el cambio persiste al recargar');

    // ---------- C: persona con cuenta ----------
    await page.reload(); await page.locator('nav').getByText('Pacientes', { exact: true }).click(); await openFicha(page, dniAcc);
    await page.getByText(/Tiene cuenta de usuario \(activo\)/).waitFor();
    await page.getByRole('button', { name: 'Rectificar DNI' }).click(); const form3 = page.getByRole('form', { name: 'Rectificación del DNI' });
    await form3.getByRole('note').filter({ hasText: /no modifica su contraseña, roles, estado ni sesiones/ }).waitFor();
    const newAcc = newDni(); await form3.getByLabel('DNI nuevo').fill(newAcc); await form3.getByLabel('Motivo de la rectificación').fill(REASON); await form3.getByLabel(/Declaro que cotejé la identidad/).check();
    const confirm3 = form3.getByRole('button', { name: 'Confirmar rectificación' }); assert.equal(await confirm3.isDisabled(), true, 'falta confirmar la cuenta');
    await form3.getByLabel(/Confirmo que el cambio de DNI no altera/).check(); assert.equal(await confirm3.isEnabled(), true);
    const accResponse = page.waitForResponse((r) => r.url().endsWith(`/api/patients/${accPatient}/dni`) && r.request().method() === 'PUT');
    await confirm3.click(); assert.equal((await accResponse).status(), 200);
    await page.getByText('DNI: ' + newAcc).first().waitFor();
    assert.equal(personDni(accPerson), newAcc); assert.equal(accSnapshot(), accBefore, 'usuario, contraseña, estado y credenciales intactos');
    await ok('/auth/login', { method: 'POST', body: { username: accUser, password: PASSWORD } });
    pass('C cuenta: se advierte la relación con la cuenta y se exige confirmarla; tras rectificar, el usuario, su hash, su estado y su versión de credenciales son idénticos en SQL y el ingreso con las mismas credenciales sigue funcionando');

    // ---------- D: otros roles no tienen la acción ----------
    const dtsPage = await login(dts.name, PASSWORD); await dtsPage.getByRole('heading', { name: 'Nueva solicitud DTS' }).waitFor();
    await dtsPage.getByLabel('Paciente').first().selectOption('search'); await dtsPage.getByLabel('DNI exacto').fill(newA); await dtsPage.getByRole('button', { name: 'Buscar paciente' }).click(); await dtsPage.getByText('DNI ••••' + newA.slice(-4)).waitFor();
    assert.equal(await dtsPage.getByText(/Rectificar DNI|Asignar DNI/).count(), 0, 'el DTS no tiene la acción'); assert.equal(await dtsPage.getByText('Identidad de pacientes').count(), 0);
    pass('D el DTS busca y selecciona pacientes pero no ve ninguna acción de rectificación (y el servidor la rechaza con 403, ver e2e-identidad-dni)');
  } finally { await browser.close(); }
  console.log(`\nE2E identidad DNI UI: ${passed} bloques aprobados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
