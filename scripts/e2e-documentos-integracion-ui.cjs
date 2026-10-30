/* E2E de navegador real (Chrome + Playwright) de la gestión documental dentro del detalle del vuelo, sobre el stack aislado
 * :18081 / :18080 (base vuelos_sanitarios_e2e). Operaciones, comandante y DTS trabajan con archivos PDF reales: alta con selector
 * del catálogo, bloqueo, nueva versión, historial, descarga con comprobación de bytes, conflicto entre dos usuarios, vencimiento
 * del lease (reloj ajustable), sólo consulta para el DTS y para el vuelo finalizado, y persistencia tras recargar.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, MARK, PASSWORD, PDF, BACKEND, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, approveRoute } = require('./e2e-cierre-support.cjs');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pdfWith = (extra) => Buffer.from(PDF.toString('latin1').replace('startxref', extra + '\nstartxref'), 'latin1');
const storedSha = (key) => spawnSync('docker', ['exec', BACKEND, 'sha256sum', '/data/documents/' + key], { encoding: 'utf8' }).stdout.split(/\s+/)[0];

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 51); await waitHealthy();
  const info = JSON.parse(spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  const LEASE = Number(env.DOCUMENT_LOCK_SECONDS || 300); assert.ok(LEASE >= 60 && env.APP_E2E_CONTROLS_ENABLED === 'true');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const clock = { get: async () => ok('/e2e/clock', { token: admin }), set: async (ms) => ok('/e2e/clock', { method: 'PUT', token: admin, body: { instant: new Date(ms).toISOString() } }), reset: async () => ok('/e2e/clock', { method: 'PUT', token: admin, body: { reset: true } }) };
  await clock.reset();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-docs-ui-'));
  const file = (name, bytes) => { const p = path.join(tmp, name); fs.writeFileSync(p, bytes); return p; };

  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'uops'), ops2 = await createUser(admin, 'OPERACIONES', 'uops2');
  const dts = await createUser(admin, 'DTS', 'udts');
  const cmdA = await createUser(admin, 'COMANDANTE', 'ucmda'), cmdB = await createUser(admin, 'COMANDANTE', 'ucmdb');
  for (const c of [cmdA, cmdB]) await provision(admin, c);
  let province, airports, localities;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) {
    airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: ops.token });
    if (airports.length >= 2 && localities.length >= 2) { province = p; break; }
  }
  for (const c of [cmdA, cmdB]) await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  let seq = 0; const plane = async () => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'G' + (++seq)).toUpperCase(), modelo: 'UI', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const stateOf = (id) => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'DocumentosUI', apellido: MARK } });
  const whenS = futureSlot(), planeS = await plane();
  const S = (await ok('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: localities[0].id, localidadDestinoId: localities[1].id, priorityCode: priority, motivoVuelo: 'Documentos UI ' + MARK, fechaSolicitada: fmt(whenS), extremaUrgencia: false, medical: { diagnostico: 'Prueba', condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).id;
  await call(`/flights/${S}/schedule/accept`, { method: 'POST', token: ops.token });
  await call(`/flights/${S}/resources`, { method: 'POST', token: ops.token, body: { aircraftId: planeS.id, comandanteId: cmdA.id } });
  await call(`/flights/${S}/operational-planning`, { method: 'POST', token: cmdA.token, body: { origenId: airports[0].id, destinoId: airports[1].id, llegada: fmt(new Date(whenS.getTime() + 7200000)) } });
  const whenO = futureSlot(), planeO = await plane();
  const O = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'Documentos UI ' + MARK, aircraftId: planeO.id, comandanteId: cmdB.id, destinoId: airports[1].id, salida: fmt(whenO), llegada: fmt(new Date(whenO.getTime() + 7200000)) } })).id;
  await call(`/flights/${O}/commander-assignment/response`, { method: 'POST', token: cmdB.token, body: { aceptar: true } });
  assert.equal(stateOf(S), 'PLANIFICADO'); assert.equal(stateOf(O), 'PLANIFICADO');
  pass('fixtures: Operaciones (2), DTS, dos comandantes, un vuelo sanitario y uno operativo planificados');

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const login = async (name) => { const ctx = await browser.newContext({ acceptDownloads: true }); const p = await ctx.newPage(); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); return p; };
    const open = async (p, heading, id) => { const card = p.getByRole('heading', { name: heading, exact: true }).locator('..'); await card.locator('select').first().selectOption(String(id), { timeout: 90000 }); const docs = card.getByRole('heading', { name: 'Documentos del vuelo' }).locator('..'); await docs.waitFor(); return docs; };
    const typeOptions = async (d) => { await d.getByRole('option', { name: 'Seleccionar', exact: true }).waitFor({ state: 'attached' }); return d.locator('label', { hasText: 'Tipo documental' }).locator('select').first().locator('option').allTextContents(); };
    const field = (docs, label, control) => docs.locator('label', { hasText: label }).locator(control).first();
    const downloaded = async (p, docs, n) => { const [d] = await Promise.all([p.waitForEvent('download'), docs.getByRole('button', { name: `Descargar versión ${n}` }).click()]); const target = path.join(tmp, `dl-${Date.now()}-${n}.pdf`); await d.saveAs(target); return { bytes: fs.readFileSync(target), name: d.suggestedFilename() }; };
    const versionsSql = (itemId) => sql(`SELECT numero_version, es_version_actual, ubicacion_almacenamiento FROM versiones_documento_vuelo WHERE id_documentos_vuelo=${itemId} ORDER BY numero_version`).split(/\r?\n/).filter((l) => l.includes('|')).map((l) => l.split('|').map((x) => x.trim()));
    const docId = (flight, name) => Number(one(`SELECT id_documentos_vuelo FROM documentos_vuelo WHERE id_vuelos=${flight} AND nombre_documento=N'${name}'`));
    const hhmm = (docsText, re) => { const m = docsText.match(re); assert.ok(m, 'texto con fecha: ' + docsText.slice(0, 200)); return m[1]; };

    // ---------- A: Operaciones registra y versiona un documento del vuelo sanitario ----------
    const p1 = await login(ops.name); await p1.getByRole('heading', { name: 'Centro de Operaciones' }).waitFor();
    let docs = await open(p1, 'Centro de Operaciones', S);
    await docs.getByText('Sin documentos registrados.').waitFor();
    assert.deepEqual(await typeOptions(docs), ['Seleccionar', ...sql('SELECT nombre_tipo_documento FROM tipos_documento ORDER BY nombre_tipo_documento').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)].sort((a, b) => (a === 'Seleccionar' ? -1 : b === 'Seleccionar' ? 1 : a.localeCompare(b))), 'el selector muestra exactamente el catálogo');
    const NAME = 'Plan UI ' + MARK, pdf1 = pdfWith('% ui v1 ' + MARK), pdf2 = pdfWith('% ui v2 ' + MARK);
    const registrar = docs.getByRole('button', { name: 'Registrar documento', exact: true });
    assert.equal(await registrar.isDisabled(), true);
    await field(docs, 'Tipo documental', 'select').selectOption({ label: 'Plan de vuelo' }); await field(docs, 'Nombre del documento', 'input').fill(NAME); await field(docs, 'Archivo PDF', 'input').setInputFiles(file('plan-v1.pdf', pdf1));
    await registrar.click();
    await docs.getByText('Versión 1 (vigente)').waitFor();
    const id1 = docId(S, NAME); assert.equal(one(`SELECT t.codigo_tipo_documento FROM documentos_vuelo d JOIN tipos_documento t ON t.id_tipos_documento=d.id_tipos_documento WHERE d.id_documentos_vuelo=${id1}`), 'PLAN_DE_VUELO');
    assert.equal(versionsSql(id1).length, 1); assert.equal(storedSha(versionsSql(id1)[0][2]), sha256(pdf1));
    await docs.getByText(`· ${ops.name}`).first().waitFor();
    pass('A alta: el selector lista el catálogo real, el documento se clasifica como PLAN_DE_VUELO y su archivo almacenado es idéntico al elegido');

    // ---------- B: bloqueo, nueva versión y descarga ----------
    await docs.getByText('Disponible para edición: no hay bloqueo vigente.').waitFor();
    await docs.getByRole('button', { name: 'Adquirir bloqueo' }).click();
    const held = await docs.getByText(/Usted posee el bloqueo hasta/).textContent(); const until = hhmm(held, /hasta (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    assert.ok(Math.abs(Date.parse(until.replace(' ', 'T') + ':00-03:00') - (Date.now() + LEASE * 1000)) < 180000, `el vencimiento se muestra en hora civil de Tucumán: ${until}`);
    await field(docs, 'Nueva versión PDF', 'input').setInputFiles(file('plan-v2.pdf', pdf2)); await docs.getByRole('button', { name: 'Guardar nueva versión' }).click();
    await docs.getByText(/Versión 2 \(vigente\)/).waitFor(); await docs.getByText(/Versión 1 · plan-v1\.pdf/).waitFor();
    assert.deepEqual(versionsSql(id1).map((r) => [r[0], r[1]]), [['1', '0'], ['2', '1']], 'v1 se conserva y v2 es la vigente');
    const d1 = await downloaded(p1, docs, 1), d2 = await downloaded(p1, docs, 2);
    assert.equal(sha256(d1.bytes), sha256(pdf1)); assert.equal(sha256(d2.bytes), sha256(pdf2)); assert.equal(d1.name, 'plan-v1.pdf'); assert.equal(d2.name, 'plan-v2.pdf');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${S} AND tipo_entidad=N'DOCUMENT' AND operacion=N'DOWNLOAD'`), 2, 'las dos descargas quedaron auditadas');
    pass('B edición: con el bloqueo (vencimiento en hora civil) se guarda la v2, el historial muestra v1 y v2 y ambas descargas desde el navegador son idénticas a los archivos cargados');

    // ---------- C: conflicto entre dos usuarios y vencimiento ----------
    const p2 = await login(ops2.name); await p2.getByRole('heading', { name: 'Centro de Operaciones' }).waitFor();
    const docs2 = await open(p2, 'Centro de Operaciones', S);
    await docs2.getByRole('button', { name: new RegExp(NAME) }).click();
    await docs2.getByText(new RegExp(`Bloqueado por ${ops.name}`)).waitFor();
    assert.equal(await docs2.getByText('Nueva versión PDF').count(), 0, 'sin el bloqueo no se ofrece guardar');
    await docs2.getByRole('button', { name: 'Intentar adquirir bloqueo' }).click();
    await docs2.getByRole('alert').filter({ hasText: /bloqueado por otro usuario/ }).waitFor(); assert.equal(versionsSql(id1).length, 2);
    await docs.getByRole('button', { name: 'Liberar bloqueo' }).click(); await docs.getByText('Disponible para edición: no hay bloqueo vigente.').waitFor();
    await docs2.getByRole('button', { name: 'Intentar adquirir bloqueo' }).click(); await docs2.getByText(/Usted posee el bloqueo hasta/).waitFor();
    // el primer usuario, con la pantalla desactualizada, ve ahora el bloqueo ajeno al consultarlo
    await docs.getByRole('button', { name: new RegExp(NAME) }).click(); await docs.getByText(new RegExp(`Bloqueado por ${ops2.name}`)).waitFor();
    await field(docs2, 'Nueva versión PDF', 'input').setInputFiles(file('plan-tarde.pdf', pdfWith('% tarde ' + MARK)));
    await clock.set(Date.parse((await clock.get()).now) + (LEASE + 5) * 1000);
    await docs2.getByRole('button', { name: 'Guardar nueva versión' }).click();
    await docs2.getByRole('alert').filter({ hasText: /venció/ }).waitFor(); await docs2.getByText('Disponible para edición: no hay bloqueo vigente.').waitFor();
    assert.equal(await docs2.getByText('Nueva versión PDF').count(), 0, 'tras el vencimiento la pantalla se corrige con el estado del servidor');
    assert.equal(versionsSql(id1).length, 2, 'guardar con el lease vencido no escribió');
    await clock.reset();
    await docs2.getByRole('button', { name: 'Adquirir bloqueo' }).click(); await docs2.getByText(/Usted posee el bloqueo/).waitFor(); await docs2.getByRole('button', { name: 'Liberar bloqueo' }).click(); await docs2.getByText('Disponible para edición: no hay bloqueo vigente.').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM bloqueos_documento_vuelo WHERE id_documentos_vuelo=${id1} AND fecha_vencimiento>SYSDATETIME()`), 0);
    pass('C concurrencia: el segundo usuario ve el bloqueo ajeno, no puede guardar ni adquirirlo (mensaje del servidor); tras liberar lo obtiene; con el lease vencido el guardado se rechaza sin escribir y la pantalla se corrige sola');

    // ---------- D: el DTS consulta y descarga, sin controles de edición ----------
    const pd = await login(dts.name); await pd.getByRole('heading', { name: 'Mis solicitudes y contrapropuestas' }).waitFor();
    const docsD = await open(pd, 'Mis solicitudes y contrapropuestas', S);
    await docsD.getByRole('button', { name: new RegExp(NAME) }).click(); await docsD.getByText(/Versión 2 \(vigente\)/).waitFor();
    await docsD.getByText(/Consulta y descarga/).waitFor();
    for (const forbidden of ['Registrar documento PDF', 'Adquirir bloqueo', 'Consultar bloqueo', 'Guardar nueva versión']) assert.equal(await docsD.getByText(forbidden).count(), 0, forbidden);
    assert.equal(await docsD.getByRole('button', { name: 'Registrar documento' }).count(), 0);
    const dd = await downloaded(pd, docsD, 1); assert.equal(sha256(dd.bytes), sha256(pdf1));
    pass('D DTS: ve el documento, sus versiones y autor y descarga la v1 idéntica; no se ofrece alta, bloqueo ni nueva versión');

    // ---------- E: el comandante trabaja en el vuelo operativo y Operaciones lo ve ----------
    const pc = await login(cmdB.name); await pc.getByRole('heading', { name: 'Planificación operativa', exact: true }).waitFor();
    const docsC = await open(pc, 'Planificación operativa', O);
    const CNAME = 'Autorización UI ' + MARK, cpdf = pdfWith('% cmd ' + MARK);
    await field(docsC, 'Tipo documental', 'select').selectOption({ label: 'Autorización de vuelo' }); await field(docsC, 'Nombre del documento', 'input').fill(CNAME); await field(docsC, 'Archivo PDF', 'input').setInputFiles(file('autorizacion.pdf', cpdf));
    await docsC.getByRole('button', { name: 'Registrar documento', exact: true }).click(); await docsC.getByText('Versión 1 (vigente)').waitFor();
    const idC = docId(O, CNAME); assert.equal(one(`SELECT id_vuelos FROM documentos_vuelo WHERE id_documentos_vuelo=${idC}`), String(O)); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${O}`), 0);
    await docsC.getByRole('button', { name: 'Adquirir bloqueo' }).click(); await docsC.getByText(/Usted posee el bloqueo/).waitFor();
    await field(docsC, 'Nueva versión PDF', 'input').setInputFiles(file('autorizacion-v2.pdf', pdfWith('% cmd v2 ' + MARK))); await docsC.getByRole('button', { name: 'Guardar nueva versión' }).click(); await docsC.getByText(/Versión 2 \(vigente\)/).waitFor();
    await docsC.getByRole('button', { name: 'Liberar bloqueo' }).click();
    const docsOO = await open(p1, 'Centro de Operaciones', O);
    await docsOO.getByRole('button', { name: new RegExp(CNAME) }).click(); await docsOO.getByText(/Versión 2 \(vigente\)/).waitFor(); await docsOO.getByText(`· ${cmdB.name}`).first().waitFor();
    const dc = await downloaded(p1, docsOO, 1); assert.equal(sha256(dc.bytes), sha256(cpdf));
    pass('E vuelo operativo: el comandante registra la autorización, crea la v2 y libera; Operaciones la ve con su autor y descarga la v1 idéntica; el documento queda ligado a un vuelo sin extensión sanitaria');

    // ---------- G: baja lógica y compatibilidad de tipos desde la interfaz ----------
    docs = await open(p1, 'Centro de Operaciones', S);
    const UINAME = 'Retirable UI ' + MARK, uipdf = pdfWith('% ui retire ' + MARK);
    await field(docs, 'Tipo documental', 'select').selectOption({ label: 'Otro documento' }); await field(docs, 'Nombre del documento', 'input').fill(UINAME); await field(docs, 'Archivo PDF', 'input').setInputFiles(file('retirable.pdf', uipdf));
    await docs.getByRole('button', { name: 'Registrar documento', exact: true }).click(); await docs.getByRole('heading', { name: UINAME }).waitFor();
    const idRet = docId(S, UINAME);
    await docs.getByRole('button', { name: 'Retirar documento' }).click();
    await docs.getByRole('note').filter({ hasText: /no se puede deshacer/ }).waitFor();
    const confirmRetire = docs.getByRole('button', { name: 'Confirmar retiro' }); assert.equal(await confirmRetire.isDisabled(), true, 'sin motivo no se puede confirmar');
    await field(docs, 'Motivo de la baja', 'textarea').fill('   '); assert.equal(await confirmRetire.isDisabled(), true, 'un motivo en blanco no alcanza');
    await docs.getByRole('button', { name: 'Cancelar' }).click(); assert.equal(count(`SELECT esta_activo FROM documentos_vuelo WHERE id_documentos_vuelo=${idRet}`), 1, 'cancelar no cambia nada');
    await docs.getByRole('button', { name: 'Retirar documento' }).click(); await field(docs, 'Motivo de la baja', 'textarea').fill('Archivo equivocado'); await confirmRetire.click();
    await docs.getByRole('button', { name: new RegExp(UINAME) }).waitFor({ state: 'detached' });
    const gone = sql(`SELECT esta_activo, motivo_baja, id_usuario_baja FROM documentos_vuelo WHERE id_documentos_vuelo=${idRet}`).split('|').map((x) => x.trim());
    assert.deepEqual(gone, ['0', 'Archivo equivocado', String(ops.id)]); assert.equal(versionsSql(idRet).length, 1, 'la versión se conserva'); assert.equal(storedSha(versionsSql(idRet)[0][2]), sha256(uipdf), 'el archivo físico se conserva');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${S} AND entidad_id=${idRet} AND operacion=N'DEACTIVATE'`), 1);
    await docs.getByRole('button', { name: 'Ver documentos retirados' }).click();
    const retiredList = docs.getByRole('list', { name: 'Documentos retirados' }); await retiredList.getByText(new RegExp(`${UINAME}.*retirado por ${ops.name}.*Motivo: Archivo equivocado`)).waitFor();
    await docs.getByRole('button', { name: `Ver historial de ${UINAME}` }).click(); await docs.getByText(/Documento retirado del uso operativo: se conservan/).waitFor();
    const dRet = await downloaded(p1, docs, 1); assert.equal(sha256(dRet.bytes), sha256(uipdf), 'el historial de un retirado se descarga idéntico');
    for (const control of ['Retirar documento', 'Adquirir bloqueo', 'Guardar nueva versión']) assert.equal(await docs.getByRole('button', { name: control }).count(), 0, control);
    await pd.reload(); const docsD2 = await open(pd, 'Mis solicitudes y contrapropuestas', S); await docsD2.getByRole('button', { name: new RegExp(NAME) }).waitFor();
    assert.equal(await docsD2.getByRole('button', { name: new RegExp(UINAME) }).count(), 0, 'el DTS no ve el retirado'); assert.equal(await docsD2.getByRole('button', { name: /retirados/ }).count(), 0, 'ni se le ofrece la consulta histórica');
    // conflicto: otro usuario mantiene el bloqueo
    const LOCKNAME = 'Con bloqueo UI ' + MARK;
    await field(docs, 'Tipo documental', 'select').selectOption({ label: 'Otro documento' }); await field(docs, 'Nombre del documento', 'input').fill(LOCKNAME); await field(docs, 'Archivo PDF', 'input').setInputFiles(file('bloqueado.pdf', pdfWith('% ui lock ' + MARK)));
    await docs.getByRole('button', { name: 'Registrar documento', exact: true }).click(); await docs.getByRole('heading', { name: LOCKNAME }).waitFor();
    await docs.getByRole('button', { name: 'Adquirir bloqueo' }).click(); await docs.getByText(/Usted posee el bloqueo/).waitFor();
    await p2.reload(); const docs2b = await open(p2, 'Centro de Operaciones', S); await docs2b.getByRole('button', { name: new RegExp(LOCKNAME) }).click();
    await docs2b.getByRole('button', { name: 'Retirar documento' }).click(); await field(docs2b, 'Motivo de la baja', 'textarea').fill('Intento con bloqueo ajeno'); await docs2b.getByRole('button', { name: 'Confirmar retiro' }).click();
    await docs2b.getByRole('alert').filter({ hasText: new RegExp(`bloqueado por ${ops.name}`) }).waitFor();
    assert.equal(count(`SELECT esta_activo FROM documentos_vuelo WHERE id_documentos_vuelo=${docId(S, LOCKNAME)}`), 1, 'el conflicto no retira nada'); assert.equal(await field(docs2b, 'Motivo de la baja', 'textarea').inputValue(), 'Intento con bloqueo ajeno', 'se conserva lo escrito');
    await docs.getByRole('button', { name: 'Liberar bloqueo' }).click(); await docs.getByText('Disponible para edición: no hay bloqueo vigente.').waitFor();
    await docs2b.getByRole('button', { name: 'Confirmar retiro' }).click(); await docs2b.getByRole('button', { name: new RegExp(LOCKNAME) }).waitFor({ state: 'detached' });
    assert.equal(count(`SELECT esta_activo FROM documentos_vuelo WHERE id_documentos_vuelo=${docId(S, LOCKNAME)}`), 0);
    // vuelo operativo: el selector no ofrece el parte médico y el comandante sólo retira lo que cargó
    const docsOps = await open(p1, 'Centro de Operaciones', O);
    assert.deepEqual(await typeOptions(docsOps), ['Seleccionar', 'Autorización de vuelo', 'Otro documento', 'Plan de vuelo'], 'el vuelo operativo no ofrece el parte médico');
    const OPSNAME = 'De Operaciones UI ' + MARK;
    await field(docsOps, 'Tipo documental', 'select').selectOption({ label: 'Plan de vuelo' }); await field(docsOps, 'Nombre del documento', 'input').fill(OPSNAME); await field(docsOps, 'Archivo PDF', 'input').setInputFiles(file('ops-o.pdf', pdfWith('% ui opsO ' + MARK)));
    await docsOps.getByRole('button', { name: 'Registrar documento', exact: true }).click(); await docsOps.getByRole('heading', { name: OPSNAME }).waitFor();
    await pc.reload(); const docsC3 = await open(pc, 'Planificación operativa', O);
    assert.deepEqual(await typeOptions(docsC3), ['Seleccionar', 'Autorización de vuelo', 'Otro documento', 'Plan de vuelo']);
    await docsC3.getByRole('button', { name: new RegExp(OPSNAME) }).click(); await docsC3.getByText('Historial de versiones').waitFor();
    assert.equal(await docsC3.getByRole('button', { name: 'Retirar documento' }).count(), 0, 'el comandante no retira lo que cargó Operaciones');
    const WRONG = 'Equivocado UI ' + MARK;
    await field(docsC3, 'Tipo documental', 'select').selectOption({ label: 'Otro documento' }); await field(docsC3, 'Nombre del documento', 'input').fill(WRONG); await field(docsC3, 'Archivo PDF', 'input').setInputFiles(file('equivocado.pdf', pdfWith('% ui wrong ' + MARK)));
    await docsC3.getByRole('button', { name: 'Registrar documento', exact: true }).click(); await docsC3.getByRole('heading', { name: WRONG }).waitFor();
    await docsC3.getByRole('button', { name: 'Retirar documento' }).click(); await field(docsC3, 'Motivo de la baja', 'textarea').fill('Error del comandante'); await docsC3.getByRole('button', { name: 'Confirmar retiro' }).click();
    await docsC3.getByRole('button', { name: new RegExp(WRONG) }).waitFor({ state: 'detached' });
    await docsC3.getByRole('button', { name: 'Ver documentos retirados' }).click(); await docsC3.getByRole('list', { name: 'Documentos retirados' }).getByText(new RegExp(`${WRONG}.*retirado por ${cmdB.name}.*Error del comandante`)).waitFor();
    assert.equal(count(`SELECT esta_activo FROM documentos_vuelo WHERE id_documentos_vuelo=${docId(O, WRONG)}`), 0);
    pass('G baja lógica: el motivo es obligatorio y se advierte que no se deshace; el retiro conserva fila, versión y archivo, desaparece del listado, queda auditado y se consulta y descarga desde "documentos retirados"; el DTS no lo ve; un bloqueo ajeno produce un conflicto sin retirar y conserva lo escrito; el selector del vuelo operativo no ofrece el parte médico; el comandante sólo retira lo que cargó');

    // ---------- F: persistencia y vuelo finalizado ----------
    await p1.reload(); const docsR = await open(p1, 'Centro de Operaciones', S);
    await docsR.getByRole('button', { name: new RegExp(`${NAME} · Plan de vuelo · v2`) }).waitFor();
    await approveRoute(O, cmdB.token, ops.token); await call(`/flights/${O}/start`, { method: 'POST', token: ops.token }); await call(`/flights/${O}/finish`, { method: 'POST', token: ops.token }); assert.equal(stateOf(O), 'FINALIZADO');
    await p1.reload(); const docsF = await open(p1, 'Centro de Operaciones', O);
    await docsF.getByRole('button', { name: new RegExp(CNAME) }).click(); await docsF.getByText(/Versión 2 \(vigente\)/).waitFor();
    await docsF.getByText(/Consulta y descarga/).waitFor(); assert.equal(await docsF.getByText('Registrar documento PDF').count(), 0); assert.equal(await docsF.getByRole('button', { name: /bloqueo/i }).count(), 0);
    const df = await downloaded(p1, docsF, 2); assert.equal(sha256(df.bytes), sha256(pdfWith('% cmd v2 ' + MARK)));
    assert.equal(versionsSql(idC).length, 2);
    await docsF.getByRole('button', { name: 'Ver documentos retirados' }).click(); await docsF.getByRole('list', { name: 'Documentos retirados' }).getByText(new RegExp(WRONG)).waitFor();
    assert.equal(await docsF.getByRole('button', { name: 'Retirar documento' }).count(), 0, 'en un vuelo finalizado ya no se retira');
    pass('F persistencia: tras recargar la lista y las versiones siguen ahí; al finalizar el vuelo la pantalla pasa a sólo consulta (sin alta ni bloqueo) y la descarga histórica sigue funcionando');
  } finally {
    await browser.close(); await clock.reset().catch(() => {}); fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nE2E documentos UI: ${passed} bloques aprobados`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
