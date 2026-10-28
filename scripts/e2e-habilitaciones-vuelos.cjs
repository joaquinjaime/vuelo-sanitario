/* I-5.6: la política de suficiencia y el ciclo de las habilitaciones frente a los vuelos, contra SQL Server real del stack E2E aislado (Flyway >= V59).
 * Uso: node scripts/e2e-habilitaciones-vuelos.cjs   (requiere el analizador ClamAV del perfil antimalware para poder verificar documentación)
 *  A) el contexto del vuelo (tipo de operación y categoría de la aeronave) entra en toda evaluación: creación operativa, asignación directa, replanificación.
 *  B) la baja de una política o la revocación posterior a la asignación NO altera el vuelo ni borra la asignación: lo refleja la elegibilidad y genera una
 *     alerta única para Operaciones; sin elegibilidad el inicio se rechaza y al restablecerse se permite.
 *  C) una revocación con el vuelo en curso no cambia el vuelo.
 *  D) carreras reales: baja de política contra asignación, verificación de la renovación contra asignación, revocación contra inicio. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, PDF, sql, one, count, call, ok, fmt, futureSlot, createUser, ensureCredentialPolicies, approveRoute, waitHealthy } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const delayed = (ms, fn) => new Promise((r) => setTimeout(r, ms)).then(fn);
const race = (offset, first, second) => Promise.all([offset >= 0 ? first() : delayed(-offset, first), offset > 0 ? delayed(offset, second) : second()]);
const OFFSETS = [0, 15, -15, 40, -40, 90, -90, 0];
const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && DB_NAME === 'vuelos_sanitarios_e2e', 'El backend no apunta a la base E2E');
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 59, 'se requiere Flyway >= V59');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  await ensureCredentialPolicies(admin);
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'hvops'), ops2 = await createUser(admin, 'OPERACIONES', 'hvops2');
  let province, airports;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (a.length >= 2) { province = p; airports = a; break; } }
  assert.ok(province, 'se requiere una provincia con 2 aeropuertos');
  let seq = 0;
  const newPlane = (tipo = 'PRUEBA') => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'H' + (++seq)).toUpperCase(), modelo: 'E2E', tipo, capacidadPacientes: 1, capacidadTripulacion: 5, aeropuertoActualId: airports[0].id, activo: true } });
  const policy = (body) => ok('/credential-policies', { method: 'POST', token: admin, body });
  const dropPolicy = (id, reason = 'Baja de política E2E') => call(`/credential-policies/${id}/deactivate`, { method: 'POST', token: admin, body: { reason }, expect: [200, 409] });
  /** Habilitación revisada por un administrador distinto del titular; la documentación pasa por ClamAV real. */
  async function credential(user, role, type, { expires = null, category = null, verify = true } = {}) {
    const c = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: role, type, number: `HV-${MARK}-${user.id}-${role}`, issuer: 'Organismo de prueba', expires, noExpiry: expires === null, aircraftCategory: category } });
    const body = new FormData(); body.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
    const up = await fetch(`${BASE}/professional-credentials/${c.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body }); assert.equal(up.status, 200, 'carga de la credencial');
    if (verify) await call(`/professional-credentials/${c.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual E2E', confirmsSufficiency: true } });
    return c.id;
  }
  const classify = (user, role) => call(`/crew-qualifications/${user.id}/${role}`, { method: 'PUT', token: admin, expect: [204] });
  const commander = async (label, type, opts = {}) => { const u = await createUser(admin, 'COMANDANTE', label); await call(`/catalogs/commanders/${u.id}/location`, { method: 'POST', token: ops.token, body: { locationId: province.id } }); await classify(u, 'COMANDANTE'); u.credential = await credential(u, 'COMANDANTE', type, opts); return u; };
  const medic = async (label, type, opts = {}) => { const u = await createUser(admin, 'DTS', label); await classify(u, 'MEDICO'); u.credential = await credential(u, 'MEDICO', type, opts); return u; };
  const createFlight = (cmd, plane, { tipo = 'REGRESO_BASE', when = futureSlot(), expect = [200] } = {}) => call('/flights/operational', { method: 'POST', token: ops.token, expect, body: { tipoVueloCode: tipo, motivoVuelo: 'Habilitaciones y vuelos ' + MARK, aircraftId: plane.id, comandanteId: cmd.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } });
  const planned = async (cmd, plane, opts = {}) => { const f = (await createFlight(cmd, plane, opts)).data; await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: cmd.token, body: { aceptar: true } }); assert.equal(stateOf(f.id), 'PLANIFICADO'); return { id: f.id, commander: cmd, plane }; };
  const addCrew = (flight, user, role = 'MEDICO', expect = [204]) => call(`/flights/${flight.id}/crew`, { method: 'POST', token: ops.token, body: { userId: user.id, crewRoleCode: role }, expect });
  const crewOf = (flight) => ok(`/flights/${flight.id}/crew`, { token: ops.token });
  const crewRows = (flightId) => count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flightId} AND fecha_baja IS NULL`);
  const alerts = (flightId) => count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${flightId} AND tipo_notificacion=N'CREW_ELIGIBILITY_REVIEW'`);
  const sweep = () => call('/e2e/crew-eligibility/sweep', { method: 'POST', token: admin });
  const start = async (flight, expect = [200]) => { await approveRoute(flight.id, flight.commander.token, ops.token); return call(`/flights/${flight.id}/start`, { method: 'POST', token: ops.token, expect }); };

  // ================= A: el contexto operativo entra en la evaluación =================
  const CMD_TYPE = 'Cmd ' + MARK, MED_TYPE = 'Med ' + MARK;
  const cmdPolicy = await policy({ roleCode: 'COMANDANTE', credentialType: CMD_TYPE, flightTypeCode: 'REGRESO_BASE', aircraftCategory: 'CAT-A', notes: 'Sólo regreso a base con aeronaves CAT-A' });
  const medPolicy = await policy({ roleCode: 'MEDICO', credentialType: MED_TYPE, notes: 'Cualquier operación' });
  const planeA = await newPlane('CAT-A'), planeB = await newPlane('CAT-B'), planeA2 = await newPlane('CAT-A');
  const good = await commander('hvgood', CMD_TYPE, { category: 'CAT-A' }), wrongCategory = await commander('hvwrongc', CMD_TYPE, { category: 'CAT-B' });
  // Con otras políticas activas de alcance general el código exacto es HABILITACION_NO_SUFICIENTE; sin ninguna aplicable sería POLITICA_HABILITACION_NO_CONFIGURADA. Lo esencial: no es elegible.
  const NOT_COVERED = /^(POLITICA_HABILITACION_NO_CONFIGURADA|HABILITACION_NO_SUFICIENTE)$/;
  assert.match((await createFlight(good, planeB, { expect: [409] })).data.code, NOT_COVERED, 'la política del tipo no cubre la categoría CAT-B');
  assert.match((await createFlight(good, planeA, { tipo: 'TRASLADO_OPERATIVO', expect: [409] })).data.code, NOT_COVERED, 'la política del tipo no cubre ese tipo de operación');
  assert.equal((await createFlight(wrongCategory, planeA, { expect: [409] })).data.code, 'HABILITACION_NO_SUFICIENTE', 'la habilitación declara otra categoría');
  assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_aeronaves IN (${planeA.id},${planeB.id})`), 0, 'las creaciones rechazadas no dejan vuelos');
  const flightA = await planned(good, planeA); pass('A el tipo de operación y la categoría de la aeronave deciden la suficiencia en la creación operativa (409 con el código real, sin efectos)');

  // asignación manipulada de recursos: el mismo evaluador
  const medA = await medic('hvmed', MED_TYPE), medNoPolicy = await medic('hvmednp', 'Sin política ' + MARK);
  assert.match((await addCrew(flightA, medNoPolicy, 'MEDICO', [409])).data.code, NOT_COVERED);
  await addCrew(flightA, medA); assert.equal(crewRows(flightA.id), 2); pass('A2 la tripulación adicional se evalúa con la misma política: sin política configurada para su tipo no se asigna');

  // ================= B: la política desaparece después de la asignación =================
  const before = { state: stateOf(flightA.id), rows: crewRows(flightA.id) };
  await dropPolicy(medPolicy.id);
  const view = (await crewOf(flightA)).find((r) => r.userId === medA.id);
  assert.match(view.elegibilidadCodigo, NOT_COVERED); assert.equal(stateOf(flightA.id), before.state); assert.equal(crewRows(flightA.id), before.rows, 'la asignación histórica no se elimina');
  const opsAlerts = alerts(flightA.id); assert.ok(opsAlerts >= 1, 'Operaciones recibe una alerta');
  await sweep(); await sweep(); assert.equal(alerts(flightA.id), opsAlerts, 'las alertas no se duplican al repetir la revisión');
  const blocked = await start(flightA, [409]); assert.match(blocked.data.code, NOT_COVERED); assert.equal(stateOf(flightA.id), 'PLANIFICADO');
  const again = await policy({ roleCode: 'MEDICO', credentialType: MED_TYPE, notes: 'Restablecida' }); assert.ok(again.id !== medPolicy.id);
  await start(flightA); assert.equal(stateOf(flightA.id), 'EN_CURSO'); pass('B la baja de la política vuelve no elegible al tripulante sin tocar la asignación, alerta una vez a Operaciones, bloquea el inicio y al restablecerla el inicio procede');

  // ================= C: revocación con el vuelo en curso =================
  const rowsBefore = crewRows(flightA.id);
  await call(`/professional-credentials/${medA.credential}/decision/REVOCADA`, { method: 'POST', token: admin, body: { notes: 'Revocación con el vuelo en curso' } });
  assert.equal(stateOf(flightA.id), 'EN_CURSO'); assert.equal(crewRows(flightA.id), rowsBefore);
  assert.equal((await crewOf(flightA)).find((r) => r.userId === medA.id).elegibilidadCodigo, 'HABILITACION_REVOCADA'); pass('C la revocación con el vuelo en curso se refleja en la elegibilidad pero no altera el vuelo ni borra la asignación');

  // ================= D: carreras reales en SQL Server =================
  const outcomes = { politica: [], renovacion: [], inicio: [] };
  for (let round = 0; round < 6; round++) { // baja de la política contra asignación
    const type = `RMed ${MARK} ${round}`, p = await policy({ roleCode: 'MEDICO', credentialType: type });
    const person = await medic('hvr1m' + round, type), flight = await planned(await commander('hvr1c' + round, CMD_TYPE, { category: 'CAT-A' }), await newPlane('CAT-A'));
    const [assigned, dropped] = await race(OFFSETS[round], () => addCrew(flight, person, 'MEDICO', [204, 409]), () => dropPolicy(p.id));
    assert.equal(dropped.status, 200); const rows = count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flight.id} AND id_usuarios=${person.id} AND fecha_baja IS NULL`);
    if (assigned.status === 204) { assert.equal(rows, 1); await sweep(); assert.ok(alerts(flight.id) >= 1, 'asignado y sin política: debe haber alerta'); outcomes.politica.push('asignado'); }
    else { assert.match(assigned.data.code, NOT_COVERED); assert.equal(rows, 0); outcomes.politica.push('rechazado'); }
  }
  for (let round = 0; round < 6; round++) { // verificación de la renovación contra asignación
    const type = `RRen ${MARK} ${round}`; await policy({ roleCode: 'MEDICO', credentialType: type });
    const person = await medic('hvr2m' + round, type, { expires: isoDay(Date.now() + 10 * DAY) }), flight = await planned(await commander('hvr2c' + round, CMD_TYPE, { category: 'CAT-A' }), await newPlane('CAT-A'));
    const renewal = await ok(`/professional-credentials/${person.credential}/renew`, { method: 'POST', token: admin, body: { roleCode: 'MEDICO', type, number: `HV-${MARK}-${person.id}-R`, issuer: 'Organismo de prueba', expires: isoDay(Date.now() + 900 * DAY), noExpiry: false } });
    const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'renovacion.pdf'); assert.equal((await fetch(`${BASE}/professional-credentials/${renewal.id}/documents?purpose=RENOVACION`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form })).status, 200);
    assert.equal((await addCrew(flight, person, 'MEDICO', [409])).data.code, 'HABILITACION_VENCIDA', 'la vigente vence antes de la salida');
    const [assigned, verified] = await race(OFFSETS[round], () => addCrew(flight, person, 'MEDICO', [204, 409]), () => call(`/professional-credentials/${renewal.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Renovación', confirmsSufficiency: true } }));
    assert.equal(verified.status, 200); const rows = count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flight.id} AND id_usuarios=${person.id} AND fecha_baja IS NULL`);
    if (assigned.status === 204) { assert.equal(rows, 1); assert.equal(one(`SELECT estado_verificacion FROM habilitaciones_profesionales WHERE id_habilitaciones_profesionales=${renewal.id}`), 'VERIFICADA'); outcomes.renovacion.push('asignado'); }
    else { assert.equal(assigned.data.code, 'HABILITACION_VENCIDA'); assert.equal(rows, 0); outcomes.renovacion.push('rechazado'); }
    assert.equal((await addCrew(flight, person, 'MEDICO', rows ? [409] : [204])).status, rows ? 409 : 204, 'tras verificarse la renovación la asignación procede'); // ya integrante ⇒ 409; si no, ahora sí
  }
  for (let round = 0; round < 6; round++) { // revocación contra inicio
    const cmd = await commander('hvr3c' + round, CMD_TYPE, { category: 'CAT-A' }), flight = await planned(cmd, await newPlane('CAT-A'));
    await approveRoute(flight.id, cmd.token, ops.token);
    const [started, revoked] = await race(OFFSETS[round], () => call(`/flights/${flight.id}/start`, { method: 'POST', token: ops.token, expect: [200, 409] }), () => call(`/professional-credentials/${cmd.credential}/decision/REVOCADA`, { method: 'POST', token: admin, body: { notes: 'Carrera de inicio ' + round } }));
    assert.equal(revoked.status, 200);
    if (started.status === 200) { assert.equal(stateOf(flight.id), 'EN_CURSO'); await sweep(); assert.ok(alerts(flight.id) >= 1, 'iniciado y revocado: debe haber alerta'); outcomes.inicio.push('iniciado'); }
    else { assert.equal(started.data.code, 'HABILITACION_REVOCADA'); assert.equal(stateOf(flight.id), 'PLANIFICADO', 'un inicio rechazado no cambia el vuelo'); outcomes.inicio.push('rechazado'); }
  }
  pass('D carreras reales sin estados incoherentes: ' + JSON.stringify(outcomes));
  console.log(`\n${passed} comprobaciones aprobadas (e2e-habilitaciones-vuelos)`);
})().catch((e) => { console.error(e); process.exit(1); });
