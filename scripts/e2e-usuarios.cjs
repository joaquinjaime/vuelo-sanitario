/* E2E del ciclo administrativo de usuarios sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e en V47).
 * API real + SQL Server real: alta, activación, primer ingreso, cambio de roles con invalidación de sesiones, baja, reactivación, restablecimiento,
 * identidad única (persona existente sin cuenta, altas simultáneas), responsabilidades operativas (vuelos, informes, solicitudes, bloqueos
 * documentales), carreras reales entre bajas/cambios de rol y asignaciones, auditoría sin secretos y autorización.
 * Sólo crea registros marcados; nunca modifica la base habitual (se comprueba al final en sólo lectura). Uso: node scripts/e2e-usuarios.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, PDF, approveRoute } = require('./e2e-cierre-support.cjs');
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const dniSeq = () => String(60000000 + Math.floor(Math.random() * 30000000));
const NEW_PASSWORD = 'Definitiva-' + MARK + '-1';
const login = (username, password) => call('/auth/login', { method: 'POST', body: { username, password }, expect: [200, 401] });
const tokenOf = async (username, password) => { const r = await login(username, password); assert.equal(r.status, 200, 'login ' + username); return r.data.accessToken; };

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && env.SPRING_PROFILES_ACTIVE.includes('e2e'), 'El backend no es el stack E2E aislado');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 47, 'La base aislada debe estar en V47');
  for (const ix of ['uq_personas_dni', 'uq_usuarios_nombre_usuario', 'idx_usuarios_id_usuario_baja']) assert.equal(count(`SELECT COUNT(*) FROM sys.indexes WHERE name=N'${ix}'`), 1, ix);
  assert.equal(count("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('usuarios') AND name IN ('id_usuario_baja','motivo_baja')"), 2);
  assert.equal(count('SELECT COUNT(*) FROM usuarios WHERE esta_activo=0 AND id_usuario_baja IS NOT NULL'), count("SELECT COUNT(*) FROM usuarios u WHERE u.esta_activo=0 AND EXISTS (SELECT 1 FROM eventos_auditoria x WHERE x.tipo_entidad=N'USER' AND x.operacion=N'USUARIO_DESACTIVADO' AND x.entidad_id=u.id_usuarios AND x.id_usuario_actor IS NOT NULL)"), 'el relleno de V47 sólo usa bajas con responsable auditado');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  // La base habitual nunca se modifica: se anota su versión al empezar (sólo lectura) y se compara al terminar.
  const habitualVersionAtStart = spawnSync('docker', ['exec', '-i', 'vuelos-sanitarios-sqlserver-1', 'bash', '-c', 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -C -d vuelos_sanitarios -W -h -1 -i /dev/stdin'], { input: 'SELECT TOP 1 version FROM flyway_schema_history ORDER BY installed_rank DESC\nGO\n', encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim();
  assert.match(habitualVersionAtStart, /^\d+$/, 'no se pudo leer la versión de la base habitual');
  let admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  let adminId = Number(one(`SELECT id_usuarios FROM usuarios WHERE nombre_usuario=N'${dotenv.BOOTSTRAP_ADMIN_USERNAME}'`));
  const bootstrapAdminId = adminId;
  pass('base aislada en V47: índices únicos filtrados de DNI y nombre de usuario, columnas de baja administrativa y relleno histórico únicamente con bajas auditadas');

  // Dos rondas simultáneas con distinto orden de envío. Cada una empieza con
  // exactamente dos administradores activos y termina con el bootstrap como único administrador.
  const activeAdminCount = () => count("SELECT COUNT(DISTINCT u.id_usuarios) FROM usuarios u JOIN usuarios_roles ur ON ur.id_usuarios=u.id_usuarios JOIN roles r ON r.id_roles=ur.id_roles WHERE u.esta_activo=1 AND r.codigo_rol=N'ADMINISTRADOR'");
  for (let round = 0; round < 2; round++) {
    const secondAdmin = await createUser(admin, 'ADMINISTRADOR', 'adminrace' + (round + 1));
    assert.equal(activeAdminCount(), 2, `ronda ${round + 1}: la carrera empieza con exactamente dos administradores activos`);
    const attempts = [
      { target: secondAdmin.id, run: () => call(`/auth/users/${secondAdmin.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: `carrera de últimos administradores ${round + 1}` }, expect: [200, 409] }) },
      { target: bootstrapAdminId, run: () => call(`/auth/users/${bootstrapAdminId}/deactivate`, { method: 'PATCH', token: secondAdmin.token, body: { motivo: `carrera de últimos administradores ${round + 1}` }, expect: [200, 409] }) }
    ];
    const auditBefore = new Map(attempts.map((attempt) => [attempt.target, count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'USER' AND operacion=N'USUARIO_DESACTIVADO' AND entidad_id=${attempt.target}`)]));
    if (round === 1) attempts.reverse();
    const results = await Promise.all(attempts.map((attempt) => attempt.run()));
    assert.deepEqual(results.map((x) => x.status).sort(), [200, 409], `ronda ${round + 1}: debe prevalecer exactamente una baja`);
    for (let i = 0; i < attempts.length; i++) {
      const auditCount = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'USER' AND operacion=N'USUARIO_DESACTIVADO' AND entidad_id=${attempts[i].target}`);
      assert.equal(auditCount - auditBefore.get(attempts[i].target), results[i].status === 200 ? 1 : 0, `ronda ${round + 1}: la auditoría debe reflejar solo la baja confirmada`);
    }
    const activeAdminIds = sql("SELECT DISTINCT CAST(u.id_usuarios AS varchar) FROM usuarios u JOIN usuarios_roles ur ON ur.id_usuarios=u.id_usuarios JOIN roles r ON r.id_roles=ur.id_roles WHERE u.esta_activo=1 AND r.codigo_rol=N'ADMINISTRADOR'").split(/\r?\n/).map((x) => Number(x.trim()));
    assert.equal(activeAdminIds.length, 1, `ronda ${round + 1}: nunca deben quedar cero ni dos administradores activos`);
    if (activeAdminIds[0] !== bootstrapAdminId) {
      const restored = await ok(`/auth/users/${bootstrapAdminId}/reactivate`, { method: 'PATCH', token: secondAdmin.token, body: { nombre: 'Administrador', apellido: 'Inicial', roles: ['ADMINISTRADOR'] } });
      const temporaryToken = await tokenOf(dotenv.BOOTSTRAP_ADMIN_USERNAME, restored.contrasenaTemporal);
      const nextPassword = `Recuperada-${MARK}-${round + 1}X`;
      await ok('/auth/me/password', { method: 'POST', token: temporaryToken, body: { passwordActual: restored.contrasenaTemporal, nuevaPassword: nextPassword, confirmacionPassword: nextPassword } });
      dotenv.BOOTSTRAP_ADMIN_PASSWORD = nextPassword;
    }
    admin = await tokenOf(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD);
    if (count(`SELECT COUNT(*) FROM usuarios WHERE id_usuarios=${secondAdmin.id} AND esta_activo=1`) === 1)
      await call(`/auth/users/${secondAdmin.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: `restaurar fixture E2E ronda ${round + 1}` } });
    assert.equal(activeAdminCount(), 1, `ronda ${round + 1}: el fixture vuelve al administrador bootstrap activo`);
    assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE id_usuarios=${bootstrapAdminId} AND esta_activo=1`), 1);
    pass(`carrera SQL Server de últimos administradores ronda ${round + 1}: una baja prevalece, una recibe conflicto, conserva un administrador y audita solo el cambio confirmado`);
  }

  // ---------- Fixtures ----------
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'uops'), dtsA = await createUser(admin, 'DTS', 'udtsa');
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
  assert.ok(province);
  let plateSeq = 0; const newPlane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'U' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const newCommander = async (suffix) => { const c = await createUser(admin, 'COMANDANTE', suffix); await provision(admin, c); await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token }); return c; };
  const priority = (await ok('/catalogs/priorities', { token: dtsA.token }))[0].codigo;
  const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((x) => x.codigo !== 'OTRO');
  const patient = await ok('/patients', { method: 'POST', token: dtsA.token, body: { nombre: 'Usuarios', apellido: MARK } });
  const requestBody = (when) => ({ patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Usuarios ' + MARK, fechaSolicitada: when, extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } });
  const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
  const userRow = (id) => sql(`SELECT esta_activo, estado_cuenta, debe_cambiar_contrasena, version_credenciales, ISNULL(CAST(id_usuario_baja AS varchar),'NULL'), ISNULL(motivo_baja,'NULL'), ISNULL(CONVERT(varchar(19),fecha_baja,120),'NULL'), LEFT(ISNULL(hash_contrasena,''),4) FROM usuarios WHERE id_usuarios=${id}`).split('|').map((x) => x.trim());
  const createBody = (nombre, dni, roles, extra = {}) => ({ nombre, apellido: 'E2E' + MARK, dni, roles, correos: [{ direccion: nombre.toLowerCase() + '.' + MARK + '@example.test', tipo: 'PERSONAL' }], telefonos: [{ pais: 'AR', numero: '3815550000', tipo: 'PERSONAL' }], ...extra });
  const activate = (dni, code, username, password = PASSWORD) => call('/auth/activar-cuenta', { method: 'POST', body: { dni, codigo: code, username, password, confirmacionPassword: password }, expect: [204, 409, 400] });
  const auditOps = (userId) => sql(`SELECT operacion FROM eventos_auditoria WHERE entidad_id=${userId} AND tipo_entidad IN (N'USER',N'USER_ROLE') ORDER BY id_eventos_auditoria`).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  // ---------- A: ciclo completo de una cuenta ----------
  const dniA = dniSeq(), nameA = 'ciclo' + MARK; let leaked = [];
  const created = (await call('/auth/users', { method: 'POST', token: admin, body: createBody('Ciclo', dniA, ['DTS']) })).data; assert.ok(created.codigo);
  const idA = Number(one(`SELECT u.id_usuarios FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE p.dni=N'${dniA}'`));
  let r = userRow(idA); assert.equal(r[1], 'PENDIENTE_ACTIVACION'); assert.equal(count(`SELECT COUNT(*) FROM activaciones_cuenta WHERE id_usuarios=${idA} AND fecha_utilizacion IS NULL`), 1);
  assert.notEqual(one(`SELECT token_hash FROM activaciones_cuenta WHERE id_usuarios=${idA}`), created.codigo, 'el código sólo se guarda con hash');
  await login(nameA, PASSWORD).then((x) => assert.equal(x.status, 401));
  assert.equal((await activate(dniA, 'codigo-incorrecto', nameA)).status, 400);
  assert.equal((await activate(dniA, created.codigo, nameA)).status, 204);
  assert.equal((await activate(dniA, created.codigo, nameA + 'x')).status, 409, 'el código no se reutiliza');
  assert.ok(userRow(idA)[7].startsWith('$2'), 'contraseña con BCrypt'); assert.notEqual(one(`SELECT hash_contrasena FROM usuarios WHERE id_usuarios=${idA}`), PASSWORD);
  let tokenA = await tokenOf(nameA, PASSWORD);
  assert.equal((await call('/auth/me', { token: tokenA })).data.roles[0], 'DTS'); await call('/flights', { token: tokenA }); await call('/auth/users/commanders', { token: tokenA, expect: [403] });
  const versionBefore = Number(userRow(idA)[3]);
  // cambio de roles: las sesiones anteriores dejan de valer y los privilegios nuevos sólo existen tras volver a ingresar
  const putBody = (roles, extra = {}) => ({ nombre: 'Ciclo', apellido: 'E2E' + MARK, roles, activo: true, ...extra });
  await call(`/auth/users/${idA}`, { method: 'PUT', token: admin, body: putBody(['CENTRO_OPERACIONES']) });
  assert.equal(Number(userRow(idA)[3]), versionBefore + 1, 'el cambio de roles invalida las credenciales'); await call('/auth/me', { token: tokenA, expect: [401] }); await call('/auth/users/commanders', { token: tokenA, expect: [401] });
  const tokenA2 = await tokenOf(nameA, PASSWORD); await call('/auth/users/commanders', { token: tokenA2 }); await call('/flights/operational', { method: 'POST', token: tokenA2, body: {}, expect: [400] });
  await call(`/auth/users/${idA}`, { method: 'PUT', token: admin, body: putBody(['DTS']) }); await call('/auth/users/commanders', { token: tokenA2, expect: [401] });
  tokenA = await tokenOf(nameA, PASSWORD); await call('/auth/users/commanders', { token: tokenA, expect: [403] });   // el rol retirado no deja privilegios residuales
  await call(`/auth/users/${idA}`, { method: 'PUT', token: admin, body: putBody(['DTS'], { nombre: 'Ciclo Editado' }) }); assert.equal(Number(userRow(idA)[3]), versionBefore + 2, 'editar sólo datos personales no cierra sesiones'); await call('/auth/me', { token: tokenA });
  assert.equal(one(`SELECT p.dni FROM personas p JOIN usuarios u ON u.id_personas=p.id_personas WHERE u.id_usuarios=${idA}`), dniA, 'el DNI no cambia desde la administración');
  await call(`/auth/users/${idA}`, { method: 'PUT', token: admin, body: putBody(['NO_EXISTE']), expect: [400] });
  // baja
  const bajaMotivo = 'Fin de contrato ' + MARK; const deact = await call(`/auth/users/${idA}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: bajaMotivo } });
  r = userRow(idA); assert.equal(r[0], '0'); assert.equal(r[1], 'DESACTIVADO'); assert.equal(r[4], String(adminId)); assert.equal(r[5], bajaMotivo); assert.notEqual(r[6], 'NULL');
  assert.equal(Number(userRow(idA)[3]), versionBefore + 3);
  for (const p of ['/auth/me', '/flights', '/catalogs/priorities', '/notifications']) await call(p, { token: tokenA, expect: [401] });
  assert.equal((await login(nameA, PASSWORD)).status, 401); assert.equal((await login('no.existe.' + MARK, 'x')).data.error, (await login(nameA, PASSWORD)).data.error, 'mismo mensaje para cuenta inexistente, inactiva o clave errónea');
  assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni=N'${dniA}'`), 1, 'la persona se conserva');
  await call(`/auth/users/${idA}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [409] });
  const detailInactive = (await ok(`/auth/users/${idA}`, { token: admin })); assert.equal(detailInactive.motivoBaja, bajaMotivo); assert.equal(detailInactive.bajaPorId, adminId); assert.equal(detailInactive.activo, false);
  const listedInactive = (await ok(`/auth/users/search?status=INACTIVOS&q=${encodeURIComponent('Ciclo')}`, { token: admin })).items.find((x) => x.id === idA); assert.equal(listedInactive.motivoBaja, bajaMotivo); assert.ok(listedInactive.bajaPor);
  // reactivación: misma cuenta, credenciales anteriores inválidas, cambio obligatorio
  const reactivation = (await call(`/auth/users/${idA}/reactivate`, { method: 'PATCH', token: admin, body: { nombre: 'Ciclo', apellido: 'E2E' + MARK, roles: ['DTS'] } })).data; const temp = reactivation.contrasenaTemporal;
  r = userRow(idA); assert.equal(r[0], '1'); assert.equal(r[2], '1'); assert.equal(r[4], 'NULL'); assert.equal(r[5], 'NULL'); assert.equal(r[6], 'NULL'); assert.ok(r[7].startsWith('$2')); assert.equal(count(`SELECT COUNT(*) FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE p.dni=N'${dniA}'`), 1, 'no se crea otra cuenta');
  assert.equal((await login(nameA, PASSWORD)).status, 401, 'la contraseña anterior ya no sirve'); const tempToken = await tokenOf(nameA, temp);
  await call('/auth/me', { token: tempToken }); for (const p of ['/flights', '/catalogs/priorities', '/notifications', '/patients']) await call(p, { token: tempToken, expect: [403] });
  await call('/auth/me/password', { method: 'POST', token: tempToken, body: { passwordActual: temp, nuevaPassword: temp, confirmacionPassword: temp }, expect: [400] });
  await call('/auth/me/password', { method: 'POST', token: tempToken, body: { passwordActual: 'incorrecta-123456', nuevaPassword: NEW_PASSWORD, confirmacionPassword: NEW_PASSWORD }, expect: [400] });
  await call('/auth/me/password', { method: 'POST', token: tempToken, body: { passwordActual: temp, nuevaPassword: 'corta', confirmacionPassword: 'corta' }, expect: [400] });
  await call('/auth/me/password', { method: 'POST', token: tempToken, body: { passwordActual: temp, nuevaPassword: NEW_PASSWORD, confirmacionPassword: NEW_PASSWORD } });
  await call('/auth/me', { token: tempToken, expect: [401] }); assert.equal((await login(nameA, temp)).status, 401, 'la temporal reemplazada no sirve'); assert.equal(userRow(idA)[2], '0');
  const finalToken = await tokenOf(nameA, NEW_PASSWORD); await call('/flights', { token: finalToken }); await call('/auth/users', { token: finalToken, expect: [403] });
  const expectedOps = ['USUARIO_CREADO', 'USUARIO_ACTIVADO', 'UPDATE', 'UPDATE', 'USUARIO_ACTUALIZADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CONTRASENA_RESTABLECIDA', 'CONTRASENA_CAMBIADA'];
  const gotOps = auditOps(idA); for (const op of expectedOps) assert.ok(gotOps.includes(op), `falta ${op} en ${gotOps}`);
  const secrets = [temp, NEW_PASSWORD, PASSWORD, created.codigo, '$2a$', '$2b$', 'eyJ'];
  const stored = sql(`SELECT ISNULL(valores_anteriores,'') + ' ' + ISNULL(valores_nuevos,'') FROM eventos_auditoria WHERE entidad_id=${idA} AND tipo_entidad IN (N'USER',N'USER_ROLE')`); for (const sct of secrets) assert.ok(!stored.includes(sct), 'la auditoría no contiene ' + sct.slice(0, 6));
  const actors = sql(`SELECT operacion, ISNULL(CAST(id_usuario_actor AS varchar),'NULL') FROM eventos_auditoria WHERE entidad_id=${idA} AND tipo_entidad=N'USER'`).split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim())); for (const [op, actor] of actors) assert.equal(actor, ['USUARIO_ACTIVADO', 'CONTRASENA_CAMBIADA'].includes(op) ? String(idA) : String(adminId), 'responsable de ' + op);
  const history = await ok(`/audit?entityType=USER&entityId=${idA}&size=50`, { token: admin }); assert.ok(history.total >= 6); const historyText = JSON.stringify(history); for (const sct of secrets) assert.ok(!historyText.includes(sct));
  for (const sct of secrets) for (const text of [JSON.stringify(detailInactive), JSON.stringify(await ok('/auth/users/search?status=TODOS&size=100', { token: admin })), JSON.stringify(await ok(`/auth/users/${idA}`, { token: admin }))]) assert.ok(!text.includes(sct), 'ninguna consulta devuelve ' + sct.slice(0, 6));
  pass('A ciclo completo (creación, activación con código de un solo uso, primer ingreso, cambio de roles que invalida sesiones y no deja privilegios residuales, baja con responsable/motivo/fecha, sin acceso con credenciales anteriores, reactivación con la misma cuenta, cambio obligatorio y credenciales reemplazadas) con auditoría completa y sin secretos');

  // ---------- B: identidad única ----------
  const dniB = dniSeq(); const pacienteB = await ok('/patients', { method: 'POST', token: dtsA.token, body: { nombre: 'Beatriz', apellido: 'Identidad' + MARK, dni: dniB.slice(0, 2) + '.' + dniB.slice(2, 5) + '.' + dniB.slice(5) } });
  assert.equal(one(`SELECT dni FROM personas WHERE id_personas=${pacienteB.personId}`), dniB, 'el DNI del paciente se guarda canónico (sólo dígitos)');
  await call('/patients', { method: 'POST', token: dtsA.token, body: { nombre: 'Otro', apellido: 'Otro', dni: dniB.slice(0, 2) + ' ' + dniB.slice(2) }, expect: [409] });
  const personsBefore = count('SELECT COUNT(*) FROM personas');
  const conflict = await call('/auth/users', { method: 'POST', token: admin, body: createBody('Beatriz', dniB.slice(0, 2) + '.' + dniB.slice(2, 5) + '.' + dniB.slice(5), ['DTS'], { apellido: 'Identidad' + MARK }), expect: [409] });
  assert.equal(conflict.data.code, 'PERSON_EXISTS_WITHOUT_ACCOUNT'); assert.equal(conflict.data.coincideNombre, true); assert.equal(conflict.data.personaId, pacienteB.personId); assert.ok(!JSON.stringify(conflict.data).toLowerCase().includes('paciente'));
  assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore);
  assert.equal((await call('/auth/users', { method: 'POST', token: admin, body: createBody('Distinta', dniB, ['DTS'], { apellido: 'Persona', personaExistenteId: pacienteB.personId }), expect: [409] })).data.code, 'PERSON_IDENTITY_MISMATCH');
  assert.equal((await call('/auth/users', { method: 'POST', token: admin, body: createBody('Beatriz', dniB, ['DTS'], { apellido: 'Identidad' + MARK, personaExistenteId: pacienteB.personId + 1000000 }), expect: [409] })).data.code, 'PERSON_IDENTITY_MISMATCH');
  assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore); assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE id_personas=${pacienteB.personId}`), 0);
  const linked = (await call('/auth/users', { method: 'POST', token: admin, body: createBody('Beatriz', dniB, ['DTS'], { apellido: 'Identidad' + MARK, personaExistenteId: pacienteB.personId }) })).data; assert.ok(linked.codigo);
  assert.equal(count('SELECT COUNT(*) FROM personas'), personsBefore, 'la identidad no se duplica'); assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE id_personas=${pacienteB.personId}`), 1); assert.equal(count(`SELECT COUNT(*) FROM pacientes WHERE id_personas=${pacienteB.personId}`), 1, 'se conserva el antecedente como paciente');
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${pacienteB.personId} AND es_principal=1`), 1); await call('/auth/users', { method: 'POST', token: admin, body: createBody('Beatriz', dniB, ['DTS'], { apellido: 'Identidad' + MARK }), expect: [409] });
  assert.equal((await activate(dniB, linked.codigo, 'beatriz' + MARK)).status, 204); await tokenOf('beatriz' + MARK, PASSWORD);
  await call('/auth/users', { method: 'POST', token: admin, body: createBody('Nadia', dniSeq(), ['COMANDANTE']), expect: [400] }); await call('/auth/users', { method: 'POST', token: admin, body: createBody('Nadia', 'sin-digitos', ['DTS']), expect: [400] }); await call('/auth/users', { method: 'POST', token: admin, body: createBody('', dniSeq(), ['DTS']), expect: [400] });
  assert.equal(count(`SELECT COUNT(*) FROM personas p WHERE p.dni LIKE '%[^0-9]%'`), 0, 'ninguna persona con DNI no canónico');
  // altas simultáneas con el mismo DNI: gana una, el resto recibe conflicto y no queda nada a medias
  const dniRace = dniSeq(); const personsRace = count('SELECT COUNT(*) FROM personas'), usersRace = count('SELECT COUNT(*) FROM usuarios');
  const race = await Promise.all(Array.from({ length: 8 }, (_, i) => call('/auth/users', { method: 'POST', token: admin, body: createBody('Carrera' + i, dniRace, ['DTS']), expect: [200, 409] })));
  assert.equal(race.filter((x) => x.status === 200).length, 1, 'una sola alta: ' + race.map((x) => x.status)); assert.ok(race.every((x) => x.status === 200 || x.status === 409));
  assert.equal(count(`SELECT COUNT(*) FROM personas WHERE dni=N'${dniRace}'`), 1); assert.equal(count('SELECT COUNT(*) FROM personas') - personsRace, 1, 'sin personas huérfanas'); assert.equal(count('SELECT COUNT(*) FROM usuarios') - usersRace, 1, 'sin cuentas huérfanas');
  assert.equal(count(`SELECT COUNT(*) FROM usuarios u LEFT JOIN usuarios_roles ur ON ur.id_usuarios=u.id_usuarios WHERE u.id_usuarios IN (SELECT id_usuarios FROM usuarios u2 JOIN personas p ON p.id_personas=u2.id_personas WHERE p.dni=N'${dniRace}') AND ur.id_usuarios_roles IS NULL`), 0);
  // activaciones simultáneas con el mismo nombre de usuario
  const dniU1 = dniSeq(), dniU2 = dniSeq(); const c1 = (await call('/auth/users', { method: 'POST', token: admin, body: createBody('Uno', dniU1, ['DTS']) })).data.codigo, c2 = (await call('/auth/users', { method: 'POST', token: admin, body: createBody('Dos', dniU2, ['DTS']) })).data.codigo; const shared = 'compartido' + MARK;
  const act = await Promise.all([activate(dniU1, c1, shared), activate(dniU2, c2, shared)]); assert.deepEqual(act.map((x) => x.status).sort(), [204, 409], 'sólo una cuenta obtiene el nombre: ' + act.map((x) => x.status)); assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE nombre_usuario=N'${shared}'`), 1);
  await assert.rejects(async () => sql(`UPDATE usuarios SET nombre_usuario=N'${shared}' WHERE id_usuarios=${adminId}`), /uq_usuarios_nombre_usuario|duplicate|UNIQUE/i);
  pass('B identidad única: persona existente (paciente) sin cuenta exige confirmación expresa y nombre coincidente, sin fusiones ni duplicados y conservando el antecedente; DNI canónico; 8 altas simultáneas con el mismo DNI -> 1 alta y 7 conflictos sin residuos; activaciones simultáneas con el mismo usuario -> 1 y 1 conflicto; SQL Server rechaza duplicados');

  // ---------- C: responsabilidades operativas ----------
  const cancelBody = { motivoCancelacionId: reason.id };
  const planned = async (commander) => { const plane = await newPlane(); const when = futureSlot(); const f = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Usuarios ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } }); await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } }); assert.equal(stateOf(f.id), 'PLANIFICADO'); return { id: f.id, code: one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${f.id}`) }; };
  const cmdC = await newCommander('ucmdc'); const fC = await planned(cmdC); const bloqueos = [];
  const blocked = (await call(`/auth/users/${cmdC.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'x' }, expect: [409] })).data;
  assert.equal(blocked.code, 'USER_HAS_OPERATIONAL_ASSIGNMENTS'); assert.ok(blocked.impedimentos.some((b) => b.tipo === 'COMANDANTE_ASIGNADO' && b.vueloCodigo === fC.code), JSON.stringify(blocked)); assert.equal(userRow(cmdC.id)[0], '1');
  const detailBlocked = await ok(`/auth/users/${cmdC.id}`, { token: admin }); assert.ok(detailBlocked.impedimentosBaja.some((b) => b.vueloCodigo === fC.code));
  const roleBlocked = (await call(`/auth/users/${cmdC.id}`, { method: 'PUT', token: admin, body: { nombre: 'Cmd', apellido: 'E2E' + MARK, roles: ['DTS'], activo: true }, expect: [409] })).data; assert.equal(roleBlocked.code, 'USER_ROLE_HAS_OPERATIONAL_ASSIGNMENTS'); assert.ok(roleBlocked.impedimentos.length >= 1);
  assert.equal(one(`SELECT id_usuario_comandante FROM vuelos WHERE id_vuelos=${fC.id}`), String(cmdC.id), 'no se reasigna ni se cancela nada automáticamente'); assert.equal(stateOf(fC.id), 'PLANIFICADO'); assert.equal(count(`SELECT COUNT(*) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=${cmdC.id} AND r.codigo_rol=N'COMANDANTE'`), 1);
  await call(`/flights/${fC.id}/cancel`, { method: 'POST', token: ops.token, body: cancelBody });
  // un bloqueo documental de la cuenta se libera al desactivarla (no queda recurso bloqueado)
  const fLock = await planned(cmdC); const form = new FormData(); form.append('documentTypeCode', (await ok('/catalogs/document-types', { token: ops.token }))[0].codigo); form.append('nombreDocumento', 'Doc ' + MARK); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'doc.pdf');
  const up = await fetch(BASE + '/flights/' + fLock.id + '/documents/pdf', { method: 'POST', headers: { Authorization: 'Bearer ' + cmdC.token }, body: form }); assert.equal(up.status, 200, 'carga del documento'); const doc = await up.json();
  await call(`/documents/${doc.id}/lock`, { method: 'POST', token: cmdC.token }); assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_usuario_propietario=${cmdC.id}`), 1, 'bloqueo adquirido');
  sql(`UPDATE dbo.bloqueos_documento_vuelo SET fecha_vencimiento=DATEADD(MINUTE,30,SYSUTCDATETIME()) WHERE id_documentos_vuelo=${doc.id} AND id_usuario_propietario=${cmdC.id}`);
  assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${doc.id} AND fecha_vencimiento>SYSUTCDATETIME()`), 1, 'el bloqueo debe seguir vigente por 30 minutos antes de probar su liberación');
  await call(`/flights/${fLock.id}/cancel`, { method: 'POST', token: ops.token, body: cancelBody });
  await call(`/auth/users/${cmdC.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'baja con documento bloqueado' } });
  assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_usuario_propietario=${cmdC.id} AND fecha_vencimiento > SYSUTCDATETIME()`), 0, 'el bloqueo vence al desactivar'); assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_usuario_propietario=${cmdC.id}`), 1, 'el registro se conserva'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_usuario_comandante=${cmdC.id}`), 2, 'los vuelos históricos conservan al comandante');
  const expiredLease = await ok(`/documents/${doc.id}/lock`, { token: ops.token });
  assert.equal(expiredLease.active, false, 'el lease de la cuenta desactivada ya no está vigente');
  // El vuelo quedó cancelado: sus documentos son de sólo consulta, así que el rechazo es por estado y no por un lease ajeno (la
  // recuperación del lease en un vuelo abierto se comprueba en e2e-documentos.cjs, bloque H).
  const successorLock = await call(`/documents/${doc.id}/lock`, { method: 'POST', token: ops.token, expect: [400] });
  assert.match(successorLock.data.error, /sólo consulta documental/);
  assert.equal(count(`SELECT COUNT(*) FROM versiones_documento_vuelo WHERE id_documentos_vuelo=${doc.id}`), 1, 'la baja no elimina la version documental');
  const cmdCdetail = await ok(`/audit?entityType=USER&entityId=${cmdC.id}&operation=USUARIO_DESACTIVADO`, { token: admin }); assert.ok((await ok(`/audit/events/${cmdCdetail.items[0].id}`, { token: admin })).changes.some((c) => c.field === 'bloqueosDocumentalesLiberados'), 'la baja informa los bloqueos liberados');
  // informe final pendiente: bloquea; presentado y aprobado, deja de bloquear
  const cmdR = await newCommander('ucmdr'); const fR = await planned(cmdR); await approveRoute(fR.id, cmdR.token, ops.token); await call(`/flights/${fR.id}/start`, { method: 'POST', token: ops.token }); await call(`/auth/users/${cmdR.id}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [409] });
  await call(`/flights/${fR.id}/finish`, { method: 'POST', token: ops.token }); const pendingReport = (await call(`/auth/users/${cmdR.id}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [409] })).data; assert.ok(pendingReport.impedimentos.some((b) => b.tipo === 'INFORME_FINAL_PENDIENTE' && b.vueloCodigo === fR.code), JSON.stringify(pendingReport));
  await call(`/auth/users/${cmdR.id}`, { method: 'PUT', token: admin, body: { nombre: 'Cmd', apellido: 'E2E' + MARK, roles: ['DTS'], activo: true }, expect: [409] });
  const obligation = (await ok('/final-reports/mine', { token: cmdR.token })).find((x) => x.flightId === fR.id); await ok(`/final-reports/${obligation.id}/submit`, { method: 'POST', token: cmdR.token, body: { texto: 'Informe ' + MARK, horasVuelo: 1.5, combustibleConsumidoLitros: 300, incidentes: 'Ninguno' } });
  await call(`/auth/users/${cmdR.id}/deactivate`, { method: 'PATCH', token: admin, body: {} }); await call(`/auth/users/${cmdR.id}/reactivate`, { method: 'PATCH', token: admin, body: { nombre: 'Cmd', apellido: 'E2E' + MARK, roles: ['COMANDANTE'] } });
  assert.equal(count(`SELECT COUNT(*) FROM usuarios WHERE id_usuarios=${cmdR.id} AND esta_activo=1`), 1);
  // DTS con una contrapropuesta que espera su respuesta
  const dtsP = await createUser(admin, 'DTS', 'udtsp'); const when = futureSlot(); const fP = (await ok('/flights', { method: 'POST', token: dtsP.token, body: { ...requestBody(fmt(new Date(when.getTime() + 5 * 86400000))), patientId: (await ok('/patients', { method: 'POST', token: dtsP.token, body: { nombre: 'Pend', apellido: MARK + 'p' } })).id } })).id;
  await ok(`/flights/${fP}/schedule/counterproposal`, { method: 'POST', token: ops.token, body: { salida: fmt(new Date(when.getTime() + 9 * 86400000)), motivo: 'No hay aeronave' } });
  const dtsBlocked = (await call(`/auth/users/${dtsP.id}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [409] })).data; assert.ok(dtsBlocked.impedimentos.some((b) => b.tipo === 'RESPUESTA_DTS_PENDIENTE'));
  await call(`/auth/users/${dtsP.id}`, { method: 'PUT', token: admin, body: { nombre: 'Dts', apellido: 'E2E' + MARK, roles: ['CENTRO_OPERACIONES'], activo: true }, expect: [409] });
  const proposal = (await ok(`/flights/${fP}`, { token: dtsP.token })).negociacion.filter((n) => n.tipo === 'CO_CONTRAPROPUESTA').pop(); await ok(`/flights/${fP}/schedule/response`, { method: 'POST', token: dtsP.token, body: { aceptar: true, propuestaId: proposal.id } });
  await call(`/auth/users/${dtsP.id}/deactivate`, { method: 'PATCH', token: admin, body: {} }); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_usuario_solicitante=${dtsP.id}`), 1, 'la solicitud conserva a su solicitante inactivo');
  pass('C responsabilidades: baja y retiro del rol de comandante bloqueados por un vuelo planificado (409 con el vuelo, sin reasignar ni cancelar nada), liberados al cancelarse; informe final pendiente bloquea hasta presentarse; vuelos terminados no bloquean; DTS con respuesta pendiente bloqueado y liberado tras responder; un lease documental de 30 min sigue vigente antes de la baja, se libera, lo adquiere otro operador y conserva la version');

  // ---------- D: carreras entre bajas / cambios de rol y asignaciones ----------
  const rounds = 10, outcomes = { assignFirst: 0, deactivateFirst: 0 }; const roleOutcomes = { assignFirst: 0, roleFirst: 0 };
  const sanitaryApproved = async () => { const w = futureSlot(); const id = (await ok('/flights', { method: 'POST', token: dtsA.token, body: requestBody(fmt(new Date(w.getTime() + (6 + Math.floor(Math.random() * 40)) * 86400000))) })).id; await call(`/flights/${id}/schedule/accept`, { method: 'POST', token: ops.token }); return id; };
  for (let i = 0; i < rounds; i++) {
    const cmd = await newCommander('urace' + i), flight = await sanitaryApproved(), plane = await newPlane();
    const lag = [0, 10, 30, 60, 100, 150, 220, 300, 400, 550][i]; const [assign, off] = await Promise.all([call(`/flights/${flight}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: plane.id, comandanteId: cmd.id }, expect: [200, 400, 409] }), new Promise((r) => setTimeout(r, lag)).then(() => call(`/auth/users/${cmd.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'carrera' }, expect: [200, 409] }))]);
    const inactive = userRow(cmd.id)[0] === '0'; const assigned = one(`SELECT ISNULL(CAST(id_usuario_comandante AS varchar),'NULL') FROM vuelos WHERE id_vuelos=${flight}`) === String(cmd.id);
    assert.ok(!(inactive && assigned && stateOf(flight) !== 'CANCELADO'), `ronda ${i}: una cuenta inactiva quedó como comandante de un vuelo vigente (${assign.status}/${off.status})`);
    assert.equal(assigned, assign.status === 200, `ronda ${i}: asignación ${assign.status} vs vuelo`); assert.equal(inactive, off.status === 200, `ronda ${i}: baja ${off.status} vs cuenta`); assert.ok(!(assign.status === 200 && off.status === 200)); assert.ok(assign.status === 200 || off.status === 200, 'al menos una de las dos operaciones prospera');
    if (assigned) outcomes.assignFirst++; else outcomes.deactivateFirst++;
    const cmd2 = await newCommander('urole' + i), flight2 = await sanitaryApproved(), plane2 = await newPlane();
    const [assign2, roles2] = await Promise.all([call(`/flights/${flight2}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: plane2.id, comandanteId: cmd2.id }, expect: [200, 400, 409] }), new Promise((r) => setTimeout(r, lag)).then(() => call(`/auth/users/${cmd2.id}`, { method: 'PUT', token: admin, body: { nombre: 'Cmd', apellido: 'E2E' + MARK, roles: ['DTS'], activo: true }, expect: [200, 409] }))]);
    const hasRole = count(`SELECT COUNT(*) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=${cmd2.id} AND r.codigo_rol=N'COMANDANTE'`) === 1; const assigned2 = one(`SELECT ISNULL(CAST(id_usuario_comandante AS varchar),'NULL') FROM vuelos WHERE id_vuelos=${flight2}`) === String(cmd2.id);
    assert.ok(!(assigned2 && !hasRole), `ronda ${i}: comandante sin el rol COMANDANTE en un vuelo vigente (${assign2.status}/${roles2.status})`); assert.equal(assigned2, assign2.status === 200); assert.equal(!hasRole, roles2.status === 200);
    if (assigned2) roleOutcomes.assignFirst++; else roleOutcomes.roleFirst++;
  }
  const reactivatedCommander = await newCommander('ureactivaterace');
  await call(`/auth/users/${reactivatedCommander.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'preparacion de carrera de reactivacion' } });
  const reactivationFlight = await sanitaryApproved(), reactivationPlane = await newPlane();
  const [assignmentRace, reactivationRace] = await Promise.all([
    call(`/flights/${reactivationFlight}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: reactivationPlane.id, comandanteId: reactivatedCommander.id }, expect: [200, 400, 409] }),
    call(`/auth/users/${reactivatedCommander.id}/reactivate`, { method: 'PATCH', token: admin, body: { nombre: 'Cmd', apellido: 'E2E' + MARK, roles: ['COMANDANTE'] }, expect: [200, 409] })
  ]);
  assert.equal(reactivationRace.status, 200, 'la reactivacion debe concluir');
  assert.equal(userRow(reactivatedCommander.id)[0], '1');
  assert.equal(count(`SELECT COUNT(*) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles WHERE ur.id_usuarios=${reactivatedCommander.id} AND r.codigo_rol=N'COMANDANTE'`), 1);
  const assignedAfterReactivate = one(`SELECT ISNULL(CAST(id_usuario_comandante AS varchar),'NULL') FROM vuelos WHERE id_vuelos=${reactivationFlight}`) === String(reactivatedCommander.id);
  assert.equal(assignedAfterReactivate, assignmentRace.status === 200, 'la asignacion debe reflejar su respuesta HTTP');
  assert.ok(!(assignedAfterReactivate && userRow(reactivatedCommander.id)[0] !== '1'));
  if (!assignedAfterReactivate) assert.equal(stateOf(reactivationFlight), 'NULL');
  pass(`reactivacion concurrente con una asignacion: estado ${assignmentRace.status}/${reactivationRace.status}, cuenta activa y rol COMANDANTE coherente`);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN usuarios u ON u.id_usuarios=v.id_usuario_comandante JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE u.esta_activo=0 AND e.codigo_estado_vuelo IN (N'PLANIFICADO',N'EN_CURSO',N'PENDIENTE_CONFIRMACION_COMANDANTE',N'PENDIENTE_RESPUESTA_OPERACIONES') AND v.motivo_vuelo LIKE N'%${MARK}%'`), 0);
  pass(`D carreras reales: ${rounds} rondas de baja contra asignación (${JSON.stringify(outcomes)}) y ${rounds} de cambio de rol contra asignación (${JSON.stringify(roleOutcomes)}); ninguna dejó un comandante inactivo o sin rol en un vuelo vigente y siempre prosperó exactamente una de las dos`);

  // ---------- E: bajas y restablecimientos simultáneos ----------
  const dup = await createUser(admin, 'DTS', 'udup'); const twice = await Promise.all([call(`/auth/users/${dup.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'a' }, expect: [200, 409] }), call(`/auth/users/${dup.id}/deactivate`, { method: 'PATCH', token: admin, body: { motivo: 'b' }, expect: [200, 409] })]);
  assert.deepEqual(twice.map((x) => x.status).sort(), [200, 409]); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE entidad_id=${dup.id} AND tipo_entidad=N'USER' AND operacion=N'USUARIO_DESACTIVADO'`), 1, 'una sola baja auditada');
  const rs = await createUser(admin, 'DTS', 'ureset'); const v0 = Number(userRow(rs.id)[3]);
  const resets = await Promise.all(Array.from({ length: 4 }, () => call(`/auth/users/${rs.id}/credential-reset`, { method: 'POST', token: admin, expect: [200, 409] }))); const okResets = resets.filter((x) => x.status === 200);
  assert.ok(okResets.length >= 1); assert.equal(Number(userRow(rs.id)[3]), v0 + okResets.length, 'cada restablecimiento confirmado invalida las credenciales'); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE entidad_id=${rs.id} AND operacion=N'CONTRASENA_RESTABLECIDA'`), okResets.length);
  let valid = 0; for (const x of okResets) if ((await login(rs.name, x.data.contrasenaTemporal)).status === 200) valid++; assert.equal(valid, 1, 'sólo la última contraseña temporal confirmada es válida');
  await call(`/auth/users/${adminId}/credential-reset`, { method: 'POST', token: admin, expect: [400] }); await call(`/auth/users/${adminId}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [400] }); await call(`/auth/users/${adminId}`, { method: 'PUT', token: admin, body: { nombre: 'Administrador', apellido: 'Inicial', roles: ['DTS'], activo: true }, expect: [403] });
  pass(`E simultaneidad: dos bajas de la misma cuenta -> 1 baja y 1 conflicto (un solo evento); ${resets.length} restablecimientos simultáneos (${okResets.length} confirmados) dejan una sola contraseña válida y una versión de credenciales coherente; el administrador no puede restablecer, desactivar ni quitarse el rol a sí mismo`);

  // ---------- F: búsqueda, paginación y autorización ----------
  // La prueba verifica una página llena de 100; en una base recién creada se
  // agregan usuarios DTS sintéticos hasta alcanzar ese tamaño, sin tocar admins.
  const activeBeforePageFixture = count("SELECT COUNT(*) FROM usuarios WHERE esta_activo=1");
  for (let i = activeBeforePageFixture; i < 100; i++) await createUser(admin, 'DTS', 'userpage' + i);
  const totalActive = count("SELECT COUNT(*) FROM usuarios WHERE esta_activo=1"), totalInactive = count('SELECT COUNT(*) FROM usuarios WHERE esta_activo=0');
  const t0 = Date.now(); const pg = await ok('/auth/users/search?status=ACTIVOS&size=100', { token: admin }); const elapsed = Date.now() - t0;
  assert.equal(pg.total, totalActive); assert.equal(pg.totalPages, Math.ceil(totalActive / 100)); assert.equal(pg.items.length, 100); assert.ok(elapsed < 3000, `listado de 100 en ${elapsed} ms`);
  const seen = new Set(); for (let p = 0; p < pg.totalPages; p++) for (const x of (await ok(`/auth/users/search?status=ACTIVOS&size=100&page=${p}`, { token: admin })).items) { assert.ok(!seen.has(x.id), 'sin repetidos'); seen.add(x.id); } assert.equal(seen.size, totalActive);
  assert.equal((await ok('/auth/users/search?status=INACTIVOS&size=100', { token: admin })).total, totalInactive); assert.equal((await ok('/auth/users/summary', { token: admin })).inactivos, totalInactive);
  assert.equal((await ok(`/auth/users/search?q=${encodeURIComponent('Ciclo E2E' + MARK)}&status=TODOS`, { token: admin })).total, 1); assert.equal((await ok(`/auth/users/search?q=${dniA}&status=TODOS`, { token: admin })).items[0].id, idA);
  const roleCount = count("SELECT COUNT(DISTINCT u.id_usuarios) FROM usuarios u JOIN usuarios_roles ur ON ur.id_usuarios=u.id_usuarios JOIN roles r ON r.id_roles=ur.id_roles WHERE u.esta_activo=1 AND r.codigo_rol=N'ADMINISTRADOR'"); assert.equal((await ok('/auth/users/search?status=ACTIVOS&role=ADMINISTRADOR&size=100', { token: admin })).total, roleCount);
  assert.equal((await ok(`/auth/users/search?q=${encodeURIComponent("%'; DROP TABLE usuarios;--")}&status=TODOS`, { token: admin })).total, 0); assert.ok(count('SELECT COUNT(*) FROM usuarios') > 0);
  for (const q of ['size=0', 'size=101', 'page=-1', 'status=ROTO', 'role=a%20b', 'page=1000&size=100']) await call(`/auth/users/search?${q}`, { token: admin, expect: [400] });
  const roleList = await ok('/auth/roles', { token: admin }); assert.ok(roleList.some((x) => x.codigo === 'ADMINISTRADOR') && roleList.some((x) => x.codigo === 'COMANDANTE'));
  const cmdD = await createUser(admin, 'COMANDANTE', 'ucmdd'); const nonAdmins = [ops, dtsA, cmdD, { token: undefined }];
  for (const who of nonAdmins) for (const [m, p, b] of [['GET', '/auth/users'], ['GET', '/auth/users/search'], ['GET', '/auth/users/summary'], ['GET', `/auth/users/${idA}`], ['GET', '/auth/roles'], ['POST', `/auth/users/${idA}/credential-reset`], ['PATCH', `/auth/users/${idA}/deactivate`, {}], ['PATCH', `/auth/users/${idA}/reactivate`, { nombre: 'x', apellido: 'y', roles: ['ADMINISTRADOR'] }], ['PUT', `/auth/users/${idA}`, putBody(['ADMINISTRADOR'])], ['POST', '/auth/users', createBody('X', dniSeq(), ['ADMINISTRADOR'])]]) {
    const res = await call(p, { method: m, token: who.token, body: b, expect: who.token ? [403] : [401] }); assert.ok(!JSON.stringify(res.data || '').includes('$2a$')); }
  const before2 = userRow(dtsA.id); await call('/auth/me/password', { method: 'POST', token: dtsA.token, body: { passwordActual: PASSWORD, nuevaPassword: 'Tercera-Clave-' + MARK, confirmacionPassword: 'Tercera-Clave-' + MARK, id: idA, userId: idA } });
  assert.equal((await login(nameA, NEW_PASSWORD)).status, 200, 'la contraseña de otro usuario no cambia por manipular identificadores'); assert.ok(Number(userRow(dtsA.id)[3]) > Number(before2[3]));
  assert.equal((await call('/auth/me', { token: dtsA.token, expect: [401] })).status, 401);
  pass(`F consulta: listado de ${totalActive} activas paginado por el servidor (${elapsed} ms por 100) sin repetidos, total de inactivas y resumen idénticos a SQL, búsqueda por nombre/DNI y filtro por rol, inyección tratada como texto, 6 parámetros inválidos -> 400; los 10 endpoints administrativos devuelven 403 a Operaciones/DTS/Comandante y 401 sin credenciales; no se modifica la contraseña ajena`);

  // ---------- I: vencimiento del código de activación con el reloj de negocio ----------
  const setClock = (ms) => ok('/e2e/clock', { method: 'PUT', token: admin, body: ms === null ? { reset: true } : { instant: new Date(ms).toISOString() } });
  try {
    const dniE = dniSeq(), nameE = 'vence' + MARK; const codeE = (await call('/auth/users', { method: 'POST', token: admin, body: createBody('Vence', dniE, ['DTS']) })).data.codigo; const idE = Number(one(`SELECT u.id_usuarios FROM usuarios u JOIN personas p ON p.id_personas=u.id_personas WHERE p.dni=N'${dniE}'`));
    await setClock(Date.now() + 25 * 3600000);
    const late = await activate(dniE, codeE, nameE); assert.equal(late.status, 400); assert.match(late.data.error, /venci/); assert.equal(userRow(idE)[1], 'PENDIENTE_ACTIVACION', 'un código vencido no activa la cuenta');
    const fresh = (await call(`/auth/users/${idE}/activation-code`, { method: 'POST', token: admin })).data.codigo; assert.notEqual(fresh, codeE);
    assert.equal((await activate(dniE, codeE, nameE)).status, 400, 'el código reemplazado deja de valer'); assert.equal((await activate(dniE, fresh, nameE)).status, 204);
    await setClock(null); await tokenOf(nameE, PASSWORD); assert.ok(auditOps(idE).includes('CODIGO_ACTIVACION_REGENERADO'));
  } finally { await setClock(null); }
  pass('I activación: con el reloj de negocio adelantado 25 h el código vence (400) sin activar la cuenta, al regenerarlo el código anterior queda invalidado y el nuevo activa la cuenta; la regeneración queda auditada');

  // ---------- G: historial, usuarios desactivados y regresión de acceso ----------
  const deactivatedActorEvents = await ok(`/audit?actorId=${cmdC.id}&size=100`, { token: admin }); assert.ok(deactivatedActorEvents.total >= 1 && deactivatedActorEvents.items.every((e) => e.actor.active === false), 'los eventos de una cuenta desactivada siguen mostrando a su responsable');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_usuario_comandante=${cmdC.id}`), 2); assert.equal(count(`SELECT COUNT(*) FROM personas p JOIN usuarios u ON u.id_personas=p.id_personas WHERE u.id_usuarios=${cmdC.id}`), 1);
  const allSecrets = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad IN (N'USER',N'USER_ROLE') AND (valores_nuevos LIKE N'%$2a$%' OR valores_nuevos LIKE N'%eyJ%' OR valores_nuevos LIKE N'%assword%' OR valores_anteriores LIKE N'%$2a$%') AND valores_nuevos NOT LIKE N'%temporaryPasswordIssued%'`); assert.equal(allSecrets, 0, 'ningún evento de usuarios contiene secretos');
  const mine = await ok('/auth/me', { token: finalToken }); assert.ok(!JSON.stringify(mine).toLowerCase().includes('hash'));
  pass('G historial: los eventos de una cuenta desactivada siguen mostrando a su responsable, sus vuelos y su persona se conservan y ningún evento de usuarios contiene hashes, tokens ni contraseñas');
  console.log(`E2E usuarios OK: ${passed} bloques; marca ${MARK}`);
  // la base habitual no se toca: sólo lectura
  const habitual = spawnSync('docker', ['exec', '-i', 'vuelos-sanitarios-sqlserver-1', 'bash', '-c', 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -C -d vuelos_sanitarios -W -h -1 -i /dev/stdin'], { input: 'SELECT TOP 1 version FROM flyway_schema_history ORDER BY installed_rank DESC\nGO\n', encoding: 'utf8' });
  assert.equal(habitual.stdout.split(/\r?\n/)[0].trim(), habitualVersionAtStart, 'la base habitual conserva la versión de Flyway que tenía al empezar'); pass(`H la base habitual permanece en V${habitualVersionAtStart}, la que tenía al empezar (consulta de sólo lectura)`);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
