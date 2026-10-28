/* Ejecutor reproducible de la suite E2E Node sobre el stack aislado.
 *
 *   node scripts/e2e-suite-completa.cjs [--filter texto] [--from nombre] [--resume idCorrida] [--timeout-min N] [--fail-fast] [--list]
 *
 * - Ejecuta los scripts en orden, cada uno en su propio proceso, con tiempo máximo: al vencer se termina TODO su árbol de procesos
 *   (incluidos Chrome/Playwright) y el script cuenta como fallo (TIMEOUT).
 * - Guarda el log completo de cada script y un resumen JSON en scripts/e2e-logs/<idCorrida>/ (se actualiza tras cada script, de modo que una
 *   interrupción deja evidencia y --resume continúa con los pendientes sin repetir los aprobados).
 * - Verifica antes de empezar que el stack aislado responda y registra, por script, la memoria libre del anfitrión y la de los contenedores.
 * - Un único ejecutor a la vez (archivo de bloqueo con PID).
 * - Código de salida 0 sólo si TODOS los scripts de la corrida aprobaron; cualquier fallo, timeout o script ausente da 1.
 * Una "corrida continua" es una sola invocación sin --resume ni --from que termina con 0 scripts pendientes.
 * e2e-usuarios necesita un escenario descartable con un único administrador: se ejecuta mediante e2e-usuarios-aislado. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

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
  'e2e-habilitaciones', 'e2e-habilitaciones-vuelos', 'e2e-habilitaciones-ui', 'e2e-tripulacion-actualizacion-ui',
  // I-5.7: V60, procedimiento de políticas, documentos heredados, lista de preparación y antivirus con la exigencia de producción (este último recrea el backend E2E y lo restablece).
  'e2e-politicas-documentos-v60', 'e2e-politicas-documentos-ui', 'e2e-antimalware-produccion',
];
/** Tiempo máximo en minutos de los scripts que históricamente tardan más (el resto usa --timeout-min, 25 por defecto). */
const LONG = { 'e2e-usuarios-aislado': 30, 'e2e-geografia-integridad': 40, 'e2e-i53-operativo-ui': 40, 'e2e-roles-clasificaciones': 35, 'e2e-roles-clasificaciones-ui': 35, 'e2e-habilitaciones': 35, 'e2e-habilitaciones-ui': 35, 'e2e-habilitaciones-vuelos': 45, 'e2e-politicas-documentos-v60': 40, 'e2e-politicas-documentos-ui': 40, 'e2e-antimalware-produccion': 30 };
const API = process.env.E2E_API || 'http://127.0.0.1:18080';
const LOGS = path.join(__dirname, 'e2e-logs');

function parse(argv) {
  const o = { filter: null, from: null, resume: null, timeoutMin: 25, failFast: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--filter') o.filter = argv[++i]; else if (a === '--from') o.from = argv[++i]; else if (a === '--resume') o.resume = argv[++i];
    else if (a === '--timeout-min') o.timeoutMin = Number(argv[++i]); else if (a === '--fail-fast') o.failFast = true; else if (a === '--list') o.list = true;
    else if (!a.startsWith('--') && !o.filter) o.filter = a; // compatibilidad: node scripts/e2e-suite-completa.cjs <filtro>
    else { console.error('Argumento desconocido: ' + a); process.exit(2); }
  }
  return o;
}
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const write = (file, data) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const killTree = (pid) => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* ya terminó */ } } }
};
function dockerMemory() {
  const r = spawnSync('docker', ['stats', '--no-stream', '--format', '{{.Name}}={{.MemUsage}}'], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) return null;
  return Object.fromEntries(r.stdout.split(/\r?\n/).filter(Boolean).map((l) => { const [n, m] = l.split('='); return [n, (m || '').split('/')[0].trim()]; }));
}
async function health() {
  try { const res = await fetch(API + '/actuator/health', { signal: AbortSignal.timeout(10000) }); return res.ok; } catch { return false; }
}
function leftovers() {
  const r = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter((n) => /^vuelos-sanitarios-e2e-admin-/.test(n)) : [];
}
function runScript(name, timeoutMs, logFile) {
  return new Promise((resolve) => {
    const out = fs.openSync(logFile, 'a');
    const child = spawn(process.execPath, [path.join(__dirname, name + '.cjs')], { stdio: ['ignore', out, out], detached: process.platform !== 'win32', windowsHide: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); fs.closeSync(out); resolve({ code: 127, timedOut: false, error: e.message }); });
    child.on('close', (code, signal) => { clearTimeout(timer); killTree(child.pid); fs.closeSync(out); resolve({ code: timedOut ? null : code, signal, timedOut }); });
  });
}
const tail = (file, n = 15) => { try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n).map((l) => '    ' + l.slice(0, 240)).join('\n'); } catch { return ''; } };

(async () => {
  const opt = parse(process.argv.slice(2));
  let names = SUITE.filter((n) => !opt.filter || n.includes(opt.filter));
  if (opt.from) { const at = names.indexOf(opt.from); if (at < 0) { console.error('--from: script desconocido'); process.exit(2); } names = names.slice(at); }
  if (opt.list) { console.log(names.join('\n')); return; }
  const missing = names.filter((n) => !fs.existsSync(path.join(__dirname, n + '.cjs')));
  fs.mkdirSync(LOGS, { recursive: true });
  const lock = path.join(LOGS, 'ejecutor.lock');
  if (fs.existsSync(lock)) { const pid = Number(fs.readFileSync(lock, 'utf8')); if (pid && alive(pid)) { console.error(`Ya hay un ejecutor activo (PID ${pid}).`); process.exit(2); } }
  fs.writeFileSync(lock, String(process.pid));
  const release = () => { try { fs.unlinkSync(lock); } catch { /* ya liberado */ } };
  process.on('exit', release); process.on('SIGINT', () => { release(); process.exit(130); }); process.on('SIGTERM', () => { release(); process.exit(143); });

  const runId = opt.resume || stamp();
  const dir = path.join(LOGS, runId); fs.mkdirSync(dir, { recursive: true });
  const summaryFile = path.join(dir, 'resumen.json');
  const previous = opt.resume && fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : null;
  const summary = previous || { runId, startedAt: new Date().toISOString(), host: os.hostname(), continuous: !opt.resume && !opt.from && !opt.filter, results: [] };
  if (previous) { summary.resumedAt = new Date().toISOString(); summary.continuous = false; }
  console.log(`Corrida ${runId}: ${names.length} scripts. Logs en ${dir}`);
  if (!(await health())) { console.error(`El stack aislado no responde en ${API}/actuator/health. Levántelo antes de ejecutar la suite.`); process.exit(2); }
  const flush = () => write(summaryFile, JSON.stringify(summary, null, 2));
  flush();

  for (const name of names) {
    if (missing.includes(name)) { summary.results.push({ name, status: 'AUSENTE', seconds: 0 }); console.log(`AUSENTE ${name}: no existe el script`); flush(); continue; }
    const done = summary.results.find((r) => r.name === name && r.status === 'OK');
    if (done) { console.log(`OK     ${name} (aprobado en la corrida original, ${done.seconds} s)`); continue; }
    summary.results = summary.results.filter((r) => r.name !== name);
    const logFile = path.join(dir, name + '.log');
    fs.writeFileSync(logFile, '');
    const before = { freeMb: Math.round(os.freemem() / 1048576), docker: dockerMemory() };
    const started = Date.now();
    const result = await runScript(name, (LONG[name] || opt.timeoutMin) * 60000, logFile);
    const seconds = Math.round((Date.now() - started) / 1000);
    const status = result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'OK' : 'FALLO';
    const entry = { name, status, seconds, exitCode: result.code, memory: { before, after: { freeMb: Math.round(os.freemem() / 1048576), docker: dockerMemory() } } };
    const orphans = leftovers(); if (orphans.length) entry.leftoverContainers = orphans;
    summary.results.push(entry); flush();
    console.log(`${status.padEnd(7)}${name} (${seconds} s, libre ${entry.memory.after.freeMb} MB)${orphans.length ? ' ¡contenedores residuales: ' + orphans.join(', ') : ''}`);
    if (status !== 'OK') { console.log(tail(logFile)); if (opt.failFast) break; }
  }

  const failed = summary.results.filter((r) => r.status !== 'OK');
  const notRun = names.filter((n) => !summary.results.some((r) => r.name === n));
  summary.finishedAt = new Date().toISOString(); summary.passed = summary.results.length - failed.length; summary.total = names.length; summary.notRun = notRun; flush();
  console.log(`\n${summary.passed}/${names.length} scripts aprobados${failed.length ? '; fallaron: ' + failed.map((r) => `${r.name} (${r.status})`).join(', ') : ''}${notRun.length ? '; sin ejecutar: ' + notRun.join(', ') : ''}`);
  console.log(`Resumen: ${summaryFile}`);
  process.exit(failed.length || notRun.length ? 1 : 0);
})();
