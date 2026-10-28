/* Utilidades compartidas de los E2E de cierre (API real, SQL Server aislado y Docker). */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = process.env.E2E_PROJECT || 'vuelos-sanitarios-e2e';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:18080/api';
const DB_NAME = process.env.E2E_DB_NAME || 'vuelos_sanitarios_e2e';
const SQL_CONTAINER = process.env.E2E_SQL_CONTAINER || `${PROJECT}-sqlserver-1`;
const BACKEND = process.env.E2E_BACKEND_CONTAINER || `${PROJECT}-backend-1`;
// E2E_FIXED_MARK / E2E_FIXED_PASSWORD permiten que dos procesos (p. ej. la siembra y la verificación del ensayo de migración) compartan las cuentas que crearon.
const MARK = process.env.E2E_FIXED_MARK || 'cie' + crypto.randomBytes(3).toString('hex');
const PASSWORD = process.env.E2E_FIXED_PASSWORD || 'E2E-' + crypto.randomBytes(12).toString('base64url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sql(query, database = DB_NAME) {
  const r = spawnSync('docker', ['exec', '-i', SQL_CONTAINER, 'bash', '-c', 'export SQLCMDPASSWORD="$MSSQL_SA_PASSWORD"; exec /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -C -d ' + database + ' -W -h -1 -s "|" -i /dev/stdin'], { input: 'SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON;\n' + query, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) { const e = new Error('SQL falló: ' + out.slice(0, 600)); e.sqlOutput = out; throw e; }
  return out.trim();
}
const one = (query) => sql(query).split(/\r?\n/)[0].trim();
const count = (query) => Number(one(query));

async function call(p, { method = 'GET', body, token, expect = [200] } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await res.text();
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  const allowed = Array.isArray(expect) ? expect : [expect];
  if (!allowed.includes(res.status)) throw new Error(`${method} ${p}: HTTP ${res.status}, esperado ${allowed}; ${raw.slice(0, 400)}`);
  return { status: res.status, data };
}
const ok = async (p, o) => (await call(p, o)).data;

function fmt(d) { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; }
let dayCursor = 400 + Math.floor(Math.random() * 2000);
const futureSlot = () => { const d = new Date(Date.now() + (dayCursor += 3) * 86400000); d.setMilliseconds(0); return d; };

async function createUser(admin, role, suffix) {
  const dni = String(100000000000 + Math.floor(Math.random() * 899999999999));
  const name = MARK + suffix;
  const req = { nombre: 'E2E', apellido: suffix, dni, roles: [role], correos: [{ direccion: name + '@example.test' }], telefonos: [{ pais: 'AR', numero: '3815551234' }] };
  if (role === 'COMANDANTE') req.licenciaAeronautica = name.toUpperCase();
  const activation = (await call('/auth/users', { method: 'POST', body: req, token: admin })).data;
  await call('/auth/activar-cuenta', { method: 'POST', body: { dni, codigo: activation.codigo, username: name, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
  const token = (await ok('/auth/login', { method: 'POST', body: { username: name, password: PASSWORD } })).accessToken;
  const me = await ok('/auth/me', { token });
  return { name, token, id: me.id };
}

/**
 * Deja aprobada la ruta vigente de un vuelo PLANIFICADO, como exige el inicio desde I-4: el comandante la planifica y la presenta
 * y Operaciones la aprueba. Según el estado actual de la ruta guarda una versión, presenta el borrador o no hace nada.
 */
async function approveRoute(flightId, commanderToken, opsToken, recorrido = 'Ruta E2E directa') {
  const route = await ok(`/flights/${flightId}/route`, { token: commanderToken });
  if (route.estado === 'APROBADA') return route;
  if (route.estado === 'BORRADOR') await ok(`/flights/${flightId}/route/submit`, { method: 'POST', token: commanderToken, body: { version: route.versionVigente } });
  else if (route.estado !== 'PENDIENTE_REVISION') {
    const body = { version: route.versionVigente || 0, recorrido, presentar: true };
    if (route.requiereMotivo) body.motivoModificacion = 'Regularización de la ruta para el inicio E2E';
    await ok(`/flights/${flightId}/route`, { method: 'PUT', token: commanderToken, body });
  }
  const pending = await ok(`/flights/${flightId}/route`, { token: opsToken });
  return ok(`/flights/${flightId}/route/approve`, { method: 'POST', token: opsToken, body: { version: pending.versionVigente } });
}

/** PDF mínimo y estructuralmente válido (lo acepta el análisis de PDFBox del servidor); `label` lo vuelve único. */
function makePdf(label = 'E2E', { catalogExtra = '', comment = '' } = {}) {
  const NL = '\n', content = `BT /F1 12 Tf 20 50 Td (${label}) Tj ET`;
  const objects = [`<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>`, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>', `<< /Length ${content.length} >>${NL}stream${NL}${content}${NL}endstream`];
  let out = '%PDF-1.4' + NL + (comment ? '% ' + comment + NL : ''); const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj${NL}${o}${NL}endobj${NL}`; });
  const xref = Buffer.byteLength(out);
  out += `xref${NL}0 5${NL}0000000000 65535 f ${NL}` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n ' + NL).join('') + `trailer${NL}<< /Size 5 /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf('E2E');
const ensuredFor = new Set();
async function provision(admin, user) {
  if (!ensuredFor.has(admin)) { await ensureCredentialPolicies(admin); ensuredFor.add(admin); }
  await call(`/crew-qualifications/${user.id}/COMANDANTE`, { method: 'PUT', token: admin, expect: [204] });
  const credential = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'COMANDANTE', type: 'Documento de prueba', number: 'E2E-' + user.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
  const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
  const up = await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form });
  assert.equal(up.status, 200, 'carga de credencial');
  await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
}

// ---- Bandeja de pruebas (Mailpit) del stack aislado: un servidor SMTP real que retiene los mensajes y no los entrega a nadie. ----
const MAILBOX = process.env.E2E_MAILBOX || 'http://127.0.0.1:18025';
const CODE_PATTERN = /([A-Z2-9]{4}-[A-Z2-9]{4})/;
async function mailboxMessages(address) {
  const res = await fetch(MAILBOX + '/api/v1/search?query=' + encodeURIComponent('to:"' + address + '"'));
  if (!res.ok) throw new Error('La bandeja de pruebas no responde (' + res.status + ')');
  return (await res.json()).messages || [];
}
/** Código del mensaje más reciente enviado a `address`; espera a que el SMTP de pruebas lo haya recibido. */
async function mailboxCode(address, { after = 0 } = {}) {
  for (let i = 0; i < 40; i++) {
    const messages = await mailboxMessages(address);
    if (messages.length > after) {
      const detail = await (await fetch(MAILBOX + '/api/v1/message/' + messages[0].ID)).json();
      const match = CODE_PATTERN.exec(detail.Text || '');
      if (match) return { code: match[1], count: messages.length, message: detail };
    }
    await sleep(250);
  }
  throw new Error('No llegó ningún código a ' + address);
}
/** Deja un código vigente en la bandeja (solicita uno nuevo, esperando el intervalo mínimo de reenvío del E2E) y lo confirma como titular. */
async function confirmEmail(user, emailId, address) {
  const before = (await mailboxMessages(address)).length;
  for (let i = 0; i < 8; i++) {
    const r = await call('/auth/me/correos/' + emailId + '/verificacion', { method: 'POST', token: user.token, expect: [200, 429] });
    if (r.status === 200) break;
    await sleep(2300);
  }
  const { code } = await mailboxCode(address, { after: before });
  return call('/auth/me/correos/' + emailId + '/verificacion/confirmar', { method: 'POST', token: user.token, body: { codigo: code } });
}
async function verifyEmail(user, emailId, address) {
  const { code } = await mailboxCode(address);
  return call('/auth/me/correos/' + emailId + '/verificacion/confirmar', { method: 'POST', token: user.token, body: { codigo: code } });
}

async function waitHealthy() {
  const health = process.env.E2E_HEALTH_URL || BASE.replace(/\/api\/?$/, '') + '/actuator/health';
  for (let i = 0; i < 120; i++) { try { const r = await fetch(health); if (r.status === 200) return; } catch { /* reintentar */ } await sleep(2000); }
  throw new Error('El backend E2E no volvió a estar saludable');
}


/** I-5.6: sin política de suficiencia nadie es elegible. Los E2E que necesitan tripulación habilitada cargan, por la API pública, la política mínima
 *  para sus tipos de documento de prueba (configuración interna de la prueba, no un requisito regulatorio). Idempotente (409 POLITICA_DUPLICADA se tolera). */
const E2E_CREDENTIAL_TYPES = ['Documento de prueba', 'Documento E2E', 'Documento E2E UI', 'Documento de independencia'];
async function ensureCredentialPolicies(admin, types = E2E_CREDENTIAL_TYPES) {
  for (const roleCode of ['COMANDANTE', 'COPILOTO', 'MEDICO', 'ENFERMERO']) for (const credentialType of types) {
    await call('/credential-policies', { method: 'POST', token: admin, body: { roleCode, credentialType, notes: 'Política mínima de las pruebas E2E aisladas' }, expect: [200, 409] });
  }
}

/** Ejecuta `fn` sin ninguna política activa para `roleCode` (para comprobar POLITICA_HABILITACION_NO_CONFIGURADA con exactitud) y las restablece al terminar, aun si falla.
 *  Las pruebas de la suite corren de a una; las políticas restablecidas son nuevas filas con los mismos datos (las dadas de baja se conservan como historial). */
async function withoutPolicies(admin, roleCode, fn) {
  const active = (await ok('/credential-policies', { token: admin })).filter((p) => p.active && p.roleCode === roleCode);
  for (const p of active) await call(`/credential-policies/${p.id}/deactivate`, { method: 'POST', token: admin, body: { reason: 'E2E: se comprueba la ausencia de política' } });
  try { return await fn(); }
  finally {
    for (const p of active) await call('/credential-policies', { method: 'POST', token: admin, body: { roleCode: p.roleCode, flightTypeCode: p.flightTypeCode, aircraftCategory: p.aircraftCategory, credentialType: p.credentialType, requiresJurisdiction: p.requiresJurisdiction, requiresExternalCheck: p.requiresExternalCheck, origin: p.origin, sourceReference: p.sourceReference, notes: p.notes }, expect: [200, 409] });
  }
}

module.exports = { withoutPolicies, makePdf, ensureCredentialPolicies, E2E_CREDENTIAL_TYPES, confirmEmail, MAILBOX, mailboxMessages, mailboxCode, verifyEmail, PDF, ROOT, BASE, PROJECT, DB_NAME, SQL_CONTAINER, BACKEND, MARK, PASSWORD, sleep, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy, approveRoute };
