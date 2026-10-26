/* E2E de la gestión documental de vuelos sobre el stack aislado (proyecto vuelos-sanitarios-e2e, base vuelos_sanitarios_e2e).
 * Backend real en :18080 y SQL Server real; sólo crea registros marcados y nunca borra datos ni toca la base habitual.
 * Cubre un vuelo sanitario y uno operativo: alta y clasificación, validación de archivos, permisos por rol y por vuelo,
 * versionado con conservación histórica y descarga con comprobación de bytes, bloqueos (carrera, vencimiento con el reloj
 * ajustable del backend E2E, liberación y pérdida de autorización), vuelos cerrados, auditoría e integridad SQL.
 * El reloj sólo se adelanta para vencer leases y se restablece al final. Uso: node scripts/e2e-documentos.cjs */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PDF, ROOT, BASE, BACKEND, DB_NAME, MARK, sleep, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');
let passed = 0;
const pass = (text) => { passed++; console.log('PASS: ' + text); };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pdfWith = (extra) => Buffer.from(PDF.toString('latin1').replace('startxref', extra + '\nstartxref'), 'latin1');
const storedFiles = () => Number(spawnSync('docker', ['exec', BACKEND, 'sh', '-c', 'ls /data/documents | wc -l'], { encoding: 'utf8' }).stdout.trim());
const storedSha = (key) => spawnSync('docker', ['exec', BACKEND, 'sha256sum', '/data/documents/' + key], { encoding: 'utf8' }).stdout.split(/\s+/)[0];

async function raw(method, p, token, form) {
  const res = await fetch(BASE + p, { method, headers: token ? { Authorization: 'Bearer ' + token } : {}, body: form });
  const buf = Buffer.from(await res.arrayBuffer());
  let data = null; const text = buf.toString('utf8'); try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, buf, headers: res.headers };
}
function formOf(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields || {})) if (v !== undefined && v !== null) form.append(k, String(v));
  if (file) form.append('file', new Blob([file.bytes], { type: file.type ?? 'application/pdf' }), file.name ?? 'documento.pdf');
  return form;
}
async function send(method, p, token, fields, file, expect = [200]) {
  let r;
  try { r = await raw(method, p, token, file || fields ? formOf(fields, file) : undefined); }
  catch (e) { if ((Array.isArray(expect) ? expect : [expect]).includes(413)) return { status: 413 }; throw e; }
  const allowed = Array.isArray(expect) ? expect : [expect];
  if (!allowed.includes(r.status)) throw new Error(`${method} ${p}: HTTP ${r.status}, esperado ${allowed}; ${String(r.buf.toString('utf8')).slice(0, 300)}`);
  return r;
}

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`), 'El backend no apunta a la base E2E');
  assert.equal(env.APP_E2E_CONTROLS_ENABLED, 'true', 'Falta el overlay E2E con reloj ajustable'); assert.ok(env.SPRING_PROFILES_ACTIVE.split(',').includes('e2e'));
  const LEASE = Number(env.DOCUMENT_LOCK_SECONDS || 300); assert.ok(LEASE >= 60, 'El E2E documental necesita leases reales (>= 60 s); el vencimiento se provoca con el reloj ajustable');
  assert.equal(one('SELECT DB_NAME()'), DB_NAME);
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 51);
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const clock = { get: async () => ok('/e2e/clock', { token: admin }), set: async (ms) => ok('/e2e/clock', { method: 'PUT', token: admin, body: { instant: new Date(ms).toISOString() } }), reset: async () => ok('/e2e/clock', { method: 'PUT', token: admin, body: { reset: true } }) };
  await clock.reset();
  pass(`base E2E aislada en Flyway >= V51, backend saludable, lease documental real de ${LEASE} s y reloj ajustable`);

  try {
    // ---------- Fixtures ----------
    const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'dops'), ops2 = await createUser(admin, 'OPERACIONES', 'dops2'), ops3 = await createUser(admin, 'OPERACIONES', 'dops3'), ops4 = await createUser(admin, 'OPERACIONES', 'dops4');
    const dts = await createUser(admin, 'DTS', 'ddts'), dts2 = await createUser(admin, 'DTS', 'ddts2');
    const cmd = {}; for (const n of ['cmdA', 'cmdB', 'cmdC', 'cmdD', 'cmdX']) { cmd[n] = await createUser(admin, 'COMANDANTE', n); await provision(admin, cmd[n]); }
    let province, airports, localities;
    for (const p of await ok('/catalogs/provinces', { token: ops.token })) {
      airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token });
      if (airports.length >= 2 && localities.length >= 2) { province = p; break; }
    }
    assert.ok(province, 'Se requiere una provincia con dos aeropuertos y dos localidades');
    for (const n of Object.keys(cmd)) await call(`/catalogs/commanders/${cmd[n].id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
    let plateSeq = 0;
    const newPlane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'D' + (++plateSeq)).toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
    const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
    const reason = (await ok('/catalogs/cancellation-reasons', { token: ops.token })).find((x) => x.codigo !== 'OTRO');
    const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
    async function plannedOperational(commander) {
      const plane = await newPlane(); const when = futureSlot();
      const flight = await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Documentos ' + MARK, aircraftId: plane.id, comandanteId: commander.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } });
      await call(`/flights/${flight.id}/commander-assignment/response`, { method: 'POST', token: commander.token, body: { aceptar: true } });
      assert.equal(stateOf(flight.id), 'PLANIFICADO'); return flight.id;
    }
    const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Documentos', apellido: MARK } });
    const whenS = futureSlot(); const planeS = await newPlane();
    const S = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Documentos sanitario ' + MARK, fechaSolicitada: fmt(whenS), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
    await call(`/flights/${S}/schedule/accept`, { method: 'POST', token: ops.token });
    await call(`/flights/${S}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: planeS.id, comandanteId: cmd.cmdA.id } });
    await call(`/flights/${S}/operational-planning`, { method: 'POST', token: cmd.cmdA.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: fmt(new Date(whenS.getTime() + 7200000)) } });
    assert.equal(stateOf(S), 'PLANIFICADO');
    const O = await plannedOperational(cmd.cmdB);
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${S}`), 1); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${O}`), 0);
    pass('usuarios (CO, 3 OPERACIONES, 2 DTS, 5 comandantes), un vuelo sanitario y uno operativo no sanitario planificados');

    const downloads = { [S]: 0, [O]: 0 };
    const createDoc = (flight, who, name, bytes, type = 'PLAN_DE_VUELO', file = {}, expect = [200]) => send('POST', `/flights/${flight}/documents/pdf`, who.token, { documentTypeCode: type, nombreDocumento: name }, bytes === null ? null : { bytes, ...file }, expect);
    const addVersion = (id, who, bytes, expect = [200], file = {}) => send('POST', `/documents/${id}/versions/pdf`, who.token, null, { bytes, ...file }, expect);
    const lock = (id, who, method = 'POST', expect = [200]) => raw(method, `/documents/${id}/lock`, who.token).then((r) => { assert.ok((Array.isArray(expect) ? expect : [expect]).includes(r.status), `${method} lock ${id}: HTTP ${r.status} ${r.buf.toString().slice(0, 200)}`); return r; });
    const download = async (flight, versionId, who, expect = 200) => { const r = await raw('GET', `/document-versions/${versionId}/download`, who.token); assert.equal(r.status, expect, `descarga ${versionId} por ${who.name}`); if (expect === 200) downloads[flight]++; return r; };
    const rows = (flight) => sql(`SELECT d.id_documentos_vuelo, d.nombre_documento, t.codigo_tipo_documento, d.esta_activo FROM documentos_vuelo d JOIN tipos_documento t ON t.id_tipos_documento=d.id_tipos_documento WHERE d.id_vuelos=${flight} ORDER BY d.id_documentos_vuelo`).split(/\r?\n/).filter((l) => l.includes('|'));
    const versionsSql = (itemId) => sql(`SELECT numero_version, es_version_actual, id_usuario_creador, tamanio_bytes, ubicacion_almacenamiento, nombre_archivo_original FROM versiones_documento_vuelo WHERE id_documentos_vuelo=${itemId} ORDER BY numero_version`).split(/\r?\n/).filter((l) => l.includes('|')).map((l) => l.split('|').map((x) => x.trim()));
    const totalDocs = () => count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos IN (${S},${O})`);
    const totalVersions = () => count(`SELECT COUNT(*) FROM versiones_documento_vuelo v JOIN documentos_vuelo d ON d.id_documentos_vuelo=v.id_documentos_vuelo WHERE d.id_vuelos IN (${S},${O})`);

    // ---------- A: catálogo real ----------
    const sqlTypes = sql('SELECT codigo_tipo_documento FROM tipos_documento ORDER BY 1').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    for (const who of [ops, dts, cmd.cmdA]) assert.deepEqual((await ok('/catalogs/document-types', { token: who.token })).map((t) => t.codigo).sort(), sqlTypes);
    assert.deepEqual((await ok('/catalogs/document-types', { token: admin })).map((t) => t.codigo).sort(), sqlTypes);
    await call('/catalogs/document-types', { expect: [401, 403] });
    assert.ok(sqlTypes.includes('PLAN_DE_VUELO') && sqlTypes.includes('AUTORIZACION') && sqlTypes.includes('PARTE_MEDICO'));
    pass(`A catálogo: los ${sqlTypes.length} tipos del selector coinciden con tipos_documento para DTS, Operaciones, comandante y administración; sin sesión se rechaza`);

    // ---------- B: alta y clasificación en ambos tipos de vuelo ----------
    const pdfA = pdfWith('% plan S ' + MARK), pdfB = pdfWith('% plan S v2 ' + MARK), pdfC = pdfWith('% plan S v3 ' + MARK);
    const d1 = (await createDoc(S, ops, 'Plan de vuelo S ' + MARK, pdfA, 'PLAN_DE_VUELO', { name: 'plan.pdf' })).data;
    assert.equal(d1.tipoDocumento.codigo, 'PLAN_DE_VUELO'); assert.equal(d1.versionActual.numeroVersion, 1); assert.equal(d1.versionActual.esVersionActual, true); assert.equal(d1.versionActual.creadoPor, ops.name);
    assert.equal(rows(S).length, 1); assert.deepEqual(rows(S)[0].split('|').map((x) => x.trim()).slice(1), ['Plan de vuelo S ' + MARK, 'PLAN_DE_VUELO', '1']);
    const v1sql = versionsSql(d1.id); assert.equal(v1sql.length, 1); assert.deepEqual(v1sql[0].slice(0, 4), ['1', '1', String(ops.id), String(pdfA.length)]);
    assert.equal(storedSha(v1sql[0][4]), sha256(pdfA), 'el archivo almacenado es idéntico al cargado');
    const d2 = (await createDoc(O, cmd.cmdB, 'Autorización O ' + MARK, pdfWith('% auth O ' + MARK), 'AUTORIZACION', { name: 'autorizacion.pdf' })).data;
    assert.equal(d2.tipoDocumento.codigo, 'AUTORIZACION'); assert.equal(count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos=${O} AND id_documentos_vuelo=${d2.id}`), 1);
    const d3 = (await createDoc(S, cmd.cmdA, 'Parte médico S ' + MARK, pdfWith('% parte ' + MARK), 'PARTE_MEDICO', { name: 'parte.pdf' })).data; assert.equal(d3.tipoDocumento.codigo, 'PARTE_MEDICO');
    const d4 = (await createDoc(O, ops2, 'Otro O ' + MARK, pdfWith('% otro ' + MARK), 'OTRO', { name: 'otro.pdf' })).data; assert.equal(d4.tipoDocumento.codigo, 'OTRO');
    assert.equal(rows(S).length, 2); assert.equal(rows(O).length, 2);
    const listS = (who) => ok(`/flights/${S}/documents`, { token: who.token }), listO = (who) => ok(`/flights/${O}/documents`, { token: who.token });
    for (const who of [ops, ops2, dts, cmd.cmdA]) assert.deepEqual((await listS(who)).map((x) => x.id).sort(), [d1.id, d3.id].sort(), `lista S de ${who.name}`);
    for (const who of [ops, cmd.cmdB]) assert.deepEqual((await listO(who)).map((x) => x.id).sort(), [d2.id, d4.id].sort(), `lista O de ${who.name}`);
    pass('B alta y clasificación: documentos PLAN_DE_VUELO, PARTE_MEDICO, AUTORIZACION y OTRO en el vuelo sanitario y en el operativo por Operaciones y por el comandante; archivo almacenado idéntico (SHA-256) y listas coherentes por rol');

    // ---------- C: permisos por rol y por vuelo, y manipulación de identificadores ----------
    const docsBefore = totalDocs(), versionsBefore = totalVersions(), filesBefore = storedFiles(), eventsBefore = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos IN (${S},${O}) AND tipo_entidad IN (N'DOCUMENT',N'DOCUMENT_LOCK')`);
    const deny = async (who, label, expectStatus = [403]) => {
      for (const [m, p] of [['GET', `/flights/${S}/documents`], ['GET', `/flights/${O}/documents`], ['GET', `/documents/${d1.id}/versions`], ['GET', `/documents/${d2.id}/versions`], ['GET', `/documents/${d1.id}/lock`], ['GET', `/documents/${d2.id}/lock`], ['GET', `/document-versions/${d1.versionActual.id}/download`], ['GET', `/document-versions/${d2.versionActual.id}/download`]]) {
        if (label.skip?.some(([mm, pp]) => mm === m && pp === p)) continue;
        const r = await raw(m, p, who.token); assert.ok(expectStatus.includes(r.status), `${label.name}: ${m} ${p} -> ${r.status}`);
      }
    };
    await deny(cmd.cmdX, { name: 'comandante ajeno' }); await deny(dts2, { name: 'DTS que no solicitó' }); await deny({ token: admin }, { name: 'administrador' });
    await deny(dts, { name: 'DTS solicitante', skip: [['GET', `/flights/${S}/documents`], ['GET', `/documents/${d1.id}/versions`], ['GET', `/documents/${d1.id}/lock`], ['GET', `/document-versions/${d1.versionActual.id}/download`]] });
    await deny(cmd.cmdB, { name: 'comandante de otro vuelo', skip: [['GET', `/flights/${O}/documents`], ['GET', `/documents/${d2.id}/versions`], ['GET', `/documents/${d2.id}/lock`], ['GET', `/document-versions/${d2.versionActual.id}/download`]] });
    await deny(cmd.cmdA, { name: 'comandante del vuelo sanitario sobre el operativo', skip: [['GET', `/flights/${S}/documents`], ['GET', `/documents/${d1.id}/versions`], ['GET', `/documents/${d1.id}/lock`], ['GET', `/document-versions/${d1.versionActual.id}/download`]] });
    for (const who of [cmd.cmdX, dts2, cmd.cmdB]) { // escrituras sobre documentos ajenos (el identificador conocido no basta)
      await createDoc(S, who, 'Intruso ' + MARK, pdfA, 'OTRO', {}, [403]); await lock(d1.id, who, 'POST', [403]); await lock(d1.id, who, 'DELETE', [403]); await addVersion(d1.id, who, pdfB, [403]);
    }
    await createDoc(O, cmd.cmdA, 'Intruso ' + MARK, pdfA, 'OTRO', {}, [403]); await lock(d2.id, cmd.cmdA, 'POST', [403]); await addVersion(d2.id, cmd.cmdA, pdfB, [403]);
    for (const who of [dts, dts2]) { await createDoc(S, who, 'DTS ' + MARK, pdfA, 'OTRO', {}, [403]); await lock(d1.id, who, 'POST', [403]); await lock(d1.id, who, 'DELETE', [403]); await addVersion(d1.id, who, pdfB, [403]); }
    for (const [m, p] of [['POST', `/flights/${S}/documents/pdf`], ['POST', `/documents/${d1.id}/versions/pdf`], ['POST', `/documents/${d1.id}/lock`]]) { const r = await raw(m, p, admin, p.endsWith('lock') ? undefined : formOf({ documentTypeCode: 'OTRO', nombreDocumento: 'Admin' }, { bytes: pdfA })); assert.equal(r.status, 403, `administrador ${p}`); }
    for (const p of [`/flights/${S}/documents`, `/documents/${d1.id}/versions`, `/document-versions/${d1.versionActual.id}/download`]) assert.ok([401, 403].includes((await raw('GET', p)).status));
    for (const [m, p, code] of [['GET', '/flights/999999999/documents', 404], ['GET', '/documents/999999999/versions', 404], ['GET', '/documents/999999999/lock', 404], ['POST', '/documents/999999999/lock', 404], ['DELETE', '/documents/999999999/lock', 404], ['GET', '/document-versions/999999999/download', 404]]) assert.equal((await raw(m, p, ops.token)).status, code, p);
    await createDoc(999999999, ops, 'Fantasma', pdfA, 'OTRO', {}, [404]); await addVersion(999999999, ops, pdfA, [404]);
    assert.equal(totalDocs(), docsBefore); assert.equal(totalVersions(), versionsBefore); assert.equal(storedFiles(), filesBefore, 'ninguna denegación deja archivos'); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos IN (${S},${O}) AND tipo_entidad IN (N'DOCUMENT',N'DOCUMENT_LOCK')`), eventsBefore);
    pass('C permisos: DTS sólo consulta lo suyo; comandantes sólo su vuelo; administración, DTS ajeno y comandante ajeno denegados en lectura, descarga, bloqueo y escritura; ids de otro vuelo, inexistentes y sin sesión rechazados sin dejar documentos, versiones, archivos ni auditoría');

    // ---------- D: validación de archivos y nombres ----------
    const reject = async (name, bytes, file, expect = [400], type = 'OTRO') => { await createDoc(S, ops, name, bytes, type, file, expect); assert.equal(totalDocs(), docsBefore, 'rechazo: ' + name); assert.equal(storedFiles(), filesBefore, 'rechazo sin archivo: ' + name); };
    await reject('Tipo inexistente', pdfA, {}, [400], 'INVENTADO');
    await reject('   ', pdfA); await reject('x'.repeat(256), pdfA);
    await createDoc(S, ops, 'Sin archivo', null, 'OTRO', {}, [400]);
    await reject('Texto con extensión PDF', Buffer.from('esto no es un pdf'), { name: 'falso.pdf' });
    await reject('PDF con extensión TXT', pdfA, { name: 'plan.txt' });
    await reject('PDF con tipo declarado de texto', pdfA, { type: 'text/plain' });
    await reject('PDF con tipo binario genérico', pdfA, { type: 'application/octet-stream' });
    await reject('Vacío', Buffer.alloc(0), {});
    await reject('Demasiado grande', Buffer.concat([PDF.subarray(0, PDF.length - 10), Buffer.alloc(10 * 1024 * 1024 + 4096, 32), Buffer.from('\n%%EOF\n')]), { name: 'grande.pdf' }, [400, 413]);
    await reject('Cabecera de otro formato', Buffer.concat([Buffer.from('PK\u0003\u0004'), PDF]), { name: 'zip.pdf' });
    const dup = (await createDoc(S, ops, 'plan DE VUELO s ' + MARK, pdfA, 'PLAN_DE_VUELO', {}, [409])); assert.match(dup.data.error, /Ya existe un documento con ese nombre/);
    assert.equal(totalDocs(), docsBefore); assert.equal(storedFiles(), filesBefore);
    const named = (await createDoc(S, ops, 'Nombre con ruta ' + MARK, pdfWith('% ruta ' + MARK), 'OTRO', { name: '..\\..\\Plan <final>.pdf' })).data;
    assert.equal(named.versionActual.nombreArchivoOriginal, 'Plan <final>.pdf'); assert.equal(versionsSql(named.id)[0][5], 'Plan <final>.pdf', 'sólo se conserva el nombre del archivo');
    const unicode = (await createDoc(S, ops, 'Autorización ñandú ' + MARK, pdfWith('% ñ ' + MARK), 'AUTORIZACION', { name: 'Autorización ñandú.pdf' })).data;
    const dn = await download(S, unicode.versionActual.id, ops); assert.match(dn.headers.get('content-disposition'), /attachment/); assert.match(decodeURIComponent(dn.headers.get('content-disposition')), /Autorización ñandú\.pdf/); assert.equal(dn.headers.get('content-type'), 'application/pdf');
    pass('D validación: tipo inexistente, nombre vacío o de 256 caracteres, sin archivo, contenido que no es PDF, extensión o tipo MIME incorrectos, vacío, mayor al límite y cabecera ajena rechazados sin dejar registros ni archivos; duplicado (sin distinguir mayúsculas) = 409; la ruta del archivo se descarta; nombres con tildes se descargan íntegros');

    // ---------- E: versionado, bloqueo y conservación histórica ----------
    await addVersion(d1.id, ops, pdfB, [409]); // sin bloqueo
    assert.equal((await lock(d1.id, ops)).data.mine, true);
    const viewOther = (await lock(d1.id, ops2, 'GET')).data; assert.equal(viewOther.active, true); assert.equal(viewOther.mine, false); assert.equal(viewOther.ownerUsername, ops.name);
    assert.equal((await lock(d1.id, dts, 'GET')).data.ownerUsername, ops.name, 'el DTS solicitante puede consultar el estado');
    await lock(d1.id, ops2, 'POST', [409]); await lock(d1.id, cmd.cmdA, 'POST', [409]); await addVersion(d1.id, ops2, pdfC, [409]); await addVersion(d1.id, cmd.cmdA, pdfC, [409]);
    assert.equal(versionsSql(d1.id).length, 1); assert.equal(storedFiles(), filesBefore + 2, 'solo se agregaron los dos documentos válidos anteriores');
    const v2 = (await addVersion(d1.id, ops, pdfB, [200], { name: 'plan-v2.pdf' })).data; assert.equal(v2.versionActual.numeroVersion, 2); assert.equal(v2.id, d1.id, 'la identidad lógica es estable');
    const renewed = (await lock(d1.id, ops)).data; assert.equal(renewed.mine, true);
    // Las fechas se entregan como hora civil de la zona de negocio (Tucumán, UTC-3 sin horario de verano), no como UTC.
    assert.ok(Math.abs(Date.parse(renewed.expiresAt + '-03:00') - (Date.now() + LEASE * 1000)) < 60000, 'vencimiento del lease en hora civil: ' + renewed.expiresAt);
    assert.ok(renewed.remainingSeconds > LEASE - 60 && renewed.remainingSeconds <= LEASE, 'segundos restantes informados por el servidor');
    assert.ok(Math.abs(Date.parse(v2.versionActual.fechaCreacion + '-03:00') - Date.now()) < 120000, 'fecha de la versión en hora civil: ' + v2.versionActual.fechaCreacion);
    await lock(d1.id, ops2, 'DELETE', [403]); await lock(d1.id, ops, 'DELETE', [204]); await lock(d1.id, ops, 'DELETE', [404]);
    assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${d1.id}`), 0);
    await lock(d1.id, ops2); const v3 = (await addVersion(d1.id, ops2, pdfC, [200], { name: 'plan-v3.pdf' })).data; await lock(d1.id, ops2, 'DELETE', [204]);
    assert.equal(v3.versionActual.numeroVersion, 3);
    const hist = await ok(`/documents/${d1.id}/versions`, { token: dts.token });
    assert.deepEqual(hist.versiones.map((v) => [v.numeroVersion, v.esVersionActual, v.creadoPor, v.nombreArchivoOriginal]), [[3, true, ops2.name, 'plan-v3.pdf'], [2, false, ops.name, 'plan-v2.pdf'], [1, false, ops.name, 'plan.pdf']]);
    const sqlVersions = versionsSql(d1.id); assert.deepEqual(sqlVersions.map((r) => [r[0], r[1]]), [['1', '0'], ['2', '0'], ['3', '1']], 'en SQL se conservan las tres versiones y sólo la última es vigente');
    const keys = sqlVersions.map((r) => r[4]); assert.equal(new Set(keys).size, 3);
    for (const [i, bytes] of [pdfA, pdfB, pdfC].entries()) {
      const hv = hist.versiones.find((v) => v.numeroVersion === i + 1); const r = await download(S, hv.id, [ops, dts, cmd.cmdA][i]);
      assert.equal(sha256(r.buf), sha256(bytes), `descarga de la versión ${i + 1} idéntica a la cargada`); assert.equal(storedSha(keys[i]), sha256(bytes), 'el archivo de cada versión sigue almacenado');
    }
    assert.equal((await listS(ops)).find((x) => x.id === d1.id).versionActual.numeroVersion, 3);
    pass('E versionado: sin bloqueo 409; el titular crea v2 y otro editor v3 tras liberar; v1/v2/v3 conservadas en SQL y en disco, sólo v3 vigente, autores correctos y descargas idénticas (SHA-256) para Operaciones, DTS solicitante y comandante; liberar es sólo del propietario');

    // ---------- F: concurrencia ----------
    const racers = [ops, ops2, ops3, cmd.cmdA];
    const winners = async (docId) => (await Promise.all(racers.map((who) => raw('POST', `/documents/${docId}/lock`, who.token).then((r) => ({ who, status: r.status }))))).filter((r) => r.status === 200);
    const w1 = await winners(d3.id); assert.equal(w1.length, 1, 'una sola solicitud simultánea obtiene el bloqueo');
    assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${d3.id}`), 1); assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${d3.id} AND id_usuario_propietario=${w1[0].who.id}`), 1);
    await lock(d3.id, w1[0].who, 'DELETE', [204]);
    const w2 = await winners(d3.id); assert.equal(w2.length, 1); await lock(d3.id, w2[0].who, 'DELETE', [204]);
    const racing = 'Alta simultánea ' + MARK, filesPre = storedFiles(), docsPre = totalDocs();
    const created = await Promise.all([ops, ops2, cmd.cmdA].map((who) => raw('POST', `/flights/${S}/documents/pdf`, who.token, formOf({ documentTypeCode: 'OTRO', nombreDocumento: racing }, { bytes: pdfWith('% carrera ' + who.name) })).then((r) => r.status)));
    assert.deepEqual(created.slice().sort(), [200, 409, 409], 'solo un alta simultánea con el mismo nombre'); assert.equal(totalDocs(), docsPre + 1); assert.equal(storedFiles(), filesPre + 1, 'las altas perdedoras no dejan archivos');
    const d5 = (await listS(ops)).find((x) => x.nombreDocumento === racing);
    await lock(d5.id, ops); const parallel = await Promise.all([1, 2, 3].map((i) => raw('POST', `/documents/${d5.id}/versions/pdf`, ops.token, formOf(null, { bytes: pdfWith('% par ' + i + MARK), name: `par${i}.pdf` })).then((r) => r.status)));
    assert.deepEqual(parallel, [200, 200, 200]); const numbers = versionsSql(d5.id); assert.deepEqual(numbers.map((r) => r[0]), ['1', '2', '3', '4']); assert.equal(numbers.filter((r) => r[1] === '1').length, 1);
    assert.equal(new Set(numbers.map((r) => r[4])).size, 4); await lock(d5.id, ops, 'DELETE', [204]);
    pass('F concurrencia: 4 solicitudes simultáneas de bloqueo (2 rondas) dan exactamente 1 ganador y 1 fila SQL; 3 altas simultáneas del mismo nombre dan 1 documento y 2 conflictos sin archivos huérfanos; 3 versiones simultáneas del titular se numeran 2-4 con una sola vigente');

    // ---------- G: vencimiento y recuperación con el reloj ajustable ----------
    const d6 = (await createDoc(O, cmd.cmdB, 'Plan O ' + MARK, pdfWith('% plan O ' + MARK), 'PLAN_DE_VUELO', {})).data;
    await lock(d6.id, cmd.cmdB); await lock(d6.id, ops, 'POST', [409]);
    const now = Date.parse((await clock.get()).now); await clock.set(now + (LEASE + 2) * 1000);
    const expired = (await lock(d6.id, ops, 'GET')).data; assert.equal(expired.active, false, 'un lease vencido se informa como no vigente'); assert.equal(expired.remainingSeconds, 0); assert.equal((await lock(d6.id, cmd.cmdB, 'GET')).data.active, false);
    await addVersion(d6.id, cmd.cmdB, pdfWith('% tarde ' + MARK), [409]); assert.equal(versionsSql(d6.id).length, 1, 'guardar con el lease vencido no escribe');
    assert.equal((await lock(d6.id, ops)).data.mine, true, 'otro usuario recupera el lease vencido'); await addVersion(d6.id, cmd.cmdB, pdfWith('% tarde2 ' + MARK), [409]);
    const v2O = (await addVersion(d6.id, ops, pdfWith('% recuperado ' + MARK), [200], { name: 'recuperado.pdf' })).data; assert.equal(v2O.versionActual.numeroVersion, 2); await lock(d6.id, ops, 'DELETE', [204]);
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${O} AND tipo_entidad=N'DOCUMENT_LOCK' AND entidad_id=${d6.id} AND operacion=N'RECOVER'`), 1);
    await lock(d6.id, ops2); await clock.set(Date.parse((await clock.get()).now) + (LEASE + 2) * 1000);
    await addVersion(d6.id, ops2, pdfWith('% ops2 vencido ' + MARK), [409]); await lock(d6.id, ops, 'DELETE', [403]); // el lease vencido de otro usuario sigue siendo suyo hasta recuperarlo
    assert.equal(versionsSql(d6.id).length, 2); assert.equal((await lock(d6.id, cmd.cmdB)).data.mine, true); await lock(d6.id, cmd.cmdB, 'DELETE', [204]);
    await clock.reset();
    pass('G vencimiento: con el reloj adelantado el lease aparece no vigente, el titular vencido no puede guardar, otro usuario lo recupera (auditoría RECOVER) y un lease vencido no escribe versiones; ningún bloqueo huérfano impide continuar');

    // ---------- H: pérdida de autorización durante la edición ----------
    const d7 = (await createDoc(O, ops, 'Edición interrumpida ' + MARK, pdfWith('% h ' + MARK), 'OTRO', {})).data;
    await lock(d7.id, ops4); assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${d7.id}`), 1);
    await call(`/auth/users/${ops4.id}/deactivate`, { method: 'PATCH', token: admin, body: {}, expect: [200] });
    assert.equal((await lock(d7.id, ops, 'GET')).data.active, false, 'la baja vence de inmediato los bloqueos del usuario');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'USER' AND operacion=N'USUARIO_DESACTIVADO' AND entidad_id=${ops4.id} AND valores_nuevos LIKE N'%"bloqueosDocumentalesLiberados":1%'`), 1, 'la baja audita cuántos bloqueos liberó');
    await addVersion(d7.id, ops4, pdfWith('% intruso ' + MARK), [401, 403]); assert.equal(versionsSql(d7.id).length, 1);
    assert.equal((await lock(d7.id, ops)).data.mine, true); await lock(d7.id, ops, 'DELETE', [204]);
    pass('H autorización perdida: al dar de baja al editor su bloqueo vence de inmediato (y se audita), su sesión ya no puede guardar y otro usuario continúa de inmediato');

    // ---------- I: vuelos EN_CURSO, FINALIZADO y CANCELADO ----------
    const C1 = await plannedOperational(cmd.cmdC); downloads[C1] = 0; const c1doc = (await createDoc(C1, ops, 'Documento C1 ' + MARK, pdfWith('% c1 ' + MARK), 'PLAN_DE_VUELO', {})).data;
    await approveRoute(C1, cmd.cmdC.token, ops.token); await call(`/flights/${C1}/start`, { method: 'POST', token: ops.token }); assert.equal(stateOf(C1), 'EN_CURSO');
    await lock(c1doc.id, ops); const c1v2 = (await addVersion(c1doc.id, ops, pdfWith('% c1 v2 ' + MARK))).data; assert.equal(c1v2.versionActual.numeroVersion, 2, 'el vuelo en curso admite versiones');
    await createDoc(C1, cmd.cmdC, 'Documento en curso ' + MARK, pdfWith('% c1b ' + MARK), 'OTRO', {});
    await call(`/flights/${C1}/finish`, { method: 'POST', token: ops.token }); assert.equal(stateOf(C1), 'FINALIZADO', 'finalizar no exige ni se ve impedido por documentos ni por un bloqueo abierto');
    assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos=${C1} AND es_actual=1`), 1, 'el informe final conserva su flujo propio');
    const c1Docs = count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos=${C1}`), c1Versions = count(`SELECT COUNT(*) FROM versiones_documento_vuelo v JOIN documentos_vuelo d ON d.id_documentos_vuelo=v.id_documentos_vuelo WHERE d.id_vuelos=${C1}`), filesC1 = storedFiles();
    await createDoc(C1, ops, 'Tardío ' + MARK, pdfA, 'OTRO', {}, [400]); await createDoc(C1, cmd.cmdC, 'Tardío ' + MARK, pdfA, 'OTRO', {}, [400]);
    await addVersion(c1doc.id, ops, pdfB, [400]); await lock(c1doc.id, ops2, 'POST', [400]);
    await lock(c1doc.id, ops, 'DELETE', [204]);
    assert.equal(count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos=${C1}`), c1Docs); assert.equal(count(`SELECT COUNT(*) FROM versiones_documento_vuelo v JOIN documentos_vuelo d ON d.id_documentos_vuelo=v.id_documentos_vuelo WHERE d.id_vuelos=${C1}`), c1Versions); assert.equal(storedFiles(), filesC1);
    const hC1 = await ok(`/documents/${c1doc.id}/versions`, { token: cmd.cmdC.token }); assert.equal(hC1.versiones.length, 2);
    for (const who of [ops, cmd.cmdC]) { const r = await download(C1, hC1.versiones[1].id, who); assert.equal(sha256(r.buf), sha256(pdfWith('% c1 ' + MARK))); }
    assert.equal((await ok(`/flights/${C1}/documents`, { token: ops2.token })).length, 2);
    const C2 = await plannedOperational(cmd.cmdD); const c2doc = (await createDoc(C2, ops, 'Documento C2 ' + MARK, pdfWith('% c2 ' + MARK), 'OTRO', {})).data;
    await call(`/flights/${C2}/cancel`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } }); assert.equal(stateOf(C2), 'CANCELADO'); downloads[C2] = 0;
    await createDoc(C2, ops, 'Tras cancelar ' + MARK, pdfA, 'OTRO', {}, [400]); await lock(c2doc.id, ops, 'POST', [400]); await addVersion(c2doc.id, ops, pdfB, [400]);
    assert.equal((await ok(`/documents/${c2doc.id}/versions`, { token: cmd.cmdD.token })).versiones.length, 1); assert.equal(sha256((await download(C2, (await ok(`/flights/${C2}/documents`, { token: ops.token }))[0].versionActual.id, ops)).buf), sha256(pdfWith('% c2 ' + MARK)));
    pass('I estados: EN_CURSO admite versiones; finalizar con documentos y un bloqueo abierto funciona y deja el informe final intacto; FINALIZADO y CANCELADO rechazan altas, versiones y bloqueos (400) pero permiten liberar el bloqueo propio, listar, ver historial y descargar con bytes idénticos');

    // ---------- L: baja lógica de documentos ----------
    const retire = (flight, id, who, body, expect = [204]) => call(`/flights/${flight}/documents/${id}/deactivate`, { method: 'POST', token: who.token, body, expect });
    const docRow = (id) => sql(`SELECT esta_activo, ISNULL(CONVERT(varchar(30),fecha_baja,121),'-'), ISNULL(CAST(id_usuario_baja AS varchar(20)),'-'), ISNULL(motivo_baja,'-') FROM documentos_vuelo WHERE id_documentos_vuelo=${id}`).split('|').map((x) => x.trim());
    const lockRows = (id) => count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${id}`);
    const flagFor = async (who, flight, id) => (await ok(`/flights/${flight}/documents`, { token: who.token })).find((x) => x.id === id)?.puedeRetirar;
    const REASON = 'Cargado en el vuelo equivocado';
    const bytesL1 = pdfWith('% l1 ' + MARK), bytesL2 = pdfWith('% l2 ' + MARK);
    const L = (await createDoc(S, ops, 'Retirable S ' + MARK, bytesL1, 'OTRO', { name: 'l1.pdf' })).data;
    assert.equal(L.puedeRetirar, true);
    assert.equal(await flagFor(ops, S, L.id), true); assert.equal(await flagFor(ops2, S, L.id), true); assert.equal(await flagFor(cmd.cmdA, S, L.id), false, 'el comandante no retira lo que cargó otro'); assert.equal(await flagFor(dts, S, L.id), false);
    await lock(L.id, ops); await addVersion(L.id, ops, bytesL2, [200], { name: 'l2.pdf' });
    // validación del motivo y del cuerpo
    for (const body of [{ motivo: '' }, { motivo: '   ' }, { motivo: 'x'.repeat(501) }, { motivo: 'a\u0001b' }, {}, { motivo: null }, { motivo: 'Error', activo: true }]) await retire(S, L.id, ops, body, [400]);
    const noBody = await raw('POST', `/flights/${S}/documents/${L.id}/deactivate`, ops.token); assert.ok([400, 415].includes(noBody.status), 'sin cuerpo: ' + noBody.status);
    // permisos y pertenencia al vuelo
    for (const who of [dts, dts2, cmd.cmdX, cmd.cmdB, cmd.cmdA]) await retire(S, L.id, who, { motivo: REASON }, [403]);
    await call(`/flights/${S}/documents/${L.id}/deactivate`, { method: 'POST', token: admin, body: { motivo: REASON }, expect: [403] });
    assert.ok([401, 403].includes((await raw('POST', `/flights/${S}/documents/${L.id}/deactivate`)).status));
    await retire(O, L.id, ops, { motivo: REASON }, [404]); await retire(S, 999999999, ops, { motivo: REASON }, [404]); await retire(999999999, L.id, ops, { motivo: REASON }, [404]);
    assert.deepEqual(docRow(L.id), ['1', '-', '-', '-'], 'ninguna validación ni denegación modifica el documento');
    // un bloqueo vigente de otra persona impide la baja; el propio se libera con ella
    assert.match((await retire(S, L.id, ops2, { motivo: REASON }, [409])).data.error, /bloqueado por/);
    assert.deepEqual(docRow(L.id)[0], '1'); assert.equal(lockRows(L.id), 1);
    const eventsBeforeRetire = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${S} AND operacion=N'DEACTIVATE'`);
    await retire(S, L.id, ops, { motivo: `  ${REASON}  ` });
    const row = docRow(L.id); assert.equal(row[0], '0'); assert.equal(row[2], String(ops.id)); assert.equal(row[3], REASON, 'el motivo se guarda sin espacios sobrantes');
    assert.ok(Math.abs(Date.parse(row[1].replace(' ', 'T') + 'Z') - Date.now()) < 120000, 'la fecha de baja se guarda en UTC');
    assert.equal(lockRows(L.id), 0, 'la baja libera el bloqueo del propio usuario en la misma transacción');
    const keysL = versionsSql(L.id); assert.equal(keysL.length, 2, 'las versiones se conservan'); assert.deepEqual(keysL.map((r) => r[1]), ['0', '1']);
    assert.equal(storedSha(keysL[0][4]), sha256(bytesL1)); assert.equal(storedSha(keysL[1][4]), sha256(bytesL2), 'los archivos físicos se conservan');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${S} AND operacion=N'DEACTIVATE'`), eventsBeforeRetire + 1);
    // desaparece del uso operativo y no admite modificaciones
    for (const who of [ops, ops2, dts, cmd.cmdA]) assert.ok(!(await listS(who)).some((x) => x.id === L.id), 'fuera del listado ordinario de ' + who.name);
    await lock(L.id, ops, 'POST', [409]); await lock(L.id, ops2, 'POST', [409]); await addVersion(L.id, ops, pdfWith('% tarde L ' + MARK), [409]); await addVersion(L.id, ops2, pdfWith('% tarde L2 ' + MARK), [409]);
    await retire(S, L.id, ops, { motivo: 'Segunda baja' }, [409]); await retire(S, L.id, ops2, { motivo: 'Segunda baja' }, [409]);
    assert.equal(lockRows(L.id), 0); assert.equal(versionsSql(L.id).length, 2); assert.equal(docRow(L.id)[3], REASON, 'una segunda baja no cambia el primer motivo');
    assert.equal((await raw('GET', `/documents/${L.id}/lock`, ops.token)).status, 409);
    // consulta histórica restringida
    const hist2 = await ok(`/documents/${L.id}/versions`, { token: ops2.token }); assert.equal(hist2.versiones.length, 2);
    assert.equal((await ok(`/documents/${L.id}/versions`, { token: cmd.cmdA.token })).versiones.length, 2, 'el comandante del vuelo consulta el historial');
    const v1L = hist2.versiones.find((v) => v.numeroVersion === 1);
    assert.equal(sha256((await download(S, v1L.id, ops)).buf), sha256(bytesL1), 'las versiones de un documento retirado se descargan idénticas');
    assert.equal(sha256((await download(S, hist2.versiones[0].id, cmd.cmdA)).buf), sha256(bytesL2));
    for (const who of [dts, dts2, cmd.cmdX, cmd.cmdB]) { assert.equal((await raw('GET', `/documents/${L.id}/versions`, who.token)).status, 403, 'historial retirado denegado a ' + who.name); await download(S, v1L.id, who, 403); assert.equal((await raw('GET', `/documents/${L.id}/lock`, who.token)).status, 403); }
    assert.equal((await raw('GET', `/documents/${L.id}/versions`, admin)).status, 403);
    const retiredS = async (who, expectStatus = 200) => { const r = await raw('GET', `/flights/${S}/documents/retired`, who.token ?? who); assert.equal(r.status, expectStatus, 'retirados de S por ' + (who.name ?? 'admin')); return r.data; };
    for (const who of [ops, ops2, cmd.cmdA]) { const list = await retiredS(who); const found = list.find((x) => x.id === L.id); assert.ok(found, 'retirado visible para ' + who.name); assert.equal(found.motivoBaja, REASON); assert.equal(found.retiradoPor, ops.name); assert.equal(found.totalVersiones, 2); assert.equal(found.ultimaVersion.numeroVersion, 2); assert.ok(Math.abs(Date.parse(found.fechaBaja + '-03:00') - Date.now()) < 120000, 'fecha de baja en hora civil: ' + found.fechaBaja); }
    for (const who of [dts, dts2, cmd.cmdX, cmd.cmdB]) await retiredS(who, 403); await retiredS({ token: admin }, 403);
    assert.equal((await raw('GET', `/flights/999999999/documents/retired`, ops.token)).status, 404);
    // el nombre de un documento retirado puede reutilizarse
    const reused = (await createDoc(S, ops, 'retirable s ' + MARK, pdfWith('% reuso ' + MARK), 'OTRO', {})).data; assert.notEqual(reused.id, L.id);
    // el comandante retira lo que cargó él, también en un vuelo operativo
    const own = (await createDoc(S, cmd.cmdA, 'Propio comandante ' + MARK, pdfWith('% own ' + MARK), 'OTRO', {})).data; assert.equal(own.puedeRetirar, true);
    assert.equal(await flagFor(ops, S, own.id), true); await retire(S, own.id, cmd.cmdX, { motivo: REASON }, [403]);
    await retire(S, own.id, cmd.cmdA, { motivo: 'Error propio' }); assert.deepEqual(docRow(own.id).slice(0, 1), ['0']);
    const ownO = (await createDoc(O, cmd.cmdB, 'Propio O ' + MARK, pdfWith('% ownO ' + MARK), 'AUTORIZACION', {})).data; await retire(O, ownO.id, cmd.cmdB, { motivo: 'Error propio' });
    assert.ok((await ok(`/flights/${O}/documents/retired`, { token: cmd.cmdB.token })).some((x) => x.id === ownO.id));
    const opsDocO = (await createDoc(O, ops, 'De Operaciones O ' + MARK, pdfWith('% opsO ' + MARK), 'OTRO', {})).data; assert.equal(await flagFor(cmd.cmdB, O, opsDocO.id), false); await retire(O, opsDocO.id, cmd.cmdB, { motivo: REASON }, [403]);
    // carreras: dos bajas simultáneas y baja contra bloqueo / contra nueva versión
    const race2 = (await createDoc(S, ops, 'Carrera 2 ' + MARK, pdfWith('% r2 ' + MARK), 'OTRO', {})).data;
    const jsonPost = (p, who, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + who.token }, body: JSON.stringify(body) }).then((r) => r.status);
    const statuses = await Promise.all([ops, ops2, ops3].map((who) => jsonPost(`/flights/${S}/documents/${race2.id}/deactivate`, who, { motivo: 'Carrera de bajas' })));
    assert.deepEqual(statuses.slice().sort(), [204, 409, 409], 'sólo una baja simultánea prevalece');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${S} AND entidad_id=${race2.id} AND operacion=N'DEACTIVATE'`), 1, 'un solo evento de baja');
    for (let round = 0; round < 6; round++) {
      const d = (await createDoc(S, ops, `Carrera bloqueo ${round} ${MARK}`, pdfWith(`% rb${round} ${MARK}`), 'OTRO', {})).data;
      const [r, a] = await Promise.all([jsonPost(`/flights/${S}/documents/${d.id}/deactivate`, ops, { motivo: 'Baja contra bloqueo' }), raw('POST', `/documents/${d.id}/lock`, ops2.token).then((x) => x.status)]);
      assert.ok((r === 204 && a === 409) || (r === 409 && a === 200), `ronda ${round}: baja ${r}, bloqueo ${a}`);
      const active = docRow(d.id)[0] === '1';
      assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${d.id} AND fecha_vencimiento>SYSDATETIME()`) > 0 && !active, false, 'un documento retirado nunca conserva un bloqueo vigente');
      if (active) await lock(d.id, ops2, 'DELETE', [204]);
    }
    for (let round = 0; round < 4; round++) {
      const d = (await createDoc(S, ops, `Carrera versión ${round} ${MARK}`, pdfWith(`% rv${round} ${MARK}`), 'OTRO', {})).data; await lock(d.id, ops);
      const [r, v] = await Promise.all([jsonPost(`/flights/${S}/documents/${d.id}/deactivate`, ops, { motivo: 'Baja contra versión' }), raw('POST', `/documents/${d.id}/versions/pdf`, ops.token, formOf(null, { bytes: pdfWith(`% rv2-${round} ${MARK}`), name: 'v2.pdf' })).then((x) => x.status)]);
      assert.equal(r, 204, 'el titular siempre puede retirar'); assert.ok(v === 200 || v === 409, 'versión: ' + v);
      const vs = versionsSql(d.id); assert.deepEqual(vs.map((x) => x[0]), v === 200 ? ['1', '2'] : ['1']); assert.equal(vs.filter((x) => x[1] === '1').length, 1); assert.equal(lockRows(d.id), 0); assert.equal(docRow(d.id)[0], '0');
    }
    // estados que no admiten bajas: finalizado, cancelado y solicitud rechazada
    await retire(C1, c1doc.id, ops, { motivo: REASON }, [400]); await retire(C2, c2doc.id, ops, { motivo: REASON }, [400]);
    assert.equal(docRow(c1doc.id)[0], '1'); assert.equal(docRow(c2doc.id)[0], '1');
    assert.equal((await ok(`/flights/${C1}/documents/retired`, { token: ops.token })).length, 0);
    const whenR = futureSlot();
    const R = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Documentos rechazada ' + MARK, fechaSolicitada: fmt(whenR), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
    const rdoc = (await createDoc(R, ops, 'Doc solicitud ' + MARK, pdfWith('% req ' + MARK), 'AUTORIZACION', {})).data;
    await call(`/flights/${R}/schedule/reject`, { method: 'POST', token: ops.token, body: { motivoCancelacionId: reason.id } });
    for (const r of [await createDoc(R, ops, 'Tardío ' + MARK, pdfA, 'OTRO', {}, [400]), await lock(rdoc.id, ops, 'POST', [400]), await addVersion(rdoc.id, ops, pdfB, [400]), await retire(R, rdoc.id, ops, { motivo: REASON }, [400])]) assert.ok(r.status === 400);
    assert.match((await createDoc(R, ops, 'Tardío 2 ' + MARK, pdfA, 'OTRO', {}, [400])).data.error, /sólo consulta documental/);
    assert.equal(docRow(rdoc.id)[0], '1'); assert.equal((await ok(`/flights/${R}/documents`, { token: dts.token })).length, 1, 'la solicitud rechazada sigue siendo consultable');
    pass(`L baja lógica: motivo obligatorio (7 cuerpos inválidos = 400), sólo Operaciones o el comandante que cargó el documento (403 al resto, 404 si es de otro vuelo), bloqueo ajeno = 409 y propio liberado en la misma transacción, fila y ${keysL.length} versiones con sus archivos conservados, fuera del listado y sin bloqueos ni versiones nuevas, historial y descarga sólo para Operaciones y el comandante, nombre reutilizable, 1 baja entre 3 simultáneas, 6 rondas baja-contra-bloqueo y 4 baja-contra-versión consistentes, y sin bajas en vuelos finalizados, cancelados ni solicitudes rechazadas`);

    // ---------- M: compatibilidad de tipos documentales con el tipo de vuelo ----------
    const flagged = sql('SELECT codigo_tipo_documento, solo_vuelo_sanitario FROM tipos_documento ORDER BY 1').split(/\r?\n/).filter((l) => l.includes('|')).map((l) => l.split('|').map((x) => x.trim()).join(':'));
    assert.deepEqual(flagged, ['AUTORIZACION:0', 'OTRO:0', 'PARTE_MEDICO:1', 'PLAN_DE_VUELO:0'], 'sólo el parte médico es exclusivo de vuelos sanitarios');
    const typesFor = async (flight, who, expectStatus = 200) => { const r = await raw('GET', `/flights/${flight}/documents/types`, who.token ?? who); assert.equal(r.status, expectStatus, `tipos de ${flight} para ${who.name ?? 'admin'}`); return r.data?.map?.((t) => t.codigo).sort(); };
    for (const who of [ops, cmd.cmdA]) assert.deepEqual(await typesFor(S, who), ['AUTORIZACION', 'OTRO', 'PARTE_MEDICO', 'PLAN_DE_VUELO']);
    for (const who of [ops, ops2, cmd.cmdB]) assert.deepEqual(await typesFor(O, who), ['AUTORIZACION', 'OTRO', 'PLAN_DE_VUELO'], 'el vuelo operativo no ofrece el parte médico');
    for (const [flight, who] of [[S, dts], [S, cmd.cmdX], [S, cmd.cmdB], [O, cmd.cmdA], [O, dts]]) await typesFor(flight, who, 403);
    await typesFor(S, { token: admin }, 403); await typesFor(999999999, ops, 404);
    const docsO = totalDocs(), filesO = storedFiles();
    for (const who of [ops, ops2, cmd.cmdB]) { const r = await createDoc(O, who, 'Parte en operativo ' + who.name, pdfWith('% pm ' + who.name), 'PARTE_MEDICO', {}, [400]); assert.match(r.data.error, /«Parte médico» sólo puede registrarse en vuelos sanitarios/); }
    assert.equal(totalDocs(), docsO, 'el rechazo no deja documentos'); assert.equal(storedFiles(), filesO, 'ni archivos');
    const okMedical = (await createDoc(S, cmd.cmdA, 'Parte comandante ' + MARK, pdfWith('% pm S ' + MARK), 'PARTE_MEDICO', {})).data; assert.equal(okMedical.tipoDocumento.codigo, 'PARTE_MEDICO');
    for (const type of ['AUTORIZACION', 'PLAN_DE_VUELO', 'OTRO']) { await createDoc(S, ops, `General ${type} S ${MARK}`, pdfWith(`% g${type}S ${MARK}`), type, {}); await createDoc(O, ops, `General ${type} O ${MARK}`, pdfWith(`% g${type}O ${MARK}`), type, {}); }
    // un documento histórico con una combinación hoy incompatible (se simula sobre un registro propio de la prueba) no se reclasifica ni se destruye
    const legacy = (await createDoc(O, ops, 'Histórico incompatible ' + MARK, pdfWith('% legacy ' + MARK), 'OTRO', {})).data;
    sql(`UPDATE documentos_vuelo SET id_tipos_documento=(SELECT id_tipos_documento FROM tipos_documento WHERE codigo_tipo_documento=N'PARTE_MEDICO') WHERE id_documentos_vuelo=${legacy.id}`);
    const shown = (await listO(ops)).find((x) => x.id === legacy.id); assert.equal(shown.tipoDocumento.codigo, 'PARTE_MEDICO', 'no se reclasifica automáticamente'); assert.equal(shown.puedeRetirar, true);
    assert.equal(sha256((await download(O, shown.versionActual.id, ops)).buf), sha256(pdfWith('% legacy ' + MARK)), 'sigue descargable');
    assert.equal((await ok(`/documents/${legacy.id}/versions`, { token: ops.token })).versiones.length, 1);
    assert.match((await lock(legacy.id, ops, 'POST', [409])).data.error, /retire este documento/); assert.match((await addVersion(legacy.id, ops, pdfWith('% legacy v2 ' + MARK), [409])).data.error, /retire este documento/);
    assert.equal(versionsSql(legacy.id).length, 1); assert.equal(lockRows(legacy.id), 0);
    await retire(O, legacy.id, ops, { motivo: 'Tipo incompatible con el vuelo' }); assert.equal(docRow(legacy.id)[0], '0'); assert.equal(versionsSql(legacy.id).length, 1);
    pass('M compatibilidad: sólo PARTE_MEDICO es exclusivo de vuelos sanitarios (indicador en el catálogo SQL); el selector del servidor ofrece 4 tipos al vuelo sanitario y 3 al operativo y niega a quien no opera el vuelo; el parte médico en un vuelo operativo = 400 con mensaje claro para Operaciones y comandante, sin documentos ni archivos; los tipos generales se aceptan en ambos; un registro histórico incompatible se conserva y descarga, no admite bloqueos ni versiones (409) y puede retirarse');

    // ---------- J: auditoría ----------
    const auditRows = (flight) => sql(`SELECT tipo_entidad, operacion, entidad_id, ISNULL(valores_anteriores,N'-'), ISNULL(valores_nuevos,N'-') FROM eventos_auditoria WHERE id_vuelos=${flight} AND tipo_entidad IN (N'DOCUMENT',N'DOCUMENT_LOCK')`).split(/\r?\n/).filter((l) => l.includes('|')).map((l) => l.split('|').map((x) => x.trim()));
    for (const flight of [S, O]) for (const r of auditRows(flight)) {
      if (r[0] === 'DOCUMENT' && r[1] === 'DEACTIVATE') { assert.match(r[4], /^\{"activo":false,"motivoBaja":"[^"]*","versiones":\d+,"bloqueoLiberado":(true|false)\}$/, 'la baja audita motivo y conteos, no nombres ni contenido'); assert.equal(r[3], '{"activo":true}'); }
      else if (r[0] === 'DOCUMENT') { assert.match(r[4], /^\{"numeroVersion":\d+\}$/, 'la auditoría documental no guarda contenido ni nombres'); assert.equal(r[3], '-'); }
      assert.ok(!r.join('|').includes('%PDF') && !r.join('|').includes(MARK), 'sin contenido sensible en la auditoría: ' + r.join('|'));
    }
    const opCount = (flight, type, op) => auditRows(flight).filter((r) => r[0] === type && r[1] === op).length;
    const createdDocsS = count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos=${S}`), versionsS = count(`SELECT COUNT(*) FROM versiones_documento_vuelo v JOIN documentos_vuelo d ON d.id_documentos_vuelo=v.id_documentos_vuelo WHERE d.id_vuelos=${S}`);
    assert.equal(opCount(S, 'DOCUMENT', 'CREATE'), createdDocsS); assert.equal(opCount(S, 'DOCUMENT', 'CREATE_VERSION'), versionsS - createdDocsS); assert.equal(opCount(S, 'DOCUMENT', 'DEACTIVATE'), count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos=${S} AND esta_activo=0`), 'cada baja deja un evento'); assert.equal(opCount(O, 'DOCUMENT', 'DEACTIVATE'), count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos=${O} AND esta_activo=0`));
    assert.equal(opCount(S, 'DOCUMENT', 'DOWNLOAD'), downloads[S], 'cada descarga queda auditada y las denegadas no');
    assert.equal(opCount(O, 'DOCUMENT', 'DOWNLOAD'), downloads[O]); assert.equal(opCount(C1, 'DOCUMENT', 'DOWNLOAD'), downloads[C1]);
    assert.ok(opCount(S, 'DOCUMENT_LOCK', 'ACQUIRE') >= 5 && opCount(S, 'DOCUMENT_LOCK', 'RELEASE') >= 4); assert.equal(opCount(O, 'DOCUMENT_LOCK', 'RECOVER'), 3, 'dos recuperaciones por vencimiento (d6) y una tras la baja del editor (d7)');
    const tl = async (who, flight) => (await ok(`/audit/flights/${flight}?size=100`, { token: who.token })).items;
    const names = (items) => items.map((e) => `${e.entityType}:${e.operation}`);
    const opsTl = names(await tl(ops, S)); assert.ok(opsTl.includes('DOCUMENT:DEACTIVATE') && opsTl.includes('DOCUMENT:DOWNLOAD') && opsTl.includes('DOCUMENT:CREATE') && opsTl.includes('DOCUMENT_LOCK:ACQUIRE'));
    const cmdTl = names(await tl(cmd.cmdA, S)); assert.ok(cmdTl.includes('DOCUMENT:CREATE_VERSION') && cmdTl.includes('DOCUMENT:DEACTIVATE') && !cmdTl.includes('DOCUMENT:DOWNLOAD') && !cmdTl.some((x) => x.startsWith('DOCUMENT_LOCK')), 'el comandante ve altas y versiones, no descargas ni bloqueos');
    const dtsTl = names(await tl(dts, S)); assert.ok(!dtsTl.some((x) => x.startsWith('DOCUMENT')), 'el DTS no ve eventos documentales');
    const dl = (await tl(ops, S)).find((e) => e.operation === 'DOWNLOAD'); assert.ok(dl, 'el evento de descarga se presenta'); assert.equal(dl.operationLabel, 'Descarga');
    pass(`J auditoría: ${createdDocsS} altas, ${versionsS - createdDocsS} versiones, las bajas con motivo, ${downloads[S] + downloads[O] + downloads[C1]} descargas y los bloqueos (ACQUIRE/RELEASE/RECOVER) quedan registrados una vez cada uno, sin contenido ni nombres; las denegadas no auditan; Operaciones ve todo, el comandante altas, versiones y bajas (no descargas ni bloqueos), el DTS nada documental`);

    // ---------- K: integridad en SQL Server ----------
    const flights = `${S},${O},${C1},${C2},${R}`;
    assert.equal(count(`SELECT COUNT(*) FROM documentos_vuelo d WHERE d.id_vuelos IN (${flights}) AND (SELECT COUNT(*) FROM versiones_documento_vuelo v WHERE v.id_documentos_vuelo=d.id_documentos_vuelo AND v.es_version_actual=1)<>1`), 0, 'cada documento tiene exactamente una versión vigente');
    assert.equal(count(`SELECT COUNT(*) FROM documentos_vuelo d WHERE d.id_vuelos IN (${flights}) AND (SELECT MAX(numero_version) FROM versiones_documento_vuelo v WHERE v.id_documentos_vuelo=d.id_documentos_vuelo)<>(SELECT COUNT(*) FROM versiones_documento_vuelo v WHERE v.id_documentos_vuelo=d.id_documentos_vuelo)`), 0, 'numeración contigua 1..n');
    assert.equal(count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos IN (${flights}) AND ((esta_activo=1 AND (fecha_baja IS NOT NULL OR id_usuario_baja IS NOT NULL OR motivo_baja IS NOT NULL)) OR (esta_activo=0 AND (fecha_baja IS NULL OR id_usuario_baja IS NULL OR LEN(LTRIM(RTRIM(motivo_baja)))=0)))`), 0, 'toda baja tiene fecha, responsable y motivo; ningún activo los tiene');
    assert.ok(count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos IN (${flights}) AND esta_activo=0`) >= 9, 'las bajas de la prueba existen y nada se eliminó');
    assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo b JOIN documentos_vuelo d ON d.id_documentos_vuelo=b.id_documentos_vuelo WHERE d.id_vuelos IN (${flights})`), 0, 'ningún bloqueo quedó abierto');
    const allKeys = sql(`SELECT v.ubicacion_almacenamiento, v.tamanio_bytes FROM versiones_documento_vuelo v JOIN documentos_vuelo d ON d.id_documentos_vuelo=v.id_documentos_vuelo WHERE d.id_vuelos IN (${flights})`).split(/\r?\n/).filter((l) => l.includes('|')).map((l) => l.split('|').map((x) => x.trim()));
    assert.equal(new Set(allKeys.map((k) => k[0])).size, allKeys.length, 'cada versión apunta a un archivo propio');
    for (const [key, bytes] of allKeys) assert.equal(Number(spawnSync('docker', ['exec', BACKEND, 'stat', '-c', '%s', '/data/documents/' + key], { encoding: 'utf8' }).stdout.trim()), Number(bytes), 'tamaño en disco = tamaño registrado: ' + key);
    assert.equal(count(`SELECT COUNT(*) FROM documentos_vuelo d JOIN vuelos v ON v.id_vuelos=d.id_vuelos WHERE d.id_vuelos IN (${flights}) AND v.id_vuelos<>d.id_vuelos`), 0);
    assert.ok(count(`SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('versiones_documento_vuelo') AND is_unique=1 AND filter_definition IS NOT NULL`) >= 1, 'índice único filtrado de versión vigente');
    assert.equal(count(`SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id IN (OBJECT_ID('documentos_vuelo'),OBJECT_ID('versiones_documento_vuelo'),OBJECT_ID('bloqueos_documento_vuelo'))`), 7, 'siete claves foráneas: vuelo, tipo, usuario de baja, documento x2 y usuario x2');
    const refuse = (query, label, constraint) => { assert.throws(() => sql(query), (e) => e.message.toLowerCase().includes(constraint), label + ' (' + constraint + ')'); };
    const cols = 'id_documentos_vuelo, numero_version, es_version_actual, nombre_archivo_original, ubicacion_almacenamiento, tamanio_bytes, id_usuario_creador, fecha_creacion';
    refuse(`INSERT INTO versiones_documento_vuelo(${cols}) VALUES (${d1.id}, 99, 1, N'x.pdf', N'x-${MARK}.pdf', 1, ${ops.id}, SYSDATETIME())`, 'SQL impide una segunda versión vigente', 'uq_versiones_documento_vuelo_actual');
    refuse(`INSERT INTO versiones_documento_vuelo(${cols}) VALUES (${d1.id}, 1, 0, N'x.pdf', N'y-${MARK}.pdf', 1, ${ops.id}, SYSDATETIME())`, 'SQL impide repetir el número de versión', 'uq_versiones_documento_vuelo_numero');
    refuse(`INSERT INTO versiones_documento_vuelo(${cols}) VALUES (999999999, 1, 1, N'x.pdf', N'z-${MARK}.pdf', 1, ${ops.id}, SYSDATETIME())`, 'SQL impide versiones sin documento', 'foreign key');
    refuse(`INSERT INTO bloqueos_documento_vuelo(id_documentos_vuelo, id_usuario_propietario, fecha_adquisicion, fecha_vencimiento) VALUES (${d1.id}, ${ops.id}, SYSDATETIME(), DATEADD(MINUTE,5,SYSDATETIME())), (${d1.id}, ${ops2.id}, SYSDATETIME(), DATEADD(MINUTE,5,SYSDATETIME()))`, 'SQL impide dos bloqueos del mismo documento', 'uq_bloqueos_documento_vuelo_documento');
    refuse(`INSERT INTO documentos_vuelo(id_vuelos, id_tipos_documento, nombre_documento) VALUES (${S}, 999999999, N'huérfano ${MARK}')`, 'SQL impide documentos sin tipo', 'foreign key');
    refuse(`UPDATE documentos_vuelo SET esta_activo=0 WHERE id_documentos_vuelo=${d2.id}`, 'SQL impide una baja sin motivo ni responsable', 'ck_documentos_vuelo_baja');
    refuse(`UPDATE documentos_vuelo SET motivo_baja=N'solo motivo' WHERE id_documentos_vuelo=${d2.id}`, 'SQL impide datos de baja en un documento activo', 'ck_documentos_vuelo_baja');
    refuse(`UPDATE documentos_vuelo SET esta_activo=0, fecha_baja=SYSDATETIME(), id_usuario_baja=${ops.id}, motivo_baja=N'   ' WHERE id_documentos_vuelo=${d2.id}`, 'SQL impide un motivo en blanco', 'ck_documentos_vuelo_baja');
    refuse(`UPDATE documentos_vuelo SET esta_activo=0, fecha_baja=SYSDATETIME(), id_usuario_baja=999999999, motivo_baja=N'x' WHERE id_documentos_vuelo=${d2.id}`, 'SQL impide un responsable inexistente', 'fk_documentos_vuelo_usuario_baja');
    refuse(`INSERT INTO tipos_documento(codigo_tipo_documento, nombre_tipo_documento) VALUES (N'OTRO', N'Duplicado ${MARK}')`, 'SQL impide repetir el código de un tipo', 'unique');
    assert.equal(count(`SELECT COUNT(*) FROM versiones_documento_vuelo WHERE ubicacion_almacenamiento LIKE N'%-${MARK}.pdf'`), 0);
    pass(`K SQL Server: ${allKeys.length} versiones de ${count(`SELECT COUNT(*) FROM documentos_vuelo WHERE id_vuelos IN (${flights})`)} documentos con una única versión vigente, numeración contigua, archivos propios de tamaño exacto, sin bloqueos abiertos; la base rechaza una segunda vigente, un número repetido, versiones o tipos huérfanos y bloqueos duplicados`);
  } finally {
    await clock.reset().catch(() => {});
  }
  console.log(`\nE2E documentos: ${passed} bloques aprobados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
