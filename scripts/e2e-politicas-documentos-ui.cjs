/* I-5.7: recorrido de navegador (Chrome + Playwright) de la carga/simulación/activación de la política, la regularización de un documento anterior a V59 y la
 * lista de preparación, sobre el stack aislado :18081 / :18080 con ClamAV real y verificación en SQL Server. Requiere `playwright` en NODE_PATH (ruta absoluta).
 *  1) Administración → Habilitaciones: lista de preparación visible; carga de una propuesta, simulación (huella, advertencias, impacto), la activación sigue bloqueada
 *     sin referencia de aprobación y tras editar el texto; activación con aprobación (lote persistido en SQL Server); restauración por la misma pantalla.
 *  2) Un documento heredado se muestra restringido con su explicación, sin descarga; «Regularizar» lo analiza con ClamAV real, conserva su origen y rotula la huella. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, sql, one, count, call, ok, createUser, waitHealthy, makePdf, ensureCredentialPolicies } = require('./e2e-cierre-support.cjs');

const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 60);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adminId = (await ok('/auth/me', { token: admin })).id;
  assert.equal((await ok('/professional-credential-documents/antimalware-status', { token: admin })).configured, true, 'Se requiere el analizador ClamAV real (perfil antimalware)');
  await ensureCredentialPolicies(admin);
  const holder = await createUser(admin, 'DTS', 'pdh');
  const FIXTURE_TYPE = 'TIPO FICTICIO UI ' + MARK;
  const snapshot = (await ok('/credential-policies', { token: admin })).filter((p) => p.active && p.roleCode === 'ENFERMERO')
    .map((p) => ({ roleCode: p.roleCode, flightTypeCode: p.flightTypeCode, aircraftCategory: p.aircraftCategory, credentialType: p.credentialType, requiresJurisdiction: p.requiresJurisdiction, requiresExternalCheck: p.requiresExternalCheck, origin: p.origin, sourceReference: p.sourceReference, notes: p.notes }));
  assert.ok(snapshot.length > 0);
  const fixtureJson = JSON.stringify({ name: 'UI ' + MARK, roles: ['ENFERMERO'], policies: [{ roleCode: 'ENFERMERO', credentialType: FIXTURE_TYPE, flightTypeCode: 'SANITARIO', requiresJurisdiction: true, notes: 'Fixture UI' }], pendingDecisions: [{ roleCode: 'ENFERMERO', topic: 'Matrícula suficiente', question: 'Pendiente de decisión de negocio' }] });
  const restoreJson = JSON.stringify({ name: 'restauración UI', roles: ['ENFERMERO'], policies: snapshot, pendingDecisions: [] });

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); page.on('dialog', (d) => d.accept()); page.setDefaultTimeout(120000);
    await page.goto(UI); await page.getByLabel('Usuario', { exact: true }).fill(dotenv.BOOTSTRAP_ADMIN_USERNAME); await page.getByLabel('Contraseña', { exact: true }).fill(dotenv.BOOTSTRAP_ADMIN_PASSWORD);
    const r = page.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await page.getByRole('button', { name: 'Iniciar sesión' }).click(); assert.ok((await r).ok());
    await page.locator('nav a', { hasText: /^Habilitaciones$/ }).click();
    await page.getByRole('heading', { name: 'Política de suficiencia de habilitaciones' }).waitFor();

    // ---- 1) Lista de preparación ----
    await page.getByRole('heading', { name: /Preparación para operar \(pruebas\)/ }).waitFor();
    await page.getByText(/Servidor de correo saliente:/).waitFor(); await page.getByText(/Avisos de vencimiento de habilitaciones.*Propuesta sin aprobar/).waitFor();
    pass('UI-1 la lista de preparación muestra el entorno, los pendientes y marca los plazos de aviso como «Propuesta sin aprobar»');

    // ---- 2) Simulación y activación aprobada ----
    const activate = page.getByRole('button', { name: 'Activar política aprobada' });
    await page.getByLabel('Propuesta de políticas (JSON)').fill('{no es json');
    await page.getByRole('button', { name: 'Validar y simular' }).click(); await page.getByText('El contenido no es un JSON válido').waitFor();
    await page.getByLabel('Propuesta de políticas (JSON)').fill(fixtureJson);
    const simulation = page.waitForResponse((x) => x.url().endsWith('/api/credential-policies/simulation')); await page.getByRole('button', { name: 'Validar y simular' }).click(); const sim = await (await simulation).json();
    await page.getByText(sim.fingerprint).waitFor(); await page.getByText(/Decisión pendiente \(ENFERMERO\)/).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion WHERE tipo_habilitacion=N'${FIXTURE_TYPE}'`), 0, 'simular no escribe');
    await activate.waitFor(); assert.equal(await activate.isDisabled(), true, 'sin referencia de aprobación no se activa');
    await page.getByLabel(/Referencia de la aprobación/).fill('Acta UI ' + MARK);
    const ack = page.getByLabel(/Reconozco que/); if (await ack.count()) await ack.check();
    assert.equal(await activate.isDisabled(), false);
    await page.getByLabel('Propuesta de políticas (JSON)').fill(fixtureJson + ' ');
    await page.getByText(/el texto cambió después de simular/).waitFor(); assert.equal(await activate.isDisabled(), true, 'editar después de simular invalida la aprobación');
    await page.getByLabel('Propuesta de políticas (JSON)').fill(fixtureJson);
    await page.getByRole('button', { name: 'Validar y simular' }).click(); await page.getByText(sim.fingerprint).waitFor();
    await page.getByLabel(/Referencia de la aprobación/).fill('Acta UI ' + MARK); const ack2 = page.getByLabel(/Reconozco que/); if (await ack2.count()) await ack2.check();
    await activate.click(); await page.getByText(/Política activada: 1 alta\(s\)/).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion WHERE tipo_habilitacion=N'${FIXTURE_TYPE}' AND activa=1 AND referencia_aprobacion=N'Acta UI ${MARK}' AND lote_activacion IS NOT NULL`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'CREDENTIAL_POLICY_BATCH' AND operacion=N'ACTIVATE' AND valores_nuevos LIKE N'%Acta UI ${MARK}%'`), 1);
    await page.getByText(new RegExp(FIXTURE_TYPE)).first().waitFor();
    pass('UI-2 simular no escribe; la activación exige la referencia (y el reconocimiento si corresponde), se invalida al editar el texto y, aprobada, persiste el lote con su auditoría');
    // Restauración por la misma pantalla (deja el E2E como estaba).
    await page.getByLabel('Propuesta de políticas (JSON)').fill(restoreJson); await page.getByRole('button', { name: 'Validar y simular' }).click();
    await page.getByLabel(/Referencia de la aprobación/).fill('Restauración UI ' + MARK); const ack3 = page.getByLabel(/Reconozco que/); if (await ack3.count()) await ack3.check();
    await page.getByRole('button', { name: 'Activar política aprobada' }).click(); await page.getByText(/Política activada/).first().waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion p JOIN roles_tripulacion r ON r.id_roles_tripulacion=p.id_roles_tripulacion WHERE r.codigo_rol_tripulacion='ENFERMERO' AND p.activa=1 AND p.tipo_habilitacion=N'${FIXTURE_TYPE}'`), 0);
    assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion p JOIN roles_tripulacion r ON r.id_roles_tripulacion=p.id_roles_tripulacion WHERE r.codigo_rol_tripulacion='ENFERMERO' AND p.activa=1`), snapshot.length);
    pass('UI-3 la política E2E original se restauró desde la propia interfaz');

    // ---- 3) Documento heredado ----
    const credential = await ok(`/users/${holder.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'MEDICO', type: 'Documento E2E', number: 'UI-' + MARK, issuer: 'Colegio', issued: '2025-01-01', expires: '2031-01-01', notes: 'I-5.7 UI' } });
    const carrier = await ok(`/users/${holder.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'MEDICO', type: 'Documento E2E', number: 'UIC-' + MARK, issuer: 'Colegio', issued: '2025-01-01', expires: '2031-01-01', notes: 'portadora' } });
    const bytes = makePdf('ui-heredado-' + MARK); const form = new FormData(); form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'portadora.pdf');
    assert.equal((await fetch(`${process.env.E2E_BASE || 'http://127.0.0.1:18080/api'}/professional-credentials/${carrier.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form })).status, 200);
    const key = one(`SELECT TOP 1 clave_archivo FROM documentos_habilitacion WHERE id_habilitaciones_profesionales=${carrier.id}`);
    sql(`INSERT INTO documentos_habilitacion(id_habilitaciones_profesionales,clave_archivo,nombre_archivo,id_usuario_cargador,fecha_carga,proposito,numero_version,estado_analisis,detalle_analisis,origen_registro) VALUES (${credential.id},N'${key}',N'heredado-ui.pdf',${adminId},SYSUTCDATETIME(),'EVIDENCIA',1,'LEGADO_SIN_ANALISIS',N'Cargado antes de V59 sin hash ni análisis antimalware','ANTERIOR_V59')`);
    await page.reload(); await page.locator('nav a', { hasText: /^Habilitaciones$/ }).click(); await page.getByRole('heading', { name: /Documentos anteriores a V59/ }).waitFor();
    await page.getByText(/documento\(s\) heredado\(s\)/).waitFor();
    await page.locator('nav a', { hasText: /^Usuarios$/ }).first().click();
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Clasificación administrativa de tripulación' }) });
    await section.getByLabel('Buscar usuario').fill(holder.name);
    await section.locator('label').filter({ hasText: /^Usuario/ }).locator('select').selectOption(String(holder.id), { timeout: 30000 });
    const panel = section.locator('div.credentials');
    await panel.getByRole('button', { name: new RegExp('UI-' + MARK) }).click();
    await panel.getByText('Documento anterior a V59', { exact: true }).waitFor(); await panel.getByText(/Restringido: Documento anterior a V59/).waitFor();
    await panel.getByText(/sin huella \(anterior a V59\)/).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Descargar heredado-ui.pdf' }).count(), 0, 'un heredado sin analizar no ofrece descarga');
    await panel.getByRole('button', { name: 'Regularizar (huella y análisis)' }).click();
    await page.getByText('Documento regularizado y analizado').waitFor();
    await panel.getByRole('button', { name: 'Descargar heredado-ui.pdf' }).waitFor();
    await panel.getByText(/calculada en la regularización \(no prueba integridad desde la carga original\)/).waitFor();
    await panel.getByText('Documento anterior a V59', { exact: true }).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM documentos_habilitacion WHERE id_habilitaciones_profesionales=${credential.id} AND estado_analisis='LIMPIO' AND origen_registro='ANTERIOR_V59' AND hash_momento='REGULARIZACION' AND motor_analisis='clamd'`), 1);
    pass('UI-4 el documento heredado se ve restringido y sin descarga; «Regularizar» lo analiza con ClamAV real, conserva su origen anterior a V59 y rotula la huella');
    console.log(`\n${passed} comprobaciones de navegador aprobadas (e2e-politicas-documentos-ui)`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
