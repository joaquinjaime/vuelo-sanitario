/* Ejecuta en orden la suite E2E Node completa sobre el stack aislado y resume el resultado de cada script.
 * Los scripts -ui requieren `playwright` en NODE_PATH. Uso: node scripts/e2e-suite-completa.cjs [filtro]
 * e2e-usuarios se ejecuta con e2e-usuarios-aislado.cjs (escenario descartable con un único administrador). */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SUITE = [
  'e2e-usuarios-aislado', 'e2e-usuarios-ui',
  'e2e-identidad-compartida', 'e2e-identidad-compartida-ui',
  'e2e-identidad-dni', 'e2e-identidad-dni-ui',
  'e2e-identidad-dni-usuarios', 'e2e-identidad-dni-usuarios-ui',
  'e2e-paciente-solicitud', 'e2e-paciente-solicitud-ui',
  'e2e-patient-directory', 'e2e-patient-directory-ui',
  'e2e-contactos', 'e2e-contactos-ui',
  'e2e-contactos-solicitud', 'e2e-contactos-solicitud-ui', 'e2e-migracion-contactos',
  'e2e-contactos-tripulacion', 'e2e-contactos-tripulacion-ui',
  'e2e-verificacion-correo', 'e2e-telefonos-internacionales', 'e2e-verificacion-contactos-ui',
  'e2e-auditoria', 'e2e-auditoria-ui',
  'e2e-solicitudes', 'e2e-solicitudes-ui',
  'e2e-aeronaves-tripulacion', 'e2e-aeronaves-tripulacion-ui',
  'e2e-elegibilidad-tripulacion', 'e2e-elegibilidad-tripulacion-ui',
  'e2e-cierre', 'e2e-cierre-ui',
  'e2e-documentos', 'e2e-documentos-integracion-ui',
  'e2e-rutas-revision', 'e2e-rutas-revision-ui', 'e2e-rutas-estabilizacion',
  'e2e-geografia-catalogos', 'e2e-geografia-integridad', 'e2e-i53-operativo-ui', 'e2e-sanitario-replanificacion-ui',
  'e2e-perfiles-comandante', 'e2e-roles-clasificaciones', 'e2e-roles-clasificaciones-ui',
];
const filter = process.argv[2];
const results = [];
for (const name of SUITE.filter((x) => !filter || x.includes(filter))) {
  const started = Date.now();
  const run = spawnSync('node', [path.join(__dirname, name + '.cjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ name, code: run.status, seconds });
  console.log(`${run.status === 0 ? 'OK   ' : 'FALLÓ'} ${name} (${seconds} s)`);
  if (run.status !== 0) console.log(((run.stdout || '') + (run.stderr || '')).split(/\r?\n/).filter(Boolean).slice(-12).map((l) => '    ' + l.slice(0, 220)).join('\n'));
}
const failed = results.filter((r) => r.code !== 0);
console.log(`\n${results.length - failed.length}/${results.length} scripts aprobados${failed.length ? '; fallaron: ' + failed.map((r) => r.name).join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
