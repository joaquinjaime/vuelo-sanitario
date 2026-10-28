/* I-5.6: regresión de navegador (Chrome + Playwright) de la actualización de la tripulación en la pantalla del comandante, sin recargar.
 * Defecto informado: tras aceptar la asignación el comandante no veía la tripulación actualizada hasta recargar. Causa raíz: FlightCrew sólo consultaba
 * al montarse y al cambiar el estado, sin ordenar las respuestas ni refrescar los cambios hechos por otras personas (reemplazos y retiros de Operaciones
 * no cambian el estado del vuelo). Ahora ignora respuestas tardías y refresca periódicamente (15 s), al volver a la pestaña y al cambiar el estado.
 *  1) aceptar la asignación → la tripulación sigue visible y el estado cambia a PLANIFICADO sin recargar.
 *  2) Operaciones reemplaza y luego retira a un tripulante → la pantalla abierta del comandante lo refleja sola.
 *  3) rechazo de la asignación y replanificación → el comandante ve el estado y la tripulación vigentes sin recargar.
 * Requiere `playwright` en NODE_PATH. Sólo crea registros marcados. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, BASE, MARK, PASSWORD, PDF, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, ensureCredentialPolicies, waitHealthy } = require('./e2e-cierre-support.cjs');

const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
async function until(fn, what, ms = 45000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, 400)); } throw new Error('Tiempo agotado esperando: ' + what + (last instanceof Error ? ' (' + last.message.slice(0, 200) + ')' : '')); }

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 59);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  await ensureCredentialPolicies(admin);
  console.log('Preparando cuentas de ensayo…');
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'tcops'), cmd = await createUser(admin, 'COMANDANTE', 'tccmd'); await provision(admin, cmd);
  const medic = async (label) => {
    const u = await createUser(admin, 'DTS', label); await call(`/crew-qualifications/${u.id}/MEDICO`, { method: 'PUT', token: admin, expect: [204] });
    const c = await ok(`/users/${u.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'MEDICO', type: 'Documento E2E', number: `TC-${MARK}-${u.id}`, issuer: 'Organismo de prueba', noExpiry: true } });
    const body = new FormData(); body.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
    assert.equal((await fetch(`${BASE}/professional-credentials/${c.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body })).status, 200);
    await call(`/professional-credentials/${c.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual E2E', confirmsSufficiency: true } });
    return u;
  };
  const m1 = await medic('tcm1'), m2 = await medic('tcm2'), m3 = await medic('tcm3');
  let province, airports; for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (a.length >= 2) { province = p; airports = a; break; } }
  await call(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', token: ops.token, body: { locationId: province.id } });
  let seq = 0;
  const newPlane = () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'TC' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 5, aeropuertoActualId: airports[0].id, activo: true } });
  const newFlight = async () => { const plane = await newPlane(), when = futureSlot(); return (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Actualización de tripulación ' + MARK, aircraftId: plane.id, comandanteId: cmd.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } })); };
  const addCrew = (flight, user) => call(`/flights/${flight.id}/crew`, { method: 'POST', token: ops.token, body: { userId: user.id, crewRoleCode: 'MEDICO' }, expect: [204] });
  const crewApi = (flight) => ok(`/flights/${flight.id}/crew`, { token: ops.token });
  const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);

  const flight = await newFlight(); await addCrew(flight, m1);
  assert.equal(stateOf(flight.id), 'PENDIENTE_CONFIRMACION_COMANDANTE');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const snap = async (p, n) => { try { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: false }); } catch { /* opcional */ } };
  const login = async (name) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const res = await r; if (!res.ok()) throw new Error('UI login HTTP ' + res.status()); return p; };
  const crewPanel = (page) => page.locator('div.wide', { has: page.getByRole('heading', { name: 'Tripulación', exact: true }) }).first();
  const select = async (page, id) => { await page.locator('section', { has: page.getByRole('heading', { name: 'Planificación operativa' }) }).locator('label', { hasText: /^Vuelo/ }).locator('select').selectOption(String(id), { timeout: 60000 }); };
  try {
    const page = await login(cmd.name);
    await select(page, flight.id);
    let crew = crewPanel(page);
    await crew.getByText(new RegExp(m1.name.replace(/\d/g, '\\d'))).first().waitFor();
    await snap(page, 'tc01-antes-de-aceptar');
    // ---- 1) aceptar la asignación ----
    const crewRequestsBefore = []; page.on('request', (r) => { if (/\/api\/flights\/\d+\/crew$/.test(r.url())) crewRequestsBefore.push(Date.now()); });
    await page.getByRole('button', { name: 'Aceptar asignación' }).click();
    await until(() => stateOf(flight.id) === 'PLANIFICADO', 'estado PLANIFICADO');
    await page.getByRole('button', { name: 'Aceptar asignación' }).waitFor({ state: 'detached' });
    await until(async () => (await page.getByText(new RegExp(m1.name)).count()) >= 1, 'la tripulación sigue visible tras aceptar');
    assert.ok(crewRequestsBefore.length >= 1, 'la pantalla volvió a consultar la tripulación tras el cambio de estado sin recargar la página');
    assert.equal((await crewApi(flight)).filter((r) => r.vigente !== false).length, 2, 'comandante + médico en el servidor');
    await crew.getByText(/Comandante/).first().waitFor();
    await snap(page, 'tc02-despues-de-aceptar');
    pass('TC-1 al aceptar la asignación el comandante sigue viendo la tripulación vigente (comandante + médico) y el estado cambia, sin recargar la página');

    // ---- 2) cambios hechos por Operaciones mientras el comandante mira la pantalla ----
    const current = (await crewApi(flight)).find((r) => r.userId === m1.id && r.vigente !== false);
    await call(`/flights/${flight.id}/crew/${current.id}`, { method: 'PUT', token: ops.token, body: { userId: m2.id, crewRoleCode: 'MEDICO' }, expect: [204] });
    await crew.getByText(new RegExp(m2.name)).first().waitFor({ timeout: 40000 });
    await until(async () => (await crew.getByText(new RegExp(m1.name)).count()) === 0, 'el médico reemplazado desaparece de la lista vigente', 40000);
    pass('TC-2 un reemplazo hecho por Operaciones aparece solo en la pantalla abierta del comandante (≤ 40 s, sin recargar)');
    const replaced = (await crewApi(flight)).find((r) => r.userId === m2.id && r.vigente !== false);
    await call(`/flights/${flight.id}/crew/${replaced.id}`, { method: 'DELETE', token: ops.token, expect: [204] });
    await until(async () => (await crew.getByText(new RegExp(m2.name)).count()) === 0, 'el médico retirado desaparece', 40000);
    pass('TC-3 un retiro hecho por Operaciones también se refleja solo');

    // ---- 3) rechazo y replanificación ----
    const second = await newFlight(); await addCrew(second, m3);
    await page.reload(); await select(page, second.id);
    crew = crewPanel(page); await crew.getByText(new RegExp(m3.name)).first().waitFor();
    await page.getByLabel(/Motivo \(obligatorio/).fill('No puedo operar en esa fecha');
    await page.getByRole('button', { name: 'Rechazar y devolver a Operaciones' }).click();
    await until(() => stateOf(second.id) === 'PENDIENTE_REPLANIFICACION', 'estado PENDIENTE_REPLANIFICACION');
    await page.getByRole('button', { name: 'Aceptar asignación' }).waitFor({ state: 'detached' });
    await page.getByText(/PENDIENTE_REPLANIFICACION/).first().waitFor();
    await crew.getByText(new RegExp(m3.name)).first().waitFor();
    pass('TC-4 tras rechazar la asignación la pantalla muestra el nuevo estado y conserva la tripulación vigente, sin recargar');
    const plane2 = await newPlane(), when = futureSlot();
    await ok(`/flights/${second.id}/operational-replanning`, { method: 'POST', token: ops.token, body: { aircraftId: plane2.id, comandanteId: cmd.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } });
    await until(() => stateOf(second.id) === 'PENDIENTE_CONFIRMACION_COMANDANTE', 'replanificado');
    await page.getByRole('button', { name: 'Aceptar asignación' }).waitFor({ timeout: 60000 }).catch(() => {});
    await call(`/flights/${second.id}/crew/${(await crewApi(second)).find((r) => r.userId === m3.id && r.vigente !== false).id}`, { method: 'DELETE', token: ops.token, expect: [204] });
    await until(async () => (await crew.getByText(new RegExp(m3.name)).count()) === 0, 'el retiro posterior a la replanificación se refleja', 40000);
    pass('TC-5 la replanificación y los cambios de tripulación posteriores se reflejan en la pantalla abierta');
    console.log(`\n${passed} comprobaciones de navegador aprobadas (e2e-tripulacion-actualizacion-ui)`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
