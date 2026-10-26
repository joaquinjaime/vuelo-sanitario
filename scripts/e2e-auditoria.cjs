/* E2E de la consulta de auditoría por roles sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e en V46).
 * Los eventos NO se insertan a mano: los generan los endpoints de negocio (solicitud, negociación, asignación, cambio de comandante,
 * planificación, inicio, fin, informe final, aeronaves, usuarios) con el reloj ajustable E2E cruzando la medianoche de la zona de negocio.
 * Luego se consultan con ADMINISTRADOR, Operaciones, DTS y Comandante, y se contrasta cada respuesta con SQL Server.
 * Sólo crea registros marcados; nunca modifica la base habitual. Objetos temporales (un trigger que fuerza un fallo de auditoría) los crea y
 * elimina este script. Uso: node scripts/e2e-auditoria.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, PASSWORD, sleep, sql, one, count, call, ok, fmt, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const HOUR = 3600000, DAY = 86400000, TZ_OFFSET = -3 * HOUR; // America/Argentina/Tucuman, sin horario de verano
const civilDay = (ms) => new Date(ms + TZ_OFFSET).toISOString().slice(0, 10);
const atLocal = (day, hhmm) => Date.parse(`${day}T${hhmm}:00Z`) - TZ_OFFSET;   // instante (ms) de una hora civil de la zona de negocio
const addDays = (day, n) => civilDay(Date.parse(`${day}T12:00:00Z`) - TZ_OFFSET + n * DAY);
const ids = (rows) => rows.map((r) => Number(r.id));
const utc = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e') && env.APP_E2E_CONTROLS_ENABLED === 'true', 'El backend no es el stack E2E aislado');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 47, 'La base aislada debe estar en V47 (o posterior)');
  assert.equal(count("SELECT COUNT(*) FROM sys.triggers WHERE name=N'tr_eventos_auditoria_inmutable' AND parent_id=OBJECT_ID('eventos_auditoria')"), 1);
  for (const ix of ['idx_eventos_auditoria_fecha', 'idx_eventos_auditoria_vuelo_fecha', 'idx_eventos_auditoria_actor_fecha', 'idx_eventos_auditoria_entidad_fecha', 'idx_eventos_auditoria_tipo_operacion'])
    assert.equal(count(`SELECT COUNT(*) FROM sys.indexes WHERE name=N'${ix}' AND object_id=OBJECT_ID('eventos_auditoria')`), 1, ix);
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const clock = { get: async () => ok('/e2e/clock', { token: admin }), set: async (ms) => ok('/e2e/clock', { method: 'PUT', token: admin, body: { instant: new Date(ms).toISOString() } }), reset: async () => ok('/e2e/clock', { method: 'PUT', token: admin, body: { reset: true } }) };
  await clock.reset();
  pass('base aislada en V46 con los 5 índices y el trigger de inmutabilidad; backend E2E saludable con reloj ajustable');

  try {
    // ---------- Fixtures ----------
    const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'aops'), ops2 = await createUser(admin, 'OPERACIONES', 'aops2'), ops3 = await createUser(admin, 'OPERACIONES', 'aops3');
    const dts = await createUser(admin, 'DTS', 'adts'), dts2 = await createUser(admin, 'DTS', 'adts2');
    const cmd = {}; for (const n of ['cmdA', 'cmdB', 'cmdC']) { cmd[n] = await createUser(admin, 'COMANDANTE', n); await provision(admin, cmd[n]); }
    let province, airports, localities;
    for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
    assert.ok(province, 'Se requiere una provincia con dos aeropuertos y dos localidades');
    for (const n of Object.keys(cmd)) await call(`/catalogs/commanders/${cmd[n].id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
    let plateSeq = 0; const newPlane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'A' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
    const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
    const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Auditoria', apellido: MARK } });
    const DX = 'DxSecreto-' + MARK;
    const body = (when) => ({ patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Auditoría ' + MARK, fechaSolicitada: when, extremaUrgencia: false, medical: { diagnostico: DX, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false, observaciones: 'Obs-' + MARK } });
    const eventsOf = (flightId) => sql(`SELECT id_eventos_auditoria, tipo_entidad, operacion FROM eventos_auditoria WHERE id_vuelos=${flightId} ORDER BY fecha_ocurrencia DESC, id_eventos_auditoria DESC`).split(/\r?\n/).filter((l) => l.includes('|')).map((l) => { const [id, type, op] = l.split('|').map((x) => x.trim()); return { id: Number(id), type, op }; });
    const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
    pass('usuarios (CO, OPERACIONES, 2 DTS, 3 comandantes habilitados), aeronaves, paciente y catálogos creados');

    // ---------- Escenario F1: solicitud sanitaria que cruza la medianoche (23:30 -> 00:10 hora de Tucumán) ----------
    const D0 = civilDay(Date.now()), D1 = addDays(D0, 1);
    await clock.set(atLocal(D0, '23:30'));
    const F1 = (await ok('/flights', { method: 'POST', token: dts.token, body: body(`${addDays(D0, 3)}T10:00:00`) })).id;
    await clock.set(atLocal(D1, '00:10'));
    const counter = await ok(`/flights/${F1}/schedule/counterproposal`, { method: 'POST', token: ops.token, body: { salida: `${addDays(D0, 6)}T09:00:00`, motivo: 'No hay aeronave el día pedido' } });
    const proposal = (await ok(`/flights/${F1}`, { token: dts.token })).negociacion.filter((n) => n.tipo === 'CO_CONTRAPROPUESTA').pop();
    await clock.set(atLocal(D1, '00:20'));
    await ok(`/flights/${F1}/schedule/response`, { method: 'POST', token: dts.token, body: { aceptar: true, propuestaId: proposal.id } });
    await clock.set(atLocal(D1, '09:00'));
    const plane1 = await newPlane(), plane2 = await newPlane();
    await ok(`/flights/${F1}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: plane1.id, comandanteId: cmd.cmdA.id } });
    await ok(`/flights/${F1}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: plane1.id, comandanteId: cmd.cmdB.id } });         // reemplazo del comandante
    await ok(`/flights/${F1}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: plane2.id, motivo: 'Cambio por mantenimiento' } });  // cambio de aeronave
    await ok(`/flights/${F1}/operational-planning`, { method: 'POST', token: cmd.cmdB.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: `${addDays(D0, 6)}T11:00:00` } });
    await call(`/flights/${F1}/weather`, { method: 'POST', token: cmd.cmdB.token, body: { condiciones: 'Cielo despejado', favorable: true, observaciones: 'Sin novedades' } });
    await call(`/flights/${F1}/log`, { method: 'POST', token: ops.token, body: { tipo: 'PREPARACION', descripcion: 'Preparación terrestre ' + MARK, ocurrido: new Date(Date.now() - 60000).toISOString(), importancia: 'NORMAL' } });
    await approveRoute(F1, cmd.cmdB.token, ops.token); await call(`/flights/${F1}/start`, { method: 'POST', token: ops.token }); await call(`/flights/${F1}/finish`, { method: 'POST', token: ops.token });
    const obligation = (await ok('/final-reports/mine', { token: cmd.cmdB.token })).find((x) => x.flightId === F1);
    await ok(`/final-reports/${obligation.id}/submit`, { method: 'POST', token: cmd.cmdB.token, body: { texto: 'Informe de auditoría ' + MARK, horasVuelo: 1.5, combustibleConsumidoLitros: 300, incidentes: 'Ninguno' } });
    await ok(`/final-reports/${obligation.id}/review`, { method: 'POST', token: ops.token, body: { aprobar: true } });
    assert.equal(stateOf(F1), 'COMPLETADO');
    await clock.reset();

    // F2: vuelo operativo de otro comandante creado por ops2 (que luego se desactiva); F3: solicitud de otro DTS
    const plane3 = await newPlane(); const t2 = atLocal(addDays(D0, 8), '10:00');
    const F2 = (await ok('/flights/operational', { method: 'POST', token: ops2.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Operativo ' + MARK, aircraftId: plane3.id, comandanteId: cmd.cmdC.id, destinoId: airports[1].id, salida: fmt(new Date(t2)), llegada: fmt(new Date(t2 + 2 * HOUR)) } })).id;
    await call(`/flights/${F2}/commander-assignment/response`, { method: 'POST', token: cmd.cmdC.token, body: { aceptar: true } });
    const F3 = (await ok('/flights', { method: 'POST', token: dts2.token, body: { ...body(`${addDays(D0, 9)}T10:00:00`), patientId: (await ok('/patients', { method: 'POST', token: dts2.token, body: { nombre: 'Otro', apellido: MARK + 'b' } })).id } })).id;
    await call(`/flights/${F3}/schedule/accept`, { method: 'POST', token: ops.token });
    // aeronave: cambio manual de ubicación (anterior y nueva) y usuario desactivado
    const plane5 = await newPlane();
    await ok(`/catalogs/aircraft/${plane5.id}/location`, { method: 'POST', token: admin, body: { locationId: airports[1].id, motivo: 'Reposicionamiento ' + MARK } });
    await call(`/auth/users/${ops2.id}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [200] });
    const f1Events = eventsOf(F1), f2Events = eventsOf(F2), f3Events = eventsOf(F3);
    const types1 = new Set(f1Events.map((e) => `${e.type}.${e.op}`));
    for (const t of ['FLIGHT.CREATE_SANITARY', 'SANITARY_REQUEST.COUNTERPROPOSE', 'SANITARY_REQUEST.ACCEPT_COUNTERPROPOSAL', 'FLIGHT.ASSIGN_RESOURCES', 'FLIGHT_CREW.REMOVE', 'FLIGHT_CREW.CREATE', 'FLIGHT.CHANGE_AIRCRAFT', 'FLIGHT.OPERATIONAL_PLANNING', 'WEATHER.CREATE', 'FLIGHT_LOG.CREATE', 'FLIGHT.START', 'FLIGHT.FINISH', 'FINAL_REPORT_OBLIGATION.CREATE', 'FINAL_REPORT.SUBMIT', 'FINAL_REPORT.APPROVE', 'FLIGHT.COMPLETE'])
      assert.ok(types1.has(t), 'los endpoints de negocio deben haber registrado ' + t + '; hay: ' + [...types1].join(', '));
    pass(`F1/F2/F3 creados por endpoints de negocio con reloj controlado: ${f1Events.length} eventos del vuelo sanitario, ${f2Events.length} del operativo y ${f3Events.length} de la solicitud ajena`);

    // ---------- A: hora almacenada en UTC con el reloj de negocio (medianoche) ----------
    const createdAt = one(`SELECT CONVERT(varchar(23),fecha_ocurrencia,121) FROM eventos_auditoria WHERE id_vuelos=${F1} AND operacion=N'CREATE_SANITARY'`);
    assert.ok(createdAt >= utc(atLocal(D0, '23:30')) && createdAt <= utc(atLocal(D0, '23:30') + 60000), `23:30 locales = ${utc(atLocal(D0, '23:30'))} UTC, almacenado ${createdAt}`);
    const counterAt = one(`SELECT CONVERT(varchar(23),fecha_ocurrencia,121) FROM eventos_auditoria WHERE id_vuelos=${F1} AND operacion=N'COUNTERPROPOSE'`);
    assert.ok(counterAt >= utc(atLocal(D1, '00:10')) && counterAt <= utc(atLocal(D1, '00:10') + 60000));
    const apiCreate = (await ok(`/audit?flightId=${F1}&operation=CREATE_SANITARY`, { token: admin })).items[0];
    assert.equal(Date.parse(apiCreate.occurredAt), Date.parse(createdAt.replace(' ', 'T') + 'Z'), 'la API entrega el mismo instante en UTC');
    assert.equal((await ok('/audit?size=1', { token: admin })).timeZone, 'America/Argentina/Tucuman');
    assert.equal(spawnSync('docker', ['exec', BACKEND, 'date', '+%Z'], { encoding: 'utf8' }).stdout.trim(), 'UTC', 'el backend corre en UTC: no se depende de la zona de la JVM');
    pass('A fechas: los eventos usan el reloj de negocio y se guardan en UTC (23:30 locales = 02:30 UTC del día siguiente); la API entrega el mismo instante y la zona de presentación');

    // ---------- B: ADMINISTRADOR global: orden estable, paginación, totales y límites ----------
    const sqlTotal = count('SELECT COUNT(*) FROM eventos_auditoria');
    const all1 = await ok(`/audit?flightId=${F1}&size=100`, { token: admin });
    assert.equal(all1.total, f1Events.length); assert.deepEqual(ids(all1.items), f1Events.map((e) => e.id), 'orden fecha DESC, id DESC idéntico al de SQL');
    const paged = []; for (let p = 0; p * 4 < f1Events.length; p++) paged.push(...(await ok(`/audit?flightId=${F1}&size=4&page=${p}`, { token: admin })).items);
    assert.deepEqual(ids(paged), f1Events.map((e) => e.id), 'las páginas reconstruyen el listado sin repetir ni saltear');
    const asc = await ok(`/audit?flightId=${F1}&size=100&order=asc`, { token: admin }); assert.deepEqual(ids(asc.items), [...f1Events].reverse().map((e) => e.id));
    const global = await ok('/audit?size=100', { token: admin }); assert.equal(global.total, sqlTotal); assert.equal(global.items.length, 100); assert.equal(global.totalPages, Math.ceil(sqlTotal / 100));
    assert.deepEqual(ids(global.items), sql('SELECT TOP 100 id_eventos_auditoria FROM eventos_auditoria ORDER BY fecha_ocurrencia DESC, id_eventos_auditoria DESC').split(/\r?\n/).filter((l) => /^\d+$/.test(l.trim())).map(Number));
    for (const q of ['size=101', 'size=0', 'page=-1', 'order=up', 'page=101&size=100', 'from=2030-02-01&to=2030-01-01', 'entityType=A%20B', 'operation=%27%3BDROP', 'from=x', 'actorId=x', 'flightId=x'])
      await call(`/audit?${q}`, { token: admin, expect: [400] });
    assert.equal((await ok(`/audit?flightId=${F1}&size=100&page=9`, { token: admin })).items.length, 0);
    pass(`B administración: listado global de ${sqlTotal} eventos con total y páginas exactos, orden idéntico al de SQL (fecha DESC, id DESC), páginas sin repetidos, orden ascendente y 11 parámetros inválidos rechazados con 400`);

    // ---------- C: filtros combinados y medianoche ----------
    const sqlCount = (where) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE ${where}`);
    const fl = (q) => ok(`/audit?${q}`, { token: admin });
    assert.equal((await fl(`flightId=${F1}&from=${D0}&to=${D0}`)).items.map((e) => e.operation).join(), 'CREATE_SANITARY', '23:30 locales pertenecen al día D0, no al siguiente');
    const d1 = await fl(`flightId=${F1}&from=${D1}&to=${D1}&size=100`); assert.ok(!d1.items.some((e) => e.operation === 'CREATE_SANITARY') && d1.items.some((e) => e.operation === 'COUNTERPROPOSE'), '00:10 locales pertenecen al día D1');
    assert.equal(d1.total + 1, f1Events.length, 'los dos días cubren todo el vuelo');
    assert.equal((await fl(`flightId=${F1}&entityType=SANITARY_REQUEST`)).total, sqlCount(`id_vuelos=${F1} AND tipo_entidad=N'SANITARY_REQUEST'`));
    assert.equal((await fl(`flightId=${F1}&entityType=sanitary_request&operation=counterpropose`)).total, 1, 'tipo y acción sin distinguir mayúsculas');
    assert.equal((await fl(`flightId=${F1}&actorId=${dts.id}`)).total, sqlCount(`id_vuelos=${F1} AND id_usuario_actor=${dts.id}`));
    assert.equal((await fl(`flightId=${F1}&actorId=${ops.id}&entityType=FLIGHT`)).total, sqlCount(`id_vuelos=${F1} AND id_usuario_actor=${ops.id} AND tipo_entidad=N'FLIGHT'`));
    const requestRowId = one(`SELECT TOP 1 entidad_id FROM eventos_auditoria WHERE id_vuelos=${F1} AND tipo_entidad=N'SANITARY_REQUEST'`);
    assert.equal((await fl(`entityType=SANITARY_REQUEST&entityId=${requestRowId}&flightId=${F1}`)).total, sqlCount(`id_vuelos=${F1} AND tipo_entidad=N'SANITARY_REQUEST' AND entidad_id=${requestRowId}`));
    assert.equal((await fl(`flightId=${F1}&actorId=${ops2.id}`)).total, 0, 'combinación sin coincidencias');
    assert.equal((await fl(`actorId=${ops.id}`)).total, sqlCount(`id_usuario_actor=${ops.id}`));
    const fromUtc = utc(atLocal(D0, '00:00')), toUtc = utc(atLocal(D1, '00:00') + DAY);
    assert.equal((await fl(`from=${D0}&to=${D1}`)).total, sqlCount(`fecha_ocurrencia >= '${fromUtc}' AND fecha_ocurrencia < '${toUtc}'`), 'el rango de días civiles equivale al intervalo UTC [00:00 local, 00:00 local siguiente)');
    pass('C filtros: rango de fechas (23:30 y 00:10 locales caen en días distintos), usuario, tipo, acción, vuelo y registro afectado combinables y ejecutados en el servidor; totales idénticos a SQL');

    // ---------- D: detalle con valores anteriores y posteriores ----------
    const detailOf = async (token, id, expect = [200]) => call(`/audit/events/${id}`, { token, expect });
    const assignEvents = f1Events.filter((e) => e.op === 'ASSIGN_RESOURCES');
    const swap = (await Promise.all(assignEvents.map((e) => detailOf(admin, e.id)))).map((r) => r.data).find((d) => d.hasPreviousValues);
    const commanderChange = swap.changes.find((c) => c.field === 'comandanteId');
    assert.match(commanderChange.before, /E2E cmdA/); assert.match(commanderChange.after, /E2E cmdB/); assert.equal(commanderChange.changed, true);
    const aircraftEv = (await detailOf(admin, f1Events.find((e) => e.op === 'CHANGE_AIRCRAFT').id)).data;
    assert.equal(aircraftEv.changes.find((c) => c.field === 'matricula').before, plane1.matricula); assert.equal(aircraftEv.changes.find((c) => c.field === 'matricula').after, plane2.matricula);
    const locEv = (await ok(`/audit?entityType=AIRCRAFT&operation=MANUAL_LOCATION_CHANGE&entityId=${plane5.id}`, { token: admin })).items[0];
    const loc = (await detailOf(admin, locEv.id)).data; const locChange = loc.changes.find((c) => c.field === 'aeropuertoActualId' || c.field === 'aeropuertoActual');
    assert.ok(locChange.before && locChange.after && locChange.before !== locChange.after, 'ubicación anterior y nueva identificadas'); assert.ok(loc.changes.some((c) => c.after && c.after.includes(airports[1].nombre)), 'el aeropuerto se muestra por nombre');
    const weather = (await detailOf(admin, f1Events.find((e) => e.type === 'WEATHER').id)).data;
    assert.equal(weather.hasPreviousValues, false); assert.equal(weather.hasNewValues, false); assert.ok(weather.notes.some((n) => /no registró valores/.test(n)), 'evento sin valores: limitación explicada, nada inventado');
    const approve = (await detailOf(admin, f1Events.find((e) => e.op === 'COMPLETE').id)).data; assert.equal(approve.changes.find((c) => c.field === 'estado').after, 'COMPLETADO'); assert.equal(approve.changes.find((c) => c.field === 'estado').before, 'FINALIZADO');
    await call('/audit/events/999999999', { token: admin, expect: [404] }); await call('/audit/events/abc', { token: admin, expect: [400] });
    pass('D detalle: cambio de comandante (cmdA -> cmdB por nombre), de aeronave (matrículas), de ubicación (aeropuertos por nombre), cierre (FINALIZADO -> COMPLETADO) y un evento sin valores explicado sin inventar datos');

    // ---------- E: permisos por rol sobre la auditoría global ----------
    for (const who of [ops, ops3, dts, cmd.cmdA]) for (const p of ['/audit', '/audit/filters', '/audit?flightId=' + F1]) await call(p, { token: who.token, expect: [403] });
    const anonymous = await call('/audit', { expect: [401, 403] }); await call(`/audit/flights/${F1}`, { expect: [401, 403] }); await call('/audit/events/1', { expect: [401, 403] });
    const filters = await ok('/audit/filters', { token: admin }); assert.ok(filters.entityTypes.some((t) => t.code === 'FLIGHT' && t.label === 'Vuelo')); assert.ok(filters.operations.some((o) => o.code === 'CANCEL')); assert.equal(filters.maxPageSize, 100);
    assert.ok(filters.actors.some((a) => a.id === ops2.id && a.active === false), 'el filtro de usuarios incluye a los desactivados con su historial');
    pass(`E global: sólo ADMINISTRADOR (Operaciones, DTS y Comandante reciben 403 en listado, filtros y filtros combinados); sin credenciales HTTP ${anonymous.status}`);

    // ---------- F: Operaciones consulta el historial contextual ----------
    const opsTimeline = await ok(`/audit/flights/${F1}?size=100`, { token: ops.token });
    assert.equal(opsTimeline.total, f1Events.length); assert.deepEqual(ids(opsTimeline.items), f1Events.map((e) => e.id));
    assert.ok(opsTimeline.items.every((e) => e.actor.username || e.actor.label.startsWith('Sistema')), 'se identifica quién realizó cada acción');
    assert.ok(opsTimeline.items.some((e) => e.actor.username === dts.name), 'incluye lo realizado por el DTS');
    const centro = await ok(`/audit/flights/${F1}?size=100`, { token: ops3.token }); assert.equal(centro.total, f1Events.length, 'OPERACIONES y CENTRO_OPERACIONES ven el mismo historial');
    assert.equal((await ok(`/audit/flights/${F1}?size=100&entityType=FLIGHT_CREW`, { token: ops.token })).total, f1Events.filter((e) => e.type === 'FLIGHT_CREW').length);
    assert.equal((await ok(`/audit/flights/${F2}?size=100`, { token: ops.token })).total, f2Events.length);
    await call('/audit/flights/999999999', { token: ops.token, expect: [404] });
    const flightless = (await ok('/audit?entityType=USER&size=1', { token: admin })).items[0]; await detailOf(ops.token, flightless.id, [404]);   // evento global (sin vuelo): no es de Operaciones
    await call(`/audit/flights/${F1}?size=101`, { token: ops.token, expect: [400] });
    pass(`F Operaciones: historial completo de los vuelos (${f1Events.length} y ${f2Events.length} eventos) con responsable, orden de SQL, filtro por tipo y sin acceso a eventos globales ni a vuelos inexistentes`);

    // ---------- G: DTS sólo su solicitud ----------
    const dtsAllowed = (e) => e.type === 'SANITARY_REQUEST' || (e.type === 'FLIGHT' && ['CREATE_SANITARY', 'CANCEL', 'START', 'FINISH', 'COMPLETE'].includes(e.op));
    const dtsView = await ok(`/audit/flights/${F1}?size=100`, { token: dts.token });
    assert.deepEqual(ids(dtsView.items), f1Events.filter(dtsAllowed).map((e) => e.id), 'sólo los hechos de su perfil, en el orden de SQL'); assert.equal(dtsView.total, f1Events.filter(dtsAllowed).length);
    const dtsText = JSON.stringify(dtsView);
    for (const secret of [ops.name, ops2.name, cmd.cmdA.name, cmd.cmdB.name, DX, 'Obs-' + MARK, plane1.matricula, plane2.matricula, 'aeronaveId', 'comandanteId', 'propuestaId']) assert.ok(!dtsText.includes(secret), 'el DTS no debe ver ' + secret);
    assert.ok(dtsView.items.some((e) => e.actor.label === 'Usted') && dtsView.items.some((e) => e.actor.label === 'Centro de Operaciones'), 'personal identificado sólo por función');
    assert.ok(dtsView.items.every((e) => e.actor.username == null && e.actor.name == null));
    const counterDetail = (await detailOf(dts.token, f1Events.find((e) => e.op === 'COUNTERPROPOSE').id)).data; assert.ok(counterDetail.changes.some((c) => c.field === 'salida') && !counterDetail.changes.some((c) => c.field === 'propuestaId'));
    for (const e of f1Events.filter((x) => !dtsAllowed(x))) await detailOf(dts.token, e.id, [404]);
    await call(`/audit/flights/${F3}`, { token: dts.token, expect: [403] }); await call(`/audit/flights/${F2}`, { token: dts.token, expect: [403] });
    for (const e of [...f2Events, ...f3Events]) await detailOf(dts.token, e.id, [404]);
    for (const e of f3Events.filter(dtsAllowed)) await detailOf(dts2.token, e.id, [200]);
    assert.deepEqual(ids((await ok(`/audit/flights/${F3}?size=100`, { token: dts2.token })).items), f3Events.filter(dtsAllowed).map((e) => e.id)); await call(`/audit/flights/${F1}`, { token: dts2.token, expect: [403] });
    const guessedVisible = await Promise.all([...Array(60).keys()].map((i) => call(`/audit/events/${f1Events[f1Events.length - 1].id - 30 + i}`, { token: dts.token, expect: [200, 404] }))); // recorre identificadores vecinos
    for (const r of guessedVisible) if (r.status === 200) assert.ok([F1].includes(r.data.event.flightId), 'sólo eventos de su propia solicitud');
    pass(`G DTS: ve ${dtsView.total} de ${f1Events.length} eventos de su solicitud (evaluación, negociación y estado), sin nombres del personal, aeronaves ni campos internos; 403 en solicitudes ajenas y 404 en cualquier evento ajeno o interno (recorrido de identificadores vecinos)`);

    // ---------- H: Comandante sólo sus vuelos; reemplazado pierde el acceso ----------
    const cmdAllowed = (e) => (e.type === 'FLIGHT' && e.op !== 'CREATE_SANITARY') || (e.type === 'SANITARY_REQUEST' && ['APPROVE', 'ACCEPT_COUNTERPROPOSAL'].includes(e.op)) || ['FLIGHT_CREW', 'FLIGHT_ROUTE', 'HANGAR_INFO', 'AA2000_COORDINATION', 'FLIGHT_LOG', 'WEATHER', 'FINAL_REPORT', 'FINAL_REPORT_OBLIGATION'].includes(e.type) || (e.type === 'AIRCRAFT' && e.op === 'UPDATE_LOCATION_AFTER_FINISH') || (e.type === 'DOCUMENT' && ['CREATE', 'CREATE_VERSION'].includes(e.op));
    const cmdView = await ok(`/audit/flights/${F1}?size=100`, { token: cmd.cmdB.token });
    assert.deepEqual(ids(cmdView.items), f1Events.filter(cmdAllowed).map((e) => e.id)); assert.ok(cmdView.total < f1Events.length, 'no ve la negociación sanitaria ni el alta de la solicitud');
    assert.ok(!cmdView.items.some((e) => e.operation === 'COUNTERPROPOSE' || e.operation === 'CREATE_SANITARY'));
    assert.ok(['FINAL_REPORT', 'FLIGHT_CREW', 'WEATHER', 'FLIGHT_LOG'].every((t) => cmdView.items.some((e) => e.entityType === t)), 'asignación, tripulación, planificación, inicio/fin e informe final');
    await call(`/audit/flights/${F1}`, { token: cmd.cmdA.token, expect: [403] });     // comandante reemplazado: pierde el acceso, como en el resto de las lecturas del vuelo
    await call(`/flights/${F1}`, { token: cmd.cmdA.token, expect: [403] });
    await call(`/audit/flights/${F1}`, { token: cmd.cmdC.token, expect: [403] }); await call(`/audit/flights/${F2}`, { token: cmd.cmdB.token, expect: [403] }); await call(`/audit/flights/${F3}`, { token: cmd.cmdB.token, expect: [403] });
    assert.deepEqual(ids((await ok(`/audit/flights/${F2}?size=100`, { token: cmd.cmdC.token })).items), f2Events.filter(cmdAllowed).map((e) => e.id));
    for (const e of f1Events.filter((x) => !cmdAllowed(x))) await detailOf(cmd.cmdB.token, e.id, [404]);
    for (const e of f1Events.filter(cmdAllowed)) await detailOf(cmd.cmdB.token, e.id, [200]);
    for (const e of [...f2Events, ...f3Events]) await detailOf(cmd.cmdB.token, e.id, [404]);
    for (const e of f1Events) await detailOf(cmd.cmdA.token, e.id, [404]);
    pass(`H Comandante: ve ${cmdView.total} de ${f1Events.length} eventos de su vuelo (sin evaluación ni negociación sanitarias), el comandante reemplazado y los ajenos reciben 403, y los eventos ajenos o excluidos 404`);

    // ---------- I: protección de datos sensibles ----------
    const sensitiveTypes = await ok('/audit?entityType=PROFESSIONAL_CREDENTIAL&size=100', { token: admin }); const userEvents = await ok('/audit?entityType=USER&size=100', { token: admin });
    assert.ok(sensitiveTypes.total >= 3 && userEvents.total >= 1);
    const scan = [...(await ok('/audit?size=100&page=0', { token: admin })).items, ...sensitiveTypes.items, ...userEvents.items, ...f1Events.map((e) => ({ id: e.id }))];
    let scanned = 0; for (const e of scan) { const text = JSON.stringify((await detailOf(admin, e.id)).data); scanned++;
      for (const leak of ['$2a$', '$2b$', 'eyJ', PASSWORD, DX, 'passwordHash', 'tokenHash']) assert.ok(!text.includes(leak), `evento ${e.id} filtra ${leak}`); }
    const credEvent = (await detailOf(admin, sensitiveTypes.items[0].id)).data; const numberChange = credEvent.changes.find((c) => c.field === 'number');
    assert.ok(numberChange.masked && numberChange.after.startsWith('••••') && !/E2E-\d{3,}/.test(numberChange.after), 'número de habilitación enmascarado: ' + numberChange.after);
    const fullAudit = JSON.stringify(await ok(`/audit/flights/${F1}?size=100`, { token: ops.token }));
    assert.ok(!fullAudit.includes(DX) && !fullAudit.includes('Obs-' + MARK), 'ni siquiera Operaciones recibe el contenido clínico por la auditoría');
    const medicalInDb = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE valores_nuevos LIKE N'%${DX}%' OR valores_anteriores LIKE N'%${DX}%'`); assert.equal(medicalInDb, 0, 'el diagnóstico tampoco se persiste en los eventos');
    pass(`I datos sensibles: ${scanned} detalles revisados como administrador sin hashes, JWT, contraseñas ni diagnóstico; número de habilitación enmascarado (${numberChange.after}); el contenido clínico no se persiste ni se expone a ningún rol`);

    // ---------- J: usuario desactivado ----------
    const ops2Events = await ok(`/audit?actorId=${ops2.id}&size=100`, { token: admin }); assert.ok(ops2Events.total >= 1);
    assert.ok(ops2Events.items.every((e) => e.actor.active === false && e.actor.label.includes('usuario desactivado') && e.actor.username === ops2.name));
    const f2View = await ok(`/audit/flights/${F2}?size=100`, { token: ops.token }); assert.ok(f2View.items.some((e) => e.operation === 'CREATE_OPERATIONAL' && e.actor.username === ops2.name && e.actor.active === false));
    assert.equal(one(`SELECT esta_activo FROM usuarios WHERE id_usuarios=${ops2.id}`), '0');
    pass('J usuarios desactivados: sus eventos históricos siguen mostrando al responsable (nombre, usuario e ID) con la marca de desactivado, en la auditoría global y en el historial del vuelo');

    // ---------- K: inmutabilidad en SQL Server ----------
    const probe = f1Events[0].id; const snapshot = one(`SELECT CONCAT(operacion,'|',CONVERT(varchar(30),fecha_ocurrencia,121)) FROM eventos_auditoria WHERE id_eventos_auditoria=${probe}`); const total0 = count('SELECT COUNT(*) FROM eventos_auditoria');
    for (const stmt of [`UPDATE eventos_auditoria SET operacion=N'ALTERADO' WHERE id_eventos_auditoria=${probe}`, `UPDATE eventos_auditoria SET valores_nuevos=NULL WHERE id_vuelos=${F1}`, `DELETE FROM eventos_auditoria WHERE id_eventos_auditoria=${probe}`, `DELETE FROM eventos_auditoria WHERE id_vuelos=${F1}`]) {
      assert.throws(() => sql(stmt), /inmutables/, stmt); }
    assert.equal(count('SELECT COUNT(*) FROM eventos_auditoria'), total0); assert.equal(one(`SELECT CONCAT(operacion,'|',CONVERT(varchar(30),fecha_ocurrencia,121)) FROM eventos_auditoria WHERE id_eventos_auditoria=${probe}`), snapshot);
    for (const method of ['PUT', 'PATCH', 'DELETE', 'POST']) { const r = await call(`/audit/events/${probe}`, { method, token: admin, body: {}, expect: [405, 403, 404] }); assert.notEqual(r.status, 200); }
    await call('/audit', { method: 'POST', token: admin, body: {}, expect: [405, 403, 404] });
    pass('K inmutabilidad: UPDATE y DELETE de eventos rechazados por SQL Server (trigger) sin cambiar nada, y la API no expone alta, edición ni borrado de eventos');

    // ---------- L: atomicidad: un fallo de la auditoría obligatoria revierte la operación ----------
    const plane4 = await newPlane(); const t4 = atLocal(addDays(D0, 12), '10:00');
    const F4 = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Atomicidad ' + MARK, aircraftId: plane4.id, comandanteId: cmd.cmdC.id, destinoId: airports[1].id, salida: fmt(new Date(t4)), llegada: fmt(new Date(t4 + 2 * HOUR)) } })).id;
    await call(`/flights/${F4}/commander-assignment/response`, { method: 'POST', token: cmd.cmdC.token, body: { aceptar: true } }); assert.equal(stateOf(F4), 'PLANIFICADO'); await approveRoute(F4, cmd.cmdC.token, ops.token);
    const snap = () => [stateOf(F4), count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${F4}`), count(`SELECT COUNT(*) FROM bitacora_vuelos WHERE id_vuelos=${F4}`), count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${F4} AND fecha_salida_real IS NOT NULL`)].join('|');
    const before = snap(); const trig = 'e2e_audit_query_failure_' + F4;
    sql(`EXEC(N'CREATE TRIGGER dbo.${trig} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id_vuelos=${F4} AND operacion=N''START'') THROW 51000, N''Fallo de prueba'', 1; END');`);
    try { const failed = await call(`/flights/${F4}/start`, { method: 'POST', token: ops.token, expect: [500] }); assert.equal(snap(), before, 'el fallo de la auditoría revirtió el inicio completo (' + failed.status + ')'); }
    finally { sql(`DROP TRIGGER IF EXISTS dbo.${trig}`); }
    assert.equal(count(`SELECT COUNT(*) FROM sys.triggers WHERE name=N'${trig}'`), 0);
    await call(`/flights/${F4}/start`, { method: 'POST', token: ops.token }); assert.equal(stateOf(F4), 'EN_CURSO');
    await call(`/flights/${F4}/start`, { method: 'POST', token: ops.token, expect: [400] });
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${F4} AND operacion=N'START'`), 1, 'el reintento no duplica el evento');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${F4} AND operacion=N'START' AND id_usuario_actor=${ops.id}`), 1, 'responsable = quien ejecutó');
    pass('L atomicidad: con la auditoría forzada a fallar el inicio del vuelo no deja estado, fecha real ni evento; sin el fallo se confirma con un único evento del responsable correcto y el reintento (400) no lo duplica');

    // ---------- M: persistencia tras reiniciar el backend y rendimiento ----------
    const beforeRestart = ids((await ok(`/audit/flights/${F1}?size=100`, { token: ops.token })).items);
    spawnSync('docker', ['restart', BACKEND], { encoding: 'utf8' }); await sleep(3000); await waitHealthy();
    assert.deepEqual(ids((await ok(`/audit/flights/${F1}?size=100`, { token: ops.token })).items), beforeRestart, 'los mismos eventos tras reiniciar el backend');
    const started = Date.now(); const heavy = await ok(`/audit?size=100&from=${D0}&to=${addDays(D0, 30)}&entityType=FLIGHT&order=asc`, { token: admin }); const elapsed = Date.now() - started;
    assert.ok(heavy.total > 0 && elapsed < 5000, `consulta filtrada sobre ${count('SELECT COUNT(*) FROM eventos_auditoria')} eventos en ${elapsed} ms`);
    pass(`M persistencia y rendimiento: el historial es idéntico tras reiniciar el backend y una consulta filtrada con 100 resultados sobre ${count('SELECT COUNT(*) FROM eventos_auditoria')} eventos tardó ${elapsed} ms`);

    console.log(`E2E auditoria OK: ${passed} bloques; marca ${MARK}; vuelos F1=${F1} F2=${F2} F3=${F3} F4=${F4}`);
  } finally {
    await clock.reset().catch(() => {});
  }
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
