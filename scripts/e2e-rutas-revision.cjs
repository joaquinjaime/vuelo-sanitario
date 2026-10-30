/* E2E de la revisión operativa de rutas (I-4) sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e).
 * Backend real en :18080 y SQL Server real (V55: estado de revisión por versión, restricciones e índice). Sólo crea registros marcados;
 * nunca borra datos ni toca la base habitual. Verifica por SQL las versiones, decisiones, actores, fechas, observaciones y la auditoría,
 * recorre el ciclo completo de un vuelo sanitario y de uno operativo, la matriz de permisos y la concurrencia real (decidir vs. modificar,
 * dos aprobaciones, iniciar vs. cambio material). Termina reiniciando el backend para comprobar la persistencia.
 * Uso: node scripts/e2e-rutas-revision.cjs  (requiere .env con BOOTSTRAP_ADMIN_* y Docker). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');

let passed = 0;
const pass = (text) => { passed++; console.log('PASS: ' + text); };
const stateOf = (flightId) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${flightId}`);
const row = (query) => one(query).split('|').map((x) => x.trim());
const routeRow = (flightId, version) => row(`SELECT estado_revision, ISNULL(CAST(id_usuario_creador AS varchar),''), ISNULL(CAST(id_usuario_presenta AS varchar),''), ISNULL(CAST(id_usuario_revisor AS varchar),''), CASE WHEN fecha_revision IS NULL THEN 0 ELSE 1 END, ISNULL(observaciones_revision,''), ISNULL(motivo_modificacion,''), CASE WHEN fecha_invalidacion IS NULL THEN 0 ELSE 1 END, ISNULL(causa_invalidacion,''), es_version_actual FROM rutas_vuelo WHERE id_vuelos=${flightId} AND version=${version}`);
const auditOps = (flightId) => sql(`SELECT operacion FROM eventos_auditoria WHERE id_vuelos=${flightId} AND tipo_entidad=N'FLIGHT_ROUTE' ORDER BY id_eventos_auditoria`).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const auditCount = (flightId, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flightId} AND tipo_entidad=N'FLIGHT_ROUTE' AND operacion=N'${op}'`);
const sqlRejects = (statement, pattern, label) => assert.throws(() => sql(statement), (e) => pattern.test(e.sqlOutput || e.message), label);
const delayed = (ms, fn) => new Promise((resolve) => setTimeout(resolve, ms)).then(fn);
/** Lanza dos tareas casi a la vez con un desfase (ms; negativo = la segunda sale antes) para recorrer ambos órdenes de llegada. */
const race = (offset, first, second) => Promise.all([offset >= 0 ? first() : delayed(-offset, first), offset > 0 ? delayed(offset, second) : second()]);
const OFFSETS = [0, 30, -30, 80, -80, 150, -150, 300];

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`), 'El backend no apunta a la base E2E');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one("SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL")) >= 55, 'Falta V55');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  pass('base E2E aislada en Flyway >= V55 y backend saludable');

  // ---------- Fixtures ----------
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'ops'), ops2 = await createUser(admin, 'OPERACIONES', 'ops2');
  const dts = await createUser(admin, 'DTS', 'dts');
  const names = ['cA', 'cB', 'cC', 'cD', 'cX', 'cY'];
  const cmd = {}; for (const n of names) { cmd[n] = await createUser(admin, 'COMANDANTE', n); await provision(admin, cmd[n]); }
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) {
    airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token });
    if (airports.length >= 3 && localities.length >= 2) { province = p; break; }
  }
  assert.ok(province, 'Se requiere una provincia con tres aeropuertos y dos localidades');
  for (const n of names) await call(`/catalogs/commanders/${cmd[n].id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let plateSeq = 0;
  const newPlane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'R' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const at = (d, hours) => fmt(new Date(d.getTime() + hours * 3600000));
  async function plannedOperational(commander) {
    const plane = await newPlane(), when = futureSlot();
    const f = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Rutas ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(when), llegada: at(when, 2) } });
    await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } });
    assert.equal(stateOf(f.id), 'PLANIFICADO');
    return { id: f.id, plane, when };
  }
  async function plannedSanitary(commander) {
    const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Rutas', apellido: MARK } });
    const when = futureSlot(), plane = await newPlane();
    const id = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Rutas sanitario ' + MARK, fechaSolicitada: fmt(when), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
    await call(`/flights/${id}/schedule/accept`, { method: 'POST', token: ops.token });
    await call(`/flights/${id}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: plane.id, comandanteId: commander.id } });
    await call(`/flights/${id}/operational-planning`, { method: 'POST', token: commander.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: at(when, 2) } });
    assert.equal(stateOf(id), 'PLANIFICADO');
    return { id, plane, when };
  }
  const put = (id, token, body, expect = [200]) => call(`/flights/${id}/route`, { method: 'PUT', token, body, expect });
  const route = (id, token = ops.token) => ok(`/flights/${id}/route`, { token });
  const decision = (id, token, kind, body, expect = [200]) => call(`/flights/${id}/route/${kind}`, { method: 'POST', token, body, expect });
  const start = (id, expect = [200], token = ops.token) => call(`/flights/${id}/start`, { method: 'POST', token, expect });
  const notifications = (token) => ok('/notifications?size=100', { token });
  const hasNotification = async (token, flightId, type) => (await notifications(token)).items.some((n) => n.flightId === flightId && n.tipo === type);
  pass('usuarios (CO, OPERACIONES, DTS, 6 comandantes habilitados), ubicaciones y catálogos creados');

  // ---------- A: migración V55 sobre los datos existentes ----------
  const legacyMax = Number(one('SELECT ISNULL(MAX(id_rutas_vuelo),0) FROM rutas_vuelo'));
  assert.equal(count("SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.rutas_vuelo') AND name IN (N'ck_rutas_vuelo_estado_revision',N'ck_rutas_vuelo_presentacion',N'ck_rutas_vuelo_decision',N'ck_rutas_vuelo_devolucion',N'ck_rutas_vuelo_invalidacion',N'ck_rutas_vuelo_revisor_distinto')"), 6);
  assert.equal(count("SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.rutas_vuelo') AND name=N'idx_rutas_vuelo_estado_revision_actual' AND filter_definition IS NOT NULL"), 1);
  assert.equal(count("SELECT COUNT(*) FROM rutas_vuelo WHERE estado_revision IS NULL"), 0);
  assert.equal(count("SELECT COUNT(*) FROM rutas_vuelo WHERE id_usuario_presenta IS NULL AND estado_revision NOT IN ('BORRADOR','SIN_REVISION')"), 0, 'ninguna ruta histórica quedó aprobada o presentada sin que alguien lo hiciera');
  assert.equal(count("SELECT COUNT(*) FROM rutas_vuelo r JOIN vuelos v ON v.id_vuelos=r.id_vuelos JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE e.codigo_estado_vuelo IN (N'EN_CURSO',N'FINALIZADO',N'COMPLETADO') AND r.estado_revision='BORRADOR'"), 0, 'los vuelos iniciados o finalizados antes de I-4 no quedan como borradores');
  assert.ok(count("SELECT COUNT(*) FROM rutas_vuelo") > 0, 'la base E2E conserva sus rutas anteriores');
  const legacy = sql(`SELECT TOP 3 r.id_vuelos FROM rutas_vuelo r JOIN vuelos v ON v.id_vuelos=r.id_vuelos JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE r.id_rutas_vuelo<=${legacyMax} AND r.es_version_actual=1 AND r.id_usuario_presenta IS NULL AND r.estado_revision='BORRADOR' AND e.codigo_estado_vuelo=N'PLANIFICADO' ORDER BY r.id_rutas_vuelo`).split("\n").map((x) => x.trim()).filter(Boolean);
  for (const id of legacy) { const view = await route(id, ops.token); assert.equal(view.estado, 'BORRADOR', 'ruta anterior a V55 de un vuelo planificado: borrador, no aprobada'); assert.equal(view.inicio.permitido, false); assert.equal(view.inicio.codigo, 'RUTA_NO_PRESENTADA'); }
  pass('V55: restricciones de estado, índice filtrado de la cola de revisión y rutas históricas conservadas sin aprobaciones inventadas (' + legacy.length + ' rutas anteriores de vuelos planificados verificadas por API: borrador que no habilita el inicio)');

  // ---------- B: ciclo completo de un vuelo sanitario ----------
  const S = await plannedSanitary(cmd.cA), fS = S.id;
  assert.equal((await route(fS, cmd.cA.token)).estado, 'SIN_PLANIFICAR'); assert.equal((await route(fS, cmd.cA.token)).editable, true); assert.equal((await route(fS, ops.token)).editable, false);
  assert.equal((await start(fS, [409])).data.code, 'RUTA_NO_DEFINIDA'); assert.equal(stateOf(fS), 'PLANIFICADO');
  assert.equal(auditCount(fS, 'START_REJECTED'), 1, 'el inicio rechazado por la ruta queda auditado'); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${fS} AND operacion=N'START'`), 0);
  const body0 = { version: 0, recorrido: 'TUC - COR - AEP', alternativoId: airports[2].id, altitudPies: 9000, distanciaNm: 640.5, tiempoEstimadoMinutos: 95, observaciones: 'Ruta E2E' };
  // permisos de escritura y datos inconsistentes
  for (const who of [dts.token, ops.token, ops2.token, admin, cmd.cX.token]) await put(fS, who, body0, [403]);
  assert.equal((await call(`/flights/${fS}/route`, { method: 'PUT', token: cmd.cA.token, body: { ...body0, altitudPies: -1 }, expect: [400] })).status, 400);
  assert.equal((await call(`/flights/${fS}/route`, { method: 'PUT', token: cmd.cA.token, body: { ...body0, distanciaNm: 0 }, expect: [400] })).status, 400);
  assert.equal((await call(`/flights/${fS}/route`, { method: 'PUT', token: cmd.cA.token, body: { ...body0, tiempoEstimadoMinutos: 0 }, expect: [400] })).status, 400);
  assert.equal((await call(`/flights/${fS}/route`, { method: 'PUT', token: cmd.cA.token, body: { ...body0, recorrido: '   ' }, expect: [400] })).status, 400);
  assert.equal((await put(fS, cmd.cA.token, { ...body0, alternativoId: 999999999 }, [400])).status, 400);
  const destinationId = Number(one(`SELECT id_aeropuerto_destino FROM vuelos WHERE id_vuelos=${fS}`));
  assert.match((await put(fS, cmd.cA.token, { ...body0, alternativoId: destinationId }, [400])).data.error, /distinto del destino/);
  assert.match((await put(fS, cmd.cA.token, { ...body0, estadoRevision: 'APROBADA' }, [400])).data.error, /Campo no admitido: estadoRevision/);
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${fS}`), 0, 'los intentos rechazados no dejan versiones');
  await put(fS, cmd.cA.token, body0); // v1 borrador
  assert.deepEqual([(await route(fS)).estado, (await route(fS)).versionVigente], ['BORRADOR', 1]);
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${fS} AND estado_revision='BORRADOR' AND es_version_actual=1 AND id_usuario_presenta IS NULL AND id_usuario_revisor IS NULL`), 1);
  assert.equal((await put(fS, cmd.cA.token, { ...body0, version: 1 }, [400])).data.code, 'RUTA_SIN_CAMBIOS');
  assert.equal((await start(fS, [409])).data.code, 'RUTA_NO_PRESENTADA');
  assert.equal((await decision(fS, ops.token, 'approve', { version: 1 }, [409])).data.code, 'TRANSICION_RUTA_NO_PERMITIDA', 'un borrador no se aprueba');
  assert.equal((await decision(fS, ops.token, 'return', { version: 1, motivo: 'Falta el alternativo indicado' }, [409])).data.code, 'TRANSICION_RUTA_NO_PERMITIDA');
  await decision(fS, cmd.cA.token, 'submit', { version: 1 }); assert.equal((await route(fS)).estado, 'PENDIENTE_REVISION');
  assert.equal(await hasNotification(ops.token, fS, 'ROUTE_PENDING_REVIEW'), true, 'Operaciones recibe la cola interna de revisión de ruta');
  assert.equal((await decision(fS, cmd.cA.token, 'submit', { version: 1 }, [409])).data.code, 'TRANSICION_RUTA_NO_PERMITIDA', 'presentar dos veces');
  assert.equal((await start(fS, [409])).data.code, 'RUTA_PENDIENTE_REVISION');
  // el listado de revisión ve el vuelo; sólo Operaciones lo consulta
  const statuses = await ok('/flights/route-statuses', { token: ops.token }); assert.equal(statuses.find((x) => x.flightId === fS).estado, 'PENDIENTE_REVISION'); assert.equal(statuses.find((x) => x.flightId === fS).bloqueaInicio, true);
  for (const who of [dts.token, cmd.cA.token]) await call('/flights/route-statuses', { token: who, expect: [403] });
  // quién no puede aprobar
  for (const who of [cmd.cA.token, dts.token, admin]) await decision(fS, who, 'approve', { version: 1 }, [403]);
  for (const who of [cmd.cA.token, dts.token, admin]) await decision(fS, who, 'return', { version: 1, motivo: 'No corresponde que lo haga' }, [403]);
  assert.equal((await decision(fS, ops.token, 'approve', { estado: 'APROBADA', version: 1 }, [400])).status, 400);
  assert.equal((await decision(fS, ops.token, 'approve', { version: 7 }, [409])).data.code, 'VERSION_RUTA_DESACTUALIZADA');
  for (const bad of ['', '   ', 'corto', 'aaaaaaaaaaaa', '..........']) assert.equal((await decision(fS, ops.token, 'return', { version: 1, motivo: bad }, [400])).data.code, 'MOTIVO_DEVOLUCION_INVALIDO');
  assert.equal((await route(fS)).estado, 'PENDIENTE_REVISION');
  await decision(fS, ops.token, 'return', { version: 1, motivo: 'Falta incluir el procedimiento de salida' });
  assert.equal(await hasNotification(cmd.cA.token, fS, 'ROUTE_RETURNED'), true, 'el comandante recibe la devolución');
  assert.deepEqual([(await route(fS, cmd.cA.token)).estado, stateOf(fS)], ['DEVUELTA', 'PLANIFICADO'], 'la devolución no cancela el vuelo');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios vs JOIN estados_solicitud_sanitaria e ON e.id_estados_solicitud_sanitaria=vs.id_estados_solicitud_sanitaria WHERE vs.id_vuelos=${fS} AND e.codigo_estado_solicitud=N'APROBADO'`), 1, 'la solicitud sanitaria sigue aprobada: devolver la ruta no es rechazar la solicitud');
  let v1 = routeRow(fS, 1); assert.deepEqual([v1[0], v1[1], v1[2], v1[3], v1[4], v1[5], v1[9]], ['DEVUELTA', String(cmd.cA.id), String(cmd.cA.id), String(ops.id), '1', 'Falta incluir el procedimiento de salida', '1']);
  assert.equal((await start(fS, [409])).data.code, 'RUTA_DEVUELTA');
  assert.equal((await decision(fS, ops.token, 'approve', { version: 1 }, [409])).data.code, 'TRANSICION_RUTA_NO_PERMITIDA', 'una devuelta no se aprueba');
  assert.equal((await put(fS, cmd.cA.token, { ...body0, version: 1, recorrido: 'TUC - COR - AEP (corregida)' }, [400])).data.code, 'MOTIVO_MODIFICACION_REQUERIDO');
  await put(fS, cmd.cA.token, { ...body0, version: 1, recorrido: 'TUC - COR - AEP (corregida)', motivoModificacion: 'Se agrega el procedimiento de salida' }); // v2
  const afterCorrection = await route(fS, cmd.cA.token); assert.equal(afterCorrection.estado, 'BORRADOR'); assert.equal(afterCorrection.versiones.length, 2);
  v1 = routeRow(fS, 1); assert.deepEqual([v1[0], v1[3], v1[5], v1[9]], ['DEVUELTA', String(ops.id), 'Falta incluir el procedimiento de salida', '0'], 'la versión devuelta se conserva íntegra');
  assert.equal((await decision(fS, ops.token, 'approve', { version: 1 }, [409])).data.code, 'VERSION_RUTA_DESACTUALIZADA', 'no se decide sobre una versión que ya no es la vigente');
  await decision(fS, cmd.cA.token, 'submit', { version: 2 });
  assert.equal((await decision(fS, ops.token, 'approve', { version: 1 }, [409])).data.code, 'VERSION_RUTA_DESACTUALIZADA');
  await decision(fS, ops2.token, 'approve', { version: 2, comentario: 'Conforme' });
  assert.equal(await hasNotification(cmd.cA.token, fS, 'ROUTE_APPROVED'), true, 'el comandante recibe la aprobación');
  let v2 = routeRow(fS, 2); assert.deepEqual([v2[0], v2[1], v2[2], v2[3], v2[4], v2[5], v2[6], v2[9]], ['APROBADA', String(cmd.cA.id), String(cmd.cA.id), String(ops2.id), '1', 'Conforme', 'Se agrega el procedimiento de salida', '1']);
  assert.equal((await route(fS)).estado, 'APROBADA'); assert.equal((await route(fS)).inicio.permitido, true);
  assert.equal((await ok(`/flights/${fS}/hangar`, { token: ops.token })).estado, 'SIN_REGISTRO', 'la aprobación de la ruta no aprueba el hangar');
  pass('sanitario: creación, datos inconsistentes, permisos, presentación, devolución sin cancelar el vuelo, corrección con motivo, versión obsoleta rechazada y aprobación atada a la versión (persistido en SQL)');

  // cambios administrativos no invalidan; los materiales sí
  await call(`/flights/${fS}/weather`, { method: 'POST', token: cmd.cA.token, body: { condiciones: 'Despejado', favorable: true } });
  await call(`/flights/${fS}/log`, { method: 'POST', token: ops.token, body: { tipo: 'PREPARACION', descripcion: 'Preparación terrestre ' + MARK, ocurrido: new Date(Date.now() - 60000).toISOString(), importancia: 'NORMAL' } });
  await ok(`/flights/${fS}/hangar`, { method: 'PUT', token: ops.token, body: { version: 0, requiereHangar: false, preparacionCompleta: false, observaciones: 'Sin hangar' } });
  assert.equal((await route(fS)).estado, 'APROBADA', 'clima, bitácora y hangar son cambios administrativos'); assert.equal(auditCount(fS, 'INVALIDATE'), 0);
  const plane2 = await newPlane();
  await ok(`/flights/${fS}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: plane2.id, motivo: 'Mantenimiento de la aeronave original' } });
  assert.equal(await hasNotification(cmd.cA.token, fS, 'ROUTE_REVIEW_REQUIRED'), true, 'el comandante recibe la invalidación que bloquea el inicio');
  const invalidated = await route(fS); assert.equal(invalidated.estado, 'REQUIERE_REVISION'); assert.match(invalidated.causas.join(), /aeronave/);
  v2 = routeRow(fS, 2); assert.deepEqual([v2[0], v2[3], v2[4], v2[7]], ['REQUIERE_REVISION', String(ops2.id), '1', '1']); assert.match(v2[8], /aeronave/);
  assert.equal(auditCount(fS, 'INVALIDATE'), 1);
  const invalidatedRouteId = one(`SELECT id_rutas_vuelo FROM rutas_vuelo WHERE id_vuelos=${fS} AND version=2`);
  const invalidationKey = `ROUTE_INVALIDATED:${invalidatedRouteId}`;
  const notificationRecipients = row(`SELECT COUNT(*), COUNT(DISTINCT id_usuarios) FROM notificaciones WHERE id_vuelos=${fS} AND clave_evento=N'${invalidationKey}'`);
  assert.ok(Number(notificationRecipients[0]) >= 2, 'la invalidación llega al comandante y a la cola de Operaciones');
  assert.equal(notificationRecipients[0], notificationRecipients[1], 'la clave idempotente sólo aparece una vez por destinatario');
  assert.equal((await ok(`/flights/${fS}/hangar`, { token: ops.token })).estado, 'REQUIERE_REVISION', 'el hangar sigue su propia revisión');
  assert.equal((await start(fS, [409])).data.code, 'RUTA_REQUIERE_REVISION'); assert.equal(stateOf(fS), 'PLANIFICADO');
  assert.equal((await decision(fS, ops.token, 'approve', { version: 2 }, [409])).data.code, 'TRANSICION_RUTA_NO_PERMITIDA', 'una aprobación invalidada no autoriza');
  await put(fS, cmd.cA.token, { ...body0, version: 2, recorrido: 'TUC - COR - AEP (corregida)', motivoModificacion: 'Reconfirmo la ruta con la nueva aeronave', presentar: true }); // v3 presentada
  await decision(fS, ops.token, 'approve', { version: 3 });
  assert.deepEqual([routeRow(fS, 2)[0], routeRow(fS, 2)[3], routeRow(fS, 3)[0], routeRow(fS, 3)[3]], ['REQUIERE_REVISION', String(ops2.id), 'APROBADA', String(ops.id)], 'la aprobación histórica se conserva y la nueva versión recibe la suya');
  // replanificación: la llegada cambia desde la planificación del comandante
  await call(`/flights/${fS}/operational-planning`, { method: 'POST', token: cmd.cA.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: at(S.when, 3) } });
  assert.equal((await route(fS)).estado, 'REQUIERE_REVISION'); assert.match((await route(fS)).causas.join(), /horario de llegada/); assert.equal(auditCount(fS, 'INVALIDATE'), 2);
  assert.equal((await start(fS, [409])).data.code, 'RUTA_REQUIERE_REVISION');
  await put(fS, cmd.cA.token, { ...body0, version: 3, recorrido: 'TUC - COR - AEP (corregida)', motivoModificacion: 'Confirmo la ruta con la nueva llegada', presentar: true }); // v4
  await decision(fS, ops.token, 'approve', { version: 4 });
  await start(fS); assert.equal(stateOf(fS), 'EN_CURSO');
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${fS} AND operacion=N'START'`), 1);
  // un vuelo en curso conserva su ruta: no admite modificaciones ordinarias, pero la bitácora y la finalización siguen disponibles
  await put(fS, cmd.cA.token, { ...body0, version: 4, recorrido: 'Cambio en vuelo' }, [400]);
  await decision(fS, ops.token, 'return', { version: 4, motivo: 'Intento de devolver en vuelo' }, [400]);
  await call(`/flights/${fS}/log`, { method: 'POST', token: ops.token, body: { tipo: 'PREPARACION', descripcion: 'Novedad en vuelo ' + MARK, ocurrido: new Date(Date.now() - 30000).toISOString(), importancia: 'NORMAL' } });
  await call(`/flights/${fS}/finish`, { method: 'POST', token: ops.token }); assert.equal(stateOf(fS), 'FINALIZADO');
  assert.deepEqual(auditOps(fS), ['START_REJECTED', 'CREATE', 'START_REJECTED', 'SUBMIT', 'START_REJECTED', 'RETURN', 'START_REJECTED', 'UPDATE', 'SUBMIT', 'APPROVE', 'INVALIDATE', 'START_REJECTED', 'UPDATE', 'SUBMIT', 'APPROVE', 'INVALIDATE', 'START_REJECTED', 'UPDATE', 'SUBMIT', 'APPROVE']);
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${fS} AND es_version_actual=1`), 1); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${fS}`), 4);
  assert.equal((await route(fS, cmd.cA.token)).versiones.map((v) => v.version).join(), '4,3,2,1');
  pass('sanitario: cambios administrativos no invalidan; el cambio de aeronave y de llegada sí (causa, revisor e historial conservados); inicio bloqueado hasta aprobar de nuevo; inicio y finalización correctos; 20 eventos de auditoría en orden');

  // ---------- C: vuelo operativo ----------
  const O = await plannedOperational(cmd.cB), fO = O.id;
  assert.equal((await start(fO, [409])).data.code, 'RUTA_NO_DEFINIDA');
  await put(fO, cmd.cB.token, { version: 0, recorrido: 'Regreso directo', presentar: true }); // opcionales omitidos
  assert.deepEqual([(await route(fO)).estado, routeRow(fO, 1)[2]], ['PENDIENTE_REVISION', String(cmd.cB.id)]);
  assert.equal((await route(fO, cmd.cB.token)).puedeRevisar, false); assert.equal((await route(fO, ops.token)).puedeRevisar, true);
  await decision(fO, ops.token, 'approve', { version: 1 });
  await start(fO); assert.equal(stateOf(fO), 'EN_CURSO');
  const O2 = await plannedOperational(cmd.cC), fO2 = O2.id;
  await put(fO2, cmd.cC.token, { version: 0, recorrido: 'Segundo regreso', presentar: true });
  await decision(fO2, ops.token, 'approve', { version: 1 });
  pass('operativo: sin ruta no inicia; los campos opcionales se omiten; presentación directa; aprobación por Operaciones y el inicio funciona');

  // ---------- D: quien reúne los roles de comandante y Operaciones no aprueba su propia ruta ----------
  const dualRequest = { nombre: 'E2E', apellido: 'Dual' + MARK, dni: String(100000000000 + Math.floor(Math.random() * 899999999999)), roles: ['COMANDANTE', 'OPERACIONES'], correos: [{ direccion: MARK + 'dual@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551234' }], licenciaAeronautica: (MARK + 'DUAL').toUpperCase() };
  const dualCreated = await call('/auth/users', { method: 'POST', token: admin, body: dualRequest, expect: [200, 201, 400, 409] });
  if (dualCreated.status < 300) {
    await call('/auth/activar-cuenta', { method: 'POST', body: { dni: dualRequest.dni, codigo: dualCreated.data.codigo, username: MARK + 'dual', password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
    const dual = { name: MARK + 'dual', token: (await ok('/auth/login', { method: 'POST', body: { username: MARK + 'dual', password: PASSWORD } })).accessToken }; dual.id = (await ok('/auth/me', { token: dual.token })).id;
    await provision(admin, dual); await call(`/catalogs/commanders/${dual.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
    const D = await plannedOperational(dual);
    await put(D.id, dual.token, { version: 0, recorrido: 'Ruta propia', presentar: true });
    assert.equal((await route(D.id, dual.token)).puedeRevisar, false);
    assert.equal((await decision(D.id, dual.token, 'approve', { version: 1 }, [403])).data.code, 'AUTOREVISION_RUTA_NO_PERMITIDA');
    assert.equal((await decision(D.id, dual.token, 'return', { version: 1, motivo: 'Me devuelvo mi propia ruta' }, [403])).data.code, 'AUTOREVISION_RUTA_NO_PERMITIDA');
    assert.equal(routeRow(D.id, 1)[0], 'PENDIENTE_REVISION'); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${D.id} AND id_usuario_revisor IS NOT NULL`), 0);
    await decision(D.id, ops.token, 'approve', { version: 1 }); assert.equal((await route(D.id)).estado, 'APROBADA');
    pass('un comandante que también tiene rol de Operaciones no puede aprobar ni devolver su propia ruta (403 AUTOREVISION_RUTA_NO_PERMITIDA)');
  } else pass('(omitido) el alta de un usuario con ambos roles no está permitida: ' + dualCreated.status);

  // ---------- E: restricciones de SQL Server sobre estados inconsistentes ----------
  const rid = one(`SELECT id_rutas_vuelo FROM rutas_vuelo WHERE id_vuelos=${fO2} AND version=1`);
  sqlRejects(`UPDATE rutas_vuelo SET estado_revision='INEXISTENTE' WHERE id_rutas_vuelo=${rid}`, /ck_rutas_vuelo_estado_revision/, 'estado inválido');
  sqlRejects(`UPDATE rutas_vuelo SET id_usuario_revisor=NULL WHERE id_rutas_vuelo=${rid}`, /ck_rutas_vuelo_decision/, 'aprobada sin revisor');
  sqlRejects(`UPDATE rutas_vuelo SET estado_revision='DEVUELTA', observaciones_revision=NULL WHERE id_rutas_vuelo=${rid}`, /ck_rutas_vuelo_devolucion/, 'devuelta sin observaciones');
  sqlRejects(`UPDATE rutas_vuelo SET estado_revision='REQUIERE_REVISION' WHERE id_rutas_vuelo=${rid}`, /ck_rutas_vuelo_invalidacion/, 'invalidada sin causa');
  sqlRejects(`UPDATE rutas_vuelo SET id_usuario_revisor=id_usuario_presenta WHERE id_rutas_vuelo=${rid}`, /ck_rutas_vuelo_revisor_distinto/, 'revisor igual al que presentó');
  sqlRejects(`UPDATE rutas_vuelo SET id_usuario_presenta=NULL WHERE id_rutas_vuelo=${rid}`, /ck_rutas_vuelo_presentacion/, 'aprobada sin presentación');
  sqlRejects(`INSERT INTO rutas_vuelo (id_vuelos, version, es_version_actual, id_usuario_creador, estado_revision, recorrido_planificado, fecha_creacion) SELECT id_vuelos, 99, 1, id_usuario_creador, 'BORRADOR', N'duplicada', SYSDATETIME() FROM rutas_vuelo WHERE id_rutas_vuelo=${rid}`, /uq_rutas_vuelo_actual|UNIQUE/i, 'una sola versión vigente por vuelo');
  assert.equal(routeRow(fO2, 1)[0], 'APROBADA');
  pass('SQL Server rechaza estados inconsistentes (6 restricciones) y una segunda versión vigente');

  // ---------- F: concurrencia real ----------
  const raceA = []; for (let round = 0; round < OFFSETS.length; round++) { // decidir vs. crear la versión siguiente
    const C = await plannedOperational(cmd.cD), f = C.id;
    await put(f, cmd.cD.token, { version: 0, recorrido: 'Ruta de carrera', presentar: true });
    const tasks = [() => decision(f, ops.token, 'approve', { version: 1 }, [200, 409]), () => put(f, cmd.cD.token, { version: 1, recorrido: 'Ruta nueva de carrera', motivoModificacion: 'Cambio de recorrido por tránsito' }, [200, 409])];
    const results = await race(OFFSETS[round], tasks[0], tasks[1]);
    const head = row(`SELECT version, estado_revision FROM rutas_vuelo WHERE id_vuelos=${f} AND es_version_actual=1`);
    raceA.push(results[0].status === 200 ? 'aprueba-primero' : 'modifica-primero');
    if (head[0] === '2') { assert.equal(head[1], 'BORRADOR', 'ronda ' + round); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${f} AND version=2 AND id_usuario_revisor IS NOT NULL`), 0); assert.ok(['APROBADA', 'SIN_REVISION'].includes(routeRow(f, 1)[0])); if (results[0].status === 409) assert.equal(results[0].data.code, 'VERSION_RUTA_DESACTUALIZADA'); }
    else { assert.equal(head[1], 'APROBADA', 'ronda ' + round); assert.equal(results[1].status, 409); }
    if (head[0] === '2') assert.ok(['RUTA_NO_PRESENTADA'].includes((await start(f, [409])).data.code), 'nunca queda iniciable sobre la versión nueva sin aprobar'); else { await start(f, [200]); assert.equal(stateOf(f), 'EN_CURSO'); }
  }
  pass('carrera decidir vs. modificar (8 rondas con desfases: ' + raceA.join(', ') + '): ninguna aprobación de la versión 1 habilita la versión 2');
  for (let round = 0; round < 3; round++) { // dos operadores aprueban la misma versión
    const C = await plannedOperational(cmd.cD), f = C.id;
    await put(f, cmd.cD.token, { version: 0, recorrido: 'Doble aprobación', presentar: true });
    const results = await Promise.all([decision(f, ops.token, 'approve', { version: 1 }, [200, 409]), decision(f, ops2.token, 'approve', { version: 1 }, [200, 409])]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], 'ronda ' + round); assert.equal(results.find((r) => r.status === 409).data.code, 'TRANSICION_RUTA_NO_PERMITIDA');
    assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${f} AND estado_revision='APROBADA'`), 1); assert.equal(auditCount(f, 'APPROVE'), 1);
  }
  pass('dos aprobaciones simultáneas de la misma versión: una se aplica, la otra recibe 409 y la auditoría registra una sola decisión');
  const raceB = []; for (let round = 0; round < OFFSETS.length; round++) { // iniciar vs. cambio material
    const C = await plannedOperational(cmd.cD), f = C.id; const other = await newPlane();
    await put(f, cmd.cD.token, { version: 0, recorrido: 'Inicio contra cambio', presentar: true }); await decision(f, ops.token, 'approve', { version: 1 });
    const tasks = [() => start(f, [200, 400, 409]), () => call(`/flights/${f}/aircraft`, { method: 'POST', token: ops2.token, body: { aircraftId: other.id, motivo: 'Cambio de aeronave por mantenimiento' }, expect: [200, 400, 409] })];
    const results = await race(OFFSETS[round], tasks[0], tasks[1]);
    const state = stateOf(f), aircraftId = Number(one(`SELECT id_aeronaves FROM vuelos WHERE id_vuelos=${f}`)), head = routeRow(f, 1);
    raceB.push(state === 'EN_CURSO' ? 'inicia-primero' : 'cambia-primero');
    if (state === 'EN_CURSO') { assert.equal(aircraftId, C.plane.id, 'ronda ' + round); assert.equal(head[0], 'APROBADA'); }
    else { assert.equal(state, 'PLANIFICADO'); assert.equal(aircraftId, other.id); assert.equal(head[0], 'REQUIERE_REVISION', 'ronda ' + round); assert.equal((await start(f, [409])).data.code, 'RUTA_REQUIERE_REVISION'); }
    assert.equal(results.filter((r) => r.status === 200).length >= 1, true, 'ronda ' + round + ': ' + JSON.stringify(results.map((r) => [r.status, r.data])));
  }
  pass('carrera iniciar vs. cambio de aeronave (8 rondas con desfases: ' + raceB.join(', ') + '): o inicia con la aeronave aprobada o queda sin iniciar con la ruta invalidada; nunca inicia sobre una aprobación obsoleta');

  // ---------- G: visibilidad por rol y persistencia tras reiniciar ----------
  for (const who of [dts.token, ops.token, cmd.cA.token, admin]) assert.ok((await route(fS, who)).versiones.length === 4);
  await call(`/flights/${fS}/route`, { token: cmd.cX.token, expect: [403] });
  const before = JSON.stringify((await route(fO2)).versiones.map((v) => [v.version, v.estado, v.revisadoPor, v.fechaRevision, v.presentadoPor]));
  const restart = spawnSync('docker', ['restart', BACKEND], { encoding: 'utf8' }); assert.equal(restart.status, 0, restart.stderr);
  await waitHealthy();
  const operations = (await ok('/auth/login', { method: 'POST', body: { username: ops.name, password: PASSWORD } })).accessToken;
  assert.equal(JSON.stringify((await route(fO2, operations)).versiones.map((v) => [v.version, v.estado, v.revisadoPor, v.fechaRevision, v.presentadoPor])), before);
  pass('el DTS, Operaciones, el comandante y el administrador consultan; un comandante ajeno no; el historial íntegro sobrevive al reinicio del backend');

  console.log(`\n${passed} bloques verificados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
