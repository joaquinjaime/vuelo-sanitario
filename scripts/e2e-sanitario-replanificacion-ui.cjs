/* I-5.3 D+E: recorrido sanitario completo y replanificación de punta a punta con Chrome real (Playwright), el backend y SQL Server E2E aislados.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados en vuelos_sanitarios_e2e.
 *  D) DTS registra la solicitud sanitaria (paciente, datos médicos, origen/destino, horario) → Operaciones acepta el horario y asigna aeronave y comandante
 *     → el comandante planifica aeropuertos y presenta la ruta con alternativo → Operaciones la aprueba; SQL verifica relaciones, estados, auditoría y avisos.
 *     (En un vuelo sanitario la asignación deja el vuelo PLANIFICADO: el comandante no acepta una asignación, planifica; la aceptación sólo existe en el flujo operativo.)
 *  E) Replanificación: cambio de aeronave y de destino invalidan la ruta vigente conservando sus versiones; avisos; presentación de nuevas versiones; devolución;
 *     versiones obsoletas rechazadas; inicio bloqueado hasta una ruta válida; interacción con alternativos (coincidencia con el destino, bajas del catálogo);
 *     replanificación de un vuelo operativo rechazado desde la interfaz. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const { ROOT, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');

const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
const DAY = 86400000, TZ = -3 * 3600000;
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const reqState = (id) => one(`SELECT es.codigo_estado_solicitud FROM vuelos_sanitarios s JOIN estados_solicitud_sanitaria es ON es.id_estados_solicitud_sanitaria=s.id_estados_solicitud_sanitaria WHERE s.id_vuelos=${id}`);
const flightByMotive = (motive) => Number(one(`SELECT TOP 1 id_vuelos FROM vuelos WHERE motivo_vuelo=N'${motive}' ORDER BY id_vuelos DESC`));
const routeRows = (id) => sql(`SELECT CONCAT(version,'|',estado_revision,'|',es_version_actual,'|',ISNULL(CAST(id_aeropuerto_alternativo AS varchar),'-')) FROM rutas_vuelo WHERE id_vuelos=${id} ORDER BY version`).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const routeState = (id) => one(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${id} AND es_version_actual=1`);
const audit = (id, entity, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${id} AND tipo_entidad=N'${entity}' AND operacion=N'${op}'`);
const notes = (flightId, type, userId) => count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${flightId} AND tipo_notificacion=N'${type}' AND id_usuarios=${userId}`);
const civilDay = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);
const input = (ms, hhmm) => `${civilDay(ms)}T${hhmm}`;
const localInput = (d) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
async function until(fn, what, ms = 45000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, 400)); } throw new Error('Tiempo agotado esperando: ' + what + (last instanceof Error ? ' (' + last.message + ')' : '')); }

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && DB_NAME === 'vuelos_sanitarios_e2e', 'El backend no apunta a la base E2E');
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 56);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  console.log('Preparando cuentas y catálogos de ensayo…');
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'sfops'), dts = await createUser(admin, 'DTS', 'sfdts'), cmd = await createUser(admin, 'COMANDANTE', 'sfcmd'), cmdOp = await createUser(admin, 'COMANDANTE', 'sfcmo');
  for (const c of [cmd, cmdOp]) await provision(admin, c);
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
  assert.ok(province, 'se requiere una provincia con 2 aeropuertos y 2 localidades');
  for (const c of [cmd, cmdOp]) await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  const suffix = String(Date.now()).slice(-7); let seq = 0;
  const newAirport = async (label) => { const n = ++seq; return ok('/admin/geography/airports', { method: 'POST', token: admin, body: { codigoOficial: `SF${suffix}${n}`, nombre: `Aeropuerto ${label} ${MARK}`, ciudad: 'Ciudad E2E', provinciaId: province.id, localidadId: null, tipo: 'AERODROMO', pais: 'Argentina', latitud: -26.5, longitud: -65.1 } }); };
  const alt1 = await newAirport('Alternativo uno'), alt2 = await newAirport('Alternativo dos'), alt3 = await newAirport('Alternativo tres'), destA = await newAirport('Destino sanitario');
  const newPlane = async (airport = airports[0]) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'S' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airport.id, activo: true } });
  const plane = await newPlane(), plane2 = await newPlane();
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0]; const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token });
  const surname = MARK.replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)]), patientDni = String(30000000 + Math.floor(Math.random() * 9999990));
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Sanitario', apellido: surname, dni: patientDni } });
  const nowMs = Date.now(), motive = 'Sanitario completo ' + MARK;

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (name) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const res = await r; if (!res.ok()) throw new Error('UI login HTTP ' + res.status()); return p; };
  const snap = async (p, n) => { try { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); } catch { /* la captura es opcional */ } };
  const pick = async (p, heading, id) => { const card = p.getByRole('heading', { name: heading, exact: true }).locator('..'); await card.locator('select').first().selectOption(String(id), { timeout: 90000 }); return card; };
  const routePanel = (p) => p.getByRole('heading', { name: 'Ruta operativa' }).locator('..');
  try {
    // ================= D: recorrido sanitario =================
    const dtsPage = await login(dts.name); const form = dtsPage.locator('form').first();
    await form.locator('label', { hasText: /^Paciente/ }).locator('select').first().selectOption('search');
    await form.getByLabel('Nombre', { exact: true }).fill('Sanitario'); await form.getByLabel('Apellido', { exact: true }).fill(surname); await form.getByRole('button', { name: 'Buscar paciente' }).click();
    const results = form.locator('.patient-results li'); await results.first().waitFor(); assert.equal(await results.count(), 1);
    assert.equal(await form.getByText(patientDni).count(), 0, 'el DNI completo no se muestra'); await results.first().getByRole('button', { name: 'Seleccionar' }).click(); await form.getByText(/Paciente seleccionado/).waitFor();
    for (const [kind, locality] of [['origen', localities[0]], ['destino', localities[1]]]) { await dtsPage.getByLabel(`Provincia ${kind}`).selectOption(String(province.id)); await dtsPage.getByLabel(`Buscar localidad ${kind}`).fill(locality.nombre.slice(0, 5)); await dtsPage.getByLabel(`Buscar localidad ${kind}`).focus(); await dtsPage.getByRole('option', { name: new RegExp(locality.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click(); }
    await form.getByLabel('Fecha y hora solicitada').fill(input(nowMs + 6 * DAY, '10:00')); await form.getByLabel('Diagnóstico').fill('Dx-' + MARK); await form.getByLabel('Condición').fill('ESTABLE'); await form.locator('textarea').last().fill(motive);
    await form.getByRole('button', { name: 'Crear solicitud' }).click(); await dtsPage.getByText('✓ Solicitud registrada').waitFor();
    const F = flightByMotive(motive); assert.ok(F > 0);
    assert.equal(reqState(F), 'SOLICITADO'); assert.equal(stateOf(F), 'NULL');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${F} AND id_pacientes=${patient.id} AND id_usuario_solicitante=${dts.id} AND id_localidad_origen=${localities[0].id} AND id_localidad_destino=${localities[1].id}`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM informacion_medica_vuelo WHERE id_vuelos=${F} AND diagnostico=N'Dx-${MARK}'`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM negociaciones_horario_vuelo WHERE id_vuelos=${F} AND tipo_negociacion=N'DTS_PROPUESTA'`), 1); assert.equal(audit(F, 'FLIGHT', 'CREATE_SANITARY'), 1);
    assert.ok(count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${F} AND tipo_notificacion=N'NEW_SANITARY_REQUEST'`) >= 1, 'Operaciones recibió el aviso de la solicitud');
    await snap(dtsPage, 'sf01-dts');
    pass('D1 DTS busca al paciente, completa origen/destino, horario y datos médicos y registra la solicitud; SQL conserva paciente, localidades, datos clínicos, negociación inicial, auditoría y aviso');

    const opsPage = await login(ops.name); let card = await pick(opsPage, 'Centro de Operaciones', F);
    await card.getByRole('button', { name: 'Aceptar horario DTS' }).click(); await opsPage.getByText('✓ Horario aceptado').waitFor();
    assert.equal(reqState(F), 'APROBADO');
    const assign = opsPage.locator('.detail-actions', { has: opsPage.getByRole('heading', { name: /de recursos/ }) });
    await assign.getByRole('button', { name: 'Consultar disponibilidad' }).click();
    await assign.locator('select').first().waitFor({ timeout: 150000 }).catch(async () => { console.error('Panel de asignación:', await assign.innerText().catch(() => '(sin panel)'), '| avisos:', await opsPage.locator('.error, [role=alert], .notice').allTextContents()); throw new Error('no aparecieron las listas de recursos'); });
    await assign.locator('label').filter({ hasText: /^Aeronave/ }).locator('select').selectOption(String(plane.id), { timeout: 60000 });
    await assign.locator('label').filter({ hasText: /^Comandante/ }).locator('select').selectOption(String(cmd.id), { timeout: 60000 });
    await assign.getByRole('button', { name: 'Confirmar asignación' }).click(); await opsPage.getByText('Recursos asignados').waitFor();
    assert.equal(stateOf(F), 'PLANIFICADO'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${F} AND id_aeronaves=${plane.id} AND id_usuario_comandante=${cmd.id}`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes vt JOIN roles_tripulacion r ON r.id_roles_tripulacion=vt.id_roles_tripulacion WHERE vt.id_vuelos=${F} AND vt.id_usuarios=${cmd.id} AND r.codigo_rol_tripulacion=N'COMANDANTE' AND vt.fecha_baja IS NULL`), 1, 'una sola fila activa de comandante');
    assert.equal(audit(F, 'FLIGHT', 'ASSIGN_RESOURCES'), 1); assert.equal(notes(F, 'COMMANDER_ASSIGNED', cmd.id), 1);
    pass('D2 Operaciones evalúa y acepta el horario, consulta disponibilidad y asigna aeronave y comandante válidos; el vuelo queda PLANIFICADO con tripulación, auditoría y aviso al comandante');

    const cmdPage = await login(cmd.name); const planning = await pick(cmdPage, 'Planificación operativa', F);
    await planning.locator('label').filter({ hasText: /^Aeropuerto de origen/ }).locator('select').selectOption(String(airports[0].id), { timeout: 60000 });
    await planning.locator('label').filter({ hasText: /^Aeropuerto de destino/ }).locator('select').selectOption(String(destA.id), { timeout: 60000 });
    const salidaMs = new Date(one(`SELECT CONVERT(varchar(19),fecha_planificada_salida,126) FROM vuelos WHERE id_vuelos=${F}`) + 'Z').getTime();
    await planning.getByLabel('Llegada planificada').fill(localInput(new Date(salidaMs + 3 * 3600000 + new Date().getTimezoneOffset() * 60000)));
    await planning.getByRole('button', { name: 'Guardar planificación' }).click(); await cmdPage.getByText('Planificación operativa guardada').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${F} AND id_aeropuerto_origen=${airports[0].id} AND id_aeropuerto_destino=${destA.id} AND fecha_planificada_llegada IS NOT NULL`), 1);
    const panel = routePanel(cmdPage);
    await panel.getByLabel('Recorrido y puntos intermedios en orden').fill('Ruta sanitaria ' + MARK); await panel.getByLabel('Buscar aeropuerto alternativo').fill(alt1.nombre);
    await panel.locator('label').filter({ hasText: /^Aeropuerto alternativo/ }).locator('select').selectOption(String(alt1.id), { timeout: 60000 });
    await panel.getByRole('button', { name: 'Guardar y presentar a Operaciones' }).click(); await cmdPage.getByText('Ruta presentada a Operaciones').waitFor();
    assert.deepEqual(routeRows(F), [`1|PENDIENTE_REVISION|1|${alt1.id}`]);
    assert.ok(notes(F, 'ROUTE_PENDING_REVIEW', ops.id) >= 1, 'Operaciones recibió el aviso de ruta pendiente');
    const early = await call(`/flights/${F}/start`, { method: 'POST', token: ops.token, expect: [409] }); assert.equal(early.data.code, 'RUTA_PENDIENTE_REVISION', 'no se inicia con la ruta pendiente de aprobación');
    pass('D3 el comandante planifica origen, destino y llegada y presenta la ruta con un alternativo activo; SQL guarda la versión 1 pendiente y el inicio queda bloqueado (409 RUTA_PENDIENTE_REVISION)');

    await opsPage.reload(); card = await pick(opsPage, 'Centro de Operaciones', F);
    await card.getByText(/Revisión de Operaciones · versión 1/).waitFor(); await card.getByRole('button', { name: 'Aprobar ruta' }).click();
    await until(() => routeState(F) === 'APROBADA', 'aprobación de la ruta v1');
    assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${F} AND version=1 AND id_usuario_revisor=${ops.id} AND fecha_revision IS NOT NULL`), 1);
    assert.equal(audit(F, 'FLIGHT_ROUTE', 'CREATE'), 1); assert.equal(audit(F, 'FLIGHT_ROUTE', 'SUBMIT'), 1); assert.equal(audit(F, 'FLIGHT_ROUTE', 'APPROVE'), 1); assert.equal(notes(F, 'ROUTE_APPROVED', cmd.id), 1);
    pass('D4 Operaciones aprueba la ruta desde la interfaz; estados, revisor, auditoría y aviso al comandante quedan en SQL');

    // verificaciones de integridad del recorrido (22–25)
    assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN vuelos_sanitarios s ON s.id_vuelos=v.id_vuelos JOIN pacientes p ON p.id_pacientes=s.id_pacientes JOIN aeronaves a ON a.id_aeronaves=v.id_aeronaves JOIN rutas_vuelo r ON r.id_vuelos=v.id_vuelos JOIN informacion_medica_vuelo m ON m.id_vuelos=v.id_vuelos WHERE v.id_vuelos=${F} AND r.es_version_actual=1`), 1, 'la unión vuelo-sanitario-paciente-aeronave-ruta-datos médicos produce una única fila');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios s LEFT JOIN vuelos v ON v.id_vuelos=s.id_vuelos WHERE v.id_vuelos IS NULL`), 0, 'sin extensiones sanitarias huérfanas');
    assert.equal(count(`SELECT COUNT(*) FROM (SELECT id_vuelos FROM rutas_vuelo WHERE id_vuelos=${F} AND es_version_actual=1 GROUP BY id_vuelos HAVING COUNT(*)>1) x`), 0, 'una sola versión vigente');
    assert.equal(count(`SELECT COUNT(*) FROM informacion_medica_vuelo WHERE id_vuelos=${F}`), 1); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE motivo_vuelo=N'${motive}'`), 1, 'sin duplicaciones del vuelo');
    pass('D5 SQL confirma las relaciones vuelo–solicitud–paciente–aeronave–comandante–ruta–datos médicos, sin huérfanos ni duplicados');

    // ================= E: replanificación =================
    // E1 cambio de aeronave por Operaciones (la nueva aeronave debe estar en el origen planificado)
    await ok(`/flights/${F}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: plane2.id, motivo: 'Mantenimiento programado de la aeronave' } });
    assert.equal(routeState(F), 'REQUIERE_REVISION'); assert.match(one(`SELECT causa_invalidacion FROM rutas_vuelo WHERE id_vuelos=${F} AND version=1`), /aeronave/);
    assert.equal(audit(F, 'FLIGHT_ROUTE', 'INVALIDATE'), 1); assert.equal(notes(F, 'ROUTE_REVIEW_REQUIRED', cmd.id), 1); assert.ok(notes(F, 'ROUTE_REVIEW_REQUIRED', ops.id) >= 1);
    assert.equal((await call(`/flights/${F}/start`, { method: 'POST', token: ops.token, expect: [409] })).data.code, 'RUTA_REQUIERE_REVISION');
    await cmdPage.reload(); await pick(cmdPage, 'Planificación operativa', F); const panel2 = routePanel(cmdPage);
    await panel2.getByText(/Motivo de la nueva revisión/).waitFor(); await panel2.getByText(/aeronave/).first().waitFor();
    pass('E1 el cambio de aeronave deja la ruta aprobada en REQUIERE_REVISION con su causa; se notifica al comandante y a Operaciones, se audita y el inicio responde 409; el comandante ve el motivo');

    // E2 nueva versión desde la interfaz, con otro alternativo y motivo de modificación
    await panel2.getByLabel('Recorrido y puntos intermedios en orden').fill('Ruta sanitaria v2 ' + MARK); await panel2.getByLabel('Buscar aeropuerto alternativo').fill(alt2.nombre);
    await panel2.locator('label').filter({ hasText: /^Aeropuerto alternativo/ }).locator('select').selectOption(String(alt2.id), { timeout: 60000 });
    await panel2.getByLabel('Motivo de la modificación').fill('Cambio de aeronave: se ajusta el alternativo'); await panel2.getByRole('button', { name: 'Guardar y presentar a Operaciones' }).click(); await cmdPage.getByText('Ruta presentada a Operaciones').waitFor();
    assert.deepEqual(routeRows(F), [`1|REQUIERE_REVISION|0|${alt1.id}`, `2|PENDIENTE_REVISION|1|${alt2.id}`]);
    assert.equal((await call(`/flights/${F}/route/approve`, { method: 'POST', token: ops.token, body: { version: 1 }, expect: [409] })).data.code, 'VERSION_RUTA_DESACTUALIZADA', 'una versión anterior no se aprueba');
    assert.equal((await call(`/flights/${F}/start`, { method: 'POST', token: ops.token, expect: [409] })).data.code, 'RUTA_PENDIENTE_REVISION');
    pass('E2 el comandante presenta la versión 2 (la 1 se conserva con su estado y alternativo); aprobar la versión 1 responde 409 VERSION_RUTA_DESACTUALIZADA y el inicio sigue bloqueado');

    // E3 devolución desde la interfaz y corrección
    await opsPage.reload(); card = await pick(opsPage, 'Centro de Operaciones', F); await card.getByLabel('Motivo de la devolución (obligatorio)').fill('Falta el tiempo estimado en el recorrido'); await card.getByRole('button', { name: 'Devolver con observaciones' }).click();
    await until(() => routeState(F) === 'DEVUELTA', 'devolución de la versión 2'); assert.ok(notes(F, 'ROUTE_RETURNED', cmd.id) >= 1);
    await cmdPage.reload(); await pick(cmdPage, 'Planificación operativa', F); const panel3 = routePanel(cmdPage); await panel3.getByText(/Falta el tiempo estimado/).first().waitFor();
    await panel3.getByLabel('Tiempo estimado (minutos)').fill('95'); await panel3.getByLabel('Motivo de la modificación').fill('Se agrega el tiempo estimado pedido'); await panel3.getByRole('button', { name: 'Guardar y presentar a Operaciones' }).click(); await cmdPage.getByText('Ruta presentada a Operaciones').waitFor();
    assert.deepEqual(routeRows(F), [`1|REQUIERE_REVISION|0|${alt1.id}`, `2|DEVUELTA|0|${alt2.id}`, `3|PENDIENTE_REVISION|1|${alt2.id}`]);
    await opsPage.reload(); card = await pick(opsPage, 'Centro de Operaciones', F); await card.getByRole('button', { name: 'Aprobar ruta' }).click(); await until(() => routeState(F) === 'APROBADA', 'aprobación de la versión 3');
    assert.equal(routeRows(F).length, 3); assert.equal(audit(F, 'FLIGHT_ROUTE', 'RETURN'), 1); assert.equal(audit(F, 'FLIGHT_ROUTE', 'APPROVE'), 2);
    pass('E3 Operaciones devuelve la versión 2 con observaciones, el comandante la corrige en la versión 3 y Operaciones la aprueba; las tres versiones y sus decisiones se conservan');

    // E4 cambio de destino a un aeropuerto que es el alternativo vigente
    const clash = await call(`/flights/${F}/operational-planning`, { method: 'POST', token: cmd.token, body: { origenId: airports[0].id, destinoId: alt2.id, llegada: one(`SELECT CONVERT(varchar(19),fecha_planificada_llegada,126) FROM vuelos WHERE id_vuelos=${F}`) } });
    assert.equal(clash.status, 200); assert.equal(routeState(F), 'REQUIERE_REVISION'); const cause = one(`SELECT causa_invalidacion FROM rutas_vuelo WHERE id_vuelos=${F} AND version=3`); assert.match(cause, /destino/); assert.match(cause, /alternativo coincide/);
    const sameAlt = await call(`/flights/${F}/route`, { method: 'PUT', token: cmd.token, body: { version: 3, recorrido: 'Con el mismo alternativo', alternativoId: alt2.id, presentar: true, motivoModificacion: 'Intento con alternativo igual al destino' }, expect: [400] }); assert.match(sameAlt.data.error, /distinto del destino/);
    assert.equal(routeRows(F).length, 3, 'el intento rechazado no crea versiones');
    await ok(`/flights/${F}/route`, { method: 'PUT', token: cmd.token, body: { version: 3, recorrido: 'Ruta sanitaria v4 ' + MARK, alternativoId: alt3.id, tiempoEstimadoMinutos: 100, presentar: true, motivoModificacion: 'Nuevo destino: se elige otro alternativo' } });
    assert.equal((await call(`/admin/geography/airports/${alt3.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Intento E2E' }, expect: [409] })).data.vigentes.RUTAS_ALTERNATIVAS_VIGENTES, 1, 'el alternativo de la versión vigente (aún pendiente) está protegido');
    await ok(`/flights/${F}/route/approve`, { method: 'POST', token: ops.token, body: { version: 4 } }); assert.equal(routeState(F), 'APROBADA');
    const released = await call(`/admin/geography/airports/${alt1.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Alternativo histórico E2E' } }); assert.equal(released.data.dependencias.historicas.VERSIONES_RUTA_HISTORICAS, 1);
    assert.equal((await call(`/admin/geography/airports/${alt2.id}/active`, { method: 'POST', token: admin, body: { activo: false }, expect: [409] })).data.vigentes.VUELOS_VIGENTES, 1, 'el nuevo destino del vuelo abierto está protegido');
    assert.deepEqual(routeRows(F), [`1|REQUIERE_REVISION|0|${alt1.id}`, `2|DEVUELTA|0|${alt2.id}`, `3|REQUIERE_REVISION|0|${alt2.id}`, `4|APROBADA|0|${alt3.id}`.replace('|0|', '|1|')]);
    pass('E4 cambiar el destino al alternativo vigente invalida la ruta con ambas causas, no admite un alternativo igual al destino, protege el alternativo de la versión vigente y libera el de una versión histórica sin perder sus datos');

    // E5 inicio con la ruta válida y auditoría completa
    const started = await call(`/flights/${F}/start`, { method: 'POST', token: ops.token }); assert.equal(started.data.estadoVuelo, 'EN_CURSO'); assert.equal(stateOf(F), 'EN_CURSO');
    assert.equal((await call(`/admin/geography/airports/${alt2.id}/active`, { method: 'POST', token: admin, body: { activo: false }, expect: [409] })).data.code, 'GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES', 'un vuelo en curso protege su destino vigente');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${F} AND id_aeropuerto_destino=${alt2.id} AND id_aeropuerto_origen=${airports[0].id}`), 1);
    const freed = await call(`/admin/geography/airports/${destA.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Destino reemplazado por la replanificación' } }); assert.equal(freed.data.activo, false, 'el destino anterior, ya sin referencias vigentes, puede darse de baja');
    assert.ok(audit(F, 'FLIGHT_ROUTE', 'INVALIDATE') >= 2); assert.equal(audit(F, 'FLIGHT_ROUTE', 'APPROVE'), 3);
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${F} AND tipo_entidad=N'FLIGHT_ROUTE'`), audit(F, 'FLIGHT_ROUTE', 'CREATE') + audit(F, 'FLIGHT_ROUTE', 'UPDATE') + audit(F, 'FLIGHT_ROUTE', 'SUBMIT') + audit(F, 'FLIGHT_ROUTE', 'APPROVE') + audit(F, 'FLIGHT_ROUTE', 'RETURN') + audit(F, 'FLIGHT_ROUTE', 'INVALIDATE') + audit(F, 'FLIGHT_ROUTE', 'START_REJECTED'), 'cada evento de ruta es de un tipo conocido y ninguno se perdió');
    pass('E5 con la versión 4 aprobada el vuelo inicia; los rechazos de inicio previos, las invalidaciones y las cuatro versiones quedan auditados');

    // E5b el administrador ve en la interfaz qué baja está bloqueada y qué aeropuerto inactivo conserva historia
    const adminCtx = await browser.newContext(); const adminPage = await adminCtx.newPage(); adminPage.setDefaultTimeout(60000); adminPage.on('dialog', (d) => d.accept()); await adminPage.goto(UI);
    await adminPage.getByLabel('Usuario', { exact: true }).fill(dotenv.BOOTSTRAP_ADMIN_USERNAME); await adminPage.getByLabel('Contraseña', { exact: true }).fill(dotenv.BOOTSTRAP_ADMIN_PASSWORD); await adminPage.getByRole('button', { name: 'Iniciar sesión' }).click();
    await adminPage.getByText('Geografía', { exact: true }).first().click(); await adminPage.getByRole('button', { name: 'Aeropuertos', exact: true }).click();
    await adminPage.getByLabel('Buscar', { exact: true }).fill(alt2.nombre);
    const blockedRow = adminPage.locator('tr', { hasText: alt2.nombre }); await blockedRow.getByTestId('geo-blocked').waitFor(); await blockedRow.getByTestId('geo-blocked').filter({ hasText: /vuelos vigentes/ }).waitFor();
    assert.equal(await blockedRow.getByRole('button', { name: 'Desactivar' }).isDisabled(), true, 'la baja del destino de un vuelo en curso está bloqueada en la interfaz');
    await adminPage.getByLabel('Buscar', { exact: true }).fill(alt1.nombre);
    const historyRow = adminPage.locator('tr', { hasText: alt1.nombre }); await historyRow.getByRole('button', { name: 'Reactivar' }).waitFor(); await historyRow.getByTestId('geo-history').filter({ hasText: /versiones de ruta anteriores/ }).waitFor();
    await historyRow.getByRole('button', { name: 'Reactivar' }).click(); await adminPage.getByText('Registro reactivado').waitFor();
    assert.equal(count(`SELECT esta_activo FROM aeropuertos WHERE id_aeropuertos=${alt1.id}`), 1); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'GEOGRAPHIC_AIRPORT' AND entidad_id=${alt1.id} AND operacion=N'SET_ACTIVE'`), 2);
    await snap(adminPage, 'sf98-geografia');
    pass('E5b en la interfaz de administración la baja del destino de un vuelo en curso aparece bloqueada con su motivo, el aeropuerto inactivo muestra su historia conservada y se reactiva con el mismo identificador');

    // E6 replanificación de un vuelo operativo rechazado por el comandante, desde la interfaz
    const opPlane = await newPlane(), when = futureSlot(); const op = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REPOSICIONAMIENTO', motivoVuelo: 'Operativo replan ' + MARK, aircraftId: opPlane.id, comandanteId: cmdOp.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } })).id;
    const cmdOpPage = await login(cmdOp.name); await pick(cmdOpPage, 'Planificación operativa', op); await cmdOpPage.getByLabel('Motivo (obligatorio para rechazar o proponer)').fill('No puedo realizar este traslado'); await cmdOpPage.getByRole('button', { name: 'Rechazar y devolver a Operaciones' }).click();
    await until(() => stateOf(op) === 'PENDIENTE_REPLANIFICACION', 'rechazo del comandante');
    await opsPage.reload(); await pick(opsPage, 'Centro de Operaciones', op); const replan = opsPage.locator('.detail-actions', { has: opsPage.getByRole('heading', { name: 'Replanificar asignación' }) });
    await replan.getByRole('heading', { name: 'Replanificar asignación' }).waitFor(); await replan.locator('label').filter({ hasText: /^Aeronave/ }).locator('select').selectOption(String(opPlane.id), { timeout: 60000 }); await replan.locator('label').filter({ hasText: /^Comandante/ }).locator('select').selectOption(String(cmdOp.id), { timeout: 60000 });
    await replan.getByLabel('Buscar aeropuerto de destino').fill(alt3.nombre); await replan.locator('label').filter({ hasText: /^Destino/ }).locator('select').selectOption(String(alt3.id), { timeout: 60000 });
    const when2 = futureSlot(); await replan.getByLabel('Salida').fill(localInput(when2)); await replan.getByLabel('Llegada').fill(localInput(new Date(when2.getTime() + 7200000)));
    await replan.getByRole('button', { name: 'Enviar nueva asignación' }).click(); await opsPage.getByText('Nueva asignación enviada al comandante').waitFor();
    assert.equal(stateOf(op), 'PENDIENTE_CONFIRMACION_COMANDANTE'); assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN tipos_vuelo t ON t.id_tipos_vuelo=v.id_tipos_vuelo WHERE v.id_vuelos=${op} AND t.codigo_tipo_vuelo=N'REPOSICIONAMIENTO' AND v.id_aeropuerto_destino=${alt3.id}`), 1, 'el destino buscado se persistió y el tipo no cambió');
    assert.equal(audit(op, 'FLIGHT', 'REPLAN_OPERATIONAL'), 1); assert.ok(notes(op, 'COMMANDER_ASSIGNMENT_PENDING', cmdOp.id) >= 2, 'el comandante fue notificado de la nueva asignación');
    await cmdOpPage.reload(); await pick(cmdOpPage, 'Planificación operativa', op); await cmdOpPage.getByRole('button', { name: 'Aceptar asignación' }).click(); await until(() => stateOf(op) === 'PLANIFICADO', 'aceptación tras la replanificación');
    pass('E6 un vuelo operativo rechazado se replanifica desde la interfaz con destino buscado en el catálogo activo; el tipo no cambia, se audita, se notifica y el comandante acepta la nueva asignación');

    assert.equal(count(`SELECT COUNT(*) FROM vuelos v WHERE v.motivo_vuelo LIKE N'%${MARK}' AND v.id_aeronaves IS NOT NULL AND NOT EXISTS (SELECT 1 FROM aeronaves a WHERE a.id_aeronaves=v.id_aeronaves)`), 0);
    await snap(opsPage, 'sf99-final');
  } catch (e) { try { for (const [i, c] of browser.contexts().entries()) for (const p of c.pages()) await snap(p, 'sf-fallo-' + i); } catch { /* sin capturas */ } throw e; }
  finally { await browser.close(); }
  console.log(`\nE2E SANITARIO + REPLANIFICACIÓN UI COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E SANITARIO UI:', e.stack || e); process.exit(1); });
