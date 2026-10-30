/* E2E de la rectificación del DNI desde Administración de usuarios (I-1b) sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e, V53).
 * Backend real en :18080 y SQL Server real. Reutiliza la misma lógica de I-1 (PersonIdentityService); sólo crea registros marcados, adelanta el reloj
 * ajustable para vencer un código (y lo restablece) y usa un trigger temporal que fuerza un fallo de auditoría y que siempre elimina.
 * Uso: node scripts/e2e-identidad-dni-usuarios.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const REASON = 'Error de digitación al crear la cuenta ' + MARK;

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.APP_E2E_CONTROLS_ENABLED === 'true' && env.SPRING_PROFILES_ACTIVE.split(',').includes('e2e'));
  assert.equal(one('SELECT DB_NAME()'), DB_NAME); assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 53);
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const clock = { get: async () => ok('/e2e/clock', { token: admin }), set: async (ms) => ok('/e2e/clock', { method: 'PUT', token: admin, body: { instant: new Date(ms).toISOString() } }), reset: async () => ok('/e2e/clock', { method: 'PUT', token: admin, body: { reset: true } }) };
  await clock.reset();
  try {
    pass('base E2E aislada en V53, backend saludable y reloj ajustable');
    const used = new Set(); const newDni = () => { for (;;) { const d = String(60000000 + Math.floor(Math.random() * 30000000)); if (!used.has(d) && count(`SELECT COUNT(*) FROM personas WHERE dni='${d}'`) === 0) { used.add(d); return d; } } };
    const dotted = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    const personOf = (userId) => Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${userId}`));
    const dniOf = (personId) => one(`SELECT ISNULL(dni,'NULL') FROM personas WHERE id_personas=${personId}`), versionOf = (personId) => Number(one(`SELECT version_identidad FROM personas WHERE id_personas=${personId}`));
    const snapshot = (userId) => sql(`SELECT CONCAT(id_usuarios,'|',ISNULL(nombre_usuario,'-'),'|',ISNULL(hash_contrasena,'-'),'|',estado_cuenta,'|',CAST(esta_activo AS varchar),'|',CAST(version_credenciales AS varchar),'|',ISNULL(CONVERT(varchar(30),fecha_baja,121),'-'),'|',ISNULL(motivo_baja,'-'),'|',id_personas,'|',(SELECT STRING_AGG(r.codigo_rol,',') WITHIN GROUP(ORDER BY r.codigo_rol) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=u.id_usuarios)) FROM usuarios u WHERE id_usuarios=${userId}`).trim();
    const activationSnapshot = (userId) => sql(`SELECT CONCAT(id_activaciones_cuenta,'|',token_hash,'|',CONVERT(varchar(30),fecha_expiracion,121),'|',ISNULL(CONVERT(varchar(30),fecha_utilizacion,121),'-')) FROM activaciones_cuenta WHERE id_usuarios=${userId} ORDER BY id_activaciones_cuenta`).trim();
    const events = (userId, entity = 'USER', op = '%_DNI') => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'${entity}' AND entidad_id=${userId} AND operacion LIKE N'${op}'`);
    const put = (userId, dni, extra = {}, token = admin, expect = [200], version = null) => call(`/auth/users/${userId}/dni`, { method: 'PUT', token, body: { dniNuevo: dni, version: version ?? versionOf(personOf(userId)), motivo: REASON, cotejoDocumental: true, confirmaCuenta: true, ...extra }, expect });
    const dts = await createUser(admin, 'DTS', 'dniudts'), ops = await createUser(admin, 'CENTRO_OPERACIONES', 'dniuops'), ops2 = await createUser(admin, 'OPERACIONES', 'dniuops2'), cmd = await createUser(admin, 'COMANDANTE', 'dniucmd'), admin2 = await createUser(admin, 'ADMINISTRADOR', 'dniuadm2');
    const provinces = await ok('/catalogs/provinces', { token: ops.token }); let localities;
    for (const prov of provinces) { localities = await ok('/catalogs/localities?provinceId=' + prov.id, { token: ops.token }); if (localities.length >= 2) break; }
    const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
    const newAccount = async (label) => { const dni = newDni(), username = MARK + label; const act = await ok('/auth/users', { method: 'POST', token: admin, body: { nombre: 'Cuenta', apellido: label + MARK, dni, roles: ['DTS'], correos: [{ direccion: username + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551234' }] } }); return { dni, username, code: act.codigo, id: Number(one(`SELECT u.id_usuarios FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE p.dni='${dni}'`)), label }; };
    const activate = async (a) => { await call('/auth/activar-cuenta', { method: 'POST', body: { dni: a.dni, codigo: a.code, username: a.username, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] }); };
    // B: usuario activo sin ficha de paciente
    const u1 = await newAccount('uno'); await activate(u1);
    // C: usuario activo que además es paciente (ficha creada por un DTS con identidad confirmada)
    const u2 = await newAccount('dos'); await activate(u2);
    const f2 = await ok('/flights/with-patient', { method: 'POST', token: dts.token, body: { patient: { nombre: 'Cuenta', apellido: 'dos' + MARK, dni: u2.dni }, identidadConfirmada: true, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'DNI usuarios ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Control', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
    const patient2 = Number(one(`SELECT id_pacientes FROM vuelos_sanitarios WHERE id_vuelos=${f2.id}`));
    // D: pendiente de activación
    const u3 = await newAccount('tres');
    // E: desactivada
    const u4 = await newAccount('cuatro'); await activate(u4); await call(`/auth/users/${u4.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'Baja de prueba ' + MARK }, expect: [200] });
    // F: persona ajena con DNI conocido
    const u5 = await newAccount('cinco'); await activate(u5);
    const patientOnly = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Solo', apellido: 'Paciente' + MARK, dni: newDni() } });
    assert.equal(one(`SELECT estado_cuenta FROM usuarios WHERE id_usuarios=${u4.id}`), 'DESACTIVADO'); assert.equal(one(`SELECT estado_cuenta FROM usuarios WHERE id_usuarios=${u3.id}`), 'PENDIENTE_ACTIVACION');
    assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${personOf(u1.id)}`), 0); assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${personOf(u2.id)}`), 1);
    pass('fixtures: usuario activo sin ficha, usuario activo con ficha y vuelo sanitario, usuario pendiente, usuario desactivado, otro usuario y un paciente sin cuenta');

    // ---------- A: permisos y entradas inválidas ----------
    const before1 = snapshot(u1.id), dni1 = dniOf(personOf(u1.id)), v1 = versionOf(personOf(u1.id)), eventsBefore = count('SELECT COUNT(*) FROM eventos_auditoria');
    for (const who of [dts, ops, ops2, cmd]) await put(u1.id, newDni(), {}, who.token, [403]);
    await call(`/auth/users/${u1.id}/dni`, { method: 'PUT', body: { dniNuevo: newDni(), version: v1, motivo: REASON, cotejoDocumental: true, confirmaCuenta: true }, expect: [401, 403] });
    await put(999999999, newDni(), {}, admin, [404]);
    await put(u1.id, newDni(), { personId: personOf(u5.id) }, admin, [400]);                    // no se acepta un identificador de persona
    await put(u1.id, newDni(), { confirmaCuenta: undefined }, admin, [400]); await put(u1.id, newDni(), { confirmaCuenta: false }, admin, [400]);
    assert.equal((await call(`/auth/users/${u1.id}/dni`, { method: 'PUT', token: admin, body: { dniNuevo: newDni(), version: v1, motivo: REASON, cotejoDocumental: true }, expect: [400] })).data.code, 'DNI_ACCOUNT_CONFIRMATION_REQUIRED');
    await put(u1.id, newDni(), { cotejoDocumental: false }, admin, [400]); await put(u1.id, newDni(), { cotejoDocumental: undefined }, admin, [400]);
    for (const motivo of ['', '   ', 'corto', 'x'.repeat(501)]) await put(u1.id, newDni(), { motivo }, admin, [400]);
    for (const bad of ['abc', '12A45678', '123456', '1234567890123', '', '--']) await put(u1.id, bad, {}, admin, [400]);
    await put(u1.id, dni1, {}, admin, [400]); await put(u1.id, dotted(dni1), {}, admin, [400]);
    await put(u1.id, newDni(), {}, admin, [409], v1 + 9);
    assert.equal(snapshot(u1.id), before1); assert.equal(dniOf(personOf(u1.id)), dni1); assert.equal(versionOf(personOf(u1.id)), v1); assert.equal(count('SELECT COUNT(*) FROM eventos_auditoria'), eventsBefore, 'las entradas rechazadas no auditan');
    pass('A permisos y validación: DTS, Centro de Operaciones, Operaciones y comandante rechazados (403), sin sesión (401), usuario inexistente (404), identificador de persona suministrado, cuenta sin confirmar, cotejo ausente, motivo inválido, 6 formatos inválidos, igual al actual (2 formatos) y versión vencida rechazados sin tocar la cuenta, la persona ni la auditoría');

    // ---------- B: usuario activo sin ficha ----------
    const personsBefore = count('SELECT COUNT(*) FROM personas'), patientsBefore = count('SELECT COUNT(*) FROM pacientes'), tokenBefore = (await ok('/auth/login', { method: 'POST', body: { username: u1.username, password: PASSWORD } })).accessToken;
    const detail0 = await ok(`/auth/users/${u1.id}`, { token: admin }); assert.equal(detail0.versionIdentidad, v1); assert.equal(detail0.pacienteId ?? null, null);
    const n1 = newDni(); const r1 = (await put(u1.id, dotted(n1))).data;
    assert.equal(r1.dni, n1); assert.equal(r1.versionIdentidad, v1 + 1); assert.equal(r1.estado, 'ACTIVO'); assert.equal(r1.id, u1.id);
    assert.equal(dniOf(personOf(u1.id)), n1, 'DNI normalizado'); assert.equal(snapshot(u1.id), before1, 'usuario, hash, estado, versión de credenciales, roles y persona intactos');
    assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore); assert.equal(count('SELECT COUNT(*) FROM pacientes'), patientsBefore, 'no se crea ninguna ficha de paciente');
    await ok('/auth/me', { token: tokenBefore }); await ok('/auth/login', { method: 'POST', body: { username: u1.username, password: PASSWORD } });
    assert.equal((await ok(`/auth/users/search?q=${n1}`, { token: admin })).items[0].id, u1.id, 'la búsqueda administrativa usa el DNI corregido'); assert.equal((await ok(`/auth/users/search?q=${dni1}`, { token: admin })).items.length, 0);
    assert.equal(events(u1.id, 'USER', 'RECTIFY_DNI'), 1);
    const row = sql(`SELECT id_usuario_actor, ISNULL(valores_anteriores,'-'), ISNULL(valores_nuevos,'-'), ISNULL(CAST(id_vuelos AS varchar),'NULL') FROM eventos_auditoria WHERE tipo_entidad=N'USER' AND entidad_id=${u1.id} AND operacion=N'RECTIFY_DNI'`).split('|').map((x) => x.trim());
    assert.equal(row[0], one(`SELECT id_usuarios FROM usuarios WHERE nombre_usuario=N'${dotenv.BOOTSTRAP_ADMIN_USERNAME}'`)); assert.equal(row[1], `{"terminacionAnterior":"${dni1.slice(-4)}"}`);
    assert.ok(row[2].includes(`"terminacionNueva":"${n1.slice(-4)}"`) && row[2].includes('"cotejoDocumental":true') && row[2].includes('"cuentaEstado":"ACTIVO"') && row[2].includes(REASON) && row[2].includes(`"usuarioId":${u1.id}`)); assert.equal(row[3], 'NULL');
    for (const d of [dni1, n1]) assert.ok(!row[1].includes(d) && !row[2].includes(d), 'sin DNI completos en la auditoría general');
    const audited = (await ok(`/audit?entityType=USER&entityId=${u1.id}&operation=RECTIFY_DNI`, { token: admin })).items[0]; assert.equal(audited.operationLabel, 'Rectificación de DNI');
    const auditDetail = JSON.stringify(await ok(`/audit/events/${audited.id}`, { token: admin })); assert.ok(!auditDetail.includes(dni1) && !auditDetail.includes(n1));
    pass('B usuario activo sin ficha: se rectifica desde su cuenta (DNI con puntos normalizado, versión +1); usuario, hash, estado, versión de credenciales, roles y persona idénticos en SQL; no se crea ficha ni persona; la sesión vigente y el ingreso siguen funcionando; la búsqueda usa el DNI corregido; un evento USER/RECTIFY_DNI del administrador con sólo terminaciones');

    // ---------- C: usuario que además es paciente ----------
    const p2 = personOf(u2.id), before2 = snapshot(u2.id), v2 = versionOf(p2), flightsBefore = sql(`SELECT id_vuelos, id_pacientes FROM vuelos_sanitarios WHERE id_pacientes=${patient2}`);
    const d2 = await ok(`/auth/users/${u2.id}`, { token: admin }); assert.equal(d2.pacienteId, patient2);
    const n2 = newDni(); await put(u2.id, n2);
    assert.equal(dniOf(p2), n2); assert.equal(snapshot(u2.id), before2); assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${p2}`), 1); assert.equal(sql(`SELECT id_vuelos, id_pacientes FROM vuelos_sanitarios WHERE id_pacientes=${patient2}`), flightsBefore, 'el vuelo conserva su ficha');
    const patDetail = await ok(`/patients/${patient2}`, { token: admin }); assert.equal(patDetail.dni, n2); assert.equal(patDetail.version, v2 + 1); assert.equal(patDetail.cuentaEstado, 'ACTIVO');
    assert.equal((await ok(`/patients/search?dni=${n2}`, { token: dts.token })).items[0].id, patient2);
    assert.equal(events(patient2, 'PATIENT_IDENTITY'), 1); assert.equal(events(u2.id, 'USER'), 0, 'un único evento, bajo la ficha');
    assert.equal((await ok(`/patients/${patient2}/corrections?page=0&size=10`, { token: admin })).items[0].operacion, 'RECTIFY_DNI');
    // el camino inverso comparte versión y reglas
    const n2b = newDni(); await call(`/patients/${patient2}/dni`, { method: 'PUT', token: admin, body: { dniNuevo: n2b, version: v2, motivo: REASON, cotejoDocumental: true, confirmaCuenta: true }, expect: [409] });
    await call(`/patients/${patient2}/dni`, { method: 'PUT', token: admin, body: { dniNuevo: n2b, version: v2 + 1, motivo: REASON, cotejoDocumental: true, confirmaCuenta: true } });
    assert.equal((await ok(`/auth/users/${u2.id}`, { token: admin })).dni, n2b); assert.equal(events(patient2, 'PATIENT_IDENTITY'), 2); assert.equal(snapshot(u2.id), before2);
    pass('C usuario con ficha de paciente: la rectificación desde Usuarios se refleja en la ficha y en el vuelo sanitario sin duplicar personas ni fichas, queda un solo evento bajo la ficha (visible en su historial), y la rectificación desde la ficha usa la misma versión y vuelve a reflejarse en la cuenta');

    // ---------- D: cuenta pendiente de activación ----------
    const p3 = personOf(u3.id), before3 = snapshot(u3.id), act3 = activationSnapshot(u3.id); assert.ok(act3.length > 0);
    const n3 = newDni(); const r3 = (await put(u3.id, n3)).data; assert.equal(r3.estado, 'PENDIENTE_ACTIVACION');
    assert.equal(snapshot(u3.id), before3, 'la cuenta pendiente no cambia'); assert.equal(activationSnapshot(u3.id), act3, 'el código de activación (hash, vencimiento, uso) no se toca ni se regenera');
    assert.equal((await ok(`/auth/users/search?q=${n3}`, { token: admin })).items[0].id, u3.id); assert.equal((await ok(`/auth/users/search?q=${u3.dni}`, { token: admin })).items.length, 0);
    const activation = (dni, code = u3.code) => ({ dni, codigo: code, username: u3.username, password: PASSWORD, confirmacionPassword: PASSWORD });
    assert.equal((await call('/auth/activar-cuenta', { method: 'POST', body: activation(u3.dni), expect: [404] })).data.error, 'DNI inexistente'); assert.equal(snapshot(u3.id), before3);
    await call('/auth/activar-cuenta', { method: 'POST', body: activation(n3, 'codigo-equivocado-12345'), expect: [400] }); await call('/auth/activar-cuenta', { method: 'POST', body: activation(n3, ''), expect: [400] }); assert.equal(snapshot(u3.id), before3, 'ni el DNI correcto con un código incorrecto ni vacío activa');
    await call('/auth/activar-cuenta', { method: 'POST', body: activation(dotted(n3)), expect: [204] });
    assert.equal(one(`SELECT estado_cuenta FROM usuarios WHERE id_usuarios=${u3.id}`), 'ACTIVO'); assert.equal(count(`SELECT COUNT(*) FROM activaciones_cuenta WHERE id_usuarios=${u3.id} AND fecha_utilizacion IS NULL`), 0); await ok('/auth/login', { method: 'POST', body: { username: u3.username, password: PASSWORD } });
    await call('/auth/activar-cuenta', { method: 'POST', body: activation(n3), expect: [409, 400] });
    assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${p3}`), 0);
    // el vencimiento no se extiende ni se reinicia: con el reloj +25 h el código sigue vencido tras rectificar y se recupera con el procedimiento existente
    const u6 = await newAccount('seis'); const act6 = activationSnapshot(u6.id); const n6 = newDni(); await put(u6.id, n6);
    assert.equal(activationSnapshot(u6.id), act6, 'el vencimiento del código no cambia por rectificar');
    await clock.set(Date.parse((await clock.get()).now) + 25 * 3600000);
    const expired = await call('/auth/activar-cuenta', { method: 'POST', body: { dni: n6, codigo: u6.code, username: u6.username, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [400] }); assert.match(expired.data.error, /venci/i);
    await clock.reset();
    const fresh = await ok(`/auth/users/${u6.id}/activation-code`, { method: 'POST', token: admin });
    await call('/auth/activar-cuenta', { method: 'POST', body: { dni: n6, codigo: fresh.codigo, username: u6.username, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
    pass('D cuenta pendiente: la cuenta y su código (hash, vencimiento, uso) quedan idénticos; el DNI anterior ya no activa (404 "DNI inexistente"), el DNI correcto no basta sin el código (incorrecto o vacío), con el corregido y el mismo código se activa una sola vez y se ingresa; el vencimiento a 24 h no se extiende (con el reloj +25 h sigue vencido) y se recupera con el procedimiento de regeneración existente');

    // ---------- E: cuenta desactivada ----------
    const before4 = snapshot(u4.id), p4 = personOf(u4.id), n4 = newDni();
    const r4 = (await put(u4.id, n4)).data; assert.equal(r4.activo, false); assert.equal(r4.estado, 'DESACTIVADO'); assert.equal(dniOf(p4), n4);
    assert.equal(snapshot(u4.id), before4, 'sigue desactivada, con su baja, motivo, hash y roles'); await call('/auth/login', { method: 'POST', body: { username: u4.username, password: PASSWORD }, expect: [401] });
    assert.ok(sql(`SELECT valores_nuevos FROM eventos_auditoria WHERE tipo_entidad=N'USER' AND entidad_id=${u4.id} AND operacion=N'RECTIFY_DNI'`).includes('"cuentaEstado":"DESACTIVADO"'));
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'USER' AND entidad_id=${u4.id} AND operacion=N'USUARIO_DESACTIVADO'`), 1, 'su historial de baja se conserva');
    pass('E cuenta desactivada: se rectifica sin reactivarla ni cambiar su baja, hash, roles o motivo; sigue sin poder ingresar y conserva su historial');

    // ---------- F: DNI ocupado ----------
    const sA = `${dniOf(personOf(u1.id))}|${versionOf(personOf(u1.id))}|${dniOf(personOf(u5.id))}|${versionOf(personOf(u5.id))}|${dniOf(personOf(u3.id))}|${count('SELECT COUNT(*) FROM personas')}|${count('SELECT COUNT(*) FROM pacientes')}|${snapshot(u1.id)}|${snapshot(u5.id)}`, eA = count("SELECT COUNT(*) FROM eventos_auditoria WHERE operacion LIKE N'%_DNI'");
    const taken = [u5.dni, dotted(u5.dni), ` ${u5.dni.slice(0, 2)}-${u5.dni.slice(2, 5)}-${u5.dni.slice(5)} `, dniOf(personOf(u3.id)), dniOf(personOf(u4.id)), one(`SELECT dni FROM personas WHERE id_personas=${patientOnly.personId}`)];
    for (const dni of taken) { const r = await put(u1.id, dni, {}, admin, [409]); assert.equal(r.data.code, 'DNI_ALREADY_REGISTERED'); assert.ok(!JSON.stringify(r.data).includes(u5.dni) && !JSON.stringify(r.data).includes('cinco' + MARK)); }
    assert.equal(`${dniOf(personOf(u1.id))}|${versionOf(personOf(u1.id))}|${dniOf(personOf(u5.id))}|${versionOf(personOf(u5.id))}|${dniOf(personOf(u3.id))}|${count('SELECT COUNT(*) FROM personas')}|${count('SELECT COUNT(*) FROM pacientes')}|${snapshot(u1.id)}|${snapshot(u5.id)}`, sA, 'ninguna identidad ni cuenta cambió');
    assert.equal(count("SELECT COUNT(*) FROM eventos_auditoria WHERE operacion LIKE N'%_DNI'"), eA);
    pass('F DNI ocupado: rechazado (409) en 6 variantes —tres formatos equivalentes, una cuenta activada, una desactivada y un paciente sin cuenta— sin identificar a la otra persona y sin modificar ninguna persona, ficha, cuenta ni evento');

    // ---------- G: concurrencia real ----------
    const u7 = await newAccount('siete'); await activate(u7); const v7 = versionOf(personOf(u7.id)), [g1, g2] = [newDni(), newDni()];
    const hit = (userId, dni, token, version) => fetch(`${BASE}/auth/users/${userId}/dni`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ dniNuevo: dni, version, motivo: REASON, cotejoDocumental: true, confirmaCuenta: true }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const race = await Promise.all([hit(u7.id, g1, admin, v7), hit(u7.id, g2, admin2.token, v7)]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]); assert.equal(race.find((r) => r.status === 409).body.code, 'PATIENT_STALE_IDENTITY'); assert.equal(versionOf(personOf(u7.id)), v7 + 1); assert.equal(events(u7.id, 'USER'), 1);
    for (let round = 0; round < 6; round++) {
      const a = await newAccount('ra' + round), b = await newAccount('rb' + round), target = newDni(), snapA = snapshot(a.id), snapB = snapshot(b.id), vers = [versionOf(personOf(a.id)), versionOf(personOf(b.id))], keep = [dniOf(personOf(a.id)), dniOf(personOf(b.id))];
      const res = await Promise.all([hit(a.id, target, admin, vers[0]), hit(b.id, target, admin2.token, vers[1])]);
      assert.deepEqual(res.map((r) => r.status).sort(), [200, 409], `ronda ${round}`); assert.equal(res.find((r) => r.status === 409).body.code, 'DNI_ALREADY_REGISTERED');
      assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni='${target}'`), 1); const li = res[0].status === 409 ? 0 : 1, loser = [a, b][li];
      assert.equal(dniOf(personOf(loser.id)), keep[li]); assert.equal(versionOf(personOf(loser.id)), vers[li]); assert.equal(events(loser.id, 'USER'), 0); assert.equal(snapshot(a.id), snapA); assert.equal(snapshot(b.id), snapB);
    }
    // el mismo cambio concurrente desde dos entradas (cuenta y ficha) sobre la misma persona
    const u8 = await newAccount('ocho'); await activate(u8);
    const f8 = await ok('/flights/with-patient', { method: 'POST', token: dts.token, body: { patient: { nombre: 'Cuenta', apellido: 'ocho' + MARK, dni: u8.dni }, identidadConfirmada: true, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'DNI usuarios 8 ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Control', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } });
    const patient8 = Number(one(`SELECT id_pacientes FROM vuelos_sanitarios WHERE id_vuelos=${f8.id}`)), v8 = versionOf(personOf(u8.id));
    const both = await Promise.all([hit(u8.id, newDni(), admin, v8), fetch(`${BASE}/patients/${patient8}/dni`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin2.token }, body: JSON.stringify({ dniNuevo: newDni(), version: v8, motivo: REASON, cotejoDocumental: true, confirmaCuenta: true }) }).then((r) => ({ status: r.status }))]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409], 'cuenta y ficha comparten la misma versión'); assert.equal(versionOf(personOf(u8.id)), v8 + 1); assert.equal(events(patient8, 'PATIENT_IDENTITY'), 1);
    pass('G concurrencia real: dos administradores con la misma versión sobre una cuenta = 1 éxito y 1 conflicto; 6 rondas de dos cuentas hacia el mismo DNI = 1 éxito y 1 conflicto decidido por el índice único, la perdedora y su cuenta intactas; la misma persona rectificada a la vez desde Usuarios y desde la ficha de paciente = 1 éxito y 1 conflicto');

    // ---------- H: atomicidad ----------
    const u9 = await newAccount('nueve'); await activate(u9); const snap9 = snapshot(u9.id), dni9 = dniOf(personOf(u9.id)), v9 = versionOf(personOf(u9.id));
    const trig = 'tr_e2e_falla_auditoria_dni_usuario_' + MARK;
    sql(`EXEC(N'CREATE TRIGGER dbo.${trig} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE tipo_entidad=N''USER'' AND entidad_id=${u9.id} AND operacion=N''RECTIFY_DNI'') THROW 51000, N''Fallo de prueba'', 1; END');`);
    try { await put(u9.id, newDni(), {}, admin, [500]); assert.equal(dniOf(personOf(u9.id)), dni9); assert.equal(versionOf(personOf(u9.id)), v9); assert.equal(events(u9.id), 0); assert.equal(snapshot(u9.id), snap9); }
    finally { sql(`DROP TRIGGER IF EXISTS dbo.${trig}`); }
    assert.equal(count(`SELECT COUNT(*) FROM sys.triggers WHERE name=N'${trig}'`), 0); await put(u9.id, newDni()); assert.equal(events(u9.id), 1);
    pass('H atomicidad: con un fallo forzado al insertar la auditoría ni el DNI ni la versión ni la cuenta cambian y no queda evento; sin el fallo la misma operación se aplica');

    // ---------- I: ningún secreto en la auditoría y esquema intacto ----------
    const secrets = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE operacion LIKE N'%_DNI' AND (valores_nuevos LIKE N'%codigo%' OR valores_nuevos LIKE N'%token%' OR valores_nuevos LIKE N'%hash%' OR valores_nuevos LIKE N'%$2a$%' OR valores_nuevos LIKE N'%$2b$%' OR valores_nuevos LIKE N'%contrase%' OR valores_anteriores LIKE N'%$2%')`); assert.equal(secrets, 0);
    assert.equal(count("SELECT COUNT(*) FROM personas p WHERE p.dni IS NOT NULL AND (LEN(p.dni)<7 OR p.dni LIKE N'%[^0-9]%')"), 0);
    assert.equal(count('SELECT COUNT(*) FROM (SELECT dni FROM personas WHERE dni IS NOT NULL GROUP BY dni HAVING COUNT(*)>1) x'), 0, 'sin DNI duplicados');
    const habitual = spawnSync('docker', ['exec', 'vuelos-sanitarios-sqlserver-1', 'bash', '-c', 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -C -d vuelos_sanitarios -W -h -1 -Q "SET NOCOUNT ON; SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL"'], { encoding: 'utf8' }).stdout.trim(); assert.equal(habitual, '47');
    pass('I la auditoría de rectificaciones no contiene códigos, tokens, hashes ni contraseñas; ningún DNI duplicado o no numérico en la base; la base habitual sigue en V47');
  } finally { await clock.reset().catch(() => {}); }
  console.log(`\nE2E identidad DNI usuarios: ${passed} bloques aprobados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
