/* E2E de estabilización de la revisión de rutas (I-4.1) sobre el stack aislado (base vuelos_sanitarios_e2e, SQL Server real).
 * A) Rutas históricas sin contexto ni recorrido (como las anteriores a V37 tras V55): lectura sin errores, ninguna aprobación automática, datos
 *    intactos, interpretación según el estado del vuelo y finalización de vuelos ya iniciados sin bloqueo.
 * B) Creación inicial concurrente de la ruta de un mismo vuelo (varias rondas, ambos órdenes) y contra un cambio de aeronave.
 * C) Límites numéricos de altitud, distancia y duración con persistencia comprobada por SQL (DECIMAL(8,2) / INT) y sin truncamientos.
 * D) Auditoría: rechazos de inicio persistidos aunque el inicio se revierta, sin eventos por lecturas, y decisiones/invalidaciones que se
 *    revierten junto con la operación cuando falla su auditoría (trigger temporal retirado al terminar).
 * Sólo crea registros marcados y nunca borra datos. Uso: node scripts/e2e-rutas-estabilizacion.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, DB_NAME, MARK, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const row = (q) => one(q).split('|').map((x) => x.trim());
const auditCount = (id, op, entity = 'FLIGHT_ROUTE') => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${id} AND tipo_entidad=N'${entity}' AND operacion=N'${op}'`);
const routeCount = (id) => count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${id}`);
const delayed = (ms, fn) => new Promise((r) => setTimeout(r, ms)).then(fn);
const race = (offset, first, second, third) => Promise.all([offset >= 0 ? first() : delayed(-offset, first), offset > 0 ? delayed(offset, second) : second(), ...(third ? [delayed(Math.abs(offset) / 2, third)] : [])]);
const OFFSETS = [0, 20, -20, 60, -60, 120, -120, 0];
/** Columnas de una versión que no pertenecen al estado de revisión: deben quedar intactas al reemplazarla. */
const dataOf = (id, version) => one(`SELECT CONCAT(id_rutas_vuelo,'#',id_vuelos,'#',version,'#',ISNULL(CAST(altitud_pies AS varchar),'-'),'#',ISNULL(CAST(distancia_nm AS varchar),'-'),'#',ISNULL(CAST(tiempo_estimado_minutos AS varchar),'-'),'#',ISNULL(observaciones_ruta,'-'),'#',CONVERT(varchar(30),fecha_creacion,126),'#',id_usuario_creador,'#',ISNULL(recorrido_planificado,'-'),'#',ISNULL(CAST(id_aeropuerto_alternativo AS varchar),'-'),'#',ISNULL(contexto_operativo,'-')) FROM rutas_vuelo WHERE id_vuelos=${id} AND version=${version}`);

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && DB_NAME === 'vuelos_sanitarios_e2e', 'El backend no apunta a la base E2E');
  assert.ok(Number(one("SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL")) >= 55);
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'sops'), ops2 = await createUser(admin, 'OPERACIONES', 'sops2');
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'], cmd = {}; for (const n of names) { cmd[n] = await createUser(admin, 'COMANDANTE', 'st' + n); await provision(admin, cmd[n]); }
  let province, airports; for (const p of await ok('/catalogs/provinces', { token: ops.token })) { airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (airports.length >= 3) { province = p; break; } }
  assert.ok(province); for (const n of names) await call(`/catalogs/commanders/${cmd[n].id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0; const newPlane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'T' + (++seq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  async function planned(commander) {
    const plane = await newPlane(), when = futureSlot();
    const f = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Estabilización ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } });
    await call(`/flights/${f.id}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } });
    assert.equal(stateOf(f.id), 'PLANIFICADO'); return { id: f.id, plane };
  }
  const route = (id, t = ops.token) => ok(`/flights/${id}/route`, { token: t });
  const put = (id, t, body, expect = [200]) => call(`/flights/${id}/route`, { method: 'PUT', token: t, body, expect });
  const decide = (id, t, kind, body, expect = [200]) => call(`/flights/${id}/route/${kind}`, { method: 'POST', token: t, body, expect });
  const start = (id, expect = [200], t = ops.token) => call(`/flights/${id}/start`, { method: 'POST', token: t, expect });
  const asLegacy = (id, version, state) => sql(`UPDATE rutas_vuelo SET recorrido_planificado=NULL, id_aeropuerto_alternativo=NULL, contexto_operativo=NULL, estado_revision='${state}', id_usuario_presenta=NULL, fecha_presentacion=NULL, id_usuario_revisor=NULL, fecha_revision=NULL, observaciones_revision=NULL, fecha_invalidacion=NULL, causa_invalidacion=NULL, motivo_modificacion=NULL WHERE id_vuelos=${id} AND version=${version}`);
  pass('fixtures: 2 usuarios de Operaciones, 7 comandantes habilitados y aeropuertos del catálogo');

  // ================= A: rutas históricas =================
  const L1 = await planned(cmd.a); await put(L1.id, cmd.a.token, { version: 0, recorrido: 'Ruta de V37', altitudPies: 8000, distanciaNm: 120.25, tiempoEstimadoMinutos: 70, observaciones: 'histórica' });
  asLegacy(L1.id, 1, 'BORRADOR'); const before = dataOf(L1.id, 1); assert.match(before, /#-#-#-$/, 'sin recorrido planificado, alternativo ni contexto');
  for (const who of [ops.token, cmd.a.token, admin]) { const v = await route(L1.id, who); assert.equal(v.estado, 'BORRADOR'); assert.equal(v.versiones[0].recorrido, null); assert.equal(v.versiones[0].condiciones, null); assert.equal(v.inicio.codigo, 'RUTA_NO_PRESENTADA'); assert.equal(v.puedePresentar, false); assert.equal(v.puedeRevisar, false); }
  assert.equal((await ok('/flights/route-statuses', { token: ops.token })).find((s) => s.flightId === L1.id).estado, 'BORRADOR');
  await ok(`/audit/flights/${L1.id}`, { token: ops.token });
  assert.equal((await decide(L1.id, cmd.a.token, 'submit', { version: 1 }, [409])).data.code, 'RUTA_REQUIERE_REVISION', 'no puede presentarse una ruta cuyas condiciones no se registraron');
  assert.equal((await decide(L1.id, ops.token, 'approve', { version: 1 }, [409])).data.code, 'TRANSICION_RUTA_NO_PERMITIDA');
  assert.equal((await start(L1.id, [409])).data.code, 'RUTA_NO_PRESENTADA');
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${L1.id} AND estado_revision IN ('APROBADA','PENDIENTE_REVISION','DEVUELTA')`), 0, 'sin aprobaciones automáticas');
  await put(L1.id, cmd.a.token, { version: 1, recorrido: 'Ruta confirmada hoy', presentar: true }); // un borrador histórico se reemplaza sin exigir motivo
  assert.equal(dataOf(L1.id, 1), before, 'los datos de la versión histórica quedan intactos'); assert.equal(row(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${L1.id} AND version=1`)[0], 'SIN_REVISION');
  await decide(L1.id, ops.token, 'approve', { version: 2 }); await start(L1.id); assert.equal(stateOf(L1.id), 'EN_CURSO');
  // vuelo ya iniciado con ruta histórica: lectura, bitácora y finalización sin bloqueo
  const L2 = await planned(cmd.b); await approveRoute(L2.id, cmd.b.token, ops.token); await start(L2.id); asLegacy(L2.id, 1, 'SIN_REVISION'); const before2 = dataOf(L2.id, 1);
  const v2 = await route(L2.id, cmd.b.token); assert.equal(v2.estado, 'SIN_REVISION'); assert.equal(v2.inicio.aplica, false); assert.equal(v2.editable, false);
  await call(`/flights/${L2.id}/log`, { method: 'POST', token: ops.token, body: { tipo: 'PREPARACION', descripcion: 'Novedad en vuelo ' + MARK, ocurrido: new Date(Date.now() - 30000).toISOString(), importancia: 'NORMAL' } });
  await put(L2.id, cmd.b.token, { version: 1, recorrido: 'Cambio en vuelo' }, [400]); await decide(L2.id, ops.token, 'approve', { version: 1 }, [400]);
  await call(`/flights/${L2.id}/finish`, { method: 'POST', token: ops.token }); assert.equal(stateOf(L2.id), 'FINALIZADO'); assert.equal(dataOf(L2.id, 1), before2); assert.equal((await route(L2.id)).estado, 'SIN_REVISION');
  assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos=${L2.id}`), 1);
  // contexto ilegible en una versión presentada: se interpreta como revisión requerida, sin errores
  const L3 = await planned(cmd.c); await put(L3.id, cmd.c.token, { version: 0, recorrido: 'Ruta con contexto dañado', presentar: true });
  for (const bad of ['10|11', 'x|y|z|w|v|u', '']) {
    sql(`UPDATE rutas_vuelo SET contexto_operativo=N'${bad}' WHERE id_vuelos=${L3.id} AND version=1`); const v = await route(L3.id);
    assert.equal(v.estado, 'REQUIERE_REVISION', bad); assert.equal(v.puedeRevisar, false); assert.equal((await decide(L3.id, ops.token, 'approve', { version: 1 }, [409])).data.code, 'RUTA_REQUIERE_REVISION'); assert.equal((await start(L3.id, [409])).data.code, 'RUTA_REQUIERE_REVISION');
  }
  pass('A rutas históricas: borrador sin contexto/recorrido legible por todos los perfiles, presentación y aprobación rechazadas con códigos, inicio rechazado, reemplazo con datos intactos y sin motivo; vuelo iniciado con ruta histórica registra bitácora y finaliza sin tocar la ruta; contexto dañado = revisión requerida (sin 500)');

  // ================= B: creación inicial concurrente =================
  const outcomes = [];
  for (let round = 0; round < OFFSETS.length; round++) {
    const C = await planned(cmd.d); const base = { version: 0, recorrido: 'Ruta de carrera ' + round, altitudPies: 9000, distanciaNm: 100.5, tiempoEstimadoMinutos: 60 };
    const t = (extra) => () => put(C.id, cmd.d.token, { ...base, ...extra }, [200, 409]);
    const results = round % 4 === 3 ? await race(OFFSETS[round], t({ presentar: true }), t({ presentar: false }), t({ recorrido: 'Otra ruta de carrera ' + round })) : await race(OFFSETS[round], t({ presentar: round % 2 === 0 }), t({ presentar: round % 2 === 1 }));
    const winners = results.filter((r) => r.status === 200), losers = results.filter((r) => r.status === 409);
    assert.equal(winners.length, 1, `ronda ${round}: exactamente una creación aplicada (${results.map((r) => r.status)})`); assert.ok(losers.every((r) => r.data.code === 'VERSION_RUTA_DESACTUALIZADA'), 'las demás reciben el mismo conflicto determinista');
    assert.equal(routeCount(C.id), 1, 'una sola versión'); assert.deepEqual(row(`SELECT version, es_version_actual FROM rutas_vuelo WHERE id_vuelos=${C.id}`), ['1', '1']);
    assert.equal(auditCount(C.id, 'CREATE'), 1); assert.equal(auditCount(C.id, 'UPDATE'), 0);
    const persisted = row(`SELECT recorrido_planificado, estado_revision FROM rutas_vuelo WHERE id_vuelos=${C.id}`); const view = await route(C.id);
    assert.equal(view.versiones.length, 1); assert.equal(persisted[0], winners[0].data.versiones[0].recorrido, 'lo persistido es lo que respondió el ganador'); assert.equal(persisted[1], view.versiones[0].estado);
    outcomes.push(persisted[0].endsWith(String(round)) && results[0].status === 200 ? 'primero' : 'segundo');
  }
  pass('B creación inicial concurrente: 8 rondas (2 y 3 solicitudes, ambos órdenes) — siempre una única versión 1 vigente, una auditoría CREATE, 409 VERSION_RUTA_DESACTUALIZADA para el resto y lo persistido coincide con la respuesta ganadora (gana ' + outcomes.join(', ') + ')');
  const raceB = [];
  for (let round = 0; round < OFFSETS.length; round++) { // crear la ruta (y presentarla) contra un cambio de aeronave del mismo vuelo
    const C = await planned(cmd.e); const other = await newPlane();
    const results = await race(OFFSETS[round], () => put(C.id, cmd.e.token, { version: 0, recorrido: 'Creación contra replanificación', presentar: true }, [200, 400, 409]), () => call(`/flights/${C.id}/aircraft`, { method: 'POST', token: ops2.token, body: { aircraftId: other.id, motivo: 'Cambio de aeronave por mantenimiento' }, expect: [200, 400, 409] }));
    assert.equal(routeCount(C.id), 1); const view = await route(C.id); const rowv = [one(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${C.id}`), one(`SELECT contexto_operativo FROM rutas_vuelo WHERE id_vuelos=${C.id}`)];
    const aircraftNow = Number(one(`SELECT id_aeronaves FROM vuelos WHERE id_vuelos=${C.id}`));
    if (rowv[0] === 'PENDIENTE_REVISION') { assert.equal(rowv[1].split('|')[4], String(aircraftNow), 'una ruta presentada y vigente se planificó con la aeronave actual'); assert.equal(view.causas.length, 0); assert.equal(auditCount(C.id, 'INVALIDATE'), 0); raceB.push('cambio-primero'); }
    else { assert.equal(rowv[0], 'REQUIERE_REVISION'); assert.equal(auditCount(C.id, 'INVALIDATE'), 1); assert.equal((await start(C.id, [409])).data.code, 'RUTA_REQUIERE_REVISION'); raceB.push('ruta-primero'); }
    assert.ok(results.every((r) => r.status !== 500));
  }
  pass('B creación vs. cambio de aeronave (8 rondas: ' + raceB.join(', ') + '): la ruta presentada coincide con la aeronave actual o queda invalidada con un único evento INVALIDATE');

  // ================= C: límites numéricos =================
  const N = await planned(cmd.f); let version = 0;
  const column = (name) => one(`SELECT CONCAT(t.name,':',c.precision,',',c.scale) FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.rutas_vuelo') AND c.name=N'${name}'`);
  assert.equal(column('altitud_pies'), 'decimal:8,2'); assert.equal(column('distancia_nm'), 'decimal:8,2'); assert.equal(column('tiempo_estimado_minutos').split(':')[0], 'int');
  let accepted = 0, rejected = 0; const raw = (obj) => ({ version, recorrido: 'Límites ' + (accepted + rejected), ...obj });
  const accept = async (label, fields, expectSql) => { const r = await put(N.id, cmd.f.token, { ...raw(fields), ...(fields.__raw || {}) }, [200]); version += 1; accepted++; const got = row(`SELECT ISNULL(CAST(altitud_pies AS varchar),'NULL'), ISNULL(CAST(distancia_nm AS varchar),'NULL'), ISNULL(CAST(tiempo_estimado_minutos AS varchar),'NULL') FROM rutas_vuelo WHERE id_vuelos=${N.id} AND version=${version}`); assert.deepEqual(got, expectSql, label); return r; };
  const reject = async (label, body) => { const n = routeCount(N.id); const r = await put(N.id, cmd.f.token, body, [400]); rejected++; assert.equal(routeCount(N.id), n, label + ': no se creó ninguna versión'); return r; };
  const rawBody = (json) => fetch(`${require('./e2e-cierre-support.cjs').BASE}/flights/${N.id}/route`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cmd.f.token }, body: json }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
  const rawReject = async (label, json) => { const n = routeCount(N.id); const r = await rawBody(json); rejected++; assert.equal(r.status, 400, label + ' -> ' + r.status); assert.equal(routeCount(N.id), n, label); };
  const rawAccept = async (label, json, expectSql) => { const r = await rawBody(json); assert.equal(r.status, 200, label + ' -> ' + JSON.stringify(r.data)); version += 1; accepted++; assert.deepEqual(row(`SELECT ISNULL(CAST(altitud_pies AS varchar),'NULL'), ISNULL(CAST(distancia_nm AS varchar),'NULL'), ISNULL(CAST(tiempo_estimado_minutos AS varchar),'NULL') FROM rutas_vuelo WHERE id_vuelos=${N.id} AND version=${version}`), expectSql, label); };
  const body = (extra) => `{"version":${version},"recorrido":"Límites ${accepted + rejected}"${extra ? ',' + extra : ''}}`;
  await rawAccept('los tres opcionales omitidos', body(''), ['NULL', 'NULL', 'NULL']);
  await rawAccept('nulos explícitos', body('"altitudPies":null,"distanciaNm":null,"tiempoEstimadoMinutos":null'), ['NULL', 'NULL', 'NULL']);
  await rawAccept('altitud 0', body('"altitudPies":0'), ['0.00', 'NULL', 'NULL']);
  await rawAccept('altitud 0.01', body('"altitudPies":0.01'), ['0.01', 'NULL', 'NULL']);
  await rawAccept('altitud 9000.5', body('"altitudPies":9000.5'), ['9000.50', 'NULL', 'NULL']);
  await rawAccept('altitud máxima representable', body('"altitudPies":999999.99'), ['999999.99', 'NULL', 'NULL']);
  await rawAccept('distancia mínima 0.01', body('"distanciaNm":0.01'), ['NULL', '0.01', 'NULL']);
  await rawAccept('distancia 640.5', body('"distanciaNm":640.5'), ['NULL', '640.50', 'NULL']);
  await rawAccept('distancia máxima representable', body('"distanciaNm":999999.99'), ['NULL', '999999.99', 'NULL']);
  await rawAccept('duración 1', body('"tiempoEstimadoMinutos":1'), ['NULL', 'NULL', '1']);
  await rawAccept('duración máxima del entero', body('"tiempoEstimadoMinutos":2147483647'), ['NULL', 'NULL', '2147483647']);
  await rawAccept('los tres valores', body('"altitudPies":12000,"distanciaNm":1500.75,"tiempoEstimadoMinutos":240'), ['12000.00', '1500.75', '240']);
  for (const [label, json] of [['altitud -0.01', '"altitudPies":-0.01'], ['altitud -1', '"altitudPies":-1'], ['altitud 1000000', '"altitudPies":1000000'], ['altitud 999999.999', '"altitudPies":999999.999'], ['altitud 12.345', '"altitudPies":12.345'], ['altitud texto', '"altitudPies":"abc"'], ['altitud booleana', '"altitudPies":true'], ['altitud arreglo', '"altitudPies":[1]'],
    ['distancia 0', '"distanciaNm":0'], ['distancia 0.00', '"distanciaNm":0.00'], ['distancia -5', '"distanciaNm":-5'], ['distancia 0.001', '"distanciaNm":0.001'], ['distancia 1000000', '"distanciaNm":1000000'], ['distancia 999999.999', '"distanciaNm":999999.999'], ['distancia texto', '"distanciaNm":"x"'],
    ['duración 0', '"tiempoEstimadoMinutos":0'], ['duración -1', '"tiempoEstimadoMinutos":-1'], ['duración 1.5 (no se trunca)', '"tiempoEstimadoMinutos":1.5'], ['duración 95.9', '"tiempoEstimadoMinutos":95.9'], ['duración 2147483648', '"tiempoEstimadoMinutos":2147483648'], ['duración texto', '"tiempoEstimadoMinutos":"x"'], ['duración 1e3', '"tiempoEstimadoMinutos":1e3']]) await rawReject(label, body(json));
  await rawReject('versión fraccionaria no se trunca', `{"version":${version}.5,"recorrido":"x"}`); await rawReject('versión negativa', `{"version":-1,"recorrido":"x"}`); await rawReject('sin versión', '{"recorrido":"x"}');
  await rawReject('recorrido vacío', `{"version":${version},"recorrido":""}`); await rawReject('recorrido de 4001 caracteres', `{"version":${version},"recorrido":"${'r'.repeat(4001)}"}`); await rawReject('observaciones de 4001', body(`"observaciones":"${'o'.repeat(4001)}"`)); await rawReject('motivo de 501', body(`"motivoModificacion":"${'m'.repeat(501)}"`));
  await rawAccept('recorrido y observaciones de 4000 caracteres', `{"version":${version},"recorrido":"${'r'.repeat(4000)}","observaciones":"${'o'.repeat(4000)}"}`, ['NULL', 'NULL', 'NULL']);
  assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${N.id}`), version, 'sólo las versiones aceptadas quedaron persistidas'); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${N.id} AND es_version_actual=1`), 1);
  assert.equal(Number((await route(N.id)).versiones[0].recorrido.length), 4000);
  pass(`C límites numéricos: ${accepted} entradas válidas persistidas con su valor exacto en SQL (DECIMAL(8,2) / INT) y ${rejected} inválidas rechazadas con 400 sin crear versiones (incluye 1.5 minutos, que antes se truncaba a 1)`);

  // ================= D: auditoría =================
  const D = await planned(cmd.g); const d = D.id; const events = () => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${d}`);
  const routeEvents = () => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${d} AND tipo_entidad=N'FLIGHT_ROUTE'`);
  assert.equal((await start(d, [409])).data.code, 'RUTA_NO_DEFINIDA'); assert.equal(auditCount(d, 'START_REJECTED'), 1);
  const quiet = events(); for (let i = 0; i < 3; i++) { await route(d); await route(d, cmd.g.token); await ok('/flights/route-statuses', { token: ops.token }); await ok(`/audit/flights/${d}`, { token: ops.token }); await ok(`/flights/${d}`, { token: ops.token }); }
  assert.equal(events(), quiet, 'consultar, refrescar o abrir pantallas no audita');
  await start(d, [403], cmd.g.token); assert.equal(events(), quiet, 'un inicio rechazado por permisos no genera eventos de ruta'); assert.equal((await put(d, ops.token, { version: 0, recorrido: 'x' }, [403])).status, 403); assert.equal(events(), quiet);
  await put(d, cmd.g.token, { version: 0, recorrido: 'Auditoría de rechazos' }); await start(d, [409]); await start(d, [409]); assert.equal(auditCount(d, 'START_REJECTED'), 3, 'cada intento rechazado deja un evento (el 1.º sin ruta, el 2.º y 3.º con borrador)');
  const rejection = JSON.parse(one(`SELECT TOP 1 valores_nuevos FROM eventos_auditoria WHERE id_vuelos=${d} AND operacion=N'START_REJECTED' ORDER BY id_eventos_auditoria DESC`)); assert.deepEqual([rejection.codigo, rejection.version, rejection.estado], ['RUTA_NO_PRESENTADA', 1, 'BORRADOR']);
  assert.equal(stateOf(d), 'PLANIFICADO'); assert.equal(auditCount(d, 'START', 'FLIGHT'), 0, 'el inicio rechazado no registra un inicio');
  // trigger de fallo de auditoría: la operación completa se revierte y no queda una decisión sin su evento
  const failOn = (op) => { const trig = `e2e_fail_${op.toLowerCase()}_${d}`; sql(`EXEC(N'CREATE TRIGGER dbo.${trig} ON dbo.eventos_auditoria AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE id_vuelos=${d} AND tipo_entidad=N''FLIGHT_ROUTE'' AND operacion=N''${op}'') THROW 51000, N''Fallo de prueba'', 1; END');`); return () => sql(`DROP TRIGGER IF EXISTS dbo.${trig}`); };
  const snapshot = () => [routeCount(d), row(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${d} AND es_version_actual=1`)[0], routeEvents(), one(`SELECT id_aeronaves FROM vuelos WHERE id_vuelos=${d}`)].join('|');
  let drop = failOn('SUBMIT'); try { const b = snapshot(); await decide(d, cmd.g.token, 'submit', { version: 1 }, [500]); assert.equal(snapshot(), b, 'presentar se revirtió completo'); } finally { drop(); }
  await decide(d, cmd.g.token, 'submit', { version: 1 }); assert.equal(auditCount(d, 'SUBMIT'), 1);
  drop = failOn('APPROVE'); try { const b = snapshot(); await decide(d, ops.token, 'approve', { version: 1 }, [500]); assert.equal(snapshot(), b); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${d} AND id_usuario_revisor IS NOT NULL`), 0, 'ninguna aprobación quedó registrada'); } finally { drop(); }
  drop = failOn('RETURN'); try { const b = snapshot(); await decide(d, ops.token, 'return', { version: 1, motivo: 'Falta el aeropuerto alternativo' }, [500]); assert.equal(snapshot(), b); assert.equal(count(`SELECT COUNT(*) FROM rutas_vuelo WHERE id_vuelos=${d} AND observaciones_revision IS NOT NULL`), 0); } finally { drop(); }
  assert.equal(row(`SELECT estado_revision FROM rutas_vuelo WHERE id_vuelos=${d} AND version=1`)[0], 'PENDIENTE_REVISION');
  await decide(d, ops.token, 'approve', { version: 1 }); assert.equal(auditCount(d, 'APPROVE'), 1); assert.equal(auditCount(d, 'RETURN'), 0);
  const other = await newPlane(); drop = failOn('INVALIDATE'); try { const b = snapshot(); await call(`/flights/${d}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: other.id, motivo: 'Cambio por mantenimiento' }, expect: [500] }); assert.equal(snapshot(), b, 'el cambio de aeronave y la invalidación se revirtieron juntos'); assert.equal((await route(d)).estado, 'APROBADA'); } finally { drop(); }
  await call(`/flights/${d}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: other.id, motivo: 'Cambio por mantenimiento' } });
  assert.equal(auditCount(d, 'INVALIDATE'), 1); assert.equal((await route(d)).estado, 'REQUIERE_REVISION');
  await call(`/flights/${d}/operational-planning`, { method: 'POST', token: cmd.g.token, body: { origenId: Number(one(`SELECT id_aeropuerto_origen FROM vuelos WHERE id_vuelos=${d}`)), destinoId: Number(one(`SELECT id_aeropuerto_destino FROM vuelos WHERE id_vuelos=${d}`)), llegada: fmt(new Date(Date.parse(one(`SELECT CONVERT(varchar(23),fecha_planificada_llegada,126) FROM vuelos WHERE id_vuelos=${d}`)) + 3600000)) } });
  assert.equal(auditCount(d, 'INVALIDATE'), 1, 'una versión ya invalidada no genera otro evento por un segundo cambio');
  assert.equal((await start(d, [409])).data.code, 'RUTA_REQUIERE_REVISION'); assert.equal(auditCount(d, 'START_REJECTED'), 4);
  await put(d, cmd.g.token, { version: 1, recorrido: 'Auditoría de rechazos', motivoModificacion: 'Reconfirmo la ruta con la nueva aeronave', presentar: true }); await decide(d, ops.token, 'return', { version: 2, motivo: 'Corrija el recorrido indicado' });
  assert.equal((await start(d, [409])).data.code, 'RUTA_DEVUELTA'); assert.equal(auditCount(d, 'START_REJECTED'), 5);
  await put(d, cmd.g.token, { version: 2, recorrido: 'Ruta corregida', motivoModificacion: 'Se corrige el recorrido pedido', presentar: true }); assert.equal((await start(d, [409])).data.code, 'RUTA_PENDIENTE_REVISION'); assert.equal(auditCount(d, 'START_REJECTED'), 6);
  await decide(d, ops.token, 'approve', { version: 3 }); const rejected0 = auditCount(d, 'START_REJECTED'); await start(d); assert.equal(stateOf(d), 'EN_CURSO');
  assert.equal(auditCount(d, 'START_REJECTED'), rejected0, 'el inicio exitoso no deja eventos de rechazo'); assert.equal(auditCount(d, 'START', 'FLIGHT'), 1);
  assert.deepEqual(['CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'RETURN', 'INVALIDATE'].map((op) => auditCount(d, op)), [1, 2, 3, 2, 1, 1], 'secuencia completa de decisiones auditadas, sin repetidos');
  pass('D auditoría: rechazos de inicio (sin ruta, borrador, invalidada, devuelta, pendiente) persisten uno por intento aunque el inicio se revierta; ni las lecturas ni los intentos sin permiso generan eventos; presentar, aprobar, devolver y la invalidación fallan junto con su auditoría sin dejar decisiones; la invalidación se audita una sola vez; el inicio exitoso no deja rechazos');

  console.log(`\n${passed} bloques verificados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
