/* E2E de la corrección geográfica (V64/V65) sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e):
 *  A  ubicación operativa del comandante sólo por provincia o CABA (persistencia, auditoría, sin localidad)
 *  B/C elegibilidad por provincia del aeropuerto de salida (comandante de la provincia sí; de otra provincia sólo por excepción autorizada)
 *  D  CABA y Provincia de Buenos Aires son jurisdicciones distintas
 *  E/F las localidades del paciente (origen y destino) se conservan y no se confunden con aeropuertos; no hace falta un aeropuerto en esa localidad
 *  G  cambio de aeropuerto: se reevalúa al comandante, no se mantiene en silencio una asignación inválida, la ruta vuelve a revisión
 *  H  aeropuerto sin provincia conocida: bloquea la decisión que depende de ese dato
 *  I  flujo completo DTS → CO → aeropuertos → comandante → aeronave → planificación del comandante → ruta → inicio → fin, con persistencia en SQL Server
 * Sólo crea registros marcados. Uso: node scripts/e2e-jurisdiccion-aeropuertos.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, fmt, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const DAY = 86400000;
let dayCursor = 2600 + Math.floor(Math.random() * 1500);
const nextSlot = () => { const d = new Date(Date.now() + (dayCursor += 4) * DAY); d.setHours(10, 0, 0, 0); return d; };

const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const resourcesOf = (id) => one(`SELECT CONCAT(ISNULL(CAST(id_usuario_comandante AS varchar(20)),'-'),'|',ISNULL(CAST(id_aeronaves AS varchar(20)),'-')) FROM vuelos WHERE id_vuelos=${id}`);
const airportsOf = (id) => one(`SELECT CONCAT(ISNULL(CAST(id_aeropuerto_origen AS varchar(20)),'-'),':',ISNULL(estado_aeropuerto_origen,'-'),'|',ISNULL(CAST(id_aeropuerto_destino AS varchar(20)),'-'),':',ISNULL(estado_aeropuerto_destino,'-')) FROM vuelos WHERE id_vuelos=${id}`);
const audit = (flightId, type, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flightId} AND tipo_entidad=N'${type}' AND operacion=N'${op}'`);
const notif = (type, user, flightId) => count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'${type}' AND id_usuarios=${user.id} AND id_vuelos=${flightId}`);
const provinceOfCommander = (user) => one(`SELECT ISNULL(CAST(c.id_provincias AS varchar(20)),'NULL') FROM perfiles_comandante c JOIN usuarios u ON u.id_personas=c.id_personas WHERE u.id_usuarios=${user.id}`);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'));
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 65, 'la base E2E debe estar en V65 o posterior');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adminId = (await ok('/auth/me', { token: admin })).id;

  // ---------- Catálogo real: Tucumán / Córdoba / Salta / CABA / Buenos Aires ----------
  const provinces = await ok('/catalogs/provinces', { token: admin });
  const prov = (name) => { const p = provinces.find((x) => x.nombre === name); assert.ok(p, 'falta la provincia ' + name); return p; };
  const tuc = prov('Tucumán'), cba = prov('Córdoba'), sal = prov('Salta'), caba = prov('Ciudad Autónoma de Buenos Aires'), pba = prov('Buenos Aires');
  assert.equal(provinces.filter((p) => p.activo !== false).length >= 24, true, 'las 23 provincias y CABA'); assert.notEqual(caba.id, pba.id);
  const airportsOfProvince = (p) => ok('/catalogs/airports?provinceId=' + p.id, { token: admin });
  const aTuc = await airportsOfProvince(tuc), aCba = await airportsOfProvince(cba), aSal = await airportsOfProvince(sal), aCaba = await airportsOfProvince(caba), aPba = await airportsOfProvince(pba);
  const matienzo = aTuc.find((a) => /MATIENZO/i.test(a.nombre)); assert.ok(matienzo, 'Aeropuerto Teniente Benjamín Matienzo'); const otherTuc = aTuc.find((a) => a.id !== matienzo.id);
  const taravella = aCba.find((a) => /TARAVELLA/i.test(a.nombre)) || aCba[0], saltaAirport = aSal[0], aeroparque = aCaba[0], ezeiza = aPba.find((a) => /PISTARINI/i.test(a.nombre)) || aPba[0];
  assert.ok(otherTuc && taravella && saltaAirport && aeroparque && ezeiza);
  const loc = async (p, q) => { const rows = await ok(`/catalogs/localities?provinceId=${p.id}&q=${encodeURIComponent(q)}`, { token: admin }); assert.ok(rows.length, 'sin localidades ' + q); return rows[0]; };
  const yerbaBuena = await loc(tuc, 'Yerba Buena'), carlosPaz = await loc(cba, 'Villa Carlos Paz'), laPlata = await loc(pba, 'La Plata'), laPlataB = await loc(pba, 'Quilmes'), cabaLoc = await loc(caba, '');
  assert.equal(count(`SELECT COUNT(*) FROM aeropuertos WHERE id_localidades IN (${yerbaBuena.id}) OR (ciudad LIKE N'%Yerba Buena%')`), 0, 'no existe un aeropuerto en Yerba Buena: no hace falta');

  const co = await createUser(admin, 'CENTRO_OPERACIONES', 'jco'), ops = await createUser(admin, 'OPERACIONES', 'jop'), dts = await createUser(admin, 'DTS', 'jdts');
  const cmd = {}; for (const n of ['T1', 'T2', 'C', 'K', 'S', 'B', 'CA', 'U']) { cmd[n] = await createUser(admin, 'COMANDANTE', 'jc' + n); await provision(admin, cmd[n]); }
  let plateSeq = 0; const newPlane = async (airport) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'J' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airport.id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const locate = (user, p, token = admin, expect = [200]) => call(`/commanders/${user.id}/location`, { method: 'PUT', token, body: { provinciaId: p ? p.id : null, motivo: 'E2E ' + MARK }, expect });
  const request = async (originLocality, destinationLocality, slot, token = dts.token) => {
    const patient = await ok('/patients', { method: 'POST', token, body: { nombre: 'Jurisdiccion', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
    const f = await ok('/flights', { method: 'POST', token, body: { patientId: patient.id, localidadOrigenId: originLocality.id, localidadDestinoId: destinationLocality.id, priorityCode: priority, motivoVuelo: 'Jurisdicción ' + MARK, fechaSolicitada: fmt(slot), extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
    return f.id;
  };
  const approved = async (o, d, slot = nextSlot()) => { const id = await request(o, d, slot); await ok(`/flights/${id}/schedule/accept`, { method: 'POST', token: co.token }); return id; };
  const candidates = (id, token = co.token, extra = '') => ok(`/flights/${id}/commander-candidates?q=${encodeURIComponent(MARK)}${extra}`, { token });
  const airportsPut = (id, body, token = co.token, expect = [200]) => call(`/flights/${id}/airports`, { method: 'PUT', token, body, expect });
  const putCommander = (id, c, extra = {}, token = co.token, expect = [200]) => call(`/flights/${id}/commander`, { method: 'PUT', token, body: { comandanteId: c.id, ...extra }, expect });
  const putAircraft = (id, plane, token = co.token, expect = [200]) => call(`/flights/${id}/assigned-aircraft`, { method: 'PUT', token, body: { aircraftId: plane.id }, expect });
  const names = (list) => list.map((x) => x.username);
  pass('fixtures: catálogo real (Tucumán, Córdoba, Salta, CABA y Buenos Aires como jurisdicciones distintas), CO, OPERACIONES, DTS y 8 comandantes habilitados');

  // ---------- A: ubicación operativa sólo por provincia ----------
  await locate(cmd.T1, tuc); await locate(cmd.T2, tuc); await locate(cmd.K, cba); await locate(cmd.S, sal); await locate(cmd.B, pba); await locate(cmd.CA, caba); await locate(cmd.C, cba);
  assert.equal(provinceOfCommander(cmd.C), String(cba.id));
  const moved = await locate(cmd.C, tuc);
  assert.equal(moved.data.estadoUbicacion, 'CONOCIDA'); assert.equal(moved.data.provincia, tuc.nombre); assert.equal(moved.data.localidadId, undefined); assert.equal(moved.data.localidad, undefined);
  assert.equal(provinceOfCommander(cmd.C), String(tuc.id), 'el cambio de Córdoba a Tucumán quedó persistido');
  const person = one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${cmd.C.id}`);
  assert.equal(count(`SELECT COUNT(*) FROM perfiles_comandante WHERE id_personas=${person} AND id_usuario_ubicacion=${adminId} AND fecha_ubicacion_actual IS NOT NULL`), 1);
  const lastAudit = sql(`SELECT TOP 1 CONCAT(valores_anteriores,' => ',valores_nuevos) FROM eventos_auditoria WHERE tipo_entidad=N'COMMANDER_PROFILE' AND operacion=N'COMMANDER_LOCATION_UPDATE' AND entidad_id=${person} ORDER BY id_eventos_auditoria DESC`);
  assert.match(lastAudit, /Córdoba/); assert.match(lastAudit, /Tucumán/); assert.doesNotMatch(lastAudit, /localidad/i);
  const reread = await ok(`/commanders/${cmd.C.id}/location`, { token: co.token }); assert.equal(reread.provincia, tuc.nombre); assert.equal(reread.estadoUbicacion, 'CONOCIDA');
  const listed = (await ok(`/commanders/locations?q=${MARK}`, { token: co.token })).comandantes.find((x) => x.username === cmd.C.name); assert.equal(listed.provincia, tuc.nombre); assert.equal(listed.localidad, undefined);
  await call(`/commanders/${cmd.C.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: tuc.id, localidadId: yerbaBuena.id }, expect: [400] });
  await call(`/commanders/${cmd.C.id}/location`, { method: 'PUT', token: cmd.C.token, body: { provinciaId: cba.id }, expect: [403] });
  assert.equal(provinceOfCommander(cmd.C), String(tuc.id));
  assert.equal(provinceOfCommander(cmd.CA) !== provinceOfCommander(cmd.B), true, 'CABA y Buenos Aires son jurisdicciones distintas en el perfil');
  pass('escenario A: el Administrador cambia al comandante de Córdoba a Tucumán; persiste con responsable y fecha, queda auditado, no pide ni guarda localidad y el comandante no puede cambiarla');

  // ---------- E / F: las localidades del paciente se conservan; no hace falta un aeropuerto en ellas ----------
  const W1 = await request(yerbaBuena, carlosPaz, nextSlot());
  let detail = await ok(`/flights/${W1}`, { token: co.token });
  assert.equal(detail.vuelo.datosSanitarios.localidadOrigenSolicitada.nombre, yerbaBuena.nombre); assert.equal(detail.vuelo.datosSanitarios.localidadOrigenSolicitada.provincia, tuc.nombre);
  assert.equal(detail.vuelo.datosSanitarios.localidadDestinoSolicitada.nombre, carlosPaz.nombre); assert.equal(detail.vuelo.datosSanitarios.localidadDestinoSolicitada.provincia, cba.nombre);
  assert.equal(airportsOf(W1), '-:-|-:-', 'la solicitud de DTS no define ningún aeropuerto');
  await call(`/flights/${W1}/airports`, { method: 'PUT', token: co.token, body: { origenId: matienzo.id }, expect: [400] });                     // negociación pendiente: todavía no hay horario acordado
  await call(`/flights/${W1}/airport-candidates?tipo=SALIDA`, { token: co.token, expect: [400, 409] });
  await ok(`/flights/${W1}/schedule/accept`, { method: 'POST', token: co.token });
  pass('escenarios E y F: DTS conserva Yerba Buena (Tucumán) y Villa Carlos Paz (Córdoba); no existe aeropuerto en esas localidades y la solicitud no define ninguno; con la negociación pendiente no se gestionan aeropuertos');

  // ---------- B / C: elegibilidad preliminar con la provincia del paciente ----------
  let list = await candidates(W1);
  assert.equal(list.salida.preliminar, true); assert.equal(list.salida.fuente, 'PROVINCIA_DEL_PACIENTE'); assert.equal(list.salida.provincia, tuc.nombre); assert.equal(list.salida.aeropuertoId, null); assert.match(list.advertencia, /preliminares/);
  assert.ok(names(list.ordinarios).includes(cmd.T1.name) && names(list.ordinarios).includes(cmd.C.name), 'los comandantes de Tucumán (incluido el que estaba en Córdoba) son preliminarmente elegibles');
  assert.ok(!names(list.ordinarios).includes(cmd.K.name) && !names(list.ordinarios).includes(cmd.S.name));
  assert.equal(list.excepcionales.find((x) => x.username === cmd.K.name).codigoUbicacion, 'OTRA_PROVINCIA');
  assert.equal(list.excepcionales.find((x) => x.username === cmd.K.name).elegibilidad, 'EXCEPCION');
  const refused = await putCommander(W1, cmd.K, {}, co.token, [409]);
  assert.equal(refused.data.code, 'COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION'); assert.equal(refused.data.tipo, 'OTRA_PROVINCIA'); assert.equal(resourcesOf(W1), '-|-');
  const byOps = await putCommander(W1, cmd.K, { excepcionGeografica: { motivo: 'OPERACIONES no autoriza excepciones geográficas' } }, ops.token, [403]); assert.equal(byOps.data.code, 'GEOGRAPHIC_EXCEPTION_NOT_AUTHORIZED');
  assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${W1}`), 0);
  pass('escenarios B y C: sin aeropuerto elegido los candidatos son preliminares y salen de la provincia del paciente; el comandante de Córdoba no se asigna ordinariamente (409) y OPERACIONES no puede autorizar la excepción (403)');

  // ---------- Aeropuertos candidatos: distancia aproximada, no tiempos inventados ----------
  const dep = await ok(`/flights/${W1}/airport-candidates?tipo=SALIDA`, { token: co.token });
  assert.equal(dep.localidadPaciente.nombre, yerbaBuena.nombre); assert.equal(dep.coordenadasPaciente, true); assert.match(dep.aviso, /no equivale a distancia ni a tiempo de traslado por tierra/);
  const depMatienzo = dep.enProvinciaDelPaciente.find((a) => a.id === matienzo.id); assert.ok(depMatienzo, 'Matienzo es candidato de salida para un paciente de Yerba Buena');
  assert.ok(depMatienzo.distanciaRectaKm > 0 && depMatienzo.distanciaRectaKm < 40, 'Yerba Buena está a pocos km en línea recta del aeropuerto de Tucumán');
  assert.ok(dep.enProvinciaDelPaciente.every((a) => a.provinciaId === tuc.id && a.mismaProvinciaQueElPaciente) && dep.enProvinciaDelPaciente.every((a, i, arr) => i === 0 || (arr[i - 1].distanciaRectaKm ?? 1e9) <= (a.distanciaRectaKm ?? 1e9)), 'ordenados por cercanía dentro de la provincia');
  assert.ok(dep.enOtrasJurisdicciones.every((a) => a.provinciaId !== tuc.id && !a.mismaProvinciaQueElPaciente), 'otras jurisdicciones sólo como alternativa con justificación');
  const arr = await ok(`/flights/${W1}/airport-candidates?tipo=LLEGADA`, { token: co.token });
  assert.equal(arr.localidadPaciente.nombre, carlosPaz.nombre); assert.ok(arr.enProvinciaDelPaciente.length > 0 && arr.enProvinciaDelPaciente.every((a) => a.provinciaId === cba.id));
  const search = await ok(`/flights/${W1}/airport-candidates?tipo=SALIDA&q=${encodeURIComponent('aeroparque')}`, { token: co.token }); assert.ok(search.enOtrasJurisdicciones.some((a) => a.id === aeroparque.id), 'la búsqueda alcanza aeropuertos de otra jurisdicción');
  await call(`/flights/${W1}/airport-candidates?tipo=OTRO`, { token: co.token, expect: [400] });
  for (const [who, token] of [['DTS', dts.token], ['ADMINISTRADOR', admin], ['comandante no asignado', cmd.T1.token]]) await call(`/flights/${W1}/airport-candidates?tipo=SALIDA`, { token, expect: [403] });
  pass('selección asistida: Matienzo es candidato de salida (distancia en línea recta aproximada, ordenados por cercanía, sin tiempos de traslado inventados), los de Córdoba para la llegada y las otras jurisdicciones sólo como alternativa; DTS, administrador y un comandante no asignado no los consultan');

  // ---------- CO propone aeropuertos distintos de las localidades del paciente ----------
  const proposal = await airportsPut(W1, { origenId: matienzo.id, destinoId: taravella.id });
  assert.equal(airportsOf(W1), `${matienzo.id}:PROPUESTO|${taravella.id}:PROPUESTO`);
  assert.equal(one(`SELECT CONCAT(id_localidad_origen,'|',id_localidad_destino) FROM vuelos_sanitarios WHERE id_vuelos=${W1}`), `${yerbaBuena.id}|${carlosPaz.id}`, 'las localidades del paciente no se sobrescriben con las de los aeropuertos');
  assert.equal(stateOf(W1), 'NULL'); assert.equal(audit(W1, 'FLIGHT', 'SET_AIRPORTS'), 1);
  assert.equal(one(`SELECT CONCAT(id_usuario_aeropuertos,'|',CASE WHEN fecha_aeropuertos IS NULL THEN 'sin fecha' ELSE 'con fecha' END) FROM vuelos WHERE id_vuelos=${W1}`), `${co.id}|con fecha`);
  detail = await ok(`/flights/${W1}`, { token: co.token });
  assert.equal(detail.aeropuertos.salida.estado, 'PROPUESTO'); assert.equal(detail.aeropuertos.salida.provincia, tuc.nombre); assert.equal(detail.aeropuertos.llegada.estado, 'PROPUESTO'); assert.equal(detail.aeropuertos.llegada.provincia, cba.nombre);
  assert.ok(detail.aeropuertos.pendientes.some((x) => /propuesto: falta la confirmación del comandante/.test(x)));
  assert.equal(detail.vuelo.datosSanitarios.localidadOrigenSolicitada.nombre, yerbaBuena.nombre); assert.equal(detail.vuelo.datosSanitarios.localidadDestinoSolicitada.nombre, carlosPaz.nombre);
  list = await candidates(W1); assert.equal(list.salida.fuente, 'AEROPUERTO_PROPUESTO'); assert.equal(list.salida.preliminar, true); assert.equal(list.salida.aeropuertoId, matienzo.id);
  await airportsPut(W1, { origenId: matienzo.id }, co.token, [400]);                                      // sin cambios
  await airportsPut(W1, { origenId: matienzo.id, destinoId: matienzo.id }, co.token, [400]);              // mismo aeropuerto
  await airportsPut(W1, {}, co.token, [400]);
  const outsideNoReason = await airportsPut(W1, { origenId: aeroparque.id }, co.token, [400]); assert.equal(outsideNoReason.data.code, 'AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED');
  for (const [who, token] of [['DTS', dts.token], ['COMANDANTE', cmd.T1.token], ['ADMINISTRADOR', admin]]) await airportsPut(W1, { origenId: otherTuc.id }, token, [403]);
  assert.equal(airportsOf(W1), `${matienzo.id}:PROPUESTO|${taravella.id}:PROPUESTO`);
  pass('CO propone Matienzo (salida) y un aeropuerto de Córdoba (llegada): quedan PROPUESTOS con responsable y fecha, la solicitud de DTS no cambia, los candidatos pasan a calcularse con la provincia del aeropuerto propuesto (aún preliminares) y las propuestas inválidas o de roles sin permiso se rechazan sin persistir');

  // ---------- Asignación de comandante y aeronave (aeronave en el aeropuerto de salida) ----------
  const pT = await newPlane(matienzo), pOther = await newPlane(otherTuc);
  const planes = await ok(`/flights/${W1}/aircraft-candidates`, { token: co.token });
  assert.ok(planes.some((p) => p.id === pT.id), 'la aeronave del aeropuerto de salida es candidata'); assert.ok(!planes.some((p) => p.id === pOther.id), 'una aeronave de otro aeropuerto no se ofrece cuando ya hay aeropuerto de salida');
  const wrongPlane = await putAircraft(W1, pOther, co.token, [400]); assert.match(wrongPlane.data.error, /aeropuerto de salida/);
  const reserved = await putCommander(W1, cmd.T1); assert.equal(reserved.data.estadoVuelo, null);
  assert.match(sql(`SELECT valores_nuevos FROM eventos_auditoria WHERE id_vuelos=${W1} AND operacion=N'ASSIGN_FLIGHT_COMMANDER'`), /"salidaPreliminar":true/);
  const planned = await putAircraft(W1, pT); assert.equal(planned.data.estadoVuelo, 'PLANIFICADO'); assert.equal(resourcesOf(W1), `${cmd.T1.id}|${pT.id}`);
  assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${W1}`), 0); assert.equal(notif('COMMANDER_ASSIGNED', cmd.T1, W1), 1);
  detail = await ok(`/flights/${W1}`, { token: co.token }); assert.equal(detail.aeropuertos.elegibilidadPreliminar, true); assert.equal(detail.recursos.commanderProvinciaActual, tuc.nombre);
  pass('escenario B: comandante de Tucumán + aeropuerto de salida de Tucumán + aeronave en ese aeropuerto → PLANIFICADO; la asignación se audita como basada en un aeropuerto todavía preliminar');

  // ---------- El comandante revisa y confirma (planificación existente) ----------
  const mine = await ok(`/flights/${W1}`, { token: cmd.T1.token }); assert.equal(mine.aeropuertos.salida.estado, 'PROPUESTO'); assert.equal(mine.aeropuertos.salida.aeropuertoId, matienzo.id);
  const commanderView = await ok(`/flights/${W1}/airport-candidates?tipo=SALIDA`, { token: cmd.T1.token }); assert.ok(commanderView.enProvinciaDelPaciente.find((a) => a.id === matienzo.id).seleccionActual);
  const salida = new Date(mine.vuelo.salida), llegada = fmt(new Date(salida.getTime() + 3 * 3600000));
  const selfException = await call(`/flights/${W1}/operational-planning`, { method: 'POST', token: cmd.T1.token, body: { origenId: saltaAirport.id, destinoId: taravella.id, llegada, justificacion: 'Mejor conexión terrestre y clima' }, expect: [409] });
  assert.equal(selfException.data.code, 'COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION'); assert.match(selfException.data.error, /volver a verificar la elegibilidad del comandante/);
  const noReason = await call(`/flights/${W1}/operational-planning`, { method: 'POST', token: cmd.T1.token, body: { origenId: saltaAirport.id, destinoId: taravella.id, llegada }, expect: [400] }); assert.equal(noReason.data.code, 'AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED');
  assert.equal(airportsOf(W1), `${matienzo.id}:PROPUESTO|${taravella.id}:PROPUESTO`, 'el comandante no puede fijarse una salida fuera de su jurisdicción');
  await call(`/flights/${W1}/operational-planning`, { method: 'POST', token: cmd.T1.token, body: { origenId: matienzo.id, destinoId: taravella.id, llegada }, expect: [200] });
  assert.equal(airportsOf(W1), `${matienzo.id}:CONFIRMADO|${taravella.id}:CONFIRMADO`); assert.equal(audit(W1, 'FLIGHT', 'OPERATIONAL_PLANNING'), 1);
  assert.equal(count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'AIRPORTS_CHANGED_BY_COMMANDER' AND id_vuelos=${W1}`), 0, 'confirmar tal cual lo propuesto no genera aviso de cambio');
  list = await candidates(W1); assert.equal(list.salida.fuente, 'AEROPUERTO_CONFIRMADO'); assert.equal(list.salida.preliminar, false); assert.equal(list.advertencia, null);
  detail = await ok(`/flights/${W1}`, { token: co.token }); assert.equal(detail.aeropuertos.elegibilidadPreliminar, false); assert.equal(detail.aeropuertos.salida.estado, 'CONFIRMADO'); assert.deepEqual(detail.aeropuertos.pendientes, []);
  pass('el comandante revisa los aeropuertos propuestos y los confirma; no puede fijarse una salida fuera de su jurisdicción ni autorizarse una excepción, y la elegibilidad deja de ser preliminar');

  // ---------- G: cambio posterior de aeropuerto con ruta aprobada ----------
  const route = await approveRoute(W1, cmd.T1.token, co.token); assert.equal(route.estado, 'APROBADA');
  await airportsPut(W1, { origenId: otherTuc.id });
  assert.equal(airportsOf(W1), `${otherTuc.id}:PROPUESTO|${taravella.id}:CONFIRMADO`); assert.equal(resourcesOf(W1), `${cmd.T1.id}|${pT.id}`, 'cambiar de aeropuerto dentro de la provincia no desasigna a nadie');
  assert.equal(one(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${W1} AND es_version_actual=1`), 'REQUIERE_REVISION');
  assert.equal(notif('AIRPORTS_PROPOSED', cmd.T1, W1), 1);
  const blockedStart = await call(`/flights/${W1}/start`, { method: 'POST', token: co.token, expect: [409] }); assert.match(blockedStart.data.code, /AEROPUERTOS_SIN_CONFIRMAR|RUTA_/);
  assert.equal(stateOf(W1), 'PLANIFICADO');
  detail = await ok(`/flights/${W1}`, { token: co.token }); assert.ok(detail.aeropuertos.pendientes.some((x) => /aeronave asignada está en/.test(x)), 'avisa que la aeronave no está en el nuevo aeropuerto de salida');
  await airportsPut(W1, { origenId: matienzo.id });
  await call(`/flights/${W1}/operational-planning`, { method: 'POST', token: cmd.T1.token, body: { origenId: matienzo.id, destinoId: taravella.id, llegada }, expect: [200] });
  await approveRoute(W1, cmd.T1.token, co.token);
  const started = await ok(`/flights/${W1}/start`, { method: 'POST', token: co.token }); assert.equal(started.estadoVuelo, 'EN_CURSO');
  pass('escenario G (misma jurisdicción): el cambio de aeropuerto vuelve a PROPUESTO, avisa al comandante, la ruta aprobada pasa a REQUIERE_REVISION y el vuelo no inicia hasta confirmar aeropuertos y aprobar la ruta');
  const finished = await ok(`/flights/${W1}/finish`, { method: 'POST', token: co.token }); assert.equal(finished.estadoVuelo, 'FINALIZADO');
  assert.equal(provinceOfCommander(cmd.T1), String(cba.id), 'al aterrizar el comandante queda en la provincia del aeropuerto de llegada');
  assert.equal(count(`SELECT COUNT(*) FROM perfiles_comandante c JOIN usuarios u ON u.id_personas=c.id_personas WHERE u.id_usuarios=${cmd.T1.id} AND c.id_usuario_ubicacion=${co.id} AND c.fecha_ubicacion_actual IS NOT NULL`), 1);
  assert.equal(airportsOf(W1), `${matienzo.id}:CONFIRMADO|${taravella.id}:CONFIRMADO`);
  pass('escenario I (flujo completo): DTS → horario acordado → candidatos → aeropuertos propuestos → comandante y aeronave → planificación del comandante → ruta aprobada → inicio → fin; todo persiste en SQL Server y el comandante queda en la jurisdicción de llegada con responsable y fecha');

  // ---------- G: cambio de aeropuerto a otra provincia con comandante asignado ----------
  const W2 = await approved(yerbaBuena, carlosPaz);
  await airportsPut(W2, { origenId: matienzo.id });
  const pT2 = await newPlane(matienzo); await putCommander(W2, cmd.T2); await putAircraft(W2, pT2);
  assert.equal(stateOf(W2), 'PLANIFICADO');
  const blockedChange = await airportsPut(W2, { origenId: saltaAirport.id, justificacion: 'Mejor conexión terrestre y clima en Salta' }, co.token, [409]);
  assert.equal(blockedChange.data.code, 'AIRPORT_CHANGE_REQUIRES_COMMANDER_REVALIDATION'); assert.match(blockedChange.data.error, /volver a verificar la elegibilidad del comandante/);
  assert.equal(airportsOf(W2), `${matienzo.id}:PROPUESTO|-:-`); assert.equal(resourcesOf(W2), `${cmd.T2.id}|${pT2.id}`); assert.equal(audit(W2, 'FLIGHT', 'SET_AIRPORTS'), 1);
  const wrongReplacement = await airportsPut(W2, { origenId: saltaAirport.id, justificacion: 'Mejor conexión terrestre y clima en Salta', nuevoComandanteId: cmd.B.id }, co.token, [409]); assert.equal(wrongReplacement.data.code, 'COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION');
  assert.equal(airportsOf(W2), `${matienzo.id}:PROPUESTO|-:-`); assert.equal(resourcesOf(W2), `${cmd.T2.id}|${pT2.id}`);
  const opsException = await airportsPut(W2, { origenId: saltaAirport.id, justificacion: 'Mejor conexión terrestre y clima en Salta', excepcionGeografica: { motivo: 'OPERACIONES no autoriza excepciones' } }, ops.token, [403]); assert.equal(opsException.data.code, 'GEOGRAPHIC_EXCEPTION_NOT_AUTHORIZED');
  assert.equal(airportsOf(W2), `${matienzo.id}:PROPUESTO|-:-`); assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${W2}`), 0);
  const swapped = await airportsPut(W2, { origenId: saltaAirport.id, justificacion: 'Mejor conexión terrestre y clima en Salta', nuevoComandanteId: cmd.S.id });
  assert.equal(airportsOf(W2), `${saltaAirport.id}:PROPUESTO|-:-`); assert.equal(resourcesOf(W2), `${cmd.S.id}|${pT2.id}`); assert.equal(stateOf(W2), 'PLANIFICADO');
  assert.equal(notif('COMMANDER_UNASSIGNED', cmd.T2, W2), 1); assert.equal(notif('COMMANDER_ASSIGNED', cmd.S, W2), 1);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${W2} AND id_usuarios=${cmd.S.id} AND fecha_baja IS NULL`), 1); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${W2} AND id_usuarios=${cmd.T2.id} AND fecha_baja IS NULL`), 0);
  detail = await ok(`/flights/${W2}`, { token: co.token }); assert.ok(detail.aeropuertos.pendientes.some((x) => /aeronave asignada está en/.test(x)), 'avisa que la aeronave sigue en Tucumán');
  const pSal = await newPlane(saltaAirport);
  const swapPlane = await ok(`/flights/${W2}/aircraft`, { method: 'POST', token: co.token, body: { aircraftId: pSal.id, motivo: 'Aeronave en el aeropuerto de salida' } }); assert.equal(swapPlane.estadoVuelo, 'PLANIFICADO');
  detail = await ok(`/flights/${W2}`, { token: co.token }); assert.deepEqual(detail.aeropuertos.pendientes.filter((x) => /aeronave asignada|jurisdicción diferente/.test(x)), []);
  pass('escenario G (otra provincia): cambiar la salida a Salta con un comandante de Tucumán se rechaza (409) sin tocar nada; un reemplazo de la jurisdicción equivocada o una excepción de OPERACIONES también; con un comandante de Salta el cambio se aplica atómicamente, se avisa al desasignado y al nuevo, y recién entonces se cambia la aeronave al nuevo aeropuerto');

  const W3 = await approved(yerbaBuena, carlosPaz);
  await airportsPut(W3, { origenId: matienzo.id }); const pT3 = await newPlane(matienzo); await putCommander(W3, cmd.K, { excepcionGeografica: { motivo: 'Único comandante habilitado disponible ' + MARK } }); await putAircraft(W3, pT3);
  const exceptionRow = sql(`SELECT CONCAT(tipo_excepcion,'|',id_provincia_salida,'|',id_provincia_comandante,'|',id_usuario_autoriza,'|',CASE WHEN fecha_reemplazo IS NULL THEN 'vigente' ELSE 'cerrada' END) FROM excepciones_geograficas_comandante WHERE id_vuelos=${W3}`);
  assert.equal(exceptionRow, `OTRA_PROVINCIA|${tuc.id}|${cba.id}|${co.id}|vigente`);
  await airportsPut(W3, { origenId: otherTuc.id });                                                       // misma provincia: la excepción sigue cubriendo al comandante
  assert.equal(resourcesOf(W3), `${cmd.K.id}|${pT3.id}`); assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${W3} AND fecha_reemplazo IS NULL`), 1);
  const exceptionMove = await airportsPut(W3, { origenId: saltaAirport.id, justificacion: 'Mejor conexión terrestre y clima en Salta' }, co.token, [409]); assert.equal(exceptionMove.data.code, 'AIRPORT_CHANGE_REQUIRES_COMMANDER_REVALIDATION');
  await airportsPut(W3, { origenId: saltaAirport.id, justificacion: 'Mejor conexión terrestre y clima en Salta', excepcionGeografica: { motivo: 'Mantener al comandante de Córdoba para la salida desde Salta' } });
  assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${W3} AND fecha_reemplazo IS NULL AND id_provincia_salida=${sal.id}`), 1); assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${W3} AND fecha_reemplazo IS NOT NULL AND id_provincia_salida=${tuc.id}`), 1, 'la excepción para Tucumán se cerró y queda como historial');
  assert.equal(audit(W3, 'COMMANDER_GEOGRAPHIC_EXCEPTION', 'CREATE'), 2);
  pass('excepciones adaptadas a la provincia: valen sólo para la jurisdicción de salida autorizada; mover la salida dentro de esa provincia las conserva y cambiarla a otra exige una nueva excepción justificada y autorizada por CO (la anterior queda cerrada como historial)');

  // ---------- D: CABA frente a la provincia de Buenos Aires ----------
  const W4 = await approved(laPlata, cabaLoc);
  await airportsPut(W4, { origenId: aeroparque.id, justificacion: 'Aeroparque tiene la mejor conexión terrestre para el traslado' });
  list = await candidates(W4); assert.equal(list.salida.provinciaId, caba.id); assert.ok(names(list.ordinarios).includes(cmd.CA.name) && !names(list.ordinarios).includes(cmd.B.name), 'con salida en CABA sólo el comandante de CABA es ordinario');
  assert.equal(list.excepcionales.find((x) => x.username === cmd.B.name).codigoUbicacion, 'OTRA_PROVINCIA');
  await putCommander(W4, cmd.B, {}, co.token, [409]);
  await airportsPut(W4, { origenId: ezeiza.id });                                                          // aeropuerto de la provincia de Buenos Aires: no requiere justificación (el paciente está en esa provincia)
  list = await candidates(W4); assert.equal(list.salida.provinciaId, pba.id); assert.ok(names(list.ordinarios).includes(cmd.B.name) && !names(list.ordinarios).includes(cmd.CA.name), 'con salida en la provincia de Buenos Aires sólo el comandante de esa provincia es ordinario');
  await putCommander(W4, cmd.CA, {}, co.token, [409]);
  const reservedBsAs = await putCommander(W4, cmd.B); assert.equal(reservedBsAs.data.estadoVuelo, null);
  pass('escenario D: CABA y la Provincia de Buenos Aires son jurisdicciones distintas en los candidatos y en la validación de la asignación (en ambos sentidos)');

  // ---------- H: aeropuerto sin provincia conocida ----------
  const W5 = await approved(yerbaBuena, carlosPaz);
  const fixture = ('Aeropuerto sin jurisdicción ' + MARK).slice(0, 140);
  sql(`INSERT INTO aeropuertos(nombre_aeropuerto,pais,esta_activo,ciudad) VALUES (N'${fixture}',N'Argentina',1,N'Sin provincia')`);
  const orphanId = Number(one(`SELECT id_aeropuertos FROM aeropuertos WHERE nombre_aeropuerto=N'${fixture}'`));
  assert.equal(one(`SELECT ISNULL(CAST(id_provincias AS varchar(20)),'NULL') FROM aeropuertos WHERE id_aeropuertos=${orphanId}`), 'NULL');
  const search2 = await ok(`/flights/${W5}/airport-candidates?tipo=SALIDA&q=${encodeURIComponent('sin jurisdicción')}`, { token: co.token });
  assert.ok(![...search2.enProvinciaDelPaciente, ...search2.enOtrasJurisdicciones].some((a) => a.id === orphanId), 'un aeropuerto sin provincia nunca se ofrece');
  const unknown = await airportsPut(W5, { origenId: orphanId, justificacion: 'Prueba de aeropuerto sin jurisdicción' }, co.token, [409]); assert.equal(unknown.data.code, 'AIRPORT_PROVINCE_UNKNOWN'); assert.match(unknown.data.error, /No se pudo determinar la provincia del aeropuerto/);
  assert.equal(airportsOf(W5), '-:-|-:-');
  await call(`/flights/${W5}/aircraft-candidates`, { token: co.token, expect: [200] });
  sql(`UPDATE aeropuertos SET id_provincias=${tuc.id}, esta_activo=1 WHERE id_aeropuertos=${orphanId}`);
  await airportsPut(W5, { origenId: orphanId }); assert.equal(airportsOf(W5), `${orphanId}:PROPUESTO|-:-`);
  sql(`UPDATE aeropuertos SET id_provincias=NULL WHERE id_aeropuertos=${orphanId}`);
  const blockedList = await call(`/flights/${W5}/commander-candidates`, { token: co.token, expect: [409] }); assert.equal(blockedList.data.code, 'AIRPORT_PROVINCE_UNKNOWN');
  const blockedAssign = await putCommander(W5, cmd.T1, {}, co.token, [409]); assert.equal(blockedAssign.data.code, 'AIRPORT_PROVINCE_UNKNOWN'); assert.equal(resourcesOf(W5), '-|-');
  detail = await ok(`/flights/${W5}`, { token: co.token }); assert.ok(detail.aeropuertos.pendientes.some((x) => /No se pudo determinar la provincia del aeropuerto de salida/.test(x)));
  sql(`UPDATE aeropuertos SET id_provincias=${tuc.id}, esta_activo=0 WHERE id_aeropuertos=${orphanId}`);
  pass('escenario H: un aeropuerto sin provincia no se ofrece ni se puede proponer (409 AIRPORT_PROVINCE_UNKNOWN); si pierde su provincia después, ni los candidatos ni la asignación de comandante avanzan y la ficha informa el problema (el aeropuerto de prueba queda inactivo)');

  // ---------- Regresiones: vuelos operativos y estados ----------
  const opPlane = await newPlane(matienzo), opSlot = nextSlot(); await locate(cmd.T2, tuc);
  const opFlight = await ok('/flights/operational', { method: 'POST', token: co.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Operativo ' + MARK, aircraftId: opPlane.id, comandanteId: cmd.T2.id, destinoId: otherTuc.id, salida: fmt(opSlot), llegada: fmt(new Date(opSlot.getTime() + 3600000 * 2)) } });
  assert.equal(one(`SELECT CONCAT(estado_aeropuerto_origen,'|',estado_aeropuerto_destino) FROM vuelos WHERE id_vuelos=${opFlight.id}`), 'CONFIRMADO|CONFIRMADO', 'un vuelo operativo no tiene propuestas: sus aeropuertos son definitivos');
  await airportsPut(opFlight.id, { origenId: matienzo.id }, co.token, [400]);                              // sólo aplica a solicitudes sanitarias
  const pendingRequest = await request(yerbaBuena, carlosPaz, nextSlot());
  await airportsPut(pendingRequest, { origenId: matienzo.id }, co.token, [400]);
  const docs = await call(`/flights/${pendingRequest}/documents`, { token: co.token, expect: [409] }); assert.equal(docs.data.code, 'DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED', 'los documentos siguen bloqueados hasta el acuerdo horario');
  pass('regresiones: los vuelos operativos conservan aeropuertos definitivos y no admiten propuestas sanitarias; con la negociación pendiente no se gestionan aeropuertos y los documentos siguen bloqueados');

  console.log(`\nE2E de jurisdicción y aeropuertos: ${passed} bloques correctos.`);
})().catch((e) => { console.error('FALLO:', e.stack || e.message); process.exit(1); });
