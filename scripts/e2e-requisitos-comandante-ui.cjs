/* E2E de navegador real (Chrome + Playwright) de los requisitos del comandante, sobre el stack aislado :18081 / :18080 y SQL Server E2E.
 * Reproduce el caso de un comandante ubicado en Tucumán, sin clasificación administrativa ni habilitación ("Lopez, Maria"):
 *  - Centro de Operaciones lo ve en «En la jurisdicción, pero no disponibles» con cada requisito pendiente, quién lo resuelve y el procedimiento; no puede seleccionarlo.
 *  - Administración lo encuentra en «Comandantes con requisitos pendientes», ve qué falta, lo clasifica desde la pantalla y verifica la habilitación por el procedimiento
 *    existente (Habilitaciones); «Actualizar requisitos» muestra que ya cumple todo.
 *  - Centro de Operaciones recarga, lo selecciona (el aeropuerto de salida sigue sin confirmar) y confirma la asignación; queda persistida en SQL Server.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. Uso: node scripts/e2e-requisitos-comandante-ui.cjs (E2E_SHOT_DIR opcional) */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, BASE, PDF, one, count, call, ok, fmt, createUser, provision, ensureCredentialPolicies, waitHealthy } = require('./e2e-cierre-support.cjs');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const DAY = 86400000; let dayCursor = 7000 + Math.floor(Math.random() * 1500);
const slot = () => { const d = new Date(Date.now() + (dayCursor += 4) * DAY); d.setHours(10, 0, 0, 0); return d; };
const resourcesOf = (id) => one(`SELECT CONCAT(ISNULL(CAST(id_usuario_comandante AS varchar(20)),'-'),'|',ISNULL(CAST(id_aeronaves AS varchar(20)),'-')) FROM vuelos v WHERE id_vuelos=${id}`);

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 65);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  await ensureCredentialPolicies(admin);
  console.log('Preparando cuentas y catálogos de ensayo…');
  const provinces = await ok('/catalogs/provinces', { token: admin }); const tuc = provinces.find((p) => p.nombre === 'Tucumán');
  const airports = await ok('/catalogs/airports?provinceId=' + tuc.id, { token: admin }); const matienzo = airports.find((a) => /MATIENZO/i.test(a.nombre));
  const localities = await ok(`/catalogs/localities?provinceId=${tuc.id}&q=Yerba`, { token: admin }); const origin = localities[0];
  const cba = provinces.find((p) => p.nombre === 'Córdoba'); const destination = (await ok(`/catalogs/localities?provinceId=${cba.id}&q=Carlos`, { token: admin }))[0];
  const co = await createUser(admin, 'CENTRO_OPERACIONES', 'ruco'), dts = await createUser(admin, 'DTS', 'rudts');
  const maria = await createUser(admin, 'COMANDANTE', 'ruMaria');
  await call(`/commanders/${maria.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: tuc.id, motivo: 'E2E UI' } });
  assert.equal(count(`SELECT COUNT(*) FROM clasificaciones_tripulacion WHERE id_usuarios=${maria.id}`), 0);
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Requisitos', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
  const flight = await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: origin.id, localidadDestinoId: destination.id, priorityCode: priority, motivoVuelo: 'UI requisitos ' + MARK, fechaSolicitada: fmt(slot()), extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
  await ok(`/flights/${flight.id}/schedule/accept`, { method: 'POST', token: co.token });
  await call(`/flights/${flight.id}/airports`, { method: 'PUT', token: co.token, body: { origenId: matienzo.id } });

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (name, password = PASSWORD) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000);
    await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(password);
    const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const res = await r; if (!res.ok()) throw new Error('UI login HTTP ' + res.status());
    return p;
  };
  const snap = async (p, n) => { try { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); } catch { /* opcional */ } };
  const openFlight = async (p, id) => { await p.getByRole('button', { name: 'Gestión de vuelos' }).click(); const card = p.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..'); await card.locator('select').first().selectOption(String(id), { timeout: 90000 }); };
  try {
    // ================= CO: el comandante aparece bloqueado con sus requisitos =================
    const opsPage = await login(co.name); await openFlight(opsPage, flight.id);
    let panel = opsPage.getByRole('group', { name: 'Asignación de recursos' }); await panel.waitFor();
    await panel.getByRole('button', { name: 'Seleccionar comandante' }).click();
    const blocked = panel.locator('fieldset.resource-unavailable'); await blocked.waitFor({ timeout: 90000 });
    const item = blocked.locator('.resource-unavailable-item').filter({ hasText: maria.name }).first(); await item.waitFor({ timeout: 90000 });
    const text = await item.innerText();
    assert.match(text, /No tiene registrada la clasificación administrativa/); assert.match(text, /Clasificación administrativa/); assert.match(text, /Habilitación profesional verificada y vigente/);
    assert.match(text, /Lo resuelve: Administración/); assert.match(text, /Clasificación administrativa de tripulación/); assert.match(text, /Habilitaciones/);
    assert.equal(await panel.getByRole('radio', { name: new RegExp(maria.name, 'i') }).count(), 0, 'no se puede seleccionar');
    await snap(opsPage, 'rq01-co-bloqueado');
    pass('CO: el comandante de Tucumán sin clasificación aparece en «En la jurisdicción, pero no disponibles» con la clasificación y la habilitación pendientes, quién las resuelve y el procedimiento; no puede seleccionarlo');

    // ================= Administración: regulariza por el procedimiento legítimo =================
    const adminPage = await login(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: 'Usuarios', exact: true }).click();
    const pendingRegion = adminPage.getByRole('region', { name: 'Comandantes con requisitos pendientes' }); await pendingRegion.waitFor();
    await pendingRegion.getByLabel('Buscar comandante').fill(maria.name);
    const row = pendingRegion.getByRole('row').filter({ hasText: maria.name }); await row.waitFor({ timeout: 60000 });
    assert.match(await row.innerText(), /Tucumán/); assert.match(await row.innerText(), /Clasificación administrativa, Habilitación profesional verificada y vigente/);
    await row.getByRole('button', { name: 'Gestionar ' + maria.name }).click();
    const reqs = adminPage.getByRole('region', { name: 'Requisitos para operar' }); await reqs.getByText('Faltan 2 requisitos para Comandante.').waitFor({ timeout: 60000 });
    await reqs.getByText(/Ubicación operativa: Tucumán/).waitFor(); await snap(adminPage, 'rq02-admin-pendientes');
    await adminPage.getByRole('button', { name: 'Clasificar como Comandante' }).click(); await adminPage.getByText('Clasificación registrada').first().waitFor();
    await reqs.getByText('Faltan 1 requisito para Comandante.').waitFor({ timeout: 60000 });
    assert.equal(count(`SELECT COUNT(*) FROM clasificaciones_tripulacion WHERE id_usuarios=${maria.id} AND fecha_baja IS NULL`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria a JOIN clasificaciones_tripulacion c ON c.id_clasificaciones_tripulacion=a.entidad_id WHERE a.tipo_entidad=N'CREW_QUALIFICATION' AND a.operacion=N'CREATE' AND c.id_usuarios=${maria.id}`), 1);
    // La habilitación se registra y verifica con el procedimiento existente (Habilitaciones); aquí por API para no repetir esa pantalla, ya cubierta por e2e-habilitaciones-ui.
    const credential = await ok(`/users/${maria.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'COMANDANTE', type: 'Documento de prueba', number: 'E2E-' + maria.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
    const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf'); assert.equal((await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form })).status, 200);
    await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
    await reqs.getByRole('button', { name: 'Actualizar requisitos' }).click(); await reqs.getByText('Cumple todos los requisitos para Comandante.').waitFor({ timeout: 60000 }); await snap(adminPage, 'rq03-admin-cumple');
    pass('Administración: encuentra al comandante entre los pendientes, ve qué falta, lo clasifica desde la pantalla (persistido y auditado), la habilitación se verifica por Habilitaciones y «Actualizar requisitos» confirma que cumple todo');

    // ================= CO: ya puede seleccionarlo y asignarlo (aeropuerto de salida aún sin confirmar) =================
    await opsPage.reload(); await openFlight(opsPage, flight.id);
    panel = opsPage.getByRole('group', { name: 'Asignación de recursos' }); await panel.waitFor();
    await panel.getByRole('button', { name: 'Seleccionar comandante' }).click();
    await panel.getByRole('radio', { name: new RegExp(maria.name, 'i') }).check({ timeout: 90000 }); await snap(opsPage, 'rq04-co-elegible');
    await panel.getByRole('button', { name: 'Confirmar comandante' }).click(); await opsPage.getByText('Comandante reservado: falta confirmar la aeronave').waitFor();
    assert.equal(resourcesOf(flight.id), `${maria.id}|-`);
    await panel.getByText(/Preliminar: se verificará al confirmar el aeropuerto de salida/).waitFor();
    await opsPage.reload(); await openFlight(opsPage, flight.id); await opsPage.getByRole('group', { name: 'Asignación de recursos' }).getByText('Reservado — falta la aeronave').waitFor();
    pass('CO: tras la regularización selecciona y confirma al comandante con el aeropuerto de salida sólo propuesto (elegibilidad preliminar); la reserva queda en SQL Server y sobrevive a la recarga');
  } finally { await browser.close(); }
  console.log(`\nE2E de requisitos del comandante en Chrome: ${passed} bloques correctos.`);
})().catch((e) => { console.error('FALLO E2E REQUISITOS UI:', e.stack || e.message); process.exit(1); });
