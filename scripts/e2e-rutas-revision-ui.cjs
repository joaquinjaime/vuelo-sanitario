/* E2E de navegador real (Chrome + Playwright) de la revisión operativa de rutas (I-4) sobre el stack aislado :18081 / :18080
 * (base vuelos_sanitarios_e2e). Recorre, para un vuelo operativo y para uno sanitario, el ciclo completo con las pantallas existentes:
 * el comandante crea y presenta la ruta, Operaciones la devuelve desde su cola de pendientes, el comandante la corrige y la vuelve a
 * presentar, Operaciones la aprueba, se consulta el historial, un cambio relevante (aeronave) la invalida, el inicio queda bloqueado
 * con el motivo en pantalla, se regulariza y el vuelo inicia. Sólo crea datos marcados.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, MARK, sql, one, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, PASSWORD } = require('./e2e-cierre-support.cjs');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const routeState = (id) => one(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${id} AND es_version_actual=1`);

(async () => {
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'uops'), dts = await createUser(admin, 'DTS', 'udts');
  const cmdO = await createUser(admin, 'COMANDANTE', 'ucmdo'), cmdS = await createUser(admin, 'COMANDANTE', 'ucmds');
  for (const c of [cmdO, cmdS]) await provision(admin, c);
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) {
    airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token });
    if (airports.length >= 3 && localities.length >= 2) { province = p; break; }
  }
  assert.ok(province);
  for (const c of [cmdO, cmdS]) await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0;
  const plane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'V' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const at = (d, h) => fmt(new Date(d.getTime() + h * 3600000));
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const when = futureSlot(), planeO = await plane();
  const O = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'UI rutas ' + MARK, aircraftId: planeO.id, comandanteId: cmdO.id, destinoId: airports[1].id, salida: fmt(when), llegada: at(when, 2) } })).id;
  await call(`/flights/${O}/commander-assignment/response`, { method: 'POST', token: cmdO.token, body: { aceptar: true } });
  const whenS = futureSlot(), planeS = await plane(); const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'RutasUI', apellido: MARK } });
  const S = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'UI rutas sanitario ' + MARK, fechaSolicitada: fmt(whenS), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  await call(`/flights/${S}/schedule/accept`, { method: 'POST', token: ops.token });
  await call(`/flights/${S}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: planeS.id, comandanteId: cmdS.id } });
  await call(`/flights/${S}/operational-planning`, { method: 'POST', token: cmdS.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: at(whenS, 2) } });
  assert.equal(stateOf(O), 'PLANIFICADO'); assert.equal(stateOf(S), 'PLANIFICADO');
  const code = (id) => one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${id}`);

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const login = async (name, heading) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); await p.getByRole('heading', { name: heading, exact: true }).waitFor(); return p; };
    const panel = async (p, heading, flightId) => { const card = p.getByRole('heading', { name: heading, exact: true }).locator('..'); await card.locator('select').first().selectOption(String(flightId), { timeout: 90000 }); const route = card.getByRole('heading', { name: 'Ruta operativa', exact: true }).locator('..'); await route.waitFor(); await route.getByText('Cargando ruta…').waitFor({ state: 'detached' }); return route; };
    const status = (route, text) => route.getByRole('status').filter({ hasText: text }).waitFor();

    async function cycle(kind, flightId, commander) {
      const cmdPage = await login(commander.name, 'Planificación operativa'), opsPage = await login(ops.name, 'Centro de Operaciones');
      // 1-3: el comandante crea la ruta y la presenta
      let route = await panel(cmdPage, 'Planificación operativa', flightId);
      await status(route, 'todavía no planificó la ruta');
      const save = route.getByRole('button', { name: 'Guardar ruta', exact: true }), submit = route.getByRole('button', { name: 'Guardar y presentar a Operaciones', exact: true });
      assert.equal(await save.isDisabled(), true, 'sin recorrido no se puede guardar');
      await route.getByLabel('Recorrido y puntos intermedios en orden').fill(`UI ${kind} TUC - AEP directo`);
      await route.getByLabel('Altitud (pies)', { exact: true }).fill('9000'); await route.getByLabel('Distancia (NM)', { exact: true }).fill('640.5'); await route.getByLabel('Tiempo estimado (minutos)', { exact: true }).fill('95');
      await route.locator('label', { hasText: 'Aeropuerto alternativo' }).locator('select').selectOption({ index: 1 });
      await save.click(); await status(route, 'falta presentarla a Operaciones'); assert.equal(routeState(flightId), 'BORRADOR');
      await route.getByRole('button', { name: 'Presentar a Operaciones', exact: true }).click(); await status(route, 'Ruta pendiente de revisión'); assert.equal(routeState(flightId), 'PENDIENTE_REVISION');
      assert.equal(await route.getByRole('button', { name: 'Aprobar ruta' }).count(), 0, 'el comandante no ve la aprobación');
      pass(`UI ${kind}: el comandante crea la ruta con alternativo del catálogo, la guarda como borrador y la presenta (sin identificadores manuales)`);
      // 4-6: Operaciones la ve en su cola, la abre y la devuelve
      await opsPage.reload(); await opsPage.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).waitFor();
      const queue = opsPage.getByLabel('Rutas pendientes de revisión'); await queue.getByRole('button', { name: `Revisar ruta de ${code(flightId)}` }).click();
      const review = opsPage.getByRole('heading', { name: 'Ruta operativa', exact: true }).locator('..'); await review.getByText('Revisión de Operaciones · versión 1').waitFor();
      assert.equal(await review.getByLabel('Recorrido y puntos intermedios en orden').count(), 0, 'Operaciones no edita la ruta');
      const giveBack = review.getByRole('button', { name: 'Devolver con observaciones' }); assert.equal(await giveBack.isDisabled(), true);
      await review.getByLabel('Motivo de la devolución (obligatorio)').fill('corto'); assert.equal(await giveBack.isDisabled(), true);
      await review.getByLabel('Motivo de la devolución (obligatorio)').fill('Falta el procedimiento de salida');
      await giveBack.click(); await opsPage.getByText('✓ Ruta devuelta al comandante').waitFor(); await status(review, 'Operaciones devolvió la ruta con observaciones');
      assert.equal(routeState(flightId), 'DEVUELTA'); assert.equal(stateOf(flightId), 'PLANIFICADO');
      await opsPage.getByRole('button', { name: 'Iniciar vuelo' }).click(); await opsPage.locator('p.error', { hasText: /debe corregirla y presentarla nuevamente/ }).waitFor(); assert.equal(stateOf(flightId), 'PLANIFICADO');
      pass(`UI ${kind}: Operaciones encuentra la ruta en la cola de pendientes, la devuelve con motivo validado y el inicio queda bloqueado mostrando la causa`);
      // 7-10: el comandante ve las observaciones, corrige y vuelve a presentar
      await cmdPage.reload(); route = await panel(cmdPage, 'Planificación operativa', flightId);
      await route.getByText('Falta el procedimiento de salida', { exact: false }).first().waitFor(); await status(route, 'Operaciones devolvió la ruta con observaciones');
      await route.getByLabel('Recorrido y puntos intermedios en orden').fill(`UI ${kind} TUC - COR - AEP (corregida)`);
      const resubmit = route.getByRole('button', { name: 'Guardar y presentar a Operaciones', exact: true }); assert.equal(await resubmit.isDisabled(), true, 'la corrección exige el motivo de la modificación');
      await route.getByLabel('Motivo de la modificación').fill('Se agrega el procedimiento de salida'); await resubmit.click(); await status(route, 'Ruta pendiente de revisión');
      assert.equal(one(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${flightId}`), '2'); assert.equal(one(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${flightId} AND version=1`), 'DEVUELTA');
      // 11-12: Operaciones aprueba y consulta el historial
      await opsPage.reload(); await queue.getByRole('button', { name: `Revisar ruta de ${code(flightId)}` }).waitFor();
      await queue.getByRole('button', { name: `Revisar ruta de ${code(flightId)}` }).click(); await review.getByText('Revisión de Operaciones · versión 2').waitFor();
      await review.getByRole('button', { name: 'Aprobar ruta' }).click(); await opsPage.getByText('✓ Ruta aprobada').waitFor(); await status(review, 'Ruta aprobada por Operaciones');
      assert.equal(routeState(flightId), 'APROBADA'); assert.equal(await review.getByRole('button', { name: 'Aprobar ruta' }).count(), 0);
      await review.getByText('La ruta no impide el inicio del vuelo.').waitFor();
      const history = review.locator('details.route-version'); assert.equal(await history.count(), 2);
      assert.equal(await history.nth(1).evaluate((d) => d.open), false, 'la versión anterior está plegada'); await history.nth(1).locator('summary').click();
      await history.nth(1).getByText(/Devuelta por .* — Falta el procedimiento de salida/).waitFor(); await history.nth(0).getByText('Motivo de la modificación: Se agrega el procedimiento de salida').waitFor();
      pass(`UI ${kind}: el comandante corrige con motivo, Operaciones aprueba la versión 2 y el historial conserva la versión devuelta con su observación`);
      // 13-15: un cambio relevante invalida la aprobación y bloquea el inicio
      const other = await plane(); await ok(`/flights/${flightId}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: other.id, motivo: 'Mantenimiento de la aeronave original' } });
      assert.equal(routeState(flightId), 'REQUIERE_REVISION');
      await opsPage.reload(); await opsPage.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).waitFor();
      const option = opsPage.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..').locator('select').first().locator(`option[value="${flightId}"]`); assert.match(await option.textContent(), /Ruta Requiere nueva revisión/);
      await panel(opsPage, 'Centro de Operaciones', flightId); await status(review, 'La ruta requiere una nueva revisión'); await review.getByText(/Motivo de la nueva revisión: cambió la aeronave/).waitFor();
      await opsPage.getByRole('button', { name: 'Iniciar vuelo' }).click(); await opsPage.locator('p.error', { hasText: /La ruta requiere una nueva revisión: cambió la aeronave/ }).waitFor(); assert.equal(stateOf(flightId), 'PLANIFICADO');
      pass(`UI ${kind}: el cambio de aeronave invalida la aprobación, Operaciones ve la causa y el inicio se rechaza con ese motivo`);
      // 16-17: regulariza, aprueba de nuevo e inicia
      await cmdPage.reload(); route = await panel(cmdPage, 'Planificación operativa', flightId); await status(route, 'La ruta requiere una nueva revisión'); await route.getByText(/Motivo de la nueva revisión: cambió la aeronave/).waitFor();
      await route.getByLabel('Motivo de la modificación').fill('Reconfirmo la ruta con la nueva aeronave'); await route.getByRole('button', { name: 'Guardar y presentar a Operaciones', exact: true }).click(); await status(route, 'Ruta pendiente de revisión');
      await opsPage.reload(); await queue.getByRole('button', { name: `Revisar ruta de ${code(flightId)}` }).click(); await review.getByText('Revisión de Operaciones · versión 3').waitFor();
      await review.getByRole('button', { name: 'Aprobar ruta' }).click(); await opsPage.getByText('✓ Ruta aprobada').waitFor();
      await opsPage.getByRole('button', { name: 'Iniciar vuelo' }).click(); await opsPage.getByText('✓ Vuelo iniciado').waitFor(); assert.equal(stateOf(flightId), 'EN_CURSO');
      assert.equal(one(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${flightId} AND version=2`), 'REQUIERE_REVISION'); assert.equal(routeState(flightId), 'APROBADA');
      await cmdPage.context().close(); await opsPage.context().close();
      pass(`UI ${kind}: se regulariza, Operaciones aprueba la versión 3 y el vuelo inicia; la aprobación invalidada de la versión 2 queda en el historial`);
    }
    await cycle('operativo', O, cmdO);
    await cycle('sanitario', S, cmdS);
  } finally { await browser.close(); }
  console.log(`\n${passed} bloques verificados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
