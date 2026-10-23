/* E2E de navegador real (Chrome + Playwright) del ciclo previo a la planificación sobre el stack aislado :18081 / :18080.
 * DTS, Centro de Operaciones y Comandante ejecutan los procesos desde la interfaz; cada paso se verifica en SQL Server.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { ROOT, MARK, PASSWORD, sql, one, count, call, ok, fmt, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
const DAY = 86400000, TZ = -3 * 3600000;
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const reqState = (id) => one(`SELECT es.codigo_estado_solicitud FROM vuelos_sanitarios s JOIN estados_solicitud_sanitaria es ON es.id_estados_solicitud_sanitaria=s.id_estados_solicitud_sanitaria WHERE s.id_vuelos=${id}`);
const flightByMotive = (motive) => Number(one(`SELECT TOP 1 id_vuelos FROM vuelos WHERE motivo_vuelo=N'${motive}' ORDER BY id_vuelos DESC`));
const civilDay = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);
const input = (ms, hhmm) => `${civilDay(ms)}T${hhmm}`; // valor para datetime-local

(async () => {
  assert.equal(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'), '47'); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'uiops'), dts = await createUser(admin, 'DTS', 'uidts'), cmdU = await createUser(admin, 'COMANDANTE', 'uicmdu'), cmdO = await createUser(admin, 'COMANDANTE', 'uicmdo');
  for (const c of [cmdU, cmdO]) await provision(admin, c);
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
  for (const c of [cmdU, cmdO]) await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  const plane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'W' + Math.floor(Math.random() * 1e5)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0]; const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((r) => r.codigo !== 'OTRO');
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Interfaz', apellido: MARK, dni: String(30000000 + Math.floor(Math.random() * 9999999)) } });
  const nowMs = Date.now(); const body = (motive, when, extra = {}) => ({ patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority.codigo, motivoVuelo: motive, fechaSolicitada: when, extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false }, ...extra });
  const mk = async (motive, days, hh, extra) => (await ok('/flights', { method: 'POST', token: dts.token, body: body(motive, `${civilDay(nowMs + days * DAY)}T${hh}:00:00`, extra) })).id;
  const mUrgent = 'UI urgente ' + MARK, mA = 'UI A negociar ' + MARK, mB = 'UI B rechazar ' + MARK, mC = 'UI C aceptar ' + MARK, mNew = 'UI nueva ' + MARK, mNewUrgent = 'UI nueva urgente ' + MARK;
  const fNormalFirst = await mk('UI normal previa ' + MARK, 6, '09'); // más antigua y normal: debe quedar detrás de la urgente
  const fUrgent = await mk(mUrgent, 1, '08', { extremaUrgencia: true, justificacionExtremaUrgencia: 'Riesgo vital', fechaLimiteTraslado: `${civilDay(nowMs + DAY)}T20:00:00` });
  const fA = await mk(mA, 7, '10'), fB = await mk(mB, 7, '11'), fC = await mk(mC, 7, '12'); const planeU = await plane();
  await ok(`/flights/${fC}/schedule/counterproposal`, { method: 'POST', token: ops.token, body: { salida: `${civilDay(nowMs + 8 * DAY)}T09:00:00`, motivo: 'Fecha alternativa C' } });
  const op = await plane(); const opStart = new Date(Date.now() + 340 * DAY); opStart.setHours(9, 0, 0, 0);
  const fO = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'UI operativo ' + MARK, aircraftId: op.id, comandanteId: cmdO.id, destinoId: airports[1].id, salida: fmt(opStart), llegada: fmt(new Date(opStart.getTime() + 2 * 3600000)) } })).id;

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (name) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); const loginResponse = p.waitForResponse((r) => r.url().endsWith('/api/auth/login'), { timeout: 15000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const response = await loginResponse; if (!response.ok()) throw new Error(`UI login HTTP ${response.status()}: ${(await response.text()).slice(0, 200)}`); return p; };
  const snap = async (p, n) => { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };
  const pick = async (p, heading, id) => { const card = p.getByRole('heading', { name: heading, exact: true }).locator('..'); await card.locator('select').first().selectOption(String(id), { timeout: 90000 }); return card; };
  try {
    // ---- DTS crea solicitudes desde el formulario ----
    const dtsPage = await login(dts.name); const form = dtsPage.locator('form').first();
    async function fillRequest(motive, when, urgent) {
      await form.getByLabel('Paciente').selectOption({ label: `Interfaz ${MARK}` });
      for (const [kind, locality] of [['origen', localities[0]], ['destino', localities[1]]]) { await dtsPage.getByLabel(`Provincia ${kind}`).selectOption(String(province.id)); await dtsPage.getByLabel(`Buscar localidad ${kind}`).fill(locality.nombre.slice(0, 5)); await dtsPage.getByLabel(`Buscar localidad ${kind}`).focus(); await dtsPage.getByRole('option', { name: new RegExp(locality.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click(); }
      await form.getByLabel('Fecha y hora solicitada').fill(when);
      if (urgent) { await form.getByLabel('Extrema urgencia').check(); await form.getByLabel('Justificación de extrema urgencia').fill('Riesgo vital por interfaz'); await form.getByLabel('Fecha y hora límite para el traslado').fill(urgent); }
      await form.getByLabel('Diagnóstico').fill('Dx-' + MARK); await form.getByLabel('Condición').fill('ESTABLE'); await form.locator('textarea').last().fill(motive);
      await form.getByRole('button', { name: 'Crear solicitud' }).click();
    }
    await fillRequest(mNew, input(nowMs + 5 * DAY, '10:00')); await dtsPage.getByText('✓ Solicitud registrada').waitFor();
    const fNew = flightByMotive(mNew); assert.equal(reqState(fNew), 'SOLICITADO'); assert.equal(stateOf(fNew), 'NULL'); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${fNew} AND extrema_urgencia=0 AND id_usuario_solicitante=${dts.id}`), 1);
    await fillRequest(mNewUrgent, input(nowMs + DAY, '07:00'), input(nowMs + DAY, '23:00')); await dtsPage.waitForTimeout(1500);
    const fNewUrgent = flightByMotive(mNewUrgent); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${fNewUrgent} AND extrema_urgencia=1 AND justificacion_extrema_urgencia=N'Riesgo vital por interfaz'`), 1);
    await snap(dtsPage, 's01-dts-solicitudes');
    pass('UI-1 DTS crea desde el formulario una solicitud normal y una de extrema urgencia (justificación y horario límite) que se persisten en SQL Server');

    // ---- Operaciones: prioridad, aprobación, propuesta, reemplazo y rechazo ----
    const opsPage = await login(ops.name); const codeU0 = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${fUrgent}`); await opsPage.waitForFunction((c) => [...document.querySelectorAll('option')].some((o) => o.textContent.includes(c)), codeU0, { timeout: 90000 }); const urgentOptions = await opsPage.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..').locator('select').first().locator('option').allTextContents();
    const codeUrgent = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${fUrgent}`), codeNormal = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${fNormalFirst}`); const iUrgent = urgentOptions.findIndex((t) => t.includes('⚠ URGENTE') && t.includes(codeUrgent)), iNormal = urgentOptions.findIndex((t) => t.includes(codeNormal));
    assert.ok(iUrgent > 0 && iNormal > 0 && iUrgent < iNormal, `la urgente se lista antes que la normal (${iUrgent} < ${iNormal})`);
    let card = await pick(opsPage, 'Centro de Operaciones', fUrgent); await opsPage.getByText(/EXTREMA URGENCIA/i).first().waitFor(); await snap(opsPage, 's02-ops-urgente');
    await card.getByRole('button', { name: 'Aceptar horario DTS' }).click(); await opsPage.getByText('✓ Horario aceptado').waitFor(); assert.equal(reqState(fUrgent), 'APROBADO');
    card = await pick(opsPage, 'Centro de Operaciones', fA); const evalA = opsPage.getByLabel('Evaluación de la solicitud');
    await evalA.getByLabel('Nueva fecha y hora').fill(input(nowMs + 9 * DAY, '09:00')); await evalA.getByLabel('Motivo de la propuesta').fill('No hay aeronave'); await evalA.getByRole('button', { name: 'Proponer otro horario' }).click(); await opsPage.getByText('✓ Propuesta enviada al DTS').waitFor(); assert.equal(reqState(fA), 'PENDIENTE_RESPUESTA_DTS');
    await opsPage.getByText(/Propuesta vigente:/).waitFor(); await evalA.getByLabel('Nueva fecha y hora').fill(input(nowMs + 10 * DAY, '09:00')); await evalA.getByLabel('Motivo de la propuesta').fill('Nueva disponibilidad'); await evalA.getByRole('button', { name: 'Reemplazar propuesta' }).click(); await opsPage.getByText('✓ Propuesta reemplazada').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM negociaciones_horario_vuelo WHERE id_vuelos=${fA} AND tipo_negociacion=N'CO_CONTRAPROPUESTA'`), 2); assert.equal(count(`SELECT COUNT(*) FROM negociaciones_horario_vuelo WHERE id_vuelos=${fA} AND id_negociacion_respondida IS NOT NULL AND tipo_negociacion=N'CO_CONTRAPROPUESTA'`), 2);
    card = await pick(opsPage, 'Centro de Operaciones', fB); const evalB = opsPage.getByLabel('Evaluación de la solicitud'); await evalB.getByLabel('Motivo de cancelación').selectOption(String(reason.id)); await evalB.getByRole('button', { name: 'Rechazar solicitud' }).click(); await opsPage.getByText('✓ Solicitud rechazada').waitFor();
    assert.equal(reqState(fB), 'RECHAZADO'); assert.equal(stateOf(fB), 'NULL'); await snap(opsPage, 's03-ops-evaluacion');
    pass('UI-2 Operaciones ve la urgente primero y destacada, aprueba, propone otro horario, reemplaza la propuesta y rechaza otra solicitud con motivo del catálogo; todo persiste en SQL Server');

    // ---- DTS responde: rechazo con OTRO, aceptación, motivo de rechazo visible y cancelación propia ----
    await dtsPage.reload(); let dcard = await pick(dtsPage, 'Mis solicitudes y contrapropuestas', fA); await dtsPage.getByText(/Nuevo horario propuesto/).waitFor(); await dtsPage.getByText(/Nueva disponibilidad/).first().waitFor();
    const reject = dtsPage.getByRole('button', { name: 'Rechazar contrapropuesta y cancelar' }); assert.equal(await reject.isDisabled(), true);
    await dtsPage.getByLabel('Motivo de cancelación').first().selectOption(String((reasons.find((r) => r.codigo === 'OTRO')).id)); await dtsPage.getByLabel('Especifique el motivo').first().waitFor(); assert.equal(await reject.isDisabled(), true, 'OTRO exige descripción');
    await dtsPage.getByLabel('Especifique el motivo').first().fill('No podemos postergar el traslado'); await reject.click(); await dtsPage.getByText('✓ Contrapropuesta rechazada: la solicitud fue cancelada').waitFor();
    assert.equal(reqState(fA), 'CANCELADO'); assert.equal(stateOf(fA), 'CANCELADO'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${fA} AND motivo_cancelacion_personalizado=N'No podemos postergar el traslado' AND id_usuario_cancelador=${dts.id}`), 1); await dtsPage.getByText(/Vuelo CANCELADO por/).first().waitFor();
    dcard = await pick(dtsPage, 'Mis solicitudes y contrapropuestas', fC); await dtsPage.getByRole('button', { name: 'Aceptar contrapropuesta' }).click(); await dtsPage.getByText('✓ Contrapropuesta aceptada').waitFor(); assert.equal(reqState(fC), 'APROBADO');
    await pick(dtsPage, 'Mis solicitudes y contrapropuestas', fB); await dtsPage.getByText(/RECHAZADA por Operaciones: /).waitFor(); assert.equal(await dtsPage.getByRole('button', { name: 'Cancelar solicitud' }).count(), 0, 'una solicitud rechazada no ofrece cancelación');
    await pick(dtsPage, 'Mis solicitudes y contrapropuestas', fNew); await dtsPage.getByLabel('Motivo de cancelación').first().selectOption(String(reason.id)); await dtsPage.getByRole('button', { name: 'Cancelar solicitud' }).click(); await dtsPage.getByText('✓ Solicitud cancelada').waitFor(); assert.equal(reqState(fNew), 'CANCELADO');
    await dtsPage.reload(); await dtsPage.getByRole('region', { name: 'Notificaciones' }).getByText(/Propuesta de horario|Solicitud rechazada|Solicitud aprobada/).first().waitFor(); await snap(dtsPage, 's04-dts-respuestas');
    pass('UI-3 DTS ve la contrapropuesta vigente, el motivo OTRO exige descripción, rechazar cancela la solicitud, acepta otra, ve el motivo del rechazo de Operaciones y cancela su propia solicitud; sus avisos son visibles');

    // ---- Comandante: urgencia visible, asignación y contrapropuesta; Operaciones responde ----
    await call(`/flights/${fUrgent}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: planeU.id, comandanteId: cmdU.id } });
    const cmdPage = await login(cmdU.name); await pick(cmdPage, 'Planificación operativa', fUrgent); await cmdPage.getByText(/EXTREMA URGENCIA/i).first().waitFor(); await cmdPage.getByText('Historial de negociación').waitFor(); await snap(cmdPage, 's05-cmd-urgente');
    await cmdPage.getByRole('region', { name: 'Notificaciones' }).getByText(/EXTREMA URGENCIA/).first().waitFor();
    const cmdOPage = await login(cmdO.name); await pick(cmdOPage, 'Planificación operativa', fO); await cmdOPage.getByRole('heading', { name: 'Confirmación de asignación' }).waitFor();
    // La fecha de la propuesta se arma con la hora local del navegador (datetime-local) para evitar desfases de zona.
    const proposeLocal = async (days, hh) => { const d = new Date(Date.now() + days * DAY); const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(hh).padStart(2, '0')}:00`; const a = new Date(d.getTime() + 2 * 3600000); const arr = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}T${String(hh + 2).padStart(2, '0')}:00`; await cmdOPage.getByLabel('Motivo (obligatorio para rechazar o proponer)').fill('Llego más tarde'); await cmdOPage.getByLabel('Nueva salida').fill(val); await cmdOPage.getByLabel('Nueva llegada').fill(arr); await cmdOPage.getByRole('button', { name: 'Proponer horario' }).click(); await cmdOPage.getByText('✓ Respuesta enviada a Operaciones').waitFor(); };
    await proposeLocal(342, 14); assert.equal(stateOf(fO), 'PENDIENTE_RESPUESTA_OPERACIONES');
    await opsPage.reload(); await pick(opsPage, 'Centro de Operaciones', fO); await opsPage.getByRole('heading', { name: 'Propuesta de horario del comandante' }).waitFor(); await opsPage.getByText(/Propone salida/).waitFor();
    await opsPage.getByLabel('Motivo del rechazo').fill('Hay otro vuelo en ese horario'); await opsPage.getByRole('button', { name: 'Rechazar propuesta' }).click(); await opsPage.getByText('✓ Propuesta devuelta al comandante').waitFor(); assert.equal(stateOf(fO), 'PENDIENTE_CONFIRMACION_COMANDANTE'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${fO} AND fecha_cancelacion IS NULL`), 1, 'el rechazo de la propuesta no cancela el vuelo');
    await cmdOPage.reload(); await pick(cmdOPage, 'Planificación operativa', fO); await proposeLocal(343, 15); await opsPage.reload(); await pick(opsPage, 'Centro de Operaciones', fO); await opsPage.getByRole('button', { name: 'Aceptar horario propuesto' }).click(); await opsPage.getByText('✓ Horario del comandante aceptado').waitFor(); assert.equal(stateOf(fO), 'PLANIFICADO'); await snap(opsPage, 's06-ops-propuesta-comandante');
    pass('UI-4 el comandante identifica la urgencia y el historial, propone horarios desde su pantalla y Operaciones (no el DTS) los rechaza con motivo o acepta; el rechazo no cancela el vuelo');

    // ---- Operaciones cancela el vuelo operativo; el comandante recibe el aviso ----
    await pick(opsPage, 'Centro de Operaciones', fO); const cancelSection = opsPage.locator('.detail-actions', { has: opsPage.getByRole('heading', { name: 'Cancelar vuelo' }) }); await cancelSection.getByLabel('Motivo de cancelación').selectOption(String((reasons.find((r) => r.codigo === 'OTRO')).id)); await cancelSection.getByLabel('Especifique el motivo').fill('Aeronave en mantenimiento'); await cancelSection.getByRole('button', { name: 'Cancelar vuelo' }).click(); await opsPage.getByText('✓ Vuelo cancelado').waitFor();
    assert.equal(stateOf(fO), 'CANCELADO'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${fO} AND motivo_cancelacion_personalizado=N'Aeronave en mantenimiento' AND id_usuario_cancelador=${ops.id}`), 1);
    await opsPage.getByText(/Vuelo CANCELADO por/).first().waitFor(); assert.equal(await cancelSection.count(), 0, 'un vuelo cancelado no ofrece nueva cancelación');
    await cmdOPage.reload(); await cmdOPage.getByRole('region', { name: 'Notificaciones' }).getByText(/Vuelo cancelado/).first().waitFor();
    pass('UI-5 Operaciones cancela un vuelo con motivo OTRO descrito; el estado y los datos de la cancelación persisten, la pantalla deja de ofrecer cancelarlo y el comandante recibe el aviso');
  } catch (e) { try { for (const [i, c] of browser.contexts().entries()) for (const p of c.pages()) await snap(p, 'sol-fallo-' + i); } catch { /* sin capturas */ } throw e; }
  finally { await browser.close(); }
  console.log(`\nE2E SOLICITUDES UI COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E SOLICITUDES UI:', e.stack || e); process.exit(1); });
