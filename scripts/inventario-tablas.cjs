#!/usr/bin/env node
// Conciliación exacta entre sys.tables y la matriz funcional (I-5.7, fase 1).
// Uso: node scripts/inventario-tablas.cjs [--container vuelos-sanitarios-e2e-sqlserver-1] [--db vuelos_sanitarios_e2e] [--env .env.e2e] [--matrix docs/MATRIZ_FUNCIONAL_I5_2026-10-26.md] [--out ruta.json]
// Sólo lee. La contraseña se toma del archivo de entorno indicado (E2E_MSSQL_SA_PASSWORD o MSSQL_SA_PASSWORD) y no se imprime.
// Código de salida: 0 si el inventario SQL y la matriz coinciden exactamente, 1 si no.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const root = path.resolve(__dirname, "..");
const container = arg("container", "vuelos-sanitarios-e2e-sqlserver-1");
const db = arg("db", "vuelos_sanitarios_e2e");
const envFile = path.resolve(root, arg("env", ".env.e2e"));
const matrixFile = path.resolve(root, arg("matrix", "docs/MATRIZ_FUNCIONAL_I5_2026-10-26.md"));
const out = arg("out", null);
// Infraestructura: no es del negocio ni tiene CRUD. `sysdiagrams` la crea SQL Server Management Studio al usar «diagramas de base de datos»: existe en la base habitual (V47) y no en las creadas por Flyway.
const INFRASTRUCTURE = new Set(["flyway_schema_history", "sysdiagrams"]);

function password() {
  const text = fs.readFileSync(envFile, "utf8");
  const m = text.match(/^(?:E2E_)?MSSQL_SA_PASSWORD=(.*)$/m);
  if (!m) throw new Error(`No hay contraseña SA en ${envFile}`);
  return m[1].trim();
}

function sql(query) {
  const raw = execFileSync("docker", ["exec", "-i", "-e", "SQLCMDPASSWORD", container, "/opt/mssql-tools18/bin/sqlcmd", "-C", "-S", "localhost", "-U", "sa", "-d", db, "-h", "-1", "-W", "-s", "|", "-b", "-Q", `SET NOCOUNT ON; ${query}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, SQLCMDPASSWORD: password() } });
  return raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split("|"));
}

const tables = sql(`
SELECT t.name,
  (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0,1)),
  (SELECT COUNT(*) FROM sys.foreign_keys f WHERE f.parent_object_id = t.object_id),
  (SELECT COUNT(*) FROM sys.foreign_keys f WHERE f.referenced_object_id = t.object_id),
  (SELECT COUNT(*) FROM sys.check_constraints c WHERE c.parent_object_id = t.object_id),
  (SELECT COUNT(*) FROM sys.indexes i WHERE i.object_id = t.object_id AND i.is_unique = 1 AND i.is_primary_key = 0),
  (SELECT COUNT(*) FROM sys.triggers g WHERE g.parent_id = t.object_id),
  t.is_ms_shipped, SCHEMA_NAME(t.schema_id)
FROM sys.tables t ORDER BY t.name`).map(([name, rows, fkOut, fkIn, checks, uniques, triggers, shipped, schema]) =>
  ({ name, rows: Number(rows), fkOut: Number(fkOut), fkIn: Number(fkIn), checks: Number(checks), uniqueIndexes: Number(uniques), triggers: Number(triggers), msShipped: shipped === "1", schema, kind: INFRASTRUCTURE.has(name) ? "INFRAESTRUCTURA" : "NEGOCIO" }));

const flyway = sql("SELECT TOP 1 version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank DESC")[0][0];
const matrixTables = [...fs.readFileSync(matrixFile, "utf8").matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map(m => m[1]);
const duplicated = matrixTables.filter((t, i) => matrixTables.indexOf(t) !== i);
const dbNames = new Set(tables.map(t => t.name)), mxNames = new Set(matrixTables);
const missingInMatrix = tables.filter(t => t.kind === "NEGOCIO" && !mxNames.has(t.name)).map(t => t.name);
const infrastructureNotInMatrix = tables.filter(t => t.kind !== "NEGOCIO" && !mxNames.has(t.name)).map(t => t.name);
const missingInDb = matrixTables.filter(t => !dbNames.has(t));
const schemasOutsideDbo = tables.filter(t => t.schema !== "dbo").map(t => t.name);
const business = tables.filter(t => t.kind === "NEGOCIO");

const report = {
  generatedAt: new Date().toISOString(), container, database: db, flywayVersion: Number(flyway),
  totalPhysicalTables: tables.length, businessTables: business.length, infrastructureTables: tables.length - business.length,
  matrixRows: matrixTables.length, matrixBusinessRows: matrixTables.filter(t => !INFRASTRUCTURE.has(t)).length,
  missingInMatrix, infrastructureNotInMatrix, missingInDb, duplicatedInMatrix: duplicated, schemasOutsideDbo,
  tablesWithoutFk: business.filter(t => t.fkOut === 0 && t.fkIn === 0).map(t => t.name),
  tables,
};
report.reconciled = !missingInMatrix.length && !missingInDb.length && !duplicated.length && !schemasOutsideDbo.length;

console.log(`Base ${db} (Flyway V${report.flywayVersion})`);
console.log(`Tablas físicas: ${report.totalPhysicalTables} = ${report.businessTables} de negocio + ${report.infrastructureTables} de infraestructura (${tables.filter(t => t.kind !== "NEGOCIO").map(t => t.name).join(", ") || "-"})`);
console.log(`Filas en la matriz: ${report.matrixRows} (${report.matrixBusinessRows} de negocio)`);
console.log(`En SQL y no en la matriz: ${missingInMatrix.join(", ") || "ninguna"}`);
console.log(`Infraestructura que no figura en la matriz (esperado): ${infrastructureNotInMatrix.join(", ") || "ninguna"}`);
console.log(`En la matriz y no en SQL: ${missingInDb.join(", ") || "ninguna"}`);
console.log(`Duplicadas en la matriz: ${duplicated.join(", ") || "ninguna"}`);
console.log(`Fuera del esquema dbo: ${schemasOutsideDbo.join(", ") || "ninguna"}`);
console.log(`Tablas de negocio sin ninguna FK entrante ni saliente: ${report.tablesWithoutFk.join(", ") || "ninguna"}`);
console.log(report.reconciled ? "RESULTADO: CONCILIADO" : "RESULTADO: NO CONCILIADO");
if (out) fs.writeFileSync(path.resolve(root, out), JSON.stringify(report, null, 2));
process.exit(report.reconciled ? 0 : 1);
