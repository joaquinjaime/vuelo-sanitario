/* E2E de la simplificación de la tripulación (V66) sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e):
 *  - un comandante recién creado (con provincia) es asignable sin clasificación, política de suficiencia ni habilitación documentada;
 *  - el copiloto es otro usuario COMANDANTE asignado por Centro de Operaciones a ese vuelo (sin rol de acceso ni cuenta nueva) y no recibe permisos del comandante principal;
 *  - disponibilidad: conflictos horarios (como comandante o copiloto), vuelos consecutivos con la ubicación PREVISTA por el itinerario (sin tocar la ubicación actual),
 *    ubicación futura incorrecta, horario indeterminado, cancelación del vuelo anterior (se avisa y se audita, nunca se quita en silencio);
 *  - personal sanitario (médicos y enfermeros) que cada DTS registra y asigna a sus vuelos, sin cuentas ni pantallas propias, privado de cada DTS e histórico;
 *  - flujo completo hasta FINALIZADO con persistencia en SQL Server y reubicación real de comandante y copiloto al aterrizar.
 * Sólo crea registros marcados. Uso: node scripts/e2e-simplificacion-tripulacion.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, fmt, createUser, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const DAY = 86400000, HOUR = 3600000;
let dayCursor = 1200 + Math.floor(Math.random() * 1200);
const nextDay = () => new Date(Date.now() + (dayCursor += 5) * DAY);
const at = (day, hour) => { const d = new Date(day); d.setHours(hour, 0, 0, 0); return d; };

/** Nombres y apellidos sólo admiten letras: el marcador numérico de la corrida se traduce a letras. */
const TAG = Array.from(MARK.replace(/D/g, '')).map((d) => 'abcdefghij'[Number(d)]).join('');
const created201 = async (p, o) => (await call(p, { ...o, expect: [201] })).data;
const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const commanderOf = (id) => one(`SELECT ISNULL(CAST(id_usuario_comandante AS varchar(20)),'-') FROM vuelos WHERE id_vuelos=${id}`);
const provinceOf = (u) => one(`SELECT ISNULL(CAST(c.id_provincias AS varchar(20)),'NULL') FROM perfiles_comandante c JOIN usuarios x ON x.id_personas=c.id_personas WHERE x.id_usuarios=${u.id}`);
const audit = (flightId, type, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flightId} AND tipo_entidad=N'${type}' AND operacion=N'${op}'`);
const crewRows = (flightId, user, role) => count(`SELECT COUNT(*) FROM vuelos_tripulantes t JOIN roles_tripulacion r ON r.id_roles_tripulacion=t.id_roles_tripulacion WHERE t.id_vuelos=${flightId} AND t.id_usuarios=${user.id} AND r.codigo_rol_tripulacion=N'${role}' AND t.fecha_baja IS NULL`);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'), 'sólo corre contra la base aislada');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 66, 'la base E2E debe estar en V66 o posterior');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;

  // ---------- Fixtures ----------
  const co = await createUser(admin, 'CENTRO_OPERACIONES', 'sco'), ops = await createUser(admin, 'OPERACIONES', 'sop');
  const dts1 = await createUser(admin, 'DTS', 'sdts1'), dts2 = await createUser(admin, 'DTS', 'sdts2');
  const maria = await createUser(admin, 'COMANDANTE', 'smaria'), juan = await createUser(admin, 'COMANDANTE', 'sjuan'), pedro = await createUser(admin, 'COMANDANTE', 'spedro');
  const provinces = await ok('/catalogs/provinces', { token: admin });
  const prov = (n) => provinces.find((p) => p.nombre === n) || provinces.find((p) => p.nombre.toLowerCase().includes(n.toLowerCase()));
  const tuc = prov('Tucumán'), cba = prov('Córdoba'), sal = prov('Salta');
  const airportsOf = (p) => ok('/catalogs/airports?provinceId=' + p.id, { token: admin });
  const aTuc = await airportsOf(tuc), aCba = await airportsOf(cba), aSal = await airportsOf(sal);
  const matienzo = aTuc.find((a) => /MATIENZO/i.test(a.nombre)), taravella = aCba.find((a) => /TARAVELLA/i.test(a.nombre)) || aCba[0], saltaAirport = aSal[0];
  assert.ok(matienzo && taravella && saltaAirport);
  const loc = async (p, q) => { const rows = await ok(`/catalogs/localities?provinceId=${p.id}&q=${encodeURIComponent(q)}`, { token: admin }); assert.ok(rows.length); return rows[0]; };
  const yerbaBuena = await loc(tuc, 'Yerba Buena'), carlosPaz = await loc(cba, 'Villa Carlos Paz'), salta = await loc(sal, 'Salta');
  const locate = (u, p) => call(`/commanders/${u.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: p.id, motivo: 'E2E ' + MARK } });
  let plateSeq = 0; const newPlane = async (airport, crew = 5) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'S' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: crew, aeropuertoActualId: airport.id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts1.token }))[0].codigo;
  const request = async (originLoc, destLoc, slot, token = dts1.token) => {
    const patient = await ok('/patients', { method: 'POST', token, body: { nombre: 'Tripulacion', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
    return (await ok('/flights', { method: 'POST', token, body: { patientId: patient.id, localidadOrigenId: originLoc.id, localidadDestinoId: destLoc.id, priorityCode: priority, motivoVuelo: 'Simplificación ' + MARK, fechaSolicitada: fmt(slot), extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  };
  const approved = async (o, d, slot, from, to) => { const id = await request(o, d, slot); await ok(`/flights/${id}/schedule/accept`, { method: 'POST', token: co.token }); await call(`/flights/${id}/airports`, { method: 'PUT', token: co.token, body: { origenId: from.id, destinoId: to.id } }); return id; };
  const candidates = (id, funcion = 'COMANDANTE', q = MARK) => ok(`/flights/${id}/commander-candidates?funcion=${funcion}&q=${encodeURIComponent(q)}`, { token: co.token });
  const putCommander = (id, c, expect = [200], extra = {}) => call(`/flights/${id}/commander`, { method: 'PUT', token: co.token, body: { comandanteId: c.id, ...extra }, expect });
  const putAircraft = (id, plane, expect = [200]) => call(`/flights/${id}/assigned-aircraft`, { method: 'PUT', token: co.token, body: { aircraftId: plane.id }, expect });
  const addCopilot = (id, c, expect = [204], extra = {}) => call(`/flights/${id}/crew`, { method: 'POST', token: co.token, body: { userId: c.id, crewRoleCode: 'COPILOTO', ...extra }, expect });
  const plan = async (id, commander, from, to, hours = 3) => { const d = await ok(`/flights/${id}`, { token: commander.token }); return call(`/flights/${id}/operational-planning`, { method: 'POST', token: commander.token, body: { origenId: from.id, destinoId: to.id, llegada: fmt(new Date(new Date(d.vuelo.salida).getTime() + hours * HOUR)) } }); };
  const codeOf = async (id) => (await ok(`/flights/${id}`, { token: co.token })).vuelo.codigo;
  const names = (list) => list.map((x) => x.username);
  pass('fixtures: CO, OPERACIONES, 2 DTS, 3 comandantes y el catálogo real (Tucumán, Córdoba y Salta con sus aeropuertos)');

  // ---------- Esquema V66: sin rol COPILOTO ni cuentas para médicos y enfermeros ----------
  assert.equal(count(`SELECT COUNT(*) FROM sys.tables WHERE name IN ('personal_sanitario','vuelos_personal_sanitario')`), 2);
  assert.equal(count(`SELECT COUNT(*) FROM roles WHERE codigo_rol IN (N'COPILOTO',N'MEDICO',N'ENFERMERO')`), 0, 'ningún rol de acceso para copilotos, médicos o enfermeros');
  assert.equal(count(`SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.personal_sanitario') AND name IN ('id_usuarios','hash_contrasena','nombre_usuario')`), 0, 'el personal sanitario no tiene cuenta');
  assert.equal(count(`SELECT COUNT(*) FROM sys.extended_properties WHERE major_id=OBJECT_ID('dbo.politicas_habilitacion') AND name='MS_Description'`), 1, 'las tablas de habilitaciones quedan marcadas como historial');
  for (const retired of ['/crew-qualifications/1', '/credential-policies', '/users/1/professional-credentials', '/professional-credential-documents/1']) {
    const r = await call(retired, { token: admin, expect: [404, 405] }); assert.ok([404, 405].includes(r.status), retired + ' ya no existe');
  }
  pass('V66: existen personal_sanitario y vuelos_personal_sanitario sin cuenta propia; no hay roles COPILOTO/MEDICO/ENFERMERO; los endpoints de clasificaciones, políticas y habilitaciones fueron retirados');

  // ---------- Caso 1: crear un comandante lo deja asignable ----------
  const dni = String(100000000000 + Math.floor(Math.random() * 899999999999)), name = MARK + 'nuevo';
  const created = (await call('/auth/users', { method: 'POST', token: admin, body: { nombre: 'Nuevo', apellido: 'Comandante', dni, roles: ['COMANDANTE'], licenciaAeronautica: name.toUpperCase(), provinciaId: tuc.id, correos: [{ direccion: name + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551234' }] } })).data;
  await call('/auth/activar-cuenta', { method: 'POST', body: { dni, codigo: created.codigo, username: name, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
  const fresh = { name, id: (await ok('/auth/login', { method: 'POST', body: { username: name, password: PASSWORD } }).then(async (t) => ok('/auth/me', { token: t.accessToken }))).id };
  assert.equal(provinceOf(fresh), String(tuc.id), 'la provincia de ubicación operativa se registra al crear el comandante');
  assert.equal(count(`SELECT COUNT(*) FROM clasificaciones_tripulacion WHERE id_usuarios=${fresh.id}`) + count(`SELECT COUNT(*) FROM habilitaciones_profesionales h JOIN usuarios u ON u.id_personas=h.id_personas WHERE u.id_usuarios=${fresh.id}`), 0, 'sin clasificación ni habilitación');
  const D1 = nextDay();
  const f1 = await approved(yerbaBuena, carlosPaz, at(D1, 10), matienzo, taravella);
  let list = await candidates(f1);
  assert.ok(names(list.ordinarios).includes(name), 'el comandante recién creado es candidato ordinario sin trámites adicionales');
  assert.deepEqual(list.ordinarios.find((x) => x.username === name).requisitosFaltantes, []);
  pass('caso 1: un comandante recién creado (licencia + provincia) queda administrativamente asignable: sin clasificación, política ni documento, y figura como candidato ordinario');

  // ---------- Caso 2 y 3: María comandante, Juan copiloto ----------
  await locate(maria, tuc); await locate(juan, tuc); await locate(pedro, cba);
  list = await candidates(f1);
  assert.ok(names(list.ordinarios).includes(maria.name));
  const planeTuc = await newPlane(matienzo);
  await putCommander(f1, maria); const planned1 = await putAircraft(f1, planeTuc);
  assert.equal(planned1.data.estadoVuelo, 'PLANIFICADO'); assert.equal(commanderOf(f1), String(maria.id));
  const cop = await candidates(f1, 'COPILOTO');
  assert.ok(names(cop.ordinarios).includes(juan.name) && !names(cop.ordinarios).includes(maria.name), 'el copiloto se elige entre los demás usuarios COMANDANTE; el principal no figura');
  assert.ok(names(cop.excepcionales).includes(pedro.name), 'un comandante de otra provincia sólo es candidato por excepción');
  const rolesBefore = count('SELECT COUNT(*) FROM roles'), usersBefore = count('SELECT COUNT(*) FROM usuarios');
  await addCopilot(f1, juan);
  assert.equal(crewRows(f1, maria, 'COMANDANTE'), 1); assert.equal(crewRows(f1, juan, 'COPILOTO'), 1);
  assert.equal(count('SELECT COUNT(*) FROM roles'), rolesBefore); assert.equal(count('SELECT COUNT(*) FROM usuarios'), usersBefore, 'no se crea ninguna cuenta ni rol');
  assert.equal(one(`SELECT COUNT(*) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=${juan.id} AND r.codigo_rol=N'COMANDANTE'`), '1');
  assert.equal(audit(f1, 'FLIGHT_CREW', 'CREATE') >= 2, true);
  assert.equal(count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'CREW_ASSIGNED' AND id_usuarios=${juan.id} AND id_vuelos=${f1}`), 1);
  await addCopilot(f1, maria, [409]);                                                      // la misma persona no puede ser comandante y copiloto del mismo vuelo
  await call(`/flights/${f1}/crew`, { method: 'POST', token: co.token, body: { userId: pedro.id, crewRoleCode: 'MEDICO' }, expect: [400] });   // médicos y enfermeros no son tripulación con cuenta
  await addCopilot(f1, juan, [409]);                                                       // sin duplicados
  assert.equal(crewRows(f1, juan, 'COPILOTO'), 1);
  await addCopilot(f1, pedro, [409]);                                                      // otra provincia: requiere excepción
  pass('casos 2 y 3: CO asigna a María como comandante principal y a Juan como copiloto (otro usuario COMANDANTE), sin cuentas ni roles nuevos; no admite duplicados, ni al principal como copiloto, ni funciones sanitarias, ni otra provincia sin excepción');

  // ---------- Caso 4: permisos por función ----------
  const juanList = await ok('/flights', { token: juan.token }); assert.ok(!juanList.some((f) => f.id === f1), 'el copiloto no recibe el vuelo como comandante principal');
  await call(`/flights/${f1}`, { token: juan.token, expect: [403] });
  await call(`/flights/${f1}/operational-planning`, { method: 'POST', token: juan.token, body: { origenId: matienzo.id, destinoId: taravella.id, llegada: fmt(at(D1, 13)) }, expect: [403, 409] });
  await call(`/flights/${f1}/weather`, { method: 'POST', token: juan.token, body: { condiciones: 'Intento del copiloto', favorable: true }, expect: [403, 409, 400] });
  await call(`/flights/${f1}/crew`, { token: juan.token, expect: [403] });
  await call(`/flights/${f1}/commander-assignment/response`, { method: 'POST', token: juan.token, body: { aceptar: true }, expect: [403, 409] });
  await call(`/flights/${f1}/crew`, { method: 'POST', token: juan.token, body: { userId: pedro.id, crewRoleCode: 'COPILOTO' }, expect: [403] });
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${f1}`), 0, 'el copiloto no pudo tocar la ruta');
  const mine = await ok(`/flights/${f1}`, { token: maria.token }); assert.equal(mine.recursos.commanderId, maria.id);
  const planRes = await plan(f1, maria, matienzo, taravella, 3); assert.equal(planRes.status, 200);
  pass('caso 4: el copiloto (rol COMANDANTE) no ve el vuelo como suyo, no planifica ni registra clima ni toca la tripulación; el comandante principal conserva su flujo y planifica la ruta');

  // ---------- Caso 5: conflicto temporal (Juan copiloto 10:00-13:00) ----------
  const f2 = await approved(yerbaBuena, carlosPaz, at(D1, 11), matienzo, taravella);
  list = await candidates(f2);
  const busy = list.noElegiblesEnJurisdiccion.find((x) => x.username === juan.name); assert.ok(busy && busy.codigoOperativo === 'CONFLICTO_ASIGNACION', 'el copiloto del vuelo anterior figura como no disponible');
  const clash = await putCommander(f2, juan, [409]); assert.equal(clash.data.code, 'CONFLICTO_ASIGNACION'); assert.equal(commanderOf(f2), '-');
  const clashCopilot = await addCopilot(f2, juan, [409]); assert.equal(clashCopilot.status, 409);
  pass('caso 5: Juan, copiloto 10:00-13:00, no puede asignarse a otro vuelo que sale a las 11:00 (como comandante ni como copiloto) y la asignación rechazada no deja rastro');

  // ---------- Caso 6: vuelos consecutivos con la ubicación prevista ----------
  const profileBefore = provinceOf(juan);
  const f3 = await approved(carlosPaz, yerbaBuena, at(D1, 15), taravella, matienzo);
  list = await candidates(f3);
  const chained = list.ordinarios.find((x) => x.username === juan.name);
  assert.ok(chained, 'Juan es candidato ordinario del vuelo que sale de Córdoba tras llegar a Córdoba');
  assert.equal(chained.provincia, cba.nombre); assert.equal(chained.ubicacionPrevistaTrasVuelo, await codeOf(f1));
  assert.ok(names(list.ordinarios).includes(maria.name), 'María (comandante del vuelo anterior) también');
  assert.ok(!names(list.ordinarios).includes(fresh.name), 'quien sigue en Tucumán no es ordinario para una salida desde Córdoba');
  await putCommander(f3, juan); const planeCba = await newPlane(taravella); assert.equal((await putAircraft(f3, planeCba)).data.estadoVuelo, 'PLANIFICADO');
  assert.equal(provinceOf(juan), profileBefore, 'la ubicación ACTUAL de Juan no se adelantó: sigue en Tucumán hasta que el vuelo se realice');
  assert.equal(crewRows(f3, juan, 'COMANDANTE'), 1); assert.equal(crewRows(f1, juan, 'COPILOTO'), 1, 'comandante en un vuelo y copiloto en otro');
  pass('caso 6: Juan copiloto Tucumán→Córdoba es candidato y se asigna como comandante del vuelo que sale de Córdoba después de su llegada, sin modificar su ubicación actual');

  // ---------- Caso 7: ubicación futura incorrecta ----------
  assert.equal((await plan(f3, juan, taravella, matienzo, 3)).status, 200);                  // completa el horario de f3 (15:00-18:00)
  const f4 = await approved(salta, carlosPaz, at(new Date(D1.getTime() + DAY), 10), saltaAirport, taravella);
  list = await candidates(f4);
  assert.ok(!names(list.ordinarios).includes(juan.name), 'Juan estará en Tucumán tras el vuelo anterior: no es ordinario para una salida desde Salta');
  const far = list.excepcionales.find((x) => x.username === juan.name); assert.ok(far && far.codigoUbicacion === 'OTRA_PROVINCIA' && far.ubicacionPrevistaTrasVuelo === await codeOf(f3));
  const out = await putCommander(f4, juan, [409]); assert.equal(out.data.code, 'COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION'); assert.match(out.data.error, /Estará en Tucumán al terminar el vuelo/);
  const outCopilot = await addCopilot(f4, juan, [409]); assert.equal(outCopilot.data.code, 'COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION');
  const exceptionDenied = await call(`/flights/${f4}/commander`, { method: 'PUT', token: ops.token, body: { comandanteId: juan.id, excepcionGeografica: { motivo: 'Excepción solicitada por Operaciones sin autorización' } }, expect: [403] });
  assert.equal(exceptionDenied.status, 403, 'solo el Centro de Operaciones autoriza excepciones geográficas');
  pass('caso 7: Juan llegará a Tucumán y el siguiente vuelo sale de Salta: no es elegible por la vía ordinaria (comandante ni copiloto); la excepción geográfica sigue siendo exclusiva del Centro de Operaciones');

  // ---------- Horario indeterminado: no se confirma por omisión ----------
  const D2 = nextDay();
  const g1 = await approved(yerbaBuena, carlosPaz, at(D2, 9), matienzo, taravella); await putCommander(g1, pedro, [409]);   // Pedro está en Córdoba: no ordinario
  await locate(pedro, tuc); await putCommander(g1, pedro);                                         // g1 queda con el comandante reservado y sin horario de llegada
  const g2 = await approved(yerbaBuena, carlosPaz, at(D2, 20), matienzo, taravella);
  list = await candidates(g2); const unknown = list.noElegiblesEnJurisdiccion.find((x) => x.username === pedro.name);
  assert.ok(unknown && unknown.codigoOperativo === 'HORARIO_INDETERMINADO', 'sin hora de llegada del otro vuelo no se confirma la compatibilidad');
  assert.equal((await putCommander(g2, pedro, [409])).data.code, 'HORARIO_INDETERMINADO');
  pass('horario indeterminado: con un compromiso sin hora de llegada prevista la compatibilidad no se confirma automáticamente (409 HORARIO_INDETERMINADO, con la causa explicada)');

  // ---------- Caso 8: cancelación del vuelo anterior ----------
  const reason = (await ok('/catalogs/cancellation-reasons', { token: co.token }))[0];
  const stateBefore = { f3Commander: commanderOf(f3), f3Crew: crewRows(f3, juan, 'COMANDANTE') };
  await ok(`/flights/${f1}/cancel`, { method: 'POST', token: co.token, body: { motivoCancelacionId: reason.id, motivoCancelacionPersonalizado: reason.codigo === 'OTRO' ? 'E2E' : null } });
  assert.equal(stateOf(f1), 'CANCELADO');
  assert.equal(commanderOf(f3), stateBefore.f3Commander, 'la asignación posterior no se elimina en silencio'); assert.equal(crewRows(f3, juan, 'COMANDANTE'), stateBefore.f3Crew);
  assert.ok(count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'CREW_ITINERARY_REVIEW' AND id_vuelos=${f3}`) >= 1, 'Operaciones recibe el aviso');
  assert.equal(audit(f3, 'FLIGHT_CREW', 'ITINERARY_REVIEW_REQUIRED'), 1, 'la incidencia queda auditada');
  const crewView = await ok(`/flights/${f3}/crew`, { token: co.token }); const juanRow = crewView.find((r) => r.userId === juan.id);
  assert.equal(juanRow.elegibilidadCodigo, 'ITINERARIO_INCOHERENTE'); assert.match(juanRow.elegibilidadMotivo, /Se encuentra en Tucumán/);
  assert.equal(crewRows(f1, juan, 'COPILOTO'), 1, 'la participación en el vuelo cancelado se conserva como historial');
  list = await candidates(f3, 'COMANDANTE'); assert.ok(!names(list.ordinarios).includes(maria.name), 'María ya no estará en Córdoba: la ubicación futura se recalcula');
  pass('caso 8: al cancelarse el primer vuelo se reevalúan los posteriores: Operaciones recibe el aviso, la incidencia queda auditada, la asignación se señala como ITINERARIO_INCOHERENTE y nada se elimina en silencio');

  // ---------- Casos 9 a 14: personal sanitario del DTS ----------
  const usersBeforeStaff = count('SELECT COUNT(*) FROM usuarios'), loginsBefore = count('SELECT COUNT(*) FROM usuarios_roles');
  const dniDoc = '31' + String(Date.now()).slice(-6), dniNurse = '32' + String(Date.now()).slice(-6), dniNurse2 = '33' + String(Date.now()).slice(-6);
  const doctor = await created201('/health-staff', { method: 'POST', token: dts1.token, body: { nombre: 'Juan', apellido: 'Pérez' + TAG, dni: dniDoc, tipoProfesional: 'MEDICO', matricula: 'MP-' + MARK } });
  const nurse = await created201('/health-staff', { method: 'POST', token: dts1.token, body: { nombre: 'Laura', apellido: 'Díaz' + TAG, dni: dniNurse, tipoProfesional: 'ENFERMERO', matricula: 'ME-' + MARK } });
  const nurse2 = await created201('/health-staff', { method: 'POST', token: dts1.token, body: { nombre: 'Pedro', apellido: 'López' + TAG, dni: dniNurse2, tipoProfesional: 'ENFERMERO', matricula: 'ME2-' + MARK } });
  assert.equal(doctor.tipoProfesional, 'MEDICO'); assert.equal(nurse.tipoProfesional, 'ENFERMERO'); assert.equal(doctor.activo, true);
  assert.equal(count('SELECT COUNT(*) FROM usuarios'), usersBeforeStaff, 'registrar médicos y enfermeros no crea usuarios, contraseñas ni roles'); assert.equal(count('SELECT COUNT(*) FROM usuarios_roles'), loginsBefore);
  assert.equal(count(`SELECT COUNT(*) FROM personal_sanitario s JOIN personas p ON p.id_personas=s.id_personas WHERE p.dni IN ('${dniDoc}','${dniNurse}','${dniNurse2}') AND s.id_usuario_dts=${dts1.id}`), 3);
  assert.equal(count(`SELECT COUNT(*) FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE p.dni IN ('${dniDoc}','${dniNurse}')`), 0);
  await call('/health-staff', { method: 'POST', token: dts1.token, body: { nombre: 'Otro', apellido: 'Nombre', dni: dniDoc, tipoProfesional: 'MEDICO', matricula: 'X' + MARK }, expect: [409] });     // misma identidad con otro nombre
  await call('/health-staff', { method: 'POST', token: dts1.token, body: { nombre: 'Juan', apellido: 'Pérez' + TAG, dni: dniDoc, tipoProfesional: 'MEDICO', matricula: 'OTRA' }, expect: [409] }); // ya registrado
  await call('/health-staff', { method: 'POST', token: dts1.token, body: { nombre: 'Falta', apellido: 'Datos', dni: '12345678', tipoProfesional: 'CAMILLERO', matricula: 'X' }, expect: [400] });
  await call('/health-staff', { method: 'POST', token: dts1.token, body: { nombre: 'Extra', apellido: 'Campo', dni: '12345679', tipoProfesional: 'MEDICO', matricula: 'X', organismoEmisor: 'ANAC' }, expect: [400] });
  const mineStaff = await ok('/health-staff', { token: dts1.token }); assert.ok(mineStaff.filter((s) => [doctor.id, nurse.id, nurse2.id].includes(s.id)).length === 3);
  assert.deepEqual(await ok('/health-staff', { token: dts2.token }), [], 'otro DTS no ve el catálogo ajeno');
  for (const who of [co, ops, maria, { token: admin }]) await call('/health-staff', { token: who.token, expect: [403] });
  await call(`/health-staff/${doctor.id}`, { method: 'PUT', token: dts2.token, body: { nombre: 'Juan', apellido: 'Pérez' + TAG, dni: dniDoc, tipoProfesional: 'MEDICO', matricula: 'MP-HACK', version: doctor.version }, expect: [404] });
  await call(`/health-staff/${doctor.id}`, { method: 'PUT', token: co.token, body: { nombre: 'Juan', apellido: 'Pérez' + TAG, dni: dniDoc, tipoProfesional: 'MEDICO', matricula: 'MP-HACK', version: doctor.version }, expect: [403] });
  const edited = await ok(`/health-staff/${doctor.id}`, { method: 'PUT', token: dts1.token, body: { nombre: 'Juan', apellido: 'Pérez' + TAG, dni: dniDoc, tipoProfesional: 'MEDICO', matricula: 'MP-2-' + MARK, version: doctor.version } });
  assert.equal(edited.matricula, 'MP-2-' + MARK); assert.ok(count("SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'HEALTH_STAFF' AND operacion=N'UPDATE'") >= 1);
  await call(`/health-staff/${doctor.id}`, { method: 'PUT', token: dts1.token, body: { nombre: 'Juan', apellido: 'Pérez' + TAG, dni: dniDoc, tipoProfesional: 'MEDICO', matricula: 'MP-3', version: doctor.version }, expect: [409] });   // versión vieja
  pass('casos 9 a 13: DTS registra médicos y enfermeros con pocos datos (sin documentos), sin usuarios/contraseñas/roles; cada DTS ve sólo los suyos; CO, Operaciones, comandantes y Administración reciben 403; otro DTS recibe 404; datos extra, tipo inválido, identidad conflictiva y duplicados se rechazan');

  const flightOfDts = f3;                                                                       // vuelo PLANIFICADO solicitado por dts1
  const solicited = await request(yerbaBuena, carlosPaz, at(nextDay(), 10));
  const early = await call(`/flights/${solicited}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: doctor.id }, expect: [409] });
  assert.equal(early.data.code, 'STAFF_FLIGHT_NOT_CONFIRMED', 'no se asigna personal antes de acordar el horario; tampoco hizo falta para crear la solicitud');
  const a1 = await created201(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: doctor.id } });
  const a2 = await created201(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: nurse.id } });
  assert.equal(a1.tipoProfesional, 'MEDICO'); assert.equal(a2.tipoProfesional, 'ENFERMERO');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_personal_sanitario WHERE id_vuelos=${flightOfDts} AND fecha_baja IS NULL`), 2);
  await call(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: doctor.id }, expect: [409] });         // duplicado
  await call(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: dts2.token, body: { personalSanitarioId: nurse2.id }, expect: [403] });         // otro DTS
  await call(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: co.token, body: { personalSanitarioId: nurse2.id }, expect: [403] });           // CO no decide quién va
  await call(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: admin, body: { personalSanitarioId: nurse2.id }, expect: [403] });             // Administración tampoco
  const cands = await ok(`/flights/${flightOfDts}/health-staff/candidates`, { token: dts1.token }); assert.ok(cands.some((c) => c.id === nurse2.id && c.disponible) && !cands.some((c) => c.id === doctor.id));
  const asCo = await ok(`/flights/${flightOfDts}/health-staff`, { token: co.token }); assert.equal(asCo.length, 2); assert.ok(asCo.every((x) => x.dni === undefined), 'Operaciones no recibe el DNI');
  const asCommander = await ok(`/flights/${flightOfDts}/health-staff`, { token: juan.token }); assert.equal(asCommander.length, 2);
  await call(`/flights/${flightOfDts}/health-staff`, { token: maria.token, expect: [403] });          // ni María ni nadie ajeno al vuelo
  await call(`/flights/${flightOfDts}/health-staff`, { token: dts2.token, expect: [403] });
  assert.equal(audit(flightOfDts, 'FLIGHT_HEALTH_STAFF', 'CREATE'), 2);
  // sustitución y retiro con historial
  const swapped = await ok(`/flights/${flightOfDts}/health-staff/${a2.id}`, { method: 'PUT', token: dts1.token, body: { personalSanitarioId: nurse2.id } });
  assert.equal(swapped.personalSanitarioId, nurse2.id);
  assert.equal(one(`SELECT motivo_baja FROM vuelos_personal_sanitario WHERE id_vuelos_personal_sanitario=${a2.id}`), 'REEMPLAZO');
  await call(`/flights/${flightOfDts}/health-staff/${a2.id}`, { method: 'DELETE', token: dts1.token, expect: [409] });         // ya sustituida
  await call(`/flights/${flightOfDts}/health-staff/${a1.id}`, { method: 'DELETE', token: dts2.token, expect: [403] });
  await call(`/flights/${flightOfDts}/health-staff/${a1.id}`, { method: 'DELETE', token: dts1.token, expect: [204] });
  assert.equal(one(`SELECT motivo_baja FROM vuelos_personal_sanitario WHERE id_vuelos_personal_sanitario=${a1.id}`), 'RETIRO');
  const history = await ok(`/flights/${flightOfDts}/health-staff?history=true`, { token: dts1.token }); assert.equal(history.length, 3); assert.equal(history.filter((h) => h.vigente).length, 1);
  await created201(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: doctor.id } });                      // se puede volver a asignar
  // el profesional asignado no puede desactivarse; el liberado sí, y conserva su historial
  await call(`/health-staff/${doctor.id}/active`, { method: 'POST', token: dts1.token, body: { activo: false, version: edited.version }, expect: [409] });
  const nurseNow = (await ok('/health-staff', { token: dts1.token })).find((s) => s.id === nurse.id);
  const off = await ok(`/health-staff/${nurse.id}/active`, { method: 'POST', token: dts1.token, body: { activo: false, version: nurseNow.version } });
  assert.equal(off.activo, false); assert.equal(count(`SELECT COUNT(*) FROM vuelos_personal_sanitario WHERE id_personal_sanitario=${nurse.id}`), 1, 'su participación histórica no se borra');
  assert.ok(!(await ok('/health-staff', { token: dts1.token })).some((s) => s.id === nurse.id), 'sale del listado activo'); assert.ok((await ok('/health-staff?inactivos=true', { token: dts1.token })).some((s) => s.id === nurse.id));
  await call(`/flights/${flightOfDts}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: nurse.id }, expect: [409] });         // desactivado
  // simultaneidad: el mismo profesional no puede estar en dos vuelos que se superponen
  const overlapping = await approved(yerbaBuena, carlosPaz, at(D1, 15), matienzo, taravella);
  const clashStaff = await call(`/flights/${overlapping}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: doctor.id }, expect: [409] });
  assert.equal(clashStaff.data.code, 'STAFF_TIME_CONFLICT');
  pass('casos 11 y 12: DTS elige sus médicos y enfermeros para un vuelo confirmado; no hay duplicados ni asignaciones simultáneas; CO, Administración y otros DTS no pueden decidirlo; CO y el comandante principal lo ven (sin DNI); sustituir/retirar/desactivar conserva el historial');

  // ---------- Caso 14: persistencia ----------
  const reloaded = await ok(`/flights/${flightOfDts}/health-staff`, { token: dts1.token });
  assert.deepEqual(reloaded.map((r) => r.personalSanitarioId).sort(), [doctor.id, nurse2.id].sort());
  assert.equal(commanderOf(f3), String(juan.id)); assert.equal(crewRows(f1, juan, 'COPILOTO'), 1);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_personal_sanitario WHERE id_vuelos=${flightOfDts}`), 4);
  pass('caso 14: comandante, copiloto y personal sanitario siguen registrados al volver a consultar y en SQL Server');

  // ---------- Caso 15: flujo completo ----------
  const D3 = nextDay();
  const m2 = await createUser(admin, 'COMANDANTE', 'smaria2'), j2 = await createUser(admin, 'COMANDANTE', 'sjuan2');
  await locate(m2, tuc); await locate(j2, tuc);
  const flow = await approved(yerbaBuena, carlosPaz, at(D3, 10), matienzo, taravella);
  await putCommander(flow, m2); await addCopilot(flow, j2);
  const planeFlow = await newPlane(matienzo); assert.equal((await putAircraft(flow, planeFlow)).data.estadoVuelo, 'PLANIFICADO');
  const flowDoctor = await created201(`/flights/${flow}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: doctor.id } });
  assert.equal(flowDoctor.vigente, true, 'DTS selecciona personal en el estado permitido (horario acordado)');
  await created201(`/flights/${flow}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: nurse2.id } });
  assert.equal(stateOf(flow), 'PLANIFICADO');
  assert.equal((await plan(flow, m2, matienzo, taravella, 3)).status, 200);
  const route = await approveRoute(flow, m2.token, co.token); assert.equal(route.estado, 'APROBADA');
  await call(`/flights/${flow}/route`, { method: 'PUT', token: j2.token, body: { version: 1, recorrido: 'Intento del copiloto' }, expect: [403, 409] });
  assert.equal((await ok(`/flights/${flow}/start`, { method: 'POST', token: co.token })).estadoVuelo, 'EN_CURSO');
  await call(`/flights/${flow}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: nurse2.id }, expect: [409] });
  const locked = await call(`/flights/${flow}/health-staff`, { method: 'POST', token: dts1.token, body: { personalSanitarioId: nurse.id }, expect: [409] }); assert.ok(['STAFF_FLIGHT_LOCKED', 'STAFF_INACTIVE'].includes(locked.data.code));
  assert.equal(provinceOf(m2), String(tuc.id), 'durante el vuelo la ubicación actual todavía es la anterior');
  assert.equal((await ok(`/flights/${flow}/finish`, { method: 'POST', token: co.token })).estadoVuelo, 'FINALIZADO');
  assert.equal(provinceOf(m2), String(cba.id), 'al aterrizar el comandante queda en la jurisdicción de llegada'); assert.equal(provinceOf(j2), String(cba.id), 'el copiloto también');
  assert.equal(audit(flow, 'COMMANDER_PROFILE', 'UPDATE_LOCATION_AFTER_FINISH'), 2);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_personal_sanitario WHERE id_vuelos=${flow} AND fecha_baja IS NULL`), 2, 'el personal sanitario queda como parte del historial del vuelo');
  assert.equal(crewRows(flow, m2, 'COMANDANTE'), 1); assert.equal(crewRows(flow, j2, 'COPILOTO'), 1);
  await call(`/flights/${flow}/crew/${one(`SELECT id_vuelos_tripulantes FROM vuelos_tripulantes WHERE id_vuelos=${flow} AND id_usuarios=${j2.id}`)}`, { method: 'DELETE', token: co.token, expect: [400, 409] });
  pass('caso 15: DTS solicita → CO acuerda y asigna comandante, copiloto y aeronave → DTS elige médico y enfermero → el comandante planifica y la ruta se aprueba → inicio y fin; el copiloto no planifica, al aterrizar ambos quedan en la jurisdicción de llegada y todo persiste en SQL Server');

  console.log(`\n${passed} comprobaciones superadas (${MARK})`);
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
