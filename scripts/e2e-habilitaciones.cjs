/* I-5.6: habilitaciones profesionales y documentación contra el backend, SQL Server y ClamAV REAL del stack E2E aislado (Flyway >= V59).
 * Uso: node scripts/e2e-habilitaciones.cjs   (requiere `--profile antimalware` con E2E_ANTIMALWARE_ENABLED=true; sin analizador real se niega a correr)
 *  A) analizador real: versión de ClamAV, cadena EICAR detectada, PDF malformado/activo/cifrado rechazado antes de almacenarse.
 *  B) política de suficiencia: permisos, duplicados, fuente oficial citada, baja con motivo, sin política = no elegible.
 *  C) ciclo de vida: registro, documentación, revisión por otro administrador, autoverificación denegada, corrección, rechazo, renovación, revocación.
 *  D) documentos: huella SHA-256, cuarentena, descarga autenticada, manipulación del archivo detectada, falla segura con el analizador caído, versiones, retiro y bloqueo.
 *  E) consulta externa manual distinta de la validación interna y solicitudes de supresión sin purga física.
 *  F) avisos de vencimiento con el reloj de negocio: umbrales, idempotencia y reinicio.
 *  G) restricciones y persistencia reales en SQL Server. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, PROJECT, MARK, sql, one, count, call, ok, createUser, waitHealthy, withoutPolicies } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const CLAMAV = `${PROJECT}-clamav-1`;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** PDF mínimo válido y único por `label`; `catalogExtra` agrega entradas al catálogo; `comment` va como comentario PDF (bytes crudos del archivo). */
function makePdf(label, { catalogExtra = '', comment = '' } = {}) {
  const NL = '\n';
  const content = `BT /F1 12 Tf 20 50 Td (${label}) Tj ET`;
  const objects = [`<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>`, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>', `<< /Length ${content.length} >>${NL}stream${NL}${content}${NL}endstream`];
  let out = '%PDF-1.4' + NL + (comment ? '% ' + comment + NL : ''); const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj${NL}${o}${NL}endobj${NL}`; });
  const xref = Buffer.byteLength(out);
  out += `xref${NL}0 5${NL}0000000000 65535 f ${NL}` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n ' + NL).join('') + `trailer${NL}<< /Size 5 /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`;
  return Buffer.from(out, 'latin1');
}
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

(async () => {
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && DB_NAME === 'vuelos_sanitarios_e2e', 'El backend no apunta a la base E2E');
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 59, 'se requiere Flyway >= V59');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, ''); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const admin2 = await createUser(admin, 'ADMINISTRADOR', 'hab2');
  const holderAdmin = await createUser(admin, 'ADMINISTRADOR', 'habt');          // titular que también es administrador
  const dts = await createUser(admin, 'DTS', 'habd'), ops = await createUser(admin, 'OPERACIONES', 'habo');
  const TYPE = 'Matrícula ' + MARK;                                                // tipo propio de esta corrida para no depender de otras pruebas
  const uploadRaw = async (credentialId, bytes, { name = 'documento.pdf', type = 'application/pdf', purpose, replacesId, token = admin, expect = [200] } = {}) => {
    const form = new FormData(); form.append('file', new Blob([bytes], { type }), name);
    const query = [purpose && 'purpose=' + purpose, replacesId && 'replacesId=' + replacesId].filter(Boolean).join('&');
    const res = await fetch(`${BASE}/professional-credentials/${credentialId}/documents${query ? '?' + query : ''}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
    const raw = await res.text(); let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    assert.ok(expect.includes(res.status), `carga: HTTP ${res.status}, esperado ${expect}; ${raw.slice(0, 300)}`);
    return { status: res.status, data };
  };
  const credentialBody = (extra = {}) => ({ roleCode: 'MEDICO', type: TYPE, number: 'MP-' + MARK + '-' + Math.floor(Math.random() * 1e6), issuer: 'Colegio de prueba', issued: isoDay(Date.now() - 365 * DAY), expires: isoDay(Date.now() + 400 * DAY), noExpiry: false, ...extra });
  const newCredential = async (owner, extra = {}, token = admin) => ok(`/users/${owner.id}/professional-credentials`, { method: 'POST', token, body: credentialBody(extra) });
  const decide = (id, action, body, { token = admin2.token, expect = [200] } = {}) => call(`/professional-credentials/${id}/decision/${action}`, { method: 'POST', token, body, expect });
  const decisionTypes = (id) => sql(`SELECT tipo_decision FROM decisiones_habilitacion WHERE id_habilitaciones_profesionales=${id} ORDER BY id_decisiones_habilitacion`).split(/\r?\n/);
  const auditCount = (type, id, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'${type}' AND entidad_id=${id} AND operacion=N'${op}'`);
  const storedFiles = () => Number(docker('exec', BACKEND, 'sh', '-c', 'ls /data/documents | wc -l').stdout.trim());

  // ================= A: el analizador es real =================
  const status = await ok('/professional-credential-documents/antimalware-status', { token: admin });
  assert.equal(status.configured, true, 'No hay analizador antimalware real: levante el stack con --profile antimalware y E2E_ANTIMALWARE_ENABLED=true');
  assert.match(status.engine, /ClamAV/i); pass('el analizador es ClamAV real: ' + status.engine);
  assert.equal((await call('/professional-credential-documents/antimalware-status', { token: dts.token, expect: [403] })).status, 403);
  assert.equal((await call('/professional-credential-documents/antimalware-status', { expect: [401, 403] })).status >= 401, true); pass('el estado del analizador sólo lo ve un administrador');

  // ================= B: política de suficiencia =================
  const policyBody = (extra = {}) => ({ roleCode: 'MEDICO', credentialType: TYPE, notes: 'Política de la corrida E2E', ...extra });
  assert.equal((await call('/credential-policies', { method: 'POST', token: dts.token, body: policyBody(), expect: [403] })).status, 403);
  assert.equal((await call('/credential-policies', { method: 'POST', token: ops.token, body: policyBody(), expect: [403] })).status, 403);
  assert.equal((await call('/credential-policies', { expect: [401, 403] })).status >= 401, true); pass('las políticas sólo las administra un administrador');
  // Sin política activa para el tipo, la habilitación verificada no alcanza.
  const probeHolder = await createUser(admin, 'DTS', 'habp');
  const noPolicy = await newCredential(probeHolder);
  await uploadRaw(noPolicy.id, makePdf('sin-politica-' + MARK));
  const verifiedWithoutPolicy = await withoutPolicies(admin, 'MEDICO', async () => (await decide(noPolicy.id, 'VERIFICADA', { notes: 'Revisión sin política', confirmsSufficiency: true })).data);
  assert.equal(verifiedWithoutPolicy.status, 'VERIFICADA'); assert.equal(verifiedWithoutPolicy.eligibility.eligible, false);
  assert.equal(verifiedWithoutPolicy.eligibility.code, 'POLITICA_HABILITACION_NO_CONFIGURADA', 'sin política NO se asume habilitación'); pass('verificada pero sin política activa para la función: POLITICA_HABILITACION_NO_CONFIGURADA (las políticas se restablecen al terminar)');
  const unmatched = await ok(`/professional-credentials/${noPolicy.id}`, { token: admin });
  assert.equal(unmatched.eligibility.code, 'HABILITACION_NO_SUFICIENTE', 'con otras políticas activas, un tipo sin política no basta'); pass('un tipo de habilitación sin política propia no basta aunque existan otras políticas de la función');
  const created = (await call('/credential-policies', { method: 'POST', token: admin, body: policyBody() })).data;
  assert.equal(created.active, true); assert.equal(created.origin, 'CONFIGURACION_INTERNA');
  assert.equal((await ok(`/professional-credentials/${noPolicy.id}`, { token: admin })).eligibility.eligible, true); pass('al configurar la política la habilitación verificada pasa a ser suficiente');
  assert.equal((await call('/credential-policies', { method: 'POST', token: admin, body: policyBody({ credentialType: TYPE.toLowerCase() }), expect: [409] })).data.code, 'POLITICA_DUPLICADA');
  assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion WHERE tipo_habilitacion=N'${TYPE}' AND activa=1`), 1); pass('una política duplicada se rechaza (409)');
  assert.equal((await call('/credential-policies', { method: 'POST', token: admin, body: policyBody({ credentialType: 'Otra ' + MARK, origin: 'FUENTE_OFICIAL_CITADA' }), expect: [400] })).data.code, 'FUENTE_REQUERIDA');
  const official = (await call('/credential-policies', { method: 'POST', token: admin, body: policyBody({ credentialType: 'Citada ' + MARK, origin: 'FUENTE_OFICIAL_CITADA', sourceReference: 'Fuente citada por el administrador (no verificada por el sistema)' }) })).data;
  assert.equal(official.origin, 'FUENTE_OFICIAL_CITADA'); pass('una política con fuente oficial exige citarla');
  assert.equal((await call(`/credential-policies/${official.id}/deactivate`, { method: 'POST', token: admin, body: { reason: '' }, expect: [400] })).status, 400);
  const off = (await call(`/credential-policies/${official.id}/deactivate`, { method: 'POST', token: admin, body: { reason: 'Prueba de baja con motivo' } })).data;
  assert.equal(off.active, false);
  assert.equal((await call(`/credential-policies/${official.id}/deactivate`, { method: 'POST', token: admin, body: { reason: 'otra vez' }, expect: [409] })).data.code, 'POLITICA_YA_INACTIVA');
  assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion WHERE id_politicas_habilitacion=${official.id} AND activa=0 AND motivo_baja IS NOT NULL AND id_usuario_baja IS NOT NULL`), 1);
  assert.equal(auditCount('CREDENTIAL_POLICY', official.id, 'DEACTIVATE'), 1); pass('la baja exige motivo, conserva la fila y se audita');
  const listing = await ok('/credential-policies', { token: admin }); assert.ok(listing.some((p) => p.id === official.id && !p.active) && listing.some((p) => p.id === created.id && p.active));
  assert.throws(() => sql(`INSERT INTO politicas_habilitacion(id_roles_tripulacion,tipo_habilitacion,id_usuario_alta) SELECT id_roles_tripulacion,N'${TYPE}',id_usuario_alta FROM politicas_habilitacion WHERE id_politicas_habilitacion=${created.id}`), /UNIQUE|duplicate|ux_politica/i); pass('SQL Server impide dos políticas activas idénticas (índice único filtrado)');

  // ================= C/D: ciclo de vida y documentos =================
  const holder = await createUser(admin, 'DTS', 'habh');
  const c1 = await newCredential(holder);
  assert.equal(c1.status, 'PENDIENTE'); assert.equal(c1.documentStatus, 'SIN_DOCUMENTOS'); assert.equal(c1.eligibility.eligible, false);
  assert.equal((await decide(c1.id, 'VERIFICADA', { notes: 'sin documentos', confirmsSufficiency: true }, { expect: [409] })).data.code, 'DOCUMENTACION_AUSENTE'); pass('no se verifica sin documentación');

  // A (cont.): contenido que no debe llegar al almacenamiento
  const before = storedFiles();
  assert.equal((await uploadRaw(c1.id, Buffer.from('esto no es un pdf'), { expect: [400] })).data.code, 'PDF_INVALIDO');
  assert.equal((await uploadRaw(c1.id, makePdf('x'), { type: 'text/plain', expect: [400] })).data.code, 'PDF_INVALIDO');
  assert.equal((await uploadRaw(c1.id, makePdf('x'), { name: 'a.exe', expect: [400] })).data.code, 'PDF_INVALIDO');
  const truncated = makePdf('truncado'); assert.equal((await uploadRaw(c1.id, truncated.subarray(0, Math.floor(truncated.length / 2)), { expect: [400] })).data.code, 'PDF_INVALIDO');
  assert.equal((await uploadRaw(c1.id, makePdf('js-' + MARK, { catalogExtra: '/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> ' }), { expect: [400] })).data.code, 'PDF_CONTENIDO_ACTIVO');
  assert.equal((await uploadRaw(c1.id, makePdf('embebido-' + MARK, { catalogExtra: '/Names << /EmbeddedFiles << /Names [] >> >> ' }), { expect: [400] })).data.code, 'PDF_CONTENIDO_ACTIVO');
  assert.equal((await uploadRaw(c1.id, makePdf('x'), { purpose: 'OTRO', expect: [400] })).data.code, 'PROPOSITO_INVALIDO');
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE id_habilitaciones_profesionales=${c1.id}`), 0); assert.equal(storedFiles(), before); pass('formato inválido, truncado, JavaScript y archivos embebidos se rechazan sin almacenar nada');

  // EICAR: el analizador real lo detecta
  const eicarPdf = makePdf('eicar-' + MARK, { comment: EICAR });
  const infected = (await uploadRaw(c1.id, eicarPdf)).data;
  assert.equal(infected.documents[0].scanStatus, 'RECHAZADO', 'ClamAV debía rechazar la cadena EICAR'); assert.match(infected.documents[0].scanDetail, /Eicar/i);
  assert.equal(infected.documentStatus, 'RECHAZADO'); pass('ClamAV real detecta EICAR: ' + infected.documents[0].scanDetail);
  const infectedId = infected.documents[0].id;
  assert.equal((await call(`/professional-credential-documents/${infectedId}`, { token: admin, expect: [409] })).data.code, 'DOCUMENTO_NO_DISPONIBLE');
  assert.equal((await decide(c1.id, 'VERIFICADA', { notes: 'con documento rechazado', confirmsSufficiency: true }, { expect: [409] })).data.code, 'DOCUMENTACION_NO_LIMPIA');
  assert.equal((await call(`/professional-credential-documents/${infectedId}/rescan`, { method: 'POST', token: admin })).data.documents.find((d) => d.id === infectedId).scanStatus, 'RECHAZADO'); pass('un documento rechazado no se descarga, no sustenta la verificación y no se limpia reanalizando');

  // Documento limpio: huella
  const cleanBytes = makePdf('matricula-' + MARK);
  const withClean = (await uploadRaw(c1.id, cleanBytes, { name: 'matricula.pdf' })).data;
  const doc = withClean.documents.find((d) => d.name === 'matricula.pdf');
  assert.equal(doc.scanStatus, 'LIMPIO'); assert.equal(doc.sha256, sha(cleanBytes)); assert.equal(doc.sizeBytes, cleanBytes.length); assert.equal(doc.version, 2);
  assert.equal(one(`SELECT hash_sha256 FROM documentos_habilitacion WHERE id_documentos_habilitacion=${doc.id}`), sha(cleanBytes)); pass('el documento limpio conserva la huella SHA-256 del archivo enviado');
  assert.equal((await uploadRaw(c1.id, cleanBytes, { name: 'otra.pdf', expect: [409] })).data.code, 'DOCUMENTO_DUPLICADO'); pass('no se adjunta dos veces el mismo archivo');

  // Descargas autorizadas
  const dl = await fetch(`${BASE}/professional-credential-documents/${doc.id}`, { headers: { Authorization: 'Bearer ' + admin } });
  assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/pdf'); assert.match(dl.headers.get('cache-control'), /no-store/); assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(sha(Buffer.from(await dl.arrayBuffer())), sha(cleanBytes));
  for (const t of [dts.token, ops.token, holder.token]) assert.equal((await fetch(`${BASE}/professional-credential-documents/${doc.id}`, { headers: { Authorization: 'Bearer ' + t } })).status, 403);
  assert.ok([401, 403].includes((await fetch(`${BASE}/professional-credential-documents/${doc.id}`)).status));
  assert.equal((await fetch(`${BASE}/professional-credential-documents/99999999`, { headers: { Authorization: 'Bearer ' + admin } })).status, 404);
  assert.equal((await fetch(`${BASE}/professional-credential-documents/..%2F..%2Fetc%2Fpasswd`, { headers: { Authorization: 'Bearer ' + admin } })).status >= 400, true);
  assert.ok(auditCount('CREDENTIAL_DOCUMENT', doc.id, 'DOWNLOAD') >= 1); pass('la descarga exige administrador, entrega el mismo archivo y queda auditada; sin acceso para otros perfiles');

  // Manipulación del archivo almacenado
  const key = one(`SELECT clave_archivo FROM documentos_habilitacion WHERE id_documentos_habilitacion=${doc.id}`);
  assert.match(key, /^[0-9a-f-]{36}\.pdf$/);
  const tmpOriginal = path.join(require('node:os').tmpdir(), 'orig-' + key);
  assert.equal(docker('cp', `${BACKEND}:/data/documents/${key}`, tmpOriginal).status, 0);
  assert.equal(docker('exec', BACKEND, 'sh', '-c', `printf 'manipulado' >> /data/documents/${key}`).status, 0);
  const tampered = await call(`/professional-credential-documents/${doc.id}`, { token: admin, expect: [500] });
  assert.equal(tampered.data.code, 'INTEGRIDAD_DOCUMENTO'); assert.equal(auditCount('CREDENTIAL_DOCUMENT', doc.id, 'INTEGRITY_FAILURE'), 1);
  assert.equal(docker('cp', tmpOriginal, `${BACKEND}:/data/documents/${key}`).status, 0); fs.unlinkSync(tmpOriginal);
  assert.equal((await fetch(`${BASE}/professional-credential-documents/${doc.id}`, { headers: { Authorization: 'Bearer ' + admin } })).status, 200); pass('un archivo manipulado en disco se detecta por la huella y se audita');

  // Revisión por otro administrador
  const own = await newCredential(holderAdmin, {}, admin);
  await uploadRaw(own.id, makePdf('propia-' + MARK));
  assert.equal((await decide(own.id, 'VERIFICADA', { notes: 'autoverificación', confirmsSufficiency: true }, { token: holderAdmin.token, expect: [403] })).data.code, 'AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA');
  assert.equal((await call(`/professional-credentials/${own.id}/external-checks`, { method: 'POST', token: holderAdmin.token, body: { authority: 'REFEPS_SISA', result: 'COINCIDE', comparedData: 'propia' }, expect: [403] })).data.code, 'AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA');
  const ownDoc = (await ok(`/professional-credentials/${own.id}`, { token: admin })).documents[0];
  assert.equal((await call(`/professional-credential-documents/${ownDoc.id}/retire`, { method: 'POST', token: holderAdmin.token, body: { reason: 'retiro propio' }, expect: [403] })).data.code, 'AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA');
  assert.equal(count(`SELECT COUNT(*) FROM habilitaciones_profesionales WHERE id_habilitaciones_profesionales=${own.id} AND estado_verificacion='PENDIENTE'`), 1);
  assert.equal((await decide(own.id, 'VERIFICADA', { notes: 'revisión independiente', confirmsSufficiency: true }, { token: admin })).data.status, 'VERIFICADA'); pass('el titular (aun siendo administrador) no revisa lo propio; otro administrador sí');

  assert.equal((await decide(c1.id, 'VERIFICADA', { notes: 'sin confirmar', confirmsSufficiency: false }, { expect: [400] })).status, 400);
  assert.equal((await decide(c1.id, 'VERIFICADA', { notes: '', confirmsSufficiency: true }, { expect: [400] })).status, 400);
  assert.equal((await decide(c1.id, 'VERIFICADA', { notes: 'Matrícula revisada en papel', confirmsSufficiency: true })).data.status, 'VERIFICADA');
  const reviewed = await ok(`/professional-credentials/${c1.id}`, { token: admin });
  assert.equal(reviewed.eligibility.eligible, true); assert.equal(reviewed.validationKind, 'REVISION_INTERNA_SIN_CONSULTA_EXTERNA'); assert.equal(reviewed.lifecycle, 'VIGENTE');
  assert.equal(reviewed.verifier, admin2.name); assert.equal(reviewed.documentStatus, 'LIMPIO');
  assert.deepEqual(decisionTypes(c1.id).slice(0, 1), ['REGISTRO']); assert.ok(decisionTypes(c1.id).includes('ANALISIS_DOCUMENTO') && decisionTypes(c1.id).at(-1) === 'VERIFICADA');
  assert.equal(count(`SELECT COUNT(*) FROM decisiones_habilitacion WHERE id_habilitaciones_profesionales=${c1.id} AND tipo_decision='VERIFICADA' AND motivo=N'Matrícula revisada en papel' AND id_usuarios=${admin2.id}`), 1);
  assert.equal((await decide(c1.id, 'RECHAZADA', { notes: 'ya verificada', confirmsSufficiency: false }, { expect: [409] })).data.code, 'ESTADO_HABILITACION_INCOMPATIBLE'); pass('verificación con actor, fecha, motivo y evidencia; las decisiones fuera de estado se rechazan (409)');
  const history = await ok(`/professional-credentials/${c1.id}/decisions`, { token: admin }); assert.ok(history.length >= 4 && history[0].type === 'VERIFICADA');

  // Fallas del analizador: falla segura, reintento manual y periódico
  assert.equal(docker('pause', CLAMAV).status, 0);
  let pausedDoc;
  try {
    const c2 = await newCredential(await createUser(admin, 'DTS', 'habf'));
    const failing = (await uploadRaw(c2.id, makePdf('analizador-caido-' + MARK))).data;
    pausedDoc = { credential: c2.id, doc: failing.documents[0].id };
    assert.equal(failing.documents[0].scanStatus, 'ERROR_ANALISIS'); assert.equal(failing.documentStatus, 'ERROR_ANALISIS');
    assert.equal((await decide(c2.id, 'VERIFICADA', { notes: 'con el analizador caído', confirmsSufficiency: true }, { expect: [409] })).data.code, 'DOCUMENTACION_SIN_ANALISIS_COMPLETO');
    assert.equal((await call(`/professional-credential-documents/${pausedDoc.doc}`, { token: admin, expect: [409] })).data.code, 'DOCUMENTO_NO_DISPONIBLE');
    assert.equal((await call(`/professional-credential-documents/${pausedDoc.doc}/rescan`, { method: 'POST', token: admin })).data.documents[0].scanStatus, 'ERROR_ANALISIS');
    assert.equal(count(`SELECT COUNT(*) FROM decisiones_habilitacion WHERE id_habilitaciones_profesionales=${c2.id} AND tipo_decision='ANALISIS_DOCUMENTO'`), 1, 'un fallo repetido no llena el historial');
    pass('con el analizador caído el documento queda en cuarentena: ni se aprueba, ni se descarga');
  } finally { assert.equal(docker('unpause', CLAMAV).status, 0); }
  await waitClam();
  await call('/e2e/credential-documents/retry-scans', { method: 'POST', token: admin });
  assert.equal((await ok(`/professional-credentials/${pausedDoc.credential}`, { token: admin })).documents[0].scanStatus, 'LIMPIO', 'el reintento periódico limpia el documento una vez recuperado el analizador');
  assert.equal((await decide(pausedDoc.credential, 'VERIFICADA', { notes: 'analizador recuperado', confirmsSufficiency: true })).data.status, 'VERIFICADA'); pass('al recuperarse el analizador el reintento limpia el documento y permite verificar');

  // ================= versiones, retiro y bloqueo =================
  const filesBefore = storedFiles();
  const v2bytes = makePdf('matricula-v2-' + MARK);
  const replaced = (await uploadRaw(c1.id, v2bytes, { name: 'matricula-v2.pdf', purpose: 'CORRECCION', replacesId: doc.id })).data;
  assert.equal(replaced.status, 'PENDIENTE'); assert.equal(replaced.eligibility.eligible, false);
  const old = replaced.documents.find((d) => d.id === doc.id), next = replaced.documents.find((d) => d.name === 'matricula-v2.pdf');
  assert.ok(old.retired && /Reemplazado/.test(old.retireReason)); assert.equal(next.replacesId, doc.id); assert.ok(next.version > old.version);
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE id_documentos_habilitacion=${doc.id} AND fecha_baja IS NOT NULL AND motivo_baja IS NOT NULL AND hash_sha256='${sha(cleanBytes)}'`), 1);
  assert.equal(storedFiles(), filesBefore + 1, 'el archivo reemplazado se conserva'); assert.equal((await fetch(`${BASE}/professional-credential-documents/${doc.id}`, { headers: { Authorization: 'Bearer ' + admin } })).status, 200);
  pass('reemplazar conserva la versión anterior (fila, huella y archivo) y reabre la revisión de inmediato');
  assert.equal((await decide(c1.id, 'VERIFICADA', { notes: 'segunda revisión', confirmsSufficiency: true })).data.status, 'VERIFICADA');
  assert.equal((await call(`/professional-credential-documents/${next.id}/retire`, { method: 'POST', token: admin2.token, body: { reason: 'intento' }, expect: [409] })).data.code, 'DOCUMENTO_SUSTENTA_VERIFICACION');
  assert.equal((await call(`/professional-credential-documents/${next.id}/retention-hold`, { method: 'POST', token: admin2.token, body: { hold: true, reason: 'Auditoría interna en curso' } })).status, 200);
  assert.equal((await call(`/professional-credential-documents/${next.id}/retention-hold`, { method: 'POST', token: admin2.token, body: { hold: true, reason: 'otra vez' }, expect: [409] })).data.code, 'BLOQUEO_SIN_CAMBIOS');
  assert.equal((await uploadRaw(c1.id, makePdf('x3-' + MARK), { replacesId: next.id, expect: [409] })).data.code, 'DOCUMENTO_BAJO_BLOQUEO_CONSERVACION');
  assert.equal((await call(`/professional-credential-documents/${next.id}/retention-hold`, { method: 'POST', token: admin2.token, body: { hold: false, reason: '' }, expect: [400] })).status, 400);
  assert.equal((await call(`/professional-credential-documents/${next.id}/retention-hold`, { method: 'POST', token: admin2.token, body: { hold: false, reason: 'Auditoría concluida' } })).status, 200);
  assert.ok(decisionTypes(c1.id).includes('BLOQUEO_CONSERVACION') && decisionTypes(c1.id).includes('LIBERACION_BLOQUEO')); pass('retiro controlado y bloqueo de conservación con motivo, auditados');
  const report = await ok('/professional-credential-retention/report', { token: admin });
  assert.equal(report.purgeEnabled, false); assert.equal(report.policyApproved, false); assert.ok(report.retiredDocuments >= 1); assert.match(report.statement, /no hay una política de retención aprobada/i); pass('el informe de retención declara que no hay política aprobada ni purga');

  // ================= correcciones, rechazo, renovación y revocación =================
  const cc = await newCredential(await createUser(admin, 'DTS', 'habc'));
  await uploadRaw(cc.id, makePdf('correccion-' + MARK));
  assert.equal((await decide(cc.id, 'CORRECCION_SOLICITADA', { notes: 'Falta la jurisdicción de la matrícula', confirmsSufficiency: false })).data.status, 'CORRECCION_SOLICITADA');
  assert.equal((await ok(`/professional-credentials/${cc.id}`, { token: admin })).eligibility.code, 'HABILITACION_CORRECCION_PENDIENTE');
  const provinces = await ok('/catalogs/provinces', { token: admin });
  const corrected = (await call(`/professional-credentials/${cc.id}`, { method: 'PUT', token: admin, body: credentialBody({ number: 'MP-CORR-' + MARK, jurisdictionId: provinces[0].id }) })).data;
  assert.equal(corrected.status, 'PENDIENTE'); assert.equal(corrected.jurisdictionId, provinces[0].id);
  assert.equal((await call(`/professional-credentials/${cc.id}`, { method: 'PUT', token: admin, body: credentialBody({ number: 'MP-CORR-' + MARK, jurisdictionId: provinces[0].id }) })).data.status, 'PENDIENTE');
  assert.equal(count(`SELECT COUNT(*) FROM decisiones_habilitacion WHERE id_habilitaciones_profesionales=${cc.id} AND tipo_decision='MODIFICACION'`), 1, 'una edición idéntica no reinicia ni registra nada');
  assert.equal((await decide(cc.id, 'RECHAZADA', { notes: 'No corresponde a la función', confirmsSufficiency: false })).data.status, 'RECHAZADA');
  assert.equal((await ok(`/professional-credentials/${cc.id}`, { token: admin })).eligibility.code, 'HABILITACION_RECHAZADA'); pass('solicitud de corrección, edición que reabre la revisión y rechazo con motivo');

  const verifiedCred = await ok(`/professional-credentials/${pausedDoc.credential}`, { token: admin });
  const renewal = (await call(`/professional-credentials/${verifiedCred.id}/renew`, { method: 'POST', token: admin, body: credentialBody({ number: verifiedCred.number, expires: isoDay(Date.now() + 800 * DAY) }) })).data;
  assert.equal(renewal.status, 'PENDIENTE'); assert.equal(renewal.renewsId, verifiedCred.id);
  assert.equal((await call(`/professional-credentials/${verifiedCred.id}/renew`, { method: 'POST', token: admin, body: credentialBody(), expect: [409] })).data.code, 'RENOVACION_EN_CURSO');
  assert.equal((await ok(`/professional-credentials/${verifiedCred.id}`, { token: admin })).eligibility.eligible, true, 'la vigente sigue valiendo mientras se revisa la renovación');
  await uploadRaw(renewal.id, makePdf('renovacion-' + MARK), { purpose: 'RENOVACION' });
  assert.equal((await decide(renewal.id, 'VERIFICADA', { notes: 'Renovación revisada', confirmsSufficiency: true })).data.status, 'VERIFICADA');
  assert.equal(count(`SELECT COUNT(*) FROM habilitaciones_profesionales WHERE id_habilitacion_renovada=${verifiedCred.id}`), 1); pass('renovación: nueva habilitación enlazada; la anterior se conserva y sigue vigente hasta que la sucesora se verifica');

  const revoke = (await decide(renewal.id, 'REVOCADA', { notes: 'Matrícula suspendida por el colegio', confirmsSufficiency: false })).data;
  assert.equal(revoke.status, 'REVOCADA'); assert.equal((await call(`/professional-credentials/${renewal.id}`, { method: 'PUT', token: admin, body: credentialBody(), expect: [409] })).data.code, 'HABILITACION_REVOCADA_NO_EDITABLE');
  assert.equal((await uploadRaw(renewal.id, makePdf('post-revocacion-' + MARK), { expect: [409] })).data.code, 'HABILITACION_REVOCADA_NO_EDITABLE');
  assert.equal((await decide(renewal.id, 'VERIFICADA', { notes: 'reintento', confirmsSufficiency: true }, { expect: [409] })).data.code, 'ESTADO_HABILITACION_INCOMPATIBLE'); pass('la revocación es definitiva: no se edita, no recibe documentos ni vuelve a verificarse');

  // ================= E: consulta externa manual =================
  const ext = await ok(`/professional-credentials/${c1.id}`, { token: admin });
  assert.equal((await call(`/professional-credentials/${c1.id}/external-checks`, { method: 'POST', token: admin2.token, body: { authority: 'ANAC', result: 'COINCIDE', comparedData: 'x' }, expect: [400] })).status, 400);
  const consulted = (await call(`/professional-credentials/${c1.id}/external-checks`, { method: 'POST', token: admin2.token, body: { authority: 'REFEPS_SISA', result: 'COINCIDE', comparedData: 'Nombre y matrícula coinciden en el Buscador Nacional', notes: 'Captura archivada', evidenceDocumentId: ext.documents.find((d) => !d.retired).id } })).data;
  assert.equal(consulted.status, 'VERIFICADA'); assert.equal(consulted.validationKind, 'REVISION_INTERNA_CON_CONSULTA_EXTERNA_MANUAL'); assert.equal(consulted.externalCheck.responsible, admin2.name);
  assert.match(consulted.externalCheck.authorityUrl, /buscador-nacional-de-profesionales-de-la-salud/);
  assert.equal(count(`SELECT COUNT(*) FROM consultas_externas_habilitacion WHERE id_habilitaciones_profesionales=${c1.id} AND organismo='REFEPS_SISA' AND resultado='COINCIDE' AND id_usuario_responsable=${admin2.id} AND id_documentos_habilitacion IS NOT NULL`), 1);
  assert.equal((await call(`/professional-credentials/${c1.id}/external-checks`, { method: 'POST', token: admin2.token, body: { authority: 'REFEPS_SISA', result: 'NO_COINCIDE', comparedData: 'Otra consulta', consultedAt: '2999-01-01T00:00:00' }, expect: [400] })).status, 400);
  pass('la consulta externa manual registra fuente, responsable, datos y evidencia sin cambiar el estado administrativo ni presentarse como validación oficial');

  // ================= F: avisos de vencimiento =================
  const expiryOwner = await createUser(admin, 'DTS', 'habx');
  const e1 = await newCredential(expiryOwner, { expires: isoDay(Date.now() + 70 * DAY) });
  await uploadRaw(e1.id, makePdf('vence-' + MARK)); await decide(e1.id, 'VERIFICADA', { notes: 'para avisos', confirmsSufficiency: true });
  const notices = (userId) => count(`SELECT COUNT(*) FROM notificaciones WHERE id_usuarios=${userId} AND clave_evento LIKE N'CRED_EXPIRY:${e1.id}:%'`);
  const runJob = async () => (await call('/e2e/credential-expiry/run', { method: 'POST', token: admin })).data;
  const advance = (days) => ok('/e2e/clock', { method: 'PUT', token: admin, body: { advanceSeconds: days * 86400 } });
  try {
    assert.equal((await runJob()).avisos, 0, 'a 70 días no corresponde ningún umbral'); assert.equal(notices(expiryOwner.id), 0);
    await advance(11);                                    // faltan 59 días
    const first = await runJob(); assert.ok(first.avisos >= 2, 'titular y administradores'); assert.equal(notices(expiryOwner.id), 1);
    assert.equal((await runJob()).avisos, 0); assert.equal(notices(expiryOwner.id), 1); pass('aviso de 60 días emitido una vez; la reejecución no duplica');
    const mensaje = one(`SELECT TOP 1 mensaje FROM notificaciones WHERE id_usuarios=${expiryOwner.id} AND clave_evento LIKE N'CRED_EXPIRY:${e1.id}:%'`);
    assert.ok(!mensaje.includes(e1.number) && !/MP-/.test(mensaje), 'el aviso al titular no revela el número de matrícula'); assert.match(mensaje, /vence en 59 días/);
    assert.ok(count(`SELECT COUNT(*) FROM notificaciones n JOIN usuarios u ON u.id_usuarios=n.id_usuarios WHERE n.clave_evento LIKE N'CRED_EXPIRY:${e1.id}:%' AND n.id_usuarios=${admin2.id}`) >= 1);
    await advance(25); await runJob(); assert.equal(notices(expiryOwner.id), 1, 'a 34 días sigue vigente el umbral de 60: nada nuevo');
    await advance(5); await runJob(); assert.equal(notices(expiryOwner.id), 2);   // 29 días: umbral de 30
    await advance(22); await runJob(); assert.equal(notices(expiryOwner.id), 3);  // 7 días
    await advance(7); await runJob(); assert.equal(notices(expiryOwner.id), 4);   // el día del vencimiento
    await advance(1); await runJob(); assert.equal(notices(expiryOwner.id), 4);   // vencida: el aviso de vencimiento ya se emitió
    const lifecycle = await ok(`/professional-credentials/${e1.id}`, { token: admin });
    assert.equal(lifecycle.lifecycle, 'VENCIDA'); assert.equal(lifecycle.eligibility.eligible, false);
    assert.equal(auditCount('PROFESSIONAL_CREDENTIAL', e1.id, 'EXPIRY_NOTICE'), 4);
    pass('umbrales sucesivos sin duplicados');
  } finally { await ok('/e2e/clock', { method: 'PUT', token: admin, body: { reset: true } }); }

  // ================= G: persistencia y restricciones reales =================
  assert.throws(() => sql(`UPDATE habilitaciones_profesionales SET estado_verificacion='INVENTADO' WHERE id_habilitaciones_profesionales=${c1.id}`), /CHECK|ck_habilitacion_estado/i);
  assert.throws(() => sql(`INSERT INTO consultas_externas_habilitacion(id_habilitaciones_profesionales,organismo,fecha_consulta,id_usuario_responsable,numero_consultado,datos_contrastados,resultado) VALUES(${c1.id},'FALSA',SYSUTCDATETIME(),${admin2.id},'x','x','COINCIDE')`), /CHECK|ck_consulta/i);
  assert.throws(() => sql(`UPDATE documentos_habilitacion SET fecha_baja=SYSUTCDATETIME() WHERE id_documentos_habilitacion=${infectedId}`), /CHECK|ck_dochab_baja/i);
  assert.throws(() => sql(`UPDATE documentos_habilitacion SET bloqueo_conservacion=1 WHERE id_documentos_habilitacion=${infectedId}`), /CHECK|ck_dochab_bloqueo/i);
  assert.throws(() => sql(`UPDATE documentos_habilitacion SET estado_analisis='LIMPIO_FALSO' WHERE id_documentos_habilitacion=${infectedId}`), /CHECK|ck_dochab_analisis/i);
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE estado_analisis='LEGADO_SIN_ANALISIS' AND hash_sha256 IS NULL`) >= 0, true);
  pass('las restricciones de V59 se aplican en SQL Server');

  console.log(`\n${passed} comprobaciones aprobadas (e2e-habilitaciones)`);

  async function waitClam() { for (let i = 0; i < 40; i++) { const s = await ok('/professional-credential-documents/antimalware-status', { token: admin }); if (s.configured) return; await new Promise((r) => setTimeout(r, 3000)); } throw new Error('ClamAV no volvió'); }
})().catch((e) => { console.error(e); process.exit(1); });
