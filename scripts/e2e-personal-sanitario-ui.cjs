/* E2E de navegador real (Chrome + Playwright) de la simplificación de la tripulación (V66), sobre el stack aislado :18081 / :18080 y SQL Server E2E.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados.
 *  - Administración: ya no existen «Habilitaciones» ni la clasificación administrativa; el alta de un comandante pide licencia y provincia, sin trámites posteriores.
 *  - DTS: sección «Personal sanitario» (alta de médico y enfermero con pocos datos, sin contraseña ni documentos), asignación a su vuelo confirmado y persistencia tras recargar.
 *  - Centro de Operaciones: elige al copiloto entre los usuarios COMANDANTE; ve (sin modificar) el personal sanitario que eligió el DTS.
 *  - Comandante principal: ve el personal sanitario; el copiloto no recibe el vuelo.
 * Uso: node scripts/e2e-personal-sanitario-ui.cjs (E2E_SHOT_DIR opcional guarda capturas) */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, one, count, call, ok, fmt, futureSlot, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');
/** Los apellidos sólo admiten letras: el marcador numérico de la corrida se traduce a letras. */
const TAG = Array.from(MARK.replace(/D/g, '')).map((d) => 'abcdefghij'[Number(d)]).join('').slice(-6);
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 66);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  console.log('Preparando cuentas y catálogos de ensayo…');
  const co = await createUser(admin, 'CENTRO_OPERACIONES', 'pico'), dts = await createUser(admin, 'DTS', 'pidts'), dtsOther = await createUser(admin, 'DTS', 'pidts2');
  const main = await createUser(admin, 'COMANDANTE', 'pimain'), copi = await createUser(admin, 'COMANDANTE', 'picopi');
  const provinces = await ok('/catalogs/provinces', { token: co.token });
  const tuc = provinces.find((p) => p.nombre === 'Tucumán'), cba = provinces.find((p) => p.nombre === 'Córdoba');
  const airportsTuc = await ok('/catalogs/airports?provinceId=' + tuc.id, { token: co.token }), airportsCba = await ok('/catalogs/airports?provinceId=' + cba.id, { token: co.token });
  const matienzo = airportsTuc.find((a) => /MATIENZO/i.test(a.nombre)), taravella = airportsCba.find((a) => /TARAVELLA/i.test(a.nombre)) || airportsCba[0];
  const yerbaBuena = (await ok(`/catalogs/localities?provinceId=${tuc.id}&q=Yerba%20Buena`, { token: co.token }))[0], carlosPaz = (await ok(`/catalogs/localities?provinceId=${cba.id}&q=Villa%20Carlos%20Paz`, { token: co.token }))[0];
  for (const c of [main, copi]) await ok(`/commanders/${c.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: tuc.id, motivo: 'E2E UI' } });
  const plane = await ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'PI').toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 6, aeropuertoActualId: matienzo.id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Personal', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
  const flight = await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: yerbaBuena.id, localidadDestinoId: carlosPaz.id, priorityCode: priority, motivoVuelo: 'UI personal sanitario ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
  await ok(`/flights/${flight.id}/schedule/accept`, { method: 'POST', token: co.token });
  await ok(`/flights/${flight.id}/airports`, { method: 'PUT', token: co.token, body: { origenId: matienzo.id, destinoId: taravella.id } });
  await ok(`/flights/${flight.id}/commander`, { method: 'PUT', token: co.token, body: { comandanteId: main.id } });
  assert.equal((await ok(`/flights/${flight.id}/assigned-aircraft`, { method: 'PUT', token: co.token, body: { aircraftId: plane.id } })).estadoVuelo, 'PLANIFICADO');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (name, password = PASSWORD) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000);
    await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(password);
    const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const res = await r; if (!res.ok()) throw new Error('UI login HTTP ' + res.status());
    return p;
  };
  const snap = async (p, n) => { try { if (shots) await p.screenshot({ path: path.join(shots, n + '.png') }); } catch { /* opcional */ } };
  try {
    // ================= Administración =================
    const adminPage = await login(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD);
    const nav = adminPage.getByRole('navigation', { name: 'Secciones de administración' });
    await nav.getByRole('button', { name: 'Usuarios' }).waitFor();
    assert.equal(await nav.getByRole('button', { name: /Habilitaciones/ }).count(), 0, 'Administración ya no gestiona habilitaciones profesionales');
    await nav.getByRole('button', { name: 'Usuarios' }).click();
    await adminPage.getByRole('heading', { name: 'Usuarios activos' }).first().waitFor();
    await adminPage.waitForTimeout(500);
    assert.equal(await adminPage.getByText(/Clasificación administrativa/).count(), 0, 'no hay clasificación administrativa de tripulación');
    assert.equal(await adminPage.getByText(/política de suficiencia|Habilitación profesional/i).count(), 0);
    await adminPage.getByRole('button', { name: 'Nuevo usuario' }).click();
    const form = adminPage.getByRole('dialog').or(adminPage.locator('.user-create-modal'));
    await form.getByLabel('COMANDANTE').check();
    await form.getByLabel('Número de licencia').waitFor(); await form.getByLabel('Provincia o CABA de ubicación operativa').waitFor();
    assert.match(await form.innerText(), /no hay clasificaciones ni documentos que cargar/);
    assert.equal(await form.getByText(/PDF|documento respaldatorio|organismo emisor/i).count(), 0);
    await snap(adminPage, '1-alta-comandante');
    await form.getByRole('button', { name: 'Cancelar' }).click();
    pass('Administración: sin «Habilitaciones» ni clasificación administrativa; el alta de un comandante pide sólo licencia y provincia/CABA, sin trámites posteriores');

    // ================= DTS: catálogo de personal sanitario =================
    const dtsPage = await login(dts.name);
    await dtsPage.getByRole('button', { name: 'Personal sanitario' }).click();
    await dtsPage.getByRole('heading', { name: 'Médicos y enfermeros' }).waitFor();
    for (const forbidden of [/contraseña/i, /organismo/i, /vencimiento/i, /emisión/i, /PDF/i, /categoría/i]) assert.equal(await dtsPage.getByLabel(forbidden).count(), 0, 'el formulario no pide ' + forbidden);
    const register = async (type, nombre, apellido, dni, matricula) => {
      await dtsPage.getByLabel('Tipo de profesional').selectOption(type); await dtsPage.getByLabel('Nombre', { exact: true }).fill(nombre); await dtsPage.getByLabel('Apellido', { exact: true }).fill(apellido);
      await dtsPage.getByLabel('DNI', { exact: true }).fill(dni); await dtsPage.getByLabel('Matrícula profesional').fill(matricula);
      await dtsPage.getByRole('button', { name: 'Registrar profesional' }).click(); await dtsPage.getByRole('row', { name: new RegExp(matricula) }).waitFor();
    };
    const dniDoc = '34' + String(Date.now()).slice(-6), dniNur = '35' + String(Date.now()).slice(-6);
    const usersBefore = count('SELECT COUNT(*) FROM usuarios');
    await register('MEDICO', 'Juan', 'Pérez' + TAG, dniDoc, 'MPUI-' + MARK.slice(-6));
    await register('ENFERMERO', 'Laura', 'Díaz' + TAG, dniNur, 'MEUI-' + MARK.slice(-6));
    assert.equal(count('SELECT COUNT(*) FROM usuarios'), usersBefore, 'registrar profesionales no crea usuarios');
    assert.equal(count(`SELECT COUNT(*) FROM personal_sanitario s JOIN personas p ON p.id_personas=s.id_personas WHERE p.dni IN ('${dniDoc}','${dniNur}') AND s.id_usuario_dts=${dts.id}`), 2);
    await snap(dtsPage, '2-catalogo-dts');
    await dtsPage.reload(); await dtsPage.getByRole('heading', { name: 'Médicos y enfermeros' }).waitFor();
    await dtsPage.getByRole('row', { name: new RegExp('MPUI-' + MARK.slice(-6)) }).waitFor();
    pass('DTS: registra un médico y un enfermero con nombre, apellido, DNI y matrícula (sin contraseña ni documentos); no se crean usuarios y el catálogo persiste tras recargar');

    // ================= DTS: asignación al vuelo confirmado =================
    await dtsPage.getByRole('button', { name: 'Gestión de vuelos' }).click();
    const mySelect = dtsPage.getByRole('heading', { name: 'Mis solicitudes y contrapropuestas' }).locator('..').locator('select').first();
    await mySelect.selectOption(String(flight.id), { timeout: 90000 });
    const panel = dtsPage.getByRole('region', { name: 'Personal sanitario del vuelo' });
    await panel.waitFor();
    await panel.getByLabel('Profesional').selectOption({ label: new RegExp('Pérez' + TAG) }).catch(async () => { const opt = panel.getByRole('option', { name: new RegExp('Pérez' + TAG) }); await panel.getByLabel('Profesional').selectOption(await opt.getAttribute('value')); });
    await panel.getByRole('button', { name: 'Asignar al vuelo' }).click(); await panel.getByText(new RegExp('Juan Pérez' + TAG)).waitFor();
    await panel.getByLabel('Profesional').selectOption(await panel.getByRole('option', { name: new RegExp('Díaz' + TAG) }).getAttribute('value'));
    await panel.getByRole('button', { name: 'Asignar al vuelo' }).click(); await panel.getByText(new RegExp('Laura Díaz' + TAG)).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_personal_sanitario WHERE id_vuelos=${flight.id} AND fecha_baja IS NULL`), 2);
    await snap(dtsPage, '3-asignacion-dts');
    await dtsPage.reload(); await dtsPage.getByRole('button', { name: 'Gestión de vuelos' }).click();
    await dtsPage.getByRole('heading', { name: 'Mis solicitudes y contrapropuestas' }).locator('..').locator('select').first().selectOption(String(flight.id), { timeout: 90000 });
    await dtsPage.getByRole('region', { name: 'Personal sanitario del vuelo' }).getByText(new RegExp('Juan Pérez' + TAG)).waitFor();
    // otro DTS no ve nada del catálogo ni del vuelo
    const otherPage = await login(dtsOther.name); await otherPage.getByRole('button', { name: 'Personal sanitario' }).click();
    await otherPage.getByText('Todavía no registró personal sanitario.').waitFor(); await otherPage.context().close();
    pass('DTS: elige médico y enfermero de su catálogo para el vuelo confirmado; las asignaciones persisten tras recargar y otro DTS no ve nada ajeno');

    // ================= Centro de Operaciones: copiloto y personal sanitario =================
    const coPage = await login(co.name);
    await coPage.getByRole('button', { name: 'Gestión de vuelos' }).click();
    await coPage.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..').locator('select').first().selectOption(String(flight.id), { timeout: 90000 });
    const resources = coPage.getByRole('group', { name: 'Asignación de recursos' }); await resources.waitFor();
    assert.equal(await resources.getByRole('heading', { name: 'Comandante' }).count(), 1); await resources.getByRole('heading', { name: /Copiloto/ }).waitFor();
    await resources.getByRole('button', { name: 'Seleccionar copiloto' }).click();
    // se elige explícitamente a la persona de la prueba (la licencia lleva el marcador de esta corrida)
    const mine = resources.locator('label.resource-option').filter({ hasText: new RegExp(copi.name, 'i') }).first(); await mine.waitFor();
    await mine.locator('input').check();
    assert.equal(await resources.locator('label.resource-option').filter({ hasText: new RegExp(main.name, 'i') }).count(), 0, 'el comandante principal no se ofrece como copiloto');
    await resources.getByRole('button', { name: 'Confirmar copiloto' }).click();
    await resources.getByText(/rol COMANDANTE/).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes t JOIN roles_tripulacion r ON r.id_roles_tripulacion=t.id_roles_tripulacion WHERE t.id_vuelos=${flight.id} AND t.id_usuarios=${copi.id} AND r.codigo_rol_tripulacion=N'COPILOTO' AND t.fecha_baja IS NULL`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM roles WHERE codigo_rol=N'COPILOTO'`), 0, 'no se crea ningún rol de acceso COPILOTO');
    await snap(coPage, '4-copiloto-co');
    const staff = coPage.getByRole('region', { name: 'Personal sanitario del vuelo' }); await staff.waitFor();
    await staff.getByText(new RegExp('Juan Pérez' + TAG)).waitFor(); await staff.getByText(new RegExp('Laura Díaz' + TAG)).waitFor();
    assert.equal(await staff.getByRole('button').filter({ hasText: /Retirar|Sustituir|Asignar/ }).count(), 0, 'Centro de Operaciones ve el personal sanitario pero no lo modifica');
    pass('Centro de Operaciones: elige al copiloto entre los usuarios COMANDANTE (no figura el principal), queda registrado sin rol ni cuenta nuevos, y ve —sin poder modificarlo— el personal sanitario elegido por el DTS');

    // ================= Comandantes =================
    const mainPage = await login(main.name);
    await mainPage.getByRole('heading', { name: 'Planificación operativa' }).waitFor();
    await mainPage.getByRole('heading', { name: 'Planificación operativa' }).locator('..').locator('select').first().selectOption(String(flight.id), { timeout: 90000 });
    const mainStaff = mainPage.getByRole('region', { name: 'Personal sanitario del vuelo' }); await mainStaff.waitFor();
    await mainStaff.getByText(new RegExp('Juan Pérez' + TAG)).waitFor();
    assert.equal(await mainStaff.getByRole('button').filter({ hasText: /Retirar|Sustituir|Asignar/ }).count(), 0);
    await snap(mainPage, '5-comandante-principal');
    const copiPage = await login(copi.name);
    await copiPage.getByRole('heading', { name: 'Planificación operativa' }).waitFor();
    const copiOptions = await copiPage.getByRole('heading', { name: 'Planificación operativa' }).locator('..').locator('select').first().locator('option').allInnerTexts();
    assert.ok(!copiOptions.some((t) => t.includes('V-')) || copiOptions.length === 1, 'el copiloto no recibe el vuelo como comandante principal: ' + copiOptions.join('|'));
    pass('Comandante principal: ve el personal sanitario del vuelo (sólo lectura); el copiloto, que conserva su rol COMANDANTE, no recibe el vuelo para planificarlo');
    console.log(`\n${passed} comprobaciones superadas (${MARK})`);
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
