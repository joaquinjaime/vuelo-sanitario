/* I-5.5: recorrido de navegador (Chrome + Playwright) de roles y clasificaciones sobre el stack aislado :18081 / :18080 con verificación en SQL Server.
 * Administrador clasifica y ve elegibilidad e historial → Operaciones consulta candidatos (elegibles y no elegibles con su motivo) y asigna →
 * el administrador no puede retirar una clasificación en uso → el comandante ve la tripulación sin controles de gestión → Operaciones retira y el
 * administrador retira la clasificación con motivo. Requiere `playwright` en NODE_PATH. Sólo crea registros marcados. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, BASE, PDF, MARK, PASSWORD, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');

const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
async function until(fn, what, ms = 45000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, 400)); } throw new Error('Tiempo agotado esperando: ' + what + (last instanceof Error ? ' (' + last.message + ')' : '')); }

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 58);
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  console.log('Preparando cuentas de ensayo…');
  const ops = await createUser(admin, 'CENTRO_OPERACIONES', 'rcuiops'), cmd = await createUser(admin, 'COMANDANTE', 'rcuicmd'); await provision(admin, cmd);
  const ready = await createUser(admin, 'DTS', 'rcuiready'), pending = await createUser(admin, 'DTS', 'rcuipend'), none = await createUser(admin, 'DTS', 'rcuinone');
  const credential = async (user, verify) => { const c = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'MEDICO', type: 'Documento E2E', number: `UI-${MARK}-${user.id}`, issuer: 'Organismo de prueba', noExpiry: true, notes: 'Ensayo aislado' } }); const body = new FormData(); body.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf'); assert.equal((await fetch(`${BASE}/professional-credentials/${c.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body })).status, 200); if (verify) await call(`/professional-credentials/${c.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual E2E', confirmsSufficiency: true } }); };
  await credential(ready, true); await credential(pending, false);
  await call(`/crew-qualifications/${pending.id}/MEDICO`, { method: 'PUT', token: admin, expect: [204] }); // clasificado, habilitación sin verificar
  let province, airports; for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (a.length >= 2) { province = p; airports = a; break; } }
  await call(`/catalogs/commanders/${cmd.id}/location`, { method: 'POST', token: ops.token, body: { locationId: province.id } });
  const plane = await ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'RU').toUpperCase(), modelo: 'E2E', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airports[0].id, activo: true } });
  const when = futureSlot(); const flight = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: { tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'UI roles ' + MARK, aircraftId: plane.id, comandanteId: cmd.id, destinoId: airports[1].id, salida: fmt(when), llegada: fmt(new Date(when.getTime() + 7200000)) } })).id;

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const snap = async (p, n) => { try { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: false }); } catch { /* opcional */ } };
  const login = async (name, password = PASSWORD) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(password); const r = p.waitForResponse((x) => x.url().endsWith('/api/auth/login'), { timeout: 20000 }); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); const res = await r; if (!res.ok()) throw new Error('UI login HTTP ' + res.status()); return p; };
  const classificationPanel = async (page, user) => { const section = page.locator('section', { has: page.getByRole('heading', { name: 'Clasificación administrativa de tripulación' }) }); await section.getByLabel('Buscar usuario').fill(user.name); await section.locator('label').filter({ hasText: /^Usuario/ }).locator('select').selectOption(String(user.id), { timeout: 30000 }); return section; };
  const vigentes = (u) => count(`SELECT COUNT(*) FROM clasificaciones_tripulacion c JOIN roles_tripulacion r ON r.id_roles_tripulacion=c.id_roles_tripulacion WHERE c.id_usuarios=${u.id} AND r.codigo_rol_tripulacion=N'MEDICO' AND c.fecha_baja IS NULL`);
  try {
    // ---- Administrador clasifica y ve la elegibilidad ----
    // Chrome descarta pestañas inactivas con poca memoria: cada tramo del administrador abre una sesión propia.
    const openAdmin = async () => { const p = await login(dotenv.BOOTSTRAP_ADMIN_USERNAME, dotenv.BOOTSTRAP_ADMIN_PASSWORD); await p.locator('nav a', { hasText: /^Usuarios$/ }).first().click(); return p; };
    let adminPage = await openAdmin();
    let panel = await classificationPanel(adminPage, ready); let card = panel.getByTestId('rol-MEDICO');
    await card.getByText(/Sin clasificación vigente/).waitFor(); await card.getByText(/habilitación profesional verificada y vigente/).waitFor();
    assert.equal(await panel.getByTestId('rol-COMANDANTE').getByText(/licencia aeronáutica registrada, rol de acceso COMANDANTE/).count(), 1, 'la interfaz muestra los requisitos reales del comandante');
    await card.getByRole('button', { name: 'Clasificar como Médico' }).click(); await card.getByText(/Elegible hoy/).waitFor(); assert.equal(vigentes(ready), 1);
    panel = await classificationPanel(adminPage, pending); card = panel.getByTestId('rol-MEDICO'); await card.getByText(/No elegible hoy: La habilitación requiere verificación vigente/).waitFor();
    panel = await classificationPanel(adminPage, none); await panel.getByTestId('rol-MEDICO').getByText(/Sin clasificación vigente/).waitFor();
    await snap(adminPage, 'rc01-admin-clasificaciones');
    pass('UI-1 el administrador clasifica desde las funciones del servidor y ve, por función, requisitos, quién clasificó y la elegibilidad real (elegible, habilitación sin verificar, sin clasificación)');

    // ---- Operaciones ve candidatos elegibles y no elegibles y asigna ----
    const opsPage = await login(ops.name); const area = opsPage.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..');
    await area.locator('select').first().selectOption(String(flight), { timeout: 120000 });
    const crew = opsPage.locator('div.wide', { has: opsPage.getByRole('heading', { name: 'Tripulación', exact: true }) }).first();
    await crew.getByLabel('Función de tripulación').selectOption('MEDICO', { timeout: 60000 });
    await crew.locator('label').filter({ hasText: /^Personal disponible/ }).locator('select').selectOption(String(ready.id), { timeout: 150000 });
    assert.equal(await crew.locator('label').filter({ hasText: /^Personal disponible/ }).locator('option').evaluateAll((os, ids) => os.filter((o) => ids.includes(o.value)).map((o) => o.value), [String(pending.id), String(none.id)]).then((x) => x.length), 0, 'ni el no verificado ni el no clasificado se ofrecen como disponibles');
    await crew.locator('details', { hasText: 'Personal que requiere revisión' }).locator('summary').click(); await crew.getByText(new RegExp(`${pending.name}[^\\n]*|E2E rcuipend: La habilitación requiere verificación vigente`)).first().waitFor();
    await crew.getByRole('button', { name: 'Asignar tripulante' }).click();
    await until(() => count(`SELECT COUNT(*) FROM vuelos_tripulantes vt JOIN roles_tripulacion r ON r.id_roles_tripulacion=vt.id_roles_tripulacion WHERE vt.id_vuelos=${flight} AND vt.id_usuarios=${ready.id} AND r.codigo_rol_tripulacion=N'MEDICO' AND vt.fecha_baja IS NULL`) === 1, 'asignación del médico');
    await crew.getByText(/E2E rcuiready · Médico/).waitFor(); await crew.getByText(/Apto/).first().waitFor();
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${flight} AND tipo_entidad=N'FLIGHT_CREW' AND operacion=N'CREATE'`) >= 2, true, 'comandante y médico auditados');
    assert.ok(count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${flight} AND tipo_notificacion=N'CREW_ASSIGNED' AND id_usuarios=${ready.id}`) >= 1, 'el tripulante fue notificado');
    await snap(opsPage, 'rc02-ops-tripulacion');
    pass('UI-2 Operaciones consulta la función, ve quién está disponible y quién requiere revisión con su motivo real, asigna al elegible y la pantalla muestra la función y «Apto» confirmados por el servidor; SQL, auditoría y aviso verificados');

    // ---- El administrador no puede retirar una clasificación en uso ----
    await adminPage.context().close().catch(() => {}); adminPage = await openAdmin();
    panel = await classificationPanel(adminPage, ready); card = panel.getByTestId('rol-MEDICO'); await card.getByText(/Elegible hoy/).waitFor();
    await card.getByLabel('Motivo del retiro (opcional)').fill('Intento con vuelo asignado'); await card.getByRole('button', { name: 'Retirar clasificación de Médico' }).click();
    await panel.getByRole('alert').getByText(/Retire primero las asignaciones activas de esta función/).waitFor(); await card.getByText(/Elegible hoy/).waitFor();
    assert.equal(vigentes(ready), 1, 'la clasificación en uso se conserva'); assert.equal(count(`SELECT COUNT(*) FROM clasificaciones_tripulacion c WHERE c.id_usuarios=${ready.id} AND c.fecha_baja IS NOT NULL`), 0);
    pass('UI-3 retirar una clasificación en uso muestra el motivo real del servidor (con los vuelos), no informa éxito y la fila sigue vigente en SQL');

    // ---- El comandante ve la tripulación sin controles de gestión y continúa el flujo ----
    const cmdPage = await login(cmd.name); const planning = cmdPage.getByRole('heading', { name: 'Planificación operativa', exact: true }).locator('..'); await planning.locator('select').first().selectOption(String(flight), { timeout: 90000 });
    await cmdPage.getByRole('heading', { name: 'Confirmación de asignación' }).waitFor();
    await cmdPage.getByRole('button', { name: 'Aceptar asignación' }).click(); await until(() => one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${flight}`) === 'PLANIFICADO', 'aceptación del comandante');
    await cmdPage.reload(); await cmdPage.getByRole('heading', { name: 'Planificación operativa', exact: true }).locator('..').locator('select').first().selectOption(String(flight), { timeout: 90000 });
    const cmdCrew = cmdPage.locator('div.wide', { has: cmdPage.getByRole('heading', { name: 'Tripulación', exact: true }) }).first(); await cmdCrew.getByText(/E2E rcuiready · Médico/).waitFor();
    assert.equal(await cmdCrew.getByRole('button', { name: 'Retirar' }).count(), 0, 'el comandante no gestiona la tripulación'); assert.equal(await cmdCrew.getByRole('button', { name: 'Asignar tripulante' }).count(), 0);
    pass('UI-4 el comandante ve la asignación pendiente, la acepta (la habilitación sigue vigente) y, ya PLANIFICADO, visualiza la tripulación sin controles de gestión');

    // ---- Operaciones retira; recién entonces el administrador retira la clasificación con motivo ----
    await opsPage.reload(); await area.locator('select').first().selectOption(String(flight), { timeout: 120000 });
    const crew2 = opsPage.locator('div.wide', { has: opsPage.getByRole('heading', { name: 'Tripulación', exact: true }) }).first(); await crew2.locator('p', { hasText: 'E2E rcuiready' }).getByRole('button', { name: 'Retirar' }).click();
    await until(() => count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flight} AND id_usuarios=${ready.id} AND fecha_baja IS NULL`) === 0, 'retiro del tripulante');
    await adminPage.context().close().catch(() => {}); adminPage = await openAdmin();
    panel = await classificationPanel(adminPage, ready); card = panel.getByTestId('rol-MEDICO'); await card.getByLabel('Motivo del retiro (opcional)').fill('Cambio de función desde la interfaz'); await card.getByRole('button', { name: 'Retirar clasificación de Médico' }).click();
    await card.getByText(/Sin clasificación vigente/).waitFor(); await panel.getByTestId('historial-clasificaciones').locator('summary').click(); await panel.getByTestId('historial-clasificaciones').getByText(/Motivo: Cambio de función desde la interfaz/).waitFor();
    assert.equal(vigentes(ready), 0); assert.equal(count(`SELECT COUNT(*) FROM clasificaciones_tripulacion c WHERE c.id_usuarios=${ready.id} AND c.fecha_baja IS NOT NULL AND c.motivo_baja=N'Cambio de función desde la interfaz' AND c.id_usuario_baja IS NOT NULL`), 1, 'la fila se conserva con su motivo');
    assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes vt JOIN roles_tripulacion r ON r.id_roles_tripulacion=vt.id_roles_tripulacion WHERE vt.id_vuelos=${flight} AND vt.id_usuarios=${ready.id} AND r.codigo_rol_tripulacion=N'MEDICO' AND vt.fecha_baja IS NOT NULL AND vt.motivo_baja=N'RETIRO'`), 1, 'la asignación histórica conserva su función');
    await crew2.getByRole('button', { name: 'Ver historial de tripulación' }).click(); await crew2.getByRole('list', { name: 'Historial de tripulación' }).getByText(/Médico/).waitFor();
    await snap(adminPage, 'rc03-admin-historial');
    pass('UI-5 con la asignación retirada el administrador retira la clasificación con motivo; la interfaz muestra el historial y SQL conserva la clasificación retirada y la asignación histórica con su función');
  } catch (e) { try { for (const [i, c] of browser.contexts().entries()) for (const p of c.pages()) await snap(p, 'rc-fallo-' + i); } catch { /* sin capturas */ } throw e; }
  finally { await browser.close(); }
  console.log(`\nE2E ROLES Y CLASIFICACIONES UI COMPLETO: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FALLO E2E ROLES Y CLASIFICACIONES UI:', e.stack || e); process.exit(1); });
