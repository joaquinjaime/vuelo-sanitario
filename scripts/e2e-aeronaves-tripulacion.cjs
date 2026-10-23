/* E2E de API sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e, SQL Server real):
 * administración de aeronaves (alta, edición, baja lógica / reactivación, ubicación, disponibilidad, historial), cambio de aeronave,
 * tripulación adicional con baja lógica e historial, integración con vuelos operativos y sanitarios, cancelación y reutilización de
 * recursos, permisos por rol, auditoría, notificaciones, atomicidad ante fallo de auditoría y concurrencia real.
 * Sólo crea registros marcados; nunca modifica la base habitual. Los únicos objetos temporales son triggers de prueba que fuerzan un
 * fallo de auditoría; los crea y elimina este script. Uso: node scripts/e2e-aeronaves-tripulacion.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PASSWORD, PDF, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const HOUR = 3600000, DAY = 86400000, TZ = -3 * HOUR;
const civilDay = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);
const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const aircraftOf = (id) => Number(one(`SELECT ISNULL(id_aeronaves,0) FROM vuelos WHERE id_vuelos=${id}`));
const originOf = (id) => Number(one(`SELECT ISNULL(id_aeropuerto_origen,0) FROM vuelos WHERE id_vuelos=${id}`));
const planeAirport = (id) => Number(one(`SELECT ISNULL(id_aeropuertos,0) FROM aeronaves WHERE id_aeronaves=${id}`));
const planeActive = (id) => one(`SELECT CAST(esta_activa AS int) FROM aeronaves WHERE id_aeronaves=${id}`);
const planeAudit = (id, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'AIRCRAFT' AND entidad_id=${id} AND operacion=N'${op}'`);
const flightAudit = (flightId, type, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flightId} AND tipo_entidad=N'${type}' AND operacion=N'${op}'`);
const notif = (type, user, flightId) => count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'${type}' AND id_usuarios=${user.id} AND id_vuelos=${flightId}`);
const activeCrew = (flightId) => count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flightId} AND fecha_baja IS NULL`);
const allCrew = (flightId) => count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flightId}`);
const crewRow = (flightId, user) => sql(`SELECT TOP 1 id_vuelos_tripulantes, ISNULL(CONVERT(varchar(30),fecha_baja,121),'NULL'), ISNULL(CAST(id_usuario_baja AS varchar),'NULL'), ISNULL(motivo_baja,'NULL') FROM vuelos_tripulantes WHERE id_vuelos=${flightId} AND id_usuarios=${user.id} ORDER BY id_vuelos_tripulantes DESC`).split('|').map((x) => x.trim());
const raw = async (p, opts = {}) => call(p, { ...opts, expect: [200, 204, 400, 401, 403, 404, 409, 500] });
const race = (fns) => Promise.all(fns.map(async (fn) => { try { return await fn(); } catch (e) { return { status: -1, error: e.message }; } }));
const statuses = (results) => results.map((r) => r.status).sort((a, b) => a - b);

async function provisionRole(admin, user, roleCode) {
  await call(`/crew-qualifications/${user.id}/${roleCode}`, { method: 'PUT', token: admin, expect: [204] });
  const credential = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode, type: 'Documento de prueba', number: 'E2E-' + roleCode + '-' + user.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
  const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
  const up = await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form });
  assert.equal(up.status, 200, 'carga de credencial');
  await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
}

(async () => {
  const info = JSON.parse(require('node:child_process').spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'), 'el E2E sólo corre contra la base aislada');
  assert.equal(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL'), '47', 'migraciones hasta V46 aplicadas en la base aislada');
  assert.equal(one("SELECT CAST(success AS int) FROM flyway_schema_history WHERE version='45'"), '1');
  const tablesBefore = count("SELECT COUNT(*) FROM sys.tables WHERE name NOT IN ('flyway_schema_history')");
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adminName = dotenv.BOOTSTRAP_ADMIN_USERNAME;

  // ---------- Fixtures ----------
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'xops'), ops2 = await createUser(admin, 'OPERACIONES', 'xops2'), dts = await createUser(admin, 'DTS', 'xdts');
  const cmdNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'S1', 'S2', 'S3', 'S4'];
  const cmd = {}; for (const n of cmdNames) { cmd[n] = await createUser(admin, 'COMANDANTE', 'xc' + n); await provision(admin, cmd[n]); }
  const copi = await createUser(admin, 'DTS', 'xcopi'), med1 = await createUser(admin, 'DTS', 'xmed1'), med2 = await createUser(admin, 'DTS', 'xmed2'), enf = await createUser(admin, 'DTS', 'xenf'), unclassified = await createUser(admin, 'DTS', 'xunc'), inactiveMed = await createUser(admin, 'DTS', 'xina');
  await provisionRole(admin, copi, 'COPILOTO'); await provisionRole(admin, med1, 'MEDICO'); await provisionRole(admin, med2, 'MEDICO'); await provisionRole(admin, enf, 'ENFERMERO'); await provisionRole(admin, inactiveMed, 'MEDICO');
  await call(`/auth/users/${inactiveMed.id}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [200] });
  let province, airports, localities, otherAirport;
  const provinces = await ok('/catalogs/provinces', { token: ops.token });
  for (const p of provinces) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }), l = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (a.length >= 3 && l.length >= 2) { province = p; airports = a; localities = l; break; } }
  assert.ok(province, 'se requiere una provincia con 3 aeropuertos y 2 localidades');
  for (const p of provinces) if (p.id !== province.id) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (a.length) { otherAirport = a[0]; break; } }
  assert.ok(otherAirport, 'se requiere un aeropuerto de otra provincia');
  for (const n of cmdNames) await call(`/catalogs/commanders/${cmd[n].id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  const [A0, A1, A2] = airports;
  let seq = 0;
  const newPlane = async (airport = A0, extra = {}) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'Z' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, equipamientoMedico: 'Camilla', aeropuertoActualId: airport.id, activo: true, ...extra } });
  const slot = () => { const d = futureSlot(); d.setHours(9, 0, 0, 0); return d; };
  const at = (d, hours) => new Date(d.getTime() + hours * HOUR);
  const opFlightBody = (plane, commander, dest, from, to) => ({ tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Aeronaves y tripulación ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: dest.id, salida: fmt(from), llegada: fmt(to) });
  const opFlight = async (plane, commander, dest, from, to, token = ops.token) => (await ok('/flights/operational', { method: 'POST', token, body: opFlightBody(plane, commander, dest, from, to) })).id;
  const accept = async (flightId, commander) => ok(`/flights/${flightId}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } });
  const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((r) => r.codigo !== 'OTRO');
  const crewList = async (flightId, token = ops.token, history = false) => ok(`/flights/${flightId}/crew${history ? '?history=true' : ''}`, { token });
  const addCrew = (flightId, user, role, token = ops.token, expect = [204]) => call(`/flights/${flightId}/crew`, { method: 'POST', token, body: { userId: user.id, crewRoleCode: role }, expect });
  const aircraftView = (id) => ok('/catalogs/aircraft/admin', { token: admin }).then((l) => l.find((a) => a.id === id));
  pass(`fixtures: migración V45 aplicada (success=1), 16 comandantes habilitados, ${[copi, med1, med2, enf].length} tripulantes clasificados y verificados, un usuario sin clasificación y uno desactivado, provincia ${province.nombre} con ${airports.length} aeropuertos`);

  // ---------- A: administración de aeronaves ----------
  const aircraftBefore = count('SELECT COUNT(*) FROM aeronaves');
  const plateA = (MARK + 'ADM').toUpperCase();
  const a1 = await ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: plateA.toLowerCase(), modelo: 'King Air', tipo: 'Turbohélice', capacidadPacientes: 1, capacidadTripulacion: 3, equipamientoMedico: 'Camilla', aeropuertoActualId: A0.id } });
  assert.equal(a1.matricula, plateA, 'la matrícula se normaliza a mayúsculas'); assert.equal(a1.activo, true); assert.equal(a1.estadoOperativo, 'SIN_ASIGNACIONES'); assert.equal(a1.aeropuertoActualId, A0.id);
  assert.equal(sql(`SELECT matricula, esta_activa, id_aeropuertos, CASE WHEN fecha_creacion IS NULL THEN 0 ELSE 1 END FROM aeronaves WHERE id_aeronaves=${a1.id}`).replace(/\s/g, ''), `${plateA}|1|${A0.id}|1`);
  assert.equal(sql(`SELECT TOP 1 u.nombre_usuario FROM eventos_auditoria a JOIN usuarios u ON u.id_usuarios=a.id_usuario_actor WHERE a.tipo_entidad=N'AIRCRAFT' AND a.entidad_id=${a1.id} AND a.operacion=N'CREATE'`).trim(), adminName, 'la auditoría registra quién creó la aeronave');
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'AIRCRAFT' AND entidad_id=${a1.id} AND operacion=N'CREATE' AND fecha_ocurrencia IS NOT NULL AND ISJSON(valores_nuevos)=1`), 1);
  const dup = await raw('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: plateA.toLowerCase(), modelo: 'X', tipo: 'Y', capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: A0.id } });
  assert.equal(dup.status, 409); assert.equal(dup.data.code, 'DUPLICATE_PLATE'); assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE UPPER(matricula)=N'${plateA}'`), 1);
  const invalid = [{ modelo: '' }, { capacidadPacientes: 0 }, { capacidadTripulacion: null }, { aeropuertoActualId: 999999999 }, { aeropuertoActualId: null }, { matricula: 'LV BAD!' }, { matricula: 'LV-' + 'X'.repeat(25) }, { tipo: ' ' }, { matricula: '' }];
  for (const patch of invalid) assert.equal((await raw('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'INV' + (++seq)).toUpperCase(), modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: A0.id, ...patch } })).status, 400, JSON.stringify(patch));
  assert.equal(count('SELECT COUNT(*) FROM aeronaves') - aircraftBefore, 1, 'ninguna alta inválida o duplicada deja registros');
  for (const who of [ops, ops2, dts, cmd.A]) {
    assert.equal((await raw('/catalogs/aircraft', { method: 'POST', token: who.token, body: { matricula: MARK + 'NOPE', modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: A0.id } })).status, 403);
    assert.equal((await raw(`/catalogs/aircraft/${a1.id}`, { method: 'PUT', token: who.token, body: { matricula: plateA, modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2 } })).status, 403);
    assert.equal((await raw(`/catalogs/aircraft/${a1.id}/active`, { method: 'POST', token: who.token, body: { activo: false } })).status, 403);
    assert.equal((await raw('/catalogs/aircraft/admin', { token: who.token })).status, 403); assert.equal((await raw(`/catalogs/aircraft/${a1.id}/history`, { token: who.token })).status, 403);
  }
  for (const who of [dts, cmd.A]) { assert.equal((await raw(`/catalogs/aircraft/${a1.id}/location`, { method: 'POST', token: who.token, body: { locationId: A1.id } })).status, 403); assert.equal((await raw(`/catalogs/aircraft/${a1.id}/flights`, { token: who.token })).status, 403); }
  assert.ok([401, 403].includes((await raw('/catalogs/aircraft/admin')).status));
  assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE id_aeronaves=${a1.id} AND esta_activa=1`), 1, 'los intentos no autorizados no modifican nada');
  const edited = await ok(`/catalogs/aircraft/${a1.id}`, { method: 'PUT', token: admin, body: { matricula: plateA, modelo: 'King Air B350', tipo: 'Turbohélice', capacidadPacientes: 2, capacidadTripulacion: 4, equipamientoMedico: 'Camilla y respirador' } });
  assert.equal(edited.modelo, 'King Air B350'); assert.equal(edited.capacidadTripulacion, 4); assert.equal(edited.aeropuertoActualId, A0.id); assert.equal(edited.activo, true);
  assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE id_aeronaves=${a1.id} AND modelo=N'King Air B350' AND capacidad_tripulacion=4`), 1); assert.equal(planeAudit(a1.id, 'UPDATE'), 1);
  assert.equal((await raw(`/catalogs/aircraft/${a1.id}`, { method: 'PUT', token: admin, body: { matricula: plateA, modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2, activo: false } })).status, 400, 'la edición no cambia el estado');
  assert.equal((await raw(`/catalogs/aircraft/${a1.id}`, { method: 'PUT', token: admin, body: { matricula: plateA, modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: A1.id } })).status, 400, 'la edición no cambia la ubicación');
  const other = await newPlane(); assert.equal((await raw(`/catalogs/aircraft/${a1.id}`, { method: 'PUT', token: admin, body: { matricula: other.matricula.toLowerCase(), modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2 } })).data.code, 'DUPLICATE_PLATE');
  assert.equal(planeActive(a1.id), '1'); assert.equal(planeAirport(a1.id), A0.id);
  const moved = await ok(`/catalogs/aircraft/${a1.id}/location`, { method: 'POST', token: admin, body: { locationId: A1.id, motivo: 'Reposicionamiento E2E' } });
  assert.equal(moved.aeropuertoActualId, A1.id); assert.equal(planeAirport(a1.id), A1.id);
  const moveEvent = sql(`SELECT TOP 1 valores_anteriores, valores_nuevos, u.nombre_usuario FROM eventos_auditoria a JOIN usuarios u ON u.id_usuarios=a.id_usuario_actor WHERE a.tipo_entidad=N'AIRCRAFT' AND a.entidad_id=${a1.id} AND a.operacion=N'MANUAL_LOCATION_CHANGE'`);
  assert.ok(moveEvent.includes(`"aeropuertoActualId":${A0.id}`) && moveEvent.includes(`"aeropuertoActualId":${A1.id}`) && moveEvent.includes('Reposicionamiento E2E') && moveEvent.trim().endsWith(adminName), 'ubicación anterior, nueva, motivo y responsable auditados');
  assert.equal((await raw(`/catalogs/aircraft/${a1.id}/location`, { method: 'POST', token: admin, body: { locationId: A1.id } })).status, 400, 'misma ubicación'); assert.equal((await raw(`/catalogs/aircraft/${a1.id}/location`, { method: 'POST', token: admin, body: { locationId: 999999999 } })).status, 400);
  await ok(`/catalogs/aircraft/${a1.id}/location`, { method: 'POST', token: ops.token, body: { locationId: A0.id, motivo: 'Operaciones restituye' } }); assert.equal(planeAirport(a1.id), A0.id); assert.equal(planeAudit(a1.id, 'MANUAL_LOCATION_CHANGE'), 2);
  const off = await ok(`/catalogs/aircraft/${a1.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Mantenimiento E2E' } });
  assert.equal(off.estadoOperativo, 'DESACTIVADA'); assert.equal(planeActive(a1.id), '0'); assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE id_aeronaves=${a1.id}`), 1, 'la baja es lógica');
  assert.ok(!(await ok('/catalogs/aircraft', { token: ops.token })).some((x) => x.id === a1.id), 'no aparece entre las aeronaves operativas'); assert.equal((await aircraftView(a1.id)).activo, false, 'se consulta desde la sección administrativa');
  assert.equal((await raw('/flights/operational', { method: 'POST', token: ops.token, body: opFlightBody(a1, cmd.A, A1, slot(), at(slot(), 2)) })).status, 400, 'una aeronave desactivada no puede asignarse');
  assert.equal((await raw(`/catalogs/aircraft/${a1.id}/active`, { method: 'POST', token: admin, body: { activo: false } })).status, 409);
  await ok(`/catalogs/aircraft/${a1.id}/active`, { method: 'POST', token: admin, body: { activo: true } }); assert.equal(planeActive(a1.id), '1'); assert.equal(planeAudit(a1.id, 'SET_ACTIVE'), 2);
  const history = await ok(`/catalogs/aircraft/${a1.id}/history`, { token: admin }); assert.deepEqual(history.map((h) => h.operacion).sort(), ['CREATE', 'MANUAL_LOCATION_CHANGE', 'MANUAL_LOCATION_CHANGE', 'SET_ACTIVE', 'SET_ACTIVE', 'UPDATE']); assert.ok(history.every((h) => h.usuario && h.fecha));
  pass('A aeronaves: alta con normalización/auditoría (actor y fecha), matrícula duplicada sin distinguir mayúsculas (409) y 9 altas inválidas sin registros, permisos por rol en servidor, edición sin cambiar estado ni ubicación, ubicación administrativa auditada (anterior, nueva, motivo, responsable), baja lógica y reactivación con historial');

  // ---------- B: ciclo del vuelo, uso de la aeronave y ubicación ----------
  const planeB = await newPlane(A0, { capacidadTripulacion: 3 }); const s1 = slot(); const f1 = await opFlight(planeB, cmd.C, A1, s1, at(s1, 3));
  assert.equal(stateOf(f1), 'PENDIENTE_CONFIRMACION_COMANDANTE'); assert.equal(activeCrew(f1), 1, 'el comandante consta una única vez como tripulante');
  const blocked = await raw(`/catalogs/aircraft/${planeB.id}/active`, { method: 'POST', token: admin, body: { activo: false } }); const f1Code = one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${f1}`);
  assert.equal(blocked.status, 409); assert.equal(blocked.data.code, 'AIRCRAFT_HAS_ASSIGNMENTS'); assert.deepEqual(blocked.data.vuelos, [f1Code]); assert.equal(planeActive(planeB.id), '1');
  assert.equal((await raw(`/catalogs/aircraft/${planeB.id}/location`, { method: 'POST', token: admin, body: { locationId: A2.id } })).data.code, 'AIRCRAFT_LOCATION_CONFLICT'); assert.equal(planeAirport(planeB.id), A0.id);
  const viewB = await aircraftView(planeB.id); assert.equal(viewB.estadoOperativo, 'ASIGNADA'); assert.equal(viewB.vuelosComprometidos, 1); assert.equal(viewB.proximoVuelo.codigo, f1Code); assert.equal(viewB.activo, true);
  const whole = (from, to) => ok(`/catalogs/aircraft/availability?from=${encodeURIComponent(fmt(from))}&to=${encodeURIComponent(fmt(to))}`, { token: ops.token }).then((l) => l.find((x) => x.id === planeB.id));
  assert.equal((await whole(at(s1, -30), at(s1, -26))).disponible, true, 'activa y asignada, pero disponible fuera del horario del vuelo');
  const clash = await whole(at(s1, 1), at(s1, 2)); assert.equal(clash.disponible, false); assert.equal(clash.conflictos[0].codigo, f1Code);
  assert.equal((await whole(at(s1, 3), at(s1, 5))).disponible, true, 'un vuelo que empieza cuando termina el otro no se superpone');
  assert.equal((await raw(`/catalogs/aircraft/availability?from=${encodeURIComponent(fmt(at(s1, 2)))}&to=${encodeURIComponent(fmt(at(s1, 1)))}`, { token: ops.token })).status, 400); assert.equal((await raw(`/catalogs/aircraft/availability?from=2031-01-01T10:00:00&to=2031-01-01T12:00:00`, { token: cmd.A.token })).status, 403);
  await addCrew(f1, med1, 'MEDICO'); await addCrew(f1, enf, 'ENFERMERO'); assert.equal(activeCrew(f1), 3);
  const capacity = await raw(`/catalogs/aircraft/${planeB.id}`, { method: 'PUT', token: admin, body: { matricula: planeB.matricula, modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 2, equipamientoMedico: 'Camilla' } });
  assert.equal(capacity.status, 409); assert.equal(capacity.data.code, 'AIRCRAFT_CAPACITY_CONFLICT'); assert.equal(one(`SELECT capacidad_tripulacion FROM aeronaves WHERE id_aeronaves=${planeB.id}`), '3');
  await ok(`/catalogs/aircraft/${planeB.id}`, { method: 'PUT', token: admin, body: { matricula: planeB.matricula, modelo: 'E2E editado', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 3, equipamientoMedico: 'Camilla' } });
  await accept(f1, cmd.C); assert.equal(stateOf(f1), 'PLANIFICADO');
  assert.equal((await raw(`/flights/${f1}/start`, { method: 'POST', token: cmd.C.token })).status, 403); await ok(`/flights/${f1}/start`, { method: 'POST', token: ops.token }); assert.equal(stateOf(f1), 'EN_CURSO');
  assert.equal((await raw(`/catalogs/aircraft/${planeB.id}/active`, { method: 'POST', token: admin, body: { activo: false } })).data.code, 'AIRCRAFT_IN_FLIGHT');
  assert.equal((await raw(`/catalogs/aircraft/${planeB.id}`, { method: 'PUT', token: admin, body: { matricula: planeB.matricula, modelo: 'Otro', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 3 } })).data.code, 'AIRCRAFT_IN_FLIGHT');
  assert.equal((await raw(`/catalogs/aircraft/${planeB.id}/location`, { method: 'POST', token: admin, body: { locationId: A2.id } })).data.code, 'AIRCRAFT_IN_FLIGHT'); assert.equal((await aircraftView(planeB.id)).estadoOperativo, 'EN_VUELO');
  const spare = await newPlane(A0); assert.equal((await raw(`/flights/${f1}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: spare.id } })).status, 400, 'no se cambia la aeronave de un vuelo iniciado');
  const crewRows1 = await crewList(f1); const medRow = crewRows1.find((r) => r.userId === med1.id);
  assert.equal((await raw(`/flights/${f1}/crew/${medRow.id}`, { method: 'DELETE', token: ops.token })).status, 400, 'no se retira tripulación de un vuelo iniciado'); assert.equal((await raw(`/flights/${f1}/crew/${medRow.id}`, { method: 'PUT', token: ops.token, body: { userId: med2.id, crewRoleCode: 'MEDICO' } })).status, 400); assert.equal((await addCrew(f1, med2, 'MEDICO', ops.token, [400])).status, 400); assert.equal(activeCrew(f1), 3);
  const clashing = await raw('/flights/operational', { method: 'POST', token: ops.token, body: opFlightBody(planeB, cmd.D, A1, at(s1, 1), at(s1, 2)) }); assert.equal(clashing.status, 409, 'una aeronave en vuelo no admite otro vuelo');
  await ok(`/flights/${f1}/finish`, { method: 'POST', token: ops.token }); assert.equal(stateOf(f1), 'FINALIZADO');
  assert.equal(planeAirport(planeB.id), A1.id, 'la ubicación pasa al destino al finalizar'); assert.equal(planeAudit(planeB.id, 'UPDATE_LOCATION_AFTER_FINISH'), 1); assert.equal(planeAudit(planeB.id, 'MANUAL_LOCATION_CHANGE'), 0, 'la actualización automática no se registra como cambio manual');
  assert.equal((await addCrew(f1, med2, 'MEDICO', ops.token, [400])).status, 400); assert.equal((await raw(`/flights/${f1}/crew/${medRow.id}`, { method: 'DELETE', token: ops.token })).status, 400);
  assert.equal((await aircraftView(planeB.id)).estadoOperativo, 'SIN_ASIGNACIONES'); await ok(`/catalogs/aircraft/${planeB.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Baja tras el vuelo' } });
  assert.equal(aircraftOf(f1), planeB.id, 'el historial del vuelo conserva la aeronave'); assert.ok((await ok(`/catalogs/aircraft/${planeB.id}/flights`, { token: admin })).some((f) => f.id === f1 && f.estado === 'FINALIZADO'));
  assert.equal(activeCrew(f1), 3, 'la tripulación del vuelo finalizado no cambia'); await ok(`/catalogs/aircraft/${planeB.id}/active`, { method: 'POST', token: admin, body: { activo: true } });
  pass('B ciclo: la aeronave asignada no puede desactivarse, editarse por debajo de la tripulación ni reubicarse mientras tenga vuelos comprometidos; activa+asignada sigue disponible fuera del intervalo (y no durante él); en vuelo queda bloqueada para todo; al finalizar su ubicación pasa al destino (evento automático, sin duplicar el manual); el vuelo y su tripulación finalizados no se modifican; la baja posterior conserva el historial');

  // ---------- C: cambio de aeronave, liberación y marcas de revisión ----------
  const p2 = await newPlane(A0), p3 = await newPlane(A2), p4 = await newPlane(A0), pOther = await newPlane(otherAirport), p6 = await newPlane(A2), pOff = await newPlane(A2);
  await ok(`/catalogs/aircraft/${pOff.id}/active`, { method: 'POST', token: admin, body: { activo: false } });
  const s2 = slot(); const f2 = await opFlight(p2, cmd.D, A1, s2, at(s2, 2)); await accept(f2, cmd.D); assert.equal(stateOf(f2), 'PLANIFICADO');
  const busy = await opFlight(p6, cmd.E, A1, at(s2, 1), at(s2, 3)); // p6 ocupada durante el horario de f2
  const routeBody = { recorrido: 'TUC - AEP directo', version: 0, alternativoId: null, altitudPies: 9000, distanciaNm: 100, tiempoEstimadoMinutos: 90, observaciones: 'E2E' };
  await ok(`/flights/${f2}/route`, { method: 'PUT', token: cmd.D.token, body: routeBody }); assert.equal((await ok(`/flights/${f2}/route`, { token: ops.token })).estado, 'COMPLETA');
  await ok(`/flights/${f2}/hangar`, { method: 'PUT', token: ops.token, body: { version: 0, requiereHangar: false, preparacionCompleta: false, observaciones: 'Sin hangar' } }); assert.equal((await ok(`/flights/${f2}/hangar`, { token: ops.token })).estado, 'NO_REQUERIDO');
  const candidates = await ok(`/flights/${f2}/aircraft-candidates`, { token: ops.token }); const byId = Object.fromEntries(candidates.map((c) => [c.id, c]));
  assert.ok(!byId[p2.id], 'la aeronave actual no se ofrece'); assert.equal(byId[p4.id].disponible, true); assert.equal(byId[p3.id].disponible, true); assert.ok(!byId[pOther.id], 'otra provincia no es compatible'); assert.ok(!byId[pOff.id], 'una aeronave desactivada no es candidata');
  assert.equal(byId[p6.id].disponible, false); assert.match(byId[p6.id].motivoNoDisponible, /comprometido/); assert.equal(byId[p6.id].conflictos[0].codigo, one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${busy}`));
  assert.equal((await ok(`/flights/${f2}/available-aircraft`, { token: ops.token })).some((x) => x.id === p6.id), false);
  for (const who of [cmd.D, dts, admin]) assert.equal((await raw(`/flights/${f2}/aircraft`, { method: 'POST', token: typeof who === 'string' ? who : who.token, body: { aircraftId: p4.id } })).status, 403);
  assert.equal((await raw(`/flights/${f2}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: p6.id } })).status, 409); assert.equal((await raw(`/flights/${f2}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: pOff.id } })).status, 400);
  assert.equal((await raw(`/flights/${f2}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: p2.id } })).status, 400); assert.equal((await raw(`/flights/${f2}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: pOther.id } })).status, 400); assert.equal((await raw(`/flights/${f2}/aircraft`, { method: 'POST', token: ops.token, body: {} })).status, 400);
  assert.equal(aircraftOf(f2), p2.id, 'los cambios rechazados no modifican el vuelo');
  const same = await ok(`/flights/${f2}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: p4.id, motivo: 'Cambio por mantenimiento' } });
  assert.equal(same.estadoVuelo, 'PLANIFICADO', 'mismo aeropuerto de origen: el comandante no debe reconfirmar'); assert.equal(aircraftOf(f2), p4.id); assert.equal(originOf(f2), A0.id); assert.equal(flightAudit(f2, 'FLIGHT', 'CHANGE_AIRCRAFT'), 1);
  assert.equal(notif('AIRCRAFT_CHANGED', cmd.D, f2), 1); assert.doesNotMatch(sql(`SELECT mensaje FROM notificaciones WHERE tipo_notificacion=N'AIRCRAFT_CHANGED' AND id_vuelos=${f2}`), /confirmar nuevamente/);
  assert.equal((await ok(`/flights/${f2}/route`, { token: ops.token })).estado, 'REQUIERE_REVISION', 'la ruta requiere revisión por el cambio de aeronave'); const routeAfter = await ok(`/flights/${f2}/route`, { token: ops.token }); assert.equal(routeAfter.versiones.length, 1, 'no se pierde la versión histórica'); assert.equal((await ok(`/flights/${f2}/hangar`, { token: ops.token })).estado, 'REQUIERE_REVISION');
  const reused = await opFlight(p2, cmd.F, A1, at(s2, 0), at(s2, 2)); assert.ok(reused, 'la aeronave reemplazada queda libre inmediatamente para otro vuelo');
  const moved2 = await ok(`/flights/${f2}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: p3.id } });
  assert.equal(moved2.estadoVuelo, 'PENDIENTE_CONFIRMACION_COMANDANTE', 'al cambiar el aeropuerto de origen el comandante debe confirmar de nuevo'); assert.equal(originOf(f2), A2.id); assert.equal(aircraftOf(f2), p3.id); assert.equal(notif('AIRCRAFT_CHANGED', cmd.D, f2), 2); assert.match(sql(`SELECT TOP 1 mensaje FROM notificaciones WHERE tipo_notificacion=N'AIRCRAFT_CHANGED' AND id_vuelos=${f2} ORDER BY id_notificaciones DESC`), /confirmar nuevamente/);
  assert.equal(flightAudit(f2, 'FLIGHT', 'CHANGE_AIRCRAFT'), 2); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${f2} AND operacion=N'CHANGE_AIRCRAFT' AND valores_nuevos LIKE N'%requiereConfirmacionComandante%true%'`), 1);
  await accept(f2, cmd.D); assert.equal(stateOf(f2), 'PLANIFICADO');
  assert.ok(allCrew(f2) >= 1);
  pass('C cambio de aeronave: candidatas con motivo y vuelos en conflicto, permisos (sólo Operaciones), rechazos 400/409 sin efectos, cambio con mismo origen (sin reconfirmar) y con otro origen (vuelve al comandante), aeronave liberada reutilizable de inmediato, auditoría, aviso idempotente al comandante y ruta/hangar en REQUIERE_REVISION conservando sus versiones');

  // ---------- D: vuelo sanitario ----------
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo; const DX = 'Dx-' + MARK;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Aeronaves', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
  const requestAt = (days) => `${civilDay(Date.now() + days * DAY)}T10:00:00`;
  const sanitary = async (when) => (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Traslado ' + MARK, fechaSolicitada: when, extremaUrgencia: false, medical: { diagnostico: DX, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  const sWhen = requestAt(200 + Math.floor(Math.random() * 100)); const sf1 = await sanitary(sWhen); await ok(`/flights/${sf1}/schedule/accept`, { method: 'POST', token: ops.token });
  const sp1 = await newPlane(A0), sp2 = await newPlane(A2), sp3 = await newPlane(A0);
  const sCandidates = await ok(`/flights/${sf1}/available-aircraft`, { token: ops.token }); assert.ok(sCandidates.some((x) => x.id === sp1.id) && !sCandidates.some((x) => x.id === pOther.id), 'sanitario: sólo aeronaves de la provincia de origen');
  await ok(`/flights/${sf1}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: sp1.id, comandanteId: cmd.S1.id } }); assert.equal(stateOf(sf1), 'PLANIFICADO'); assert.equal(aircraftOf(sf1), sp1.id); assert.equal(activeCrew(sf1), 1);
  assert.equal(flightAudit(sf1, 'FLIGHT', 'ASSIGN_RESOURCES'), 1);
  const llegada = `${sWhen.slice(0, 10)}T13:00:00`;
  await ok(`/flights/${sf1}/operational-planning`, { method: 'POST', token: cmd.S1.token, body: { origenId: A0.id, destinoId: A1.id, llegada } }); assert.equal(originOf(sf1), A0.id);
  await addCrew(sf1, med1, 'MEDICO'); assert.equal(activeCrew(sf1), 2, 'la tripulación adicional también se gestiona en vuelos sanitarios');
  assert.equal((await raw(`/flights/${sf1}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: sp2.id } })).status, 400, 'con origen planificado sólo se acepta una aeronave de ese aeropuerto');
  const swapped = await ok(`/flights/${sf1}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: sp3.id } }); assert.equal(swapped.estadoVuelo, 'PLANIFICADO'); assert.equal(aircraftOf(sf1), sp3.id); assert.equal(originOf(sf1), A0.id); assert.equal(activeCrew(sf1), 2, 'el cambio de aeronave conserva la tripulación');
  assert.equal(notif('AIRCRAFT_CHANGED', cmd.S1, sf1), 1);
  const sf2 = await sanitary(sWhen); await ok(`/flights/${sf2}/schedule/accept`, { method: 'POST', token: ops.token });
  const busySan = await raw(`/flights/${sf2}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: sp3.id, comandanteId: cmd.S2.id } }); assert.equal(busySan.status, 409, 'la asignación inicial también respeta el horario de la aeronave'); assert.equal(stateOf(sf2), 'NULL');
  await ok(`/flights/${sf2}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: sp1.id, comandanteId: cmd.S2.id } }); assert.equal(stateOf(sf2), 'PLANIFICADO');
  // reemplazo del comandante en un vuelo planificado: la fila anterior se da de baja sin borrarse
  const sf1Cmd = await crewList(sf1); assert.equal(sf1Cmd.filter((r) => r.comandante).length, 1);
  const sf3 = await sanitary(requestAt(320 + Math.floor(Math.random() * 20))); await ok(`/flights/${sf3}/schedule/accept`, { method: 'POST', token: ops.token });
  await ok(`/flights/${sf3}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: sp1.id, comandanteId: cmd.S3.id } });
  await ok(`/flights/${sf3}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: sp1.id, comandanteId: cmd.S4.id } });
  assert.equal(activeCrew(sf3), 1); assert.equal(allCrew(sf3), 2, 'el comandante anterior consta como historial'); assert.equal(crewRow(sf3, cmd.S3)[3], 'CAMBIO_COMANDANTE'); assert.equal(crewRow(sf3, cmd.S4)[1], 'NULL');
  assert.equal(notif('COMMANDER_UNASSIGNED', cmd.S3, sf3), 1); assert.equal(count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos IN (${sf1},${sf2},${sf3},${f2}) AND (mensaje LIKE N'%${DX}%' OR mensaje LIKE N'%Aeronaves%')`), 0, 'las notificaciones no incluyen datos médicos');
  assert.equal(flightAudit(sf3, 'FLIGHT_CREW', 'REMOVE'), 1);
  pass('D sanitario: aeronaves por provincia de origen, asignación con control de horario (409), tripulación adicional y cambio de aeronave conservándola, restricción por origen planificado, reemplazo de comandante con baja lógica de su fila y aviso, notificaciones sin datos médicos');

  // ---------- E: tripulación adicional ----------
  const planeE = await newPlane(A0, { capacidadTripulacion: 4 }); const sE = slot(); const f4 = await opFlight(planeE, cmd.G, A1, sE, at(sE, 4)); await accept(f4, cmd.G);
  const cand = await ok(`/flights/${f4}/crew/candidates?role=MEDICO`, { token: ops.token }); const candIds = cand.map((c) => c.userId);
  assert.ok(candIds.includes(med1.id) && candIds.includes(med2.id)); assert.ok(!candIds.includes(unclassified.id) && !candIds.includes(inactiveMed.id) && !candIds.includes(cmd.G.id), 'sólo personal clasificado, verificado y activo'); assert.ok(cand.filter((c) => [med1.id, med2.id].includes(c.userId)).every((c) => c.disponible), 'los dos candidatos sintéticos libres se ofrecen disponibles');
  assert.equal((await raw(`/flights/${f4}/crew/candidates?role=COMANDANTE`, { token: ops.token })).status, 400);
  await addCrew(f4, med1, 'MEDICO'); assert.equal(activeCrew(f4), 2); assert.equal(notif('CREW_ASSIGNED', med1, f4), 1); assert.equal(flightAudit(f4, 'FLIGHT_CREW', 'CREATE'), 2); // comandante + médico
  assert.equal((await addCrew(f4, med1, 'MEDICO', ops.token, [409])).status, 409, 'misma persona dos veces en el mismo vuelo'); assert.equal(activeCrew(f4), 2);
  assert.equal((await addCrew(f4, med1, 'ENFERMERO', ops.token, [400])).status, 400, 'la misma persona con otra función no clasificada'); assert.equal(activeCrew(f4), 2);
  assert.equal((await addCrew(f4, med2, 'ENFERMERO', ops.token, [400])).status, 400, 'sin clasificación para esa función'); assert.equal((await addCrew(f4, unclassified, 'MEDICO', ops.token, [400])).status, 400); assert.equal((await addCrew(f4, inactiveMed, 'MEDICO', ops.token, [400])).status, 400, 'un usuario desactivado no es recurso operativo');
  assert.equal((await addCrew(f4, cmd.G, 'MEDICO', ops.token, [400])).status, 400, 'el comandante no se agrega como tripulante adicional'); assert.equal((await addCrew(f4, med2, 'COMANDANTE', ops.token, [400])).status, 400); assert.equal((await raw(`/flights/${f4}/crew`, { method: 'POST', token: ops.token, body: { userId: med2.id } })).status, 400); assert.equal((await addCrew(f4, { id: 999999999 }, 'MEDICO', ops.token, [400])).status, 400);
  // conflictos de horario
  const planeE2 = await newPlane(A0); const fOverlap = await opFlight(planeE2, cmd.H, A1, at(sE, 1), at(sE, 3)); await accept(fOverlap, cmd.H);
  const overlapAttempt = await addCrew(fOverlap, med1, 'MEDICO', ops.token, [409]); assert.equal(overlapAttempt.status, 409); assert.match(overlapAttempt.data.error, /compromiso incompatible/); assert.equal(activeCrew(fOverlap), 1);
  const overlapCand = (await ok(`/flights/${fOverlap}/crew/candidates?role=MEDICO`, { token: ops.token })).find((c) => c.userId === med1.id); assert.equal(overlapCand.disponible, false); assert.match(overlapCand.motivoNoDisponible, new RegExp(one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${f4}`)));
  assert.equal((await ok(`/flights/${fOverlap}/crew/available?role=MEDICO`, { token: ops.token })).some((c) => c.userId === med1.id), false);
  const planeE3 = await newPlane(A0); const fLater = await opFlight(planeE3, cmd.I, A1, at(sE, 4), at(sE, 6)); await accept(fLater, cmd.I); await addCrew(fLater, med1, 'MEDICO'); assert.equal(activeCrew(fLater), 2, 'vuelos consecutivos no se superponen');
  // capacidad de la aeronave (comandante + 3)
  await addCrew(f4, copi, 'COPILOTO'); await addCrew(f4, enf, 'ENFERMERO'); assert.equal(activeCrew(f4), 4); assert.equal((await addCrew(f4, med2, 'MEDICO', ops.token, [409])).status, 409, 'la aeronave no admite más tripulantes que su capacidad'); assert.equal(activeCrew(f4), 4);
  // permisos
  const full = await crewList(f4, cmd.G.token); assert.equal(full.length, 4); assert.equal(full.filter((r) => r.comandante).length, 1); assert.ok(full.every((r) => r.vigente === true));
  assert.equal((await raw(`/flights/${f4}/crew`, { token: cmd.A.token })).status, 403, 'otro comandante no ve vuelos ajenos'); assert.equal((await raw(`/flights/${f4}/crew`, { token: dts.token })).status, 403); assert.equal((await raw(`/flights/${f4}/crew`, { token: admin })).status, 403);
  assert.equal((await raw(`/flights/${f4}/crew`, { method: 'POST', token: cmd.G.token, body: { userId: med2.id, crewRoleCode: 'MEDICO' } })).status, 403, 'el comandante consulta pero no asigna'); assert.equal((await raw(`/flights/${f4}/crew`, { method: 'POST', token: admin, body: { userId: med2.id, crewRoleCode: 'MEDICO' } })).status, 403); assert.equal((await raw(`/flights/${f4}/crew/candidates?role=MEDICO`, { token: cmd.G.token })).status, 403);
  const copiRow = full.find((r) => r.userId === copi.id); const cmdRow = full.find((r) => r.comandante);
  assert.equal((await raw(`/flights/${f4}/crew/${copiRow.id}`, { method: 'DELETE', token: cmd.G.token })).status, 403); assert.equal((await raw(`/flights/${f4}/crew/${cmdRow.id}`, { method: 'DELETE', token: ops.token })).status, 400, 'el comandante no se retira como tripulante'); assert.equal((await raw(`/flights/${f4}/crew/${cmdRow.id}`, { method: 'PUT', token: ops.token, body: { userId: med2.id, crewRoleCode: 'MEDICO' } })).status, 400);
  assert.equal((await raw(`/flights/${f4}/crew/999999999`, { method: 'DELETE', token: ops.token })).status, 404);
  // retiro con historial
  await call(`/flights/${f4}/crew/${copiRow.id}`, { method: 'DELETE', token: ops2.token, expect: [204] });
  const removedRow = crewRow(f4, copi); assert.notEqual(removedRow[1], 'NULL'); assert.equal(removedRow[2], String(ops2.id)); assert.equal(removedRow[3], 'RETIRO'); assert.equal(activeCrew(f4), 3); assert.equal(allCrew(f4), 4, 'el retiro no borra la fila');
  assert.ok(!(await crewList(f4)).some((r) => r.userId === copi.id)); const hist = await crewList(f4, ops.token, true); const histCopi = hist.find((r) => r.userId === copi.id); assert.equal(histCopi.vigente, false); assert.equal(histCopi.motivoBaja, 'RETIRO'); assert.equal(histCopi.bajaPor, ops2.name);
  assert.equal(flightAudit(f4, 'FLIGHT_CREW', 'REMOVE'), 1); assert.equal(notif('CREW_REMOVED', copi, f4), 1);
  assert.equal((await raw(`/flights/${f4}/crew/${copiRow.id}`, { method: 'DELETE', token: ops.token })).status, 409, 'retiro repetido'); assert.equal(flightAudit(f4, 'FLIGHT_CREW', 'REMOVE'), 1);
  assert.ok((await ok(`/flights/${f4}/crew/candidates?role=COPILOTO`, { token: ops.token })).some((c) => c.userId === copi.id && c.disponible), 'la persona retirada queda libre');
  await addCrew(f4, copi, 'COPILOTO'); assert.equal(activeCrew(f4), 4); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${f4} AND id_usuarios=${copi.id}`), 2, 'la nueva asignación convive con la baja histórica');
  assert.throws(() => sql(`INSERT INTO vuelos_tripulantes (id_vuelos, id_usuarios, id_roles_tripulacion, id_usuario_asignador, fecha_creacion) SELECT TOP 1 id_vuelos, id_usuarios, id_roles_tripulacion, id_usuario_asignador, SYSDATETIME() FROM vuelos_tripulantes WHERE id_vuelos=${f4} AND id_usuarios=${copi.id} AND fecha_baja IS NULL`), /uplicate|únic|unique|UNIQUE/i, 'el índice filtrado impide dos asignaciones vigentes de la misma persona');
  // reemplazo
  const med1Row = (await crewList(f4)).find((r) => r.userId === med1.id); await call(`/flights/${f4}/crew/${med1Row.id}`, { method: 'PUT', token: ops.token, body: { userId: med2.id, crewRoleCode: 'MEDICO' }, expect: [204] });
  assert.equal(crewRow(f4, med1)[3], 'REEMPLAZO'); assert.equal(crewRow(f4, med2)[1], 'NULL'); assert.equal(activeCrew(f4), 4); assert.equal(flightAudit(f4, 'FLIGHT_CREW', 'REPLACE'), 1); assert.equal(notif('CREW_REMOVED', med1, f4), 1); assert.equal(notif('CREW_ASSIGNED', med2, f4), 1);
  assert.equal((await raw(`/flights/${f4}/crew/${med1Row.id}`, { method: 'PUT', token: ops.token, body: { userId: med2.id, crewRoleCode: 'MEDICO' } })).status, 409, 'no se reemplaza una asignación ya cerrada');
  assert.equal(count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${f4} AND mensaje LIKE N'%${DX}%'`), 0);
  // cancelación: libera aeronave, comandante y tripulación sin borrar historial
  const crewBeforeCancel = allCrew(f4); const releasedIds = (await crewList(f4)).filter((r) => !r.comandante).map((r) => r.userId).sort((a, b) => a - b);
  await ok(`/flights/${f4}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } }); assert.equal(stateOf(f4), 'CANCELADO'); assert.equal(allCrew(f4), crewBeforeCancel, 'la cancelación conserva todas las filas');
  const cancelAudit = sql(`SELECT valores_nuevos FROM eventos_auditoria WHERE id_vuelos=${f4} AND operacion=N'CANCEL'`); assert.ok(cancelAudit.includes(`"aeronaveId":${planeE.id}`) && cancelAudit.includes(`"comandanteId":${cmd.G.id}`)); for (const id of releasedIds) assert.ok(cancelAudit.includes(String(id)), 'tripulantes liberados auditados');
  assert.equal(notif('FLIGHT_CANCELLED', med2, f4), 1); assert.equal(notif('FLIGHT_CANCELLED', cmd.G, f4), 1);
  assert.equal((await addCrew(f4, med1, 'MEDICO', ops.token, [400])).status, 400, 'un vuelo cancelado no admite cambios de tripulación');
  const reuse = await opFlight(planeE, cmd.G, A1, sE, at(sE, 4)); assert.ok(reuse, 'aeronave y comandante reutilizables tras cancelar'); await accept(reuse, cmd.G);
  await addCrew(reuse, med2, 'MEDICO'); await addCrew(reuse, copi, 'COPILOTO'); await addCrew(reuse, enf, 'ENFERMERO'); assert.equal(activeCrew(reuse), 4, 'la tripulación liberada se asigna a un vuelo del mismo horario');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${f4} AND fecha_baja IS NULL`) >= 1, true, 'el historial del vuelo cancelado sigue consultable'); assert.equal((await crewList(f4, ops.token, true)).length, crewBeforeCancel);
  pass('E tripulación: candidatos sólo elegibles, duplicado (409), funciones/usuarios no habilitados o desactivados (400), conflictos de horario con el vuelo que los causa, vuelos consecutivos, capacidad de la aeronave, permisos por rol, retiro con baja lógica (quién/cuándo/por qué) e índice único filtrado, reemplazo con ambas filas e historial, avisos idempotentes, cancelación que libera recursos conservando el historial y reutilización inmediata');

  // ---------- F: concurrencia real sobre SQL Server ----------
  for (let round = 0; round < 5; round++) {
    const shared = await newPlane(A0); const s = slot(); const cA = cmd.J, cB = cmd.K;
    const results = await race([() => raw('/flights/operational', { method: 'POST', token: ops.token, body: opFlightBody(shared, cA, A1, s, at(s, 3)) }), () => raw('/flights/operational', { method: 'POST', token: ops2.token, body: opFlightBody(shared, cB, A1, at(s, 1), at(s, 4)) })]);
    assert.deepEqual(statuses(results), [200, 409], `ronda ${round}: ${JSON.stringify(results.map((r) => r.status))}`);
    assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_aeronaves=${shared.id}`), 1, 'una única asignación válida de la aeronave');
  }
  pass('F1 concurrencia: dos vuelos que piden la misma aeronave en horarios incompatibles → 1 × 200 y 1 × 409 en 5 rondas, sin asignaciones contradictorias');
  for (let round = 0; round < 5; round++) {
    const s = slot(); const pa = await newPlane(A0), pb = await newPlane(A0); const fa = await opFlight(pa, cmd.L, A1, s, at(s, 3)), fb = await opFlight(pb, cmd.M, A1, at(s, 1), at(s, 4)); await accept(fa, cmd.L); await accept(fb, cmd.M);
    const results = await race([() => raw(`/flights/${fa}/crew`, { method: 'POST', token: ops.token, body: { userId: med1.id, crewRoleCode: 'MEDICO' } }), () => raw(`/flights/${fb}/crew`, { method: 'POST', token: ops2.token, body: { userId: med1.id, crewRoleCode: 'MEDICO' } })]);
    assert.deepEqual(statuses(results), [204, 409], `ronda ${round}: ${JSON.stringify(results.map((r) => r.status))}`); assert.equal(activeCrew(fa) + activeCrew(fb), 3, 'un único compromiso del médico (2 comandantes + 1 médico)');
  }
  pass('F2 concurrencia: el mismo tripulante solicitado por dos vuelos incompatibles → 1 × 204 y 1 × 409 en 5 rondas');
  { const s = slot(); const pa = await newPlane(A0); const fa = await opFlight(pa, cmd.N, A1, s, at(s, 2)); await accept(fa, cmd.N);
    const results = await race([1, 2, 3, 4].map(() => () => raw(`/flights/${fa}/crew`, { method: 'POST', token: ops.token, body: { userId: med2.id, crewRoleCode: 'MEDICO' } })));
    assert.deepEqual(statuses(results), [204, 409, 409, 409], JSON.stringify(results.map((r) => r.status))); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${fa} AND id_usuarios=${med2.id} AND fecha_baja IS NULL`), 1);
    const row = (await crewList(fa)).find((r) => r.userId === med2.id);
    const removal = await race([() => raw(`/flights/${fa}/crew/${row.id}`, { method: 'DELETE', token: ops.token }), () => raw(`/flights/${fa}/crew/${row.id}`, { method: 'DELETE', token: ops2.token }), () => raw(`/flights/${fa}/crew/${row.id}`, { method: 'PUT', token: ops.token, body: { userId: enf.id, crewRoleCode: 'ENFERMERO' } })]);
    assert.equal(removal.filter((r) => r.status === 204).length, 1, JSON.stringify(removal.map((r) => r.status))); assert.ok(removal.every((r) => [204, 409].includes(r.status))); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${fa} AND id_usuarios=${med2.id} AND fecha_baja IS NULL`), 0);
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${fa} AND id_usuarios=${med2.id} AND fecha_baja IS NOT NULL`), 1, 'una sola baja'); }
  pass('F3 concurrencia: cuatro solicitudes idénticas de asignación → una sola fila vigente; retiro y reemplazo simultáneos de la misma asignación → un único resultado');
  for (let round = 0; round < 6; round++) {
    const shared = await newPlane(A0); const s = slot(); const cm = [cmd.J, cmd.K, cmd.L][round % 3];
    const results = await race([() => raw('/flights/operational', { method: 'POST', token: ops.token, body: opFlightBody(shared, cm, A1, s, at(s, 2)) }), () => raw(`/catalogs/aircraft/${shared.id}/active`, { method: 'POST', token: admin, body: { activo: false, motivo: 'Baja concurrente' } })]);
    for (const r of results) assert.ok([200, 400, 409].includes(r.status), `ronda ${round}: estado inesperado ${r.status} ${JSON.stringify(r.data)}`);
    const flightsOn = count(`SELECT COUNT(*) FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_aeronaves=${shared.id} AND e.codigo_estado_vuelo IN (N'PENDIENTE_CONFIRMACION_COMANDANTE',N'PLANIFICADO',N'EN_CURSO')`); const active = planeActive(shared.id);
    assert.equal(results.filter((r) => r.status === 200).length, 1, `ronda ${round}: exactamente una operación gana ${JSON.stringify(results.map((r) => r.status))}`);
    assert.ok(!(flightsOn === 1 && active === '0'), `ronda ${round}: una aeronave desactivada no puede conservar un vuelo comprometido nuevo`); assert.equal(flightsOn === 1, active === '1');
  }
  pass('F4 concurrencia: baja de la aeronave y asignación a un vuelo nuevo en simultáneo → gana exactamente una (6 rondas) y nunca queda una aeronave inactiva con un vuelo comprometido');
  { const target = await newPlane(A0);
    const results = await race([() => raw(`/catalogs/aircraft/${target.id}`, { method: 'PUT', token: admin, body: { matricula: target.matricula, modelo: 'Editado concurrente', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 5, equipamientoMedico: 'Camilla' } }), () => raw(`/catalogs/aircraft/${target.id}/active`, { method: 'POST', token: admin, body: { activo: false } }), () => raw(`/catalogs/aircraft/${target.id}/location`, { method: 'POST', token: admin, body: { locationId: A1.id } })]);
    assert.ok(results.every((r) => [200, 409].includes(r.status)), JSON.stringify(results.map((r) => r.status))); assert.equal(one(`SELECT CAST(esta_activa AS int) FROM aeronaves WHERE id_aeronaves=${target.id}`), results[1].status === 200 ? '0' : '1');
    assert.equal(one(`SELECT modelo FROM aeronaves WHERE id_aeronaves=${target.id}`), results[0].status === 200 ? 'Editado concurrente' : 'E2E'); assert.equal(planeAirport(target.id), results[2].status === 200 ? A1.id : A0.id);
    const dupResults = await race([() => raw('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'DUPC').toUpperCase(), modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: A0.id } }), () => raw('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'dupc').toLowerCase(), modelo: 'M', tipo: 'T', capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: A0.id } })]);
    assert.deepEqual(statuses(dupResults), [200, 409]); assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE UPPER(matricula)=N'${(MARK + 'DUPC').toUpperCase()}'`), 1); }
  { const s = slot(); const x = await newPlane(A0); const y = await newPlane(A0); const z = await newPlane(A2);
    const fa = await opFlight(x, cmd.J, A1, s, at(s, 2)), fb = await opFlight(y, cmd.K, A1, at(s, 1), at(s, 3));
    const results = await race([() => raw(`/flights/${fa}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: z.id } }), () => raw(`/flights/${fb}/aircraft`, { method: 'POST', token: ops2.token, body: { aircraftId: z.id } })]);
    assert.deepEqual(statuses(results), [200, 409], JSON.stringify(results.map((r) => r.status))); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_aeronaves=${z.id}`), 1, 'la misma aeronave no se asigna a dos vuelos superpuestos'); }
  pass('F5 concurrencia: edición/baja/ubicación simultáneas dejan un estado coherente con las respuestas; dos altas de la misma matrícula → una sola aeronave; dos vuelos que cambian a la misma aeronave → una sola asignación');

  // ---------- G: atomicidad ante fallo de la auditoría obligatoria ----------
  { const target = await newPlane(A0); const trig = 'trg_e2e_aeronaves_' + MARK;
    sql(`EXEC(N'CREATE TRIGGER dbo.${trig} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE operacion IN (N''SET_ACTIVE'', N''MANUAL_LOCATION_CHANGE'', N''REMOVE'')) THROW 51000, N''Fallo de prueba'', 1; END');`);
    try {
      const failed = await raw(`/catalogs/aircraft/${target.id}/active`, { method: 'POST', token: admin, body: { activo: false } }); assert.equal(failed.status, 500); assert.equal(planeActive(target.id), '1', 'sin auditoría no se confirma la baja'); assert.equal(planeAudit(target.id, 'SET_ACTIVE'), 0);
      assert.equal((await raw(`/catalogs/aircraft/${target.id}/location`, { method: 'POST', token: admin, body: { locationId: A1.id } })).status, 500); assert.equal(planeAirport(target.id), A0.id);
      const sx = slot(); const fx = await opFlight(await newPlane(A0), cmd.J, A1, sx, at(sx, 2)); await accept(fx, cmd.J); await addCrew(fx, med1, 'MEDICO'); const row = (await crewList(fx)).find((r) => r.userId === med1.id);
      assert.equal((await raw(`/flights/${fx}/crew/${row.id}`, { method: 'DELETE', token: ops.token })).status, 500); assert.equal(activeCrew(fx), 2, 'el retiro no se confirma si falla su auditoría'); assert.equal(crewRow(fx, med1)[1], 'NULL');
    } finally { sql(`DROP TRIGGER IF EXISTS dbo.${trig}`); }
    assert.equal(count(`SELECT COUNT(*) FROM sys.triggers WHERE name=N'${trig}'`), 0, 'el trigger de prueba se eliminó');
    await ok(`/catalogs/aircraft/${target.id}/active`, { method: 'POST', token: admin, body: { activo: false } }); assert.equal(planeActive(target.id), '0'); }
  pass('G atomicidad: si falla la auditoría obligatoria no se confirma la baja, el cambio de ubicación ni el retiro de tripulante; sin el fallo, las mismas operaciones funcionan');

  // ---------- H: integridad e historial ----------
  assert.equal(count("SELECT COUNT(*) FROM sys.tables WHERE name NOT IN ('flyway_schema_history')"), tablesBefore, 'V45 no agregó tablas');
  assert.equal(count("SELECT COUNT(*) FROM sys.indexes WHERE name=N'ux_vuelos_tripulantes_asignacion_vigente' AND is_unique=1 AND filter_definition IS NOT NULL"), 1); assert.equal(count("SELECT COUNT(*) FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID('dbo.vuelos_tripulantes') AND type='UQ'"), 0);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE NOT ((fecha_baja IS NULL AND id_usuario_baja IS NULL AND motivo_baja IS NULL) OR (fecha_baja IS NOT NULL AND id_usuario_baja IS NOT NULL AND motivo_baja IS NOT NULL))`), 0);
  assert.ok(count('SELECT COUNT(*) FROM vuelos_tripulantes WHERE fecha_baja IS NOT NULL') >= 4, 'las bajas se conservaron como historial');
  assert.equal(count('SELECT COUNT(*) FROM aeronaves'), aircraftBefore + count(`SELECT COUNT(*) FROM aeronaves WHERE matricula LIKE N'${MARK.toUpperCase()}%'`) , 'ninguna aeronave se eliminó');
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'AIRCRAFT' AND operacion IN (N'CREATE',N'UPDATE',N'SET_ACTIVE',N'MANUAL_LOCATION_CHANGE') AND (valores_nuevos IS NOT NULL AND ISJSON(valores_nuevos)=0)`), 0);
  pass(`H integridad: sin tablas nuevas, restricciones únicas históricas reemplazadas por el índice filtrado, coherencia baja/usuario/motivo, bajas conservadas, ninguna aeronave eliminada y auditoría JSON válida (${passed} bloques)`);
  console.log(`E2E aeronaves y tripulación: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
