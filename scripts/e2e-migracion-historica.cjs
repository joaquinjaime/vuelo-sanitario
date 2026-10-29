/* Verifica la migración V42+V43 sobre datos históricos con la forma anterior a V42, en una base DESCARTABLE nueva
 * (vuelos_migracion_<marca>) dentro del SQL Server aislado del proyecto E2E. No toca la base E2E principal ni la habitual.
 * 1) Levanta el backend con Flyway objetivo 41 sobre la base nueva; 2) siembra informes/obligaciones/auditoría con la forma
 * histórica; 3) migra a la última versión con validación Hibernate; 4) comprueba que ninguna decisión se fabrica. */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { MARK, BACKEND, sql, one, sleep, applyDbPermissions } = require('./e2e-cierre-support.cjs');

const DB = 'vuelos_migracion_' + MARK;
const NETWORK = 'vuelos-sanitarios-e2e_internal';
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const q = (query) => sql(query, DB);
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };

async function runBackend(label, extraEnv) {
  const info = JSON.parse(docker('inspect', BACKEND).stdout)[0];
  const env = Object.fromEntries(info.Config.Env.filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  const name = `${BACKEND.replace('-backend-1', '')}-migracion-${MARK}-${label}`;
  const args = ['run', '-d', '--name', name, '--network', NETWORK, '-e', `DB_URL=jdbc:sqlserver://sqlserver:1433;databaseName=${DB};encrypt=true;trustServerCertificate=true`,
    '-e', 'DB_USERNAME=' + env.DB_USERNAME, '-e', 'DB_PASSWORD=' + env.DB_PASSWORD, '-e', 'MIGRATION_DB_USERNAME=' + env.MIGRATION_DB_USERNAME, '-e', 'MIGRATION_DB_PASSWORD=' + env.MIGRATION_DB_PASSWORD, '-e', 'JWT_SECRET=' + env.JWT_SECRET, '-e', 'SPRING_PROFILES_ACTIVE=docker',
    '-e', 'DOCUMENTS_DIRECTORY=/tmp/docs', '-e', 'FINAL_REPORT_SWEEP_ENABLED=false', ...Object.entries(extraEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]), info.Config.Image];
  const started = docker(...args); assert.equal(started.status, 0, 'docker run: ' + started.stderr.slice(0, 300));
  try {
    for (let i = 0; i < 150; i++) {
      const logs = docker('logs', name); const text = (logs.stdout || '') + (logs.stderr || '');
      if (text.includes('Started BackendApplication')) return text;
      if (text.includes('Application run failed') || text.includes('APPLICATION FAILED')) throw new Error('El backend no arrancó (' + label + '): ' + text.split('\n').filter((l) => /ERROR|Message|failed/i.test(l)).slice(0, 6).join(' | '));
      await sleep(2000);
    }
    throw new Error('Tiempo agotado esperando al backend (' + label + ')');
  } finally { docker('rm', '-f', name); }
}

const SEED = `
DECLARE @tipo BIGINT = (SELECT TOP 1 id_tipos_vuelo FROM tipos_vuelo ORDER BY id_tipos_vuelo);
INSERT INTO personas(nombre_persona, apellido_persona) VALUES (N'Cmd', N'Historico'), (N'Ops', N'Historico');
INSERT INTO usuarios(nombre_usuario, hash_contrasena, id_personas) VALUES
  (N'hist_cmd', N'x', (SELECT id_personas FROM personas WHERE nombre_persona = N'Cmd' AND apellido_persona = N'Historico')),
  (N'hist_ops', N'x', (SELECT id_personas FROM personas WHERE nombre_persona = N'Ops' AND apellido_persona = N'Historico'));
DECLARE @cmd BIGINT = (SELECT id_usuarios FROM usuarios WHERE nombre_usuario = N'hist_cmd'), @ops BIGINT = (SELECT id_usuarios FROM usuarios WHERE nombre_usuario = N'hist_ops');
INSERT INTO vuelos(codigo_vuelo, motivo_vuelo, id_tipos_vuelo, id_usuario_creador, id_usuario_comandante, id_estados_vuelo)
SELECT N'H-' + x.c, N'historico', @tipo, @ops, @cmd, (SELECT id_estados_vuelo FROM estados_vuelo WHERE codigo_estado_vuelo = x.s)
FROM (VALUES (N'1', N'COMPLETADO'), (N'2', N'COMPLETADO'), (N'3', N'FINALIZADO'), (N'4', N'FINALIZADO'), (N'5', N'FINALIZADO'), (N'6', N'FINALIZADO'), (N'7', N'FINALIZADO'), (N'8', N'FINALIZADO')) x(c, s);
DECLARE @f1 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-1'),@f2 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-2'),@f3 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-3'),@f4 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-4'),
        @f5 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-5'),@f6 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-6'),@f7 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-7'),@f8 BIGINT=(SELECT id_vuelos FROM vuelos WHERE codigo_vuelo=N'H-8');
INSERT INTO informes_finales_vuelo(id_vuelos, version, es_version_actual, resumen, id_usuario_creador) VALUES
  (@f1,1,1,N'H1 aprobado con auditoría',@cmd),(@f2,1,1,N'H2 aprobado sin auditoría',@cmd),(@f3,1,1,N'H3 obligación aprobada pero vuelo no completado',@cmd),(@f4,1,1,N'H4 devuelto',@cmd),
  (@f5,1,1,N'H5 presentado',@cmd),(@f6,1,1,N'H6 sin obligación (carga previa al flujo)',@cmd),(@f7,1,0,N'H7 v1 reemplazada',@cmd),(@f7,2,1,N'H7 v2 presentada',@cmd);
DECLARE @due DATETIMEOFFSET(3) = SYSDATETIMEOFFSET();
INSERT INTO obligaciones_informe_final(id_vuelos,id_usuario_comandante,numero_obligacion,estado_obligacion,vencimiento_original,vencimiento,id_informes_finales_vuelo,fecha_presentacion,fecha_aprobacion,id_usuario_aprobador,fecha_devolucion,id_usuario_devolvedor,motivo_devolucion)
SELECT @f1,@cmd,1,N'APROBADO',@due,@due,r.id_informes_finales_vuelo,@due,@due,@ops,NULL,NULL,NULL FROM informes_finales_vuelo r WHERE r.id_vuelos=@f1
UNION ALL SELECT @f2,@cmd,1,N'APROBADO',@due,@due,r.id_informes_finales_vuelo,@due,@due,@ops,NULL,NULL,NULL FROM informes_finales_vuelo r WHERE r.id_vuelos=@f2
UNION ALL SELECT @f3,@cmd,1,N'APROBADO',@due,@due,r.id_informes_finales_vuelo,@due,@due,@ops,NULL,NULL,NULL FROM informes_finales_vuelo r WHERE r.id_vuelos=@f3
UNION ALL SELECT @f4,@cmd,1,N'DEVUELTO',@due,@due,r.id_informes_finales_vuelo,@due,NULL,NULL,@due,@ops,N'Motivo histórico de devolución' FROM informes_finales_vuelo r WHERE r.id_vuelos=@f4
UNION ALL SELECT @f5,@cmd,1,N'PRESENTADO',@due,@due,r.id_informes_finales_vuelo,@due,NULL,NULL,NULL,NULL,NULL FROM informes_finales_vuelo r WHERE r.id_vuelos=@f5
UNION ALL SELECT @f7,@cmd,1,N'PRESENTADO',@due,@due,r.id_informes_finales_vuelo,@due,NULL,NULL,NULL,NULL,NULL FROM informes_finales_vuelo r WHERE r.id_vuelos=@f7 AND r.es_version_actual=1
UNION ALL SELECT @f8,@cmd,1,N'PENDIENTE',@due,@due,NULL,NULL,NULL,NULL,NULL,NULL,NULL;
-- Auditoría con la forma anterior a V42 (sin estadoObligacion): sólo H-1 conserva SUBMIT/APPROVE/FINISH.
INSERT INTO eventos_auditoria(id_vuelos,id_usuario_actor,tipo_entidad,entidad_id,operacion,valores_nuevos)
SELECT @f1,@cmd,N'FINAL_REPORT',r.id_informes_finales_vuelo,N'SUBMIT',N'{"version":1}' FROM informes_finales_vuelo r WHERE r.id_vuelos=@f1
UNION ALL SELECT @f1,@ops,N'FINAL_REPORT',r.id_informes_finales_vuelo,N'APPROVE',N'{"status":"COMPLETADO"}' FROM informes_finales_vuelo r WHERE r.id_vuelos=@f1
UNION ALL SELECT @f1,@ops,N'FLIGHT',@f1,N'FINISH',N'{"estado":"FINALIZADO"}';
`;

/** Última migración del código: la mayor versión entre los archivos SQL y las migraciones Java (la expectativa no se fija a mano en cada incremento). */
function latestMigration() {
  const fs = require('node:fs'), path = require('node:path'); const root = path.resolve(__dirname, '..', 'backend-java', 'src', 'main');
  const versions = [path.join(root, 'resources', 'db', 'migration'), path.join(root, 'java', 'db', 'migration')].filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d)).map((n) => (n.match(/^V([0-9]+)__/) || [])[1]).filter(Boolean).map(Number);
  return Math.max(...versions);
}

(async () => {
  assert.notEqual(one('SELECT DB_NAME()'), '');
  // La VM de Docker (≈3,4 GB) no soporta un segundo backend junto al de trabajo: se detienen (sin borrar nada) el backend y el frontend E2E mientras dura el escenario y se reinician al salir.
  const paused = [BACKEND, BACKEND.replace(/backend-1$/, 'frontend-1')].filter((n) => docker('inspect', '-f', '{{.State.Running}}', n).stdout.trim() === 'true');
  for (const n of paused) assert.equal(docker('stop', n).status, 0, 'no se pudo detener ' + n);
  process.on('exit', () => { for (const n of paused.slice().reverse()) spawnSync('docker', ['start', n]); for (let i = 0; i < 40; i++) { const r = spawnSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', BACKEND], { encoding: 'utf8' }); if (r.stdout && r.stdout.trim() === 'healthy') break; spawnSync(process.platform === 'win32' ? 'ping' : 'sleep', process.platform === 'win32' ? ['-n', '4', '127.0.0.1'] : ['3']); } });
  sql(`CREATE DATABASE [${DB}]`, 'master');
  applyDbPermissions(DB);
  await runBackend('v41', { SPRING_FLYWAY_TARGET: '41', SPRING_JPA_HIBERNATE_DDL_AUTO: 'none' });
  assert.equal(one(`SELECT MAX(CAST(version AS int)) FROM [${DB}].dbo.flyway_schema_history WHERE version IS NOT NULL`), '41');
  assert.equal(Number(one(`SELECT COUNT(*) FROM [${DB}].sys.columns WHERE object_id = OBJECT_ID(N'[${DB}].dbo.informes_finales_vuelo') AND name = N'estado_revision'`)), 0, 'la base descartable aún no tiene el esquema V42');
  q(SEED);
  assert.equal(Number(q('SELECT COUNT(*) FROM informes_finales_vuelo')), 8); assert.equal(Number(q('SELECT COUNT(*) FROM obligaciones_informe_final')), 7);
  pass('base descartable en V41 con 8 versiones, 7 obligaciones y auditoría con la forma histórica');

  await runBackend('latest', {});
  assert.equal(one(`SELECT MAX(CAST(version AS int)) FROM [${DB}].dbo.flyway_schema_history WHERE version IS NOT NULL`), String(latestMigration()));
  pass(`V42 en adelante (hasta la V${latestMigration()}, la última del código) aplicadas sobre datos históricos y Hibernate valida el esquema resultante`);

  const row = (code) => q(`SELECT r.estado_revision, r.origen_decision, ISNULL(CONVERT(varchar(30), r.fecha_revision, 126), 'NULL'), ISNULL(CAST(r.id_usuario_revisor AS varchar), 'NULL'), ISNULL(r.motivo_devolucion, 'NULL'), r.version, r.es_version_actual, r.resumen FROM informes_finales_vuelo r JOIN vuelos v ON v.id_vuelos = r.id_vuelos WHERE v.codigo_vuelo = N'${code}' ORDER BY r.version`).split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim()));
  const ops = q(`SELECT id_usuarios FROM usuarios WHERE nombre_usuario = N'hist_ops'`);
  let [h1] = row('H-1'); assert.deepEqual([h1[0], h1[1], h1[3]], ['APROBADO', 'HISTORICA_OBLIGACION_AUDITADA', ops]); assert.notEqual(h1[2], 'NULL');
  let [h2] = row('H-2'); assert.deepEqual([h2[0], h2[1], h2[3]], ['APROBADO', 'HISTORICA_OBLIGACION', ops]);
  let [h3] = row('H-3'); assert.deepEqual([h3[0], h3[1], h3[2], h3[3]], ['HISTORICO_SIN_DECISION', 'HISTORICA_SIN_EVIDENCIA', 'NULL', 'NULL'], 'una aprobación sin vuelo completado no se hereda como decisión');
  let [h4] = row('H-4'); assert.deepEqual([h4[0], h4[1], h4[4]], ['DEVUELTO', 'HISTORICA_OBLIGACION', 'Motivo histórico de devolución']);
  let [h5] = row('H-5'); assert.deepEqual([h5[0], h5[1]], ['PRESENTADO', 'HISTORICA_OBLIGACION']);
  let [h6] = row('H-6'); assert.deepEqual([h6[0], h6[1], h6[2], h6[3]], ['HISTORICO_SIN_DECISION', 'HISTORICA_SIN_EVIDENCIA', 'NULL', 'NULL'], 'un informe sin obligación no queda "presentado" ni "aprobado"');
  const h7 = row('H-7'); assert.deepEqual([h7[0][0], h7[0][1], h7[1][0], h7[1][1]], ['REEMPLAZADO', 'HISTORICA_SIN_EVIDENCIA', 'PRESENTADO', 'HISTORICA_OBLIGACION']);
  assert.equal(Number(q(`SELECT COUNT(*) FROM informes_finales_vuelo`)), 8, 'ningún informe histórico se elimina'); assert.equal(q(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE resumen LIKE N'H%'`), '8', 'los textos se conservan');
  assert.equal(Number(q(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE origen_decision = N'FLUJO_ACTUAL'`)), 0, 'ningún dato histórico se presenta como producido por el flujo actual');
  assert.equal(q(`SELECT COUNT(*) FROM informes_finales_vuelo WHERE estado_revision = N'APROBADO'`), '2', 'sólo las dos aprobaciones respaldadas por la obligación y el vuelo COMPLETADO');
  assert.equal(q(`SELECT ISNULL(CAST(o.id_usuario_finalizador AS varchar), 'NULL') FROM obligaciones_informe_final o JOIN vuelos v ON v.id_vuelos = o.id_vuelos WHERE v.codigo_vuelo = N'H-1'`), ops); assert.equal(q(`SELECT ISNULL(CAST(o.id_usuario_finalizador AS varchar), 'NULL') FROM obligaciones_informe_final o JOIN vuelos v ON v.id_vuelos = o.id_vuelos WHERE v.codigo_vuelo = N'H-2'`), 'NULL', 'sin evidencia no se asigna responsable');
  pass('clasificación histórica: 2 aprobaciones con evidencia (una auditada), devolución y presentación respaldadas por la obligación, 2 versiones sin decisión comprobable, 1 reemplazada; nada eliminado ni fabricado');

  // Las restricciones de la base impiden fabricar decisiones sobre datos históricos.
  const rejects = (statement, pattern) => assert.throws(() => q(statement), (e) => pattern.test(e.sqlOutput || e.message), 'debía rechazarse: ' + statement.slice(0, 70));
  rejects(`UPDATE r SET estado_revision = N'APROBADO' FROM informes_finales_vuelo r JOIN vuelos v ON v.id_vuelos = r.id_vuelos WHERE v.codigo_vuelo = N'H-6'`, /ck_informes_finales_vuelo_revision/);
  rejects(`UPDATE r SET estado_revision = N'APROBADO', fecha_revision = SYSDATETIMEOFFSET(), id_usuario_revisor = (SELECT id_usuarios FROM usuarios WHERE nombre_usuario = N'hist_ops') FROM informes_finales_vuelo r JOIN vuelos v ON v.id_vuelos = r.id_vuelos WHERE v.codigo_vuelo = N'H-6'`, /ck_informes_finales_vuelo_revision/);
  rejects(`UPDATE vuelos SET id_estados_vuelo = (SELECT id_estados_vuelo FROM estados_vuelo WHERE codigo_estado_vuelo = N'COMPLETADO') WHERE codigo_vuelo = N'H-3'`, /51043/);
  rejects(`UPDATE vuelos SET id_estados_vuelo = (SELECT id_estados_vuelo FROM estados_vuelo WHERE codigo_estado_vuelo = N'COMPLETADO') WHERE codigo_vuelo IN (N'H-5', N'H-6')`, /51043/);
  assert.equal(q(`SELECT COUNT(*) FROM vuelos v JOIN estados_vuelo e ON e.id_estados_vuelo = v.id_estados_vuelo WHERE v.codigo_vuelo IN (N'H-3', N'H-5', N'H-6') AND e.codigo_estado_vuelo = N'FINALIZADO'`), '3', 'la sentencia multi-vuelo rechazada no cambió ninguno');
  q(`UPDATE vuelos SET motivo_vuelo = N'historico editado' WHERE codigo_vuelo = N'H-1'`); // una actualización histórica legítima no se bloquea
  rejects(`UPDATE o SET estado_obligacion = N'APROBADO' FROM obligaciones_informe_final o JOIN vuelos v ON v.id_vuelos = o.id_vuelos WHERE v.codigo_vuelo = N'H-5'`, /51044|ck_/);
  pass('SQL Server rechaza aprobar históricos sin decisión, COMPLETADO sin aprobación (también en sentencias multi-vuelo, atómicas) y la aprobación de obligaciones inconsistentes; las ediciones históricas legítimas siguen permitidas');
  try { sql(`ALTER DATABASE [${DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${DB}]`, 'master'); } catch (e) { console.error('No se pudo eliminar la base descartable ' + DB + ': ' + String(e.message).slice(0, 160)); }
  console.log(`\nMIGRACIÓN HISTÓRICA COMPLETA: ${passed} bloques aprobados (base ${DB}).`);
})().catch((e) => { console.error('FALLO MIGRACIÓN:', e.stack || e); process.exit(1); });
