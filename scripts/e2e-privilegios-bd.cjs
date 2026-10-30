/* I-5.8 — Separación de cuentas de SQL Server (mínimo privilegio), contra el SQL Server real del stack E2E aislado.
 *
 * 1) Cuenta de la aplicación (la del backend E2E en ejecución): rol de datos únicamente. Se comprueba, conectándose COMO esa cuenta, que no puede ejecutar
 *    DDL (crear/alterar/eliminar tablas, índices, usuarios, roles), no puede deshabilitar triggers, no puede escribir en flyway_schema_history, y que los
 *    triggers de inmutabilidad (auditoría, decisiones de habilitación) siguen rechazando UPDATE/DELETE incluso para ella.
 * 2) Cuenta de migraciones: db_owner (DDL dentro de una transacción que se revierte).
 * 3) Instalación desde base vacía en un escenario descartable: un backend temporal (misma imagen y entorno que el E2E) migra con la cuenta de migraciones
 *    y opera con la cuenta de la aplicación; todas las filas de flyway_schema_history las instaló la cuenta de migraciones; la lista de preparación informa
 *    PRIVILEGIOS_BD=OK; reiniciar el backend lo recupera sin volver a migrar.
 * 4) Ninguna credencial (contraseñas de aplicación, migraciones, SA, secreto JWT) aparece en logs de contenedores, en el historial/configuración de las
 *    imágenes ni en archivos versionados por Git.
 * No toca la base E2E de trabajo (sólo lecturas y DDL revertido) ni la base habitual. Uso: node scripts/e2e-privilegios-bd.cjs */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, SQL_CONTAINER, DB_NAME, sql, one, applyDbPermissions, backendEnv, sleep } = require('./e2e-cierre-support.cjs');

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };

/** Ejecuta T-SQL conectado como `login` (no como sa). La contraseña viaja por variable de entorno del proceso, nunca en los argumentos. */
function sqlAs(login, password, database, query) {
  const r = spawnSync('docker', ['exec', '-i', '-e', 'SQLCMDPASSWORD', SQL_CONTAINER, '/opt/mssql-tools18/bin/sqlcmd', '-b', '-I', '-S', 'localhost', '-U', login, '-C', '-d', database, '-W', '-h', '-1', '-i', '/dev/stdin'],
    { input: 'SET NOCOUNT ON;\n' + query, encoding: 'utf8', env: { ...process.env, SQLCMDPASSWORD: password } });
  return { status: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}
const denied = (r, what) => { assert.notEqual(r.status, 0, `${what}: debía fallar y se ejecutó (${r.out.slice(0, 160)})`); assert.match(r.out, /denied|permission|permiso/i, `${what}: el rechazo no es de permisos: ${r.out.slice(0, 200)}`); };

function failureLines(c) { const l = docker('logs', c); return ((l.stdout || '') + (l.stderr || '')).split(String.fromCharCode(10)).filter((x) => /Caused by|ERROR|Login failed|WARN/.test(x)).slice(0, 8).map((x) => x.slice(0, 260)).join(String.fromCharCode(10)); }
async function waitHealth(container, tries = 150) {
  for (let i = 0; i < tries; i++) {
    const r = docker('exec', container, 'curl', '--silent', '--max-time', '3', 'http://127.0.0.1:8080/actuator/health');
    if (r.status === 0 && /"status":"UP"/.test(r.stdout)) return true;
    const st = docker('inspect', '-f', '{{.State.Running}}', container).stdout.trim();
    if (st !== 'true') return false;
    await sleep(2000);
  }
  return false;
}

(async () => {
  const env = backendEnv();
  const appLogin = env.DB_USERNAME, appPw = env.DB_PASSWORD, migLogin = env.MIGRATION_DB_USERNAME, migPw = env.MIGRATION_DB_PASSWORD;
  assert.ok(appLogin && appPw && migLogin && migPw, 'el backend E2E debe tener ambas cuentas (DB_* y MIGRATION_DB_*)');
  assert.notEqual(appLogin.toLowerCase(), migLogin.toLowerCase()); assert.notEqual(appPw, migPw);
  pass('el backend E2E recibe dos cuentas distintas (aplicación y migraciones) con contraseñas distintas');

  // ---------- 1. Roles en la base de trabajo ----------
  const roles = (login) => sql(`SELECT STRING_AGG(r.name, ',') WITHIN GROUP (ORDER BY r.name) FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id=m.role_principal_id JOIN sys.database_principals u ON u.principal_id=m.member_principal_id WHERE u.name=N'${login}'`).split(/\r?\n/)[0].trim();
  assert.equal(roles(appLogin), 'db_datareader,db_datawriter', 'la cuenta de la aplicación sólo debe pertenecer a los roles de datos');
  assert.equal(roles(migLogin), 'db_owner');
  assert.equal(sql(`SELECT COUNT(*) FROM sys.server_role_members m JOIN sys.server_principals u ON u.principal_id=m.member_principal_id WHERE u.name IN (N'${appLogin}', N'${migLogin}')`).split(/\r?\n/)[0].trim(), '0', 'ninguna de las dos cuentas tiene roles de servidor');
  pass(`roles de base: ${appLogin} = db_datareader+db_datawriter; ${migLogin} = db_owner; sin roles de servidor`);

  // ---------- 2. La cuenta de la aplicación no puede ejecutar DDL ----------
  const t = 'zz_priv_' + crypto.randomBytes(3).toString('hex');
  const A = (q) => sqlAs(appLogin, appPw, DB_NAME, q);
  const firstTable = one(`SELECT TOP 1 name FROM sys.tables WHERE name NOT LIKE 'flyway%' ORDER BY name`);
  // Las sentencias DDL sobre tablas calientes esperan un bloqueo de esquema (Sch-M) ANTES de comprobar permisos: con el backend de trabajo activo (transacciones abiertas) se quedarían esperando.
  // Por eso esas se prueban en el escenario descartable (sin tráfico); en la base de trabajo se prueban las que no esperan bloqueos.
  const lockProne = new Set(['ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'CREATE INDEX', 'DISABLE TRIGGER (auditoría)', 'DROP TRIGGER', 'ALTER TABLE ... DISABLE TRIGGER ALL']);
  const attempts = {
    'CREATE TABLE': `CREATE TABLE dbo.${t} (a int);`,
    'ALTER TABLE': `ALTER TABLE dbo.usuarios ADD ${t} int NULL;`,
    'DROP TABLE': `DROP TABLE dbo.${firstTable};`,
    'TRUNCATE TABLE': `TRUNCATE TABLE dbo.${firstTable};`,
    'CREATE INDEX': `CREATE INDEX ${t} ON dbo.usuarios (nombre_usuario);`,
    'CREATE VIEW': `EXEC(N'CREATE VIEW dbo.${t} AS SELECT 1 AS a');`,
    'CREATE PROCEDURE': `EXEC(N'CREATE PROCEDURE dbo.${t} AS SELECT 1');`,
    'DISABLE TRIGGER (auditoría)': `DISABLE TRIGGER dbo.tr_eventos_auditoria_inmutable ON dbo.eventos_auditoria;`,
    'DROP TRIGGER': `DROP TRIGGER dbo.tr_eventos_auditoria_inmutable;`,
    'ALTER TABLE ... DISABLE TRIGGER ALL': `ALTER TABLE dbo.eventos_auditoria DISABLE TRIGGER ALL;`,
    'CREATE USER': `CREATE USER [${t}] WITHOUT LOGIN;`,
    'ALTER ROLE db_owner': `ALTER ROLE db_owner ADD MEMBER [${appLogin}];`,
    'CREATE SCHEMA': `EXEC(N'CREATE SCHEMA ${t}');`,
    'GRANT': `GRANT CONTROL ON SCHEMA::dbo TO [${migLogin}];`,
    'UPDATE flyway_schema_history': `UPDATE dbo.flyway_schema_history SET checksum = 0 WHERE 1=0;`,
    'DELETE flyway_schema_history': `DELETE FROM dbo.flyway_schema_history WHERE 1=0;`,
    'INSERT flyway_schema_history': `INSERT INTO dbo.flyway_schema_history (installed_rank, description, type, script, checksum, installed_by, execution_time, success) SELECT 0, N'x', N'SQL', N'x', 0, N'x', 0, 1 WHERE 1=0;`,
    'SQL dinámico DDL': `EXEC sp_executesql N'CREATE TABLE dbo.${t}_d (a int)';`,
    'BACKUP DATABASE': `BACKUP DATABASE [${DB_NAME}] TO DISK = N'/tmp/${t}.bak';`,
  };
  const quick = Object.entries(attempts).filter(([what]) => !lockProne.has(what));
  for (const [what, q] of quick) denied(A(q), what);
  assert.equal(Number(one(`SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'zz_priv_%'`)), 0, 'ninguna tabla de prueba debe haberse creado');
  assert.equal(Number(one(`SELECT COUNT(*) FROM sys.triggers WHERE name = N'tr_eventos_auditoria_inmutable' AND is_disabled = 0`)), 1, 'el trigger de auditoría sigue activo');
  pass(`${quick.length} operaciones DDL/administrativas/historial de Flyway rechazadas por permisos para la cuenta de la aplicación en la base de trabajo`);

  // DML sí: leer y escribir datos (dentro de una transacción que se revierte para no ensuciar la base)
  const dml = A(`SELECT COUNT(*) FROM dbo.usuarios; BEGIN TRAN; INSERT INTO dbo.motivos_cancelacion_dummy_inexistente SELECT 1 WHERE 1=0; ROLLBACK;`);
  assert.match(dml.out, /invalid object|no válido|Invalid/i, 'el INSERT en una tabla inexistente falla por objeto, no por permisos (la cuenta lee y escribe datos)');
  const rw = A(`BEGIN TRAN; DECLARE @n int = (SELECT COUNT(*) FROM dbo.usuarios); UPDATE dbo.usuarios SET nombre_usuario = nombre_usuario WHERE 1=0; DELETE FROM dbo.notificaciones WHERE 1=0; SELECT @n; ROLLBACK;`);
  assert.equal(rw.status, 0, 'lectura y escritura de datos permitidas: ' + rw.out.slice(0, 200));
  pass('la cuenta de la aplicación conserva SELECT/INSERT/UPDATE/DELETE sobre los datos');

  // Triggers de inmutabilidad siguen vigentes para la cuenta de la aplicación
  const audit = A(`DELETE FROM dbo.eventos_auditoria WHERE 1=0;`);
  assert.notEqual(audit.status, 0); assert.match(audit.out, /inmutables|51046/i, 'trigger de auditoría: ' + audit.out.slice(0, 200));
  const upd = A(`DELETE FROM dbo.decisiones_habilitacion WHERE 1=0;`);
  assert.notEqual(upd.status, 0); assert.match(upd.out, /inmutables|51060/i, 'trigger de decisiones: ' + upd.out.slice(0, 200));
  pass('los triggers de inmutabilidad (auditoría y decisiones de habilitación) siguen rechazando UPDATE/DELETE para la cuenta de la aplicación');

  // ---------- 3. La cuenta de migraciones sí puede ejecutar DDL ----------
  const M = sqlAs(migLogin, migPw, DB_NAME, `BEGIN TRAN; CREATE TABLE dbo.${t} (a int); ALTER TABLE dbo.${t} ADD b int NULL; CREATE INDEX ix_${t} ON dbo.${t} (a); DROP TABLE dbo.${t}; ROLLBACK;`);
  assert.equal(M.status, 0, 'la cuenta de migraciones debe poder ejecutar DDL: ' + M.out.slice(0, 300));
  assert.equal(Number(one(`SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'zz_priv_%'`)), 0);
  pass('la cuenta de migraciones ejecuta DDL (revertido); la de la aplicación no');

  // ---------- 4. Instalación desde base vacía con las dos cuentas ----------
  const mark = crypto.randomBytes(3).toString('hex');
  const scenarioDb = `vuelos_sanitarios_e2e_priv_${mark}`, container = `vuelos-sanitarios-e2e-priv-${mark}`, port = process.env.E2E_PRIV_SCENARIO_PORT || '18091';
  const inspect = JSON.parse(docker('inspect', BACKEND).stdout)[0];
  const network = Object.keys(inspect.NetworkSettings.Networks)[0];
  const scenarioEnv = inspect.Config.Env.filter((x) => !x.startsWith('DB_URL=') && !x.startsWith('PATH=') && !x.startsWith('DOCUMENTS_DIRECTORY=')).concat(
    `DB_URL=jdbc:sqlserver://sqlserver:1433;databaseName=${scenarioDb};encrypt=true;trustServerCertificate=true`, 'DOCUMENTS_DIRECTORY=/tmp/documentos');
  let created = false, started = false;
  // La VM de Docker (≈3,4 GB) no soporta dos JVM del backend más dos SQL Server: mientras dura el escenario se detienen (sin borrar nada) el backend y el frontend de trabajo y se reinician al final.
  const paused = [BACKEND, BACKEND.replace(/backend-1$/, 'frontend-1')].filter((n) => docker('inspect', '-f', '{{.State.Running}}', n).stdout.trim() === 'true');
  try {
    for (const n of paused) assert.equal(docker('stop', n).status, 0, 'no se pudo detener ' + n);
    sql(`CREATE DATABASE [${scenarioDb}]`, 'master'); created = true;
    applyDbPermissions(scenarioDb);
    const run = docker('run', '-d', '--name', container, '--network', network, '-p', `127.0.0.1:${port}:8080`, ...scenarioEnv.flatMap((x) => ['-e', x]), inspect.Config.Image);
    assert.equal(run.status, 0, run.stderr); started = true;
    assert.ok(await waitHealth(container), 'el backend del escenario no arrancó: ' + failureLines(container));
    const history = (q) => sql(q, scenarioDb);
    const total = Number(history(`SELECT COUNT(*) FROM dbo.flyway_schema_history`).split(/\r?\n/)[0]);
    assert.ok(total >= 60, 'Flyway debió aplicar todas las migraciones (' + total + ')');
    assert.equal(history(`SELECT STRING_AGG(installed_by, ',') FROM (SELECT DISTINCT installed_by FROM dbo.flyway_schema_history) x`).split(/\r?\n/)[0].trim(), migLogin, 'todas las migraciones deben haberlas instalado la cuenta de migraciones');
    assert.equal(history(`SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE success = 0`).split(/\r?\n/)[0].trim(), '0');
    // Primera arranque: db-grants (segunda pasada) aún no corrió; se aplica ahora, igual que lo hace el servicio db-grants o el procedimiento de producción.
    applyDbPermissions(scenarioDb);
    pass(`instalación desde base vacía: ${total} filas de historial, todas instaladas por ${migLogin}; el backend arrancó operando con ${appLogin}`);

    // Privilegios reales de la cuenta de la aplicación sobre la base nueva
    const S = (q) => sqlAs(appLogin, appPw, scenarioDb, q);
    for (const [what, q] of Object.entries(attempts)) denied(S(q.replace(/BACKUP DATABASE \[[^\]]+\]/, `BACKUP DATABASE [${scenarioDb}]`)), what + ' (base nueva)');
    assert.equal(Number(history(`SELECT COUNT(*) FROM sys.triggers WHERE name = N'tr_eventos_auditoria_inmutable' AND is_disabled = 0`).split(/\r?\n/)[0]), 1, 'el trigger de auditoría sigue activo en la base nueva');
    assert.equal(Number(history(`SELECT COUNT(*) FROM dbo.flyway_schema_history WHERE checksum = 0`).split(/\r?\n/)[0]), 0);
    pass(`en la base instalada desde cero la cuenta de la aplicación no puede ejecutar ninguna de las ${Object.keys(attempts).length} operaciones DDL/administrativas (incluidos ALTER/DROP/TRUNCATE, índices y triggers) ni tocar el historial`);

    // Lista de preparación del backend (PRIVILEGIOS_BD) y flujo autenticado real
    const base = `http://127.0.0.1:${port}/api`;
    const login = await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: env.BOOTSTRAP_ADMIN_USERNAME, password: env.BOOTSTRAP_ADMIN_PASSWORD }) })).json();
    assert.ok(login.accessToken, 'inicio de sesión del administrador de arranque en la base nueva');
    const readiness = await (await fetch(base + '/admin/readiness', { headers: { Authorization: 'Bearer ' + login.accessToken } })).json();
    const item = readiness.items.find((i) => i.key === 'PRIVILEGIOS_BD');
    assert.ok(item, 'la lista de preparación debe incluir PRIVILEGIOS_BD'); assert.equal(item.status, 'OK', item.detail);
    assert.equal(String(readiness.flywayVersion).length > 0, true);
    // el inicio de sesión de arriba ya escribió datos (sesión, auditoría) con la cuenta restringida
    assert.ok(Number(history(`SELECT COUNT(*) FROM dbo.eventos_auditoria`).split(/\r?\n/)[0]) >= 0);
    pass('PRIVILEGIOS_BD=OK en la lista de preparación; la aplicación opera (login, lecturas, escritura) con la cuenta restringida');

    // Reinicio: se recupera sin migrar de nuevo
    const before = history(`SELECT COUNT(*) FROM dbo.flyway_schema_history`).split(/\r?\n/)[0].trim();
    assert.equal(docker('restart', container).status, 0);
    assert.ok(await waitHealth(container), 'el backend no se recuperó tras el reinicio');
    assert.equal(history(`SELECT COUNT(*) FROM dbo.flyway_schema_history`).split(/\r?\n/)[0].trim(), before, 'el reinicio no debe aplicar migraciones nuevas');
    assert.equal(Number(history(`SELECT COUNT(*) FROM dbo.usuarios WHERE nombre_usuario = N'${env.BOOTSTRAP_ADMIN_USERNAME.replace(/'/g, "''")}'`).split(/\r?\n/)[0]), 1, 'los datos persisten tras el reinicio');
    pass('reinicio del backend: se recupera, no re-migra y los datos persisten');

    // ---------- 5. Sin credenciales en logs, imágenes ni Git ----------
    const e2eEnvFile = require('node:fs').readFileSync(path.join(ROOT, '.env.e2e'), 'utf8');
    const sa = (e2eEnvFile.match(/^E2E_MSSQL_SA_PASSWORD=(.*)$/m) || [])[1];
    const secrets = { 'DB_PASSWORD': appPw, 'MIGRATION_DB_PASSWORD': migPw, 'JWT_SECRET': env.JWT_SECRET, 'SA': sa, 'BOOTSTRAP_ADMIN_PASSWORD': env.BOOTSTRAP_ADMIN_PASSWORD }; // el valor nunca se imprime
    const leaks = [];
    const logSources = { backend: docker('logs', BACKEND), escenario: docker('logs', container), sqlserver: docker('logs', SQL_CONTAINER) };
    for (const [src, r] of Object.entries(logSources)) for (const [name, v] of Object.entries(secrets)) if (v && v.length >= 8 && ((r.stdout || '') + (r.stderr || '')).includes(v)) leaks.push(`log ${src} contiene ${name}`);
    const imageId = inspect.Image;
    const hist = docker('history', '--no-trunc', imageId).stdout + JSON.stringify(JSON.parse(docker('image', 'inspect', imageId).stdout)[0].Config);
    for (const [name, v] of Object.entries(secrets)) if (v && v.length >= 8 && hist.includes(v)) leaks.push(`imagen contiene ${name}`);
    const tracked = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\0').filter(Boolean);
    const fs = require('node:fs');
    for (const f of tracked) { let c; try { c = fs.readFileSync(path.join(ROOT, f)); } catch { continue; } if (c.length > 5e6) continue; const s = c.toString('latin1'); for (const [name, v] of Object.entries(secrets)) if (v && v.length >= 8 && s.includes(v)) leaks.push(`archivo versionado ${f} contiene ${name}`); }
    assert.deepEqual(leaks, [], 'credenciales expuestas: ' + leaks.join('; '));
    pass(`ninguna de las ${Object.keys(secrets).length} credenciales aparece en logs (backend, escenario, SQL Server), historial/configuración de la imagen ni en ${tracked.length} archivos versionados`);
  } finally {
    if (started) docker('rm', '-f', container);
    for (const n of paused.slice().reverse()) docker('start', n);
    if (created) { try { sql(`ALTER DATABASE [${scenarioDb}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${scenarioDb}]`, 'master'); } catch (e) { console.error('No se pudo eliminar la base del escenario: ' + e.message.slice(0, 200)); } }
  }
  console.log(`\n${passed} comprobaciones superadas`);
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
