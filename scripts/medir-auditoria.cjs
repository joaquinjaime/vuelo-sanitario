/* Mide por separado la consulta global de auditoría (100 resultados) en el stack E2E aislado: HTTP total, fases del backend (APP_AUDIT_DIAGNOSTICS_ENABLED=true),
 * conteo, página y SQL puro con SET STATISTICS TIME/IO. No modifica datos. Uso: node scripts/medir-auditoria.cjs [repeticiones] */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BASE, BACKEND, sql, one, call, ok } = require('./e2e-cierre-support.cjs');

const runs = Number(process.argv[2] || 5);
const stat = (q) => sql(`SET STATISTICS TIME ON; SET STATISTICS IO ON;\n${q}`);
(async () => {
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const events = Number(one('SELECT COUNT(*) FROM eventos_auditoria'));
  const sizes = one("SELECT CONCAT(CAST(SUM(DATALENGTH(valores_anteriores)+DATALENGTH(valores_nuevos))/1048576.0 AS decimal(10,2)),' MiB de valores anteriores/nuevos')  FROM eventos_auditoria");
  console.log(`Eventos: ${events}; ${sizes}`);
  const timings = [];
  for (let i = 0; i < runs; i++) {
    const started = process.hrtime.bigint();
    const res = await fetch(`${BASE}/audit?size=100`, { headers: { Authorization: 'Bearer ' + admin } });
    const body = await res.arrayBuffer();
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    timings.push({ run: i + 1, status: res.status, bytes: body.byteLength, httpTotalMs: Math.round(ms), diagnosticId: res.headers.get('x-diagnostic-id') });
  }
  console.table(timings);
  const variants = [['global, más antiguos primero', 'order=asc&size=100'], ['página profunda (offset ~50 000)', 'page=500&size=100'], ['filtro tipo + operación', 'entityType=FLIGHT&operation=CREATE&size=100'], ['filtro por rango de fechas', 'from=2020-01-01&to=2099-01-01&size=100'], ['filtro por actor', 'actorId=1&size=100']];
  const extra = [];
  for (const [name, query] of variants) { const times = []; for (let i = 0; i < 3; i++) { const t0 = process.hrtime.bigint(); const r = await fetch(`${BASE}/audit?${query}`, { headers: { Authorization: 'Bearer ' + admin } }); await r.arrayBuffer(); times.push(Math.round(Number(process.hrtime.bigint() - t0) / 1e6)); } extra.push({ consulta: name, status: 'ok', ms_corridas: times.join(' / ') }); }
  console.table(extra);
  const logs = spawnSync('docker', ['logs', '--tail', '400', BACKEND], { encoding: 'utf8' });
  const lines = ((logs.stdout || '') + (logs.stderr || '')).split(/\r?\n/).filter((l) => l.includes('audit_request')).slice(-runs);
  console.log(lines.length ? lines.map((l) => l.replace(/^.*audit_request /, 'audit_request ')).join('\n') : '(sin líneas audit_request: active APP_AUDIT_DIAGNOSTICS_ENABLED=true)');
  console.log('\n--- SQL puro: conteo ---'); console.log(stat('SELECT COUNT(*) FROM eventos_auditoria;').split(/\r?\n/).filter((l) => /elapsed|Table|logical|^\d+$/.test(l)).join('\n'));
  console.log('\n--- SQL puro: página de 100 (mismas columnas y uniones que la aplicación) ---');
  const pageSql = `SELECT TOP 100 e.id_eventos_auditoria, e.fecha_ocurrencia, v.id_vuelos, v.codigo_vuelo, u.id_usuarios, u.nombre_usuario, p.nombre_persona, p.apellido_persona, u.esta_activo, e.tipo_entidad, e.entidad_id, e.operacion, e.valores_anteriores, e.valores_nuevos
    FROM eventos_auditoria e LEFT JOIN vuelos v ON v.id_vuelos=e.id_vuelos LEFT JOIN usuarios u ON u.id_usuarios=e.id_usuario_actor LEFT JOIN personas p ON p.id_personas=u.id_personas
    ORDER BY e.fecha_ocurrencia DESC, e.id_eventos_auditoria DESC;`;
  console.log(stat(pageSql).split(/\r?\n/).filter((l) => /elapsed|Table '|logical/.test(l)).join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
