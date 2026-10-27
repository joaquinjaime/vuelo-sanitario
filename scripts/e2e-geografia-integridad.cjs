/* I-5.3: integridad referencial de las bajas lógicas, protección del aeropuerto alternativo, concurrencia y tipos de vuelo
 * contra el backend y SQL Server E2E aislados (base vuelos_sanitarios_e2e, Flyway >= V56). Sólo crea registros marcados; los tipos de vuelo que apaga
 * temporalmente por SQL se restauran siempre. Uso: node scripts/e2e-geografia-integridad.cjs
 *  A) referencias vigentes bloquean (vuelo abierto, alternativo de la ruta vigente, aeronave activa) con 409 y detalle; las históricas no.
 *  B) la historia sobrevive a la baja: FKs, vuelo, versiones de ruta, auditoría y consulta; lo inactivo no se puede volver a elegir.
 *  C) jerarquía provincia → localidad → aeropuerto: baja con hijos activos y reactivación con padre inactivo.
 *  D) carreras reales (ambos órdenes, varios desfases): como máximo una operación incompatible confirma y el estado final es coherente.
 *  E) tipos de vuelo: activo, inactivo, inexistente, histórico consultable y replanificación sin cambio de tipo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const delayed = (ms, fn) => new Promise((r) => setTimeout(r, ms)).then(fn);
const race = (offset, first, second) => Promise.all([offset >= 0 ? first() : delayed(-offset, first), offset > 0 ? delayed(offset, second) : second()]);
const OFFSETS = [0, 15, -15, 40, -40, 90, -90, 0];
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const activeOf = (id) => count(`SELECT esta_activo FROM aeropuertos WHERE id_aeropuertos=${id}`);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && DB_NAME === 'vuelos_sanitarios_e2e', 'El backend no apunta a la base E2E');
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 56, 'se requiere Flyway >= V56');
  const startedAt = new Date().toISOString();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'gops');
  const cmds = []; for (let i = 0; i < 4; i++) { const c = await createUser(admin, 'COMANDANTE', 'gc' + i); await provision(admin, c); cmds.push(c); }
  const suffix = String(Date.now()).slice(-7); let seq = 0;
  const geo = (p, o = {}) => call('/admin/geography/' + p, o);
  const province = await ok('/admin/geography/provinces', { method: 'POST', token: admin, body: { codigoOficial: 'GI' + suffix, nombre: 'Provincia integridad ' + MARK } });
  const locality = await ok('/admin/geography/localities', { method: 'POST', token: admin, body: { codigoOficial: 'GIL' + suffix, nombre: 'Localidad integridad ' + MARK, provinciaId: province.id } });
  const newAirport = async (label, localityId = locality.id, provinceId = province.id) => { const n = ++seq; return ok('/admin/geography/airports', { method: 'POST', token: admin, body: { codigoOficial: `GI${suffix}${n}`, nombre: `Aeropuerto ${label} ${MARK} ${n}`, ciudad: 'Ciudad integridad', provinciaId: provinceId, localidadId: localityId, tipo: 'AERODROMO', pais: 'Argentina', latitud: -26.5, longitud: -65.1 } }); };
  const setActive = (kind, id, activo, expect = [200], token = admin) => call(`/admin/geography/${kind}/${id}/active`, { method: 'POST', token, body: { activo, motivo: 'E2E integridad ' + MARK }, expect });
  for (const c of cmds) await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  const newPlane = async (airport) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'G' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airport.id, activo: true } });
  const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((r) => r.codigo !== 'OTRO');
  let commanderTurn = 0; const nextCommander = () => cmds[commanderTurn++ % cmds.length];
  const createFlight = async (plane, destination, commander, { token = ops.token, expect = [200], type = 'REGRESO_BASE' } = {}) => { const when = futureSlot(); return call('/flights/operational', { method: 'POST', token, expect, body: { tipoVueloCode: type, motivoVuelo: 'Integridad ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: destination.id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } }); };
  const planned = async (origin, destination, commander = nextCommander(), type = 'REGRESO_BASE') => { const plane = await newPlane(origin); const f = (await createFlight(plane, destination, commander, { type })).data; await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } }); assert.equal(stateOf(f.id), 'PLANIFICADO'); return { id: f.id, plane, commander, origin, destination }; };
  const saveRoute = (flight, body, expect = [200]) => call(`/flights/${flight.id}/route`, { method: 'PUT', token: flight.commander.token, body, expect });
  const adminAirports = async (q, token = admin) => (await ok(`/admin/geography/airports?q=${encodeURIComponent(q)}&page=0&size=25`, { token })).items;
  pass('fixtures: provincia y localidad propias, 4 comandantes habilitados y Flyway >= V56');

  // ================= A: referencias vigentes protegen; las históricas no =================
  const O = await newAirport('Origen'), D = await newAirport('Destino'), ALT = await newAirport('Alternativo');
  const F = await planned(O, D);
  const blockedDestination = await setActive('airports', D.id, false, [409]);
  assert.equal(blockedDestination.data.code, 'GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES'); assert.equal(blockedDestination.data.vigentes.VUELOS_VIGENTES, 1);
  assert.ok(blockedDestination.data.vuelos.length === 1 && /^V-/.test(blockedDestination.data.vuelos[0]), 'el detalle identifica el vuelo vigente');
  assert.equal(activeOf(D.id), 1, 'una baja rechazada no modifica la fila');
  const blockedOrigin = await setActive('airports', O.id, false, [409]);
  assert.equal(blockedOrigin.data.vigentes.AERONAVES_ACTIVAS, 1); assert.equal(blockedOrigin.data.vigentes.VUELOS_VIGENTES, 1);
  assert.equal((await setActive('airports', D.id, false, [403], ops.token)).status, 403, 'sólo ADMINISTRADOR da de baja');
  let listed = (await adminAirports(D.nombre))[0]; assert.equal(listed.dependencias.puedeDesactivar, false); assert.match(listed.dependencias.motivoBloqueo, /vuelos vigentes/);
  pass('A1 un vuelo abierto protege su origen y su destino (409 con detalle, sin cambiar la fila) y sólo el administrador puede intentar la baja');

  await saveRoute(F, { version: 0, recorrido: 'Ruta de integridad ' + MARK, alternativoId: ALT.id, presentar: true });
  const blockedAlternate = await setActive('airports', ALT.id, false, [409]);
  assert.equal(blockedAlternate.data.code, 'GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES'); assert.equal(blockedAlternate.data.vigentes.RUTAS_ALTERNATIVAS_VIGENTES, 1);
  assert.equal(activeOf(ALT.id), 1); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${F.id} AND es_version_actual=1 AND id_aeropuerto_alternativo=${ALT.id} AND estado_revision=N'PENDIENTE_REVISION'`), 1);
  await ok(`/flights/${F.id}/route/approve`, { method: 'POST', token: ops.token, body: { version: 1 } });
  assert.equal((await setActive('airports', ALT.id, false, [409])).data.vigentes.RUTAS_ALTERNATIVAS_VIGENTES, 1, 'una ruta aprobada también protege su alternativo');
  pass('A2 el aeropuerto alternativo de la ruta vigente (presentada o aprobada) no puede darse de baja y la ruta no se invalida en silencio');

  // una versión posterior que retira el alternativo libera el aeropuerto; la versión anterior conserva su referencia
  await saveRoute(F, { version: 1, recorrido: 'Ruta sin alternativo ' + MARK, presentar: true, motivoModificacion: 'Se retira el alternativo de la ruta' });
  const released = await setActive('airports', ALT.id, false);
  assert.equal(released.data.activo, false); assert.equal(released.data.dependencias.historicas.VERSIONES_RUTA_HISTORICAS, 1); assert.equal(activeOf(ALT.id), 0);
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${F.id}`), 2); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${F.id} AND version=1 AND id_aeropuerto_alternativo=${ALT.id} AND es_version_actual=0`), 1);
  const history = await ok(`/flights/${F.id}/route`, { token: F.commander.token }); assert.equal(history.versiones.find((v) => v.version === 1).alternativoId, ALT.id); assert.equal(history.versiones.length, 2);
  const inactiveAlt = await saveRoute(F, { version: 2, recorrido: 'Con alternativo inactivo', alternativoId: ALT.id, presentar: true, motivoModificacion: 'Intento con alternativo inactivo' }, [400]);
  assert.match(inactiveAlt.data.error, /alternativo/i);
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${F.id}`), 2, 'el intento rechazado no crea versiones');
  assert.equal((await ok('/catalogs/airports?provinceId=' + province.id + '&q=' + encodeURIComponent(ALT.nombre), { token: ops.token })).some((a) => a.id === ALT.id), false, 'lo inactivo no se ofrece en los selectores');
  pass('A3 retirar el alternativo con una versión nueva permite la baja lógica; la versión anterior conserva su referencia y el aeropuerto inactivo ya no se elige');

  // ================= B: la historia sobrevive a la baja =================
  await call(`/flights/${F.id}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } });
  assert.equal(stateOf(F.id), 'CANCELADO');
  const planeBlocked = await setActive('airports', O.id, false, [409]); assert.equal(planeBlocked.data.vigentes.AERONAVES_ACTIVAS, 1); assert.equal(planeBlocked.data.vigentes.VUELOS_VIGENTES, undefined, 'el vuelo cancelado es histórico');
  const closedDestination = await setActive('airports', D.id, false); assert.equal(closedDestination.data.activo, false); assert.equal(closedDestination.data.dependencias.historicas.VUELOS_HISTORICOS, 1);
  await call(`/catalogs/aircraft/${F.plane.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Fin de ensayo' } });
  const closedOrigin = await setActive('airports', O.id, false); assert.equal(closedOrigin.data.activo, false);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${F.id} AND id_aeropuerto_origen=${O.id} AND id_aeropuerto_destino=${D.id}`), 1, 'el vuelo histórico conserva ambas claves foráneas');
  assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE id_aeronaves=${F.plane.id} AND id_aeropuertos=${O.id}`), 1, 'la aeronave inactiva conserva su última ubicación');
  const flightsView = await ok('/flights', { token: ops.token }); const seen = flightsView.find((f) => f.id === F.id); assert.ok(seen); assert.equal(seen.estadoVuelo, 'CANCELADO'); assert.equal(seen.destino, D.nombre, 'la consulta histórica muestra el aeropuerto aunque esté inactivo');
  assert.equal((await ok(`/flights/${F.id}/route`, { token: ops.token })).versiones.length, 2);
  for (const id of [D.id, ALT.id, O.id]) assert.ok(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'GEOGRAPHIC_AIRPORT' AND entidad_id=${id} AND operacion=N'SET_ACTIVE'`) >= 1);
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'GEOGRAPHIC_AIRPORT' AND entidad_id=${D.id} AND operacion=N'SET_ACTIVE' AND valores_nuevos LIKE N'%referenciasHistoricasConservadas%VUELOS_HISTORICOS%'`), 1, 'la auditoría de la baja deja constancia de lo conservado');
  const notReusable = await createFlight(await newPlane(await newAirport('Base2')), D, nextCommander(), { expect: [400] }); assert.match(notReusable.data.error, /destino debe estar activo/);
  const reactivated = await setActive('airports', D.id, true); assert.equal(reactivated.data.id, D.id); assert.equal(activeOf(D.id), 1);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${F.id} AND id_aeropuerto_destino=${D.id}`), 1);
  pass('B las bajas con sólo historia prosperan sin romper FKs: el vuelo cancelado, sus dos versiones de ruta, la aeronave inactiva y la auditoría se conservan; lo inactivo no se reutiliza y la reactivación mantiene el identificador');

  // ================= C: jerarquía =================
  const P2 = await ok('/admin/geography/provinces', { method: 'POST', token: admin, body: { codigoOficial: 'GJ' + suffix, nombre: 'Provincia jerarquía ' + MARK } });
  const L2 = await ok('/admin/geography/localities', { method: 'POST', token: admin, body: { codigoOficial: 'GJL' + suffix, nombre: 'Localidad jerarquía ' + MARK, provinciaId: P2.id } });
  const A2 = await newAirport('Jerarquía', L2.id, P2.id);
  assert.equal((await setActive('localities', L2.id, false, [409])).data.code, 'GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES');
  assert.equal((await setActive('provinces', P2.id, false, [409])).data.code, 'GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES');
  await setActive('airports', A2.id, false); const l2off = await setActive('localities', L2.id, false); assert.equal(l2off.data.dependencias.historicas.AEROPUERTOS_INACTIVOS, 1);
  await setActive('provinces', P2.id, false);
  for (const [kind, id] of [['airports', A2.id], ['localities', L2.id]]) assert.equal((await setActive(kind, id, true, [409])).data.code, 'GEOGRAPHIC_PARENT_INACTIVE');
  assert.equal(count(`SELECT COUNT(*) FROM aeropuertos WHERE id_aeropuertos=${A2.id} AND esta_activo=0`), 1);
  await setActive('provinces', P2.id, true); assert.equal((await setActive('airports', A2.id, true, [409])).data.code, 'GEOGRAPHIC_PARENT_INACTIVE', 'la localidad sigue inactiva');
  await setActive('localities', L2.id, true); await setActive('airports', A2.id, true);
  const moved = await call(`/admin/geography/airports/${F.destination.id}`, { method: 'PUT', token: admin, body: { codigoOficial: `GIM${suffix}9`, nombre: D.nombre, ciudad: 'Ciudad integridad', provinciaId: P2.id, localidadId: null, tipo: 'AERODROMO', pais: 'Argentina' }, expect: [200, 409] });
  assert.equal(moved.status, 200, 'sin referencias vigentes (vuelo cancelado) puede cambiarse la provincia');
  const busy = await planned(await newAirport('Base3'), await newAirport('Destino3')); const stuck = await call(`/admin/geography/airports/${busy.destination.id}`, { method: 'PUT', token: admin, body: { codigoOficial: `GIM${suffix}8`, nombre: busy.destination.nombre, ciudad: 'Ciudad integridad', provinciaId: P2.id, localidadId: null, tipo: 'AERODROMO', pais: 'Argentina' }, expect: [409] });
  assert.equal(stuck.data.code, 'GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES'); assert.equal(count(`SELECT id_provincias FROM aeropuertos WHERE id_aeropuertos=${busy.destination.id}`), province.id);
  pass('C la jerarquía impide bajas con hijos activos y reactivaciones bajo un padre inactivo; el cambio de provincia de un aeropuerto con vuelos vigentes se rechaza');

  // ================= D: concurrencia real =================
  const raceBase = await newAirport('BaseCarrera');
  const rounds = { create: [], route: [], move: [], twice: [] };
  for (let round = 0; round < OFFSETS.length; round++) { // baja contra selección como destino
    const X = await newAirport('CarreraDestino'), plane = await newPlane(raceBase), commander = nextCommander();
    const [off, created] = await race(OFFSETS[round], () => setActive('airports', X.id, false, [200, 409]), () => createFlight(plane, X, commander, { expect: [200, 400, 409] }));
    assert.ok(!(off.status === 200 && created.status === 200), `ronda ${round}: ambas operaciones incompatibles confirmaron`);
    const references = count(`SELECT COUNT(*) FROM vuelos WHERE id_aeropuerto_destino=${X.id}`);
    if (off.status === 200) { assert.equal(activeOf(X.id), 0); assert.equal(references, 0, 'una baja confirmada no deja un vuelo nuevo apuntando al aeropuerto'); assert.ok([400, 409].includes(created.status)); rounds.create.push('baja'); }
    else { assert.equal(created.status, 200, `ronda ${round}: la baja falló (${off.data.code}) pero la creación tampoco confirmó (${created.status})`); assert.equal(activeOf(X.id), 1); assert.equal(references, 1); assert.equal(off.data.code, 'GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES'); rounds.create.push('vuelo'); }
  }
  for (let round = 0; round < OFFSETS.length; round++) { // baja contra selección como alternativo
    const Y = await newAirport('CarreraAlternativo'), flight = await planned(await newAirport('BaseR'), await newAirport('DestinoR'));
    const [off, saved] = await race(OFFSETS[round], () => setActive('airports', Y.id, false, [200, 409]), () => saveRoute(flight, { version: 0, recorrido: 'Carrera alternativo ' + round, alternativoId: Y.id, presentar: true }, [200, 400, 409]));
    assert.ok(!(off.status === 200 && saved.status === 200), `ronda ${round}: la baja y la ruta con ese alternativo confirmaron ambas`);
    const current = count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${flight.id} AND es_version_actual=1 AND id_aeropuerto_alternativo=${Y.id}`);
    if (off.status === 200) { assert.equal(activeOf(Y.id), 0); assert.equal(current, 0); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${flight.id}`), 0, 'la ruta rechazada no deja versiones'); rounds.route.push('baja'); }
    else { assert.equal(saved.status, 200, `ronda ${round}: ni la baja ni la ruta confirmaron`); assert.equal(activeOf(Y.id), 1); assert.equal(current, 1); rounds.route.push('ruta'); }
  }
  for (let round = 0; round < OFFSETS.length; round++) { // baja contra traslado de una aeronave
    const Z = await newAirport('CarreraUbicacion'), plane = await newPlane(await newAirport('BaseU'));
    const [off, moved2] = await race(OFFSETS[round], () => setActive('airports', Z.id, false, [200, 409]), () => call(`/catalogs/aircraft/${plane.id}/location`, { method: 'POST', token: ops.token, body: { locationId: Z.id, motivo: 'Carrera ' + round }, expect: [200, 400, 409] }));
    assert.ok(!(off.status === 200 && moved2.status === 200), `ronda ${round}: una aeronave activa quedó en un aeropuerto dado de baja`);
    const located = count(`SELECT COUNT(*) FROM aeronaves WHERE id_aeronaves=${plane.id} AND id_aeropuertos=${Z.id}`);
    if (off.status === 200) { assert.equal(activeOf(Z.id), 0); assert.equal(located, 0); rounds.move.push('baja'); } else { assert.equal(moved2.status, 200, `ronda ${round}: ni la baja ni el traslado confirmaron`); assert.equal(located, 1); assert.equal(activeOf(Z.id), 1); rounds.move.push('traslado'); }
  }
  for (let round = 0; round < 4; round++) { // dos bajas simultáneas
    const W = await newAirport('DobleBaja'); const [a, b] = await race(OFFSETS[round], () => setActive('airports', W.id, false, [200, 409]), () => setActive('airports', W.id, false, [200, 409]));
    assert.deepEqual([a.status, b.status].sort(), [200, 409]); assert.equal([a, b].find((x) => x.status === 409).data.code, 'GEOGRAPHIC_STATE_UNCHANGED'); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'GEOGRAPHIC_AIRPORT' AND entidad_id=${W.id} AND operacion=N'SET_ACTIVE'`), 1); rounds.twice.push('una');
  }
  // invariantes finales sobre los registros de esta ejecución
  const marked = `(SELECT id_aeropuertos FROM aeropuertos WHERE nombre_aeropuerto LIKE N'%${MARK}%')`;
  assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN aeropuertos a ON a.id_aeropuertos IN (v.id_aeropuerto_origen,v.id_aeropuerto_destino) JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE a.nombre_aeropuerto LIKE N'%${MARK}%' AND a.esta_activo=0 AND e.codigo_estado_vuelo NOT IN (N'CANCELADO',N'FINALIZADO',N'COMPLETADO')`), 0, 'ningún vuelo abierto apunta a un aeropuerto inactivo');
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo r JOIN vuelos v ON v.id_vuelos=r.id_vuelos JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo JOIN aeropuertos a ON a.id_aeropuertos=r.id_aeropuerto_alternativo WHERE r.es_version_actual=1 AND a.esta_activo=0 AND a.nombre_aeropuerto LIKE N'%${MARK}%' AND e.codigo_estado_vuelo NOT IN (N'CANCELADO',N'FINALIZADO',N'COMPLETADO')`), 0, 'ninguna ruta vigente de un vuelo abierto usa un alternativo inactivo');
  assert.equal(count(`SELECT COUNT(*) FROM aeronaves a WHERE a.esta_activa=1 AND a.id_aeropuertos IN ${marked} AND a.id_aeropuertos IN (SELECT id_aeropuertos FROM aeropuertos WHERE esta_activo=0)`), 0, 'ninguna aeronave activa está ubicada en un aeropuerto inactivo');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos v LEFT JOIN aeropuertos a ON a.id_aeropuertos=v.id_aeropuerto_destino WHERE v.motivo_vuelo=N'Integridad ${MARK}' AND a.id_aeropuertos IS NULL`), 0, 'sin vuelos huérfanos');
  const logs = spawnSync('docker', ['logs', '--since', startedAt, BACKEND], { encoding: 'utf8' }); const deadlocks = ((logs.stdout || '') + (logs.stderr || '')).split(/\r?\n/).filter((l) => /deadlock|was deadlocked/i.test(l)).length;
  pass(`D carreras reales en SQL Server (${OFFSETS.length} rondas con desfases ${OFFSETS.join('/')} por escenario): destino ${rounds.create.join(',')}; alternativo ${rounds.route.join(',')}; ubicación ${rounds.move.join(',')}; doble baja ${rounds.twice.length} veces con un único ganador; invariantes finales sin vuelos, rutas ni aeronaves apuntando a aeropuertos inactivos (líneas de bloqueo mutuo en el log: ${deadlocks})`);

  // ================= E: tipos de vuelo =================
  const TYPE = 'ENTRENAMIENTO';
  const types = await ok('/catalogs/flight-types?operationalOnly=true', { token: ops.token }); assert.ok(types.some((t) => t.codigo === TYPE) && !types.some((t) => t.codigo === 'SANITARIO'));
  const T = await planned(await newAirport('BaseT'), await newAirport('DestinoT'), nextCommander(), TYPE);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN tipos_vuelo t ON t.id_tipos_vuelo=v.id_tipos_vuelo WHERE v.id_vuelos=${T.id} AND t.codigo_tipo_vuelo=N'${TYPE}'`), 1);
  try {
    sql(`UPDATE tipos_vuelo SET esta_activo=0 WHERE codigo_tipo_vuelo=N'${TYPE}'`);
    assert.equal((await ok('/catalogs/flight-types?operationalOnly=true', { token: ops.token })).some((t) => t.codigo === TYPE), false, 'el catálogo operativo omite el tipo inactivo');
    const plane = await newPlane(await newAirport('BaseT2')); const inactive = await createFlight(plane, T.destination, nextCommander(), { type: TYPE, expect: [409] });
    assert.equal(inactive.data.code, 'TIPO_VUELO_INACTIVO'); const unknown = await createFlight(plane, T.destination, nextCommander(), { type: 'TIPO_QUE_NO_EXISTE', expect: [400] }); assert.equal(unknown.data.code, 'TIPO_VUELO_INEXISTENTE');
    assert.equal((await createFlight(plane, T.destination, nextCommander(), { type: 'SANITARIO', expect: [400, 409] })).status === 200, false, 'SANITARIO sigue reservado al canal del DTS');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_aeronaves=${plane.id}`), 0, 'las solicitudes manipuladas no crean vuelos');
    const historical = (await ok('/flights', { token: ops.token })).find((f) => f.id === T.id); assert.equal(historical.tipo.codigo, TYPE, 'el vuelo histórico conserva su tipo aunque se desactive');
    assert.equal((await ok(`/flights/${T.id}`, { token: ops.token })).vuelo.tipo.codigo, TYPE, 'la ficha del vuelo tampoco depende de que el tipo siga activo');
    // replanificación: el comandante rechaza, Operaciones replanifica con otro destino y el tipo no cambia
    const R = await planned(await newAirport('BaseRP'), await newAirport('DestinoRP'), nextCommander(), 'REPOSICIONAMIENTO');
    const sanityPlane = await newPlane(await newAirport('BaseRP2'));
    const pending = (await createFlight(sanityPlane, R.destination, R.commander, { type: 'OTRO' })).data; await call(`/flights/${pending.id}/commander-assignment/response`, { method: 'POST', token: R.commander.token, body: { aceptar: false, motivo: 'No puedo realizar este traslado' } });
    assert.equal(stateOf(pending.id), 'PENDIENTE_REPLANIFICACION');
    sql(`UPDATE tipos_vuelo SET esta_activo=0 WHERE codigo_tipo_vuelo=N'OTRO'`);
    const when = futureSlot(); const newDestination = await newAirport('DestinoRP2');
    await ok(`/flights/${pending.id}/operational-replanning`, { method: 'POST', token: ops.token, body: { aircraftId: sanityPlane.id, comandanteId: R.commander.id, destinoId: newDestination.id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } });
    assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN tipos_vuelo t ON t.id_tipos_vuelo=v.id_tipos_vuelo WHERE v.id_vuelos=${pending.id} AND t.codigo_tipo_vuelo=N'OTRO' AND v.id_aeropuerto_destino=${newDestination.id}`), 1, 'replanificar un vuelo cuyo tipo se desactivó no modifica el tipo original');
  } finally { sql(`UPDATE tipos_vuelo SET esta_activo=1 WHERE codigo_tipo_vuelo IN (N'${TYPE}',N'OTRO')`); }
  assert.equal(count(`SELECT COUNT(*) FROM tipos_vuelo WHERE esta_activo=0`), 0, 'los tipos quedaron restaurados');
  assert.equal((await ok('/catalogs/flight-types?operationalOnly=true', { token: ops.token })).some((t) => t.codigo === TYPE), true);
  pass('E tipos de vuelo: el activo se usa; el inactivo y el inexistente se rechazan en el backend (409/400 con código) y no crean vuelos; el vuelo histórico conserva y consulta su tipo; la replanificación no lo modifica');
  console.log(`\nE2E GEOGRAFÍA INTEGRIDAD COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E GEOGRAFÍA INTEGRIDAD:', e.stack || e); process.exit(1); });
