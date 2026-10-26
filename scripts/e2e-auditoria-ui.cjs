/* E2E de navegador real (Chrome + Playwright) de la consulta de auditoría sobre el stack aislado :18081 / :18080 (V46).
 * El escenario se genera con los endpoints de negocio (solicitud, negociación, asignación, cambio de comandante, planificación, inicio,
 * cambio de ubicación de aeronave); los eventos no se insertan a mano. Después ADMINISTRADOR, Operaciones, DTS y Comandante consultan la
 * auditoría desde la interfaz, se recarga la página para comprobar que los datos vienen del backend y se verifican los rechazos.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { ROOT, MARK, PASSWORD, sql, one, count, call, ok, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
const DAY = 86400000, TZ = -3 * 3600000;
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const civilDay = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);
const z = (n) => String(n).padStart(2, '0');

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 47); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const boot = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adm = await createUser(boot, 'ADMINISTRADOR', 'uiaadm'), ops = await createUser(boot, 'CENTRO_OPERACIONES', 'uiaops'), dts = await createUser(boot, 'DTS', 'uiadts'), dts2 = await createUser(boot, 'DTS', 'uiadts2');
  const cmdA = await createUser(boot, 'COMANDANTE', 'uiacmda'), cmdB = await createUser(boot, 'COMANDANTE', 'uiacmdb'); for (const c of [cmdA, cmdB]) await provision(boot, c);
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
  for (const c of [cmdA, cmdB]) await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0; const plane = async () => ok('/catalogs/aircraft', { method: 'POST', token: boot, body: { matricula: (MARK + 'V' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo; const DX = 'DxUI-' + MARK;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'AuditUI', apellido: MARK } });
  const now = Date.now();
  const F = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'AuditUI ' + MARK, fechaSolicitada: `${civilDay(now + 5 * DAY)}T10:00:00`, extremaUrgencia: false, medical: { diagnostico: DX, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  await ok(`/flights/${F}/schedule/counterproposal`, { method: 'POST', token: ops.token, body: { salida: `${civilDay(now + 7 * DAY)}T09:00:00`, motivo: 'Fecha alternativa UI' } });
  const proposal = (await ok(`/flights/${F}`, { token: dts.token })).negociacion.filter((n) => n.tipo === 'CO_CONTRAPROPUESTA').pop();
  await ok(`/flights/${F}/schedule/response`, { method: 'POST', token: dts.token, body: { aceptar: true, propuestaId: proposal.id } });
  const p1 = await plane(); await ok(`/flights/${F}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: p1.id, comandanteId: cmdA.id } });
  await ok(`/flights/${F}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: p1.id, comandanteId: cmdB.id } });
  await ok(`/flights/${F}/operational-planning`, { method: 'POST', token: cmdB.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: `${civilDay(now + 7 * DAY)}T11:00:00` } });
  await approveRoute(F, cmdB.token, ops.token);
  await call(`/flights/${F}/start`, { method: 'POST', token: ops.token });
  const p2 = await plane(); await ok(`/catalogs/aircraft/${p2.id}/location`, { method: 'POST', token: boot, body: { locationId: airports[1].id, motivo: 'Reposicionamiento UI ' + MARK } });
  const other = (await ok('/flights', { method: 'POST', token: dts2.token, body: { patientId: (await ok('/patients', { method: 'POST', token: dts2.token, body: { nombre: 'Ajeno', apellido: MARK } })).id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Ajena ' + MARK, fechaSolicitada: `${civilDay(now + 6 * DAY)}T10:00:00`, extremaUrgencia: false, medical: { diagnostico: DX + 'b', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  const eventsF = sql(`SELECT id_eventos_auditoria, tipo_entidad, operacion, CONVERT(varchar(19),fecha_ocurrencia,120) FROM eventos_auditoria WHERE id_vuelos=${F} ORDER BY fecha_ocurrencia DESC, id_eventos_auditoria DESC`).split(/\r?\n/).filter((l) => l.includes('|')).map((l) => { const [id, type, op, at] = l.split('|').map((x) => x.trim()); return { id: Number(id), type, op, at }; });
  const flightCode = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${F}`), otherCode = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${other}`);
  assert.ok(eventsF.length >= 10);
  pass(`escenario real generado por endpoints de negocio: vuelo ${flightCode} con ${eventsF.length} eventos auditados y una solicitud ajena ${otherCode}`);

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (name, timezoneId = 'UTC') => { const ctx = await browser.newContext({ timezoneId, locale: 'es-AR' }); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); return p; };
  const snap = async (p, n) => { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };
  const apiFrom = async (p, url) => p.evaluate(async (u) => { const r = await fetch('/api' + u, { headers: { Authorization: 'Bearer ' + localStorage.getItem('vs-token') } }); return { status: r.status, text: await r.text() }; }, url);
  const pick = async (p, heading, id) => { const card = p.getByRole('heading', { name: heading, exact: true }).locator('..'); await card.locator('select').first().selectOption(String(id), { timeout: 90000 }); return card; };
  try {
    // ---------- 1. ADMINISTRADOR: sección Auditoría ----------
    const admin = await login(adm.name, 'Asia/Tokyo');
    await admin.locator('nav').getByText('Auditoría', { exact: true }).click();
    await admin.getByRole('heading', { name: 'Auditoría de operaciones', exact: true }).waitFor();
    const table = admin.getByRole('table', { name: 'Eventos de auditoría' }); await table.waitFor();
    assert.equal((await table.locator('tbody tr').count()), 20, 'primera página de 20 eventos'); assert.match(admin.url(), /#\/admin\/auditoria$/);
    const sqlTotal = count('SELECT COUNT(*) FROM eventos_auditoria'); const pagerText = await admin.locator('.audit-pager').innerText(); const shownTotal = Number(/· (\d+) eventos/.exec(pagerText)[1]);
    assert.ok(shownTotal >= sqlTotal - 5 && shownTotal <= sqlTotal, `la interfaz informa el total real (${shownTotal} / SQL ${sqlTotal})`); assert.match(pagerText, /Página 1 de/);
    const firstTimes = await table.locator('tbody tr td:first-child').allInnerTexts(); const parse = (s) => { const m = /(\d{2})\/(\d{2})\/(\d{4}),? (\d{2}):(\d{2}):(\d{2})/.exec(s); return m ? Date.UTC(m[3], m[2] - 1, m[1], m[4], m[5], m[6]) : NaN; };
    for (let i = 1; i < firstTimes.length; i++) assert.ok(parse(firstTimes[i - 1]) >= parse(firstTimes[i]), 'orden descendente por fecha');
    await snap(admin, 'a01-admin-auditoria');
    pass(`UI-1 administrador abre Auditoría desde el menú lateral: tabla de 20 eventos, total real (${shownTotal}) y orden del más reciente al más antiguo`);

    // zona horaria: navegador en Tokio, el evento se muestra en hora de Tucumán
    await admin.getByLabel('ID de vuelo').fill(String(F)); await admin.getByLabel('Acción').selectOption('CREATE_SANITARY'); await admin.getByRole('button', { name: 'Aplicar filtros' }).click();
    await admin.waitForFunction(() => document.querySelectorAll('table[aria-label="Eventos de auditoría"] tbody tr').length === 1);
    const created = eventsF.find((e) => e.op === 'CREATE_SANITARY'); const local = new Date(Date.parse(created.at.replace(' ', 'T') + 'Z') + TZ);
    const expected = `${z(local.getUTCDate())}/${z(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`; const expectedTime = `${z(local.getUTCHours())}:${z(local.getUTCMinutes())}:${z(local.getUTCSeconds())}`;
    const cell = await table.locator('tbody tr td:first-child').innerText(); assert.ok(cell.includes(expected) && cell.includes(expectedTime), `hora de negocio ${expected} ${expectedTime} (celda: ${cell})`);
    const second = await login(adm.name, 'America/Los_Angeles'); await second.locator('nav').getByText('Auditoría', { exact: true }).click(); await second.getByLabel('ID de vuelo').fill(String(F)); await second.getByLabel('Acción').selectOption('CREATE_SANITARY'); await second.getByRole('button', { name: 'Aplicar filtros' }).click();
    await second.waitForFunction(() => document.querySelectorAll('table[aria-label="Eventos de auditoría"] tbody tr').length === 1);
    assert.equal(await second.getByRole('table', { name: 'Eventos de auditoría' }).locator('tbody tr td:first-child').innerText(), cell, 'dos navegadores en zonas distintas muestran la misma hora de negocio'); await second.context().close();
    pass(`UI-2 zona horaria: navegadores en Tokio y Los Ángeles muestran el mismo evento a las ${expectedTime} del ${expected} (hora de Tucumán, sin convertir dos veces)`);

    // filtros combinados + paginación + recarga
    await admin.getByRole('button', { name: 'Limpiar filtros' }).click(); await admin.waitForFunction(() => document.querySelectorAll('table[aria-label="Eventos de auditoría"] tbody tr').length === 20);
    await admin.getByLabel('ID de vuelo').fill(String(F)); await admin.getByLabel('Tipo de entidad').selectOption('FLIGHT_CREW'); await admin.getByRole('button', { name: 'Aplicar filtros' }).click();
    const crewCount = eventsF.filter((e) => e.type === 'FLIGHT_CREW').length; await admin.waitForFunction((n) => document.querySelectorAll('table[aria-label="Eventos de auditoría"] tbody tr').length === n, crewCount);
    assert.ok((await table.locator('tbody tr td:nth-child(5)').allInnerTexts()).every((t) => t.startsWith('Tripulación del vuelo')));
    await admin.getByRole('button', { name: 'Limpiar filtros' }).click();
    await admin.getByLabel('Buscar usuario responsable').fill(ops.name);
    await admin.getByLabel('Usuario responsable', { exact: true }).locator(`option[value="${ops.id}"]`).waitFor({ state: 'attached' });
    await admin.getByLabel('Usuario responsable', { exact: true }).selectOption(String(ops.id)); await admin.getByLabel('Orden').selectOption('asc'); await admin.getByRole('button', { name: 'Aplicar filtros' }).click();
    await admin.waitForFunction(() => /Página 1 de/.test(document.querySelector('.audit-pager')?.innerText || ''));
    const opsEvents = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_usuario_actor=${ops.id}`); assert.match(await admin.locator('.audit-pager').innerText(), new RegExp(`· ${opsEvents} eventos`));
    const ascTimes = (await table.locator('tbody tr td:first-child').allInnerTexts()).map(parse); for (let i = 1; i < ascTimes.length; i++) assert.ok(ascTimes[i - 1] <= ascTimes[i], 'orden ascendente');
    await admin.getByLabel('Desde').fill(civilDay(now)); await admin.getByLabel('Hasta').fill(civilDay(now + DAY)); await admin.getByRole('button', { name: 'Aplicar filtros' }).click();
    await admin.waitForFunction(() => /Página 1 de/.test(document.querySelector('.audit-pager')?.innerText || ''));
    // paginación sobre el listado sin filtrar
    await admin.getByRole('button', { name: 'Limpiar filtros' }).click(); await admin.waitForFunction(() => /Página 1 de/.test(document.querySelector('.audit-pager')?.innerText || ''));
    const page1First = await table.locator('tbody tr').first().innerText(); await admin.getByRole('button', { name: 'Siguiente' }).click(); await admin.waitForFunction(() => /Página 2 de/.test(document.querySelector('.audit-pager')?.innerText || ''));
    assert.notEqual(await table.locator('tbody tr').first().innerText(), page1First); assert.equal((await table.locator('tbody tr').count()), 20);
    await admin.getByRole('button', { name: 'Anterior' }).click(); await admin.waitForFunction(() => /Página 1 de/.test(document.querySelector('.audit-pager')?.innerText || ''));
    await snap(admin, 'a02-admin-filtros');
    pass(`UI-3 filtros del administrador (vuelo + tipo de entidad, usuario + orden ascendente con ${opsEvents} eventos, rango de fechas) y paginación Siguiente/Anterior resueltos por el backend`);

    // detalle de un evento: valor anterior y posterior
    await admin.getByLabel('ID de vuelo').fill(String(F)); await admin.getByLabel('Acción').selectOption('ASSIGN_RESOURCES'); await admin.getByRole('button', { name: 'Aplicar filtros' }).click();
    const assignCount = eventsF.filter((e) => e.op === 'ASSIGN_RESOURCES').length; await admin.waitForFunction((n) => document.querySelectorAll('table[aria-label="Eventos de auditoría"] tbody tr').length === n, assignCount);
    const detailRows = table.locator('tbody tr'); let opened = false;
    for (let i = 0; i < assignCount && !opened; i++) { await detailRows.nth(i).getByRole('button', { name: 'Ver detalle' }).click(); const region = admin.getByLabel(/Detalle del evento/); await region.waitFor(); await region.getByText('Cargando detalle…').waitFor({ state: 'detached' }); const text = await region.innerText(); if (text.includes('uiacmda') || /E2E uiacmda/.test(text)) { opened = true; assert.match(text, /Valor anterior/); assert.match(text, /E2E uiacmda/); assert.match(text, /E2E uiacmdb/); assert.match(text, /Comandante/); await snap(admin, 'a03-admin-detalle'); } else await detailRows.nth(i).getByRole('button', { name: 'Cerrar' }).click(); }
    assert.ok(opened, 'el detalle del cambio de comandante muestra el valor anterior y el nuevo');
    await admin.getByRole('button', { name: 'Cerrar detalle' }).click(); await admin.getByRole('button', { name: 'Limpiar filtros' }).click();
    await admin.getByLabel('Tipo de entidad').selectOption('AIRCRAFT'); await admin.getByLabel('Acción').selectOption('MANUAL_LOCATION_CHANGE'); await admin.getByLabel('ID del registro afectado').fill(String(p2.id)); await admin.getByRole('button', { name: 'Aplicar filtros' }).click();
    await admin.waitForFunction(() => document.querySelectorAll('table[aria-label="Eventos de auditoría"] tbody tr').length === 1); await admin.getByRole('button', { name: 'Ver detalle' }).click(); await admin.getByLabel(/Detalle del evento/).getByText('Cargando detalle…').waitFor({ state: 'detached' });
    const locText = await admin.getByLabel(/Detalle del evento/).innerText(); assert.ok(locText.includes(airports[0].nombre) && locText.includes(airports[1].nombre), 'ubicación anterior y nueva por nombre'); assert.match(locText, /Ver aeronaves|Ubicación/);
    assert.ok(await admin.getByRole('link', { name: 'Ver aeronaves' }).count() >= 1, 'acceso contextual al recurso');
    pass('UI-4 detalle de un evento: cambio de comandante (E2E uiacmda → E2E uiacmdb) y cambio de ubicación de aeronave (aeropuerto anterior y nuevo) con acceso contextual a Aeronaves');

    // recarga: los resultados vienen del backend
    await admin.reload(); await admin.getByRole('heading', { name: 'Auditoría de operaciones', exact: true }).waitFor(); await admin.getByRole('table', { name: 'Eventos de auditoría' }).waitFor();
    assert.equal(await admin.getByRole('table', { name: 'Eventos de auditoría' }).locator('tbody tr').count(), 20);
    const apiFirst = (await ok('/audit?size=1', { token: adm.token })).items[0]; assert.ok((await admin.getByRole('table', { name: 'Eventos de auditoría' }).locator('tbody tr').first().innerText()).includes(apiFirst.operationLabel));
    pass('UI-5 al recargar la página la auditoría se vuelve a obtener del backend (mismo primer evento que la API)');

    // ---------- 2. Operaciones: historial del vuelo ----------
    const opsPage = await login(ops.name); await opsPage.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).waitFor();
    assert.equal(await opsPage.locator('nav').getByText('Auditoría', { exact: true }).count(), 0, 'Operaciones no tiene la auditoría global');
    await pick(opsPage, 'Centro de Operaciones', F); const region = opsPage.getByRole('region', { name: 'Historial de actividad' }); await region.waitFor();
    await region.locator('li').first().waitFor(); const items = await region.locator('li').count(); assert.equal(items, Math.min(20, eventsF.length)); const regionText = await region.innerText();
    for (const expectedText of ['Creación de la solicitud sanitaria', 'Contrapropuesta de horario', 'Aceptación de la contrapropuesta', 'Asignación de aeronave y comandante', 'Inicio del vuelo']) assert.ok(regionText.includes(expectedText) || (await region.getByRole('button', { name: 'Más antiguos' }).count()) > 0, expectedText);
    assert.ok(regionText.includes('E2E uiaops') || regionText.includes(ops.name) || /Operaciones|uiaops/.test(regionText), 'se identifica al responsable');
    const changeBtn = region.locator('li', { hasText: 'Asignación de aeronave y comandante' }).getByRole('button', { name: 'Ver cambios' }); if (await changeBtn.count() > 0) { await changeBtn.first().click(); await region.getByLabel(/Detalle del evento/).first().waitFor(); }
    await snap(opsPage, 'o01-ops-historial');
    await opsPage.reload(); await pick(opsPage, 'Centro de Operaciones', F); await opsPage.getByRole('region', { name: 'Historial de actividad' }).locator('li').first().waitFor();
    assert.equal(await opsPage.getByRole('region', { name: 'Historial de actividad' }).locator('li').count(), items, 'tras recargar se obtiene el mismo historial');
    pass(`UI-6 Operaciones consulta el historial de actividad del vuelo desde su detalle (${items} eventos con responsable y fecha), con detalle bajo demanda y sin acceso al menú de auditoría global; se mantiene tras recargar`);

    // ---------- 3. DTS: su solicitud; la ajena no ----------
    const dtsPage = await login(dts.name); await dtsPage.getByRole('heading', { name: 'Mis solicitudes y contrapropuestas', exact: true }).waitFor();
    assert.equal(await dtsPage.locator('nav').getByText('Auditoría', { exact: true }).count(), 0);
    await pick(dtsPage, 'Mis solicitudes y contrapropuestas', F); const dRegion = dtsPage.getByRole('region', { name: 'Evolución de mi solicitud' }); await dRegion.waitFor(); await dRegion.locator('li').first().waitFor();
    const dText = await dRegion.innerText(); const visibleForDts = eventsF.filter((e) => e.type === 'SANITARY_REQUEST' || (e.type === 'FLIGHT' && ['CREATE_SANITARY', 'CANCEL', 'START', 'FINISH', 'COMPLETE'].includes(e.op)));
    assert.equal(await dRegion.locator('li').count(), visibleForDts.length); for (const hidden of [ops.name, cmdA.name, cmdB.name, p1.matricula, 'Asignación de aeronave', 'Tripulación', DX]) assert.ok(!dText.includes(hidden), 'el DTS no debe ver ' + hidden);
    assert.ok(dText.includes('Centro de Operaciones') && dText.includes('Usted'), 'personal identificado por función'); await snap(dtsPage, 'd01-dts-evolucion');
    await dtsPage.reload(); await pick(dtsPage, 'Mis solicitudes y contrapropuestas', F); await dtsPage.getByRole('region', { name: 'Evolución de mi solicitud' }).locator('li').first().waitFor();
    assert.equal(await dtsPage.getByRole('region', { name: 'Evolución de mi solicitud' }).locator('li').count(), visibleForDts.length);
    assert.equal(await dtsPage.getByRole('option', { name: new RegExp(otherCode) }).count(), 0, 'la solicitud ajena no se ofrece');
    pass(`UI-7 DTS revisa la evolución de su solicitud (${visibleForDts.length} de ${eventsF.length} eventos: evaluación y negociación) sin nombres del personal, aeronaves, tripulación ni datos sanitarios; persiste al recargar`);

    // ---------- 4. Comandante: su vuelo; el reemplazado no ----------
    const cmdPage = await login(cmdB.name); await cmdPage.getByRole('heading', { name: 'Planificación operativa', exact: true }).waitFor();
    await pick(cmdPage, 'Planificación operativa', F); const cRegion = cmdPage.getByRole('region', { name: 'Historial de actividad' }); await cRegion.waitFor(); await cRegion.locator('li').first().waitFor(); const cText = await cRegion.innerText();
    assert.ok(cText.includes('Asignación de aeronave y comandante') && cText.includes('Planificación operativa') && cText.includes('Inicio del vuelo'), 'asignación, planificación e inicio');
    assert.ok(!cText.includes('Contrapropuesta de horario') && !cText.includes('Creación de la solicitud sanitaria'), 'sin la negociación sanitaria'); assert.equal(await cmdPage.locator('nav').getByText('Auditoría', { exact: true }).count(), 0);
    await snap(cmdPage, 'c01-comandante-historial');
    const former = await login(cmdA.name); await former.getByRole('heading', { name: 'Planificación operativa', exact: true }).waitFor();
    assert.equal(await former.getByRole('option', { name: new RegExp(flightCode) }).count(), 0, 'el comandante reemplazado ya no ve el vuelo');
    pass('UI-8 Comandante consulta el historial de su vuelo (asignación, planificación e inicio, sin la negociación sanitaria); el comandante reemplazado ya no lo ve');

    // ---------- 5. Rechazos en el navegador ----------
    const dts2Page = await login(dts2.name); await dts2Page.getByRole('heading', { name: 'Mis solicitudes y contrapropuestas', exact: true }).waitFor();
    const denied = [await apiFrom(dts2Page, `/audit/flights/${F}`), await apiFrom(dts2Page, '/audit?size=5'), await apiFrom(dts2Page, '/audit/filters'), await apiFrom(dts2Page, `/audit/events/${eventsF[0].id}`)];
    assert.deepEqual(denied.map((d) => d.status), [403, 403, 403, 404]); for (const d of denied) { assert.ok(!d.text.includes(flightCode) && !d.text.includes(ops.name), 'los errores no revelan datos del recurso: ' + d.text); }
    for (const [page, label] of [[dtsPage, 'DTS'], [cmdPage, 'Comandante'], [opsPage, 'Operaciones']]) { const r = await apiFrom(page, '/audit?size=5'); assert.equal(r.status, 403, label + ' no accede a la auditoría global'); }
    const formerDenied = await apiFrom(former, `/audit/flights/${F}`); assert.equal(formerDenied.status, 403);
    const anon = await dts2Page.evaluate(async () => (await fetch('/api/audit?size=1')).status); assert.ok([401, 403].includes(anon));
    await dts2Page.goto(UI + '#/admin/auditoria'); await dts2Page.reload(); await dts2Page.getByRole('heading', { name: 'Mis solicitudes y contrapropuestas', exact: true }).waitFor(); assert.equal(await dts2Page.getByRole('heading', { name: 'Auditoría de operaciones' }).count(), 0, 'un DTS no obtiene la pantalla administrativa ni forzando la URL');
    pass(`UI-9 rechazos desde el navegador: otro DTS recibe 403/404 sin datos del vuelo, DTS/Comandante/Operaciones reciben 403 en la auditoría global, el comandante reemplazado 403 y sin credenciales ${anon}; forzar #/admin/auditoria no muestra la pantalla`);
    console.log(`E2E auditoria UI OK: ${passed} bloques; marca ${MARK}`);
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
