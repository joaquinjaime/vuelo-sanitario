/* E2E de los requisitos del comandante (clasificación administrativa y habilitación) frente a la asignación desde Centro de Operaciones,
 * sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e). Reproduce el caso de un comandante ubicado en la provincia
 * correcta pero sin clasificación administrativa ni habilitación (usuario "Lopez, Maria"):
 *  1  comandante en Tucumán con todo lo requerido y disponible: se selecciona y se asigna (aeropuerto de salida sólo propuesto)
 *  2  comandante en Tucumán sin clasificación: no se asigna y el sistema explica cada requisito pendiente, quién lo resuelve y cómo
 *  3  el administrador gestiona la clasificación y la habilitación por el procedimiento legítimo: queda persistido, auditado y las consultas lo reflejan
 *  4  clasificación retirada, para otra función o habilitación sin verificar: no se asigna, cada estado con su motivo; sólo el administrador puede regularizarlo
 *  5  comandante de otra provincia: se mantienen la restricción geográfica y la excepción autorizada
 *  6  aeropuerto propuesto: la selección es preliminar y se revalida al confirmar
 *  7  asignación completa: comandante + aeronave persistidos, el vuelo queda PLANIFICADO y continúa (el comandante confirma los aeropuertos)
 * Sólo crea registros marcados. Uso: node scripts/e2e-requisitos-comandante.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, BASE, PDF, sql, one, count, call, ok, fmt, createUser, provision, ensureCredentialPolicies, waitHealthy } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const DAY = 86400000;
let dayCursor = 5200 + Math.floor(Math.random() * 1200);
const nextSlot = () => { const d = new Date(Date.now() + (dayCursor += 4) * DAY); d.setHours(10, 0, 0, 0); return d; };
const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const resourcesOf = (id) => one(`SELECT CONCAT(ISNULL(CAST(id_usuario_comandante AS varchar(20)),'-'),'|',ISNULL(CAST(id_aeronaves AS varchar(20)),'-')) FROM vuelos WHERE id_vuelos=${id}`);
const airportsOf = (id) => one(`SELECT CONCAT(ISNULL(CAST(id_aeropuerto_origen AS varchar(20)),'-'),':',ISNULL(estado_aeropuerto_origen,'-'),'|',ISNULL(CAST(id_aeropuerto_destino AS varchar(20)),'-'),':',ISNULL(estado_aeropuerto_destino,'-')) FROM vuelos WHERE id_vuelos=${id}`);
const qualificationRows = (user, code, state) => count(`SELECT COUNT(*) FROM clasificaciones_tripulacion c JOIN roles_tripulacion r ON r.id_roles_tripulacion=c.id_roles_tripulacion WHERE c.id_usuarios=${user.id} AND r.codigo_rol_tripulacion=N'${code}'${state === 'vigente' ? ' AND c.fecha_baja IS NULL' : state === 'retirada' ? ' AND c.fecha_baja IS NOT NULL' : ''}`);
const auditQualification = (op, user) => count(`SELECT COUNT(*) FROM eventos_auditoria a JOIN clasificaciones_tripulacion c ON c.id_clasificaciones_tripulacion=a.entidad_id WHERE a.tipo_entidad=N'CREW_QUALIFICATION' AND a.operacion=N'${op}' AND c.id_usuarios=${user.id}`);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'));
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  await ensureCredentialPolicies(admin);

  const provinces = await ok('/catalogs/provinces', { token: admin });
  const prov = (name) => provinces.find((x) => x.nombre === name);
  const tuc = prov('Tucumán'), cba = prov('Córdoba');
  const airportsOfProvince = (p) => ok('/catalogs/airports?provinceId=' + p.id, { token: admin });
  const aTuc = await airportsOfProvince(tuc), aCba = await airportsOfProvince(cba);
  const matienzo = aTuc.find((a) => /MATIENZO/i.test(a.nombre)); assert.ok(matienzo, 'Aeropuerto Teniente Benjamín Matienzo'); const taravella = aCba.find((a) => /TARAVELLA/i.test(a.nombre)) || aCba[0];
  const loc = async (p, q) => { const rows = await ok(`/catalogs/localities?provinceId=${p.id}&q=${encodeURIComponent(q)}`, { token: admin }); assert.ok(rows.length); return rows[0]; };
  const yerbaBuena = await loc(tuc, 'Yerba Buena'), carlosPaz = await loc(cba, 'Villa Carlos Paz');

  const co = await createUser(admin, 'CENTRO_OPERACIONES', 'rco'), ops = await createUser(admin, 'OPERACIONES', 'rop'), dts = await createUser(admin, 'DTS', 'rdts');
  const cmd = {};
  for (const n of ['OK', 'SIN', 'RET', 'OTRA', 'PEND', 'CBA']) cmd[n] = await createUser(admin, 'COMANDANTE', 'rq' + n);
  const locate = (user, p) => call(`/commanders/${user.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: p.id, motivo: 'E2E ' + MARK } });
  for (const n of ['OK', 'SIN', 'RET', 'OTRA', 'PEND']) await locate(cmd[n], tuc); await locate(cmd.CBA, cba);
  let plateSeq = 0; const newPlane = async (airport) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'Q' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airport.id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const request = async (originLocality, destinationLocality, slot) => {
    const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Requisitos', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
    const f = await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: originLocality.id, localidadDestinoId: destinationLocality.id, priorityCode: priority, motivoVuelo: 'Requisitos ' + MARK, fechaSolicitada: fmt(slot), extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
    return f.id;
  };
  const approved = async (slot = nextSlot()) => { const id = await request(yerbaBuena, carlosPaz, slot); await ok(`/flights/${id}/schedule/accept`, { method: 'POST', token: co.token }); return id; };
  const candidates = (id) => ok(`/flights/${id}/commander-candidates?q=${encodeURIComponent(MARK)}`, { token: co.token });
  const names = (list) => list.map((x) => x.username);
  const blocked = (list, user) => list.noElegiblesEnJurisdiccion.find((x) => x.username === user.name);
  const missingCodes = (c) => c.requisitosFaltantes.map((r) => r.codigo);
  const putCommander = (id, c, extra = {}, token = co.token, expect = [200]) => call(`/flights/${id}/commander`, { method: 'PUT', token, body: { comandanteId: c.id, ...extra }, expect });
  const putAircraft = (id, plane, expect = [200]) => call(`/flights/${id}/assigned-aircraft`, { method: 'PUT', token: co.token, body: { aircraftId: plane.id }, expect });
  const listRequirements = (user, token = admin, expect = [200], role = 'COMANDANTE') => call(`/crew-qualifications/${user.id}/requirements?role=${role}`, { token, expect });
  const credentialDraft = async (user, verify) => {
    const credential = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'COMANDANTE', type: 'Documento de prueba', number: 'E2E-' + user.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
    const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
    const up = await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form }); assert.equal(up.status, 200);
    if (verify) await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
    return credential;
  };

  // Estados de los comandantes: OK completo; SIN como "Lopez, Maria" (rol, licencia y ubicación, sin clasificación ni habilitación); RET clasificación retirada;
  // OTRA clasificado sólo como copiloto; PEND clasificado con habilitación cargada pero sin verificar; CBA completo pero en Córdoba.
  await provision(admin, cmd.OK); await provision(admin, cmd.CBA);
  await provision(admin, cmd.RET); await call(`/crew-qualifications/${cmd.RET.id}/COMANDANTE?motivo=${encodeURIComponent('Licencia suspendida por el organismo')}`, { method: 'DELETE', token: admin, expect: [204] });
  await call(`/crew-qualifications/${cmd.OTRA.id}/COPILOTO`, { method: 'PUT', token: admin, expect: [204] }); await credentialDraft(cmd.OTRA, true);
  await call(`/crew-qualifications/${cmd.PEND.id}/COMANDANTE`, { method: 'PUT', token: admin, expect: [204] }); await credentialDraft(cmd.PEND, false);
  assert.equal(qualificationRows(cmd.SIN, 'COMANDANTE'), 0, 'SIN no tiene ninguna clasificación (igual que Lopez, Maria)');
  assert.equal(count(`SELECT COUNT(*) FROM habilitaciones_profesionales h JOIN usuarios u ON u.id_personas=h.id_personas WHERE u.id_usuarios=${cmd.SIN.id}`), 0, 'SIN no tiene ninguna habilitación');
  pass('fixtures: seis comandantes en Tucumán/Córdoba — completo, sin clasificación ni habilitación (caso Lopez), con la clasificación retirada, clasificado sólo como copiloto, con la habilitación sin verificar y completo pero en otra provincia');

  // ---------- el vuelo: aeropuerto de salida sólo PROPUESTO (Matienzo), sin confirmación del comandante ----------
  const F = await approved();
  await call(`/flights/${F}/airports`, { method: 'PUT', token: co.token, body: { origenId: matienzo.id, destinoId: taravella.id } });
  assert.equal(airportsOf(F), `${matienzo.id}:PROPUESTO|${taravella.id}:PROPUESTO`);
  let list = await candidates(F);
  assert.equal(list.salida.fuente, 'AEROPUERTO_PROPUESTO'); assert.equal(list.salida.preliminar, true); assert.equal(list.salida.provincia, tuc.nombre);

  // ---------- Prueba 1 / 6: completo y disponible, con el aeropuerto todavía propuesto ----------
  assert.ok(names(list.ordinarios).includes(cmd.OK.name), 'el comandante completo de Tucumán es elegible aunque el aeropuerto aún no esté confirmado');
  assert.equal(list.ordinarios.find((x) => x.username === cmd.OK.name).requisitosFaltantes.length, 0);
  pass('pruebas 1 y 6: el comandante de Tucumán con todos los requisitos es candidato ordinario con el aeropuerto de salida propuesto (selección preliminar), sin exigir la confirmación previa del comandante');

  // ---------- Prueba 2: el caso Lopez, Maria ----------
  const sin = blocked(list, cmd.SIN); assert.ok(sin, 'SIN aparece en "En la jurisdicción, pero no disponibles"');
  assert.equal(sin.codigoOperativo, 'CLASIFICACION_INCOMPATIBLE'); assert.match(sin.motivoOperativo, /No tiene registrada la clasificación administrativa/);
  assert.deepEqual(missingCodes(sin).sort(), ['CLASIFICACION', 'HABILITACION'], 'se informan todos los requisitos pendientes, no sólo el primero');
  const sinClass = sin.requisitosFaltantes.find((r) => r.codigo === 'CLASIFICACION'); assert.equal(sinClass.estado, 'NO_REGISTRADA'); assert.equal(sinClass.resuelve, 'ADMINISTRADOR'); assert.match(sinClass.procedimiento, /Clasificación administrativa de tripulación/);
  const sinCred = sin.requisitosFaltantes.find((r) => r.codigo === 'HABILITACION'); assert.equal(sinCred.estado, 'HABILITACION_AUSENTE'); assert.match(sinCred.procedimiento, /Habilitaciones/);
  assert.equal(sin.provincia, tuc.nombre, 'la ubicación es correcta: el bloqueo no es geográfico');
  const refused = await putCommander(F, cmd.SIN, {}, co.token, [409]); assert.equal(refused.data.code, 'CLASIFICACION_INCOMPATIBLE'); assert.equal(resourcesOf(F), '-|-', 'no queda asignado');
  const refusedByOps = await putCommander(F, cmd.SIN, {}, ops.token, [409, 403]); assert.equal(resourcesOf(F), '-|-');
  pass('prueba 2: el comandante de Tucumán sin clasificación no se puede asignar (409) y la respuesta lista la clasificación y la habilitación pendientes con quién las resuelve y el procedimiento; la ubicación sigue siendo correcta');

  // ---------- Prueba 4: otros estados no válidos ----------
  const ret = blocked(list, cmd.RET); assert.equal(ret.requisitosFaltantes.find((r) => r.codigo === 'CLASIFICACION').estado, 'RETIRADA'); assert.match(ret.motivoOperativo, /fue retirada.*Licencia suspendida por el organismo/);
  const otra = blocked(list, cmd.OTRA); assert.equal(otra.requisitosFaltantes.find((r) => r.codigo === 'CLASIFICACION').estado, 'OTRA_FUNCION'); assert.match(otra.motivoOperativo, /Copiloto/);
  const pend = blocked(list, cmd.PEND); assert.deepEqual(missingCodes(pend), ['HABILITACION']); assert.equal(pend.requisitosFaltantes[0].estado, 'HABILITACION_NO_VERIFICADA'); assert.equal(pend.codigoOperativo, 'HABILITACION_NO_VERIFICADA');
  for (const c of [cmd.RET, cmd.OTRA, cmd.PEND]) { const r = await putCommander(F, c, {}, co.token, [409]); assert.ok(r.data.code); assert.equal(resourcesOf(F), '-|-'); }
  pass('prueba 4: clasificación retirada (con fecha y motivo), clasificación para otra función y habilitación sin verificar no se asignan; cada estado muestra su propio motivo');

  // ---------- permisos de la consulta y de la gestión ----------
  const seen = await listRequirements(cmd.SIN); assert.equal(seen.data.elegible, false); assert.equal(seen.data.faltantes, 2); assert.equal(seen.data.provinciaOperativa, tuc.nombre);
  assert.deepEqual(seen.data.requisitos.filter((r) => !r.cumplido).map((r) => r.codigo).sort(), ['CLASIFICACION', 'HABILITACION']);
  assert.deepEqual(seen.data.requisitos.filter((r) => r.cumplido).map((r) => r.codigo).sort(), ['CUENTA_ACTIVA', 'INFORME_FINAL', 'LICENCIA', 'POLITICA', 'ROL_ACCESO']);
  for (const [who, token] of [['CO', co.token], ['OPERACIONES', ops.token], ['DTS', dts.token], ['el propio comandante', cmd.SIN.token]]) { await listRequirements(cmd.SIN, token, [403]); await call(`/crew-qualifications/requirements/commanders`, { token, expect: [403] }); await call(`/crew-qualifications/${cmd.SIN.id}/COMANDANTE`, { method: 'PUT', token, expect: [403] }); }
  await listRequirements(cmd.SIN, admin, [400], 'PILOTO_INEXISTENTE');
  assert.equal(qualificationRows(cmd.SIN, 'COMANDANTE'), 0, 'nadie fuera de Administración pudo clasificar');
  const pending = (await ok(`/crew-qualifications/requirements/commanders?q=${MARK}&size=100`, { token: admin }));
  assert.ok(names(pending).includes(cmd.SIN.name) && names(pending).includes(cmd.PEND.name) && !names(pending).includes(cmd.OK.name), 'el listado de pendientes incluye a quienes no cumplen y excluye al completo');
  const everyone = await ok(`/crew-qualifications/requirements/commanders?q=${MARK}&pendientes=false&size=100`, { token: admin }); assert.ok(names(everyone).includes(cmd.OK.name) && everyone.find((x) => x.username === cmd.OK.name).elegible === true);
  pass('administración consulta los requisitos de cada comandante y el listado de pendientes; CO, OPERACIONES, DTS y el propio comandante reciben 403 y no pueden clasificar (nadie se autohabilita); una función inexistente devuelve 400');

  // ---------- Prueba 3: el administrador regulariza por el procedimiento legítimo ----------
  await call(`/crew-qualifications/${cmd.SIN.id}/COMANDANTE`, { method: 'PUT', token: admin, expect: [204] });
  assert.equal(qualificationRows(cmd.SIN, 'COMANDANTE', 'vigente'), 1); assert.equal(auditQualification('CREATE', cmd.SIN), 1);
  await call(`/crew-qualifications/${cmd.SIN.id}/COMANDANTE`, { method: 'PUT', token: admin, expect: [204] }); assert.equal(qualificationRows(cmd.SIN, 'COMANDANTE'), 1, 'clasificar dos veces no duplica');
  let afterClass = await listRequirements(cmd.SIN); assert.deepEqual(afterClass.data.requisitos.filter((r) => !r.cumplido).map((r) => r.codigo), ['HABILITACION'], 'queda sólo la habilitación');
  list = await candidates(F); assert.deepEqual(missingCodes(blocked(list, cmd.SIN)), ['HABILITACION']); await putCommander(F, cmd.SIN, {}, co.token, [409]);
  const credential = await credentialDraft(cmd.SIN, false);
  afterClass = await listRequirements(cmd.SIN); assert.equal(afterClass.data.requisitos.find((r) => r.codigo === 'HABILITACION').estado, 'HABILITACION_NO_VERIFICADA');
  await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
  const done = await listRequirements(cmd.SIN); assert.equal(done.data.elegible, true); assert.equal(done.data.faltantes, 0);
  list = await candidates(F); assert.ok(names(list.ordinarios).includes(cmd.SIN.name), 'la elegibilidad refleja la regularización');
  assert.ok(!names(await ok(`/crew-qualifications/requirements/commanders?q=${MARK}`, { token: admin })).includes(cmd.SIN.name), 'ya no figura entre los pendientes');
  // retirar y volver a clasificar conserva el historial
  await call(`/crew-qualifications/${cmd.RET.id}/COMANDANTE`, { method: 'PUT', token: admin, expect: [204] });
  assert.equal(qualificationRows(cmd.RET, 'COMANDANTE', 'retirada'), 1, 'la baja anterior se conserva'); assert.equal(qualificationRows(cmd.RET, 'COMANDANTE', 'vigente'), 1);
  list = await candidates(F); assert.ok(names(list.ordinarios).includes(cmd.RET.name));
  pass('prueba 3: el administrador clasifica (idempotente, auditado), verifica la habilitación y las consultas de requisitos y de candidatos reflejan cada paso; volver a clasificar conserva el historial del retiro');

  // ---------- Prueba 5: otra provincia ----------
  assert.ok(!names(list.ordinarios).includes(cmd.CBA.name)); const cbaCandidate = list.excepcionales.find((x) => x.username === cmd.CBA.name); assert.equal(cbaCandidate.codigoUbicacion, 'OTRA_PROVINCIA'); assert.equal(cbaCandidate.elegibilidad, 'EXCEPCION');
  const outside = await putCommander(F, cmd.CBA, {}, co.token, [409]); assert.equal(outside.data.code, 'COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION'); assert.equal(resourcesOf(F), '-|-');
  pass('prueba 5: un comandante completo ubicado en Córdoba no se asigna ordinariamente (409) y sólo figura como excepción geográfica; la regularización de requisitos no altera la regla provincial');

  // ---------- Prueba 7: asignación completa y continuidad del vuelo ----------
  await putCommander(F, cmd.SIN);
  assert.equal(resourcesOf(F).split('|')[0], String(cmd.SIN.id)); assert.equal(stateOf(F), 'NULL', 'con el comandante reservado y sin aeronave el vuelo todavía no cambia de estado');
  const plane = await newPlane(matienzo); await putAircraft(F, plane);
  assert.equal(stateOf(F), 'PLANIFICADO'); assert.equal(resourcesOf(F), `${cmd.SIN.id}|${plane.id}`);
  assert.equal(airportsOf(F), `${matienzo.id}:PROPUESTO|${taravella.id}:PROPUESTO`, 'asignar no confirma los aeropuertos: los confirma el comandante');
  const llegada = fmt(new Date(new Date(one(`SELECT CONVERT(varchar(19),fecha_planificada_salida,126) FROM vuelos WHERE id_vuelos=${F}`) + 'Z').getTime() + 3 * 3600000 + new Date().getTimezoneOffset() * 60000)).slice(0, 16);
  await call(`/flights/${F}/operational-planning`, { method: 'POST', token: cmd.SIN.token, body: { origenId: matienzo.id, destinoId: taravella.id, llegada }, expect: [200] });
  assert.equal(airportsOf(F), `${matienzo.id}:CONFIRMADO|${taravella.id}:CONFIRMADO`, 'el comandante asignado confirma los aeropuertos y se revalida su jurisdicción');
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${F} AND operacion=N'ASSIGN_FLIGHT_COMMANDER'`) >= 1, true);
  pass('prueba 7: CO reserva al comandante regularizado y la aeronave, el vuelo queda PLANIFICADO con ambos persistidos en SQL Server y el comandante confirma los aeropuertos (revalidación con el aeropuerto confirmado)');

  // ---------- regresión: un vuelo operativo no sanitario y la revalidación al cambiar el aeropuerto ----------
  const G = await approved();
  await call(`/flights/${G}/airports`, { method: 'PUT', token: co.token, body: { origenId: matienzo.id, destinoId: taravella.id } });
  await putCommander(G, cmd.OK);
  const move = await call(`/flights/${G}/airports`, { method: 'PUT', token: co.token, body: { origenId: taravella.id, destinoId: matienzo.id, justificacion: 'Mejor conexión terrestre y clima' }, expect: [409] });
  assert.equal(move.data.code, 'AIRPORT_CHANGE_REQUIRES_COMMANDER_REVALIDATION'); assert.equal(resourcesOf(G).split('|')[0], String(cmd.OK.id), 'el cambio rechazado no desasigna en silencio');
  pass('regresión: cambiar el aeropuerto de salida a otra provincia exige revalidar al comandante asignado y no lo desasigna en silencio');

  console.log(`\nE2E de requisitos del comandante: ${passed} bloques correctos.`);
})().catch((e) => { console.error('FALLO:', e.stack || e.message); process.exit(1); });
