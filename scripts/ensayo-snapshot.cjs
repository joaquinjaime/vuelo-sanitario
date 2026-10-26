/* Fotografía de integridad de la restauración del ensayo de migración (sin datos personales ni secretos): por tabla, filas y suma de verificación
 * de las columnas existentes ANTES de V48 (CHECKSUM_AGG); conteo de claves, restricciones, triggers e índices; historial Flyway; vuelos por tipo y
 * estado; rutas y versiones; documentos; habilitaciones; auditoría; y el resultado de DBCC CHECKCONSTRAINTS.
 * Uso: node scripts/ensayo-snapshot.cjs <salida.json> [pre.json]   (con pre.json compara y lista las diferencias).
 * Variables E2E_DB_NAME / E2E_SQL_CONTAINER como en los demás scripts. Sólo lectura. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DB_NAME, sql, one } = require('./e2e-cierre-support.cjs');

// Sólo lectura. Sobre la base habitual (antes y después de la actualización autorizada) exige indicarlo expresamente: SNAPSHOT_ALLOW_DB=vuelos_sanitarios.
assert.ok(DB_NAME === 'vuelos_sanitarios_ensayo_v47' || process.env.SNAPSHOT_ALLOW_DB === DB_NAME, 'La fotografía sólo corre sobre la restauración del ensayo salvo autorización expresa (SNAPSHOT_ALLOW_DB)');
const [out, preFile] = process.argv.slice(2);
assert.ok(out, 'indique el archivo de salida');
const pre = preFile ? JSON.parse(fs.readFileSync(preFile, 'utf8')) : null;
const rows = (q) => sql(q).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split('|').map((x) => x.trim()));
const UNSUPPORTED = ['text', 'ntext', 'image', 'xml', 'sql_variant', 'geography', 'geometry', 'hierarchyid'];

const tables = rows("SELECT t.name FROM sys.tables t WHERE t.name<>N'flyway_schema_history' ORDER BY t.name").map((r) => r[0]);
const snap = { database: DB_NAME, flyway: rows("SELECT version, success, checksum FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank").map((r) => ({ version: r[0], success: r[1], checksum: r[2] })), tables: {} };
for (const t of tables) {
  const allColumns = rows(`SELECT c.name, ty.name FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.${t}') ORDER BY c.column_id`);
  const columns = pre ? pre.tables[t]?.columns : allColumns.filter((c) => !UNSUPPORTED.includes(c[1])).map((c) => c[0]);
  const n = Number(one(`SELECT COUNT(*) FROM dbo.${t}`));
  let checksum = null;
  if (columns && columns.length && n > 0) checksum = one(`SELECT CAST(CHECKSUM_AGG(CHECKSUM(${columns.map((c) => '[' + c + ']').join(',')})) AS varchar(40)) FROM dbo.${t}`);
  snap.tables[t] = { rows: n, columns, checksum, columnCount: allColumns.length };
}
snap.counts = {
  tables: tables.length,
  primaryKeys: Number(one('SELECT COUNT(*) FROM sys.key_constraints WHERE type=\'PK\'')),
  foreignKeys: Number(one('SELECT COUNT(*) FROM sys.foreign_keys')),
  untrustedForeignKeys: Number(one('SELECT COUNT(*) FROM sys.foreign_keys WHERE is_not_trusted=1 OR is_disabled=1')),
  checks: Number(one('SELECT COUNT(*) FROM sys.check_constraints')),
  untrustedChecks: Number(one('SELECT COUNT(*) FROM sys.check_constraints WHERE is_not_trusted=1 OR is_disabled=1')),
  triggers: Number(one('SELECT COUNT(*) FROM sys.triggers WHERE parent_class=1')),
  indexes: Number(one('SELECT COUNT(*) FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id WHERE i.index_id>0')),
};
snap.checkConstraintsViolations = sql('DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS, NO_INFOMSGS').replace(/\s/g, '').length;
const grouped = (q) => Object.fromEntries(rows(q).map((r) => [r[0], Number(r[1])]));
snap.flightsByTypeAndState = grouped("SELECT CONCAT(ISNULL(tv.codigo_tipo_vuelo,'?'),'/',ISNULL(e.codigo_estado_vuelo,'(sin estado)')), COUNT(*) FROM vuelos v JOIN tipos_vuelo tv ON tv.id_tipos_vuelo=v.id_tipos_vuelo LEFT JOIN estados_vuelo e ON e.id_estados_vuelo=v.id_estados_vuelo GROUP BY tv.codigo_tipo_vuelo, e.codigo_estado_vuelo ORDER BY 1");
snap.routes = { versions: Number(one('SELECT COUNT(*) FROM rutas_vuelo')), current: Number(one('SELECT COUNT(*) FROM rutas_vuelo WHERE es_version_actual=1')), withoutContext: Number(one('SELECT COUNT(*) FROM rutas_vuelo WHERE contexto_operativo IS NULL')) };
if (Number(one("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.rutas_vuelo') AND name=N'estado_revision'")) === 1) {
  snap.routes.byReviewState = grouped('SELECT estado_revision, COUNT(*) FROM rutas_vuelo GROUP BY estado_revision ORDER BY 1');
  snap.routes.approvedWithoutRealReview = Number(one("SELECT COUNT(*) FROM rutas_vuelo WHERE estado_revision IN ('APROBADA','DEVUELTA','PENDIENTE_REVISION') AND (id_usuario_presenta IS NULL OR fecha_presentacion IS NULL)"));
}
snap.users = { total: Number(one('SELECT COUNT(*) FROM usuarios')), activeByRole: grouped("SELECT r.codigo_rol, COUNT(*) FROM usuarios_roles ur JOIN roles r ON r.id_roles=ur.id_roles JOIN usuarios u ON u.id_usuarios=ur.id_usuarios WHERE u.esta_activo=1 GROUP BY r.codigo_rol ORDER BY 1") };
snap.documents = { items: snap.tables.documentos_vuelo.rows, versions: snap.tables.versiones_documento_vuelo.rows };
snap.credentials = { total: snap.tables.habilitaciones_profesionales.rows, byState: grouped('SELECT estado_verificacion, COUNT(*) FROM habilitaciones_profesionales GROUP BY estado_verificacion ORDER BY 1') };
snap.audit = { events: snap.tables.eventos_auditoria.rows, immutableTrigger: Number(one("SELECT COUNT(*) FROM sys.triggers WHERE name=N'tr_eventos_auditoria_inmutable'")) };
fs.writeFileSync(out, JSON.stringify(snap, null, 1));
console.log(`Fotografía: ${snap.counts.tables} tablas, ${snap.counts.primaryKeys} PK, ${snap.counts.foreignKeys} FK, flyway ${snap.flyway.at(-1).version}, ${snap.routes.versions} versiones de ruta, ${Object.values(snap.flightsByTypeAndState).reduce((a, b) => a + b, 0)} vuelos, violaciones de restricciones: ${snap.checkConstraintsViolations}`);

if (pre) {
  const diffs = [];
  for (const [t, v] of Object.entries(snap.tables)) {
    const p = pre.tables[t];
    if (!p) { diffs.push(`NUEVA tabla ${t} (${v.rows} filas)`); continue; }
    if (v.rows !== p.rows) diffs.push(`${t}: filas ${p.rows} -> ${v.rows}`);
    else if (v.checksum !== p.checksum) diffs.push(`${t}: contenido de las columnas previas cambió (${p.checksum} -> ${v.checksum})`);
    if (v.columnCount !== p.columnCount) diffs.push(`${t}: columnas ${p.columnCount} -> ${v.columnCount}`);
  }
  for (const t of Object.keys(pre.tables)) if (!snap.tables[t]) diffs.push(`tabla ${t} DESAPARECIÓ`);
  console.log(diffs.length ? 'Diferencias respecto de la fotografía previa:\n - ' + diffs.join('\n - ') : 'Sin diferencias de filas ni de contenido en las columnas previas.');
}
