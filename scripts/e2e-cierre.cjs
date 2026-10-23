/* E2E del cierre de vuelos sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e).
 * Backend real en :18080 y SQL Server real; sólo crea registros marcados y nunca borra datos ni toca la base habitual.
 * El tiempo se controla con el reloj ajustable del backend E2E (APP_E2E_CONTROLS_ENABLED, endpoint /api/e2e): NO se modifican
 * columnas SQL para adelantar plazos. Los saltos de reloj son siempre hacia adelante y se hacen al final.
 * Uso: node scripts/e2e-cierre.cjs  (requiere .env con BOOTSTRAP_ADMIN_* y Docker). */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PDF, ROOT, BASE, BACKEND, DB_NAME, MARK, PASSWORD, sleep, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
const BASE_URL = BASE;
let passed = 0;
const pass = (text) => { passed++; console.log('PASS: ' + text); };
const HOUR = 3600000;

const stateOf = (flightId) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${flightId}`);
const obligationOf = (flightId) => sql(`SELECT id_obligaciones_informe_final, estado_obligacion, DATEDIFF(MINUTE, SYSDATETIMEOFFSET(), vencimiento), prorroga_utilizada FROM obligaciones_informe_final WHERE id_vuelos=${flightId} AND es_actual=1`).split('|').map((x) => x.trim());
const notifCount = (type, user, flightId) => count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'${type}' AND id_usuarios=${user.id} AND id_vuelos=${flightId}`);
const auditCount = (flightId, type, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flightId} AND tipo_entidad=N'${type}' AND operacion=N'${op}'`);
const storedFiles = () => Number(spawnSync('docker', ['exec', BACKEND, 'sh', '-c', 'ls /data/documents | wc -l'], { encoding: 'utf8' }).stdout.trim());
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function multipart(p, token, fields, file, expect = [200]) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields || {})) if (v !== undefined && v !== null) form.append(k, String(v));
  if (file) form.append('file', new Blob([file.bytes], { type: file.type ?? 'application/pdf' }), file.name ?? 'informe.pdf');
  let res;
  try { res = await fetch(BASE_URL + p, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: form }); }
  catch (e) { if ((Array.isArray(expect) ? expect : [expect]).includes(413)) return { status: 413, data: null }; throw e; } // el servidor puede cortar una carga excesiva
  const raw = await res.text(); let data = null; try { data = JSON.parse(raw); } catch { data = raw; }
  const allowed = Array.isArray(expect) ? expect : [expect];
  if (!allowed.includes(res.status)) throw new Error(`POST ${p}: HTTP ${res.status}, esperado ${allowed}; ${raw.slice(0, 300)}`);
  return { status: res.status, data };
}
const pdfWith = (extra) => Buffer.from(PDF.toString('latin1').replace('startxref', extra + '\nstartxref'), 'latin1');

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`), 'El backend no apunta a la base E2E');
  assert.equal(env.APP_E2E_CONTROLS_ENABLED, 'true', 'Falta el overlay E2E con reloj ajustable'); assert.ok(env.SPRING_PROFILES_ACTIVE.split(',').includes('e2e'), 'Falta el perfil e2e');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one("SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL")) >= 43);
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const adminLogin = async () => (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  let admin = await adminLogin();
  const clock = { get: async () => ok('/e2e/clock', { token: admin }), set: async (ms) => ok('/e2e/clock', { method: 'PUT', token: admin, body: { instant: new Date(ms).toISOString() } }), reset: async () => ok('/e2e/clock', { method: 'PUT', token: admin, body: { reset: true } }) };
  const sweep = async () => (await ok('/e2e/sweep', { method: 'POST', token: admin })).notificacionesNuevas;
  const nowMs = async () => Date.parse((await clock.get()).now);
  await clock.reset();
  pass('base E2E aislada en Flyway >= V43, backend saludable y reloj ajustable disponible sólo con el overlay E2E');

  // ---------- Fixtures ----------
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'ops'), ops2 = await createUser(admin, 'OPERACIONES', 'ops2');
  const dts = await createUser(admin, 'DTS', 'dts'), dts2 = await createUser(admin, 'DTS', 'dtsb');
  const names = ['cmdA', 'cmdB', 'cmdC', 'cmdD', 'cmdE', 'cmdG', 'cmdI', 'cmdX'];
  const cmd = {}; for (const n of names) { cmd[n] = await createUser(admin, 'COMANDANTE', n); await provision(admin, cmd[n]); }
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) {
    airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token });
    if (airports.length >= 2 && localities.length >= 2) { province = p; break; }
  }
  assert.ok(province, 'Se requiere una provincia con dos aeropuertos y dos localidades');
  for (const n of names) await call(`/catalogs/commanders/${cmd[n].id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let plateSeq = 0;
  const newPlane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'P' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const reasons = await ok('/catalogs/cancellation-reasons', { token: ops.token }); const reason = reasons.find((x) => x.codigo !== 'OTRO');
  const docType = (await ok('/catalogs/document-types', { token: ops.token }))[0].codigo;
  pass('usuarios (CO, OPERACIONES, 2 DTS, 8 comandantes habilitados), ubicaciones y catálogos creados');

  async function plannedOperational(commander, type = 'REGRESO_BASE') {
    const plane = await newPlane(); const when = futureSlot();
    const flight = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: type, motivoVuelo: 'Cierre ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } });
    await call(`/flights/${flight.id}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } });
    assert.equal(stateOf(flight.id), 'PLANIFICADO');
    return { id: flight.id, plane, when };
  }
  async function finishedOperational(commander) {
    const f = await plannedOperational(commander);
    await call(`/flights/${f.id}/start`, { method: 'POST', token: ops.token }); await call(`/flights/${f.id}/finish`, { method: 'POST', token: ops.token });
    return f;
  }
  const mineFor = async (c) => ok('/final-reports/mine', { token: c.token });
  const obligationId = async (c, flightId) => (await mineFor(c)).find((x) => x.flightId === flightId).id;
  const isBlocked = async (c) => (await mineFor(c)).some((x) => x.bloqueado);

  // ---------- A: vuelo sanitario completo con informe de texto y devolución ----------
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Cierre', apellido: MARK } });
  const when = futureSlot(); const plane = await newPlane();
  const sanitary = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Cierre sanitario ' + MARK, fechaSolicitada: fmt(when), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  await call(`/flights/${sanitary}/schedule/accept`, { method: 'POST', token: ops.token });
  await call(`/flights/${sanitary}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: plane.id, comandanteId: cmd.cmdA.id } });
  await call(`/flights/${sanitary}/operational-planning`, { method: 'POST', token: cmd.cmdA.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: fmt(new Date(when.getTime() + 7200000)) } });
  assert.equal(stateOf(sanitary), 'PLANIFICADO');
  await call(`/flights/${sanitary}/finish`, { method: 'POST', token: ops.token, expect: [400] });
  await call(`/flights/${sanitary}/start`, { method: 'POST', token: cmd.cmdA.token, expect: [403] }); await call(`/flights/${sanitary}/start`, { method: 'POST', token: dts.token, expect: [403] });
  assert.equal(stateOf(sanitary), 'PLANIFICADO'); assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos=${sanitary}`), 0);
  await call(`/flights/${sanitary}/start`, { method: 'POST', token: ops.token });
  assert.equal(stateOf(sanitary), 'EN_CURSO'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${sanitary} AND fecha_salida_real IS NOT NULL AND fecha_llegada_real IS NULL`), 1);
  await call(`/flights/${sanitary}/start`, { method: 'POST', token: ops.token, expect: [400] });
  await call(`/flights/${sanitary}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id }, expect: [400] });
  await call(`/flights/${sanitary}/finish`, { method: 'POST', token: cmd.cmdA.token, expect: [403] });
  const beforeFinish = await nowMs(); await call(`/flights/${sanitary}/finish`, { method: 'POST', token: ops.token }); const afterFinish = await nowMs();
  assert.equal(stateOf(sanitary), 'FINALIZADO'); assert.equal(count(`SELECT COUNT(*) FROM vuelos WHERE id_vuelos=${sanitary} AND fecha_llegada_real IS NOT NULL`), 1);
  const idA = await obligationId(cmd.cmdA, sanitary); const viewA = (await mineFor(cmd.cmdA)).find((x) => x.id === idA); const dueA = Date.parse(viewA.vencimiento);
  assert.ok(dueA >= beforeFinish + 48 * HOUR - 1 && dueA <= afterFinish + 48 * HOUR + 1, `vencimiento = FINALIZADO + 48 h exactas (${dueA - beforeFinish - 48 * HOUR} ms)`);
  assert.equal(Number(one(`SELECT DATEDIFF_BIG(MILLISECOND, '1970-01-01T00:00:00+00:00', vencimiento) FROM obligaciones_informe_final WHERE id_obligaciones_informe_final=${idA}`)), dueA, 'el vencimiento persistido (con zona) coincide con el de la API');
  await call(`/flights/${sanitary}/finish`, { method: 'POST', token: ops.token, expect: [400] });
  await call(`/flights/${sanitary}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id }, expect: [400] });
  assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos=${sanitary}`), 1);
  assert.equal(notifCount('FINAL_REPORT_PENDING', cmd.cmdA, sanitary), 1); assert.equal(notifCount('FLIGHT_FINISHED', cmd.cmdA, sanitary), 1); assert.equal(notifCount('FLIGHT_FINISHED', dts, sanitary), 1);
  assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos=${sanitary} AND id_usuario_finalizador=${ops.id}`), 1, 'responsable de cierre = quien finalizó');
  assert.equal(auditCount(sanitary, 'FLIGHT', 'START'), 1); assert.equal(auditCount(sanitary, 'FLIGHT', 'FINISH'), 1); assert.equal(auditCount(sanitary, 'FINAL_REPORT_OBLIGATION', 'CREATE'), 1);
  const detailOps = await ok(`/flights/${sanitary}`, { token: ops.token }); assert.equal(detailOps.cierre.estadoAdministrativo, 'INFORME_PENDIENTE'); assert.equal(detailOps.vuelo.estadoVuelo, 'FINALIZADO');
  assert.equal(detailOps.vuelo.origenDetalle.nombre, airports[0].nombre, 'trayecto estructurado en vuelos sanitarios planificados'); assert.equal(detailOps.vuelo.destinoDetalle.nombre, airports[1].nombre); assert.ok(detailOps.vuelo.destinoDetalle.provincia);
  pass('A1 vuelo sanitario: inicio/finalización, fechas reales, obligación única de 48 h exactas persistida con zona, transiciones inválidas rechazadas, notificaciones y auditoría');

  await call(`/final-reports/${idA}/submit`, { method: 'POST', token: cmd.cmdA.token, body: { texto: '   ' }, expect: [400] });
  await call(`/final-reports/${idA}/submit`, { method: 'POST', token: cmd.cmdA.token, body: { texto: 'x', horasVuelo: 1000 }, expect: [400] });
  await call(`/final-reports/${idA}/review`, { method: 'POST', token: ops.token, body: { aprobar: true }, expect: [400] });
  const sub1 = await ok(`/final-reports/${idA}/submit`, { method: 'POST', token: cmd.cmdA.token, body: { texto: 'Primera versión', horasVuelo: 1.5, combustibleConsumidoLitros: 320, incidentes: 'Ninguno' } });
  assert.equal(sub1.status, 'PRESENTADO'); assert.equal(sub1.versiones, 1);
  await call(`/final-reports/${idA}/submit`, { method: 'POST', token: cmd.cmdA.token, body: { texto: 'Duplicado' }, expect: [400] });
  assert.equal(count(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos=${sanitary}`), 1);
  assert.ok((await ok('/final-reports/pending-review', { token: ops.token })).some((x) => x.id === idA));
  assert.equal(notifCount('FINAL_REPORT_SUBMITTED', ops, sanitary), 1); assert.equal(notifCount('FINAL_REPORT_SUBMITTED', ops2, sanitary), 0, 'el aviso va al responsable del cierre, no a toda Operaciones');
  await call(`/final-reports/${idA}/review`, { method: 'POST', token: ops.token, body: { aprobar: false }, expect: [400] });
  await call(`/final-reports/${idA}/review`, { method: 'POST', token: ops.token, body: { aprobar: false, motivoDevolucion: '  ' }, expect: [400] });
  const returnedAt = await nowMs(); const returned = await ok(`/final-reports/${idA}/review`, { method: 'POST', token: ops.token, body: { aprobar: false, motivoDevolucion: 'Faltan horas por tramo' } });
  assert.equal(returned.status, 'DEVUELTO'); assert.ok(Math.abs(Date.parse(returned.vencimiento) - (returnedAt + 48 * HOUR)) < 5000, 'plazo reiniciado a 48 h desde la devolución');
  assert.equal(notifCount('FINAL_REPORT_RETURNED', cmd.cmdA, sanitary), 1); assert.equal(auditCount(sanitary, 'FINAL_REPORT', 'RETURN'), 1);
  assert.equal(one(`SELECT estado_revision+'|'+motivo_devolucion+'|'+origen_decision FROM informes_finales_vuelo WHERE id_vuelos=${sanitary} AND version=1`), 'DEVUELTO|Faltan horas por tramo|FLUJO_ACTUAL');
  await call(`/final-reports/${idA}/review`, { method: 'POST', token: ops.token, body: { aprobar: true }, expect: [400] });
  const sub2 = await ok(`/final-reports/${idA}/submit`, { method: 'POST', token: cmd.cmdA.token, body: { texto: 'Versión corregida', horasVuelo: 1.7 } }); assert.equal(sub2.versiones, 2);
  assert.equal(count(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos=${sanitary} AND es_version_actual=1`), 1);
  const history = await ok(`/final-reports/${idA}`, { token: cmd.cmdA.token }); assert.deepEqual(history.versiones.map((v) => [v.version, v.estado, v.vigente, v.formato]), [[2, 'PRESENTADO', true, 'TEXTO'], [1, 'DEVUELTO', false, 'TEXTO']]); assert.equal(history.versiones[1].motivoDevolucion, 'Faltan horas por tramo');
  assert.equal(notifCount('FINAL_REPORT_RESUBMITTED', ops, sanitary), 1); assert.equal(auditCount(sanitary, 'FINAL_REPORT', 'RESUBMIT'), 1);
  const approved = await ok(`/final-reports/${idA}/review`, { method: 'POST', token: ops.token, body: { aprobar: true } });
  assert.equal(approved.status, 'APROBADO'); assert.equal(stateOf(sanitary), 'COMPLETADO');
  assert.equal(notifCount('FINAL_REPORT_APPROVED', cmd.cmdA, sanitary), 1); assert.equal(notifCount('FLIGHT_COMPLETED', cmd.cmdA, sanitary), 1); assert.equal(notifCount('FLIGHT_COMPLETED', dts, sanitary), 1);
  assert.equal(auditCount(sanitary, 'FLIGHT', 'COMPLETE'), 1); assert.equal(auditCount(sanitary, 'FINAL_REPORT', 'APPROVE'), 1); assert.equal(one(`SELECT estado_revision FROM informes_finales_vuelo WHERE id_vuelos=${sanitary} AND version=2`), 'APROBADO');
  await call(`/final-reports/${idA}/review`, { method: 'POST', token: ops.token, body: { aprobar: false, motivoDevolucion: 'Tarde' }, expect: [400] });
  await call(`/final-reports/${idA}/submit`, { method: 'POST', token: cmd.cmdA.token, body: { texto: 'Tarde' }, expect: [400] });
  await call(`/flights/${sanitary}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id }, expect: [400] });
  assert.equal((await ok(`/flights/${sanitary}`, { token: dts.token })).cierre.estadoAdministrativo, 'CERRADO');
  pass('A2 informe de texto: presentación, duplicado rechazado, devolución con motivo (plazo reiniciado), reentrega v2 con historial, aprobación y COMPLETADO; avisos sólo al responsable de cierre');

  // ---------- B: vuelo operativo + contrato de trayecto ----------
  const opB = await finishedOperational(cmd.cmdB);
  assert.equal(obligationOf(opB.id)[1], 'PENDIENTE'); assert.equal(notifCount('FINAL_REPORT_PENDING', cmd.cmdB, opB.id), 1); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${opB.id}`), 0);
  const idB = await obligationId(cmd.cmdB, opB.id); assert.equal((await ok(`/flights/${opB.id}`, { token: ops.token })).cierre.estadoAdministrativo, 'INFORME_PENDIENTE');
  const listed = (await ok('/flights', { token: ops.token })).find((f) => f.id === opB.id);
  assert.ok(listed.origen && listed.origenDetalle && listed.origenDetalle.nombre === listed.origen && listed.origenDetalle.provincia && listed.destinoDetalle.nombre && listed.destinoDetalle.provincia, 'el vuelo operativo expone origen y destino estructurados (nombre y provincia), no texto suelto');
  await ok(`/final-reports/${idB}/submit`, { method: 'POST', token: cmd.cmdB.token, body: { texto: 'Operativo sin novedades' } });
  await ok(`/final-reports/${idB}/review`, { method: 'POST', token: ops2.token, body: { aprobar: true } });
  assert.equal(stateOf(opB.id), 'COMPLETADO'); assert.equal(auditCount(opB.id, 'FLIGHT', 'COMPLETE'), 1);
  pass('B vuelo operativo no sanitario: finalización, obligación, informe, revisión por OPERACIONES y COMPLETADO; el trayecto llega estructurado');

  // ---------- I: informe PDF (formatos, almacenamiento privado, descarga, versiones) ----------
  const opI = await finishedOperational(cmd.cmdI); const idI = await obligationId(cmd.cmdI, opI.id); const filesBefore = storedFiles();
  const reject = async (file, expect = [400]) => { await multipart(`/final-reports/${idI}/submit`, cmd.cmdI.token, {}, file, expect); assert.equal(storedFiles(), filesBefore, 'un rechazo no deja archivos huérfanos'); assert.equal(obligationOf(opI.id)[1], 'PENDIENTE'); };
  await reject({ bytes: Buffer.from('esto no es un pdf, solo texto'), name: 'informe.pdf' }); await reject({ bytes: PDF, name: 'informe.docx' }); await reject({ bytes: PDF, name: 'informe.pdf', type: 'text/plain' });
  await reject({ bytes: pdfWith('<< /S /JavaScript /JS (app.alert(1)) >>'), name: 'informe.pdf' }); await reject({ bytes: Buffer.from(PDF.toString('latin1').replace('%%EOF', 'fin'), 'latin1'), name: 'informe.pdf' });
  await reject({ bytes: Buffer.concat([PDF.subarray(0, PDF.length - 10), Buffer.alloc(10 * 1024 * 1024 + 4096, 32), Buffer.from('\n%%EOF\n')]), name: 'grande.pdf' }, [400, 413]);
  await multipart(`/final-reports/${idI}/submit`, cmd.cmdI.token, {}, null, [400]);
  const pdfV1 = await multipart(`/final-reports/${idI}/submit`, cmd.cmdI.token, { horasVuelo: 3, combustibleConsumidoLitros: 500 }, { bytes: PDF, name: '../../Informe <final>.pdf' });
  assert.equal(pdfV1.data.status, 'PRESENTADO'); assert.equal(storedFiles(), filesBefore + 1);
  const detailI = await ok(`/final-reports/${idI}`, { token: cmd.cmdI.token }); const v1 = detailI.versiones[0];
  assert.equal(v1.formato, 'PDF'); assert.equal(v1.texto, null); assert.equal(v1.adjunto.sha256, sha256(PDF)); assert.equal(v1.adjunto.tamanioBytes, PDF.length); assert.ok(!/[\\/<>]/.test(v1.adjunto.nombre), 'nombre saneado: ' + v1.adjunto.nombre);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(detailI)), 'la respuesta no expone la ubicación de almacenamiento');
  const row = sql(`SELECT adjunto_ubicacion, adjunto_tamanio_bytes, adjunto_sha256, origen_decision FROM informes_finales_vuelo WHERE id_vuelos=${opI.id} AND version=1`).split('|').map((x) => x.trim());
  assert.equal(row[1], String(PDF.length)); assert.equal(row[2], sha256(PDF)); assert.equal(row[3], 'FLUJO_ACTUAL'); assert.ok(/^[0-9a-f-]{36}\.pdf$/.test(row[0]));
  assert.equal(spawnSync('docker', ['exec', BACKEND, 'sh', '-c', `test -f /data/documents/${row[0]} && echo presente`], { encoding: 'utf8' }).stdout.trim(), 'presente', 'archivo persistente en el almacenamiento privado del backend');
  const download = async (token, version = 1, o = idI) => fetch(`${BASE_URL}/final-reports/${o}/versions/${version}/file`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  let res = await download(cmd.cmdI.token); assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'application/pdf'); assert.equal(res.headers.get('x-content-type-options'), 'nosniff'); assert.match(res.headers.get('content-disposition'), /attachment; filename="?informe-final-V-[A-Z0-9]+-v1\.pdf/); assert.equal(sha256(Buffer.from(await res.arrayBuffer())), sha256(PDF));
  assert.equal((await download(ops.token)).status, 200); assert.equal((await download(admin)).status, 200);
  for (const [t, expected] of [[cmd.cmdA.token, [403]], [dts.token, [403]], [null, [401, 403]]]) assert.ok(expected.includes((await download(t)).status));
  assert.equal((await download(cmd.cmdI.token, 9)).status, 404);
  await ok(`/final-reports/${idI}/review`, { method: 'POST', token: ops.token, body: { aprobar: false, motivoDevolucion: 'PDF sin firmas' } });
  const mixed = await multipart(`/final-reports/${idI}/submit`, cmd.cmdI.token, { texto: 'Resumen más PDF corregido' }, { bytes: pdfWith('% comentario benigno'), name: 'corregido.pdf' }); assert.equal(mixed.data.versiones, 2); assert.equal(storedFiles(), filesBefore + 2);
  const detail2 = await ok(`/final-reports/${idI}`, { token: ops.token }); assert.deepEqual(detail2.versiones.map((v) => [v.version, v.estado, v.formato]), [[2, 'PRESENTADO', 'TEXTO_Y_PDF'], [1, 'DEVUELTO', 'PDF']]);
  assert.equal((await download(cmd.cmdI.token, 1)).status, 200, 'la versión devuelta conserva su PDF'); assert.equal((await download(cmd.cmdI.token, 2)).status, 200);
  assert.notEqual(detail2.versiones[0].adjunto.sha256, detail2.versiones[1].adjunto.sha256);
  const approvedI = await ok(`/final-reports/${idI}/review`, { method: 'POST', token: ops.token, body: { aprobar: true } }); assert.equal(approvedI.status, 'APROBADO'); assert.equal(stateOf(opI.id), 'COMPLETADO');
  assert.equal(auditCount(opI.id, 'FINAL_REPORT', 'SUBMIT'), 1); assert.match(sql(`SELECT valores_nuevos FROM eventos_auditoria WHERE id_vuelos=${opI.id} AND operacion=N'SUBMIT' AND tipo_entidad=N'FINAL_REPORT'`), /"formato":"PDF".*"adjuntoSha256":"[0-9a-f]{64}"/);
  assert.equal((await download(cmd.cmdI.token, 2)).status, 200, 'la descarga sigue disponible tras el cierre');
  pass('I informe PDF: rechazo de archivos falsos/extensión/tipo/contenido activo/incompleto/excesivo sin huérfanos, v1 sólo PDF, v2 texto+PDF, nombre saneado, SHA-256 y tamaño persistidos, archivo privado, descarga autenticada con permisos, versiones conservadas, revisión y aprobación independientes del formato');

  // ---------- F: permisos ----------
  const opX = await finishedOperational(cmd.cmdX); const idX = await obligationId(cmd.cmdX, opX.id);
  await call(`/final-reports/${idX}/submit`, { method: 'POST', token: cmd.cmdA.token, body: { texto: 'Ajeno' }, expect: [403] });
  await multipart(`/final-reports/${idX}/submit`, cmd.cmdA.token, {}, { bytes: PDF, name: 'ajeno.pdf' }, [403]);
  await call(`/final-reports/${idX}/extension`, { method: 'POST', token: cmd.cmdA.token, expect: [403] });
  await call(`/final-reports/${idX}`, { token: cmd.cmdA.token, expect: [403] }); await call(`/final-reports/flight/${opX.id}`, { token: cmd.cmdA.token, expect: [403] });
  await call(`/final-reports/${idX}`, { token: dts.token, expect: [403] }); await call(`/final-reports/${idX}`, { expect: [401, 403] });
  await call(`/final-reports/${idX}/submit`, { method: 'POST', token: ops.token, body: { texto: 'CO no presenta' }, expect: [403] }); await call(`/final-reports/${idX}/submit`, { method: 'POST', token: dts.token, body: { texto: 'DTS no presenta' }, expect: [403] });
  await call(`/final-reports/${idX}/review`, { method: 'POST', token: cmd.cmdX.token, body: { aprobar: true }, expect: [403] }); await call(`/final-reports/${idX}/review`, { method: 'POST', token: dts.token, body: { aprobar: true }, expect: [403] });
  await call('/final-reports/pending-review', { token: cmd.cmdX.token, expect: [403] }); await call('/final-reports/awaiting-commander', { token: dts.token, expect: [403] });
  await call('/final-reports/mine', { token: ops.token, expect: [403] }); await call('/final-reports/999999999', { token: ops.token, expect: [404] });
  await call(`/flights/${opX.id}/finish`, { method: 'POST', token: dts.token, expect: [403] }); await call(`/flights/${opX.id}`, { token: dts2.token, expect: [403] });
  assert.equal(await call(`/final-reports/${idX}`, { token: admin }).then((r) => r.data.obligacion.id), idX); assert.equal((await ok(`/final-reports/${idX}`, { token: ops2.token })).obligacion.id, idX);
  const note = (await ok('/notifications?size=100', { token: cmd.cmdX.token })).items[0]; await call(`/notifications/${note.id}/read`, { method: 'POST', token: cmd.cmdA.token, expect: [403] });
  assert.equal(obligationOf(opX.id)[1], 'PENDIENTE'); assert.equal(count(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos=${opX.id}`), 0);
  const rejected = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Rechazo ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'P', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  await call(`/flights/${rejected}/schedule/reject`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } });
  await call(`/flights/${rejected}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id }, expect: [400] }); await call(`/flights/${rejected}/finish`, { method: 'POST', token: ops.token, expect: [400] }); await call(`/flights/${rejected}/start`, { method: 'POST', token: ops.token, expect: [400] });
  assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos=${rejected}`), 0);
  pass('F permisos: comandantes ajenos, DTS, CO y anónimo rechazados (presentar texto y PDF, prórroga, consulta, descarga, revisión); admin y operaciones leen; rechazo sanitario no se cancela ni finaliza');

  // ---------- G: concurrencia y reintentos ----------
  const gFlight = await plannedOperational(cmd.cmdG); await call(`/flights/${gFlight.id}/start`, { method: 'POST', token: ops.token });
  const finishes = await Promise.all(Array.from({ length: 6 }, () => call(`/flights/${gFlight.id}/finish`, { method: 'POST', token: ops.token, expect: [200, 400, 409, 500] })));
  assert.equal(finishes.filter((r) => r.status === 200).length, 1); assert.ok(finishes.every((r) => r.status === 200 || r.status === 400), 'estados: ' + finishes.map((r) => r.status));
  assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos=${gFlight.id}`), 1); assert.equal(notifCount('FINAL_REPORT_PENDING', cmd.cmdG, gFlight.id), 1); assert.equal(notifCount('FLIGHT_FINISHED', cmd.cmdG, gFlight.id), 1); assert.equal(auditCount(gFlight.id, 'FLIGHT', 'FINISH'), 1);
  const idG = await obligationId(cmd.cmdG, gFlight.id); const gFiles = storedFiles();
  const submits = await Promise.all(Array.from({ length: 6 }, (_, i) => multipart(`/final-reports/${idG}/submit`, cmd.cmdG.token, { texto: 'Concurrente ' + i }, { bytes: pdfWith('% intento ' + i), name: 'c' + i + '.pdf' }, [200, 400])));
  assert.equal(submits.filter((r) => r.status === 200).length, 1); assert.equal(count(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos=${gFlight.id}`), 1); assert.equal(notifCount('FINAL_REPORT_SUBMITTED', ops, gFlight.id), 1); assert.equal(storedFiles(), gFiles + 1, 'una sola versión con PDF: sin archivos huérfanos');
  const reviews = await Promise.all([true, false, true, false, true].map((approve, i) => call(`/final-reports/${idG}/review`, { method: 'POST', token: (i % 2 ? ops2 : ops).token, body: { aprobar: approve, motivoDevolucion: approve ? undefined : 'Concurrente' }, expect: [200, 400] })));
  assert.equal(reviews.filter((r) => r.status === 200).length, 1);
  const decision = obligationOf(gFlight.id)[1]; assert.ok(['APROBADO', 'DEVUELTO'].includes(decision));
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${gFlight.id} AND tipo_entidad=N'FINAL_REPORT' AND operacion IN (N'APPROVE', N'RETURN')`), 1); assert.equal(count(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos=${gFlight.id} AND estado_revision IN (N'APROBADO', N'DEVUELTO')`), 1);
  if (decision === 'APROBADO') assert.equal(stateOf(gFlight.id), 'COMPLETADO');
  pass('G concurrencia: 6 finalizaciones -> 1 obligación/notificación/auditoría; 6 presentaciones con PDF -> 1 versión y 1 archivo; 5 revisiones -> 1 decisión');

  // ---------- L: histórico por API y barreras SQL del ciclo terminal ----------
  const historicRows = sql(`SELECT id_informes_finales_vuelo, estado_revision, origen_decision FROM informes_finales_vuelo WHERE origen_decision <> N'FLUJO_ACTUAL' ORDER BY 1`).split(/\r?\n/).filter(Boolean).map((l) => l.split('|').map((x) => x.trim()));
  assert.ok(historicRows.length >= 4 && historicRows.every((r) => r[1] === 'APROBADO' && r[2] === 'HISTORICA_OBLIGACION_AUDITADA'), 'las aprobaciones previas conservan su procedencia: ' + JSON.stringify(historicRows));
  const historicFlight = one(`SELECT TOP 1 id_vuelos FROM informes_finales_vuelo WHERE origen_decision <> N'FLUJO_ACTUAL' ORDER BY id_informes_finales_vuelo`);
  const historicDetail = await ok(`/final-reports/flight/${historicFlight}`, { token: ops.token }); assert.equal(historicDetail.versiones[0].origenDecision, 'HISTORICA_OBLIGACION_AUDITADA'); assert.equal(historicDetail.versiones[0].estado, 'APROBADO');
  await call(`/final-reports/${historicDetail.obligacion.id}/review`, { method: 'POST', token: ops.token, body: { aprobar: true }, expect: [400] });
  const trigger = (statement, pattern) => assert.throws(() => sql(statement), (e) => pattern.test(e.sqlOutput || e.message), 'debía rechazarse: ' + statement.slice(0, 80));
  const stateId = (code) => `(SELECT id_estados_vuelo FROM estados_vuelo WHERE codigo_estado_vuelo=N'${code}')`;
  trigger(`UPDATE vuelos SET id_estados_vuelo=${stateId('PLANIFICADO')} WHERE id_vuelos=${sanitary}`, /51043/); trigger(`UPDATE vuelos SET id_estados_vuelo=${stateId('EN_CURSO')} WHERE id_vuelos=${opB.id}`, /51043/);
  trigger(`UPDATE vuelos SET id_estados_vuelo=${stateId('EN_CURSO')} WHERE id_vuelos=${opX.id}`, /51043/); trigger(`UPDATE vuelos SET id_estados_vuelo=${stateId('COMPLETADO')} WHERE id_vuelos=${opX.id}`, /51043/); // FINALIZADO sin aprobación
  trigger(`UPDATE vuelos SET id_estados_vuelo=${stateId('COMPLETADO')} WHERE id_vuelos IN (${opX.id}, ${gFlight.id})`, /51043/);
  assert.equal(stateOf(opX.id), 'FINALIZADO'); assert.equal(stateOf(sanitary), 'COMPLETADO');
  trigger(`UPDATE informes_finales_vuelo SET es_version_actual=1 WHERE id_vuelos=${sanitary} AND version=1`, /ux_informes_finales_vuelo_actual|unique|duplicate/i);
  trigger(`INSERT INTO informes_finales_vuelo (id_vuelos, version, es_version_actual, id_usuario_creador, estado_revision, fecha_creacion, resumen) SELECT ${sanitary}, 99, 1, ${cmd.cmdA.id}, N'PRESENTADO', SYSDATETIME(), N'x'`, /ux_informes|duplicate/i);
  trigger(`INSERT INTO informes_finales_vuelo (id_vuelos, version, es_version_actual, id_usuario_creador, estado_revision, fecha_creacion) SELECT ${sanitary}, 98, 0, ${cmd.cmdA.id}, N'PRESENTADO', SYSDATETIME()`, /ck_informes_finales_vuelo_contenido/);
  sql(`UPDATE vuelos SET motivo_vuelo = motivo_vuelo WHERE id_vuelos IN (${[sanitary, opB.id, opX.id].join(',')})`); // actualización sin cambio de estado: no se bloquea
  pass('L histórico y SQL: aprobaciones previas con procedencia HISTORICA_OBLIGACION_AUDITADA y no revisables de nuevo; el trigger rechaza transiciones fuera de orden y COMPLETADO sin aprobación (también multi-vuelo) y las restricciones impiden versiones inválidas; las actualizaciones sin cambio de estado siguen permitidas');

  // ---------- C: plazo con reloj controlado, bloqueo sin barrido y matriz de endpoints ----------
  const opC = await finishedOperational(cmd.cmdC); const idC = await obligationId(cmd.cmdC, opC.id);
  const pendingC = await plannedOperational(cmd.cmdC); const assignPlane = await newPlane(); const assignSlot = futureSlot();
  const assignC = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Asignación pendiente ' + MARK, aircraftId: assignPlane.id, comandanteId: cmd.cmdC.id, destinoId: airports[1].id, salida: fmt(assignSlot), llegada: fmt(new Date(assignSlot.getTime() + 7200000)) } })).id;
  await call(`/flights/${pendingC.id}/hangar`, { method: 'PUT', token: ops.token, body: { version: 0, requiereHangar: true, preparacionCompleta: false, observaciones: 'Hangar ' + MARK } });
  const docC = await multipart(`/flights/${pendingC.id}/documents/pdf`, cmd.cmdC.token, { documentTypeCode: docType, nombreDocumento: 'Doc operativo ' + MARK }, { bytes: PDF, name: 'doc.pdf' }); const docItem = docC.data.id;
  const dueC = Date.parse((await mineFor(cmd.cmdC)).find((x) => x.id === idC).vencimiento);
  const countFor = (type) => count(`SELECT COUNT(*) FROM notificaciones WHERE tipo_notificacion=N'${type}' AND id_vuelos=${opC.id}`);
  await clock.set(dueC - 12 * HOUR - 10 * 60000); assert.equal(await isBlocked(cmd.cmdC), false); await sweep(); assert.equal(countFor('FINAL_REPORT_DUE_SOON'), 0, 'fuera de la ventana no hay aviso');
  await clock.set(dueC - 12 * HOUR); await sweep(); assert.equal(notifCount('FINAL_REPORT_DUE_SOON', cmd.cmdC, opC.id), 1); await sweep(); await sweep(); assert.equal(notifCount('FINAL_REPORT_DUE_SOON', cmd.cmdC, opC.id), 1, 'idempotente');
  await clock.set(dueC - 60000); assert.equal(await isBlocked(cmd.cmdC), false); await call(`/flights/${pendingC.id}/log`, { method: 'POST', token: cmd.cmdC.token, body: { tipo: 'PREPARACION', descripcion: 'Aún en plazo', ocurrido: new Date(Date.now() - 60000).toISOString(), importancia: 'NORMAL' } });
  await clock.set(dueC); // vence exactamente: el bloqueo rige sin que haya corrido ningún barrido posterior
  const blockedView = (await mineFor(cmd.cmdC)).find((x) => x.id === idC); assert.equal(blockedView.bloqueado, true); assert.equal(blockedView.vencida, true); assert.ok(blockedView.segundosRestantes <= 0);
  assert.equal(countFor('FINAL_REPORT_OVERDUE'), 0); assert.equal(countFor('COMMANDER_BLOCKED'), 0);
  assert.equal((await ok(`/flights/${opC.id}`, { token: ops.token })).cierre.estadoAdministrativo, 'INFORME_VENCIDO');
  const blocked = async (label, p, o) => { const r = o.multipartFields ? await multipart(p, cmd.cmdC.token, o.multipartFields, o.file, [403]) : await call(p, { ...o, token: cmd.cmdC.token, expect: [403] }); assert.match(JSON.stringify(r.data), /BLOQUEADAS/, label); assert.equal(r.data.code, 'COMANDANTE_BLOQUEADO', label); };
  const logBody = { tipo: 'DEMORA', descripcion: 'x', ocurrido: new Date(Date.now() - 60000).toISOString(), importancia: 'NORMAL' }; const planBody = { origenId: airports[0].id, destinoId: airports[1].id, llegada: fmt(new Date(pendingC.when.getTime() + 7200000)) };
  await blocked('aceptar asignación', `/flights/${assignC}/commander-assignment/response`, { method: 'POST', body: { aceptar: true } });
  await blocked('rechazar asignación', `/flights/${assignC}/commander-assignment/response`, { method: 'POST', body: { aceptar: false, motivo: 'x' } });
  await blocked('contrapropuesta de horario', `/flights/${assignC}/commander-assignment/response`, { method: 'POST', body: { aceptar: false, motivo: 'x', salidaPropuesta: fmt(new Date(assignSlot.getTime() + 86400000)), llegadaPropuesta: fmt(new Date(assignSlot.getTime() + 86400000 + 7200000)) } });
  await blocked('planificación', `/flights/${pendingC.id}/operational-planning`, { method: 'POST', body: planBody }); await blocked('meteorología', `/flights/${pendingC.id}/weather`, { method: 'POST', body: { condiciones: 'Despejado', favorable: true } });
  await call(`/flights/${pendingC.id}/cancel`, { method: 'POST', token: cmd.cmdC.token, body: { motivoCancelacionId: reason.id }, expect: [403] }); // el comandante no cancela vuelos (rechaza asignaciones)
  await blocked('ruta', `/flights/${pendingC.id}/route`, { method: 'PUT', body: { version: 0, recorrido: 'Directo' } });
  await blocked('hangar', `/flights/${pendingC.id}/hangar/commander-observation`, { method: 'PUT', body: { version: 1, observaciones: 'Listo' } }); await blocked('bitácora', `/flights/${pendingC.id}/log`, { method: 'POST', body: logBody });
  await blocked('documento nuevo', `/flights/${pendingC.id}/documents/pdf`, { multipartFields: { documentTypeCode: docType, nombreDocumento: 'Otro' }, file: { bytes: PDF, name: 'otro.pdf' } });
  await blocked('bloqueo documental', `/documents/${docItem}/lock`, { method: 'POST' }); await blocked('liberar bloqueo', `/documents/${docItem}/lock`, { method: 'DELETE' }); await blocked('versión documental', `/documents/${docItem}/versions/pdf`, { multipartFields: {}, file: { bytes: PDF, name: 'v2.pdf' } });
  await call(`/flights/${pendingC.id}/start`, { method: 'POST', token: ops.token, expect: [403] }); assert.equal(stateOf(pendingC.id), 'PLANIFICADO');
  const planeBlocked = await newPlane(); const slot = futureSlot();
  await call('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'No debe crearse', aircraftId: planeBlocked.id, comandanteId: cmd.cmdC.id, destinoId: airports[1].id, salida: fmt(slot), llegada: fmt(new Date(slot.getTime() + 7200000)) }, expect: [409] });
  for (const p of ['/auth/me', '/flights', `/flights/${pendingC.id}`, `/flights/${pendingC.id}/weather`, `/flights/${pendingC.id}/route`, `/flights/${pendingC.id}/hangar`, `/flights/${pendingC.id}/log`, `/flights/${pendingC.id}/documents`, '/final-reports/mine', `/final-reports/${idC}`, `/final-reports/flight/${opC.id}`, '/notifications']) await call(p, { token: cmd.cmdC.token });
  assert.ok((await ok('/auth/login', { method: 'POST', body: { username: cmd.cmdC.name, password: PASSWORD } })).accessToken.length > 20);
  assert.ok(await sweep() >= 3); assert.equal(notifCount('FINAL_REPORT_OVERDUE', cmd.cmdC, opC.id), 1); assert.equal(notifCount('COMMANDER_BLOCKED', cmd.cmdC, opC.id), 1);
  assert.equal(notifCount('FINAL_REPORT_OVERDUE', ops, opC.id), 1); assert.equal(notifCount('FINAL_REPORT_OVERDUE', ops2, opC.id), 0, 'la alerta va al responsable del cierre'); assert.equal(auditCount(opC.id, 'FINAL_REPORT_OBLIGATION', 'OVERDUE'), 1);
  await sweep(); await sweep(); assert.equal(notifCount('FINAL_REPORT_OVERDUE', cmd.cmdC, opC.id), 1, 'el barrido repetido no duplica avisos'); assert.equal(notifCount('COMMANDER_BLOCKED', cmd.cmdC, opC.id), 1);
  const awaiting = (await ok('/final-reports/awaiting-commander', { token: ops.token })).filter((x) => x.id === idC); assert.equal(awaiting.length, 1); assert.equal(awaiting[0].vencida, true); assert.equal(awaiting[0].bloqueado, true);
  assert.equal(count(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos=${opC.id}`), 0);
  await call(`/final-reports/${idC}/submit`, { method: 'POST', token: cmd.cmdC.token, body: { texto: 'Informe fuera de plazo' } });
  assert.equal(await isBlocked(cmd.cmdC), false); assert.equal(notifCount('COMMANDER_UNBLOCKED', cmd.cmdC, opC.id), 1); assert.equal(auditCount(opC.id, 'FINAL_REPORT_OBLIGATION', 'UNBLOCK_COMMANDER'), 1);
  // Regresión: con el bloqueo levantado, cada función del comandante vuelve a operar.
  await call(`/flights/${assignC}/commander-assignment/response`, { method: 'POST', token: cmd.cmdC.token, body: { aceptar: true } }); assert.equal(stateOf(assignC), 'PLANIFICADO');
  await call(`/flights/${pendingC.id}/operational-planning`, { method: 'POST', token: cmd.cmdC.token, body: planBody }); await call(`/flights/${pendingC.id}/weather`, { method: 'POST', token: cmd.cmdC.token, body: { condiciones: 'Despejado', favorable: true } });
  await call(`/flights/${pendingC.id}/route`, { method: 'PUT', token: cmd.cmdC.token, body: { version: 0, recorrido: 'Directo' } }); await call(`/flights/${pendingC.id}/hangar/commander-observation`, { method: 'PUT', token: cmd.cmdC.token, body: { version: 1, observaciones: 'Listo' } });
  await call(`/flights/${pendingC.id}/log`, { method: 'POST', token: cmd.cmdC.token, body: { ...logBody, ocurrido: new Date(Date.now() - 60000).toISOString() } });
  await call(`/documents/${docItem}/lock`, { method: 'POST', token: cmd.cmdC.token }); await multipart(`/documents/${docItem}/versions/pdf`, cmd.cmdC.token, {}, { bytes: pdfWith('% v2'), name: 'v2.pdf' }); await call(`/documents/${docItem}/lock`, { method: 'DELETE', token: cmd.cmdC.token, expect: [204] });
  await multipart(`/flights/${pendingC.id}/documents/pdf`, cmd.cmdC.token, { documentTypeCode: docType, nombreDocumento: 'Otro ' + MARK }, { bytes: PDF, name: 'otro.pdf' });
  await call(`/flights/${pendingC.id}/start`, { method: 'POST', token: ops.token }); assert.equal(stateOf(pendingC.id), 'EN_CURSO');
  await call(`/flights/${assignC}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } }); assert.equal(stateOf(assignC), 'CANCELADO');
  const inbox = await ok('/notifications?size=100', { token: cmd.cmdC.token }); assert.ok(inbox.unread > 3); const target = inbox.items.find((n) => !n.leido); await call(`/notifications/${target.id}/read`, { method: 'POST', token: cmd.cmdC.token });
  assert.equal(count(`SELECT COUNT(*) FROM notificaciones WHERE id_notificaciones=${target.id} AND leido=1`), 1); assert.equal(await ok('/notifications/read-all', { method: 'POST', token: cmd.cmdC.token }), inbox.unread - 1); assert.equal((await ok('/notifications', { token: cmd.cmdC.token })).unread, 0);
  pass('C plazo con reloj controlado: aviso próximo exacto e idempotente, bloqueo exacto en el vencimiento SIN barrido previo, 14 acciones de escritura rechazadas con COMANDANTE_BLOQUEADO (asignación, rechazo, contrapropuesta, planificación, clima, cancelación, ruta, hangar, bitácora, documentos, inicio, nuevas asignaciones), consultas/login permitidos, avisos de vencida/bloqueo una sola vez y al responsable, desbloqueo y regresión de todas las funciones');

  // ---------- D: reinicio del plazo con reloj controlado (cruza medianoche local) ----------
  const base = await nowMs(); const nextMidnightLocal = (() => { const d = new Date(base); d.setUTCHours(2, 30, 0, 0); if (d.getTime() <= base) d.setUTCDate(d.getUTCDate() + 1); return d.getTime(); })(); // 23:30 en Tucumán (UTC-3)
  await clock.set(nextMidnightLocal);
  const opD = await finishedOperational(cmd.cmdD); const idD = await obligationId(cmd.cmdD, opD.id); const t0 = await nowMs(); const dueD = Date.parse((await mineFor(cmd.cmdD)).find((x) => x.id === idD).vencimiento);
  assert.ok(Math.abs(dueD - (t0 + 48 * HOUR)) < 10000); const localDay = (ms) => new Date(ms - 3 * HOUR).toISOString().slice(0, 10);
  assert.equal((Date.parse(localDay(dueD)) - Date.parse(localDay(t0))) / 86400000, 2, 'el plazo cruza dos días civiles locales');
  await clock.set(t0 + 1 * HOUR); await ok(`/final-reports/${idD}/submit`, { method: 'POST', token: cmd.cmdD.token, body: { texto: 'v1' } });
  const returnAt = dueD + 2 * HOUR; await clock.set(returnAt); // la revisión se demora más allá del vencimiento original
  const ret1 = await ok(`/final-reports/${idD}/review`, { method: 'POST', token: ops.token, body: { aprobar: false, motivoDevolucion: 'Corregir' } }); const due2 = Date.parse(ret1.vencimiento); assert.ok(Math.abs(due2 - (returnAt + 48 * HOUR)) < 10000);
  assert.equal(await isBlocked(cmd.cmdD), false, 'la demora del revisor no bloquea al comandante'); await clock.set(due2 - 60000); assert.equal(await isBlocked(cmd.cmdD), false);
  await ok(`/final-reports/${idD}/submit`, { method: 'POST', token: cmd.cmdD.token, body: { texto: 'v2 dentro del nuevo plazo' } }); assert.equal(await isBlocked(cmd.cmdD), false);
  const ret2At = due2 - 59000; const ret2 = await ok(`/final-reports/${idD}/review`, { method: 'POST', token: ops.token, body: { aprobar: false, motivoDevolucion: 'Segunda devolución' } }); const due3 = Date.parse(ret2.vencimiento); assert.ok(due3 > ret2At + 47 * HOUR && due3 < ret2At + 49 * HOUR); assert.equal(obligationOf(opD.id)[3], '0');
  await clock.set(due3); assert.equal(await isBlocked(cmd.cmdD), true, 'el plazo reiniciado también vence'); await sweep(); assert.equal(notifCount('COMMANDER_BLOCKED', cmd.cmdD, opD.id), 1);
  await ok(`/final-reports/${idD}/submit`, { method: 'POST', token: cmd.cmdD.token, body: { texto: 'v3 tardía' } }); assert.equal(await isBlocked(cmd.cmdD), false); assert.equal(notifCount('COMMANDER_UNBLOCKED', cmd.cmdD, opD.id), 1);
  assert.deepEqual((await ok(`/final-reports/${idD}`, { token: ops.token })).versiones.map((v) => v.estado), ['PRESENTADO', 'DEVUELTO', 'DEVUELTO']);
  pass('D plazo reiniciado con reloj controlado y zona explícita: 48 h exactas cruzando dos medianoches locales, devolución tardía sin bloqueo, presentación dentro del nuevo plazo, segundo plazo vencido, bloqueo/desbloqueo y tres versiones conservadas');

  // ---------- E: múltiples obligaciones ----------
  const e1 = await finishedOperational(cmd.cmdE), e2 = await finishedOperational(cmd.cmdE); const ide1 = await obligationId(cmd.cmdE, e1.id), ide2 = await obligationId(cmd.cmdE, e2.id);
  const dueE = Date.parse((await mineFor(cmd.cmdE)).find((x) => x.id === ide1).vencimiento); await clock.set(dueE + 3 * HOUR);
  assert.equal(await isBlocked(cmd.cmdE), true); const pendingE = await plannedOperational(cmd.cmdE).catch((e) => e); assert.ok(pendingE instanceof Error && /409/.test(pendingE.message), 'un comandante bloqueado no recibe nuevas asignaciones');
  await ok(`/final-reports/${ide1}/submit`, { method: 'POST', token: cmd.cmdE.token, body: { texto: 'Primero' } }); assert.equal(await isBlocked(cmd.cmdE), true, 'sigue bloqueado por la otra obligación');
  assert.equal(notifCount('COMMANDER_UNBLOCKED', cmd.cmdE, e1.id), 0); assert.equal(auditCount(e1.id, 'FINAL_REPORT_OBLIGATION', 'UNBLOCK_COMMANDER'), 0);
  await call(`/flights/${e1.id}/log`, { method: 'POST', token: cmd.cmdE.token, body: { tipo: 'DEMORA', descripcion: 'x', ocurrido: new Date(Date.now() - 60000).toISOString(), importancia: 'NORMAL' }, expect: [403] });
  await multipart(`/final-reports/${ide2}/submit`, cmd.cmdE.token, {}, { bytes: PDF, name: 'segundo.pdf' }); assert.equal(await isBlocked(cmd.cmdE), false); assert.equal(notifCount('COMMANDER_UNBLOCKED', cmd.cmdE, e2.id), 1);
  pass('E dos obligaciones vencidas: resolver una mantiene el bloqueo (y los endpoints rechazados); resolver la última, con PDF, lo levanta una sola vez');

  // ---------- H: persistencia tras reiniciar ----------
  const mine = [sanitary, opB.id, opC.id, pendingC.id, opD.id, e1.id, e2.id, opX.id, gFlight.id, opI.id].join(',');
  const snapshot = () => sql(`SELECT 'o:' + CAST((SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos IN (${mine})) AS varchar) + ' i:' + CAST((SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos IN (${mine})) AS varchar) + ' n:' + CAST((SELECT COUNT(*) FROM notificaciones WHERE id_vuelos IN (${mine})) AS varchar) + ' a:' + CAST((SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos IN (${mine})) AS varchar) + ' e:' + CAST((SELECT COUNT(*) FROM informes_finales_vuelo WHERE id_vuelos IN (${mine}) AND estado_revision<>N'PRESENTADO') AS varchar) + ' f:' + CAST((SELECT COUNT(*) FROM informes_finales_vuelo WHERE adjunto_ubicacion IS NOT NULL) AS varchar)`);
  const before = snapshot(); const stateBefore = [stateOf(sanitary), stateOf(opB.id), stateOf(opC.id), stateOf(opD.id), stateOf(opI.id), obligationOf(opD.id)[1], obligationOf(opX.id)[1]]; const offset = (await clock.get()).offsetSeconds; const files = storedFiles();
  const restart = spawnSync('docker', ['restart', BACKEND], { encoding: 'utf8' }); assert.equal(restart.status, 0, restart.stderr);
  await waitHealthy(); admin = await adminLogin(); await ok('/e2e/clock', { method: 'PUT', token: admin, body: { offsetSeconds: offset } }); // el reloj de prueba no sobrevive al reinicio: se restablece el mismo desplazamiento
  await sweep(); await sweep(); assert.equal(snapshot(), before, 'el barrido posterior al reinicio no duplica registros'); assert.equal(storedFiles(), files, 'los PDF siguen en el almacenamiento persistente');
  assert.deepEqual([stateOf(sanitary), stateOf(opB.id), stateOf(opC.id), stateOf(opD.id), stateOf(opI.id), obligationOf(opD.id)[1], obligationOf(opX.id)[1]], stateBefore);
  const afterHistory = await ok(`/final-reports/${idA}`, { token: cmd.cmdA.token }); assert.deepEqual(afterHistory.versiones.map((v) => v.estado), ['APROBADO', 'DEVUELTO']);
  const afterI = await ok(`/final-reports/${idI}`, { token: cmd.cmdI.token }); assert.deepEqual(afterI.versiones.map((v) => v.formato), ['TEXTO_Y_PDF', 'PDF']); res = await download(cmd.cmdI.token, 1); assert.equal(sha256(Buffer.from(await res.arrayBuffer())), sha256(PDF), 'descarga correcta tras reiniciar');
  assert.equal((await ok(`/flights/${opD.id}`, { token: ops.token })).cierre.estadoAdministrativo, 'EN_REVISION'); assert.ok((await ok('/notifications?size=100', { token: cmd.cmdA.token })).items.some((n) => n.tipo === 'FINAL_REPORT_RETURNED'));
  const xDue = Date.parse((await mineFor(cmd.cmdX)).find((x) => x.id === idX).vencimiento); assert.equal(await isBlocked(cmd.cmdX), (await nowMs()) >= xDue, 'el bloqueo se recalcula tras el reinicio sin estado en memoria');
  await clock.set(xDue + HOUR); assert.equal(await isBlocked(cmd.cmdX), true); await sweep(); assert.equal(notifCount('COMMANDER_BLOCKED', cmd.cmdX, opX.id), 1);
  await clock.reset();
  pass('H reinicio del backend: estados, obligaciones, versiones, PDF, notificaciones y auditoría persisten sin duplicarse; el bloqueo y los avisos se recalculan');
  console.log(`\nE2E CIERRE COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E:', e.stack || e); process.exit(1); });
