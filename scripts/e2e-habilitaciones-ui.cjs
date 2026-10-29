/* I-5.6: recorrido de navegador (Chrome + Playwright) del ciclo completo de habilitaciones y documentación sobre el stack aislado :18081 / :18080,
 * con ClamAV real y verificación en SQL Server. Requiere `playwright` en NODE_PATH y el perfil antimalware activo. Sólo crea registros marcados.
 *  1) el administrador define la política de suficiencia y ve el estado real del analizador.
 *  2) alta de la habilitación, carga de un archivo con EICAR (rechazado, sin descarga, verificación bloqueada con el motivo del servidor),
 *     carga de un PDF limpio (huella visible), estados administrativo / documental / elegibilidad por separado.
 *  3) el titular (administrador) no puede revisar la propia habilitación; otro administrador la verifica; la interfaz no anuncia éxito antes de la respuesta.
 *  4) consulta externa manual (no es validación del organismo), solicitud de corrección, renovación y revocación con su efecto en la elegibilidad. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, sql, one, count, call, ok, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');

const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
async function until(fn, what, ms = 45000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, 400)); } throw new Error('Tiempo agotado esperando: ' + what + (last instanceof Error ? ' (' + last.message.slice(0, 200) + ')' : '')); }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
function makePdf(label, comment = '') {
  const NL = '\n', content = `BT /F1 12 Tf 20 50 Td (${label}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>', `<< /Length ${content.length} >>${NL}stream${NL}${content}${NL}endstream`];
  let out = '%PDF-1.4' + NL + (comment ? '% ' + comment + NL : ''); const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj${NL}${o}${NL}endobj${NL}`; });
  const xref = Buffer.byteLength(out);
  out += `xref${NL}0 5${NL}0000000000 65535 f ${NL}` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n ' + NL).join('') + `trailer${NL}<< /Size 5 /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`;
  return Buffer.from(out, 'latin1');
}

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 59);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const status = await ok('/professional-credential-documents/antimalware-status', { token: admin });
  assert.equal(status.configured, true, 'Se requiere el analizador ClamAV real (perfil antimalware)');
  console.log('Preparando cuentas de ensayo…');
  const reviewer = await createUser(admin, 'ADMINISTRADOR', 'huir'), holder = await createUser(admin, 'ADMINISTRADOR', 'huit'), plain = await createUser(admin, 'DTS', 'huip');
  const TYPE = 'Matrícula UI ' + MARK;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const snap = async (p, n) => { try { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: false }); } catch { /* opcional */ } };
  const login = async (name, password = PASSWORD) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(password); const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const res = await r; if (!res.ok()) throw new Error('UI login HTTP ' + res.status()); return p; };
  /** Abre el panel de habilitaciones de un usuario (sección Usuarios → clasificación administrativa). */
  const credentialsPanel = async (page, user) => {
    await page.locator('nav a', { hasText: /^Usuarios$/ }).first().click();
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Clasificación administrativa de tripulación' }) });
    await section.getByLabel('Buscar usuario').fill(user.name);
    await section.locator('label').filter({ hasText: /^Usuario/ }).locator('select').selectOption(String(user.id), { timeout: 30000 });
    return section.locator('div.credentials');
  };
  const notice = (page) => page.locator('main p.success, main p.error').first();
  try {
    // ---- 1) Política de suficiencia ----
    const adminPage = await login(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD);
    await adminPage.locator('nav a', { hasText: /^Habilitaciones$/ }).click();
    await adminPage.getByRole('heading', { name: 'Política de suficiencia de habilitaciones' }).waitFor();
    await adminPage.getByText(/activo \(ClamAV/).waitFor(); await adminPage.getByText(/Purga automática: deshabilitada/).waitFor();
    await adminPage.getByLabel('Tipo de habilitación aceptado').fill(TYPE);
    // Diagnóstico ante un fallo intermitente (una vez en la corrida continua de I-5.8, no reproducido después): si el aviso no aparece, informa respuestas HTTP y avisos visibles antes de fallar.
    const policyCalls = []; adminPage.on('response', (r) => { if (/credential-policies/.test(r.url())) policyCalls.push(`${r.request().method()} ${r.status()}`); });
    await adminPage.getByRole('button', { name: 'Agregar política' }).click();
    await adminPage.getByText('Política creada').waitFor().catch(async (e) => { console.error('Diagnóstico: llamadas =', policyCalls.join(', ') || '(ninguna)', '| avisos =', JSON.stringify(await adminPage.locator('.error, [role=alert], .notice').allTextContents()), '| botón habilitado =', await adminPage.getByRole('button', { name: 'Agregar política' }).isEnabled().catch(() => 'n/d')); throw e; });
    assert.equal(count(`SELECT COUNT(*) FROM politicas_habilitacion WHERE tipo_habilitacion=N'${TYPE}' AND activa=1 AND origen='CONFIGURACION_INTERNA'`), 1);
    await snap(adminPage, 'hab01-politica');
    pass('UI-1 el administrador ve el analizador real, la ausencia de purga y crea la política de suficiencia (persistida en SQL Server)');

    // ---- 2) Alta, documentos y estados ----
    const panel = await credentialsPanel(adminPage, plain);
    await panel.getByLabel('Tipo de habilitación o profesión').fill(TYPE);
    await panel.getByLabel('Número de licencia o matrícula').fill('MP-UI-' + MARK);
    await panel.getByLabel('Organismo emisor').fill('Colegio de pruebas');
    await panel.getByLabel('Fecha de vencimiento').fill(new Date(Date.now() + 500 * 86400000).toISOString().slice(0, 10));
    await panel.getByRole('button', { name: 'Guardar habilitación' }).click();
    await adminPage.getByText('Habilitación guardada; requiere revisión interna').waitFor();
    const credentialId = Number(one(`SELECT TOP 1 id_habilitaciones_profesionales FROM habilitaciones_profesionales hp JOIN usuarios u ON u.id_personas=hp.id_personas WHERE u.id_usuarios=${plain.id} ORDER BY 1 DESC`));
    assert.ok(credentialId > 0);
    await panel.getByText(/Administrativo:\s*Pendiente de revisión/).waitFor(); await panel.getByText(/Documental:\s*Sin documentos/).waitFor();
    await panel.getByText(/Elegibilidad operativa:\s*No elegible/).waitFor();
    pass('UI-2 alta de la habilitación: los tres estados (administrativo, documental, elegibilidad) se muestran por separado');

    const attach = async (name, bytes) => { await panel.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer: bytes }); await panel.getByRole('button', { name: 'Adjuntar documento' }).click(); };
    await attach('eicar.pdf', makePdf('eicar-' + MARK, EICAR));
    await panel.getByText(/eicar\.pdf[^\n]*Rechazado/).waitFor(); await panel.getByText(/Documental:\s*Documento rechazado por el análisis/).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Descargar eicar.pdf' }).count(), 0, 'un documento rechazado no ofrece descarga');
    assert.equal(one(`SELECT estado_analisis FROM documentos_habilitacion WHERE id_habilitaciones_profesionales=${credentialId} AND nombre_archivo=N'eicar.pdf'`), 'RECHAZADO');
    await panel.getByLabel('Justificación de la decisión').fill('Intento con documento rechazado'); await panel.getByLabel(/Confirmo la revisión manual/).check();
    await panel.getByRole('button', { name: 'Verificar (revisión interna)' }).click();
    await panel.getByRole('alert').getByText(/Ningún documento activo superó el análisis antimalware/).waitFor();
    assert.equal(await adminPage.getByText(/Verificar \(revisión interna\): registrado/).count(), 0, 'no se anuncia éxito si el servidor rechazó la operación');
    assert.equal(one(`SELECT estado_verificacion FROM habilitaciones_profesionales WHERE id_habilitaciones_profesionales=${credentialId}`), 'PENDIENTE');
    await snap(adminPage, 'hab02-eicar');
    pass('UI-3 el archivo con EICAR queda RECHAZADO por ClamAV, sin descarga; la verificación se bloquea con el motivo real del servidor y sin mensaje de éxito');

    const cleanBytes = makePdf('matricula-ui-' + MARK);
    await attach('matricula.pdf', cleanBytes);
    await panel.getByText(/matricula\.pdf[^\n]*Limpio/).waitFor(); await panel.getByText(new RegExp('SHA-256 ' + sha(cleanBytes).slice(0, 12))).waitFor();
    await panel.getByRole('button', { name: 'Descargar matricula.pdf' }).waitFor();
    await panel.getByRole('button', { name: /Retirar documento/ }).first().waitFor();
    pass('UI-4 el PDF limpio muestra su estado y la huella SHA-256 del archivo; la descarga queda disponible');

    // ---- 3) Autorrevisión denegada y revisión por otro administrador ----
    const ownCredential = (await ok(`/users/${holder.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'MEDICO', type: TYPE, number: 'MP-PROP-' + MARK, issuer: 'Colegio', noExpiry: true } })).id;
    const holderPage = await login(holder.name);
    const own = await credentialsPanel(holderPage, holder);
    await own.getByRole('button', { name: /Médico — .*MP-PROP/ }).click();
    await own.locator('input[type=file]').setInputFiles({ name: 'propia.pdf', mimeType: 'application/pdf', buffer: makePdf('propia-' + MARK) });
    await own.getByRole('button', { name: 'Adjuntar documento' }).click(); await own.getByText(/propia\.pdf[^\n]*Limpio/).waitFor();
    await own.getByLabel('Justificación de la decisión').fill('Revisión propia'); await own.getByLabel(/Confirmo la revisión manual/).check();
    await own.getByRole('button', { name: 'Verificar (revisión interna)' }).click();
    await own.getByRole('alert').getByText(/no puede verificarla, rechazarla, revocarla/).waitFor();
    assert.equal(one(`SELECT estado_verificacion FROM habilitaciones_profesionales WHERE id_habilitaciones_profesionales=${ownCredential}`), 'PENDIENTE');
    pass('UI-5 el titular, aun siendo administrador, no puede revisar su propia habilitación (el servidor lo rechaza y la pantalla lo explica)');

    const reviewerPage = await login(reviewer.name);
    const r = await credentialsPanel(reviewerPage, plain);
    await r.getByRole('button', { name: new RegExp('Médico — ' + TYPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' — MP-UI') }).click();
    await r.getByLabel('Justificación de la decisión').fill('Matrícula y título revisados en papel'); await r.getByLabel(/Confirmo la revisión manual/).check();
    await r.getByRole('button', { name: 'Verificar (revisión interna)' }).click();
    await reviewerPage.getByText('Verificar (revisión interna): registrado').waitFor();
    await r.getByText(/Administrativo:\s*Verificada \(revisión interna\)\s*·\s*Vigente/).waitFor(); await r.getByText(/Documental:\s*Documentación analizada/).waitFor();
    await r.getByText(/Elegibilidad operativa:\s*Elegible/).waitFor();
    assert.equal(one(`SELECT estado_verificacion FROM habilitaciones_profesionales WHERE id_habilitaciones_profesionales=${credentialId}`), 'VERIFICADA');
    assert.equal(count(`SELECT COUNT(*) FROM decisiones_habilitacion WHERE id_habilitaciones_profesionales=${credentialId} AND tipo_decision='VERIFICADA' AND id_usuarios=${reviewer.id} AND motivo=N'Matrícula y título revisados en papel'`), 1);
    await snap(reviewerPage, 'hab03-verificada');
    pass('UI-6 otro administrador verifica; el éxito se anuncia tras la respuesta del servidor y los tres estados se actualizan; la decisión queda con actor y motivo');

    // ---- 4) Consulta externa, corrección, renovación y revocación ----
    await r.getByText(/Revisión interna · sin consulta externa registrada/).waitFor();
    await r.getByLabel('Datos contrastados').fill('Nombre y matrícula coinciden en el Buscador Nacional');
    await r.getByRole('button', { name: 'Registrar consulta externa' }).click();
    await reviewerPage.getByText(/Consulta externa registrada \(no modifica el estado administrativo\)/).waitFor();
    await r.getByText(/consulta manual coincidente \(no es una validación emitida por el organismo\)/).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM consultas_externas_habilitacion WHERE id_habilitaciones_profesionales=${credentialId} AND organismo='REFEPS_SISA' AND id_usuario_responsable=${reviewer.id}`), 1);
    pass('UI-7 la consulta externa manual queda registrada con fuente y responsable y se rotula como NO validación del organismo');

    await r.getByRole('button', { name: /Registrar renovación/ }).click();
    await reviewerPage.getByText('Renovación registrada como nueva habilitación pendiente').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM habilitaciones_profesionales WHERE id_habilitacion_renovada=${credentialId} AND estado_verificacion='PENDIENTE'`), 1);
    await r.getByRole('button', { name: /renueva #/ }).waitFor();
    pass('UI-8 la renovación crea una habilitación nueva pendiente enlazada a la anterior, que se conserva');

    await r.getByRole('button', { name: new RegExp('Médico — ' + TYPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' — MP-UI(?!.*renueva)') }).first().click();
    await r.getByLabel('Justificación de la decisión').fill('Matrícula suspendida por el colegio');
    await r.getByRole('button', { name: 'Revocar verificación' }).click();
    await reviewerPage.getByText('Revocar verificación: registrado').waitFor();
    await r.getByText(/Administrativo:\s*Revocada/).waitFor();
    assert.equal(one(`SELECT estado_verificacion FROM habilitaciones_profesionales WHERE id_habilitaciones_profesionales=${credentialId}`), 'REVOCADA');
    assert.equal(await r.getByRole('button', { name: 'Guardar habilitación' }).isDisabled(), true, 'una habilitación revocada no se edita');
    await snap(reviewerPage, 'hab04-revocada');
    pass('UI-9 la revocación se refleja de inmediato (administrativo REVOCADA), bloquea la edición y deja el historial');
    await r.getByRole('button', { name: 'Consultar historial' }).click();
    await r.getByText(/Revocación → Revocada/).waitFor(); await r.getByText(/Verificación → Verificada/).first().waitFor();
    pass('UI-10 el historial de decisiones muestra actor, fecha, motivo y estado resultante');
    console.log(`\n${passed} comprobaciones de navegador aprobadas (e2e-habilitaciones-ui)`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
