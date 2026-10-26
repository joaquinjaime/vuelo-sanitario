/* Chrome real: búsqueda DTS, selección de paciente y corrección administrativa; sólo E2E. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, one, count, ok, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');

(async () => {
 assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 48);
 await waitHealthy();
 const dotenv = {};
 for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
 }
 const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
 const dts = await createUser(admin, 'DTS', 'directoryui');
 const dni = String(70000000 + Math.floor(Math.random() * 20000000));
 const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Lucia', apellido: 'Busqueda' + MARK, dni, fechaNacimiento: '1989-02-03' } });
 const provinces = await ok('/catalogs/provinces', { token: dts.token });
 const province = provinces[0], localities = await ok(`/catalogs/localities?provinceId=${province.id}`, { token: dts.token });
 assert.ok(localities.length >= 2);
 const motive = 'Busqueda UI ' + MARK;
 const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
 try {
  const page = await browser.newPage(); page.setDefaultTimeout(30000);
  const patientRequests = [];
  page.on('request', request => { if (request.url().includes('/api/patients')) patientRequests.push(request.url()); });
  await page.goto(process.env.E2E_UI_URL || 'http://127.0.0.1:18081/');
  await page.getByLabel('Usuario', { exact: true }).fill(dts.name);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByRole('heading', { name: 'Nueva solicitud DTS' }).waitFor();
  assert.equal(patientRequests.length, 0, 'la apertura DTS no descarga el padrón');
  const form = page.locator('form').first();
  await form.getByLabel('Paciente').selectOption('search');
  await page.getByLabel('DNI exacto').fill(dni);
  const searchResponse = page.waitForResponse(r => r.url().includes('/api/patients/search?') && r.status() === 200);
  await page.getByRole('button', { name: 'Buscar paciente' }).click();
  await searchResponse;
  await page.getByText('DNI ••••' + dni.slice(-4)).waitFor();
  await page.getByRole('button', { name: 'Seleccionar' }).click();
  await page.getByText(/Paciente seleccionado: Lucia/).waitFor();
  for (const [kind, locality] of [['origen', localities[0]], ['destino', localities[1]]]) {
   await page.getByLabel(`Provincia ${kind}`).selectOption(String(province.id));
   await page.getByLabel(`Buscar localidad ${kind}`).fill(locality.nombre.slice(0, 5));
   await page.getByLabel(`Buscar localidad ${kind}`).focus();
   await page.getByRole('option', { name: new RegExp(locality.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  }
  const day = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  await form.getByLabel('Fecha y hora solicitada').fill(day + 'T12:00');
  await form.getByLabel('Diagnóstico').fill('Control');
  await form.getByLabel('Condición').fill('ESTABLE');
  await form.getByLabel('Motivo').fill(motive);
  const flightResponse = page.waitForResponse(r => r.url().endsWith('/api/flights') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Crear solicitud' }).click();
  assert.equal((await flightResponse).status(), 200);
  assert.equal(count(`SELECT COUNT(*) FROM vuelos v JOIN vuelos_sanitarios s ON s.id_vuelos=v.id_vuelos WHERE v.motivo_vuelo=N'${motive}' AND s.id_pacientes=${patient.id}`), 1);
  assert.ok(patientRequests.every(url => url.includes('/patients/search?')));
  const adminPage = await browser.newPage(); adminPage.setDefaultTimeout(30000);
  await adminPage.goto(process.env.E2E_UI_URL || 'http://127.0.0.1:18081/');
  await adminPage.getByLabel('Usuario', { exact: true }).fill(dotenv.BOOTSTRAP_ADMIN_USERNAME);
  await adminPage.getByLabel('Contraseña', { exact: true }).fill(dotenv.BOOTSTRAP_ADMIN_PASSWORD);
  await adminPage.getByRole('button', { name: 'Iniciar sesión' }).click();
  await adminPage.getByRole('heading', { name: 'Panel de administración' }).waitFor();
  await adminPage.locator('nav').getByText('Pacientes', { exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Identidad de pacientes' }).waitFor();
  await adminPage.getByLabel('DNI exacto').fill(dni);
  await adminPage.getByRole('button', { name: 'Buscar paciente' }).click();
  await adminPage.getByRole('button', { name: 'Revisar ficha' }).click();
  await adminPage.getByText('DNI: ' + dni).waitFor();
  await adminPage.getByLabel('Nombre corregido').fill('Luciana');
  await adminPage.getByLabel('Motivo de la corrección').fill('Documento original cotejado por administración');
  const updateResponse = adminPage.waitForResponse(r => r.url().endsWith(`/api/patients/${patient.id}/identity`) && r.request().method() === 'PUT');
  await adminPage.getByRole('button', { name: 'Guardar corrección' }).click();
  assert.equal((await updateResponse).status(), 200);
  await adminPage.getByText(/Identidad corregida/).waitFor();
  await adminPage.getByText(/Documento original cotejado por administración/).waitFor();
  assert.equal(one(`SELECT nombre_persona FROM personas WHERE id_personas=${patient.personId}`), 'Luciana');
  console.log('PASS: Chrome DTS y ADMIN, búsqueda contextual sin padrón, vuelo y corrección auditada en SQL Server');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
