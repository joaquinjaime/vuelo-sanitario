/* I-5.8 — Reproduce la condición más desfavorable de la incidencia de rendimiento de auditoría (26.972 ms, objetivo 5.000 ms): CACHÉ FRÍA.
 * En el SQL Server AISLADO del stack E2E vacía el buffer pool (CHECKPOINT + DBCC DROPCLEANBUFFERS) y el caché de planes, y mide por separado:
 *   1) SQL puro (página de 100 con SET STATISTICS TIME/IO) en frío y en caliente;
 *   2) HTTP total GET /api/audit?size=100 en frío (primera consulta tras vaciar) y repetido en caliente, con el backend ya iniciado.
 * No modifica datos. Uso: node scripts/medir-auditoria-frio.cjs [repeticiones]  (la base habitual no se toca: el contenedor es el E2E). */
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, BASE, sql, one, ok, SQL_CONTAINER } = require('./e2e-cierre-support.cjs');

const runs = Number(process.argv[2] || 3);
const PAGE = `SELECT TOP 100 e.id_eventos_auditoria, e.fecha_ocurrencia, v.id_vuelos, v.codigo_vuelo, u.id_usuarios, u.nombre_usuario, p.nombre_persona, p.apellido_persona, u.esta_activo, e.tipo_entidad, e.entidad_id, e.operacion, e.valores_anteriores, e.valores_nuevos
    FROM eventos_auditoria e LEFT JOIN vuelos v ON v.id_vuelos=e.id_vuelos LEFT JOIN usuarios u ON u.id_usuarios=e.id_usuario_actor LEFT JOIN personas p ON p.id_personas=u.id_personas
    ORDER BY e.fecha_ocurrencia DESC, e.id_eventos_auditoria DESC;`;
const stat = (q) => sql(`SET STATISTICS TIME ON; SET STATISTICS IO ON;\n${q}`);
const parse = (out) => ({ cpuMs: (out.match(/CPU time = (\d+) ms/g) || []).map((x) => +x.match(/\d+/)[0]).pop(), elapsedMs: (out.match(/elapsed time = (\d+) ms/g) || []).map((x) => +x.match(/\d+/)[0]).pop(), physicalReads: Number((out.match(/physical reads (\d+)/) || [0, 0])[1]), readAhead: Number((out.match(/read-ahead reads (\d+)/) || [0, 0])[1]) });
(async () => {
  if (!/e2e/.test(SQL_CONTAINER)) throw new Error('sólo el SQL Server aislado');
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  console.log(`Eventos de auditoría: ${one('SELECT COUNT(*) FROM eventos_auditoria')} (incidencia original: ~10.358); tamaño de la tabla: ${one("SELECT CONCAT(CAST(SUM(a.total_pages)*8/1024.0 AS decimal(10,1)),' MiB') FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id JOIN sys.partitions p ON p.object_id=i.object_id AND p.index_id=i.index_id JOIN sys.allocation_units a ON a.container_id=p.partition_id WHERE t.name='eventos_auditoria'")}`);
  const cold = () => { sql('CHECKPOINT; DBCC DROPCLEANBUFFERS; DBCC FREEPROCCACHE;'); };
  const http = async (q) => { const t0 = process.hrtime.bigint(); const r = await fetch(`${BASE}/audit?${q}`, { headers: { Authorization: 'Bearer ' + admin } }); const b = await r.arrayBuffer(); return { status: r.status, bytes: b.byteLength, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6) }; };
  const rows = [];
  for (let i = 1; i <= runs; i++) {
    cold(); const sqlCold = parse(stat(PAGE)); const sqlWarm = parse(stat(PAGE));
    cold(); const httpCold = await http('size=100'); const httpWarm = []; for (let k = 0; k < 3; k++) httpWarm.push((await http('size=100')).ms);
    cold(); const deepCold = await http('page=500&size=100');
    rows.push({ corrida: i, 'SQL frío (ms)': sqlCold.elapsedMs, 'lecturas físicas+anticipadas': sqlCold.physicalReads + sqlCold.readAhead, 'SQL caliente (ms)': sqlWarm.elapsedMs, 'HTTP frío (ms)': httpCold.ms, 'HTTP caliente (ms)': httpWarm.join('/'), 'HTTP página profunda frío (ms)': deepCold.ms, estado: httpCold.status });
  }
  console.table(rows);
  const worst = Math.max(...rows.flatMap((r) => [r['HTTP frío (ms)'], r['HTTP página profunda frío (ms)']]));
  console.log(`Peor HTTP en frío: ${worst} ms (objetivo 5000 ms) → ${worst <= 5000 ? 'CUMPLE' : 'NO CUMPLE'}`);
  process.exit(worst <= 5000 ? 0 : 1);
})().catch((e) => { console.error('FAIL: ' + (e && e.message || e)); process.exit(1); });
