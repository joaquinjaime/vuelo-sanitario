/* E2E del bloqueo documental hasta acordar el horario sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e).
 * Backend real en :18080 y SQL Server real; sólo crea registros marcados y nunca borra datos ni toca la base habitual.
 * Recorre el flujo completo por HTTP: solicitud del DTS, bandeja de Operaciones (estado y fecha de recepción reales), documentos bloqueados
 * antes del acuerdo y con una contrapropuesta pendiente (409 con código estable, sin escribir filas ni archivos), acuerdo por las dos vías
 * (el DTS acepta la contrapropuesta / Operaciones acepta el horario solicitado), habilitación con las validaciones documentales de siempre,
 * permisos que el acuerdo no concede y la imposibilidad de reabrir una negociación ya acordada.
 * Uso: node scripts/e2e-documentos-horario.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PDF, ROOT, BASE, BACKEND, DB_NAME, MARK, sql, one, count, call, ok, fmt, futureSlot, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');
let passed = 0;
const pass = (text) => { passed++; console.log('PASS: ' + text); };
const pdfWith = (extra) => Buffer.from(PDF.toString('latin1').replace('startxref', extra + '\nstartxref'), 'latin1');
const storedFiles = () => Number(spawnSync('docker', ['exec', BACKEND, 'sh', '-c', 'ls /data/documents | wc -l'], { encoding: 'utf8' }).stdout.trim());
const LOCKED = 'DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED';

async function raw(method, p, token, form) {
  const res = await fetch(BASE + p, { method, headers: token ? { Authorization: 'Bearer ' + token } : {}, body: form });
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const formOf = (fields, bytes, name = 'documento.pdf') => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields || {})) form.append(k, String(v));
  if (bytes) form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  return form;
};

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`), 'El backend no apunta a la base E2E');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;

  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'hops'), dts = await createUser(admin, 'DTS', 'hdts'), dts2 = await createUser(admin, 'DTS', 'hdts2'), cmd = await createUser(admin, 'COMANDANTE', 'hcmd');
  let localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token }); if (localities.length >= 2) break; }
  assert.ok(localities.length >= 2, 'Se requiere una provincia con dos localidades');
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Horario', apellido: MARK } });
  const request = async (label) => (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: label + ' ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  const stateOf = (id) => one(`SELECT e.codigo_estado_solicitud FROM vuelos_sanitarios s JOIN estados_solicitud_sanitaria e ON e.id_estados_solicitud_sanitaria=s.id_estados_solicitud_sanitaria WHERE s.id_vuelos=${id}`);
  const docRows = (id) => count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos=${id}`);
  const versionRows = (id) => count(`SELECT COUNT(*) FROM versiones_documento_vuelo v JOIN documentos_vuelo d ON d.id_documentos_vuelo=v.id_documentos_vuelo WHERE d.id_vuelos=${id}`);
  const create = (flight, who, name) => raw('POST', `/flights/${flight}/documents/pdf`, who.token, formOf({ documentTypeCode: 'AUTORIZACION', nombreDocumento: name }, pdfWith('% ' + name)));
  const assertLocked = (r, pending, label) => { assert.equal(r.status, 409, `${label}: HTTP ${r.status} ${JSON.stringify(r.data)}`); assert.equal(r.data.code, LOCKED, label); assert.equal(r.data.pendientePor, pending, label); assert.match(r.data.error, /primero debe acordarse el horario de salida/, label); };
  const assertEveryOperationLocked = async (flight, pending, label) => {
    const docsBefore = docRows(flight), versionsBefore = versionRows(flight), filesBefore = storedFiles();
    assertLocked(await raw('GET', `/flights/${flight}/documents`, ops.token), pending, label + ': listar');
    assertLocked(await raw('GET', `/flights/${flight}/documents/types`, ops.token), pending, label + ': tipos');
    assertLocked(await raw('GET', `/flights/${flight}/documents/retired`, ops.token), pending, label + ': retirados');
    assertLocked(await create(flight, ops, 'Bloqueado ' + MARK), pending, label + ': alta');
    assertLocked(await raw('GET', `/flights/${flight}/documents`, dts.token), pending, label + ': el solicitante tampoco consulta');
    assert.equal(docRows(flight), docsBefore); assert.equal(versionRows(flight), versionsBefore); assert.equal(storedFiles(), filesBefore, label + ': no se escribió ningún archivo');
  };
  // Las gestiones de etapas posteriores (hangar, coordinaciones, bitácora manual) también se rechazan sin acuerdo y no dejan filas.
  const prepRows = (id) => [count(`SELECT COUNT(*) FROM informacion_hangar WHERE id_vuelos=${id}`), count(`SELECT COUNT(*) FROM coordinaciones_aa2000 WHERE id_vuelos=${id}`), count(`SELECT COUNT(*) FROM bitacora_vuelos WHERE id_vuelos=${id} AND origen_acontecimiento=N'MANUAL'`)];
  const assertPreparationLocked = async (flight, pending, label) => {
    const before = prepRows(flight);
    const attempts = [
      ['PUT', `/flights/${flight}/hangar`, { version: 0, requiereHangar: true, preparacionCompleta: false, observaciones: 'Prueba ' + MARK }],
      ['POST', `/flights/${flight}/airport-coordinations`, { version: 0, aeropuertoId: 1, finalidad: 'Despegue', descripcion: 'Prueba ' + MARK, estado: 'PENDIENTE' }],
      ['POST', `/flights/${flight}/log`, { tipo: 'PREPARACION', descripcion: 'Prueba ' + MARK, ocurrido: new Date(Date.now() - 60000).toISOString(), importancia: 'NORMAL' }],
    ];
    for (const [method, path, body] of attempts) {
      const r = await call(path, { method, token: ops.token, body, expect: [409] });
      assert.equal(r.data.code, 'SCHEDULE_NOT_AGREED', label + ' ' + path); assert.equal(r.data.pendientePor, pending, label + ' ' + path); assert.match(r.data.error, /horario de salida esté acordado/);
    }
    assert.deepEqual(prepRows(flight), before, label + ': no se registró nada');
    assert.equal((await ok(`/flights/${flight}/hangar`, { token: ops.token })).puedeGestionar, false, label + ': el hangar informa que no se puede gestionar');
  };
  pass('usuarios (Operaciones, 2 DTS, comandante) y paciente de prueba creados en la base E2E aislada');

  // A. Nueva solicitud: persistida y visible para Operaciones con su estado y fecha de recepción reales.
  const A = await request('Horario DTS acepta');
  assert.equal(stateOf(A), 'SOLICITADO');
  const listed = (await ok('/flights', { token: ops.token })).find((f) => f.id === A);
  assert.ok(listed, 'la solicitud aparece en la lista de Operaciones'); assert.equal(listed.datosSanitarios.estadoSolicitud, 'SOLICITADO'); assert.ok(listed.datosSanitarios.fechaRecepcion, 'fecha de recepción real');
  assert.equal(listed.datosSanitarios.extremaUrgencia, false);
  assert.ok((await ok('/flights', { token: dts.token })).some((f) => f.id === A));
  pass('A solicitud sanitaria persistida; Operaciones la encuentra en /flights con estado SOLICITADO y fecha de recepción');

  // B. Sin acuerdo: todo bloqueado de forma consistente (API); el estado se informa sin exponer documentos.
  const access = await ok(`/flights/${A}/documents/access`, { token: ops.token });
  assert.equal(access.disponible, false); assert.equal(access.codigo, LOCKED); assert.equal(access.estadoSolicitud, 'SOLICITADO'); assert.equal(access.pendientePor, 'OPERACIONES');
  await assertEveryOperationLocked(A, 'OPERACIONES', 'B');
  await assertPreparationLocked(A, 'OPERACIONES', 'B');
  pass('B sin horario acordado: listar, tipos, retirados, alta y consulta del solicitante = 409 DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED, sin filas ni archivos nuevos');

  // C. Propuesta pendiente: la fecha propuesta por Operaciones no es un acuerdo.
  await call(`/flights/${A}/schedule/counterproposal`, { method: 'POST', token: ops.token, body: { salida: fmt(new Date(futureSlot().getTime() + 86400000)), motivo: 'Aeronave disponible ese día ' + MARK } });
  assert.equal(stateOf(A), 'PENDIENTE_RESPUESTA_DTS');
  assert.equal((await ok(`/flights/${A}/documents/access`, { token: ops.token })).pendientePor, 'DTS');
  await assertEveryOperationLocked(A, 'DTS', 'C');
  await assertPreparationLocked(A, 'DTS', 'C');
  pass('C contrapropuesta pendiente de respuesta del DTS: la documentación sigue bloqueada (pendientePor = DTS)');

  // F (antes del acuerdo). Quien no puede ver el vuelo recibe 403, no el estado.
  assert.equal((await raw('GET', `/flights/${A}/documents`, dts2.token)).status, 403);
  assert.equal((await raw('GET', `/flights/${A}/documents/access`, dts2.token)).status, 403);
  assert.equal((await raw('GET', `/flights/${A}/documents`, cmd.token)).status, 403);
  assert.equal((await raw('GET', `/flights/${A}/documents`, admin)).status, 403);
  assert.ok([401, 403].includes((await raw('GET', `/flights/${A}/documents`)).status));
  pass('F otro DTS, comandante ajeno, administrador y anónimo: 403/401 (falta de permisos distinta del bloqueo por estado)');

  // D. El DTS acepta la contrapropuesta: acuerdo registrado y documentación habilitada, con las validaciones de siempre.
  const detail = await ok(`/flights/${A}`, { token: ops.token });
  const proposal = [...detail.negociacion].reverse().find((e) => e.tipo === 'CO_CONTRAPROPUESTA');
  await call(`/flights/${A}/schedule/response`, { method: 'POST', token: dts.token, body: { propuestaId: proposal.id, aceptar: true } });
  assert.equal(stateOf(A), 'APROBADO');
  assert.deepEqual({ ...(await ok(`/flights/${A}/documents/access`, { token: ops.token })) }, { disponible: true, codigo: null, mensaje: null, estadoSolicitud: 'APROBADO', pendientePor: null });
  assert.deepEqual(await ok(`/flights/${A}/documents`, { token: ops.token }), []);
  const created = await raw('POST', `/flights/${A}/documents/pdf`, ops.token, formOf({ documentTypeCode: 'AUTORIZACION', nombreDocumento: 'Autorización ' + MARK }, pdfWith('% ok ' + MARK)));
  assert.equal(created.status, 200, JSON.stringify(created.data)); assert.equal(created.data.versionActual.numeroVersion, 1);
  assert.equal(docRows(A), 1); assert.equal(versionRows(A), 1);
  assert.equal((await create(A, ops, 'autorización ' + MARK)).status, 409, 'validación existente: nombre duplicado');
  assert.equal((await raw('POST', `/flights/${A}/documents/pdf`, ops.token, formOf({ documentTypeCode: 'NO_EXISTE', nombreDocumento: 'X ' + MARK }, pdfWith('% x')))).status, 400, 'validación existente: tipo inexistente');
  await call(`/flights/${A}/hangar`, { method: 'PUT', token: ops.token, body: { version: 0, requiereHangar: true, preparacionCompleta: false, observaciones: 'Con acuerdo ' + MARK } });
  assert.deepEqual(prepRows(A).slice(0, 1), [1], 'con acuerdo el hangar se registra');
  assert.equal((await ok(`/flights/${A}/log`, { token: ops.token })).puedeRegistrar, true);
  assert.equal((await raw('POST', `/documents/${created.data.id}/lock`, ops.token)).status, 200);
  assert.equal((await raw('POST', `/documents/${created.data.id}/versions/pdf`, ops.token, formOf({}, pdfWith('% v2 ' + MARK)))).data.versionActual.numeroVersion, 2);
  assert.equal((await ok(`/flights/${A}/documents`, { token: dts.token })).length, 1, 'el DTS solicitante consulta con el acuerdo');
  pass('D el DTS acepta: APROBADO, acceso disponible, alta/bloqueo/versión funcionan y se mantienen nombre duplicado y tipo inexistente');

  // F (con acuerdo). El acuerdo no concede permisos.
  assert.equal((await raw('POST', `/flights/${A}/documents/pdf`, dts.token, formOf({ documentTypeCode: 'AUTORIZACION', nombreDocumento: 'Del DTS ' + MARK }, pdfWith('% dts')))).status, 403);
  assert.equal((await raw('POST', `/documents/${created.data.id}/lock`, dts.token)).status, 403);
  assert.equal((await raw('GET', `/flights/${A}/documents`, dts2.token)).status, 403);
  assert.equal((await raw('POST', `/documents/${created.data.id}/versions/pdf`, cmd.token, formOf({}, pdfWith('% cmd')))).status, 403);
  pass('F con acuerdo: el DTS no escribe, otro DTS y un comandante ajeno siguen sin acceso (403)');

  // E. No hay forma de reabrir una negociación acordada: Operaciones no puede volver a contraproponer.
  await call(`/flights/${A}/schedule/counterproposal`, { method: 'POST', token: ops.token, body: { salida: fmt(new Date(futureSlot().getTime() + 2 * 86400000)), motivo: 'Reabrir ' + MARK }, expect: [400] });
  assert.equal(stateOf(A), 'APROBADO'); assert.equal(docRows(A), 1); assert.equal(versionRows(A), 2);
  pass('E la negociación acordada no puede reabrirse (400): el acuerdo, los documentos y sus versiones permanecen');

  // D2. Segunda vía de acuerdo: Operaciones acepta el horario solicitado por el DTS.
  const B = await request('Horario CO acepta');
  assertLocked(await create(B, ops, 'Antes ' + MARK), 'OPERACIONES', 'B2');
  await call(`/flights/${B}/schedule/accept`, { method: 'POST', token: ops.token });
  assert.equal(stateOf(B), 'APROBADO');
  assert.equal((await create(B, ops, 'Después ' + MARK)).status, 200);
  pass('D2 Operaciones acepta el horario solicitado: antes 409, después la documentación queda habilitada');

  // Rechazo directo: solicitud cerrada sin acuerdo, nunca escribible.
  const C = await request('Horario rechazada');
  const reason = (await ok('/catalogs/cancellation-reasons', { token: ops.token })).find((x) => x.codigo !== 'OTRO');
  await call(`/flights/${C}/schedule/reject`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } });
  assert.equal((await create(C, ops, 'Tarde ' + MARK)).status, 400);
  assert.deepEqual(await ok(`/flights/${C}/documents`, { token: dts.token }), []);
  pass('solicitud rechazada: consulta sin documentos y escritura rechazada (400 sólo consulta), sin error de horario');

  console.log(`\nE2E documentos/horario: ${passed} bloques aprobados`);
})().catch((e) => { console.error(e); process.exit(1); });
