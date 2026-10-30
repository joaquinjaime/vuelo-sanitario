/* E2E de navegador real del cierre de vuelos (Chrome + Playwright) sobre el stack aislado :18081 / :18080.
 * Prepara fixtures por API, ejecuta el flujo en la interfaz y verifica los registros en SQL Server.
 * Requiere el paquete `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PDF, ROOT, DB_NAME, MARK, PASSWORD, sleep, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const obligation = (id) => one(`SELECT estado_obligacion FROM obligaciones_informe_final WHERE id_vuelos=${id} AND es_actual=1`);

(async () => {
  assert.equal(one('SELECT DB_NAME()'), DB_NAME); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'uiops'); const cmd = await createUser(admin, 'COMANDANTE', 'uicmd'); await provision(admin, cmd);
  let airports, province;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 2) { province = p; break; } }
  await call(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0; const plane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'U' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const planned = async () => { const p = await plane(), w = futureSlot(); const f = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'UI cierre ' + MARK, aircraftId: p.id, comandanteId: cmd.id, destinoId: airports[1].id, salida: fmt(w), llegada: fmt(new Date(w.getTime() + 7200000)) } }); await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: cmd.token, body: { aceptar: true } }); return f; };
  const flight = await planned(); const second = await planned(); const third = await planned();
  await approveRoute(flight.id, cmd.token, ops.token); // el inicio desde la interfaz exige la ruta aprobada (I-4)
  await approveRoute(second.id, cmd.token, ops.token); await call(`/flights/${second.id}/start`, { method: 'POST', token: ops.token }); await call(`/flights/${second.id}/finish`, { method: 'POST', token: ops.token });

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const shotDir = process.env.E2E_SHOT_DIR;
  const login = async (name) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(45000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); return p; };
  const select = async (p, heading, id) => { const card = p.getByRole('heading', { name: heading, exact: true }).locator('..'); await card.locator('select').first().selectOption(String(id), { timeout: 60000 }); return card; };
  const snap = async (p, name) => { if (shotDir) await p.screenshot({ path: path.join(shotDir, name + '.png'), fullPage: true }); };
  try {
    // ---- CO: iniciar y finalizar desde la interfaz ----
    const coPage = await login(ops.name); let card = await select(coPage, 'Centro de Operaciones', flight.id);
    await coPage.getByRole('button', { name: 'Iniciar vuelo' }).click(); await coPage.getByText('Vuelo iniciado').waitFor();
    assert.equal(stateOf(flight.id), 'EN_CURSO');
    await coPage.getByRole('button', { name: 'Finalizar vuelo' }).click(); await coPage.getByText(/Vuelo finalizado; se generó la obligación/).waitFor();
    assert.equal(stateOf(flight.id), 'FINALIZADO'); assert.equal(obligation(flight.id), 'PENDIENTE');
    await coPage.getByText('Informe final pendiente de presentación').first().waitFor(); await snap(coPage, '01-co-finalizado');
    assert.equal(await coPage.getByRole('button', { name: 'Finalizar vuelo' }).count(), 0, 'no se puede finalizar dos veces');
    await coPage.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await coPage.getByText(/V-[A-Z0-9]+ · .* · Pendiente de presentación/).first().waitFor({ timeout: 5000 }).catch(() => {});
    await coPage.reload(); const flightCode = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${flight.id}`); const tableRow = coPage.locator('table tbody tr', { hasText: flightCode }); await tableRow.waitFor();
    const rowText = await tableRow.textContent(); assert.ok(!rowText.includes('undefined'), 'trayecto sin undefined: ' + rowText); assert.match(rowText, /[^\s,]+, [^\s→]+.* → \S+/, 'trayecto con aeropuerto y provincia: ' + rowText);
    pass('UI-1 CO inicia y finaliza el vuelo; el cierre administrativo queda "pendiente" y no hay segundo botón de finalizar');

    // ---- Comandante: presenta el informe ----
    const cmdPage = await login(cmd.name); const report = cmdPage.getByRole('region', { name: 'Informes finales' });
    const article = report.locator('article', { hasText: await one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${flight.id}`) });
    await article.getByLabel('Informe de texto').fill('Informe desde navegador v1'); await article.getByLabel('Horas de vuelo').fill('2.5'); await article.getByLabel('Combustible consumido (L)').fill('410'); await article.getByLabel('Incidentes').fill('Sin incidentes');
    await article.getByRole('button', { name: 'Presentar informe' }).click(); await cmdPage.getByText('✓ Informe presentado', { exact: true }).waitFor();
    assert.equal(obligation(flight.id), 'PRESENTADO'); assert.equal(one(`SELECT CAST(horas_vuelo AS varchar(20))+'|'+CAST(combustible_consumido_litros AS varchar(20)) FROM informes_finales_vuelo WHERE id_vuelos=${flight.id} AND version=1`).startsWith('2.50|410'), true);
    await report.getByText(/Presentado, en revisión/).first().waitFor(); await snap(cmdPage, '02-cmd-presentado');
    pass('UI-2 el comandante presenta el informe (texto, horas, combustible, incidentes) y queda en revisión');

    // ---- CO: consulta y devuelve ----
    const code = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${flight.id}`);
    await coPage.reload(); const review = coPage.getByRole('region', { name: 'Revisión de informes finales' }); const item = review.locator('article', { hasText: code }).first();
    await item.getByRole('button', { name: 'Consultar informe' }).click(); await item.getByText('Informe desde navegador v1').waitFor();
    await item.getByLabel('Motivo de devolución').fill('Detallar el consumo por tramo'); await item.getByRole('button', { name: 'Devolver para corrección' }).click(); await coPage.getByText('✓ Informe devuelto', { exact: true }).waitFor();
    assert.equal(obligation(flight.id), 'DEVUELTO'); assert.equal(one(`SELECT estado_revision FROM informes_finales_vuelo WHERE id_vuelos=${flight.id} AND version=1`), 'DEVUELTO');
    pass('UI-3 CO consulta el informe y lo devuelve con motivo');

    // ---- Comandante: ve la devolución y reentrega ----
    await cmdPage.reload(); const report2 = cmdPage.getByRole('region', { name: 'Informes finales' }); const art2 = report2.locator('article', { hasText: code });
    await art2.getByText(/Devuelto por Operaciones: Detallar el consumo por tramo/).waitFor(); await art2.getByRole('button', { name: /Ver historial/ }).click(); await art2.getByText('Versión 1').waitFor();
    await art2.getByLabel('Informe de texto').fill('Informe corregido v2'); await art2.locator('input[type=file]').setInputFiles({ name: 'Informe corregido <v2>.pdf', mimeType: 'application/pdf', buffer: PDF }); await art2.getByRole('button', { name: 'Presentar corrección' }).click(); await cmdPage.getByText('✓ Corrección presentada', { exact: true }).waitFor();
    assert.equal(obligation(flight.id), 'PRESENTADO'); assert.equal(count(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos=${flight.id}`), 2); assert.equal(one(`SELECT adjunto_sha256 FROM informes_finales_vuelo WHERE id_vuelos=${flight.id} AND version=2`), crypto.createHash('sha256').update(PDF).digest('hex'));
    await snap(cmdPage, '03-cmd-reentrega'); pass('UI-4 el comandante ve el motivo y el historial y reentrega (versión 2, versión 1 conservada)');

    // ---- CO: aprueba y completa ----
    await coPage.reload(); const item2 = coPage.getByRole('region', { name: 'Revisión de informes finales' }).locator('article', { hasText: code }).first();
    await item2.getByRole('button', { name: 'Consultar informe' }).click(); await item2.getByText('Versión 2').waitFor(); await item2.getByText('Motivo de devolución: Detallar el consumo por tramo').waitFor();
    await item2.getByText(/Texto y PDF adjunto/).waitFor(); const [dl] = await Promise.all([coPage.waitForEvent('download'), item2.getByRole('button', { name: 'Descargar PDF' }).click()]); const dlPath = await dl.path(); assert.equal(crypto.createHash('sha256').update(fs.readFileSync(dlPath)).digest('hex'), crypto.createHash('sha256').update(PDF).digest('hex'), 'el PDF descargado desde Chrome coincide con el cargado'); assert.equal(dl.suggestedFilename(), 'informe-final-v2.pdf');
    await item2.getByRole('button', { name: 'Aprobar y completar vuelo' }).click(); await coPage.getByText('Informe aprobado y vuelo completado').waitFor();
    assert.equal(stateOf(flight.id), 'COMPLETADO'); assert.equal(obligation(flight.id), 'APROBADO');
    await select(coPage, 'Centro de Operaciones', flight.id); await coPage.getByText('Cerrado administrativamente').waitFor(); await snap(coPage, '04-co-completado');
    await cmdPage.reload(); await cmdPage.getByRole('region', { name: 'Notificaciones' }).getByText(/Informe final aprobado/).first().waitFor(); await cmdPage.getByRole('region', { name: 'Notificaciones' }).getByText(/Informe devuelto para corrección/).first().waitFor();
    await coPage.reload(); await coPage.getByRole('region', { name: 'Notificaciones' }).getByText(/Informe final presentado|Nueva presentación del informe final/).first().waitFor(); await cmdPage.getByRole('button', { name: 'Marcar todas como leídas' }).click(); await cmdPage.getByText('Notificaciones', { exact: true }).first().waitFor(); assert.equal(count(`SELECT COUNT(*) FROM notificaciones WHERE id_usuarios=${cmd.id} AND leido=0`), 0);
    pass('UI-5 CO aprueba: vuelo COMPLETADO, cierre administrativo "Cerrado" y notificación visible para el comandante');

    // ---- Bloqueo por informe vencido ----
    const blockedPlane = third.id; const dueSecond = Number(one(`SELECT DATEDIFF_BIG(MILLISECOND, '1970-01-01T00:00:00+00:00', vencimiento) FROM obligaciones_informe_final WHERE id_vuelos=${second.id} AND es_actual=1`)); await ok('/e2e/clock', { method: 'PUT', token: admin, body: { instant: new Date(dueSecond + 3600000).toISOString() } });
    await cmdPage.reload(); await cmdPage.getByRole('heading', { name: '⚠ FUNCIONES BLOQUEADAS: INFORME FINAL VENCIDO' }).waitFor(); await snap(cmdPage, '05-cmd-bloqueado');
    const planning = await select(cmdPage, 'Planificación operativa', blockedPlane);
    await planning.locator('fieldset textarea').first().fill('Despejado'); await planning.getByRole('button', { name: 'Registrar clima' }).click();
    await cmdPage.getByText(/FUNCIONES BLOQUEADAS: INFORME FINAL VENCIDO/).nth(0).waitFor(); assert.equal(count(`SELECT COUNT(*) FROM instantaneas_clima WHERE id_vuelos=${blockedPlane}`), 0);
    const codeSecond = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${second.id}`); const art3 = cmdPage.getByRole('region', { name: 'Informes finales' }).locator('article', { hasText: codeSecond });
    await art3.getByText(/VENCIDO hace/).waitFor(); await art3.getByLabel('Informe de texto').fill('Informe tardío'); await art3.getByRole('button', { name: 'Presentar informe' }).click(); await cmdPage.getByText('✓ Informe presentado', { exact: true }).waitFor();
    await cmdPage.getByRole('heading', { name: '⚠ FUNCIONES BLOQUEADAS: INFORME FINAL VENCIDO' }).waitFor({ state: 'detached' });
    await planning.locator('fieldset textarea').first().fill('Despejado'); await planning.getByRole('button', { name: 'Registrar clima' }).click(); await cmdPage.getByText('Condiciones meteorológicas registradas').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM instantaneas_clima WHERE id_vuelos=${blockedPlane}`), 1);
    pass('UI-6 comandante bloqueado: aviso visible, el servidor rechaza el clima, puede presentar el informe vencido y recupera la operación');
  } catch (e) { try { for (const [i, c] of (await browser.contexts()).entries()) for (const p of c.pages()) await snap(p, 'fallo-' + i); } catch { /* sin capturas */ } throw e; }
  finally { await browser.close(); await ok('/e2e/clock', { method: 'PUT', token: admin, body: { reset: true } }); }
  console.log(`\nE2E CIERRE UI COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E UI:', e.stack || e); process.exit(1); });
