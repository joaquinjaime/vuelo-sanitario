/* E2E de navegador real para el selector remoto: read-only sobre la base E2E existente. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, BACKEND, DB_NAME, BASE, sql, count, ok } = require('./e2e-cierre-support.cjs');

const UI = process.env.E2E_UI_URL || 'http://127.0.0.1:18081/';
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
  .map((line) => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));

(async () => {
  assert.equal(DB_NAME, 'vuelos_sanitarios_e2e', 'este ensayo es sólo de lectura sobre la base E2E persistente');
  const info = JSON.parse(require('node:child_process').spawnSync('docker', ['inspect', BACKEND], { encoding: 'utf8' }).stdout)[0];
  const serviceEnv = Object.fromEntries(info.Config.Env.map((item) => [item.slice(0, item.indexOf('=')), item.slice(item.indexOf('=') + 1)]));
  assert.ok(serviceEnv.DB_URL.includes(`databaseName=${DB_NAME};`) && serviceEnv.SPRING_PROFILES_ACTIVE.includes('e2e'));

  const admin = (await ok('/auth/login', { method: 'POST', body: { username: env.BOOTSTRAP_ADMIN_USERNAME, password: env.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const filterOptions = await ok('/audit/filters', { token: admin });
  assert.equal(filterOptions.actors.length, 500, 'el endpoint heredado conserva su límite histórico');
  const oldIds = new Set(filterOptions.actors.map((actor) => String(actor.id)));
  let target = null, targetRank = 0;
  for (let page = 0; page < 100 && !target; page++) {
    const result = await ok(`/audit/actors?page=${page}&size=100`, { token: admin });
    target = result.items.find((actor) => !oldIds.has(String(actor.id))) || null;
    if (target) targetRank = page * 100 + result.items.findIndex((actor) => String(actor.id) === String(target.id)) + 1;
    if (!result.hasNext) break;
  }
  assert.ok(target && targetRank > 500, 'hay un actor consultable fuera de las primeras 500 opciones');
  const sqlEvents = count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_usuario_actor=${Number(target.id)}`);
  assert.ok(sqlEvents > 0);
  const filtered = await ok(`/audit?actorId=${target.id}&page=0&size=100`, { token: admin });
  assert.equal(filtered.total, sqlEvents, 'el filtro de actor coincide con SQL Server');
  assert.ok(filtered.items.every((event) => String(event.actor.id) === String(target.id)));

  const inactive = await (async () => {
    for (let page = 0; page < 100; page++) {
      const result = await ok(`/audit/actors?page=${page}&size=100`, { token: admin });
      const found = result.items.find((actor) => !actor.active && oldIds.has(String(actor.id)) === false);
      if (found) return found;
      if (!result.hasNext) break;
    }
    return null;
  })();
  if (inactive) {
    const historical = await ok(`/audit/actors?q=${encodeURIComponent(inactive.username)}&page=0&size=30`, { token: admin });
    assert.ok(historical.items.some((actor) => String(actor.id) === String(inactive.id) && actor.active === false));
    assert.ok(count(`SELECT COUNT(*) FROM eventos_auditoria WHERE id_usuario_actor=${Number(inactive.id)}`) > 0);
  }

  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ locale: 'es-AR' });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const anonymous = await page.request.get(new URL('/api/audit/actors', UI).toString());
    assert.equal(anonymous.status(), 401, 'la búsqueda remota requiere autenticación');
    await page.goto(UI);
    await page.getByLabel('Usuario', { exact: true }).fill(env.BOOTSTRAP_ADMIN_USERNAME);
    await page.getByLabel('Contraseña', { exact: true }).fill(env.BOOTSTRAP_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.locator('nav').getByText('Auditoría', { exact: true }).click();
    await page.getByRole('heading', { name: 'Auditoría de operaciones', exact: true }).waitFor();

    const search = page.getByLabel('Buscar usuario responsable');
    let delayed = false;
    await page.route((url) => url.pathname === '/api/audit/actors' && url.searchParams.get('q') === target.username, async (route) => {
      if (!delayed) { delayed = true; await new Promise((resolve) => setTimeout(resolve, 700)); }
      await route.continue();
    });
    await search.fill(target.username);
    await page.waitForTimeout(320);
    await search.fill('__sin_coincidencias__');
    await page.getByText('No se encontraron actores.', { exact: true }).waitFor();
    await page.waitForTimeout(800);
    assert.equal(await page.getByLabel('Usuario responsable', { exact: true }).inputValue(), '', 'la respuesta remota obsoleta no cambia la selección');
    await page.unrouteAll();

    await search.fill(target.username);
    const actorSelect = page.getByLabel('Usuario responsable', { exact: true });
    await actorSelect.locator(`option[value="${target.id}"]`).waitFor({ state: 'attached' });
    await actorSelect.selectOption(String(target.id));
    await search.fill('__sin_coincidencias__');
    await page.getByText('No se encontraron actores.', { exact: true }).waitFor();
    assert.equal(await actorSelect.inputValue(), String(target.id), 'la selección persiste aunque cambien los resultados remotos');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    const pager = page.locator('.audit-pager');
    await pager.getByText(new RegExp(`${sqlEvents} eventos`)).waitFor();
    assert.match(await pager.innerText(), new RegExp(`· ${sqlEvents} eventos`));
    const eventRows = page.getByRole('table', { name: 'Eventos de auditoría' }).locator('tbody tr');
    assert.ok(await eventRows.count() > 0);

    if (inactive) {
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await search.fill(inactive.username);
      await actorSelect.locator(`option[value="${inactive.id}"]`).waitFor({ state: 'attached' });
      assert.match(await actorSelect.locator(`option[value="${inactive.id}"]`).innerText(), /desactivado/);
    }
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    assert.equal(await actorSelect.inputValue(), '', 'limpiar filtros elimina el actor elegido');
    console.log(JSON.stringify({ result: 'PASS', database: DB_NAME, legacy_actor_limit: 500, target_rank: targetRank, target_actor_id: target.id, target_active: target.active, filtered_events: sqlEvents, disabled_historical_actor_checked: Boolean(inactive), race_response_ignored: delayed, selection_preserved: true, selection_cleared: true }));
    await context.close();
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
