/* I-5.5: roles de tripulación y clasificaciones contra el backend y SQL Server E2E aislados (Flyway >= V58). Sólo crea registros marcados.
 * Uso: node scripts/e2e-roles-clasificaciones.cjs
 *  A) catálogo de funciones (distinto de los roles de acceso) y permisos de consulta.
 *  B) ciclo de la clasificación con historial (V58): alta idempotente, retiro con motivo sin borrar, reclasificación, restricciones SQL y auditoría.
 *  C) la clasificación y la habilitación se exigen también al asignar al comandante por llamadas directas, al replanificar y al aceptar.
 *  D) negativos de tripulación: función inválida, sin clasificación, habilitación vencida/revocada/no verificada, duplicado, solape, permisos.
 *  E) cambios administrativos contra vuelos que dependen de la clasificación (409 CLASIFICACION_EN_USO) e historial.
 *  F) carreras reales en SQL Server: retiro contra asignación, retiro contra asignación del comandante, dos retiros, reemplazo simultáneo, revocación contra asignación.
 *  G) vuelo sanitario con funciones clasificadas, sin imponer una composición. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PDF, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const delayed = (ms, fn) => new Promise((r) => setTimeout(r, ms)).then(fn);
const race = (offset, first, second) => Promise.all([offset >= 0 ? first() : delayed(-offset, first), offset > 0 ? delayed(offset, second) : second()]);
const OFFSETS = [0, 15, -15, 40, -40, 90, -90, 0];
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const isoDay = (d) => d.toISOString().slice(0, 10);
const DAY = 86400000, TZ = -3 * 3600000, civilDay = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && DB_NAME === 'vuelos_sanitarios_e2e', 'El backend no apunta a la base E2E');
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 58, 'se requiere Flyway >= V58');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'rcops'), ops2 = await createUser(admin, 'OPERACIONES', 'rcops2'), dts = await createUser(admin, 'DTS', 'rcdts');
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }), l = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (a.length >= 2 && l.length >= 2) { province = p; airports = a; localities = l; break; } }
  assert.ok(province, 'se requiere una provincia con 2 aeropuertos y 2 localidades');
  let seq = 0;
  const newPlane = async (capacity = 4) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'R' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: capacity, aeropuertoActualId: airports[0].id, activo: true } });
  const classify = (user, role, expect = [204], token = admin) => call(`/crew-qualifications/${user.id}/${role}`, { method: 'PUT', token, expect });
  const retire = (user, role, motivo, expect = [204], token = admin) => call(`/crew-qualifications/${user.id}/${role}${motivo === undefined ? '' : '?motivo=' + encodeURIComponent(motivo)}`, { method: 'DELETE', token, expect });
  /** Habilitación para la función: sube un PDF y la verifica con otro administrador (el titular de las cuentas de prueba nunca es el revisor). */
  async function credential(user, role, { expires = null, verify = true } = {}) {
    const c = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: role, type: 'Documento E2E', number: `RC-${MARK}-${user.id}-${role}`, issuer: 'Organismo de prueba', expires, noExpiry: expires === null, notes: 'Ensayo aislado' } });
    const body = new FormData(); body.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
    assert.equal((await fetch(`${BASE}/professional-credentials/${c.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body })).status, 200);
    if (verify) await call(`/professional-credentials/${c.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual E2E', confirmsSufficiency: true } });
    return c.id;
  }
  const member = async (role, label, opts = {}) => { const u = await createUser(admin, opts.access || 'DTS', label); if (opts.classify !== false) await classify(u, role); if (opts.credential !== false) u.credential = await credential(u, role, opts); return u; };
  const commander = async (label, { classified = true, creds = true, expires = null } = {}) => { const u = await createUser(admin, 'COMANDANTE', label); await call(`/catalogs/commanders/${u.id}/location`, { method: 'POST', token: ops.token, body: { locationId: province.id } }); if (classified) await classify(u, 'COMANDANTE'); if (creds) u.credential = await credential(u, 'COMANDANTE', { expires }); return u; };
  const createFlight = async (cmd, plane, { token = ops.token, expect = [200], when = futureSlot(), hours = 2, destination = airports[1] } = {}) => call('/flights/operational', { method: 'POST', token, expect, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Roles y clasificaciones ' + MARK, aircraftId: plane.id, comandanteId: cmd.id, destinoId: destination.id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + hours * 3600000)) } });
  const planned = async (cmd, opts = {}) => { const plane = await newPlane(opts.capacity); const f = (await createFlight(cmd, plane, opts)).data; await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: cmd.token, body: { aceptar: true } }); assert.equal(stateOf(f.id), 'PLANIFICADO'); return { id: f.id, plane, commander: cmd }; };
  const addCrew = (flight, user, role, expect = [204], token = ops.token) => call(`/flights/${flight.id}/crew`, { method: 'POST', token, body: { userId: user.id, crewRoleCode: role }, expect });
  const crewOf = (flight, history = false, token = ops.token) => ok(`/flights/${flight.id}/crew${history ? '?history=true' : ''}`, { token });
  const rows = (userId, role) => sql(`SELECT CONCAT(c.id_clasificaciones_tripulacion,'|',CASE WHEN c.fecha_baja IS NULL THEN 'VIGENTE' ELSE 'RETIRADA' END,'|',ISNULL(c.motivo_baja,'-')) FROM clasificaciones_tripulacion c JOIN roles_tripulacion r ON r.id_roles_tripulacion=c.id_roles_tripulacion WHERE c.id_usuarios=${userId} AND r.codigo_rol_tripulacion=N'${role}' ORDER BY c.id_clasificaciones_tripulacion`).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const vigentes = (userId, role) => count(`SELECT COUNT(*) FROM clasificaciones_tripulacion c JOIN roles_tripulacion r ON r.id_roles_tripulacion=c.id_roles_tripulacion WHERE c.id_usuarios=${userId} AND r.codigo_rol_tripulacion=N'${role}' AND c.fecha_baja IS NULL`);
  const crewRows = (flightId, userId) => count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flightId} AND id_usuarios=${userId} AND fecha_baja IS NULL`);
  const auditOf = (entityId, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'CREW_QUALIFICATION' AND entidad_id=${entityId} AND operacion=N'${op}'`);

  // ================= A: funciones de tripulación frente a roles de acceso =================
  const catalog = await ok('/catalogs/crew-roles', { token: ops.token });
  assert.deepEqual(catalog.map((r) => r.codigo).sort(), ['COMANDANTE', 'COPILOTO', 'ENFERMERO', 'MEDICO']);
  const byCode = Object.fromEntries(catalog.map((r) => [r.codigo, r]));
  assert.equal(byCode.COMANDANTE.asignacion, 'RECURSOS'); assert.equal(byCode.COMANDANTE.requiereLicencia, true); assert.equal(byCode.COMANDANTE.requiereRolAcceso, true);
  for (const code of ['COPILOTO', 'MEDICO', 'ENFERMERO']) { assert.equal(byCode[code].asignacion, 'TRIPULACION'); assert.equal(byCode[code].requiereClasificacion, true); assert.equal(byCode[code].requiereHabilitacionVerificada, true); assert.equal(byCode[code].requiereLicencia, false); assert.equal(byCode[code].requiereRolAcceso, false); }
  for (const t of [admin, ops.token, (await createUser(admin, 'COMANDANTE', 'rcview')).token]) assert.equal((await call('/catalogs/crew-roles', { token: t })).status, 200);
  assert.equal((await call('/catalogs/crew-roles', { token: dts.token, expect: [403] })).status, 403, 'el DTS no consulta el catálogo de funciones');
  assert.equal(count(`SELECT COUNT(*) FROM roles_tripulacion`), 4); assert.equal(count(`SELECT COUNT(*) FROM roles r WHERE r.codigo_rol IN (SELECT codigo_rol_tripulacion FROM roles_tripulacion) AND r.codigo_rol=N'COPILOTO'`), 0, 'ninguna función de tripulación es un rol de acceso (excepto COMANDANTE, que además lo exige)');
  assert.equal((await call('/crew-qualifications/' + ops.id + '/PILOTO_INEXISTENTE', { method: 'PUT', token: admin, expect: [400] })).status, 400);
  pass('A el catálogo expone las 4 funciones con sus requisitos reales (distintas de los roles de acceso); lo consultan Operaciones, administrador y comandante, no el DTS; no se acepta una función inexistente');

  // ================= B: ciclo de la clasificación =================
  const persona = await createUser(admin, 'DTS', 'rcperson');
  assert.equal((await call(`/crew-qualifications/${persona.id}/MEDICO`, { method: 'PUT', token: ops.token, expect: [403] })).status, 403, 'sólo ADMINISTRADOR clasifica');
  assert.equal((await call(`/crew-qualifications/${persona.id}`, { token: ops.token, expect: [403] })).status, 403);
  await classify(persona, 'MEDICO'); await classify(persona, 'MEDICO'); // idempotente
  assert.equal(rows(persona.id, 'MEDICO').length, 1); const firstId = Number(rows(persona.id, 'MEDICO')[0].split('|')[0]);
  let view = await ok(`/crew-qualifications/${persona.id}`, { token: admin }); assert.equal(view.length, 1); assert.equal(view[0].vigente, true); assert.ok(view[0].clasificadoPor); assert.equal(view[0].elegible, false); assert.equal(view[0].elegibilidadCodigo, 'HABILITACION_AUSENTE', 'clasificada pero sin habilitación: no es elegible');
  assert.equal((await call('/crew-qualifications/999999999/MEDICO', { method: 'PUT', token: admin, expect: [400] })).status, 400, 'la persona debe existir');
  persona.credential = await credential(persona, 'MEDICO'); view = await ok(`/crew-qualifications/${persona.id}`, { token: admin }); assert.equal(view[0].elegible, true); assert.equal(view[0].elegibilidadCodigo, 'ELEGIBLE');
  assert.equal(auditOf(firstId, 'CREATE'), 1);
  await retire(persona, 'MEDICO', 'Cambio de función E2E');
  assert.deepEqual(rows(persona.id, 'MEDICO'), [`${firstId}|RETIRADA|Cambio de función E2E`], 'la fila se conserva como historial');
  assert.equal((await ok(`/crew-qualifications/${persona.id}`, { token: admin })).length, 0); const hist = await ok(`/crew-qualifications/${persona.id}?history=true`, { token: admin });
  assert.equal(hist.length, 1); assert.equal(hist[0].vigente, false); assert.equal(hist[0].motivoBaja, 'Cambio de función E2E'); assert.ok(hist[0].retiradoPor && hist[0].fechaBaja && hist[0].clasificadoPor && hist[0].fechaClasificacion);
  assert.equal((await retire(persona, 'MEDICO', undefined, [409])).data.code, 'CLASIFICACION_NO_VIGENTE'); assert.equal(auditOf(firstId, 'RETIRE'), 1);
  await classify(persona, 'MEDICO'); assert.equal(rows(persona.id, 'MEDICO').length, 2); assert.equal(vigentes(persona.id, 'MEDICO'), 1, 'reclasificar crea una fila nueva y conserva la anterior');
  await retire(persona, 'MEDICO'); assert.match(rows(persona.id, 'MEDICO')[1], /RETIRADA\|RETIRO_ADMINISTRATIVO/, 'sin motivo se registra el retiro administrativo');
  const dup = sql(`SELECT TOP 1 CONCAT(id_usuarios,',',id_roles_tripulacion,',',id_usuario_clasificador) FROM clasificaciones_tripulacion WHERE id_usuarios=${persona.id}`).split(',');
  await classify(persona, 'MEDICO');
  let duplicateRejected = false; try { sql(`INSERT INTO clasificaciones_tripulacion (id_usuarios,id_roles_tripulacion,id_usuario_clasificador) VALUES (${dup[0]},${dup[1]},${dup[2]})`); } catch (e) { duplicateRejected = /ux_clasificacion_tripulacion_vigente|duplicate key|Cannot insert duplicate/i.test(e.sqlOutput || e.message); }
  assert.equal(duplicateRejected, true, 'SQL Server rechaza una segunda clasificación vigente');
  let halfRetired = false; try { sql(`UPDATE clasificaciones_tripulacion SET fecha_baja=SYSUTCDATETIME() WHERE id_clasificaciones_tripulacion=(SELECT MAX(id_clasificaciones_tripulacion) FROM clasificaciones_tripulacion WHERE id_usuarios=${persona.id})`); } catch (e) { halfRetired = /ck_clasificacion_baja|CHECK/i.test(e.sqlOutput || e.message); }
  assert.equal(halfRetired, true, 'una baja sin actor ni motivo viola la restricción');
  assert.equal(count('SELECT COUNT(*) FROM (SELECT id_usuarios,id_roles_tripulacion FROM clasificaciones_tripulacion WHERE fecha_baja IS NULL GROUP BY id_usuarios,id_roles_tripulacion HAVING COUNT(*)>1) x'), 0);
  pass('B clasificar es idempotente y exige ADMINISTRADOR; retirar conserva la fila con fecha, actor y motivo (V58); reclasificar crea otra fila; SQL rechaza un duplicado vigente y una baja incompleta; la clasificación sola no vuelve elegible a nadie sin habilitación; auditoría CREATE/RETIRE');

  // ================= C: el comandante exige clasificación y habilitación en todas las vías =================
  const good = await commander('rcgood'); const noClass = await commander('rcnoclass', { classified: false }); const noCred = await commander('rcnocred', { creds: false });
  const revoked = await commander('rcrevoked'); await call(`/professional-credentials/${revoked.credential}/decision/REVOCADA`, { method: 'POST', token: admin, body: { notes: 'Revocación E2E roles' } });
  const unverified = await commander('rcunver', { creds: false }); unverified.credential = await credential(unverified, 'COMANDANTE', { verify: false });
  const soon = new Date(Date.now() + 10 * DAY), expiring = await commander('rcexp', { expires: isoDay(soon) });
  const plane0 = await newPlane();
  for (const [who, code] of [[noClass, 'CLASIFICACION_INCOMPATIBLE'], [noCred, 'HABILITACION_AUSENTE'], [revoked, 'HABILITACION_REVOCADA'], [unverified, 'HABILITACION_NO_VERIFICADA']]) {
    const r = await createFlight(who, plane0, { expect: [409] }); assert.equal(r.data.code, code, `creación operativa con ${who.name}`); assert.equal(r.data.userId, who.id);
  }
  const far = await createFlight(expiring, plane0, { when: new Date(Date.now() + 60 * DAY), expect: [409] }); assert.equal(far.data.code, 'HABILITACION_VENCIDA', 'la habilitación vence antes de la salida');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_aeronaves=${plane0.id}`), 0, 'las llamadas manipuladas no crean vuelos');
  const okFlight = await planned(good); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes vt JOIN roles_tripulacion r ON r.id_roles_tripulacion=vt.id_roles_tripulacion WHERE vt.id_vuelos=${okFlight.id} AND vt.id_usuarios=${good.id} AND r.codigo_rol_tripulacion=N'COMANDANTE' AND vt.fecha_baja IS NULL`), 1);
  // asignación de recursos a una solicitud sanitaria por llamada directa
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0], surname = MARK.replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)]);
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Roles', apellido: surname, dni: String(30000000 + Math.floor(Math.random() * 9999990)) } });
  const request = async () => { const f = await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority.codigo, motivoVuelo: 'Sanitario roles ' + MARK, fechaSolicitada: `${civilDay(Date.now() + (40 + seq++) * DAY)}T10:00:00`, extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } }); await ok(`/flights/${f.id}/schedule/accept`, { method: 'POST', token: ops.token }); return f; };
  const sanitary = await request(), sPlane = await newPlane();
  for (const [who, code] of [[noClass, 'CLASIFICACION_INCOMPATIBLE'], [revoked, 'HABILITACION_REVOCADA']]) {
    const r = await call(`/flights/${sanitary.id}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: sPlane.id, comandanteId: who.id }, expect: [409] }); assert.equal(r.data.code, code);
  }
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${sanitary.id} AND id_aeronaves IS NULL AND id_usuario_comandante IS NULL`), 1, 'la asignación rechazada no cambia el vuelo');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${sanitary.id} AND id_estados_vuelo IS NULL`), 1); pass('C una asignación manipulada del comandante sin clasificación, sin habilitación, revocada, no verificada o vencida antes de la salida responde 409 con el código real y no cambia nada (operativa y sanitaria)');

  // aceptación: la habilitación se revoca mientras la asignación espera la confirmación
  const waiting = await commander('rcwait'), wPlane = await newPlane(); const wf = (await createFlight(waiting, wPlane)).data;
  await call(`/professional-credentials/${waiting.credential}/decision/REVOCADA`, { method: 'POST', token: admin, body: { notes: 'Revocación posterior a la asignación' } });
  const accept = await call(`/flights/${wf.id}/commander-assignment/response`, { method: 'POST', token: waiting.token, body: { aceptar: true }, expect: [409] }); assert.equal(accept.data.code, 'HABILITACION_REVOCADA'); assert.equal(stateOf(wf.id), 'PENDIENTE_CONFIRMACION_COMANDANTE', 'la asignación no cambia en silencio');
  await call(`/flights/${wf.id}/commander-assignment/response`, { method: 'POST', token: waiting.token, body: { aceptar: false, motivo: 'Mi habilitación fue revocada' } }); assert.equal(stateOf(wf.id), 'PENDIENTE_REPLANIFICACION');
  const replan = await call(`/flights/${wf.id}/operational-replanning`, { method: 'POST', token: ops.token, body: { aircraftId: wPlane.id, comandanteId: waiting.id, destinoId: airports[1].id, salida: fmt(futureSlot()), llegada: fmt(new Date(futureSlot().getTime() + 7200000)) }, expect: [409] }); assert.equal(replan.data.code, 'HABILITACION_REVOCADA', 'la replanificación tampoco acepta al no elegible');
  pass('C2 si el comandante deja de ser elegible antes de aceptar, aceptar responde 409 sin cambiar el vuelo; puede rechazar, y replanificar con él también se rechaza');

  // ================= D: negativos de tripulación =================
  const W1 = futureSlot(), f1 = await planned(await commander('rcd1'), { when: W1 });
  const med = await member('MEDICO', 'rcmed'), enf = await member('ENFERMERO', 'rcenf'), cop = await member('COPILOTO', 'rccop'), onlyClass = await member('MEDICO', 'rconlyc', { credential: false }), onlyCred = await member('MEDICO', 'rconlycr', { classify: false });
  const opsUser = await createUser(admin, 'OPERACIONES', 'rcaccess'); // rol de acceso sin función de tripulación
  assert.equal((await addCrew(f1, med, 'PILOTO_INEXISTENTE', [400])).status, 400); assert.equal((await addCrew(f1, med, 'COMANDANTE', [400])).status, 400, 'el comandante sólo se asigna con los recursos');
  assert.equal((await addCrew(f1, med, 'ENFERMERO', [409])).data.code, 'CLASIFICACION_INCOMPATIBLE', 'clasificado como médico no cubre la función de enfermero');
  assert.equal((await addCrew(f1, opsUser, 'MEDICO', [409])).data.code, 'CLASIFICACION_INCOMPATIBLE', 'un rol de acceso no equivale a una función de tripulación');
  assert.equal((await addCrew(f1, onlyClass, 'MEDICO', [409])).data.code, 'HABILITACION_AUSENTE', 'la clasificación no sustituye a la habilitación');
  assert.equal((await addCrew(f1, onlyCred, 'MEDICO', [409])).data.code, 'CLASIFICACION_INCOMPATIBLE', 'la habilitación no sustituye a la clasificación');
  for (const [token, label] of [[dts.token, 'DTS'], [admin, 'ADMINISTRADOR']]) assert.equal((await addCrew(f1, med, 'MEDICO', [403], token)).status, 403, label + ' no gestiona la tripulación');
  assert.equal((await call(`/flights/${f1.id}/crew`, { token: dts.token, expect: [403] })).status, 403); assert.equal((await call(`/flights/${f1.id}/crew`, { token: f1.commander.token })).status, 200, 'el comandante consulta su tripulación');
  const candidates = await ok(`/flights/${f1.id}/crew/candidates?role=MEDICO`, { token: ops.token }); const blockedCandidate = candidates.find((c) => c.userId === onlyClass.id);
  assert.ok(blockedCandidate && blockedCandidate.disponible === false && /habilitación/i.test(blockedCandidate.motivoNoDisponible), 'la interfaz recibe el motivo real'); assert.ok(candidates.find((c) => c.userId === med.id).disponible); assert.equal(candidates.some((c) => c.userId === onlyCred.id), false, 'sin clasificación no es candidato');
  await addCrew(f1, med, 'MEDICO'); assert.equal((await addCrew(f1, med, 'MEDICO', [409])).status, 409, 'asignación duplicada');
  assert.equal(count(`SELECT COUNT(*) FROM (SELECT id_usuarios FROM vuelos_tripulantes WHERE id_vuelos=${f1.id} AND fecha_baja IS NULL GROUP BY id_usuarios HAVING COUNT(*)>1) x`), 0);
  const f3 = await planned(await commander('rcd3'), { when: new Date(W1.getTime() + 3600000) }); // se solapa con f1 (2 h)
  const clash = await addCrew(f3, med, 'MEDICO', [409]); assert.equal(clash.data.code, 'CONFLICTO_ASIGNACION', 'la misma persona no integra dos vuelos incompatibles');
  // habilitación revocada y vencida de personas ya clasificadas
  const medRevoked = await member('MEDICO', 'rcmedrev'); await call(`/professional-credentials/${medRevoked.credential}/decision/REVOCADA`, { method: 'POST', token: admin, body: { notes: 'Revocación E2E tripulante' } });
  assert.equal((await addCrew(f1, medRevoked, 'MEDICO', [409])).data.code, 'HABILITACION_REVOCADA');
  const medExpiring = await member('MEDICO', 'rcmedexp', { expires: isoDay(new Date(Date.now() + 10 * DAY)) }); assert.equal((await addCrew(f1, medExpiring, 'MEDICO', [409])).data.code, 'HABILITACION_VENCIDA', 'vence antes de la salida');
  // composición libre: ninguna regla impone médico o enfermero; el sanitario se prueba en G
  await addCrew(f1, enf, 'ENFERMERO'); await addCrew(f1, cop, 'COPILOTO');
  let crew = await crewOf(f1); assert.deepEqual(crew.filter((c) => !c.comandante).map((c) => c.crewRoleCode).sort(), ['COPILOTO', 'ENFERMERO', 'MEDICO']); assert.ok(crew.every((c) => c.elegibilidadCodigo === 'ELEGIBLE'));
  // reemplazo que cambia la función de la misma persona
  const medRow = crew.find((c) => c.userId === med.id); assert.equal((await call(`/flights/${f1.id}/crew/${medRow.id}`, { method: 'PUT', token: ops.token, body: { userId: med.id, crewRoleCode: 'ENFERMERO' }, expect: [409] })).data.code, 'CLASIFICACION_INCOMPATIBLE');
  pass(`D función inválida, comandante por la vía de tripulación, falta de clasificación, falta de habilitación, revocada, vencida, rol de acceso sin función, duplicado, solape de horarios y permisos (DTS y administrador no gestionan; el comandante consulta); la composición queda libre`);

  // ================= E: cambios administrativos frente a vuelos que dependen de la clasificación =================
  const inUse = await retire(med, 'MEDICO', 'Intento con vuelo planificado', [409]); assert.equal(inUse.data.code, 'CLASIFICACION_EN_USO'); assert.ok(inUse.data.vuelos.length >= 1); assert.equal(vigentes(med.id, 'MEDICO'), 1);
  const cmdUse = await retire(good, 'COMANDANTE', 'Intento con vuelo planificado', [409]); assert.equal(cmdUse.data.code, 'CLASIFICACION_EN_USO'); assert.equal(vigentes(good.id, 'COMANDANTE'), 1);
  await approveAndStart(okFlight, good);
  assert.equal((await retire(good, 'COMANDANTE', 'Intento con vuelo en curso', [409])).data.code, 'CLASIFICACION_EN_USO', 'un vuelo en curso también protege la clasificación');
  async function approveAndStart(flight, cmd) { const { approveRoute } = require('./e2e-cierre-support.cjs'); await approveRoute(flight.id, cmd.token, ops.token); await call(`/flights/${flight.id}/start`, { method: 'POST', token: ops.token }); assert.equal(stateOf(flight.id), 'EN_CURSO'); }
  const row = (await crewOf(f1)).find((c) => c.userId === med.id); await call(`/flights/${f1.id}/crew/${row.id}`, { method: 'DELETE', token: ops.token, expect: [204] });
  await retire(med, 'MEDICO', 'Sin vuelos pendientes'); assert.equal(vigentes(med.id, 'MEDICO'), 0);
  const histCrew = await crewOf(f1, true); const old = histCrew.find((c) => c.id === row.id); assert.equal(old.vigente, false); assert.equal(old.crewRoleCode, 'MEDICO', 'el historial del vuelo conserva la función interpretada'); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes vt JOIN roles_tripulacion r ON r.id_roles_tripulacion=vt.id_roles_tripulacion WHERE vt.id_vuelos_tripulantes=${row.id} AND r.codigo_rol_tripulacion=N'MEDICO' AND vt.fecha_baja IS NOT NULL AND vt.motivo_baja=N'RETIRO'`), 1);
  assert.equal((await addCrew(f1, med, 'MEDICO', [409])).data.code, 'CLASIFICACION_INCOMPATIBLE', 'retirada la clasificación no se vuelve a asignar');
  pass('E retirar una clasificación en uso (vuelo planificado o en curso, tripulante o comandante) responde 409 con los vuelos; tras retirar la asignación se puede retirar y la asignación histórica conserva su función; no se reasigna sin clasificación');

  // ================= F: carreras reales en SQL Server =================
  const outcomes = { retiroAsignacion: [], retiroComandante: [], dosRetiros: [], reemplazo: [], revocacion: [] };
  for (let round = 0; round < OFFSETS.length; round++) { // retirar la clasificación contra asignar a esa función
    const person = await member('MEDICO', 'rcr1' + round), flight = await planned(await commander('rcr1c' + round));
    const [assigned, retired] = await race(OFFSETS[round], () => addCrew(flight, person, 'MEDICO', [204, 409]), () => retire(person, 'MEDICO', 'Carrera ' + round, [204, 409]));
    assert.ok(!(assigned.status === 204 && retired.status === 204), `ronda ${round}: ambas confirmaron`); assert.ok(assigned.status === 204 || retired.status === 204, `ronda ${round}: ninguna confirmó`);
    if (assigned.status === 204) { assert.equal(retired.data.code, 'CLASIFICACION_EN_USO'); assert.equal(vigentes(person.id, 'MEDICO'), 1); assert.equal(crewRows(flight.id, person.id), 1); outcomes.retiroAsignacion.push('asignación'); }
    else { assert.equal(assigned.data.code, 'CLASIFICACION_INCOMPATIBLE'); assert.equal(vigentes(person.id, 'MEDICO'), 0); assert.equal(crewRows(flight.id, person.id), 0); outcomes.retiroAsignacion.push('retiro'); }
  }
  for (let round = 0; round < OFFSETS.length; round++) { // retirar la clasificación de comandante contra asignarlo a un vuelo nuevo
    const cmd = await commander('rcr2' + round), plane = await newPlane();
    const [created, retired] = await race(OFFSETS[round], () => createFlight(cmd, plane, { expect: [200, 409] }), () => retire(cmd, 'COMANDANTE', 'Carrera ' + round, [204, 409]));
    assert.ok(!(created.status === 200 && retired.status === 204), `ronda ${round}: el vuelo se creó con una clasificación retirada`); assert.ok(created.status === 200 || retired.status === 204, `ronda ${round}: ninguna confirmó`);
    if (created.status === 200) { assert.equal(retired.data.code, 'CLASIFICACION_EN_USO'); assert.equal(vigentes(cmd.id, 'COMANDANTE'), 1); outcomes.retiroComandante.push('vuelo'); }
    else { assert.equal(created.data.code, 'CLASIFICACION_INCOMPATIBLE'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_usuario_comandante=${cmd.id}`), 0); outcomes.retiroComandante.push('retiro'); }
  }
  for (let round = 0; round < 4; round++) { // dos retiros simultáneos
    const person = await member('COPILOTO', 'rcr3' + round); const [a, b] = await race(OFFSETS[round], () => retire(person, 'COPILOTO', 'Uno', [204, 409]), () => retire(person, 'COPILOTO', 'Dos', [204, 409]));
    assert.deepEqual([a.status, b.status].sort(), [204, 409]); assert.equal([a, b].find((r) => r.status === 409).data.code, 'CLASIFICACION_NO_VIGENTE'); assert.equal(rows(person.id, 'COPILOTO').length, 1); assert.equal(vigentes(person.id, 'COPILOTO'), 0); outcomes.dosRetiros.push('uno');
  }
  for (let round = 0; round < 4; round++) { // dos usuarios reemplazan la misma asignación
    const flight = await planned(await commander('rcr4' + round)), current = await member('MEDICO', 'rcr4m' + round), x = await member('MEDICO', 'rcr4x' + round), y = await member('MEDICO', 'rcr4y' + round);
    await addCrew(flight, current, 'MEDICO'); const target = (await crewOf(flight)).find((c) => c.userId === current.id);
    const swap = (token, user) => call(`/flights/${flight.id}/crew/${target.id}`, { method: 'PUT', token, body: { userId: user.id, crewRoleCode: 'MEDICO' }, expect: [204, 409] });
    const [r1, r2] = await race(OFFSETS[round], () => swap(ops.token, x), () => swap(ops2.token, y));
    assert.deepEqual([r1.status, r2.status].sort(), [204, 409], `ronda ${round}`); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes vt JOIN roles_tripulacion r ON r.id_roles_tripulacion=vt.id_roles_tripulacion WHERE vt.id_vuelos=${flight.id} AND vt.fecha_baja IS NULL AND r.codigo_rol_tripulacion=N'MEDICO'`), 1, 'una única asignación vigente');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flight.id} AND id_usuarios=${current.id} AND fecha_baja IS NOT NULL AND motivo_baja=N'REEMPLAZO'`), 1); outcomes.reemplazo.push(r1.status === 204 ? 'x' : 'y');
  }
  for (let round = 0; round < 6; round++) { // la habilitación se revoca mientras se asigna
    const person = await member('MEDICO', 'rcr5' + round), flight = await planned(await commander('rcr5c' + round));
    const [assigned, revoked2] = await race(OFFSETS[round], () => addCrew(flight, person, 'MEDICO', [204, 409]), () => call(`/professional-credentials/${person.credential}/decision/REVOCADA`, { method: 'POST', token: admin, body: { notes: 'Carrera ' + round }, expect: [200, 409] }));
    assert.ok(assigned.status === 204 || assigned.data.code === 'HABILITACION_REVOCADA'); const view2 = (await crewOf(flight)).find((c) => c.userId === person.id);
    if (assigned.status === 204) { assert.equal(revoked2.status, 200); assert.equal(view2.elegibilidadCodigo, 'HABILITACION_REVOCADA', 'la asignación queda marcada: no inicia'); outcomes.revocacion.push('asignada y marcada'); }
    else { assert.equal(view2, undefined); outcomes.revocacion.push('rechazada'); }
  }
  assert.equal(count('SELECT COUNT(*) FROM (SELECT id_vuelos,id_usuarios FROM vuelos_tripulantes WHERE fecha_baja IS NULL GROUP BY id_vuelos,id_usuarios HAVING COUNT(*)>1) x'), 0, 'sin duplicados vigentes');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes vt JOIN usuarios u ON u.id_usuarios=vt.id_usuarios JOIN roles_tripulacion r ON r.id_roles_tripulacion=vt.id_roles_tripulacion WHERE vt.fecha_baja IS NULL AND r.codigo_rol_tripulacion<>N'COMANDANTE' AND u.nombre_usuario LIKE N'${MARK}%' AND NOT EXISTS (SELECT 1 FROM clasificaciones_tripulacion c WHERE c.id_usuarios=vt.id_usuarios AND c.id_roles_tripulacion=vt.id_roles_tripulacion AND c.fecha_baja IS NULL)`), 0, 'toda asignación vigente de estos ensayos descansa en una clasificación vigente');
  pass(`F carreras reales: retiro/asignación [${outcomes.retiroAsignacion.join(',')}], retiro/comandante [${outcomes.retiroComandante.join(',')}], dos retiros ${outcomes.dosRetiros.length} veces con un ganador, reemplazo simultáneo [${outcomes.reemplazo.join(',')}], revocación/asignación [${outcomes.revocacion.join(',')}]; en cada ronda una sola operación incompatible confirma y el estado final es coherente`);

  // ================= G: vuelo sanitario con funciones clasificadas =================
  const sCmd = await commander('rcsan'); const sFlight = await request(), sPlane2 = await newPlane(); await ok(`/flights/${sFlight.id}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: sPlane2.id, comandanteId: sCmd.id } });
  assert.equal(stateOf(sFlight.id), 'PLANIFICADO'); const sMed = await member('MEDICO', 'rcsanmed'), sEnf = await member('ENFERMERO', 'rcsanenf'), sCop = await member('COPILOTO', 'rcsancop');
  const sProbe = { id: sFlight.id };
  const sDeparture = new Date(one(`SELECT CONVERT(varchar(19),fecha_planificada_salida,126) FROM vuelos WHERE id_vuelos=${sFlight.id}`) + 'Z');
  await call(`/flights/${sFlight.id}/operational-planning`, { method: 'POST', token: sCmd.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: new Date(sDeparture.getTime() + 3 * 3600000).toISOString().slice(0, 19) } });
  await addCrew(sProbe, sMed, 'MEDICO'); await addCrew(sProbe, sEnf, 'ENFERMERO'); assert.equal((await addCrew(sProbe, sEnf, 'MEDICO', [409])).data.code, 'CLASIFICACION_INCOMPATIBLE', 'un profesional no cubre cualquier función');
  const sCrew = await crewOf(sProbe); assert.deepEqual(sCrew.map((c) => c.crewRoleCode).sort(), ['COMANDANTE', 'ENFERMERO', 'MEDICO']); assert.ok(sCrew.every((c) => c.elegibilidadCodigo === 'ELEGIBLE'));
  assert.equal((await call(`/flights/${sFlight.id}/crew`, { token: sCmd.token })).status, 200, 'el comandante ve la tripulación de su vuelo');
  assert.ok(count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${sFlight.id} AND tipo_notificacion=N'CREW_ASSIGNED' AND id_usuarios IN (${sMed.id},${sEnf.id})`) >= 2, 'los tripulantes fueron notificados'); assert.ok(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${sFlight.id} AND tipo_entidad=N'FLIGHT_CREW' AND operacion=N'CREATE'`) >= 3, 'auditoría del comandante y de los dos tripulantes');
  assert.equal((await retire(sMed, 'MEDICO', 'Intento en vuelo sanitario', [409])).data.code, 'CLASIFICACION_EN_USO');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes vt WHERE vt.id_vuelos=${sFlight.id} AND vt.fecha_baja IS NULL AND NOT EXISTS (SELECT 1 FROM roles_tripulacion r WHERE r.id_roles_tripulacion=vt.id_roles_tripulacion)`), 0);
  pass('G el vuelo sanitario usa comandante, médico y enfermero clasificados y habilitados (sin imponer composición), rechaza una función no clasificada, notifica y audita; la clasificación en uso queda protegida');
  console.log(`\nE2E ROLES Y CLASIFICACIONES COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E ROLES Y CLASIFICACIONES:', e.stack || e); process.exit(1); });
