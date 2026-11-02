/* E2E de la asignación de comandante y aeronave de una solicitud sanitaria (V63/V64) sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e):
 * ubicación operativa del comandante (sólo provincia o CABA), elegibilidad por jurisdicción del aeropuerto de salida (preliminar con la provincia del paciente), excepciones geográficas, reserva y asignación definitiva de comandante y aeronave,
 * conflictos y concurrencia reales contra SQL Server, atomicidad ante un fallo de persistencia, autorización por HTTP directo y continuidad del flujo.
 * Sólo crea registros marcados; el único objeto temporal (un trigger de prueba que fuerza un fallo de auditoría) lo crea y elimina este script.
 * Uso: node scripts/e2e-asignacion-recursos.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, PASSWORD, sleep, sql, one, count, call, ok, fmt, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const DAY = 86400000;
let dayCursor = 900 + Math.floor(Math.random() * 1500);
const nextSlot = () => { const d = new Date(Date.now() + (dayCursor += 4) * DAY); d.setHours(10, 0, 0, 0); return d; };
const civil = (d) => fmt(d);

const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const resourcesOf = (id) => one(`SELECT CONCAT(ISNULL(CAST(id_usuario_comandante AS varchar(20)),'-'),'|',ISNULL(CAST(id_aeronaves AS varchar(20)),'-')) FROM vuelos WHERE id_vuelos=${id}`);
const audit = (flightId, type, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flightId} AND tipo_entidad=N'${type}' AND operacion=N'${op}'`);
const notif = (type, user, flightId) => count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'${type}' AND id_usuarios=${user.id} AND id_vuelos=${flightId}`);
const crewRows = (flightId, user) => count(`SELECT COUNT(*) FROM vuelos_tripulantes t WHERE t.id_vuelos=${flightId} AND t.id_usuarios=${user.id} AND t.fecha_baja IS NULL`);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'));
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 64, 'la base E2E debe estar en V64 o posterior');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adminId = (await ok('/auth/me', { token: admin })).id;

  // ---------- Fixtures ----------
  const co = await createUser(admin, 'CENTRO_OPERACIONES', 'aco'), ops = await createUser(admin, 'OPERACIONES', 'aop');
  const dts = await createUser(admin, 'DTS', 'adts'), dts2 = await createUser(admin, 'DTS', 'adts2');
  const cmd = {}; for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) { cmd[n] = await createUser(admin, 'COMANDANTE', 'acm' + n); await provision(admin, cmd[n]); }
  let province, airports, localities;
  // La provincia de salida no debe tener comandantes de corridas anteriores: así se comprueba también el caso «sin candidatos ordinarios».
  for (const p of await ok('/catalogs/provinces', { token: co.token })) { if (count(`SELECT COUNT(*) FROM perfiles_comandante WHERE id_provincias=${p.id}`) > 0) continue; airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: co.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: co.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
  assert.ok(province, 'se necesita una provincia sin comandantes, con dos aeropuertos y dos localidades');
  const departure = localities[0], otherLocality = localities[1];
  const bsas = (await ok('/catalogs/provinces', { token: co.token })).find((p) => /^Buenos Aires$/i.test(p.nombre) && p.id !== province.id) || (await ok('/catalogs/provinces', { token: co.token })).find((p) => p.id !== province.id);
  let plateSeq = 0; const newPlane = async (airport = airports[0]) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'A' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airport.id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const locate = (user, prov, token = admin, expect = [200]) => call(`/commanders/${user.id}/location`, { method: 'PUT', token, body: { provinciaId: prov ? prov.id : null, motivo: 'E2E ' + MARK }, expect });
  const request = async (slot, token = dts.token) => {
    const patient = await ok('/patients', { method: 'POST', token, body: { nombre: 'Asignacion', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
    const f = (await call('/flights', { method: 'POST', token, body: { patientId: patient.id, localidadOrigenId: departure.id, localidadDestinoId: otherLocality.id, priorityCode: priority, motivoVuelo: 'Asignación ' + MARK, fechaSolicitada: civil(slot), extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).data;
    return f.id;
  };
  const approved = async (slot) => { const id = await request(slot); await ok(`/flights/${id}/schedule/accept`, { method: 'POST', token: co.token }); return id; };
  const candidates = (id, token = co.token, q = MARK) => ok(`/flights/${id}/commander-candidates?q=${encodeURIComponent(q)}`, { token });
  const putCommander = (id, c, extra = {}, token = co.token, expect = [200]) => call(`/flights/${id}/commander`, { method: 'PUT', token, body: { comandanteId: c.id, ...extra }, expect });
  const putAircraft = (id, plane, token = co.token, expect = [200]) => call(`/flights/${id}/assigned-aircraft`, { method: 'PUT', token, body: { aircraftId: plane.id }, expect });
  const names = (list) => list.map((x) => x.username);
  pass('fixtures: CO, OPERACIONES, 2 DTS, 7 comandantes habilitados, provincia sin comandantes con 2 aeropuertos y 2 localidades');

  // ---------- Esquema V64 y restricciones reales ----------
  assert.equal(count(`SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.perfiles_comandante') AND name='id_localidades_actual'`), 0, 'la localidad ya no forma parte de la ubicación operativa del comandante');
  assert.equal(count(`SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.perfiles_comandante') AND name IN ('id_provincias','fecha_ubicacion_actual','id_usuario_ubicacion')`), 3);
  assert.equal(count(`SELECT COUNT(*) FROM sys.tables WHERE name='excepciones_geograficas_comandante'`), 1);
  assert.equal(count(`SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.vuelos') AND name IN ('estado_aeropuerto_origen','estado_aeropuerto_destino','id_usuario_aeropuertos','fecha_aeropuertos')`), 4);
  assert.ok(count('SELECT COUNT(*) FROM localidades WHERE latitud IS NOT NULL AND longitud IS NOT NULL') > 3000, 'las localidades tienen coordenadas aproximadas (V65)');
  const personOf = (u) => one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${u.id}`);
  assert.equal(one(`SELECT ISNULL(CAST(id_provincias AS varchar(20)),'NULL') FROM perfiles_comandante WHERE id_personas=${personOf(cmd.A)}`), 'NULL', 'un comandante nuevo tiene la ubicación desconocida, no una provincia inventada');
  const rejectedBy = (statement) => { try { sql(statement); } catch (e) { return String(e.sqlOutput || e.message); } return 'SIN ERROR'; };
  assert.match(rejectedBy(`UPDATE perfiles_comandante SET id_provincias=${province.id}, fecha_ubicacion_actual=SYSDATETIME(), id_usuario_ubicacion=NULL WHERE id_personas=${personOf(cmd.A)}`), /ck_perfiles_comandante_ubicacion_responsable/);
  pass('V64 en SQL Server: la localidad se retiró del comandante, existen los estados de aeropuerto y las coordenadas de localidades, y el CHECK exige fecha y responsable juntos');

  // ---------- Caso 3 / 4: sin ubicación, alta y actualización por Administrador ----------
  const planeA = await newPlane(), planeB = await newPlane(), planeC = await newPlane(), planeD = await newPlane();
  const f1 = await approved(nextSlot());
  let list = await candidates(f1);
  assert.ok(!names(list.ordinarios).includes(cmd.A.name), 'sin ubicación no es ordinario');
  assert.ok(names(list.excepcionales).includes(cmd.A.name), 'sí es candidato a excepción, con la causa');
  assert.equal(list.excepcionales.find((x) => x.username === cmd.A.name).codigoUbicacion, 'UBICACION_DESCONOCIDA');
  assert.match(list.mensaje, /No se encontraron comandantes disponibles en/); assert.equal(list.salida.preliminar, true); assert.equal(list.salida.fuente, 'PROVINCIA_DEL_PACIENTE'); assert.equal(list.salida.provinciaId, province.id); assert.ok(list.advertencia);
  assert.ok(list.fueraDeJurisdiccion.UBICACION_DESCONOCIDA >= 7, 'el resumen cuenta a los comandantes sin ubicación');
  const noLocation = await putCommander(f1, cmd.A, {}, co.token, [409]);
  assert.equal(noLocation.data.code, 'COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION'); assert.equal(noLocation.data.tipo, 'UBICACION_DESCONOCIDA');
  assert.equal(resourcesOf(f1), '-|-'); assert.equal(stateOf(f1), 'NULL');
  pass('caso 3: un comandante sin ubicación no es elegible de forma ordinaria (409 COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION, nada persiste) y el mensaje explica las causas');

  const legacy = await call(`/catalogs/commanders/${cmd.E.id}/location`, { method: 'POST', token: admin, body: { locationId: province.id } });
  assert.equal(legacy.data.provinciaActualId, province.id);
  list = await candidates(f1);
  assert.ok(names(list.ordinarios).includes(cmd.E.name), 'la provincia sola alcanza: no se pide ninguna localidad');
  assert.equal(count(`SELECT COUNT(*) FROM perfiles_comandante WHERE id_personas=${personOf(cmd.E)} AND id_usuario_ubicacion=${adminId} AND fecha_ubicacion_actual IS NOT NULL`), 1, 'el contrato anterior también registra quién y cuándo');
  await locate(cmd.E, null, admin);
  list = await candidates(f1); assert.ok(!names(list.ordinarios).includes(cmd.E.name)); assert.equal(list.excepcionales.find((x) => x.username === cmd.E.name).codigoUbicacion, 'UBICACION_DESCONOCIDA');
  pass('la provincia sola es toda la ubicación operativa (contrato anterior y nuevo); marcarla como desconocida la quita de los ordinarios y conserva fecha y responsable');

  const located = await locate(cmd.A, province, admin);
  assert.equal(located.data.estadoUbicacion, 'CONOCIDA'); assert.equal(located.data.provinciaId, province.id); assert.equal(located.data.localidadId, undefined);
  const row = sql(`SELECT CONCAT(id_provincias,'|',id_usuario_ubicacion,'|',CASE WHEN fecha_ubicacion_actual IS NULL THEN 'sin fecha' ELSE 'con fecha' END) FROM perfiles_comandante WHERE id_personas=${personOf(cmd.A)}`);
  assert.equal(row, `${province.id}|${adminId}|con fecha`);
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'COMMANDER_PROFILE' AND operacion=N'COMMANDER_LOCATION_UPDATE' AND entidad_id=${personOf(cmd.A)}`), 1);
  list = await candidates(f1);
  assert.ok(names(list.ordinarios).includes(cmd.A.name), 'tras fijar la ubicación aparece como ordinario');
  const got = await ok(`/commanders/locations?q=${MARK}`, { token: co.token });
  const view = got.comandantes.find((x) => x.username === cmd.A.name);
  assert.equal(view.provincia, province.nombre); assert.equal(view.localidad, undefined); assert.equal(view.estadoUbicacion, 'CONOCIDA'); assert.ok(view.actualizadaEn && view.actualizadaPor);
  assert.equal(got.comandantes.find((x) => x.username === cmd.B.name).estadoUbicacion, 'DESCONOCIDA');
  pass('caso 4: el Administrador fija la ubicación; queda con fecha y responsable, auditada, y la elegibilidad la refleja de inmediato');

  // Validaciones del catálogo
  await call(`/commanders/${cmd.B.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: 987654321 }, expect: [400] });
  await call(`/commanders/${cmd.B.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: province.id, localidadId: departure.id }, expect: [400] });   // la localidad ya no se acepta
  await call(`/commanders/${cmd.B.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: province.id, extra: 1 }, expect: [400] });
  await call(`/commanders/${dts.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: province.id }, expect: [400] });
  assert.equal(one(`SELECT ISNULL(CAST(id_provincias AS varchar(20)),'NULL') FROM perfiles_comandante WHERE id_personas=${personOf(cmd.B)}`), 'NULL');
  pass('validaciones: provincia inexistente, localidad enviada, campos extra y usuario sin perfil de comandante se rechazan sin modificar nada');

  // ---------- Caso 2: comandante en otra provincia ----------
  await locate(cmd.B, bsas, co.token);
  await locate(cmd.F, province, co.token);
  list = await candidates(f1);
  assert.ok(!names(list.ordinarios).includes(cmd.B.name) && names(list.ordinarios).includes(cmd.F.name), 'la jurisdicción decide: estar en la misma provincia basta, no se compara la localidad');
  assert.equal(list.excepcionales.find((x) => x.username === cmd.B.name).codigoUbicacion, 'OTRA_PROVINCIA');
  assert.ok(!names(await ok(`/flights/${f1}/available-commanders`, { token: co.token })).includes(cmd.B.name));
  await putCommander(f1, cmd.B, {}, co.token, [409]);
  pass('caso 2: un comandante en otra provincia no es candidato ordinario y la asignación directa se rechaza; uno de la misma provincia sí lo es aunque no esté en la localidad del paciente');

  // ---------- Caso 5: excepciones ----------
  const exceptionOps = await putCommander(f1, cmd.B, { excepcionGeografica: { motivo: 'No hay otro comandante habilitado en la provincia' } }, ops.token, [403]);
  assert.equal(exceptionOps.data.code, 'GEOGRAPHIC_EXCEPTION_NOT_AUTHORIZED');
  await putCommander(f1, cmd.B, { excepcionGeografica: { motivo: 'corto' } }, co.token, [400]);
  await putCommander(f1, cmd.B, { excepcionGeografica: { motivo: '                    ' } }, co.token, [400]);
  await putCommander(f1, cmd.A, { excepcionGeografica: { motivo: 'Justificación que no corresponde aquí' } }, co.token, [400]);   // A está en la jurisdicción
  assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${f1}`), 0); assert.equal(resourcesOf(f1), '-|-');
  const reason = 'Traslado crítico: no hay otro comandante habilitado en la provincia ' + MARK;
  const reserved = await putCommander(f1, cmd.B, { excepcionGeografica: { motivo: reason } }, co.token);
  assert.equal(reserved.data.estadoVuelo, null, 'reservado: el vuelo todavía no cambia de estado'); assert.equal(stateOf(f1), 'NULL');
  const ex = sql(`SELECT CONCAT(tipo_excepcion,'|',motivo,'|',id_usuario_autoriza,'|',id_provincia_salida,'|',id_provincia_comandante,'|',CASE WHEN fecha_reemplazo IS NULL THEN 'vigente' ELSE 'reemplazada' END) FROM excepciones_geograficas_comandante WHERE id_vuelos=${f1}`);
  assert.equal(ex, `OTRA_PROVINCIA|${reason}|${co.id}|${province.id}|${bsas.id}|vigente`);
  assert.equal(audit(f1, 'COMMANDER_GEOGRAPHIC_EXCEPTION', 'CREATE'), 1); assert.equal(audit(f1, 'FLIGHT', 'ASSIGN_FLIGHT_COMMANDER'), 1);
  let detail = await ok(`/flights/${f1}`, { token: co.token });
  assert.equal(detail.recursos.commanderId, cmd.B.id); assert.equal(detail.recursos.excepcionGeografica.tipo, 'OTRA_PROVINCIA'); assert.equal(detail.recursos.excepcionGeografica.motivo, reason);
  assert.equal(detail.recursos.commanderProvinciaActual, bsas.nombre); assert.equal(detail.recursos.excepcionGeografica.provinciaSalida, province.nombre);
  pass('caso 5: la excepción exige rol de Centro de Operaciones y justificación, queda registrada con quién/cuándo/por qué y auditada; sin autorización o sin motivo se rechaza sin persistir');

  // La excepción no omite las demás validaciones (V66: cuenta activa, rol, licencia, informes, disponibilidad): una cuenta desactivada no es apta aunque se justifique.
  const unqualified = await createUser(admin, 'COMANDANTE', 'acmX');
  await locate(unqualified, bsas, co.token);
  await ok(`/auth/users/${unqualified.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'E2E: la excepción no omite la cuenta activa' } });
  const notApt = await putCommander(f1, unqualified, { excepcionGeografica: { motivo: 'Intento de omitir las validaciones operativas' } }, co.token, [400, 409]);
  assert.ok([400, 409].includes(notApt.status));
  assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_usuario_comandante=${unqualified.id}`), 0);
  pass('la excepción geográfica no omite las demás validaciones operativas (rechazo, sin excepción registrada)');

  // ---------- Caso 13: el comandante reservado no ve el vuelo; negociación pendiente bloquea ----------
  assert.ok(!(await ok('/flights', { token: cmd.B.token })).some((x) => x.id === f1), 'el comandante reservado todavía no ve el vuelo');
  await call(`/flights/${f1}`, { token: cmd.B.token, expect: [403] });
  assert.equal(notif('COMMANDER_ASSIGNED', cmd.B, f1), 0);
  const pending = await request(nextSlot());
  await call(`/flights/${pending}/commander-candidates`, { token: co.token, expect: [400] });
  await call(`/flights/${pending}/commander`, { method: 'PUT', token: co.token, body: { comandanteId: cmd.A.id }, expect: [400] });
  await call(`/flights/${pending}/assigned-aircraft`, { method: 'PUT', token: co.token, body: { aircraftId: planeA.id }, expect: [400] });
  await call(`/flights/${pending}/resources`, { method: 'POST', token: co.token, body: { aircraftId: planeA.id, comandanteId: cmd.A.id }, expect: [400] });
  assert.equal(resourcesOf(pending), '-|-'); const access = await ok(`/flights/${pending}/documents/access`, { token: co.token }); assert.equal(access.disponible, false); assert.equal(access.codigo, 'DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED');
  const docs = await call(`/flights/${pending}/documents`, { token: co.token, expect: [409] }); assert.equal(docs.data.code, 'DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED');
  pass('caso 13: con la negociación pendiente (sin horario acordado) candidatos, comandante, aeronave y la asignación combinada se rechazan en el servidor, igual que los documentos');

  // ---------- Caso 8 / 7: aeronave elegible y asignación definitiva ----------
  const planes = await ok(`/flights/${f1}/aircraft-candidates`, { token: co.token });
  assert.ok(planes.find((x) => x.id === planeA.id).disponible);
  const done = await putAircraft(f1, planeA);
  assert.equal(done.data.estadoVuelo, 'PLANIFICADO'); assert.equal(stateOf(f1), 'PLANIFICADO'); assert.equal(resourcesOf(f1), `${cmd.B.id}|${planeA.id}`);
  assert.equal(crewRows(f1, cmd.B), 1); assert.equal(audit(f1, 'FLIGHT', 'ASSIGN_RESOURCES'), 1); assert.equal(notif('COMMANDER_ASSIGNED', cmd.B, f1), 1);
  const fresh = (await ok('/auth/login', { method: 'POST', body: { username: co.name, password: PASSWORD } })).accessToken;
  detail = await ok(`/flights/${f1}`, { token: fresh });
  assert.equal(detail.vuelo.estadoVuelo, 'PLANIFICADO'); assert.equal(detail.recursos.aircraftMatricula, planeA.matricula); assert.equal(detail.recursos.excepcionGeografica.tipo, 'OTRA_PROVINCIA');
  pass('casos 7 y 8: la aeronave elegible se confirma; con el comandante ya elegido el vuelo pasa a PLANIFICADO y todo persiste en SQL Server y en una sesión nueva (tripulación, auditoría, aviso al comandante)');

  // ---------- Caso 12: flujo completo hasta que el comandante continúa ----------
  const flow = await request(nextSlot());
  await call(`/flights/${flow}/commander-candidates`, { token: co.token, expect: [400] });
  await ok(`/flights/${flow}/schedule/accept`, { method: 'POST', token: co.token });
  list = await candidates(flow); assert.ok(names(list.ordinarios).includes(cmd.A.name));
  const flowPlane = await newPlane();
  const aircraftFirst = await putAircraft(flow, flowPlane);
  assert.equal(aircraftFirst.data.estadoVuelo, null); assert.equal(resourcesOf(flow), `-|${flowPlane.id}`); assert.equal(audit(flow, 'FLIGHT', 'ASSIGN_FLIGHT_AIRCRAFT'), 1);
  const planned = await putCommander(flow, cmd.A);
  assert.equal(planned.data.estadoVuelo, 'PLANIFICADO'); assert.equal(resourcesOf(flow), `${cmd.A.id}|${flowPlane.id}`);
  assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${flow}`), 0, 'una asignación ordinaria no registra excepción');
  const mine = await ok('/flights', { token: cmd.A.token }); assert.ok(mine.some((x) => x.id === flow && x.estadoVuelo === 'PLANIFICADO'));
  assert.equal(notif('COMMANDER_ASSIGNED', cmd.A, flow), 1);
  const mineDetail = await ok(`/flights/${flow}`, { token: cmd.A.token }); assert.equal(mineDetail.recursos.commanderId, cmd.A.id);
  pass('caso 12: solicitud DTS → acuerdo con CO → candidatos → aeronave reservada → comandante ordinario → PLANIFICADO; el comandante lo ve en su lista, recibe el aviso y accede al detalle');

  // El comandante continúa: planificación operativa con la llegada posterior a la salida.
  const flowDetail = await ok(`/flights/${flow}`, { token: cmd.A.token }); const salida = new Date(flowDetail.vuelo.salida);
  const planning = await call(`/flights/${flow}/operational-planning`, { method: 'POST', token: cmd.A.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: civil(new Date(salida.getTime() + 3 * 3600000)) } });
  assert.ok(planning.data.origen && planning.data.destino);
  assert.equal(stateOf(flow), 'PLANIFICADO'); assert.ok(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${flow} AND id_aeropuerto_origen IS NOT NULL AND fecha_planificada_llegada IS NOT NULL`) === 1);
  pass('el flujo continúa: el comandante asignado completa la planificación operativa (origen, destino, llegada) del vuelo');

  // ---------- Caso 6 / 9: comandante y aeronave ocupados ----------
  const slot = nextSlot();
  const g1 = await approved(slot), g2 = await approved(slot);
  await locate(cmd.D, province, admin); await locate(cmd.G, province, admin);
  await putCommander(g1, cmd.D); await putAircraft(g1, planeB);                 // g1 PLANIFICADO con D y planeB
  list = await candidates(g2);
  const busy = list.noElegiblesEnJurisdiccion.find((x) => x.username === cmd.D.name);
  assert.ok(busy && busy.codigoOperativo === 'CONFLICTO_ASIGNACION' && !names(list.ordinarios).includes(cmd.D.name), 'caso 6: con conflicto operativo no es elegible aunque esté en la jurisdicción');
  const conflict = await putCommander(g2, cmd.D, {}, co.token, [409]); assert.equal(conflict.data.code, 'CONFLICTO_ASIGNACION'); assert.equal(resourcesOf(g2), '-|-');
  const planes2 = await ok(`/flights/${g2}/aircraft-candidates`, { token: co.token });
  const busyPlane = planes2.find((x) => x.id === planeB.id); assert.equal(busyPlane.disponible, false); assert.ok(busyPlane.motivoNoDisponible);
  const clash = await putAircraft(g2, planeB, co.token, [409]); assert.match(clash.data.error, /comprometido/); assert.equal(resourcesOf(g2), '-|-');
  pass('casos 6 y 9: un comandante con otro vuelo y una aeronave ocupada no son elegibles ni asignables (409), y el vuelo no cambia');

  // Reserva de aeronave: ocupa la aeronave aunque el vuelo todavía no tenga estado
  await putAircraft(g2, planeC);
  const g3 = await approved(slot);
  const reservedPlane = (await ok(`/flights/${g3}/aircraft-candidates`, { token: co.token })).find((x) => x.id === planeC.id);
  assert.equal(reservedPlane.disponible, false, 'una aeronave reservada por otra solicitud aprobada no se ofrece para el mismo horario');
  await putAircraft(g3, planeC, co.token, [409]);
  pass('la aeronave reservada (aprobada sin comandante) bloquea a otra solicitud en el mismo horario');

  // ---------- Caso 10: concurrencia real ----------
  const pairs = []; for (let i = 0; i < 3; i++) { const slotR = nextSlot(); pairs.push([await approved(slotR), await approved(slotR)]); }
  const racePlanes = [await newPlane(), await newPlane()];
  for (const [index, offsets] of [[0, [0, 25]], [1, [25, 0]]]) {
    const [x, y] = pairs[index];
    const results = await Promise.all([x, y].map(async (id, i) => { await sleep(offsets[i]); return putAircraft(id, racePlanes[index], co.token, [200, 409]); }));
    assert.equal(results.filter((r) => r.status === 200).length, 1, `exactamente una asignación de la aeronave tiene éxito (orden ${offsets})`);
    const winner = results.findIndex((r) => r.status === 200), loser = [x, y][1 - winner];
    assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_aeronaves=${racePlanes[index].id} AND id_vuelos IN (${x},${y})`), 1);
    assert.equal(resourcesOf(loser), '-|-'); assert.match(results[1 - winner].data.error, /comprometido/);
  }
  await locate(cmd.G, province, admin);
  const [cx, cy] = pairs[2];
  const cr = await Promise.all([cx, cy].map(async (id, i) => { await sleep(i * 20); return putCommander(id, cmd.G, {}, co.token, [200, 409]); }));
  assert.equal(cr.filter((r) => r.status === 200).length, 1, 'el mismo comandante no puede reservarse para dos solicitudes simultáneas');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_usuario_comandante=${cmd.G.id} AND id_vuelos IN (${cx},${cy})`), 1);
  pass('caso 10: dos peticiones simultáneas por la misma aeronave (en ambos órdenes) o el mismo comandante: exactamente una prospera, la otra recibe 409 y SQL Server queda con una sola asignación');

  // ---------- Caso 11: fallo de persistencia ----------
  const h = await approved(nextSlot()); const planeE = await newPlane(); await putCommander(h, cmd.C, {}, co.token, [409]);
  await locate(cmd.C, province, admin); await putCommander(h, cmd.C);
  const trig = 'tr_e2e_asig_' + MARK;
  sql(`EXEC(N'CREATE TRIGGER dbo.${trig} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id_vuelos=${h} AND operacion=N''ASSIGN_RESOURCES'') THROW 51000, N''Fallo de prueba'', 1; END');`);
  try {
    const failure = await putAircraft(h, planeE, co.token, [500, 409, 400]);
    assert.notEqual(failure.status, 200);
    assert.equal(resourcesOf(h), `${cmd.C.id}|-`, 'sin la aeronave: la transacción se revirtió completa'); assert.equal(stateOf(h), 'NULL');
    assert.equal(crewRows(h, cmd.C), 0); assert.equal(notif('COMMANDER_ASSIGNED', cmd.C, h), 0);
  } finally { sql(`DROP TRIGGER IF EXISTS dbo.${trig}`); }
  const retry = await putAircraft(h, planeE); assert.equal(retry.data.estadoVuelo, 'PLANIFICADO');
  pass('caso 11: si falla la persistencia (auditoría) no queda estado, aeronave, tripulación ni aviso a medias; reintentar después sí asigna');

  // ---------- Caso 14: autorización por HTTP directo ----------
  const v = await approved(nextSlot());
  for (const [who, token] of [['DTS', dts.token], ['COMANDANTE', cmd.A.token], ['ADMINISTRADOR', admin]]) {
    await call(`/flights/${v}/commander`, { method: 'PUT', token, body: { comandanteId: cmd.A.id }, expect: [403] });
    await call(`/flights/${v}/assigned-aircraft`, { method: 'PUT', token, body: { aircraftId: planeA.id }, expect: [403] });
    await call(`/flights/${v}/commander-candidates`, { token, expect: [403] });
    await call(`/flights/${v}/resources`, { method: 'POST', token, body: { aircraftId: planeA.id, comandanteId: cmd.A.id }, expect: [403] });
  }
  for (const [who, token] of [['DTS', dts.token], ['COMANDANTE', cmd.A.token]]) {
    await call(`/commanders/${cmd.A.id}/location`, { method: 'PUT', token, body: { provinciaId: province.id }, expect: [403] });
    await call(`/catalogs/commanders/${cmd.A.id}/location`, { method: 'POST', token, body: { locationId: province.id }, expect: [403] });
    await call('/commanders/locations', { token, expect: [403] });
  }
  await call(`/commanders/${cmd.A.id}/location`, { token: cmd.A.token, expect: [200] }); await call(`/commanders/${cmd.D.id}/location`, { token: cmd.A.token, expect: [403] });
  await call(`/flights/${v}/commander`, { method: 'PUT', token: dts2.token, body: { comandanteId: cmd.A.id, excepcionGeografica: { motivo: 'Intento de un DTS de autorizar una excepción' } }, expect: [403] });
  await call(`/flights/${v}/commander`, { method: 'PUT', token: ops.token, body: { comandanteId: cmd.B.id, excepcionGeografica: { motivo: 'OPERACIONES no autoriza excepciones geográficas' } }, expect: [403] });
  assert.equal(resourcesOf(v), '-|-'); assert.equal(one(`SELECT ISNULL(CAST(id_provincias AS varchar(20)),'NULL') FROM perfiles_comandante WHERE id_personas=${personOf(cmd.A)}`), String(province.id));
  await call(`/flights/${v}/commander`, { method: 'PUT', body: { comandanteId: cmd.A.id }, expect: [401, 403] });
  pass('caso 14: DTS, comandante y administrador no pueden asignar, consultar candidatos, cambiar ubicaciones ni autorizar excepciones por HTTP directo; OPERACIONES no autoriza excepciones; sin token se rechaza');

  console.log(`\nE2E de asignación de recursos: ${passed} escenarios correctos.`);
})().catch((e) => { console.error('FALLO:', e.stack || e.message); process.exit(1); });
