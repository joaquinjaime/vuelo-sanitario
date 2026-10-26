/* E2E de navegador real (Chrome + Playwright) de la administración de aeronaves y la tripulación adicional sobre el stack aislado
 * :18081 / :18080 (base vuelos_sanitarios_e2e). Administrador, Centro de Operaciones y Comandante ejecutan los procesos desde la
 * interfaz; cada paso se verifica en SQL Server y se recarga la página para comprobar la persistencia.
 * Requiere `playwright` resoluble (NODE_PATH) y Chrome (E2E_CHROME opcional). Sólo crea datos marcados. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { ROOT, MARK, PASSWORD, PDF, BASE, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy } = require('./e2e-cierre-support.cjs');
const { chromium } = require('playwright');
const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
const HOUR = 3600000;
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const planeId = (plate) => Number(one(`SELECT id_aeronaves FROM aeronaves WHERE matricula=N'${plate}'`));
const planeRow = (id) => sql(`SELECT matricula, modelo, esta_activa, id_aeropuertos, capacidad_tripulacion FROM aeronaves WHERE id_aeronaves=${id}`).split('|').map((x) => x.trim());
const aircraftOf = (id) => Number(one(`SELECT ISNULL(id_aeronaves,0) FROM vuelos WHERE id_vuelos=${id}`));
const activeCrew = (flightId) => count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${flightId} AND fecha_baja IS NULL`);
const crewState = (flightId, user) => sql(`SELECT TOP 1 ISNULL(CONVERT(varchar(30),fecha_baja,121),'NULL'), ISNULL(motivo_baja,'NULL') FROM vuelos_tripulantes WHERE id_vuelos=${flightId} AND id_usuarios=${user.id} ORDER BY id_vuelos_tripulantes DESC`).split('|').map((x) => x.trim());
const at = (d, h) => new Date(d.getTime() + h * HOUR);

async function provisionRole(admin, user, roleCode) {
  await call(`/crew-qualifications/${user.id}/${roleCode}`, { method: 'PUT', token: admin, expect: [204] });
  const credential = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode, type: 'Documento de prueba', number: 'UI-' + roleCode + '-' + user.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
  const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
  const up = await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form }); assert.equal(up.status, 200);
  await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
}

(async () => {
  assert.ok(Number(one('SELECT MAX(CAST(version AS int)) FROM flyway_schema_history WHERE version IS NOT NULL')) >= 47); await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } }
  const adminLogin = await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } }); const admin = adminLogin.accessToken;
  const adminUser = await createUser(admin, 'ADMINISTRADOR', 'uadm'), ops = await createUser(admin, 'CENTRO_OPERACIONES', 'uops');
  const cmdU = await createUser(admin, 'COMANDANTE', 'ucmdu'), cmdV = await createUser(admin, 'COMANDANTE', 'ucmdv'), cmdW = await createUser(admin, 'COMANDANTE', 'ucmdw');
  for (const c of [cmdU, cmdV, cmdW]) await provision(admin, c);
  const med1 = await createUser(admin, 'DTS', 'umed1'), med2 = await createUser(admin, 'DTS', 'umed2'); await provisionRole(admin, med1, 'MEDICO'); await provisionRole(admin, med2, 'MEDICO');
  let province, airports;
  for (const p of await ok('/catalogs/provinces', { token: ops.token })) { const a = await ok('/catalogs/airports?provinceId=' + p.id, { token: ops.token }); if (a.length >= 3) { province = p; airports = a; break; } }
  for (const c of [cmdU, cmdV, cmdW]) await call(`/catalogs/commanders/${c.id}/location`, { method: 'POST', body: { locationId: province.id }, token: ops.token });
  const [A0, A1, A2] = airports; let seq = 0;
  const plane = async (airport = A0) => ok('/catalogs/aircraft', { method: 'POST', token: admin, body: { matricula: (MARK + 'U' + (++seq)).toUpperCase(), modelo: 'UI', tipo: 'PRUEBA', capacidadPacientes: 1, capacidadTripulacion: 4, aeropuertoActualId: airport.id, activo: true } });
  const body = (p, c, dest, from, to) => ({ tipoVueloCode: 'REGRESO_BASE', motivoVuelo: 'UI aeronaves ' + MARK, aircraftId: p.id, comandanteId: c.id, destinoId: dest.id, salida: fmt(from), llegada: fmt(to) });
  const pU = await plane(), pQ = await plane(A2), pBusy = await plane(A2), pX = await plane();
  const s = futureSlot(); s.setHours(9, 0, 0, 0);
  const fU = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: body(pU, cmdU, A1, s, at(s, 3)) })).id; await ok(`/flights/${fU}/commander-assignment/response`, { method: 'POST', token: cmdU.token, body: { aceptar: true } });
  const fBusy = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: body(pBusy, cmdW, A1, at(s, 1), at(s, 2)) })).id; // ocupa pBusy durante fU
  const fOverlap = (await ok('/flights/operational', { method: 'POST', token: ops.token, body: body(pX, cmdV, A1, at(s, 1), at(s, 2)) })).id; await ok(`/flights/${fOverlap}/commander-assignment/response`, { method: 'POST', token: cmdV.token, body: { aceptar: true } });
  await call(`/flights/${fOverlap}/crew`, { method: 'POST', token: ops.token, body: { userId: med1.id, crewRoleCode: 'MEDICO' }, expect: [204] }); // med1 queda comprometido durante fU

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }); const shots = process.env.E2E_SHOT_DIR;
  const login = async (name) => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); p.setDefaultTimeout(60000); await p.goto(UI); await p.getByLabel('Usuario', { exact: true }).fill(name); await p.getByLabel('Contraseña', { exact: true }).fill(PASSWORD); await p.getByRole('button', { name: 'Iniciar sesión' }).click(); return p; };
  const snap = async (p, n) => { if (shots) await p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true }); };
  const toast = async (p, text) => p.getByText(text, { exact: false }).first().waitFor();
  try {
    // ---- Administrador ----
    const a = await login(adminUser.name);
    await a.getByRole('heading', { name: 'Panel de administración' }).waitFor();
    assert.equal(await a.locator('table').count(), 0, 'el dashboard principal no contiene listados extensos'); assert.ok(await a.getByRole('button', { name: /Añadir aeronave/ }).isVisible()); assert.ok(await a.getByRole('button', { name: /Añadir usuario/ }).isVisible()); await snap(a, 'a01-dashboard');
    const plate = (MARK + 'UIA').toUpperCase();
    await a.getByRole('button', { name: /Añadir aeronave/ }).click();
    const fill = async (label, value) => a.getByLabel(label, { exact: true }).fill(String(value));
    await fill('Matrícula', plate.toLowerCase()); await fill('Modelo', 'King Air UI'); await fill('Tipo', 'Turbohélice'); await fill('Capacidad de pacientes', 2); await fill('Capacidad de tripulación', 0);
    await a.getByLabel('Buscar aeropuerto').fill(A0.nombre.slice(0, 12)); await a.getByLabel('Ubicación inicial').selectOption(String(A0.id), { timeout: 60000 });
    await a.getByRole('button', { name: 'Registrar aeronave' }).click(); await a.waitForTimeout(700); assert.equal(await a.getByLabel('Capacidad de tripulación', { exact: true }).evaluate((e) => e.validity.rangeUnderflow), true, 'el navegador rechaza la capacidad 0'); assert.ok(await a.getByRole('dialog').isVisible()); assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE matricula=N'${plate}'`), 0, 'la validación del formulario impide el alta inválida');
    await fill('Capacidad de tripulación', 3); await a.getByRole('button', { name: 'Registrar aeronave' }).click(); await toast(a, '✓ Aeronave registrada');
    const newId = planeId(plate); assert.deepEqual(planeRow(newId), [plate, 'King Air UI', '1', String(A0.id), '3']);
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria a JOIN usuarios u ON u.id_usuarios=a.id_usuario_actor WHERE a.tipo_entidad=N'AIRCRAFT' AND a.entidad_id=${newId} AND a.operacion=N'CREATE' AND u.nombre_usuario=N'${adminUser.name}'`), 1);
    await a.locator('nav a', { hasText: 'Aeronaves' }).click(); await a.getByRole('heading', { name: 'Aeronaves', exact: true }).first().waitFor(); await a.locator('tr', { hasText: plate }).waitFor(); await snap(a, 'a02-aeronaves');
    await a.reload(); await a.locator('nav a', { hasText: 'Aeronaves' }).click(); await a.locator('tr', { hasText: plate }).waitFor(); assert.equal(await a.locator('tr', { hasText: plate }).getByText('Activa · sin asignaciones').count(), 1, 'tras recargar la aeronave persiste');
    pass('UI-1 Administrador: dashboard ordenado (accesos rápidos sin listados), validación de capacidades en el formulario, alta de aeronave con auditoría del actor y persistencia tras recargar');
    // duplicado
    await a.getByRole('button', { name: 'Nueva aeronave' }).click(); await fill('Matrícula', plate); await fill('Modelo', 'M'); await fill('Tipo', 'T'); await a.getByLabel('Buscar aeropuerto').fill(A0.nombre.slice(0, 12)); await a.getByLabel('Ubicación inicial').selectOption(String(A0.id), { timeout: 60000 });
    await a.getByRole('button', { name: 'Registrar aeronave' }).click(); await a.getByRole('alert').filter({ hasText: 'Ya existe una aeronave' }).waitFor(); assert.ok(await a.getByRole('dialog').isVisible(), 'el formulario queda abierto con el error'); assert.equal(count(`SELECT COUNT(*) FROM aeronaves WHERE UPPER(matricula)=N'${plate}'`), 1);
    await a.getByRole('button', { name: 'Cancelar' }).click();
    // edición
    await a.locator('tr', { hasText: plate }).getByRole('button', { name: 'Editar' }).click(); assert.equal(await a.getByLabel('Ubicación inicial').count(), 0, 'la edición no modifica la ubicación'); await fill('Modelo', 'King Air B350 UI'); await a.getByRole('button', { name: 'Guardar cambios' }).click(); await toast(a, '✓ Aeronave actualizada');
    assert.equal(planeRow(newId)[1], 'King Air B350 UI'); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'AIRCRAFT' AND entidad_id=${newId} AND operacion=N'UPDATE'`), 1);
    // ubicación
    await a.locator('tr', { hasText: plate }).getByRole('button', { name: 'Ubicación' }).click(); await a.getByLabel('Buscar aeropuerto').fill(A1.nombre.slice(0, 12)); await a.getByLabel('Nueva ubicación').selectOption(String(A1.id), { timeout: 60000 }); await a.getByLabel('Motivo (opcional)').fill('Traslado en tierra UI');
    await a.getByRole('button', { name: 'Confirmar cambio de ubicación' }).click(); await toast(a, `Ubicación de ${plate} actualizada`); assert.equal(planeRow(newId)[3], String(A1.id));
    const ev = sql(`SELECT valores_anteriores, valores_nuevos FROM eventos_auditoria WHERE tipo_entidad=N'AIRCRAFT' AND entidad_id=${newId} AND operacion=N'MANUAL_LOCATION_CHANGE'`); assert.ok(ev.includes(`"aeropuertoActualId":${A0.id}`) && ev.includes(`"aeropuertoActualId":${A1.id}`) && ev.includes('Traslado en tierra UI'));
    // aeronave con vuelos comprometidos: ni baja ni ubicación
    await a.reload(); await a.locator('nav a', { hasText: 'Aeronaves' }).click(); await a.locator('tr', { hasText: pU.matricula }).waitFor();
    await a.locator('tr', { hasText: pU.matricula }).getByRole('button', { name: 'Desactivar' }).click(); await toast(a, 'tiene vuelos asignados'); assert.equal(planeRow(pU.id)[2], '1', 'la baja rechazada no modifica la aeronave'); await snap(a, 'a03-baja-rechazada');
    await a.locator('tr', { hasText: pU.matricula }).getByRole('button', { name: 'Ubicación' }).click(); await a.getByLabel('Buscar aeropuerto').fill(A2.nombre.slice(0, 12)); await a.getByLabel('Nueva ubicación').selectOption(String(A2.id), { timeout: 60000 }); await a.getByRole('button', { name: 'Confirmar cambio de ubicación' }).click(); await a.getByRole('alert').filter({ hasText: 'contradice vuelos' }).waitFor(); assert.equal(planeRow(pU.id)[3], String(A0.id)); await a.getByRole('button', { name: 'Cancelar' }).click();
    pass('UI-2 Administrador: matrícula duplicada informada dentro del formulario sin falso éxito, edición de datos, cambio de ubicación auditado (anterior/nueva/motivo) y rechazo de baja y de reubicación de una aeronave con vuelos asignados, sin modificar datos');
    // baja y reactivación
    await a.locator('tr', { hasText: plate }).getByRole('button', { name: 'Desactivar' }).click(); await toast(a, `✓ Aeronave ${plate} desactivada`); assert.equal(planeRow(newId)[2], '0');
    await a.reload(); await a.locator('nav a', { hasText: 'Aeronaves' }).click(); assert.equal(await a.locator('tr', { hasText: plate }).count(), 0, 'la aeronave desactivada sale del listado activo'); await a.getByRole('button', { name: /Aeronaves desactivadas/ }).click(); await a.locator('tr', { hasText: plate }).waitFor(); assert.equal(await a.locator('tr', { hasText: plate }).getByText('Desactivada').count(), 1); await snap(a, 'a04-desactivadas');
    await a.locator('tr', { hasText: plate }).getByRole('button', { name: 'Detalle' }).click(); await a.getByText('Historial administrativo').waitFor(); await a.getByText('Cambio de estado').first().waitFor(); await a.getByText('Cambio manual de ubicación').first().waitFor(); await a.getByText('Alta', { exact: false }).first().waitFor(); await snap(a, 'a05-detalle'); await a.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await a.locator('tr', { hasText: plate }).getByRole('button', { name: 'Reactivar' }).click(); await toast(a, `✓ Aeronave ${plate} reactivada`); assert.equal(planeRow(newId)[2], '1'); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE tipo_entidad=N'AIRCRAFT' AND entidad_id=${newId} AND operacion=N'SET_ACTIVE'`), 2);
    pass('UI-3 Administrador: baja lógica con confirmación, listado de desactivadas tras recargar, detalle con historial administrativo y reactivación (todo auditado y persistido)');
    await a.context().close();

    // ---- Centro de Operaciones ----
    const o = await login(ops.name); await o.getByRole('heading', { name: 'Centro de Operaciones' }).waitFor();
    const select = async (page, flightId) => { const card = o.getByRole('heading', { name: 'Centro de Operaciones', exact: true }).locator('..'); await card.locator('select').first().selectOption(String(flightId), { timeout: 90000 }); await o.getByLabel('Aeronave del vuelo').waitFor(); return card; };
    await select(o, fU); await o.getByLabel('Aeronave del vuelo').getByText(pU.matricula).waitFor(); await snap(o, 'o01-vuelo');
    await o.getByRole('button', { name: 'Cambiar aeronave' }).click(); await o.getByLabel('Aeronave disponible').waitFor();
    assert.equal(await o.getByLabel('Aeronave disponible').locator(`option[value="${pQ.id}"]`).count(), 1, 'se ofrece la aeronave libre'); assert.equal(await o.getByLabel('Aeronave disponible').locator(`option[value="${pBusy.id}"]`).count(), 0, 'la ocupada no es seleccionable');
    const block = o.getByLabel('Aeronave del vuelo'); await block.getByText(/No disponibles \(/).click(); await block.getByText(pBusy.matricula).waitFor(); assert.ok((await block.getByText(/comprometido en el horario/).first().textContent()).includes(pBusy.matricula), 'se explica el conflicto de disponibilidad'); await snap(o, 'o02-candidatas');
    await o.getByLabel('Aeronave disponible').selectOption(String(pQ.id)); await o.getByLabel('Motivo del cambio (opcional)').fill('Mantenimiento UI'); await o.getByRole('button', { name: 'Confirmar cambio de aeronave' }).click(); await toast(o, `✓ Aeronave del vuelo cambiada a ${pQ.matricula}`);
    assert.equal(aircraftOf(fU), pQ.id); assert.equal(one(`SELECT e.codigo_estado_vuelo FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo WHERE v.id_vuelos=${fU}`), 'PENDIENTE_CONFIRMACION_COMANDANTE', 'cambió el aeropuerto de origen: el comandante debe confirmar de nuevo');
    assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${fU} AND operacion=N'CHANGE_AIRCRAFT'`), 1); assert.equal(count(`SELECT COUNT(*) FROM notificaciones WHERE id_vuelos=${fU} AND tipo_notificacion=N'AIRCRAFT_CHANGED' AND id_usuarios=${cmdU.id}`), 1);
    await o.reload(); await select(o, fU); await o.getByLabel('Aeronave del vuelo').getByText(pQ.matricula).waitFor();
    pass('UI-4 Operaciones: aeronave del vuelo, candidatas con las no disponibles y su conflicto, cambio de aeronave con confirmación, estado y aviso al comandante, persistente tras recargar');
    // tripulación
    await call(`/flights/${fU}/commander-assignment/response`, { method: 'POST', token: cmdU.token, body: { aceptar: true }, expect: [200] });
    await o.reload(); await select(o, fU);
    await o.getByLabel('Función de tripulación').selectOption('MEDICO'); await o.getByLabel('Personal disponible').waitFor();
    assert.equal(await o.getByLabel('Personal disponible').locator(`option[value="${med1.id}"]`).count(), 0, 'med1 tiene un vuelo superpuesto'); assert.equal(await o.getByLabel('Personal disponible').locator(`option[value="${med2.id}"]`).count(), 1);
    const conflictBox = o.locator('details', { hasText: 'Personal que requiere revisión' }); await conflictBox.getByText(/Personal que requiere revisión/).click(); await conflictBox.getByText(new RegExp(`${one(`SELECT codigo_vuelo FROM vuelos WHERE id_vuelos=${fOverlap}`)}`)).waitFor(); await snap(o, 'o03-conflicto-tripulacion');
    await o.getByLabel('Personal disponible').selectOption(String(med2.id)); await o.getByRole('button', { name: 'Asignar tripulante' }).click(); await toast(o, '✓ Tripulante asignado');
    assert.equal(activeCrew(fU), 2); assert.deepEqual(crewState(fU, med2), ['NULL', 'NULL']); assert.equal(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_vuelos=${fU} AND tipo_entidad=N'FLIGHT_CREW' AND operacion=N'CREATE'`) >= 2, true);
    await o.reload(); await select(o, fU); const crewBox = o.locator('div.wide', { has: o.locator('h4', { hasText: /^Tripulación$/ }) }).last(); await crewBox.getByText('E2E umed2').waitFor();
    // retiro con confirmación e historial
    await crewBox.locator('p', { hasText: 'E2E umed2' }).getByRole('button', { name: 'Retirar' }).click(); await toast(o, '✓ Tripulante retirado');
    assert.equal(activeCrew(fU), 1); const removed = crewState(fU, med2); assert.notEqual(removed[0], 'NULL'); assert.equal(removed[1], 'RETIRO'); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${fU} AND id_usuarios=${med2.id}`), 1, 'la fila se conserva como historial');
    await o.getByRole('button', { name: 'Ver historial de tripulación' }).click(); await o.getByRole('list', { name: 'Historial de tripulación' }).getByText(/Retirado por/).waitFor(); await snap(o, 'o04-historial-tripulacion');
    // reasignar a la misma persona y reemplazar
    await o.getByLabel('Función de tripulación').selectOption('MEDICO'); await o.getByLabel('Personal disponible').selectOption(String(med2.id), { timeout: 60000 }); await o.getByRole('button', { name: 'Asignar tripulante' }).click(); await toast(o, '✓ Tripulante asignado'); assert.equal(activeCrew(fU), 2); assert.equal(count(`SELECT COUNT(*) FROM vuelos_tripulantes WHERE id_vuelos=${fU} AND id_usuarios=${med2.id}`), 2, 'la baja histórica convive con la nueva asignación');
    pass('UI-5 Operaciones: disponibilidad de tripulantes con el vuelo en conflicto, asignación, retiro con confirmación (la fila queda como historial con motivo), historial visible y nueva asignación de la misma persona; persistente tras recargar');
    await o.context().close();

    // ---- Comandante ----
    const c = await login(cmdU.name); await c.getByRole('heading', { name: 'Planificación operativa' }).waitFor();
    const cmdCard = c.getByRole('heading', { name: 'Planificación operativa', exact: true }).locator('..'); await cmdCard.locator('select').first().selectOption(String(fU), { timeout: 90000 });
    await c.getByRole('heading', { name: 'Aeronave', exact: true }).waitFor(); await c.getByText(pQ.matricula).first().waitFor(); await c.getByRole('heading', { name: 'Tripulación' }).waitFor(); await c.locator('div.wide', { has: c.locator('h4', { hasText: /^Tripulación$/ }) }).last().getByText('E2E umed2').waitFor();
    assert.equal(await c.getByRole('button', { name: 'Retirar' }).count(), 0, 'el comandante consulta pero no modifica la tripulación'); assert.equal(await c.getByRole('button', { name: 'Asignar tripulante' }).count(), 0); assert.equal(await c.getByRole('button', { name: 'Cambiar aeronave' }).count(), 0); await snap(c, 'c01-comandante');
    assert.equal((await call(`/flights/${fOverlap}/crew`, { token: cmdU.token, expect: [403] })).status, 403, 'vuelos ajenos no son consultables');
    pass('UI-6 Comandante: ve la aeronave y la tripulación de su vuelo sin acciones de modificación y el servidor rechaza consultar vuelos ajenos');
    await c.context().close();
  } finally { await browser.close(); }
  console.log(`E2E navegador aeronaves y tripulación: ${passed} bloques aprobados (marca ${MARK}).`);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
