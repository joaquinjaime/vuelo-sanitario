/* HTTP audit benchmark, read-only and restricted to an explicitly named E2E database. */
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const dbName = process.env.E2E_DB_NAME;
const base = process.env.E2E_BASE;
const from = process.env.E2E_AUDIT_FROM;
const to = process.env.E2E_AUDIT_TO;
const actorId = process.env.E2E_AUDIT_ACTOR_ID;
const entityType = process.env.E2E_AUDIT_ENTITY_TYPE || 'FLIGHT';
if (!dbName?.startsWith('vuelos_sanitarios_e2e') || !base || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from || '') || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to || '') || !/^\d+$/.test(actorId || '')) {
  throw new Error('Defina E2E_DB_NAME (prefijo vuelos_sanitarios_e2e), E2E_BASE, E2E_AUDIT_FROM/TO y E2E_AUDIT_ACTOR_ID.');
}
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
  .map((line) => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const baseUrl = base.replace(/\/$/, '');
const rounds = Number(process.env.E2E_AUDIT_ROUNDS || 7);
const pageSize = 100;
const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: values.length, min_ms: +sorted[0].toFixed(1), max_ms: +sorted.at(-1).toFixed(1), mean_ms: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1), median_ms: +percentile(sorted, 0.5).toFixed(1), p95_ms: +percentile(sorted, 0.95).toFixed(1) };
};
const e2eContainers = ['vuelos-sanitarios-e2e-backend-1', 'vuelos-sanitarios-e2e-frontend-1', 'vuelos-sanitarios-e2e-sqlserver-1'];
const infrastructure = () => {
  try {
    const inspect = execFileSync('docker', ['inspect', '--format', '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.OOMKilled}}', ...e2eContainers], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/);
    const stats = execFileSync('docker', ['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}', ...e2eContainers], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/);
    return { containers: inspect.map((line) => { const [rawName, status, health, restarts, oom] = line.split('|'); const name = rawName.replace(/^\//, ''); return { name, status, health, restarts: Number(restarts), oom: oom === 'true', memory: stats.find((row) => row.startsWith(name + '|'))?.split('|')[1] || null }; }) };
  } catch { return { unavailable: true }; }
};

(async () => {
  const login = await fetch(baseUrl + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: env.BOOTSTRAP_ADMIN_USERNAME, password: env.BOOTSTRAP_ADMIN_PASSWORD }) });
  if (!login.ok) throw new Error('Admin E2E login HTTP ' + login.status);
  const { accessToken } = await login.json();
  console.log(JSON.stringify({ database: dbName, infrastructure_before: infrastructure() }));
  const scenarios = [
    ['no-filters', { page: 0 }],
    ['entity-type-first-page', { entityType, page: 0 }], ['actor-first-page', { actorId, page: 0 }],
    ['entity-type-later-page', { entityType, page: 1 }],
  ];
  for (const [name, values] of scenarios) {
    const params = new URLSearchParams({ size: String(pageSize), order: 'asc', ...(name === 'no-filters' ? {} : { from, to }), ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])) });
    const path = `/audit?${params}`;
    const request = async (label) => {
      const started = performance.now();
      const response = await fetch(baseUrl + path, { headers: { Authorization: 'Bearer ' + accessToken } });
      const elapsed = performance.now() - started;
      if (!response.ok) throw new Error(`${name}/${label}: HTTP ${response.status}`);
      const body = await response.json();
      if (values.page === 1 && body.totalPages < 2) throw new Error(`${name}: no hay una página posterior para recorrer`);
      if (name === 'entity-type-first-page' && body.items.length !== pageSize) throw new Error(`${name}: página incompleta (${body.items.length}/${pageSize})`);
      if (name === 'actor-first-page' && body.total === 0) throw new Error(`${name}: el actor configurado no tiene eventos dentro del período`);
      return { elapsed, total: body.total, returned: body.items.length, diagnosticId: response.headers.get('X-Diagnostic-Id') || null };
    };
    const cold = await request('first');
    const hot = [];
    for (let i = 0; i < rounds; i++) hot.push(await request(`hot-${i + 1}`));
    const sample = hot.map((x) => x.elapsed);
    const p95Id = hot[sample.indexOf(percentile([...sample].sort((a, b) => a - b), 0.95))]?.diagnosticId;
    console.log(JSON.stringify({ database: dbName, scenario: name, query: path.replace(/actorId=\d+/, 'actorId=[configured]'), scenario_first_request_ms: +cold.elapsed.toFixed(1), scenario_first_diagnostic_id: cold.diagnosticId, hot: summary(sample), rows_total: cold.total, rows_returned: cold.returned, p95_diagnostic_id: p95Id }));
  }
  console.log(JSON.stringify({ database: dbName, infrastructure_after: infrastructure() }));
})().catch((error) => { console.error(error.message); process.exit(1); });
