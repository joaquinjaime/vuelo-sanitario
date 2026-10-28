/* Prueba funcional del backend V60 sobre la RESTAURACIÓN MIGRADA (V47 -> V60; I-5.7: política por procedimiento aprobado y regularización de documentos heredados) de la base habitual, en `vuelos_sanitarios_ensayo_v47` de la instancia E2E.
 * Usa los datos sembrados con el contrato V47 (ENSAYO_STATE) y comprueba que lo existente sigue funcionando y que las rutas históricas no se
 * aprueban solas: consulta de vuelos y rutas anteriores, presentación, aprobación, devolución, nueva versión, invalidación, rechazo del inicio
 * sin aprobación, inicio correcto, vuelos sanitarios y operativos, habilitaciones, verificación de correo (I-2b), tripulación (I-3), documentos,
 * auditoría y finalización. Variables: E2E_BASE (:18090), E2E_DB_NAME, E2E_SQL_CONTAINER, E2E_FIXED_MARK y E2E_FIXED_PASSWORD. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, MARK, PASSWORD, PDF, DB_NAME, sql, one, count, call, ok, fmt, futureSlot, confirmEmail, waitHealthy, ensureCredentialPolicies, E2E_CREDENTIAL_TYPES } = require('./e2e-cierre-support.cjs');

assert.equal(DB_NAME, 'vuelos_sanitarios_ensayo_v47');
assert.ok(process.env.E2E_BASE && process.env.E2E_BASE.includes(':18090'));
const state = JSON.parse(fs.readFileSync(process.env.ENSAYO_STATE, 'utf8'));
assert.equal(state.mark, MARK); assert.equal(state.password, PASSWORD);
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const row = (q) => one(q).split('|').map((x) => x.trim());
const routeRow = (id, version) => row(`SELECT estado_revision, ISNULL(CAST(id_usuario_presenta AS varchar),''), ISNULL(CAST(id_usuario_revisor AS varchar),''), es_version_actual, ISNULL(recorrido_planificado,'<NULL>'), ISNULL(contexto_operativo,'<NULL>') FROM rutas_vuelo WHERE id_vuelos=${id} AND version=${version}`);
const auditCount = (id, entity, op) => count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${id} AND tipo_entidad=N'${entity}' AND operacion=N'${op}'`);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

(async () => {
  assert.equal(Number(one("SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL")), 60);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const login = async (username, password) => { const token = (await ok('/auth/login', { method: 'POST', body: { username, password } })).accessToken; return { name: username, token, id: (await ok('/auth/me', { token })).id }; };
  const admin = (await login(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD)).token;
  // V59/V60: los datos migrados no traen política; sin ella nadie es elegible. Se carga por el PROCEDIMIENTO APROBADO (simular → aprobar → activar), no por altas sueltas.
  assert.equal(count('SELECT COUNT(*) FROM politicas_habilitacion'), 0, 'la migración no siembra ninguna política');
  assert.equal((await ok('/credential-policies', { token: admin })).length, 0);
  const readyBefore = await ok('/admin/readiness', { token: admin });
  assert.equal(readyBefore.readyForOperation, false); assert.deepEqual(readyBefore.pendingMandatory.filter((k) => k.startsWith('POLITICA_')).sort(), ['POLITICA_COMANDANTE', 'POLITICA_COPILOTO', 'POLITICA_ENFERMERO', 'POLITICA_MEDICO']);
  const proposal = { name: 'Política de ensayo (tipos ficticios del E2E)', roles: ['COMANDANTE', 'COPILOTO', 'MEDICO', 'ENFERMERO'], pendingDecisions: [],
    policies: ['COMANDANTE', 'COPILOTO', 'MEDICO', 'ENFERMERO'].flatMap((roleCode) => E2E_CREDENTIAL_TYPES.map((credentialType) => ({ roleCode, credentialType, notes: 'Política mínima de las pruebas E2E aisladas' }))) };
  const sim = (await call('/credential-policies/simulation', { method: 'POST', token: admin, body: proposal })).data;
  console.log('SIMULACIÓN sobre la copia migrada:', JSON.stringify({ puedeActivarse: sim.canActivate, vuelosAbiertosExaminados: sim.flightsExamined, integrantesQueDejanDeSerElegibles: sim.newIncompatibilities, integrantesQuePasanAElegibles: sim.resolvedIncompatibilities, personas: sim.people.map((p) => [p.roleCode, 'a elegibles ' + p.becomeEligible, 'a no elegibles ' + p.becomeIneligible, 'siguen elegibles ' + p.stayEligible, 'siguen no elegibles ' + p.stayIneligible, p.codesAfter]) }));
  assert.equal(sim.canActivate, true); assert.equal(sim.newIncompatibilities, 0, 'activar no deja a nadie fuera'); assert.ok(sim.flightsExamined >= 1);
  const commanders = sim.people.find((p) => p.roleCode === 'COMANDANTE'); assert.equal(commanders.becomeEligible, 8, 'los 8 comandantes con habilitación verificada pasarían a ser elegibles'); assert.equal(commanders.becomeIneligible, 0);
  assert.ok(sim.resolvedIncompatibilities >= 1, 'hay integrantes de vuelos abiertos hoy no elegibles (sin política) que pasarían a serlo');
  const activated = (await call('/credential-policies/activation', { method: 'POST', token: admin, body: { proposal, approvedFingerprint: sim.fingerprint, approvalReference: 'Ensayo de migración V47→V60 (aprobación simulada, sin valor normativo)', acknowledgeIncompatibilities: false } })).data;
  assert.equal(activated.created, 16); assert.equal(activated.retired, 0);
  const readyAfter = await ok('/admin/readiness', { token: admin }); assert.deepEqual(readyAfter.pendingMandatory.filter((k) => k.startsWith('POLITICA_')), []);
  await ensureCredentialPolicies(admin);
  pass('política: la migración no siembra nada y las cuatro funciones quedan pendientes; se simula sobre los datos migrados, se aprueba la huella y se activa el lote (16 políticas) con la lista de preparación en verde');
  const ops = await login(state.users.ops, PASSWORD), ops2 = await login(state.users.ops2, PASSWORD), dts = await login(state.users.dts, PASSWORD);
  const cmd = {}; for (const [k, name] of Object.entries(state.users.commanders)) cmd[k] = await login(name, PASSWORD);
  const F = Object.fromEntries(Object.entries(state.flights).map(([k, v]) => [k.split('_')[0], v.id]));
  const cmdOf = (key) => cmd[state.flights[Object.keys(state.flights).find((k) => k.startsWith(key + '_'))].commander.replace(/^.*?(c\d)$/, '$1')];
  const route = (id, t = ops.token) => ok(`/flights/${id}/route`, { token: t });
  const decide = (id, t, kind, body, expect = [200]) => call(`/flights/${id}/route/${kind}`, { method: 'POST', token: t, body, expect });
  const put = (id, t, body, expect = [200]) => call(`/flights/${id}/route`, { method: 'PUT', token: t, body, expect });
  const start = (id, expect = [200]) => call(`/flights/${id}/start`, { method: 'POST', token: ops.token, expect });
  pass('el backend V59 arranca sobre la restauración migrada (ddl validate, Flyway sin pendientes) y los usuarios, roles y la contraseña administrativa originales autentican');

  // ---- V60: documentos anteriores a V59 (los 8 de las credenciales verificadas de los comandantes sembrados con el contrato V47) ----
  assert.equal(count("SELECT COUNT(*) FROM documentos_habilitacion WHERE origen_registro='ANTERIOR_V59' AND estado_analisis='LEGADO_SIN_ANALISIS' AND hash_sha256 IS NULL AND hash_momento IS NULL"), 8);
  assert.equal(count("SELECT COUNT(*) FROM documentos_habilitacion"), 8); assert.equal(count("SELECT COUNT(*) FROM habilitaciones_profesionales WHERE estado_verificacion='VERIFICADA'"), 8);
  const legacyReport = await ok('/professional-credential-documents/legacy/report', { token: admin });
  console.log('INFORME de heredados antes de regularizar:', JSON.stringify({ documentos: legacyReport.legacyDocuments, sinHuella: legacyReport.withoutFingerprint, pendientes: legacyReport.pendingActive, archivosAusentes: legacyReport.missingFiles, habilitacionesSostenidasSoloPorHeredados: legacyReport.verifiedCredentialsSupportedOnlyByLegacy, vuelosAbiertosConTripulantesAfectados: legacyReport.openFlightsWithAffectedCrew }));
  assert.equal(legacyReport.legacyDocuments, 8); assert.equal(legacyReport.withoutFingerprint, 8); assert.equal(legacyReport.pendingActive, 8); assert.equal(legacyReport.missingFiles, 0); assert.equal(legacyReport.analyzerConfigured, true);
  assert.equal(legacyReport.verifiedCredentialsSupportedOnlyByLegacy, 8); assert.ok(legacyReport.openFlightsWithAffectedCrew >= 1);
  const legacyIds = sql("SELECT id_documentos_habilitacion FROM documentos_habilitacion WHERE origen_registro='ANTERIOR_V59' ORDER BY 1").split(/\r?\n/).map(Number);
  assert.equal((await call(`/professional-credential-documents/${legacyIds[0]}`, { token: admin, expect: [409] })).data.code, 'DOCUMENTO_NO_DISPONIBLE', 'un documento heredado sin analizar no se descarga');
  const credentialOfDoc = one(`SELECT id_habilitaciones_profesionales FROM documentos_habilitacion WHERE id_documentos_habilitacion=${legacyIds[0]}`);
  const beforeView = await ok(`/professional-credentials/${credentialOfDoc}`, { token: admin });
  assert.equal(beforeView.status, 'VERIFICADA'); assert.equal(beforeView.documentStatus, 'LEGADO_SIN_ANALISIS'); assert.equal(beforeView.eligibility.eligible, true, 'la verificación humana previa se mantiene: el sustento documental figura pendiente');
  assert.match(beforeView.documents[0].restriction, /V59/);
  const batch = (await call('/professional-credential-documents/legacy/regularize?limit=50', { method: 'POST', token: admin })).data;
  assert.deepEqual([batch.examined, batch.regularized, batch.rejected, batch.restricted, batch.alreadyResolved], [8, 8, 0, 0, 0]);
  assert.equal(count("SELECT COUNT(*) FROM documentos_habilitacion WHERE origen_registro='ANTERIOR_V59' AND estado_analisis='LIMPIO' AND hash_momento='REGULARIZACION' AND id_usuario_regularizacion IS NOT NULL AND motor_analisis='clamd'"), 8);
  assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE hash_sha256='${sha256(PDF)}'`), 8, 'la huella calculada es el SHA-256 del archivo original sembrado');
  const downloaded = await fetch(`${process.env.E2E_BASE}/professional-credential-documents/${legacyIds[0]}`, { headers: { Authorization: 'Bearer ' + admin } }); assert.equal(downloaded.status, 200);
  assert.equal(sha256(Buffer.from(await downloaded.arrayBuffer())), sha256(PDF), 'el archivo original se conserva intacto y se descarga idéntico');
  const legacyAfter = await ok('/professional-credential-documents/legacy/report', { token: admin });
  assert.equal(legacyAfter.pendingActive, 0); assert.equal(legacyAfter.verifiedCredentialsSupportedOnlyByLegacy, 0); assert.equal(legacyAfter.legacyDocuments, 8, 'siguen figurando como anteriores a V59');
  assert.equal(count("SELECT COUNT(*) FROM habilitaciones_profesionales WHERE estado_verificacion='VERIFICADA'"), 8, 'ninguna habilitación cambió de estado');
  pass('documentos heredados: los 8 quedan restringidos y sin huella; el informe lista habilitaciones y vuelos afectados; con ClamAV real se regularizan los 8 (huella SHA-256 rotulada «REGULARIZACION», origen anterior a V59 conservado, archivo idéntico) sin cambiar ninguna habilitación');

  // ---- 1-3: vuelos históricos, detalle y rutas anteriores ----
  const list = await ok('/flights', { token: ops.token }); assert.equal(list.length, 10);
  for (const [k, v] of Object.entries(state.flights)) { const d = await ok(`/flights/${v.id}`, { token: ops.token }); assert.ok(d && (d.vuelo || d.id), 'detalle ' + k); await ok(`/audit/flights/${v.id}`, { token: ops.token }); }
  const expected = { P1: ['BORRADOR', 2], P2: ['SIN_PLANIFICAR', 0], P3: ['BORRADOR', 1], P4: ['BORRADOR', 1], P5: ['BORRADOR', 1], E1: ['SIN_REVISION', 1], E2: ['SIN_REVISION', 1], F1: ['SIN_REVISION', 1], X1: ['SIN_REVISION', 1] };
  for (const [k, [estado, versions]] of Object.entries(expected)) {
    const r = await route(F[k]); assert.equal(r.estado, estado, k); assert.equal(r.versiones.length, versions, k);
    if (['E1', 'E2', 'F1', 'X1'].includes(k)) assert.equal(r.inicio.aplica, false, k + ': la condición de ruta no aplica a un vuelo ya iniciado, finalizado o cancelado');
  }
  const p1 = await route(F.P1); assert.deepEqual(p1.versiones.map((v) => v.estado), ['BORRADOR', 'SIN_REVISION']); assert.equal(p1.versiones[1].recorrido, 'TUC - COR - AEP'); assert.equal(Number(p1.versiones[1].altitudPies), 9000);
  const p5 = await route(F.P5); assert.equal(p5.versiones[0].recorrido, null); assert.equal(p5.versiones[0].condiciones, null, 'la ruta sin contexto se lee sin errores');
  const statuses = await ok('/flights/route-statuses', { token: ops.token }); assert.equal(statuses.length, 10); assert.ok(statuses.every((s) => !['APROBADA', 'PENDIENTE_REVISION', 'DEVUELTA'].includes(s.estado)), 'ninguna ruta histórica figura aprobada, pendiente o devuelta');
  assert.equal(count("SELECT COUNT(*) FROM rutas_vuelo WHERE estado_revision IN ('APROBADA','DEVUELTA','PENDIENTE_REVISION')"), 0);
  pass('10 vuelos históricos: listado, detalle, auditoría y rutas anteriores (incluida una sin contexto ni recorrido) se leen sin errores; ninguna ruta histórica quedó aprobada, pendiente o devuelta');

  // ---- 9: rechazo del inicio sin aprobación (auditado) ----
  for (const [k, code] of [['P1', 'RUTA_NO_PRESENTADA'], ['P2', 'RUTA_NO_DEFINIDA'], ['P3', 'RUTA_NO_PRESENTADA'], ['P4', 'RUTA_NO_PRESENTADA'], ['P5', 'RUTA_NO_PRESENTADA']]) {
    const before = auditCount(F[k], 'FLIGHT_ROUTE', 'START_REJECTED'); const r = await start(F[k], [409]); assert.equal(r.data.code, code, k);
    assert.equal(auditCount(F[k], 'FLIGHT_ROUTE', 'START_REJECTED'), before + 1, k + ': un solo evento por intento rechazado'); assert.equal(stateOf(F[k]), 'PLANIFICADO');
  }
  pass('el inicio sin ruta aprobada se rechaza en los 5 vuelos planificados, con un evento de auditoría persistido por intento y el vuelo sin cambios');

  // ---- 4-5: presentar y aprobar una ruta existente (P1, operativo) ----
  await decide(F.P1, cmdOf('P1').token, 'submit', { version: 2 }); assert.equal((await route(F.P1)).estado, 'PENDIENTE_REVISION');
  await decide(F.P1, cmd.c2.token, 'submit', { version: 2 }, [403]);
  await decide(F.P1, ops2.token, 'approve', { version: 2, comentario: 'Conforme (ensayo)' });
  assert.deepEqual([routeRow(F.P1, 2)[0], routeRow(F.P1, 2)[2]], ['APROBADA', String(ops2.id)]); assert.equal(routeRow(F.P1, 1)[0], 'SIN_REVISION');
  // ---- 8: invalidación por cambio material, y 10: inicio correcto tras regularizar ----
  const spare = await ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'X').toUpperCase(), modelo: 'ENSAYO', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: Number(one(`SELECT id_aeropuerto_origen FROM vuelos WHERE id_vuelos=${F.P1}`)), activo: true } });
  await call(`/flights/${F.P1}/aircraft`, { method: 'POST', token: ops.token, body: { aircraftId: spare.id, motivo: 'Cambio de aeronave del ensayo' } });
  assert.equal((await route(F.P1)).estado, 'REQUIERE_REVISION'); assert.equal(auditCount(F.P1, 'FLIGHT_ROUTE', 'INVALIDATE'), 1);
  assert.equal((await start(F.P1, [409])).data.code, 'RUTA_REQUIERE_REVISION');
  await put(F.P1, cmdOf('P1').token, { version: 2, recorrido: 'TUC - COR - AEP (v2)', alternativoId: null, motivoModificacion: 'Reconfirmo con la nueva aeronave', presentar: true });
  await decide(F.P1, ops.token, 'approve', { version: 3 });
  await start(F.P1); assert.equal(stateOf(F.P1), 'EN_CURSO');
  assert.deepEqual([routeRow(F.P1, 3)[0], routeRow(F.P1, 2)[0]], ['APROBADA', 'REQUIERE_REVISION']);
  pass('operativo P1: presentación de la ruta existente, aprobación del CO, invalidación por cambio de aeronave, inicio rechazado, regularización y aprobación nueva, e inicio correcto con las habilitaciones sembradas en V47');

  // ---- 6-7: devolución y nueva versión sobre la ruta histórica sin contexto (P5) ----
  const e5 = await decide(F.P5, cmdOf('P5').token, 'submit', { version: 1 }, [409]); assert.equal(e5.data.code, 'RUTA_REQUIERE_REVISION', 'la ruta histórica sin contexto no puede presentarse tal cual');
  await put(F.P5, cmdOf('P5').token, { version: 1, recorrido: 'Ruta actualizada del vuelo P5', presentar: true });
  assert.deepEqual(routeRow(F.P5, 1).slice(0, 1).concat(routeRow(F.P5, 1).slice(4)), ['SIN_REVISION', '<NULL>', '<NULL>'], 'la versión histórica conserva sus datos (sin recorrido ni contexto) y sólo cambia su estado de revisión');
  await decide(F.P5, ops.token, 'return', { version: 2, motivo: 'Falta indicar el aeropuerto alternativo' });
  assert.equal((await route(F.P5)).estado, 'DEVUELTA'); assert.equal(stateOf(F.P5), 'PLANIFICADO');
  assert.equal((await put(F.P5, cmdOf('P5').token, { version: 2, recorrido: 'Ruta actualizada del vuelo P5', alternativoId: null }, [400])).data.code, 'MOTIVO_MODIFICACION_REQUERIDO');
  await put(F.P5, cmdOf('P5').token, { version: 2, recorrido: 'Ruta corregida del vuelo P5', motivoModificacion: 'Se incorpora la corrección pedida', presentar: true });
  await decide(F.P5, ops.token, 'approve', { version: 3 });
  assert.deepEqual([1, 2, 3].map((v) => routeRow(F.P5, v)[0]), ['SIN_REVISION', 'DEVUELTA', 'APROBADA']);
  pass('ruta histórica sin contexto (P5): presentación rechazada con código, nueva versión, devolución con observaciones, corrección con motivo y aprobación; las tres versiones se conservan');

  // ---- 11: vuelos sanitarios (P3 con ruta vigente, P4 con ruta desactualizada) ----
  await decide(F.P3, cmdOf('P3').token, 'submit', { version: 1 }); await decide(F.P3, ops.token, 'approve', { version: 1 });
  const e4 = await decide(F.P4, cmdOf('P4').token, 'submit', { version: 1 }, [409]); assert.equal(e4.data.code, 'RUTA_REQUIERE_REVISION', 'la ruta sanitaria desactualizada en V47 exige guardarse de nuevo');
  await put(F.P4, cmdOf('P4').token, { version: 1, recorrido: 'Ruta sanitaria previa al cambio', presentar: true }); await decide(F.P4, ops2.token, 'approve', { version: 2 });
  await start(F.P3); await start(F.P4); assert.deepEqual([stateOf(F.P3), stateOf(F.P4)], ['EN_CURSO', 'EN_CURSO']);
  pass('sanitarios P3 y P4: ruta existente presentada y aprobada (la desactualizada exige una versión nueva) e inicio correcto');

  // ---- 12: finalización sin regresiones (vuelos iniciados antes de V55 y después) ----
  for (const k of ['E1', 'E2', 'P1', 'P3', 'P4']) { await call(`/flights/${F[k]}/log`, { method: 'POST', token: ops.token, body: { tipo: 'PREPARACION', descripcion: 'Novedad en vuelo ' + k, ocurrido: new Date(Date.now() - 30000).toISOString(), importancia: 'NORMAL' }, expect: [200, 201] }); await call(`/flights/${F[k]}/finish`, { method: 'POST', token: ops.token }); assert.equal(stateOf(F[k]), 'FINALIZADO', k); }
  assert.equal((await route(F.E2)).estado, 'SIN_REVISION', 'la finalización no tocó la ruta histórica del vuelo iniciado antes de V55');
  assert.equal(count(`SELECT COUNT(*) FROM obligaciones_informe_final WHERE id_vuelos IN (${['E1', 'E2', 'P1', 'P3', 'P4', 'F1'].map((k) => F[k]).join(',')})`), 6, 'seis obligaciones de informe final');
  const mine = await ok('/final-reports/mine', { token: cmd.c8.token }); assert.ok(Array.isArray(mine) && mine.length >= 1);
  pass('finalización: los vuelos iniciados antes de V55 (con ruta histórica o sin ruta) y los iniciados después finalizan, registran bitácora y generan su obligación de informe final');

  // ---- documentos, hangar, coordinaciones, clima, bitácora, tripulación e integridad ----
  const docs = await ok(`/flights/${F.P1}/documents`, { token: ops.token }); assert.equal(docs.length, 1);
  const versionId = docs[0].versionActual.id; const dl = await fetch(`${process.env.E2E_BASE}/document-versions/${versionId}/download`, { headers: { Authorization: 'Bearer ' + ops.token } }); assert.equal(dl.status, 200);
  assert.equal(sha256(Buffer.from(await dl.arrayBuffer())), sha256(PDF), 'el PDF sembrado en V47 se descarga idéntico tras la migración');
  assert.equal((await ok(`/flights/${F.P1}/hangar`, { token: ops.token })).versiones.length >= 1, true); assert.equal((await ok(`/flights/${F.P1}/airport-coordinations`, { token: ops.token })).versiones.length, 1);
  assert.equal((await ok(`/flights/${F.P1}/weather`, { token: ops.token })).length, 1); assert.ok((await ok(`/flights/${F.P1}/log`, { token: ops.token })));
  const crew = await ok(`/flights/${F.P1}/crew`, { token: ops.token }); assert.ok(crew.some((c) => c.comandante && c.elegibilidadCodigo !== undefined), 'tripulación con elegibilidad (I-3)');
  assert.equal(count("SELECT COUNT(*) FROM sys.triggers WHERE name=N'tr_eventos_auditoria_inmutable'"), 1); assert.equal(sql('DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS, NO_INFOMSGS').replace(/\s/g, ''), '');
  pass('documento PDF idéntico byte a byte, hangar, coordinación, clima, bitácora y tripulación con elegibilidad (I-3) legibles; auditoría inmutable y restricciones sin violaciones');

  // ---- V49/V50: duplicados dados de baja (sin borrar) y personas sin contacto principal ----
  assert.equal(count("SELECT COUNT(*) FROM correos_electronicos WHERE motivo_baja=N'DUPLICADO_MIGRACION'"), 1); assert.equal(count("SELECT COUNT(*) FROM telefonos WHERE motivo_baja=N'DUPLICADO_MIGRACION'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM correos_electronicos c WHERE motivo_baja=N'DUPLICADO_MIGRACION' AND EXISTS (SELECT 1 FROM correos_electronicos o WHERE o.id_personas=c.id_personas AND o.fecha_baja IS NULL AND o.direccion_normalizada=c.direccion_normalizada AND o.es_principal=1)"), 1, 'el duplicado se da de baja y se conserva el principal');
  assert.equal(count("SELECT COUNT(*) FROM eventos_auditoria e JOIN correos_electronicos c ON c.id_correos_electronicos=e.entidad_id WHERE e.tipo_entidad=N'PERSON_EMAIL' AND e.operacion=N'REMOVE' AND c.motivo_baja=N'DUPLICADO_MIGRACION'"), 1, 'V50 auditó la baja de migración');
  assert.equal(count("SELECT COUNT(*) FROM (SELECT id_personas FROM correos_electronicos WHERE fecha_baja IS NULL GROUP BY id_personas HAVING SUM(CAST(es_principal AS int)) <> 1) x"), 0, 'toda persona con correos vigentes tiene exactamente un principal'); assert.equal(count("SELECT COUNT(*) FROM (SELECT id_personas FROM telefonos WHERE fecha_baja IS NULL GROUP BY id_personas HAVING SUM(CAST(es_principal AS int)) <> 1) x"), 0);
  pass('V49/V50: el correo y el teléfono duplicados se dieron de baja con motivo DUPLICADO_MIGRACION (sin borrar filas), V50 los auditó y las personas sin principal recibieron uno');

  // ---- I-2b: correos y teléfonos existentes ----
  const u = cmd.c1; const me = await ok('/auth/me', { token: u.token }); const emails = me.correos; assert.ok(emails.length >= 1);
  assert.ok(emails.every((e) => e.verificacion === 'SIN_VERIFICAR'), 'los correos anteriores a V54 quedan sin verificar: nadie demostró recibir mensajes');
  const address = emails[0].valor; const confirmed = await confirmEmail(u, emails[0].id, address); assert.equal(confirmed.status, 200);
  assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos=${emails[0].id} AND fecha_verificacion IS NOT NULL`), 1);
  assert.equal((await ok('/auth/me', { token: u.token })).correos[0].verificacion, 'VERIFICADO'); assert.ok(me.telefonos.length >= 1, 'los teléfonos anteriores se siguen leyendo');
  pass('I-2b: los correos creados con V47 quedan sin verificar, el titular recibe y confirma un código y el correo pasa a verificado; los teléfonos anteriores se siguen leyendo');

  console.log(`\n${passed} bloques verificados sobre la restauración V60`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
