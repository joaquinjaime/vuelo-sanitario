/* Ejecuta e2e-usuarios.cjs en un escenario controlado y descartable.
 *
 * e2e-usuarios.cjs comprueba la regla de "últimos administradores" con una carrera real que exige EXACTAMENTE dos administradores
 * activos. La base aislada de trabajo acumula muchos administradores legítimos de otras pruebas y no se deben eliminar ni desactivar.
 * Este script crea una base NUEVA (vuelos_sanitarios_e2e_admin_<marca>) en el SQL Server aislado, levanta una instancia temporal
 * del mismo backend E2E apuntada a ella (Flyway la migra completa y el administrador inicial es el único), ejecuta e2e-usuarios.cjs sin
 * ninguna modificación de sus aserciones y, al terminar, elimina el contenedor y la base que este script creó. No toca la base de trabajo
 * ni la habitual.  Uso: node scripts/e2e-usuarios-aislado.cjs */
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ROOT, BACKEND, SQL_CONTAINER, DB_NAME, sql, applyDbPermissions } = require('./e2e-cierre-support.cjs');

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const mark = crypto.randomBytes(3).toString('hex');
const scenarioDb = `vuelos_sanitarios_e2e_admin_${mark}`;
const container = `vuelos-sanitarios-e2e-admin-${mark}`;
const port = process.env.E2E_ADMIN_SCENARIO_PORT || '18090';

(async () => {
  assert.ok(/e2e/.test(SQL_CONTAINER) && /e2e/.test(BACKEND), 'sólo el stack aislado');
  const inspect = JSON.parse(docker('inspect', BACKEND).stdout)[0];
  assert.ok(inspect.Config.Env.some((x) => x.startsWith('DB_URL=') && x.includes(`databaseName=${DB_NAME};`)), 'el backend de referencia no es el aislado');
  const env = inspect.Config.Env.filter((x) => !x.startsWith('DB_URL=') && !x.startsWith('PATH=')).concat(`DB_URL=jdbc:sqlserver://sqlserver:1433;databaseName=${scenarioDb};encrypt=true;trustServerCertificate=true`);
  const network = Object.keys(inspect.NetworkSettings.Networks)[0];
  const sqlAlias = Object.values(inspect.NetworkSettings.Networks)[0].Aliases;
  // La máquina de pruebas comparte poca memoria con Docker: mientras dura el escenario se detienen (sin borrar nada) el backend y el
  // frontend de trabajo, que se vuelven a iniciar al terminar.
  const paused = ['frontend', 'backend'].map((s) => BACKEND.replace(/backend-1$/, s + '-1')).filter((n) => docker('inspect', '-f', '{{.State.Running}}', n).stdout.trim() === 'true');
  let created = false, started = false, code = 1;
  try {
    for (const n of paused) assert.equal(docker('stop', n).status, 0, 'no se pudo detener ' + n);
    sql(`CREATE DATABASE [${scenarioDb}]`, 'master'); created = true;
    // Mismo reparto de permisos que docker/sqlserver/init-db.sh: la cuenta de migraciones (Flyway) es db_owner de la base nueva y la de la aplicación sólo lee/escribe datos.
    applyDbPermissions(scenarioDb);
    // Equivale al servicio documents-init de docker-compose.yml: el volumen documental propio del escenario debe pertenecer al usuario de la aplicación.
    const chown = docker('run', '--rm', '--user', 'root', '-v', `${container}-docs:/data/documents`, '--entrypoint', 'chown', inspect.Config.Image, '-R', '999:999', '/data/documents'); assert.equal(chown.status, 0, chown.stderr);
    const args = ['run', '-d', '--name', container, '--network', network, '-p', `127.0.0.1:${port}:8080`, '-v', `${container}-docs:/data/documents`, ...env.flatMap((x) => ['-e', x]), inspect.Config.Image];
    const run = docker(...args); assert.equal(run.status, 0, run.stderr); started = true;
    console.log(`Escenario descartable: base ${scenarioDb}, contenedor ${container} (puerto ${port}); alias de red del SQL Server: ${(sqlAlias || []).join(',')}`);
    // Flyway migra la base nueva completa: se espera a que el backend responda antes de ejecutar la prueba.
    let healthy = false;
    for (let i = 0; i < 150 && !healthy; i++) { try { healthy = (await fetch(`http://127.0.0.1:${port}/actuator/health`)).status === 200; } catch { /* arrancando */ } if (!healthy) await new Promise((r) => setTimeout(r, 2000)); }
    if (!healthy) {
      const logs = docker('logs', container); const text = (logs.stdout || '') + (logs.stderr || '');
      console.error(text.split(/\r?\n/).filter((l) => /Flyway|Migrating|ERROR|WARN|Started|Caused/.test(l)).slice(-25).map((l) => l.slice(0, 220)).join('\n'));
    }
    assert.ok(healthy, 'el backend del escenario no llegó a estar saludable');
    const result = spawnSync('node', [path.resolve(process.argv[2] || path.join(ROOT, 'scripts', 'e2e-usuarios.cjs'))], {
      stdio: 'inherit',
      env: { ...process.env, E2E_BASE: `http://127.0.0.1:${port}/api`, E2E_DB_NAME: scenarioDb, E2E_BACKEND_CONTAINER: container },
    });
    code = result.status ?? 1;
    if (code !== 0) {
      const logs = docker('logs', container); const text = (logs.stdout || '') + (logs.stderr || '');
      console.error('--- registro del backend del escenario (errores) ---\n' + text.split(/\r?\n/).filter((l) => /ERROR|Exception|Caused|com.vuelossanitarios/.test(l)).slice(-(Number(process.env.E2E_LOG_LINES) || 15)).map((l) => l.slice(0, 260)).join('\n'));
    }
  } finally {
    if (started) { docker('rm', '-f', container); docker('volume', 'rm', `${container}-docs`); }   // sólo el volumen documental propio del escenario
    if (created) { try { sql(`ALTER DATABASE [${scenarioDb}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${scenarioDb}]`, 'master'); } catch (e) { console.error('No se pudo eliminar la base descartable ' + scenarioDb + ': ' + e.message); code = code || 1; } }
    for (const n of paused.slice().reverse()) docker('start', n);
  }
  process.exit(code);
})().catch((e) => { console.error(e); process.exit(1); });
