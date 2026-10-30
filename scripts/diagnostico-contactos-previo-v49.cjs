/* Ejecuta el diagnóstico de SÓLO LECTURA de contactos (previo a V49/V50) dentro del contenedor de SQL Server indicado.
   Por defecto consulta la base habitual; el script SQL sólo contiene SELECT y tablas temporales de la sesión. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const container = process.argv[2] || 'vuelos-sanitarios-sqlserver-1';
const database = process.argv[3] || 'vuelos_sanitarios';
const script = fs.readFileSync(path.join(__dirname, 'diagnostico-contactos-previo-v49.sql'), 'utf8');
if (/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP\s+(TABLE|DATABASE|INDEX)\s+(?!#)|TRUNCATE|CREATE\s+(TABLE|INDEX|DATABASE)\s+(?!#))/i.test(script.replace(/--.*$/gm, '').replace(/INTO\s+#\w+/gi, ''))) {
  console.error('El script de diagnóstico contiene instrucciones que no son de lectura; se cancela.'); process.exit(2);
}
const result = spawnSync('docker', ['exec', '-i', container, 'bash', '-c',
  `export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -C -d ${database} -W -s " | " -i /dev/stdin`], { input: script, encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exit(result.status === 0 ? 0 : 1);
