/* E2E de la rectificación controlada del DNI (I-1) sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e, V53+).
 * Backend real en :18080 y SQL Server real. Sólo crea registros marcados; el único objeto temporal es un trigger de prueba que fuerza un fallo de
 * auditoría y que el script elimina siempre. Nunca toca la base habitual. Uso: node scripts/e2e-identidad-dni.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');
let passed = 0;
const pass = (t) => { passed++; console.log('PASS: ' + t); };
const REASON = 'Error de digitación al cargar la solicitud ' + MARK;

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.split(',').includes('e2e'), 'El backend no apunta a la base E2E');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 48);
  assert.equal(count("SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.personas') AND name=N'uq_personas_dni' AND is_unique=1"), 1);
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  pass('base E2E aislada con el índice único uq_personas_dni y backend saludable');

  // ---------- Fixtures ----------
  const admin2 = await createUser(admin, 'ADMINISTRADOR', 'dnia2'), dts = await createUser(admin, 'DTS', 'dnidts'), ops = await createUser(admin, 'CENTRO_OPERACIONES', 'dniops'), ops2 = await createUser(admin, 'OPERACIONES', 'dniops2'), cmd = await createUser(admin, 'COMANDANTE', 'dnicmd');
  const used = new Set(); const newDni = () => { for (;;) { const d = String(60000000 + Math.floor(Math.random() * 30000000)); if (!used.has(d) && count(`SELECT COUNT(*) FROM personas WHERE dni='${d}'`) === 0) { used.add(d); return d; } } };
  const dotted = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  const personDni = (personId) => one(`SELECT ISNULL(dni,'NULL') FROM personas WHERE id_personas=${personId}`);
  const personVersion = (personId) => Number(one(`SELECT version_identidad FROM personas WHERE id_personas=${personId}`));
  const rectifyPath = (patient) => `/patients/${patient.id}/dni`;
  const body = (dni, patient, extra = {}) => ({ dniNuevo: dni, version: personVersion(patient.personId), motivo: REASON, cotejoDocumental: true, ...extra });
  const rectify = (patient, dni, extra = {}, token = admin, expect = [200]) => call(rectifyPath(patient), { method: 'PUT', token, body: body(dni, patient, extra), expect });
  const events = (patient, op = null) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'PATIENT_IDENTITY' AND entidad_id=${patient.id} AND operacion LIKE N'${op || '%_DNI'}'`);
  const patientsOf = (personId) => count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${personId}`);
  const dniP1 = newDni(), dniP2 = newDni();
  const p1 = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Rectifica', apellido: 'Uno' + MARK, dni: dniP1, fechaNacimiento: '1985-04-05' } });
  const p2 = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Rectifica', apellido: 'Dos' + MARK, dni: dniP2, fechaNacimiento: '1990-01-02' } });
  const provinces = await ok('/catalogs/provinces', { token: ops.token }); let localities;
  for (const prov of provinces) { localities = await ok('/catalogs/localities?provinceId=' + prov.id, { token: ops.token }); if (localities.length >= 2) break; }
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const flightBody = (patient, extra = {}) => ({ patient, identidadConfirmada: true, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Rectificación DNI ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Control', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false }, ...extra });
  const F1 = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: p1.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Rectificación DNI ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Control', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  // persona con cuenta activa que además es paciente
  const dniActive = newDni(), userActive = MARK + 'dniact';
  const actCode = await ok('/auth/users', { method: 'POST', token: admin, body: { nombre: 'Cuenta', apellido: 'Activa' + MARK, dni: dniActive, roles: ['DTS'], correos: [{ direccion: userActive + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551234' }] } });
  await call('/auth/activar-cuenta', { method: 'POST', body: { dni: dniActive, codigo: actCode.codigo, username: userActive, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
  const f3 = await ok('/flights/with-patient', { method: 'POST', token: dts.token, body: flightBody({ nombre: 'Cuenta', apellido: 'Activa' + MARK, dni: dniActive }) });
  const p3 = { id: Number(one(`SELECT s.id_pacientes FROM vuelos_sanitarios s WHERE s.id_vuelos=${f3.id}`)), personId: Number(one(`SELECT id_personas FROM personas WHERE dni='${dniActive}'`)) };
  // persona con cuenta pendiente de activación que además es paciente
  const dniPending = newDni(), userPending = MARK + 'dnipen';
  const penCode = await ok('/auth/users', { method: 'POST', token: admin, body: { nombre: 'Cuenta', apellido: 'Pendiente' + MARK, dni: dniPending, roles: ['DTS'], correos: [{ direccion: userPending + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551235' }] } });
  const f4 = await ok('/flights/with-patient', { method: 'POST', token: dts.token, body: flightBody({ nombre: 'Cuenta', apellido: 'Pendiente' + MARK, dni: dniPending }) });
  const p4 = { id: Number(one(`SELECT s.id_pacientes FROM vuelos_sanitarios s WHERE s.id_vuelos=${f4.id}`)), personId: Number(one(`SELECT id_personas FROM personas WHERE dni='${dniPending}'`)) };
  const userSnapshot = (personId) => sql(`SELECT CONCAT(ISNULL(nombre_usuario,'-'),'|',ISNULL(hash_contrasena,'-'),'|',estado_cuenta,'|',CAST(esta_activo AS varchar),'|',CAST(version_credenciales AS varchar),'|',(SELECT STRING_AGG(r.codigo_rol,',') WITHIN GROUP(ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=u.id_usuarios)) FROM usuarios u WHERE id_personas=${personId}`).trim();
  assert.equal(patientsOf(p3.personId), 1); assert.equal(patientsOf(p4.personId), 1); assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE id_personas IN (${p3.personId},${p4.personId})`), 2);
  pass('fixtures: paciente sin cuenta con vuelo, segundo paciente con otro DNI, paciente con cuenta activa y paciente con cuenta pendiente de activación (ambos con vuelo sanitario)');

  // ---------- A: permisos ----------
  const before = { dni: personDni(p1.personId), version: personVersion(p1.personId) }, eventsBefore = count('SELECT COUNT(*) FROM eventos_auditoria');
  for (const who of [dts, ops, ops2, cmd]) await rectify(p1, newDni(), {}, who.token, [403]);
  await call(rectifyPath(p1), { method: 'PUT', body: body(newDni(), p1), expect: [401, 403] });
  assert.equal(personDni(p1.personId), before.dni); assert.equal(personVersion(p1.personId), before.version); assert.equal(count('SELECT COUNT(*) FROM eventos_auditoria'), eventsBefore, 'las denegaciones no auditan');
  pass('A permisos: DTS, Centro de Operaciones, Operaciones, comandante y sesión ausente rechazados; nada cambia en SQL');

  // ---------- B: validación y versión ----------
  const bad = async (extra, expect = [400], patient = p1, dni = newDni()) => { const r = await call(rectifyPath(patient), { method: 'PUT', token: admin, body: { ...body(dni, patient), ...extra }, expect }); return r; };
  await bad({ dniNuevo: dotted(dniP1) }); await bad({ dniNuevo: ` ${dniP1.slice(0, 2)}-${dniP1.slice(2, 5)}-${dniP1.slice(5)} ` }); await bad({ dniNuevo: dniP1 });
  for (const wrong of ['abc', '12A45678', '123456', '1234567890123', '', '   ', '--', '12 3456 7890 123']) await bad({ dniNuevo: wrong });
  assert.equal((await bad({ cotejoDocumental: false })).data.code, 'DNI_COTEJO_REQUIRED'); await bad({ cotejoDocumental: null }); await bad({ cotejoDocumental: undefined });
  for (const motivo of ['', '   ', 'corto', 'x'.repeat(501), null]) await bad({ motivo });
  await bad({ nombre: 'Intruso' }); await bad({ version: undefined });
  await call(rectifyPath(p1), { method: 'PUT', token: admin, expect: [400] });
  await call('/patients/999999999/dni', { method: 'PUT', token: admin, body: body(newDni(), p1), expect: [404] });
  await bad({ version: before.version + 5 }, [409]); await bad({ version: before.version - 1 }, [409]);
  assert.equal(personDni(p1.personId), before.dni); assert.equal(personVersion(p1.personId), before.version); assert.equal(events(p1), 0); assert.equal(count('SELECT COUNT(*) FROM eventos_auditoria'), eventsBefore);
  pass('B validación: formato (8 inválidos), igual al actual en 3 formatos equivalentes, cotejo ausente o falso, motivo vacío/corto/largo, campo desconocido, cuerpo ausente, paciente inexistente y versión vencida (2) rechazados sin modificar la persona ni auditar');

  // ---------- C: rectificación de un paciente sin cuenta ----------
  const patientsBefore = count('SELECT COUNT(*) FROM pacientes'), personsBefore = count('SELECT COUNT(*) FROM personas'), nameBefore = one(`SELECT CONCAT(nombre_persona,'|',apellido_persona,'|',CONVERT(varchar(10),fecha_nacimiento,23)) FROM personas WHERE id_personas=${p1.personId}`);
  const flightsBefore = sql(`SELECT id_vuelos, id_pacientes FROM vuelos_sanitarios WHERE id_pacientes=${p1.id}`);
  const newP1 = newDni(); const done = (await rectify(p1, dotted(newP1))).data;
  assert.equal(done.dni, newP1); assert.equal(done.id, p1.id); assert.equal(done.version, before.version + 1); assert.equal(done.cuentaEstado, null);
  assert.equal(personDni(p1.personId), newP1, 'DNI normalizado'); assert.equal(personVersion(p1.personId), before.version + 1);
  assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore, 'no se crea ni elimina ninguna persona'); assert.equal(count('SELECT COUNT(*) FROM pacientes'), patientsBefore, 'ni ninguna ficha'); assert.equal(patientsOf(p1.personId), 1);
  assert.equal(one(`SELECT id_personas FROM pacientes WHERE id_pacientes=${p1.id}`), String(p1.personId), 'la ficha sigue ligada a la misma persona');
  assert.equal(one(`SELECT CONCAT(nombre_persona,'|',apellido_persona,'|',CONVERT(varchar(10),fecha_nacimiento,23)) FROM personas WHERE id_personas=${p1.personId}`), nameBefore, 'nombre y nacimiento intactos');
  assert.equal(sql(`SELECT id_vuelos, id_pacientes FROM vuelos_sanitarios WHERE id_pacientes=${p1.id}`), flightsBefore, 'el vuelo conserva su ficha');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${F1} AND id_pacientes=${p1.id}`), 1);
  const detail = await ok(`/flights/${F1}`, { token: ops.token }); assert.equal(detail.paciente?.dni ?? detail.vuelo?.datosSanitarios?.paciente?.dni ?? newP1, newP1);
  assert.equal((await ok(`/patients/search?dni=${newP1}`, { token: dts.token })).items[0].id, p1.id, 'la búsqueda usa la identidad corregida');
  assert.equal((await ok(`/patients/search?dni=${dniP1}`, { token: dts.token })).items.length, 0, 'el DNI anterior ya no identifica a nadie');
  assert.equal(events(p1, 'RECTIFY_DNI'), 1);
  const row = sql(`SELECT id_usuario_actor, valores_anteriores, valores_nuevos, id_vuelos FROM eventos_auditoria WHERE tipo_entidad=N'PATIENT_IDENTITY' AND entidad_id=${p1.id} AND operacion=N'RECTIFY_DNI'`).split('|').map((x) => x.trim());
  assert.equal(row[0], String(one(`SELECT u.id_usuarios FROM usuarios u WHERE u.nombre_usuario=N'${dotenv.BOOTSTRAP_ADMIN_USERNAME}'`)), 'responsable = administrador'); assert.equal(row[1], `{"terminacionAnterior":"${dniP1.slice(-4)}"}`);
  assert.ok(row[2].includes(`"terminacionNueva":"${newP1.slice(-4)}"`) && row[2].includes('"cotejoDocumental":true') && row[2].includes(REASON) && row[2].includes(`"personaId":${p1.personId}`));
  for (const dni of [dniP1, newP1]) assert.ok(!row[1].includes(dni) && !row[2].includes(dni), 'la auditoría general no contiene DNI completos');
  assert.equal(row[3], 'NULL', 'evento sin vuelo');
  const audited = (await ok(`/audit?entityType=PATIENT_IDENTITY&entityId=${p1.id}&operation=RECTIFY_DNI`, { token: admin })).items[0]; assert.equal(audited.operationLabel, 'Rectificación de DNI');
  const auditDetail = JSON.stringify(await ok(`/audit/events/${audited.id}`, { token: admin })); assert.ok(!auditDetail.includes(dniP1) && !auditDetail.includes(newP1), 'ni su consulta administrativa');
  const hist = await ok(`/patients/${p1.id}/corrections?page=0&size=10`, { token: admin }); assert.equal(hist.items[0].operacion, 'RECTIFY_DNI'); assert.deepEqual(hist.items[0].cambios[0], { campo: 'dni', anterior: '••••' + dniP1.slice(-4), nuevo: '••••' + newP1.slice(-4) });
  for (const who of [ops, dts]) { const mine = await call('/audit?entityType=PATIENT_IDENTITY', { token: who.token, expect: [403, 200] }); if (mine.status === 200) assert.equal(mine.data.items.length, 0); }
  pass('C rectificación sin cuenta: misma persona, misma ficha y mismo vuelo (SQL), DNI normalizado desde formato con puntos, versión +1, nombre y nacimiento intactos, búsqueda con la identidad corregida, un evento RECTIFY_DNI del administrador con sólo las terminaciones (ni en la consulta de auditoría) e historial enmascarado');

  // ---------- D: DNI ocupado ----------
  const snap = () => `${personDni(p1.personId)}|${personVersion(p1.personId)}|${personDni(p2.personId)}|${personVersion(p2.personId)}|${patientsOf(p1.personId)}|${patientsOf(p2.personId)}|${count('SELECT COUNT(*) FROM personas')}|${count('SELECT COUNT(*) FROM pacientes')}`;
  const sBefore = snap(), eBefore = events(p1) + events(p2);
  for (const taken of [dniP2, dotted(dniP2), ` ${dniP2.slice(0, 2)}-${dniP2.slice(2, 5)}-${dniP2.slice(5)} `]) { const r = await rectify(p1, taken, {}, admin, [409]); assert.equal(r.data.code, 'DNI_ALREADY_REGISTERED'); assert.ok(!JSON.stringify(r.data).includes(dniP2) && !JSON.stringify(r.data).includes('Dos' + MARK), 'no identifica a la otra persona'); }
  await rectify(p1, dniActive, {}, admin, [409]); await rectify(p1, dniPending, {}, admin, [409]);   // también DNI de personas con cuenta
  assert.equal(snap(), sBefore, 'ambas identidades intactas'); assert.equal(events(p1) + events(p2), eBefore);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${F1} AND id_pacientes=${p1.id}`), 1);
  pass('D DNI ocupado: rechazado en 5 variantes (tres formatos equivalentes y los DNI de las dos personas con cuenta) con conflicto controlado que no identifica a la otra persona; ninguna fusión, reasignación, eliminación, cambio de versión ni evento');

  // ---------- E: persona con cuenta activa ----------
  const accountBefore = userSnapshot(p3.personId); const v3 = personVersion(p3.personId);
  const tokenBefore = (await ok('/auth/login', { method: 'POST', body: { username: userActive, password: PASSWORD } })).accessToken;
  assert.equal((await ok(`/patients/${p3.id}`, { token: admin })).cuentaEstado, 'ACTIVO');
  assert.equal((await rectify(p3, newDni(), {}, admin, [400])).data.code, 'DNI_ACCOUNT_CONFIRMATION_REQUIRED'); await rectify(p3, newDni(), { confirmaCuenta: false }, admin, [400]);
  assert.equal(personDni(p3.personId), dniActive); assert.equal(personVersion(p3.personId), v3);
  const newP3 = newDni(); const r3 = (await rectify(p3, newP3, { confirmaCuenta: true })).data; assert.equal(r3.cuentaEstado, 'ACTIVO');
  assert.equal(personDni(p3.personId), newP3); assert.equal(userSnapshot(p3.personId), accountBefore, 'usuario, contraseña, estado, versión de credenciales y roles intactos');
  await ok('/auth/me', { token: tokenBefore }); await ok('/auth/login', { method: 'POST', body: { username: userActive, password: PASSWORD } });
  assert.equal(patientsOf(p3.personId), 1); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${f3.id} AND id_pacientes=${p3.id}`), 1);
  assert.ok(sql(`SELECT valores_nuevos FROM eventos_auditoria WHERE tipo_entidad=N'PATIENT_IDENTITY' AND entidad_id=${p3.id} AND operacion=N'RECTIFY_DNI'`).includes('"cuentaEstado":"ACTIVO"'));
  pass('E cuenta activa: exige la confirmación de la cuenta; tras rectificar, usuario, hash, estado, versión de credenciales y roles son idénticos en SQL, la sesión vigente y el ingreso siguen funcionando y el vuelo conserva su ficha; la auditoría deja el estado de la cuenta');

  // ---------- F: cuenta pendiente de activación (el DNI participa en la activación) ----------
  const pendBefore = userSnapshot(p4.personId); const openBefore = sql(`SELECT a.id_activaciones_cuenta, a.token_hash, ISNULL(CONVERT(varchar(30),a.fecha_utilizacion,121),'-') FROM activaciones_cuenta a JOIN usuarios u ON u.id_usuarios=a.id_usuarios WHERE u.id_personas=${p4.personId}`).trim();
  assert.equal((await ok(`/patients/${p4.id}`, { token: admin })).cuentaEstado, 'PENDIENTE_ACTIVACION');
  const newP4 = newDni(); await rectify(p4, newP4, { confirmaCuenta: true });
  assert.equal(userSnapshot(p4.personId), pendBefore, 'la cuenta pendiente no cambia'); assert.equal(sql(`SELECT a.id_activaciones_cuenta, a.token_hash, ISNULL(CONVERT(varchar(30),a.fecha_utilizacion,121),'-') FROM activaciones_cuenta a JOIN usuarios u ON u.id_usuarios=a.id_usuarios WHERE u.id_personas=${p4.personId}`).trim(), openBefore, 'el código de activación vigente no se toca');
  const old = await call('/auth/activar-cuenta', { method: 'POST', body: { dni: dniPending, codigo: penCode.codigo, username: userPending, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [404] });
  assert.equal(userSnapshot(p4.personId), pendBefore, 'activar con el DNI anterior no activa nada');
  await call('/auth/activar-cuenta', { method: 'POST', body: { dni: newP4, codigo: penCode.codigo, username: userPending, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
  assert.equal(one(`SELECT estado_cuenta FROM usuarios WHERE id_personas=${p4.personId}`), 'ACTIVO'); await ok('/auth/login', { method: 'POST', body: { username: userPending, password: PASSWORD } });
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${f4.id} AND id_pacientes=${p4.id}`), 1);
  pass('F cuenta pendiente: el DNI sólo interviene en la búsqueda de la activación; la cuenta y su código quedan idénticos, el DNI anterior ya no activa (404) y la persona activa su cuenta con el DNI corregido y el mismo código');

  // ---------- G: asignación de un DNI ausente ----------
  const noDni = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Sin', apellido: 'Documento' + MARK } });
  assert.equal(personDni(noDni.personId), 'NULL');
  const assigned = newDni(); const ar = (await rectify(noDni, assigned)).data; assert.equal(ar.dni, assigned);
  assert.equal(events(noDni, 'ASSIGN_DNI'), 1); assert.equal(events(noDni, 'RECTIFY_DNI'), 0); assert.equal(sql(`SELECT valores_anteriores FROM eventos_auditoria WHERE tipo_entidad=N'PATIENT_IDENTITY' AND entidad_id=${noDni.id} AND operacion=N'ASSIGN_DNI'`).trim(), '{"terminacionAnterior":null}');
  assert.equal(patientsOf(noDni.personId), 1); assert.equal((await ok(`/patients/search?dni=${assigned}`, { token: dts.token })).items[0].id, noDni.id);
  pass('G asignación: un paciente sin DNI recibe uno con las mismas exigencias, queda como ASSIGN_DNI sin crear fichas ni personas');

  // ---------- H: concurrencia real en SQL Server ----------
  const p5 = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Carrera', apellido: 'Version' + MARK, dni: newDni() } });
  const [d1, d2] = [newDni(), newDni()], v5 = personVersion(p5.personId);
  const race = await Promise.all([[admin, d1], [admin2.token, d2]].map(([token, dni]) => fetch(require('./e2e-cierre-support.cjs').BASE + rectifyPath(p5), { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ dniNuevo: dni, version: v5, motivo: REASON, cotejoDocumental: true }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))));
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409], 'dos administradores con la misma versión: uno solo prevalece'); assert.equal(race.find((r) => r.status === 409).body.code, 'PATIENT_STALE_IDENTITY');
  assert.ok([d1, d2].includes(personDni(p5.personId))); assert.equal(personVersion(p5.personId), v5 + 1); assert.equal(events(p5), 1);
  // dos fichas distintas hacia el mismo DNI: decide el índice único
  const BASE = require('./e2e-cierre-support.cjs').BASE;
  for (let round = 0; round < 6; round++) {
    const a = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Disputa', apellido: `A${round}` + MARK, dni: newDni() } }), b = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Disputa', apellido: `B${round}` + MARK, dni: newDni() } });
    const target = newDni(), keep = [personDni(a.personId), personDni(b.personId)], vers = [personVersion(a.personId), personVersion(b.personId)];
    const res = await Promise.all([[a, 0], [b, 1]].map(([patient, i]) => fetch(BASE + rectifyPath(patient), { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (i ? admin2.token : admin) }, body: JSON.stringify({ dniNuevo: target, version: vers[i], motivo: REASON, cotejoDocumental: true }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))));
    assert.deepEqual(res.map((r) => r.status).sort(), [200, 409], `ronda ${round}: ${JSON.stringify(res.map((r) => r.status))}`); assert.equal(res.find((r) => r.status === 409).body.code, 'DNI_ALREADY_REGISTERED');
    assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni='${target}'`), 1, 'el DNI queda en una sola persona');
    const loserIdx = res[0].status === 409 ? 0 : 1; const loser = [a, b][loserIdx]; assert.equal(personDni(loser.personId), keep[loserIdx], 'la perdedora no se modifica'); assert.equal(personVersion(loser.personId), vers[loserIdx]); assert.equal(events(loser), 0);
    assert.equal(events(a) + events(b), 1);
  }
  // rectificación contra corrección de nombre simultánea
  const p6 = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Mixta', apellido: 'Carrera' + MARK, dni: newDni() } }), v6 = personVersion(p6.personId);
  const mixed = await Promise.all([
    fetch(BASE + rectifyPath(p6), { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body: JSON.stringify({ dniNuevo: newDni(), version: v6, motivo: REASON, cotejoDocumental: true }) }).then((r) => r.status),
    fetch(BASE + `/patients/${p6.id}/identity`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin2.token }, body: JSON.stringify({ nombre: 'Mixta', apellido: 'Corregida' + MARK, version: v6, motivo: 'Corrección simultánea de apellido' }) }).then((r) => r.status)]);
  assert.deepEqual(mixed.slice().sort(), [200, 409], 'rectificación y corrección de nombre con la misma versión: una sola prevalece'); assert.equal(personVersion(p6.personId), v6 + 1);
  pass('H concurrencia real: dos administradores con la misma versión = 1 éxito y 1 conflicto de versión; 6 rondas de dos fichas hacia el mismo DNI = 1 éxito y 1 conflicto de DNI decidido por el índice único, la perdedora intacta y un solo evento; rectificación contra corrección de nombre = 1 éxito y 1 conflicto');

  // ---------- I: fallo de auditoría = ningún cambio ----------
  const p7 = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Revierte', apellido: 'Auditoria' + MARK, dni: newDni() } }), v7 = personVersion(p7.personId), dni7 = personDni(p7.personId);
  const trig = 'tr_e2e_falla_auditoria_dni_' + MARK;
  sql(`EXEC(N'CREATE TRIGGER dbo.${trig} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE tipo_entidad=N''PATIENT_IDENTITY'' AND entidad_id=${p7.id} AND operacion=N''RECTIFY_DNI'') THROW 51000, N''Fallo de prueba'', 1; END');`);
  try {
    const failed = await call(rectifyPath(p7), { method: 'PUT', token: admin, body: body(newDni(), p7), expect: [500] });
    assert.equal(personDni(p7.personId), dni7, 'sin auditoría no hay cambio de DNI'); assert.equal(personVersion(p7.personId), v7); assert.equal(events(p7), 0);
  } finally { sql(`DROP TRIGGER IF EXISTS dbo.${trig}`); }
  assert.equal(count(`SELECT COUNT(*) FROM sys.triggers WHERE name=N'${trig}'`), 0, 'trigger temporal eliminado');
  await rectify(p7, newDni()); assert.equal(personVersion(p7.personId), v7 + 1); assert.equal(events(p7), 1);
  pass('I atomicidad: con un fallo forzado al insertar la auditoría el DNI y la versión no cambian y no queda ningún evento; sin el fallo la misma operación se aplica');

  // ---------- J: restricciones de SQL Server ----------
  const refuse = (query, label, needle) => assert.throws(() => sql(query), (e) => e.message.toLowerCase().includes(needle), label);
  refuse(`UPDATE personas SET dni='${personDni(p2.personId)}' WHERE id_personas=${p1.personId}`, 'el índice único impide un DNI repetido aunque se salte la aplicación', 'uq_personas_dni');
  refuse(`UPDATE personas SET dni='12A45678' WHERE id_personas=${p1.personId}`, 'la restricción impide caracteres que no sean dígitos', 'ck_personas_dni_solo_digitos');
  assert.equal(personDni(p1.personId), newP1);
  assert.ok(count(`SELECT COUNT(*) FROM personas WHERE dni IN ('${dniP1}')`) === 0, 'el DNI erróneo ya no está en ninguna persona');
  pass('J SQL Server: el índice uq_personas_dni y la restricción de dígitos siguen impidiendo, por sí solos, un DNI repetido o no numérico');

  // ---------- K: la base habitual no se toca ----------
  const habitual = spawnSync('docker', ['exec', 'vuelos-sanitarios-sqlserver-1', 'bash', '-c', 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -C -d vuelos_sanitarios -W -h -1 -Q "SET NOCOUNT ON; SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL"'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(habitual, '47'); pass('K la base habitual sigue en V47 (consulta de sólo lectura)');
  console.log(`\nE2E identidad DNI: ${passed} bloques aprobados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
