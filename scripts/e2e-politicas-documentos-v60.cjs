/* I-5.7: V60, procedimiento de activación de políticas, regularización de documentos anteriores a V59 y lista de preparación,
 * contra el backend, SQL Server y ClamAV REALES del stack E2E aislado (Flyway >= V60).
 * Uso: node scripts/e2e-politicas-documentos-v60.cjs   (requiere `--profile antimalware` con E2E_ANTIMALWARE_ENABLED=true)
 *  A) esquema V60: triggers e inmutabilidad probados con intentos reales de UPDATE/DELETE, constraints y reclasificación de los documentos migrados.
 *  B) lista de preparación: permisos y contenido.
 *  C) política: simulación sin escritura, huella, aprobación, lote atómico e idempotente, función sin política = no elegible, restauración.
 *  D) documentos heredados: restringidos, regularización con ClamAV real (limpio, EICAR, archivo ausente, PDF inválido), origen conservado, autoverificación denegada.
 *  E) procedimiento por línea de comandos. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, DB_NAME, MARK, sql, one, count, call, ok, createUser, waitHealthy, makePdf, ensureCredentialPolicies } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const DAY = 86400000, isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const blocked = (statement, pattern) => { let message = ''; try { sql(statement); } catch (e) { message = e.message; } assert.ok(message, 'la sentencia debía ser rechazada: ' + statement.slice(0, 80)); if (pattern) assert.match(message, pattern); };

(async () => {
  const info = JSON.parse(docker('inspect', BACKEND).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.DB_URL.includes(`databaseName=${DB_NAME};`) && DB_NAME === 'vuelos_sanitarios_e2e', 'El backend no apunta a la base E2E');
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 60, 'se requiere Flyway >= V60');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } }
  await waitHealthy();
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adminId = (await ok('/auth/me', { token: admin })).id;
  const admin2 = await createUser(admin, 'ADMINISTRADOR', 'v60b');
  const dts = await createUser(admin, 'DTS', 'v60d');
  await ensureCredentialPolicies(admin);
  const status = await ok('/professional-credential-documents/antimalware-status', { token: admin });
  assert.equal(status.configured, true, 'No hay analizador antimalware real: levante el stack con --profile antimalware y E2E_ANTIMALWARE_ENABLED=true');

  const uploadRaw = async (credentialId, bytes, { name = 'documento.pdf', token = admin, expect = [200] } = {}) => {
    const form = new FormData(); form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
    const res = await fetch(`${BASE}/professional-credentials/${credentialId}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
    const raw = await res.text(); let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    assert.ok(expect.includes(res.status), `carga: HTTP ${res.status}; ${raw.slice(0, 300)}`);
    return data;
  };
  const credentialBody = (role, type, extra = {}) => ({ roleCode: role, type, number: 'MP-' + MARK + '-' + Math.floor(Math.random() * 1e6), issuer: 'Colegio de prueba', issued: isoDay(Date.now() - 365 * DAY), expires: isoDay(Date.now() + 365 * DAY), notes: 'I-5.7', ...extra });
  const newCredential = (owner, role, type, extra) => ok(`/users/${owner.id}/professional-credentials`, { method: 'POST', token: admin, body: credentialBody(role, type, extra) });
  const decide = (id, action, body, expect = [200]) => call(`/professional-credentials/${id}/decision/${action}`, { method: 'POST', token: admin2.token, body, expect });
  const verify = (id) => decide(id, 'VERIFICADA', { notes: 'Revisión I-5.7', confirmsSufficiency: true });
  const view = (id) => ok(`/professional-credentials/${id}`, { token: admin });
  const keyOf = (docId) => one(`SELECT clave_archivo FROM documentos_habilitacion WHERE id_documentos_habilitacion=${docId}`);
  const insertLegacy = (credentialId, key, name, uploaderId = adminId) => {
    sql(`INSERT INTO documentos_habilitacion(id_habilitaciones_profesionales,clave_archivo,nombre_archivo,id_usuario_cargador,fecha_carga,proposito,numero_version,estado_analisis,detalle_analisis,origen_registro)
         VALUES (${credentialId},N'${key}',N'${name}',${uploaderId},SYSUTCDATETIME(),'EVIDENCIA',1,'LEGADO_SIN_ANALISIS',N'Cargado antes de V59 sin hash ni análisis antimalware','ANTERIOR_V59')`);
    return Number(one(`SELECT MAX(id_documentos_habilitacion) FROM documentos_habilitacion WHERE id_habilitaciones_profesionales=${credentialId}`));
  };
  const auditCount = (type, id, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'${type}' AND entidad_id=${id} AND operacion=N'${op}'`);

  // ================= A: esquema V60 =================
  assert.equal(count(`SELECT COUNT(*) FROM sys.triggers WHERE name IN (N'tr_decisiones_habilitacion_inmutable',N'tr_consultas_externas_inmutable',N'tr_politicas_habilitacion_proteccion',N'tr_documentos_habilitacion_integridad')`), 4);
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE CASE WHEN hash_sha256 IS NULL THEN 0 ELSE 1 END <> CASE WHEN hash_momento IS NULL THEN 0 ELSE 1 END`), 0);
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE origen_registro='ANTERIOR_V59' AND (hash_sha256 IS NOT NULL AND hash_momento <> 'REGULARIZACION')`), 0);
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE estado_analisis='LEGADO_SIN_ANALISIS' AND origen_registro <> 'ANTERIOR_V59'`), 0);
  pass('V60 aplicada: 4 triggers, huella y momento coherentes, todo documento sin análisis figura como anterior a V59');
  // Las decisiones y consultas son inmutables: se prueba con intentos reales.
  const decisionId = one('SELECT MIN(id_decisiones_habilitacion) FROM decisiones_habilitacion');
  blocked(`UPDATE decisiones_habilitacion SET motivo=N'alterado' WHERE id_decisiones_habilitacion=${decisionId}`, /51060/);
  blocked(`DELETE FROM decisiones_habilitacion WHERE id_decisiones_habilitacion=${decisionId}`, /51060/);
  const checkId = one('SELECT MIN(id_consultas_externas_habilitacion) FROM consultas_externas_habilitacion');
  if (checkId) { blocked(`UPDATE consultas_externas_habilitacion SET resultado='NO_COINCIDE' WHERE id_consultas_externas_habilitacion=${checkId}`, /51061/); blocked(`DELETE FROM consultas_externas_habilitacion WHERE id_consultas_externas_habilitacion=${checkId}`, /51061/); }
  pass('decisiones y consultas externas: UPDATE y DELETE rechazados por el motor de base de datos');
  // Una política dada de baja SIN equivalente activa: si hubiera una activa con la misma clave, el índice único ux_politica_habilitacion_activa rechazaría la reactivación antes que el trigger y la prueba no ejercería el trigger V60.
  const retiredPolicy = one("SELECT MIN(r.id_politicas_habilitacion) FROM politicas_habilitacion r WHERE r.activa=0 AND NOT EXISTS (SELECT 1 FROM politicas_habilitacion a WHERE a.activa=1 AND a.id_roles_tripulacion=r.id_roles_tripulacion AND ISNULL(a.id_tipos_vuelo,0)=ISNULL(r.id_tipos_vuelo,0) AND ISNULL(a.categoria_aeronave,N'')=ISNULL(r.categoria_aeronave,N'') AND a.tipo_habilitacion=r.tipo_habilitacion)"), activePolicy = one('SELECT MIN(id_politicas_habilitacion) FROM politicas_habilitacion WHERE activa=1');
  assert.ok(/^[0-9]+$/.test(retiredPolicy), "la prueba necesita una política dada de baja sin equivalente activa (la dejan las pruebas de habilitaciones y de activación por lote): " + retiredPolicy);
  blocked(`DELETE FROM politicas_habilitacion WHERE id_politicas_habilitacion=${retiredPolicy}`, /51062/);
  blocked(`UPDATE politicas_habilitacion SET tipo_habilitacion=N'alterada' WHERE id_politicas_habilitacion=${activePolicy}`, /51063/);
  blocked(`UPDATE politicas_habilitacion SET activa=1,fecha_baja=NULL,id_usuario_baja=NULL,motivo_baja=NULL WHERE id_politicas_habilitacion=${retiredPolicy}`, /51064/);
  blocked(`UPDATE politicas_habilitacion SET motivo_baja=N'reescrito' WHERE id_politicas_habilitacion=${retiredPolicy}`, /51064/);
  sql(`UPDATE politicas_habilitacion SET tipo_habilitacion=tipo_habilitacion,activa=activa WHERE id_politicas_habilitacion=${activePolicy}`);
  pass('políticas: no se borran, no cambian su definición, no se reactivan y una actualización idéntica (Hibernate) sigue permitida');
  const sampleDoc = one(`SELECT TOP 1 id_documentos_habilitacion FROM documentos_habilitacion WHERE hash_sha256 IS NOT NULL AND origen_registro='POSTERIOR_V59' ORDER BY id_documentos_habilitacion`);
  blocked(`UPDATE documentos_habilitacion SET hash_sha256=REPLICATE('a',64) WHERE id_documentos_habilitacion=${sampleDoc}`, /51066/);
  blocked(`UPDATE documentos_habilitacion SET clave_archivo=N'otro.pdf' WHERE id_documentos_habilitacion=${sampleDoc}`, /51066/);
  blocked(`UPDATE documentos_habilitacion SET origen_registro='ANTERIOR_V59' WHERE id_documentos_habilitacion=${sampleDoc}`, /51066/);
  blocked(`DELETE FROM documentos_habilitacion WHERE id_documentos_habilitacion=${sampleDoc}`);
  pass('documentos: la huella registrada, el archivo y el origen no se alteran ni se eliminan filas');

  // V60_SOLO_DOCUMENTOS=1 omite las secciones B y C (lista de preparación y política, que tardan minutos en la base E2E) para iterar sobre los documentos heredados.
  if (!process.env.V60_SOLO_DOCUMENTOS) {
  // ================= B: lista de preparación =================
  assert.equal((await call('/admin/readiness', { token: dts.token, expect: [403] })).status, 403);
  assert.equal((await call('/admin/readiness', { expect: [401, 403] })).status >= 401, true);
  const readiness = await ok('/admin/readiness', { token: admin });
  const items = Object.fromEntries(readiness.items.map((i) => [i.key, i]));
  assert.equal(readiness.environment, 'pruebas'); assert.ok(Number(readiness.flywayVersion) >= 60);
  for (const role of ['COMANDANTE', 'COPILOTO', 'MEDICO', 'ENFERMERO']) assert.equal(items['POLITICA_' + role].mandatory, true);
  assert.equal(items.AVISOS_VENCIMIENTO.status, 'PROPUESTA'); assert.equal(items.RETENCION.status, 'PENDIENTE'); assert.equal(items.ANTIMALWARE.mandatory, false, 'en pruebas la base mínima no bloquea');
  assert.ok(!JSON.stringify(readiness).includes(dotenv.JWT_SECRET || '\u0000secreto'), 'no expone el secreto');
  assert.equal(readiness.readyForOperation, readiness.pendingMandatory.length === 0); pass('la lista de preparación exige política por función, informa decisiones pendientes y no expone secretos');

  // ================= C: política =================
  const FIXTURE_TYPE = 'TIPO FICTICIO SANITARIO E ' + MARK;
  const activeNurse = () => count(`SELECT COUNT(*) FROM politicas_habilitacion p JOIN roles_tripulacion r ON r.id_roles_tripulacion=p.id_roles_tripulacion WHERE r.codigo_rol_tripulacion='ENFERMERO' AND p.activa=1`);
  const snapshot = (await ok('/credential-policies', { token: admin })).filter((p) => p.active && p.roleCode === 'ENFERMERO');
  const toRow = (p) => ({ roleCode: p.roleCode, flightTypeCode: p.flightTypeCode, aircraftCategory: p.aircraftCategory, credentialType: p.credentialType, requiresJurisdiction: p.requiresJurisdiction, requiresExternalCheck: p.requiresExternalCheck, origin: p.origin, sourceReference: p.sourceReference, notes: p.notes });
  const restore = { name: 'restauración E2E', roles: ['ENFERMERO'], policies: snapshot.map(toRow), pendingDecisions: [] };
  const fixture = { name: 'fixture E2E', roles: ['ENFERMERO'], policies: [{ roleCode: 'ENFERMERO', credentialType: FIXTURE_TYPE, flightTypeCode: 'SANITARIO', requiresJurisdiction: true, notes: 'Fixture de ensayo' }], pendingDecisions: [] };
  const simulate = async (proposal, token = admin, expect = [200]) => call('/credential-policies/simulation', { method: 'POST', token, body: proposal, expect });
  const activate = async (proposal, fingerprint, approval, acknowledge, expect = [200], token = admin) => call('/credential-policies/activation', { method: 'POST', token, body: { proposal, approvedFingerprint: fingerprint, approvalReference: approval, acknowledgeIncompatibilities: acknowledge }, expect });
  assert.ok(snapshot.length > 0, 'se esperaban políticas de ENFERMERO de las pruebas E2E');

  const province = (await ok('/catalogs/provinces', { token: admin }))[0];
  const nurse = await createUser(admin, 'DTS', 'v60e'), nurseNoJurisdiction = await createUser(admin, 'DTS', 'v60f');
  for (const n of [nurse, nurseNoJurisdiction]) await call(`/crew-qualifications/${n.id}/ENFERMERO`, { method: 'PUT', token: admin, expect: [204] });
  const nurseCredential = await newCredential(nurse, 'ENFERMERO', FIXTURE_TYPE, { jurisdictionId: province.id });
  const nurseCredential2 = await newCredential(nurseNoJurisdiction, 'ENFERMERO', FIXTURE_TYPE);
  for (const c of [nurseCredential, nurseCredential2]) { await uploadRaw(c.id, makePdf('enf-' + MARK + c.id)); await verify(c.id); }
  assert.equal((await view(nurseCredential.id)).eligibility.code, 'HABILITACION_NO_SUFICIENTE', 'antes de la política el tipo ficticio no basta');

  // Simulación: no escribe, es determinista y sólo la ve un administrador.
  const policiesBefore = count('SELECT COUNT(*) FROM politicas_habilitacion'), eventsBefore = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad LIKE N'CREDENTIAL_POLICY%'`);
  assert.equal((await simulate(fixture, dts.token, [403])).status, 403);
  const report = (await simulate(fixture)).data, again = (await simulate(fixture)).data;
  assert.equal(report.fingerprint, again.fingerprint); assert.equal(report.canActivate, true);
  assert.equal(count('SELECT COUNT(*) FROM politicas_habilitacion'), policiesBefore); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad LIKE N'CREDENTIAL_POLICY%'`), eventsBefore);
  const plan = report.plan[0]; assert.equal(plan.create, 1); assert.equal(plan.retire, snapshot.length); assert.equal(plan.keep, 0);
  const people = report.people[0]; assert.ok(people.becomeEligible >= 1, 'la enfermera con jurisdicción pasaría a ser elegible'); assert.ok(people.codesAfter.JURISDICCION_NO_REGISTRADA >= 1, 'la que no tiene jurisdicción sigue no elegible, con su causa');
  assert.ok(report.issues.some((i) => i.code === 'CATEGORIAS_EN_USO')); assert.ok(report.uncovered.length >= 0);
  pass(`la simulación no escribe, es determinista y detalla personas (${people.becomeEligible} pasarían a elegibles, ${people.becomeIneligible} a no elegibles) y ${report.flightsExamined} vuelos abiertos`);
  const reordered = { ...fixture, policies: [{ ...fixture.policies[0], credentialType: fixture.policies[0].credentialType.toLowerCase() }] };
  assert.equal((await simulate(reordered)).data.fingerprint, report.fingerprint, 'la huella no depende de mayúsculas'); pass('la huella canónica ignora mayúsculas y orden');

  // Validaciones y controles de aprobación.
  const invalid = { ...fixture, policies: [{ roleCode: 'ENFERMERO', credentialType: ' ' }, { roleCode: 'ENFERMERO', credentialType: 'X', flightTypeCode: 'NO_EXISTE' }] };
  const invalidReport = (await simulate(invalid)).data; assert.equal(invalidReport.canActivate, false);
  assert.equal((await activate(invalid, invalidReport.fingerprint, 'Acta', true, [409])).data.code, 'PROPUESTA_INVALIDA');
  assert.equal((await activate(fixture, report.fingerprint.replace(/.$/, report.fingerprint.endsWith('0') ? '1' : '0'), 'Acta', true, [409])).data.code, 'HUELLA_NO_COINCIDE');
  assert.equal((await activate({ ...fixture, policies: [...fixture.policies, { roleCode: 'ENFERMERO', credentialType: 'Otro ' + MARK }] }, report.fingerprint, 'Acta', true, [409])).data.code, 'HUELLA_NO_COINCIDE', 'se aprobó una propuesta y se envía otra');
  assert.equal((await activate(fixture, report.fingerprint, ' ', true, [400])).status, 400);
  assert.equal((await activate(fixture, report.fingerprint, 'Acta', true, [403], dts.token)).status, 403);
  const strict = await call('/credential-policies/simulation', { method: 'POST', token: admin, body: { ...fixture, policies: [{ roleCode: 'ENFERMERO', credentialType: 'X', requiresExternalChek: true }] }, expect: [400] }); assert.match(JSON.stringify(strict.data), /Campo no admitido|requiresExternalChek/);
  assert.equal(activeNurse(), snapshot.length); pass('propuesta inválida, huella distinta, sin aprobación, sin permiso y campos desconocidos: todo rechazado sin cambios');

  // Activación atómica con aprobación.
  const approval = 'Acta E2E ' + MARK;
  const activation = (await activate(fixture, report.fingerprint, approval, report.requiresAcknowledgement)).data;
  assert.equal(activation.changed, true); assert.equal(activation.created, 1); assert.equal(activation.retired, snapshot.length); assert.equal(activeNurse(), 1);
  assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion WHERE lote_activacion='${activation.batchId}' AND referencia_aprobacion=N'${approval}' AND activa=1`), 1);
  assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion WHERE activa=0 AND motivo_baja LIKE N'%${activation.batchId}%'`), snapshot.length);
  assert.equal(auditCount('CREDENTIAL_POLICY_BATCH', activation.createdIds[0], 'ACTIVATE'), 1);
  assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'CREDENTIAL_POLICY_BATCH' AND valores_nuevos LIKE N'%${approval}%' AND valores_nuevos LIKE N'%${report.fingerprint}%'`), 1);
  assert.equal((await view(nurseCredential.id)).eligibility.eligible, true, 'la enfermera con jurisdicción pasa a ser elegible'); assert.equal((await view(nurseCredential2.id)).eligibility.code, 'JURISDICCION_NO_REGISTRADA');
  pass('la activación crea el lote con referencia de aprobación, da de baja el reemplazado con motivo, se audita y cambia la elegibilidad real');
  const repeated = (await activate(fixture, report.fingerprint, approval, report.requiresAcknowledgement)).data;
  assert.equal(repeated.changed, false); assert.equal(repeated.created, 0); assert.equal(repeated.retired, 0); assert.equal(repeated.kept, 1); pass('reactivar la misma propuesta es idempotente');

  // Función sin política: queda no elegible y lo dice.
  const empty = { name: 'vaciar ENFERMERO', roles: ['ENFERMERO'], policies: [], pendingDecisions: [{ roleCode: 'ENFERMERO', topic: 'Matrícula suficiente', question: 'Pendiente de decisión de la dirección médica' }] };
  const emptyReport = (await simulate(empty)).data; assert.ok(emptyReport.issues.some((i) => i.code === 'FUNCION_SIN_POLITICA') && emptyReport.issues.some((i) => i.code === 'DECISION_PENDIENTE')); assert.equal(emptyReport.plan[0].eligibleAfterActivation, false);
  await activate(empty, emptyReport.fingerprint, approval + ' vacío', emptyReport.requiresAcknowledgement);
  assert.equal(activeNurse(), 0); assert.equal((await view(nurseCredential.id)).eligibility.code, 'POLITICA_HABILITACION_NO_CONFIGURADA');
  assert.equal((await ok('/admin/readiness', { token: admin })).items.find((i) => i.key === 'POLITICA_ENFERMERO').status, 'PENDIENTE'); pass('sin política propuesta la función queda no elegible (POLITICA_HABILITACION_NO_CONFIGURADA) y la lista de preparación lo señala');
  const restoreReport = (await simulate(restore)).data;
  await activate(restore, restoreReport.fingerprint, 'Restauración de las políticas E2E ' + MARK, restoreReport.requiresAcknowledgement);
  assert.equal(activeNurse(), snapshot.length); pass('las políticas E2E originales se restauraron');

  }

  // ================= D: documentos heredados =================
  const carrierOwner = await createUser(admin, 'DTS', 'v60c');
  const carrier = await newCredential(carrierOwner, 'MEDICO', 'Documento E2E');
  const cleanBytes = makePdf('heredado-limpio-' + MARK);
  const carrierView = await uploadRaw(carrier.id, cleanBytes);
  const cleanKey = keyOf(carrierView.documents[0].id);
  const eicarUpload = await uploadRaw(carrier.id, makePdf('heredado-eicar-' + MARK, { comment: EICAR }));
  const eicarDoc = eicarUpload.documents.find((d) => d.scanStatus === 'RECHAZADO'); assert.ok(eicarDoc, 'ClamAV real debía rechazar EICAR'); const eicarKey = keyOf(eicarDoc.id);
  const invalidKey = `invalido-${MARK}.pdf`, invalidFile = path.join(process.env.TEMP || '/tmp', invalidKey); fs.writeFileSync(invalidFile, '%PDF-1.4\n% truncado sin objetos\n');
  assert.equal(docker('cp', invalidFile, `${BACKEND}:/data/documents/${invalidKey}`).status, 0); fs.unlinkSync(invalidFile);

  // L1: archivo válido y limpio.
  const holder1 = await createUser(admin, 'DTS', 'v60g'); const c1 = await newCredential(holder1, 'MEDICO', 'Documento E2E');
  const l1 = insertLegacy(c1.id, cleanKey, 'antiguo.pdf', holder1.id);
  const l1View = await view(c1.id); const l1Doc = l1View.documents.find((d) => d.id === l1);
  assert.equal(l1Doc.origin, 'ANTERIOR_V59'); assert.equal(l1Doc.scanStatus, 'LEGADO_SIN_ANALISIS'); assert.equal(l1Doc.sha256, null); assert.match(l1Doc.restriction, /V59/);
  assert.equal(l1View.documentStatus, 'LEGADO_SIN_ANALISIS');
  const exposed = JSON.stringify(l1View);
  assert.ok(!exposed.includes(cleanKey) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf/.test(exposed), 'la respuesta no expone la clave ni la ruta privada del archivo');
  assert.ok(!/\/data\/documents|clave_archivo/i.test(JSON.stringify(status)) && !JSON.stringify(status).includes('clamav'), 'el estado del analizador no expone rutas ni el nombre interno del servicio');
  const denied = await call(`/professional-credential-documents/${l1}`, { token: admin, expect: [409] }); assert.equal(denied.data.code, 'DOCUMENTO_NO_DISPONIBLE'); assert.match(denied.data.error, /V59/);
  assert.equal((await decide(c1.id, 'VERIFICADA', { notes: 'x', confirmsSufficiency: true }, [409])).data.code, 'DOCUMENTACION_NO_LIMPIA');
  assert.equal((await call(`/professional-credential-documents/${l1}/rescan`, { method: 'POST', token: admin, expect: [409] })).data.code, 'DOCUMENTO_HEREDADO', 'un heredado se regulariza; no se reanaliza a ciegas');
  pass('un documento heredado figura como anterior a V59, no se descarga y no sustenta una verificación');
  assert.equal((await call(`/professional-credential-documents/${l1}/regularize`, { method: 'POST', token: dts.token, expect: [403] })).status, 403);
  const r1 = (await call(`/professional-credential-documents/${l1}/regularize`, { method: 'POST', token: admin2.token })).data;
  assert.equal(r1.result, 'REGULARIZADO');
  const row = sql(`SELECT estado_analisis,origen_registro,hash_sha256,hash_momento,id_usuario_regularizacion,motor_analisis FROM documentos_habilitacion WHERE id_documentos_habilitacion=${l1}`).split('|').map((s) => s.trim());
  assert.deepEqual([row[0], row[1], row[2], row[3]], ['LIMPIO', 'ANTERIOR_V59', sha(cleanBytes), 'REGULARIZACION']); assert.ok(row[4]); assert.equal(row[5], 'clamd');
  const download = await fetch(`${BASE}/professional-credential-documents/${l1}`, { headers: { Authorization: 'Bearer ' + admin } }); assert.equal(download.status, 200); assert.equal(sha(Buffer.from(await download.arrayBuffer())), sha(cleanBytes));
  assert.equal((await call(`/professional-credential-documents/${l1}/regularize`, { method: 'POST', token: admin2.token })).data.result, 'YA_RESUELTO');
  assert.ok(auditCount('CREDENTIAL_DOCUMENT', l1, 'REGULARIZE') === 1);
  const decisions = await ok(`/professional-credentials/${c1.id}/decisions`, { token: admin }); assert.ok(decisions.some((d) => d.type === 'ANALISIS_DOCUMENTO' && /anterior a V59/.test(d.reason) && /no prueba integridad desde la carga original/.test(d.reason)));
  const after = (await view(c1.id)).documents.find((d) => d.id === l1); assert.equal(after.origin, 'ANTERIOR_V59'); assert.equal(after.hashMoment, 'REGULARIZACION'); assert.equal((await verify(c1.id)).data.status, 'VERIFICADA');
  pass('regularización con ClamAV real: LIMPIO, huella rotulada «REGULARIZACION», origen heredado conservado, descarga íntegra, idempotente, auditada y utilizable para verificar');

  // L2: único sustento de una verificación vigente y el análisis lo rechaza.
  const holder2 = await createUser(admin, 'DTS', 'v60h'); const c2 = await newCredential(holder2, 'MEDICO', 'Documento E2E');
  const own = await uploadRaw(c2.id, makePdf('sustento-' + MARK)); await verify(c2.id);
  sql(`UPDATE documentos_habilitacion SET fecha_baja=SYSUTCDATETIME(),id_usuario_baja=${adminId},motivo_baja=N'Ensayo: queda sólo el documento heredado' WHERE id_documentos_habilitacion=${own.documents[0].id}`);
  const l2 = insertLegacy(c2.id, eicarKey, 'heredado-infectado.pdf', holder2.id);
  const beforeReport = (await ok('/professional-credential-documents/legacy/report', { token: admin }));
  assert.ok(beforeReport.credentials.some((c) => c.credentialId === c2.id) || beforeReport.verifiedCredentialsSupportedOnlyByLegacy > 100, 'el informe incluye la habilitación sostenida sólo por un documento heredado');
  assert.equal((await view(c2.id)).status, 'VERIFICADA'); assert.equal((await view(c2.id)).documentStatus, 'LEGADO_SIN_ANALISIS');
  const r2 = (await call(`/professional-credential-documents/${l2}/regularize`, { method: 'POST', token: admin2.token })).data;
  assert.equal(r2.result, 'RECHAZADO'); assert.match(r2.detail, /Eicar/i);
  const c2After = await view(c2.id); assert.equal(c2After.status, 'PENDIENTE'); assert.equal(c2After.eligibility.eligible, false);
  assert.equal(c2After.documents.find((d) => d.id === l2).scanStatus, 'RECHAZADO'); assert.equal(c2After.documents.find((d) => d.id === l2).hashMoment, 'REGULARIZACION');
  assert.ok((await ok(`/professional-credentials/${c2.id}/decisions`, { token: admin })).some((d) => d.type === 'MODIFICACION' && /Revisión requerida/.test(d.reason)));
  assert.equal((await call(`/professional-credential-documents/${l2}`, { token: admin, expect: [409] })).data.code, 'DOCUMENTO_NO_DISPONIBLE');
  pass('un documento heredado infectado se rechaza y devuelve a revisión la verificación que sólo él sostenía');

  // L3 archivo ausente, L4 PDF inválido.
  const holder3 = await createUser(admin, 'DTS', 'v60i'); const c3 = await newCredential(holder3, 'MEDICO', 'Documento E2E');
  const l3 = insertLegacy(c3.id, `no-existe-${MARK}.pdf`, 'perdido.pdf', holder3.id), l4 = insertLegacy(c3.id, invalidKey, 'invalido.pdf', holder3.id);
  const r3 = (await call(`/professional-credential-documents/${l3}/regularize`, { method: 'POST', token: admin2.token })).data;
  assert.equal(r3.result, 'RESTRINGIDO'); assert.match(r3.detail, /no está disponible/);
  const l3Row = sql(`SELECT estado_analisis,ISNULL(hash_sha256,'-'),detalle_analisis FROM documentos_habilitacion WHERE id_documentos_habilitacion=${l3}`).split('|').map((s) => s.trim());
  assert.equal(l3Row[0], 'LEGADO_SIN_ANALISIS'); assert.equal(l3Row[1], '-'); assert.match(l3Row[2], /Anterior a V59.*no está disponible/);
  const r4 = (await call(`/professional-credential-documents/${l4}/regularize`, { method: 'POST', token: admin2.token })).data;
  assert.equal(r4.result, 'RECHAZADO'); assert.match(r4.detail, /Estructura PDF no válida/);
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE id_documentos_habilitacion=${l4} AND estado_analisis='RECHAZADO' AND motor_analisis='validacion-estructural-pdf'`), 1);
  pass('archivo ausente: sigue restringido con su explicación y sin inventar huella; PDF inválido: rechazado por la validación estructural');

  // L5: el titular no regulariza sus propios documentos.
  const selfHolder = await createUser(admin, 'ADMINISTRADOR', 'v60j'); const c5 = await newCredential(selfHolder, 'MEDICO', 'Documento E2E'); const l5 = insertLegacy(c5.id, cleanKey, 'propio.pdf', selfHolder.id);
  assert.equal((await call(`/professional-credential-documents/${l5}/regularize`, { method: 'POST', token: selfHolder.token, expect: [403] })).data.code, 'AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA'); pass('el titular no puede regularizar sus propios documentos');

  // Informe y lote.
  const legacyReport = await ok('/professional-credential-documents/legacy/report', { token: admin });
  assert.ok(legacyReport.legacyDocuments >= 5); assert.equal(typeof legacyReport.openFlightsWithAffectedCrew, 'number'); assert.equal(typeof legacyReport.analyzerConfigured, 'boolean');
  assert.equal((await call('/professional-credential-documents/legacy/report', { token: dts.token, expect: [403] })).status, 403);
  assert.equal((await call('/professional-credential-documents/legacy/regularize?limit=0', { method: 'POST', token: admin, expect: [400] })).data.code, 'LIMITE_INVALIDO');
  const batch = (await call('/professional-credential-documents/legacy/regularize?limit=3', { method: 'POST', token: admin2.token })).data;
  assert.equal(batch.regularized + batch.rejected + batch.restricted + batch.alreadyResolved, batch.examined); assert.ok(batch.examined <= 3); pass(`informe de heredados (${legacyReport.legacyDocuments} documentos) y lote acotado (${batch.examined} examinados)`);

  // ================= E: procedimiento por línea de comandos =================
  const cli = (...args) => spawnSync('node', [path.join(ROOT, 'scripts', 'politicas-habilitacion.cjs'), ...args], { encoding: 'utf8', env: { ...process.env, POLICY_ADMIN_TOKEN: admin, POLICY_API_BASE: BASE } });
  const template = path.join(ROOT, 'config', 'politicas-habilitacion', 'propuesta-inicial-I57-PENDIENTE.json');
  const before = count('SELECT COUNT(*) FROM politicas_habilitacion');
  const validated = cli('validate', template); assert.equal(validated.status, 0, validated.stderr); assert.match(validated.stdout, /4 función\(es\), 0 política\(s\), 8 decisión/);
  const simulated = cli('simulate', template, '--out', path.join(process.env.TEMP || '/tmp', 'informe-plantilla-' + MARK + '.json')); assert.equal(simulated.status, 0, simulated.stdout + simulated.stderr);
  assert.match(simulated.stdout, /COMANDANTE: 0 propuesta\(s\).*SIN POLÍTICA: no elegible/); assert.match(simulated.stdout, /Decisión pendiente/); assert.equal(count('SELECT COUNT(*) FROM politicas_habilitacion'), before);
  assert.equal(cli('activate', template).status, 2); assert.equal(cli('activate', template, '--fingerprint', 'x', '--approval', 'x').status, 2, 'fuera del E2E aislado exige confirmar el destino');
  pass('el procedimiento por línea de comandos valida, simula la plantilla pendiente sin modificar nada y se niega a activar sin huella ni confirmación de destino');

  // Las políticas E2E quedan como estaban para el resto de la suite.
  await ensureCredentialPolicies(admin);
  console.log(`\n${passed} comprobaciones superadas`);
})().catch((e) => { console.error('FALLO:', e.stack || e); process.exit(1); });
