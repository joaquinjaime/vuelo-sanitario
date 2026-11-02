/* E2E de navegador real (Chrome + Playwright) de la asignación de comandante y aeronave y de la ubicación operativa del comandante (V63), sobre el stack aislado
 * :18081 / :18080 y SQL Server E2E. Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados.
 *  - Administrador: registra la ubicación de un comandante (provincia → localidad) desde «Ubicación de comandantes»; el cambio persiste tras recargar.
 *  - Centro de Operaciones: ve el panel de asignación del vuelo con su acuerdo de horario; sin comandantes en la localidad la pantalla explica por qué; reserva un comandante
 *    de la localidad, confirma la aeronave, y la asignación sobrevive a una recarga; también asigna un comandante fuera de la localidad con excepción justificada.
 *  - Comandante: ve el vuelo asignado y puede continuar con su planificación.
 * Uso: node scripts/e2e-asignacion-recursos-ui.cjs (E2E_SHOT_DIR opcional guarda capturas) */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, MARK, PASSWORD, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const stateOf = (id) => one(`SELECT ISNULL(e.codigo_estado_vuelo,'NULL') FROM vuelos v LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${id}`);
const resourcesOf = (id) => one(`SELECT CONCAT(ISNULL(CAST(id_usuario_comandante AS varchar(20)),'-'),'|',ISNULL(CAST(id_aeronaves AS varchar(20)),'-')) FROM vuelos v WHERE id_vuelos=${id}`);

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 63);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const adminUser = { name: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD };
  console.log('Preparando cuentas y catálogos de ensayo…');
  const co = await createUser(admin, 'CENTRO_OPERACIONES', 'aiop'), dts = await createUser(admin, 'DTS', 'aidts');
  const cmdLocal = await createUser(admin, 'COMANDANTE', 'aicml'), cmdFar = await createUser(admin, 'COMANDANTE', 'aicmf');
  for (const c of [cmdLocal, cmdFar]) await provision(admin, c);
  let province, airports, localities;
  // La provincia del paciente no debe tener comandantes de otras corridas: así el comandante local es el único ordinario.
  for (const p of await ok('/catalogs/provinces', { token: co.token })) { if (count(`SELECT COUNT(*) FROM perfiles_comandante WHERE id_provincias=${p.id}`) > 0) continue; airports = await ok('/catalogs/airports?provinceId=' + p.id, { token: co.token }); localities = await ok('/catalogs/localities?provinceId=' + p.id, { token: co.token }); if (airports.length >= 2 && localities.length >= 2) { province = p; break; } }
  assert.ok(province, 'se necesita una provincia sin comandantes de otras corridas, con dos aeropuertos y dos localidades');
  const departure = localities[0], destination = localities[1];
  const farProvince = (await ok('/catalogs/provinces', { token: co.token })).find((p) => p.id !== province.id);
  await ok(`/commanders/${cmdFar.id}/location`, { method: 'PUT', token: admin, body: { provinciaId: farProvince.id, motivo: 'E2E UI' } });
  const plane = await ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'U1').toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const priority = (await ok('/catalogs/priorities', { token: dts.token }))[0].codigo;
  const approved = async () => {
    const patient = await ok('/patients', { method: 'POST', token: dts.token, body: { nombre: 'Asignacion', apellido: MARK, dni: String(20000000 + Math.floor(Math.random() * 9999999)) } });
    const f = (await call('/flights', { method: 'POST', token: dts.token, body: { patientId: patient.id, localidadOrigenId: departure.id, localidadDestinoId: destination.id, priorityCode: priority, motivoVuelo: 'UI asignación ' + MARK, fechaSolicitada: fmt(futureSlot()), extremaUrgencia: false, medical: { diagnostico: 'Dx-' + MARK, condicionMedica: 'ESTABLE', requiereEquipamientoEspecial: false } } })).data;
    await ok(`/flights/${f.id}/schedule/accept`, { method: 'POST', token: co.token }); return f;
  };
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (name, password = PASSWORD, workspace = null) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000);
    await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(password);
    const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const res = await r; if (!res.ok()) throw new Error('UI login HTTP ' + res.status());
    if (workspace) await p.getByRole('button', { name: workspace }).click({ timeout: 5000 }).catch(() => {});
    return p;
  };
  const openFlight = async (p, id) => { const card = p.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..'); await card.locator('select').first().selectOption(String(id), { timeout: 90000 }); };
  const snap = async (p, n) => { try { if (shots) await p.screenshot({ path: path.join(shots, n + '.png') }); } catch { /* opcional */ } };
  try {
    // ================= Administrador: ubicación operativa del comandante =================
    const adminPage = await login(adminUser.name, adminUser.password);
    await adminPage.getByRole('button', { name: 'Ubicación de comandantes' }).click();
    await adminPage.getByLabel('Buscar', { exact: true }).fill(cmdLocal.name);
    const row = adminPage.getByRole('row', { name: new RegExp(cmdLocal.name, 'i') });
    await row.waitFor(); assert.match(await row.innerText(), /Sin ubicación/);
    await row.getByRole('button', { name: /Registrar ubicación/ }).click();
    const form = adminPage.getByRole('form', { name: /Ubicación de/ });
    assert.equal(await form.getByLabel(/localidad/i).count(), 0, 'la interfaz no solicita una localidad');
    const options = await form.getByLabel('Provincia / Jurisdicción').locator('option').allInnerTexts();
    assert.ok(options.includes('Ciudad Autónoma de Buenos Aires') && options.includes('Buenos Aires') && options.length >= 25, 'las 23 provincias y CABA (diferenciada de Buenos Aires) están disponibles');
    await form.getByLabel('Provincia / Jurisdicción').selectOption(String(province.id));
    await form.getByLabel('Motivo del cambio (opcional)').fill('Alta de ubicación E2E UI');
    await snap(adminPage, 'ai01-admin-ubicacion');
    await form.getByRole('button', { name: 'Actualizar ubicación' }).click();
    await adminPage.getByText(/Ubicación de .* actualizada/).first().waitFor();
    const person = one(`SELECT id_personas FROM usuarios WHERE id_usuarios=${cmdLocal.id}`);
    assert.equal(count(`SELECT COUNT(*) FROM perfiles_comandante WHERE id_personas=${person} AND id_provincias=${province.id} AND fecha_ubicacion_actual IS NOT NULL AND id_usuario_ubicacion IS NOT NULL`), 1);
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'COMMANDER_PROFILE' AND operacion=N'COMMANDER_LOCATION_UPDATE' AND entidad_id=${person}`), 1);
    await adminPage.reload(); await adminPage.getByRole('button', { name: 'Ubicación de comandantes' }).click(); await adminPage.getByLabel('Buscar', { exact: true }).fill(cmdLocal.name);
    const reloaded = adminPage.getByRole('row', { name: new RegExp(cmdLocal.name, 'i') }); await reloaded.waitFor();
    assert.match(await reloaded.innerText(), new RegExp(province.nombre.replace(/[()]/g, '.'))); assert.match(await reloaded.innerText(), /Registrada/);
    pass('Administrador registra la ubicación de un comandante (sólo provincia o CABA, sin localidad); queda en SQL con responsable y fecha, auditada, y se ve igual tras recargar la aplicación');

    // ================= CO: asignación de comandante y aeronave =================
    const f1 = await approved(); const opsPage = await login(co.name);
    await opsPage.getByRole('button', { name: 'Gestión de vuelos' }).click();
    await openFlight(opsPage, f1.id);
    const panel = opsPage.getByRole('group', { name: 'Asignación de recursos' }); await panel.waitFor();
    assert.equal(await panel.getByText('Pendiente', { exact: true }).count(), 2);
    await snap(opsPage, 'ai02-co-panel-pendiente');
    // Estado vacío explicado: sin comandantes en la localidad (cmdLocal aún no fue reservado, pero se verifica con un vuelo de otra localidad más abajo).
    await panel.getByRole('button', { name: 'Seleccionar comandante' }).click();
    const radio = panel.getByRole('radio', { name: new RegExp(cmdLocal.name, 'i') }); await radio.check({ timeout: 90000 });
    await panel.getByRole('button', { name: 'Confirmar comandante' }).click();
    await opsPage.getByText('Comandante reservado: falta confirmar la aeronave').waitFor();
    assert.equal(stateOf(f1.id), 'NULL'); assert.equal(resourcesOf(f1.id), `${cmdLocal.id}|-`);
    await panel.getByText('Reservado — falta la aeronave').waitFor();
    await panel.getByText(province.nombre).first().waitFor(); // se muestra la jurisdicción operativa del comandante
    await panel.getByText('Elegibilidad geográfica').waitFor(); await panel.getByText(/Preliminar: se verificará al confirmar el aeropuerto de salida/).waitFor();
    await panel.getByRole('button', { name: 'Seleccionar aeronave' }).click();
    await panel.getByLabel('Aeronave disponible').selectOption(String(plane.id), { timeout: 150000 });
    await snap(opsPage, 'ai03-co-aeronave');
    await panel.getByRole('button', { name: 'Confirmar aeronave' }).click();
    await opsPage.getByText('Aeronave asignada').first().waitFor();
    assert.equal(stateOf(f1.id), 'PLANIFICADO'); assert.equal(resourcesOf(f1.id), `${cmdLocal.id}|${plane.id}`);
    await opsPage.reload(); await opsPage.getByRole('button', { name: 'Gestión de vuelos' }).click(); await openFlight(opsPage, f1.id);
    const after = opsPage.getByRole('group', { name: 'Asignación de recursos' }); await after.waitFor();
    assert.equal(await after.getByText('Asignado', { exact: true }).count() + await after.getByText('Asignada', { exact: true }).count(), 2);
    assert.ok(await after.getByText(plane.matricula).first().isVisible());
    await snap(opsPage, 'ai04-co-asignado');
    pass('CO: reserva un comandante de la jurisdicción (el vuelo no cambia de estado), confirma la aeronave y el vuelo queda PLANIFICADO; tras recargar la sesión la asignación persiste en pantalla y en SQL');

    // ================= CO: sin comandantes en la localidad + excepción justificada =================
    const f2 = await approved();
    const plane2 = await ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'U2').toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
    await openFlight(opsPage, f2.id);
    const panel2 = opsPage.getByRole('group', { name: 'Asignación de recursos' }); await panel2.getByRole('button', { name: 'Seleccionar comandante' }).click();
    // cmdLocal ya está comprometido con f1: no queda ningún comandante ordinario y la pantalla lo explica.
    await panel2.getByText(/No se encontraron comandantes disponibles en/).first().waitFor({ timeout: 90000 });
    assert.ok(await panel2.getByText(/no cumplen las condiciones operativas|no cumple las condiciones operativas/).first().isVisible(), 'explica que el comandante de la jurisdicción no está disponible');
    await snap(opsPage, 'ai05-co-sin-candidatos');
    await panel2.locator('details.resource-exceptions').evaluate((d) => { d.open = true; });
    await panel2.getByLabel('Buscar comandante').fill(cmdFar.name); await panel2.getByRole('button', { name: 'Buscar', exact: true }).click();
    await panel2.getByRole('radio', { name: new RegExp(cmdFar.name, 'i') }).check({ timeout: 60000 });
    const justification = panel2.getByLabel(/Justificación de la excepción geográfica/);
    const confirmException = panel2.getByRole('button', { name: 'Confirmar asignación excepcional' });
    assert.ok(await confirmException.isDisabled(), 'sin justificación no se puede confirmar');
    await justification.fill('Sin otro comandante habilitado'); await justification.fill('Sin otro comandante habilitado en Tucumán ' + MARK);
    await snap(opsPage, 'ai06-co-excepcion');
    await confirmException.click(); await opsPage.getByText('Comandante reservado: falta confirmar la aeronave').waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM excepciones_geograficas_comandante WHERE id_vuelos=${f2.id} AND id_usuario_comandante=${cmdFar.id} AND id_usuario_autoriza=${co.id} AND tipo_excepcion=N'OTRA_PROVINCIA' AND motivo LIKE N'%${MARK}'`), 1);
    await panel2.getByText(/Excepción geográfica/).first().waitFor({ timeout: 30000 });
    await panel2.getByRole('button', { name: 'Seleccionar aeronave' }).click(); await panel2.getByLabel('Aeronave disponible').selectOption(String(plane2.id), { timeout: 150000 }); await panel2.getByRole('button', { name: 'Confirmar aeronave' }).click();
    await opsPage.getByText('Aeronave asignada').first().waitFor(); assert.equal(stateOf(f2.id), 'PLANIFICADO');
    pass('CO: sin comandantes disponibles en la jurisdicción la pantalla lo explica; asigna uno de otra provincia sólo con la excepción justificada, que queda registrada y visible junto a la asignación');

    // ================= Comandante: ve el vuelo asignado =================
    const cmdPage = await login(cmdLocal.name);
    await cmdPage.getByRole('button', { name: 'Gestión de vuelos' }).click();
    await cmdPage.getByRole('heading', { name: 'Planificación operativa', exact: true }).waitFor();
    const planning = cmdPage.getByRole('heading', { name: 'Planificación operativa', exact: true }).locator('..');
    await planning.locator('select').first().selectOption(String(f1.id), { timeout: 60000 });
    await planning.getByText('Aeropuertos del vuelo').waitFor({ timeout: 60000 });
    await snap(cmdPage, 'ai07-comandante');
    pass('Comandante: el vuelo asignado aparece en su planificación operativa con los aeropuertos para revisar y puede continuar con el procedimiento');

    // ================= CO propone aeropuertos; el comandante los revisa y confirma =================
    await openFlight(opsPage, f1.id);
    const airportsPanel = opsPage.getByRole('group', { name: 'Aeropuertos del vuelo' }); await airportsPanel.waitFor();
    await airportsPanel.getByText('Origen del paciente (solicitud de DTS)').waitFor(); await airportsPanel.getByText(`${departure.nombre}, ${province.nombre}`).first().waitFor();
    await airportsPanel.getByRole('button', { name: 'Proponer aeropuerto de salida' }).click();
    const firstAirport = airportsPanel.getByRole('radio').first(); await firstAirport.check({ timeout: 90000 });
    await snap(opsPage, 'ai08-co-aeropuertos');
    await airportsPanel.getByRole('button', { name: 'Proponer aeropuerto de salida' }).click();
    await opsPage.getByText(/Aeropuerto de salida propuesto: queda pendiente de confirmación del comandante/).waitFor();
    assert.equal(one(`SELECT estado_aeropuerto_origen FROM vuelos WHERE id_vuelos=${f1.id}`), 'PROPUESTO'); assert.equal(count(`SELECT COUNT(*) FROM vuelos_sanitarios WHERE id_vuelos=${f1.id} AND id_localidad_origen=${departure.id} AND id_localidad_destino=${destination.id}`), 1, 'las localidades del paciente no se modifican');
    await airportsPanel.getByText('Propuesto').first().waitFor();
    pass('CO: propone el aeropuerto de salida (pendiente de confirmación) sin tocar las localidades del paciente');
    await cmdPage.reload(); await cmdPage.getByRole('button', { name: 'Gestión de vuelos' }).click();
    const planning2 = cmdPage.getByRole('heading', { name: 'Planificación operativa', exact: true }).locator('..');
    await planning2.locator('select').first().selectOption(String(f1.id), { timeout: 60000 });
    await planning2.getByText(/Centro de Operaciones propuso estos aeropuertos/).waitFor({ timeout: 60000 });
    await planning2.getByRole('button', { name: 'Elegir otro aeropuerto de llegada' }).click();
    await planning2.getByRole('radio').first().check({ timeout: 60000 });
    const salidaF = one(`SELECT CONVERT(varchar(16),fecha_planificada_salida,126) FROM vuelos WHERE id_vuelos=${f1.id}`);
    await planning2.getByLabel('Llegada planificada').fill(fmt(new Date(new Date(salidaF).getTime() + 3 * 3600000)).slice(0, 16));
    await snap(cmdPage, 'ai09-comandante-aeropuertos');
    await planning2.getByRole('button', { name: 'Confirmar aeropuertos y guardar planificación' }).click();
    await cmdPage.getByText('Aeropuertos confirmados y planificación guardada').waitFor();
    assert.equal(one(`SELECT CONCAT(estado_aeropuerto_origen,'|',estado_aeropuerto_destino) FROM vuelos WHERE id_vuelos=${f1.id}`), 'CONFIRMADO|CONFIRMADO');
    pass('Comandante: revisa lo propuesto por CO, elige el aeropuerto de llegada y confirma ambos; quedan CONFIRMADOS en SQL Server');

    console.log(`\nE2E de asignación de recursos (navegador): ${passed} bloques correctos.`);
  } finally { await browser.close(); }
})().catch((e) => { console.error('FALLO:', e.stack || e.message); process.exit(1); });
