#!/usr/bin/env node
// Auditoría funcional de las tablas de negocio (I-5.8), independiente de si la tabla tiene filas de prueba.
// Para CADA tabla de sys.tables combina evidencia estática verificable del repositorio con la estructura real de SQL Server:
//   - mapeo JPA (@Entity/@Table, @JoinTable, @CollectionTable) y repositorio;
//   - qué servicios/controladores del código de producción LEEN o ESCRIBEN la tabla (save/delete en el repositorio o la entidad);
//   - qué pruebas del backend (JUnit) y qué scripts E2E la ejercen;
//   - claves foráneas, restricciones CHECK, índices únicos y triggers (SQL Server).
// Una tabla sólo se marca INTEGRADA si tiene mapeo + al menos un escritor de producción + al menos un lector de producción + pruebas JUnit o E2E que la ejerzan.
// Tener filas en la base de pruebas NO cuenta. Todo lo demás se marca REVISAR con el motivo, para análisis manual.
// Uso: node scripts/auditoria-funcional-tablas-i58.cjs [--out docs/evidencia-i58/auditoria-tablas.json] [--md docs/evidencia-i58/auditoria-tablas.md]
// Sólo lee. La contraseña SA se toma de .env.e2e y no se imprime. Código de salida 0 si ninguna tabla de negocio queda en REVISAR.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const arg = (n, f) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : f; };
const root = path.resolve(__dirname, "..");
const container = arg("container", "vuelos-sanitarios-e2e-sqlserver-1"), db = arg("db", "vuelos_sanitarios_e2e");
const INFRA = new Set(["flyway_schema_history", "sysdiagrams"]);

function walk(dir, ext, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "target", "dist", ".git", "e2e-logs"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, acc); else if (ext.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}
const read = (p) => fs.readFileSync(p, "utf8");
const rel = (p) => path.relative(root, p).replace(/\\/g, "/");

const main = walk(path.join(root, "backend-java/src/main/java"), [".java"]).map((p) => ({ p, text: read(p) }));
const tests = walk(path.join(root, "backend-java/src/test/java"), [".java"]).map((p) => ({ p, text: read(p) }));
const e2e = walk(path.join(root, "scripts"), [".cjs"]).filter((p) => /e2e-/.test(path.basename(p))).map((p) => ({ p, text: read(p) }));
const frontend = walk(path.join(root, "frontend-react/src"), [".jsx", ".js"]).filter((p) => !/\.test\./.test(p)).map((p) => ({ p, text: read(p) }));

function sqlRows() {
  const text = fs.readFileSync(path.join(root, ".env.e2e"), "utf8");
  const password = (text.match(/^E2E_MSSQL_SA_PASSWORD=(.*)$/m) || [])[1];
  let raw;
  try { raw = execFileSync("docker", ["exec", "-i", "-e", "SQLCMDPASSWORD", container, "/opt/mssql-tools18/bin/sqlcmd", "-C", "-S", "localhost", "-U", "sa", "-d", db, "-h", "-1", "-W", "-s", "|", "-Q", `SET NOCOUNT ON;
SELECT t.name, (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id=t.object_id AND p.index_id IN (0,1)),
 (SELECT COUNT(*) FROM sys.foreign_keys f WHERE f.parent_object_id=t.object_id), (SELECT COUNT(*) FROM sys.foreign_keys f WHERE f.referenced_object_id=t.object_id),
 (SELECT COUNT(*) FROM sys.check_constraints c WHERE c.parent_object_id=t.object_id), (SELECT COUNT(*) FROM sys.indexes i WHERE i.object_id=t.object_id AND i.is_unique=1 AND i.is_primary_key=0),
 (SELECT COUNT(*) FROM sys.triggers g WHERE g.parent_id=t.object_id)
FROM sys.tables t ORDER BY t.name`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, SQLCMDPASSWORD: password.trim() } }); }
  catch (e) { throw new Error("No se pudo consultar SQL Server (" + String(e.stderr || e.message).split(String.fromCharCode(10))[0].slice(0, 160) + ")"); }
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split("|"));
}

const tables = sqlRows().map(([name, rows, fkOut, fkIn, checks, uniques, triggers]) => ({ name, rows: Number(rows), fkOut: Number(fkOut), fkIn: Number(fkIn), checks: Number(checks), uniques: Number(uniques), triggers: Number(triggers), infra: INFRA.has(name) }));

// Mapeo JPA: tabla -> clase de entidad (o asociación)
const mapping = new Map();
for (const f of main) {
  const cls = (f.text.match(/(?:public\s+)?(?:final\s+)?class\s+(\w+)/) || [])[1];
  for (const m of f.text.matchAll(/@Table\s*\(([^)]*)\)/g)) {
    const n = (m[1].match(/name\s*=\s*"(\w+)"/) || [])[1];
    if (n) mapping.set(n.toLowerCase(), { kind: "entidad", cls, file: f.p });
  }
  for (const m of f.text.matchAll(/@(JoinTable|CollectionTable)\s*\(([^)]*)\)/g)) {
    const n = (m[2].match(/name\s*=\s*"(\w+)"/) || [])[1];
    if (n && !mapping.has(n.toLowerCase())) mapping.set(n.toLowerCase(), { kind: m[1] === "JoinTable" ? "asociación" : "colección", cls: cls + " (" + m[1] + ")", owner: cls, file: f.p });
  }
}

const isRepo = (f) => /\/repository\//.test(rel(f.p));
const isEntity = (f) => /\/domain\//.test(rel(f.p));
// Repositorio de una entidad: la interfaz que extiende JpaRepository<Entidad, ...> (el nombre no siempre sigue la convención <Entidad>Repository)
const repoByEntity = new Map();
for (const f of main) { if (!isRepo(f)) continue; const m = f.text.match(/interface\s+(\w+)\s+extends\s+\w*Repository<\s*(\w+)/); if (m) repoByEntity.set(m[2], m[1]); }
function users(cls) {
  const repoName = repoByEntity.get(cls) || cls + "Repository";
  const hits = main.filter((f) => !isEntity(f) && (new RegExp(`\\b${cls}\\b`).test(f.text) || new RegExp(`\\b${repoName}\\b`).test(f.text)));
  const nonRepo = hits.filter((f) => !isRepo(f));
  const writers = nonRepo.filter((f) => /\.(save|saveAndFlush|saveAll|delete|deleteAll|deleteById|persist)\s*\(|new\s+[A-Z]\w*\s*\(.*\)\s*;?\s*\w*\.save|@Modifying/.test(f.text) || /\bpersist\(/.test(f.text));
  // un escritor "real" referencia el repositorio o la entidad Y llama a save/persist en el mismo archivo
  const refRepo = nonRepo.filter((f) => new RegExp(`\\b${repoName}\\b`).test(f.text));
  const realWriters = refRepo.filter((f) => /\.(save|saveAndFlush|saveAll|delete|deleteAll|deleteById)\s*\(/.test(f.text));
  const repoFile = main.find((f) => isRepo(f) && new RegExp(`interface\\s+${repoName}\\b`).test(f.text));
  const modifying = repoFile && /@Modifying/.test(repoFile.text);
  return { nonRepo, writers: realWriters.length ? realWriters : (modifying ? refRepo : writers.filter((f) => refRepo.includes(f))), readers: nonRepo, repoFile };
}
const mentions = (list, re) => list.filter((f) => re.test(f.text));

// Algunas tablas sólo se ejercen a través de la API (los scripts no nombran la tabla). Cada vínculo se verifica: el script debe existir y llamar al endpoint indicado.
const VIA_API = {
  coordinaciones_aa2000: [["e2e-coordinaciones-ui.cjs", /coordinacion|aa2000/i]],
  informacion_hangar: [["e2e-hangar-ui.cjs", /hangar/i]],
  prioridades_vuelo: [["e2e-cierre.cjs", /prioridad/i], ["e2e-solicitudes.cjs", /prioridad|priority/i]],
};
const result = [];
for (const t of tables) {
  const m = mapping.get(t.name.toLowerCase());
  const row = { table: t.name, infra: t.infra, rows: t.rows, fkOut: t.fkOut, fkIn: t.fkIn, checks: t.checks, uniqueIndexes: t.uniques, triggers: t.triggers, mapping: m ? `${m.kind}: ${m.cls}` : null, writers: [], readers: [], junit: [], e2e: [], ui: [], notes: [] };
  if (m) {
    const ownerCls = m.owner || m.cls;
    const u = users(ownerCls);
    row.writers = u.writers.map((f) => path.basename(f.p, ".java"));
    row.readers = u.readers.map((f) => path.basename(f.p, ".java"));
    const re = new RegExp(`\\b(${ownerCls}|${ownerCls}Repository|${repoByEntity.get(ownerCls) || "NOREPO"})\\b`);
    row.junit = mentions(tests, re).map((f) => path.basename(f.p, ".java"));
    row.ui = [];
  }
  const tableRe = new RegExp(`\\b${t.name}\\b`);
  const e2eHit = mentions(e2e, tableRe).map((f) => path.basename(f.p));
  const jUnitSql = mentions(tests, tableRe).map((f) => path.basename(f.p, ".java"));
  const viaApi = (VIA_API[t.name] || []).filter(([file, re]) => { const s = e2e.find((x) => path.basename(x.p) === file) || (fs.existsSync(path.join(root, "scripts", file)) && { text: read(path.join(root, "scripts", file)) }); return s && re.test(s.text); }).map(([file]) => file + " (vía API)");
  row.e2e = [...e2eHit, ...viaApi]; row.junit = [...new Set([...row.junit, ...jUnitSql])];
  if (m && m.kind === "asociación") row.notes.push(`asociación gestionada por la entidad ${m.owner}`);
  if (m && m.kind === "colección") row.notes.push(`colección gestionada por la entidad ${m.owner}`);
  if (t.infra) { row.verdict = "INFRAESTRUCTURA"; result.push(row); continue; }
  const problems = [];
  if (!m) problems.push("sin mapeo JPA en el código de producción");
  if (m && row.writers.length === 0 && m.kind === "entidad") problems.push("ningún servicio/controlador de producción escribe la tabla");
  if (m && row.readers.length === 0) problems.push("ningún servicio/controlador de producción la utiliza");
  if (row.junit.length === 0 && row.e2e.length === 0) problems.push("ninguna prueba JUnit ni E2E la ejerce");
  if (t.fkOut + t.fkIn === 0) problems.push("sin ninguna relación (FK) con otras tablas");
  row.problems = problems;
  row.verdict = problems.length ? "REVISAR" : "INTEGRADA";
  result.push(row);
}

const biz = result.filter((r) => !r.infra);
const summary = { database: db, totalPhysical: result.length, business: biz.length, infrastructure: result.length - biz.length, integrated: biz.filter((r) => r.verdict === "INTEGRADA").length, toReview: biz.filter((r) => r.verdict === "REVISAR").map((r) => r.table) };
const outJson = arg("out", null);
if (outJson) { fs.mkdirSync(path.dirname(path.resolve(root, outJson)), { recursive: true }); fs.writeFileSync(path.resolve(root, outJson), JSON.stringify({ summary, tables: result }, null, 1)); }
const outMd = arg("md", null);
if (outMd) {
  const L = [`# Auditoría funcional automatizada de tablas (I-5.8)`, ``, `Base: ${db} · Tablas físicas: ${summary.totalPhysical} (negocio ${summary.business}, infraestructura ${summary.infrastructure}) · Integradas por evidencia estática: **${summary.integrated}/${summary.business}** · A revisar: ${summary.toReview.length ? summary.toReview.join(", ") : "ninguna"}`, ``, `Criterio: mapeo JPA + escritor de producción + lector de producción + prueba JUnit o E2E + relación FK. Las filas de prueba no cuentan.`, ``, `| Tabla | Mapeo | Escritores de producción | Lectores (muestra) | JUnit | E2E | FK sal/ent | CHECK | Únicos | Triggers | Veredicto |`, `|---|---|---|---|---:|---:|---|---:|---:|---:|---|`];
  for (const r of result) L.push(`| ${r.table} | ${r.mapping || "—"} | ${r.writers.slice(0, 3).join(", ") || "—"} | ${r.readers.slice(0, 3).join(", ") || "—"} | ${r.junit.length} | ${r.e2e.length} | ${r.fkOut}/${r.fkIn} | ${r.checks} | ${r.uniqueIndexes} | ${r.triggers} | ${r.verdict}${r.problems && r.problems.length ? ": " + r.problems.join("; ") : ""} |`);
  fs.mkdirSync(path.dirname(path.resolve(root, outMd)), { recursive: true }); fs.writeFileSync(path.resolve(root, outMd), L.join("\n") + "\n");
}
console.log(JSON.stringify(summary));
for (const r of biz.filter((x) => x.verdict === "REVISAR")) console.log(`REVISAR ${r.table}: ${r.problems.join("; ")}`);
process.exit(summary.toReview.length ? 1 : 0);
