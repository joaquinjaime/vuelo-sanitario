/* Chrome real (Playwright) sobre el stack aislado :18081 / :18080: "Mi cuenta" con el selector internacional de teléfonos (país, prefijo, validación
 * en vivo, número final) y la verificación de correos con el código recibido en la bandeja de pruebas SMTP (Mailpit); el formulario del DTS con el
 * teléfono de coordinación por país. Cada paso se comprueba en SQL Server. La bandeja es un transporte controlado: no prueba entrega a un proveedor externo.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, sleep, sql, one, count, call, ok, createUser, waitHealthy, mailboxCode, mailboxMessages } = require('./e2e-cierre-support.cjs');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const personOf = (u) => Number(one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${u.id}`));

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 54); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const user = await createUser(admin, 'DTS', 'uiv'), p1 = personOf(user);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const login = async (u) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.setDefaultTimeout(60000); p.on('dialog', (d) => d.accept()); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(u.name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login')); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); assert.equal((await r).status(), 200); return p; };
  const rowOf = (page, text) => page.locator('li.contact', { hasText: text });
  try {
    const page = await login(user);
    await page.getByText('Mi cuenta', { exact: true }).click(); await page.getByRole('heading', { name: 'Mis datos de contacto' }).waitFor();
    const phoneForm = page.getByRole('form', { name: 'Agregar teléfono' }), mailForm = page.getByRole('form', { name: 'Agregar correo electrónico' });

    // ---- 1. Selector internacional de teléfonos ----
    const country = phoneForm.getByLabel('País del teléfono'), number = phoneForm.getByLabel('Nuevo teléfono', { exact: true });
    assert.equal(await country.inputValue(), 'AR', 'Argentina sólo como sugerencia inicial'); assert.equal((await phoneForm.getByLabel('Prefijo internacional').innerText()).trim(), '+54');
    await number.fill('381 555'); await phoneForm.getByText(/muy pocos dígitos|incompleto/).waitFor();
    await number.fill('381 555 1234 5678 9012'); await phoneForm.getByText(/demasiados dígitos/).waitFor();
    await number.fill('0381 555-1234 ext 12'); await phoneForm.getByText(/extensiones/).waitFor();
    const writesBefore = count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${p1}`);
    await phoneForm.getByRole('button', { name: 'Agregar' }).click(); await page.getByRole('alert').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${p1}`), writesBefore, 'el formulario no envía lo inválido');
    await number.fill('0381 15 555-1234'); await phoneForm.getByText(/Se guardará como \+54 9 381 555 1234 \(\+5493815551234\)/).waitFor();
    await number.fill('+54 381 444-5566'); assert.equal(await number.inputValue(), '381 444-5566', 'el prefijo escrito no se duplica');
    await phoneForm.getByLabel('Buscar país').fill('chil'); await country.selectOption('CL');
    assert.equal((await phoneForm.getByLabel('Prefijo internacional').innerText()).trim(), '+56');
    await number.fill('381 555 1234'); await phoneForm.getByText(/no es un teléfono válido de Chile|pocos|demasiados/).waitFor();
    await number.fill('9 8765 4321'); await phoneForm.getByText(/Se guardará como \+56 9 8765 4321/).waitFor();
    await phoneForm.getByLabel('Tipo del nuevo teléfono').selectOption('LABORAL');
    const add = page.waitForResponse((r) => r.url().endsWith('/api/auth/me/telefonos') && r.request().method() === 'POST'); await phoneForm.getByRole('button', { name: 'Agregar' }).click(); assert.equal((await add).status(), 200);
    await rowOf(page, '+56 9 8765 4321').getByText('Formato validado (Chile)').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${p1} AND numero_normalizado=N'+56987654321' AND codigo_pais=N'CL' AND tipo_telefono=N'LABORAL' AND fecha_baja IS NULL`), 1);
    // unicidad sobre el número normalizado: otra grafía del mismo número es duplicado y el mensaje del servidor se muestra
    await country.selectOption('CL'); await number.fill('+56 9 8765-4321');
    const dup = page.waitForResponse((r) => r.url().endsWith('/api/auth/me/telefonos') && r.request().method() === 'POST'); await phoneForm.getByRole('button', { name: 'Agregar' }).click(); assert.equal((await dup).status(), 409);
    await page.getByRole('alert').filter({ hasText: 'Ya tiene registrado' }).waitFor();
    // dato anterior sin país: se conserva marcado y exige elegir el país al editarlo
    sql(`INSERT INTO telefonos(id_personas,numero,numero_normalizado,tipo_telefono,es_principal,fecha_creacion,fecha_actualizacion) VALUES(${p1},N'381 444-9999',N'3814449999',N'PERSONAL',0,SYSUTCDATETIME(),SYSUTCDATETIME())`);
    await page.reload(); await page.getByRole('heading', { name: 'Mis datos de contacto' }).waitFor();
    await rowOf(page, '381 444-9999').getByText('Sin país: edítelo para validarlo').waitFor();
    await rowOf(page, '381 444-9999').getByRole('button', { name: 'Editar' }).click();
    const edit = page.getByRole('form', { name: 'Editar teléfono' });
    assert.equal(await edit.getByLabel('País del teléfono').inputValue(), '', 'no se supone Argentina');
    await edit.getByRole('button', { name: 'Guardar' }).click(); await edit.getByText('Seleccione el país del teléfono').first().waitFor();
    assert.equal(one(`SELECT ISNULL(codigo_pais,'-') FROM telefonos WHERE id_personas=${p1} AND numero_normalizado=N'3814449999'`), '-');
    await edit.getByLabel('País del teléfono').selectOption('AR');
    const put = page.waitForResponse((r) => /\/api\/auth\/me\/telefonos\/\d+$/.test(r.url()) && r.request().method() === 'PUT'); await edit.getByRole('button', { name: 'Guardar' }).click(); assert.equal((await put).status(), 200);
    await rowOf(page, '+54 381 444-9999').getByText('Formato validado (Argentina)').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM telefonos WHERE id_personas=${p1} AND numero_normalizado=N'+543814449999' AND codigo_pais=N'AR'`), 1);
    pass('selector de países: prefijo automático, validación en vivo por país, número final, búsqueda, duplicado normalizado y dato anterior sin país');

    // ---- 2. Verificación de correos ----
    const addr = `ui.verif.${MARK}@example.test`;
    await mailForm.getByLabel('Nuevo correo electrónico', { exact: true }).fill('sin-dominio@x'); await mailForm.getByRole('button', { name: 'Agregar' }).click();
    await page.getByRole('alert').filter({ hasText: /dominio/ }).waitFor(); assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_personas=${p1} AND direccion=N'sin-dominio@x'`), 0);
    await mailForm.getByLabel('Nuevo correo electrónico', { exact: true }).fill(addr); await mailForm.getByLabel('Tipo del nuevo correo electrónico', { exact: true }).selectOption('LABORAL');
    const addMail = page.waitForResponse((r) => r.url().endsWith('/api/auth/me/correos') && r.request().method() === 'POST'); await mailForm.getByRole('button', { name: 'Agregar' }).click(); assert.equal((await addMail).status(), 200);
    await page.getByText(`Enviamos un código a ${addr}`).waitFor();
    await rowOf(page, addr).getByText('Pendiente de verificación').waitFor();
    assert.equal(await rowOf(page, addr).getByRole('button', { name: 'Hacer principal' }).count(), 0, 'un correo pendiente no puede ser principal');
    const emailId = Number(one(`SELECT id_correos_electronicos FROM correos_electronicos WHERE id_personas=${p1} AND direccion=N'${addr}'`));
    assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos=${emailId} AND fecha_verificacion IS NULL`), 1);
    const { code, message } = await mailboxCode(addr); assert.equal(message.To[0].Address, addr);
    const box = page.getByLabel(`Código de verificación de ${addr}`);
    await rowOf(page, addr).getByRole('button', { name: 'Confirmar código' }).click(); await page.getByRole('alert').filter({ hasText: 'Ingrese el código' }).waitFor();
    await box.fill('ZZZZ-ZZZZ'); await rowOf(page, addr).getByRole('button', { name: 'Confirmar código' }).click(); await page.getByRole('alert').filter({ hasText: 'Intentos restantes: 4' }).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos=${emailId} AND fecha_verificacion IS NOT NULL`), 0);
    await page.getByLabel(`Código de verificación de ${addr}`).fill(code);
    const conf = page.waitForResponse((r) => r.url().endsWith(`/api/auth/me/correos/${emailId}/verificacion/confirmar`)); await rowOf(page, addr).getByRole('button', { name: 'Confirmar código' }).click(); assert.equal((await conf).status(), 200);
    await rowOf(page, addr).getByText('Verificado', { exact: true }).waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM correos_electronicos WHERE id_correos_electronicos=${emailId} AND fecha_verificacion IS NOT NULL`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM verificaciones_correo WHERE id_correos_electronicos=${emailId} AND fecha_uso IS NOT NULL`), 1);
    await rowOf(page, addr).getByRole('button', { name: 'Hacer principal' }).click(); await rowOf(page, addr).getByText('Principal', { exact: true }).waitFor();
    assert.equal(count(`SELECT es_principal FROM correos_electronicos WHERE id_correos_electronicos=${emailId}`), 1);
    // reenvío con límite de frecuencia visible, y el código anterior deja de servir
    const second = `ui.segundo.${MARK}@example.test`;
    await mailForm.getByLabel('Nuevo correo electrónico', { exact: true }).fill(second); await mailForm.getByRole('button', { name: 'Agregar' }).click(); await rowOf(page, second).getByText('Pendiente de verificación').waitFor();
    const firstCode = (await mailboxCode(second)).code;
    await rowOf(page, second).getByRole('button', { name: 'Reenviar código' }).click(); await page.getByRole('alert').filter({ hasText: /Espere|límite/ }).waitFor();
    await sleep(2400); await rowOf(page, second).getByRole('button', { name: 'Reenviar código' }).click(); await page.getByText(`Enviamos un código a ${second}`).first().waitFor();
    const secondCode = (await mailboxCode(second, { after: 1 })).code; assert.notEqual(firstCode, secondCode);
    await page.getByLabel(`Código de verificación de ${second}`).fill(firstCode); await rowOf(page, second).getByRole('button', { name: 'Confirmar código' }).click(); await page.getByRole('alert').filter({ hasText: /no es correcto/ }).waitFor();
    await page.getByLabel(`Código de verificación de ${second}`).fill(secondCode); await rowOf(page, second).getByRole('button', { name: 'Confirmar código' }).click(); await rowOf(page, second).getByText('Verificado', { exact: true }).waitFor();
    // un correo verificado no se reemplaza en el lugar
    await rowOf(page, second).getByRole('button', { name: 'Editar' }).click();
    assert.equal(await page.getByRole('form', { name: 'Editar correo electrónico' }).getByLabel('Nuevo valor del correo electrónico').getAttribute('readonly') !== null, true);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    // recarga: el estado persiste
    await page.reload(); await page.getByRole('heading', { name: 'Mis datos de contacto' }).waitFor(); await rowOf(page, addr).getByText('Verificado', { exact: true }).waitFor();
    pass('verificación de correos desde la interfaz: pendiente, código incorrecto, confirmación, principal sólo tras verificar, reenvío con límite, código anterior inválido y estado persistente');

    // ---- 3. Teléfono de coordinación por país en la solicitud del DTS ----
    const dtsPage = await login(user);
    await dtsPage.getByRole('heading', { name: 'Nueva solicitud DTS' }).waitFor();
    await dtsPage.getByRole('button', { name: 'Agregar contacto de coordinación' }).click();
    const block = dtsPage.locator('.transfer-contact-block').first();
    await block.getByLabel('Relación con el paciente').selectOption('PACIENTE');
    assert.equal(await block.getByLabel('País del teléfono').inputValue(), 'AR');
    await block.getByLabel('País del teléfono').selectOption('US'); assert.equal((await block.getByLabel('Prefijo internacional').innerText()).trim(), '+1');
    await block.getByLabel('Teléfono', { exact: true }).fill('416 555 0123'); await block.getByText(/no es un teléfono válido de Estados Unidos/).waitFor();
    await block.getByLabel('País del teléfono').selectOption('CA'); await block.getByText(/Se guardará como \+1 416 555 0123/).waitFor();
    pass('el contacto de coordinación del traslado usa el mismo selector (Canadá y Estados Unidos comparten +1 y se validan por región)');
  } finally { await browser.close(); }
  console.log(`\nOK: ${passed} bloques aprobados (bandeja de pruebas SMTP: sin entrega a un proveedor externo)`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
