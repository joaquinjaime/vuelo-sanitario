/* I-5.8 — Barrido de seguridad de la API real (stack E2E aislado, SQL Server real). Detecta defectos demostrables sin refactorizar:
 *   A) Inventario automático: todos los endpoints declarados en los controladores (método + ruta) se recorren SIN credenciales: sólo los públicos documentados
 *      (/auth/login, /auth/activar-cuenta) pueden responder distinto de 401/403. Un endpoint nuevo sin protección falla este script.
 *   B) Roles sin autorización no administran: DTS, OPERACIONES y COMANDANTE reciben 403 en políticas, auditoría global, preparación, regularización, usuarios y geografía de administración.
 *   C) Higiene de errores: con un administrador, todos los endpoints GET (y los POST/PUT con cuerpo inválido, con identificador inexistente) responden < 500 y su cuerpo
 *      no revela clases Java, trazas, SQL ni mensajes del motor.
 *   D) Un usuario no consulta documentos ajenos de habilitación ni la lista de habilitaciones de otra persona.
 * Uso: node scripts/e2e-seguridad-i58.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, BASE, MARK, call, ok, createUser, waitHealthy } = require('./e2e-cierre-support.cjs');

let passed = 0; const pass = (t) => { passed++; console.log('PASS: ' + t); };
const PUBLIC = new Set(['POST /auth/login', 'POST /auth/activar-cuenta']);
const SKIP_PROBE = [/^\/e2e\//, /\/legacy\/regularize$/, /^\/auth\/logout/];   // controles de prueba y operaciones por lote: no se sondean con basura
const LEAK = /Exception|\bat (com|org|java|jakarta)\.|org\.hibernate|SQLServer|com\.microsoft|Hibernate|stack ?trace|NullPointer|constraint|FK_|dbo\.|SELECT |INSERT |JDBC/i;

function endpoints() {
  const dir = path.join(ROOT, 'backend-java/src/main/java/com/vuelossanitarios/backend/api');
  const list = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('Controller.java'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const base = ((text.match(/@RequestMapping\(\s*(?:value\s*=\s*)?"([^"]*)"/) || [])[1] || '').replace(/^\/api/, '');
    for (const m of text.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping(?:\(\s*(?:value\s*=\s*)?(?:"([^"]*)")?[^)]*\))?/g)) {
      const verb = m[1].toUpperCase(); const sub = m[2] || '';
      const p = (base + sub).replace(/\{[^}]+\}/g, '999999999') || '/';
      list.push({ verb, path: p, file: f });
    }
  }
  return list.filter((e) => !/^\/e2e/.test(e.path) || true);
}

async function raw(verb, p, token, body) {
  const headers = {}; if (token) headers.Authorization = 'Bearer ' + token; if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method: verb, headers, body: body === undefined ? undefined : body });
  const text = await res.text();
  return { status: res.status, text };
}

(async () => {
  await waitHealthy();
  const dotenv = {}; for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { if (line.includes('=') && !line.trim().startsWith('#')) { const i = line.indexOf('='); dotenv[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, ''); } }
  const admin = (await ok('/auth/login', { method: 'POST', body: { username: dotenv.BOOTSTRAP_ADMIN_USERNAME, password: dotenv.BOOTSTRAP_ADMIN_PASSWORD } })).accessToken;
  const list = endpoints(); assert.ok(list.length > 150, 'el inventario de endpoints parece incompleto: ' + list.length);

  // ---------- A) anónimo ----------
  const open = [];
  for (const e of list) {
    if (PUBLIC.has(`${e.verb} ${e.path}`)) continue;
    const r = await raw(e.verb, e.path, null, ['POST', 'PUT', 'PATCH'].includes(e.verb) ? '{}' : undefined);
    if (![401, 403].includes(r.status)) open.push(`${e.verb} ${e.path} → ${r.status} (${e.file})`);
  }
  assert.deepEqual(open, [], 'endpoints alcanzables sin autenticación:\n' + open.join('\n'));
  pass(`${list.length} endpoints del código: ninguno es alcanzable sin credenciales salvo los públicos documentados (login y activación de cuenta)`);

  // ---------- B) roles sin autorización ----------
  const dts = await createUser(admin, 'DTS', 'segd'), ops = await createUser(admin, 'OPERACIONES', 'sego'), cmd = await createUser(admin, 'COMANDANTE', 'segc');
  // Cuerpos con forma VÁLIDA: la validación del formato precede a la autorización en algunos endpoints (400 sin efecto); con un cuerpo válido la respuesta debe ser 403.
  const bodies = {
    'POST /credential-policies': { roleCode: 'MEDICO', credentialType: 'Tipo ' + MARK, notes: 'sondeo de seguridad' },
    'POST /credential-policies/simulation': { name: 'x', roles: ['MEDICO'], policies: [], pendingDecisions: [] },
    'POST /credential-policies/activation': { proposal: { name: 'x', roles: ['MEDICO'], policies: [], pendingDecisions: [] }, approvedFingerprint: 'x'.repeat(64), approvalReference: 'sondeo', acknowledgeIncompatibilities: false },
    'POST /auth/users': { nombre: 'Intruso', apellido: 'Prueba', dni: '99' + String(Date.now()).slice(-10), roles: ['DTS'], correos: [{ direccion: 'intruso' + MARK + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551234' }] },
    'PUT /auth/users/999999999/dni': { dniNuevo: '98' + String(Date.now()).slice(-10), version: 1, motivo: 'sondeo de seguridad sin efecto', cotejoDocumental: true },
  };
  const adminOnly = [['GET', '/credential-policies'], ['POST', '/credential-policies'], ['POST', '/credential-policies/simulation'], ['POST', '/credential-policies/activation'], ['GET', '/admin/readiness'],
    ['GET', '/audit'], ['GET', '/audit/filters'], ['GET', '/professional-credential-documents/legacy/report'], ['POST', '/professional-credential-documents/999999999/regularize'], ['GET', '/professional-credential-documents/antimalware-status'],
    ['GET', '/auth/users'], ['POST', '/auth/users'], ['PUT', '/auth/users/999999999/dni']];
  const bad = [];
  for (const who of [dts, ops, cmd]) for (const [verb, p] of adminOnly) {
    const r = await raw(verb, p, who.token, ['POST', 'PUT'].includes(verb) ? JSON.stringify(bodies[`${verb} ${p}`] || {}) : undefined);
    if (r.status !== 403) bad.push(`${who.role || 'rol'} ${verb} ${p} → ${r.status}`);
  }
  assert.deepEqual(bad, [], 'operaciones administrativas permitidas a roles no administradores:\n' + bad.join('\n'));
  pass(`DTS, OPERACIONES y COMANDANTE reciben 403 en ${adminOnly.length} operaciones administrativas (políticas, auditoría, preparación, regularización, usuarios)`);

  // ---------- C) higiene de errores ----------
  const leaks = [], fives = []; let probes = 0;
  for (const e of list) {
    if (SKIP_PROBE.some((re) => re.test(e.path))) continue;
    for (const variant of e.verb === 'GET' ? [e.path, e.path.replace(/999999999/g, 'abc')] : [e.path, e.path.replace(/999999999/g, 'abc')]) {
      const sendBody = ['POST', 'PUT', 'PATCH'].includes(e.verb);
      const r = await raw(e.verb, variant, admin, sendBody ? '{"__campo_inexistente__":[1,2' : undefined);   // JSON truncado
      const r2 = sendBody ? await raw(e.verb, variant, admin, '{"__campo_inexistente__":1}') : null;
      probes += sendBody ? 2 : 1;
      for (const x of [r, r2].filter(Boolean)) {
        if (x.status >= 500) fives.push(`${e.verb} ${variant} → ${x.status}`);
        if (LEAK.test(x.text)) leaks.push(`${e.verb} ${variant} → ${x.status}: ${x.text.slice(0, 120)}`);
      }
    }
  }
  assert.deepEqual(fives, [], 'respuestas 5xx ante entradas inválidas:\n' + fives.slice(0, 20).join('\n'));
  assert.deepEqual(leaks, [], 'cuerpos de error que revelan detalles internos:\n' + leaks.slice(0, 20).join('\n'));
  pass(`${probes} sondeos con identificadores inexistentes/ilegibles y cuerpos inválidos: ninguna respuesta 5xx y ningún cuerpo revela clases, trazas, SQL ni nombres internos`);

  // ---------- D) documentos y habilitaciones ajenas ----------
  const other = await createUser(admin, 'COMANDANTE', 'sego2');
  const mine = await call(`/users/${cmd.id}/professional-credentials`, { token: other.token, expect: [403, 404] });
  assert.ok([403, 404].includes(mine.status), 'otro usuario no lista las habilitaciones ajenas');
  for (const p of ['/professional-credential-documents/999999999', '/professional-credential-documents/999999999/download']) {
    const r = await raw('GET', p, other.token); assert.ok([403, 404].includes(r.status), p + ' → ' + r.status);
  }
  pass('un usuario sin permiso no lista habilitaciones ajenas ni accede a documentos de habilitación (403/404 indistinguibles para identificadores inexistentes)');
  console.log(`\n${passed} comprobaciones superadas (${MARK})`);
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
