/* Utilidades compartidas de los E2E de cierre (API real, SQL Server aislado y Docker). */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:18080/api';
const PROJECT = 'vuelos-sanitarios-e2e';
const SQL_CONTAINER = `${PROJECT}-sqlserver-1`;
const BACKEND = `${PROJECT}-backend-1`;
const MARK = 'cie' + crypto.randomBytes(3).toString('hex');
const PASSWORD = 'E2E-' + crypto.randomBytes(12).toString('base64url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sql(query, database = "vuelos_sanitarios_e2e") {
  const r = spawnSync('docker', ['exec', '-i', SQL_CONTAINER, 'bash', '-c', 'exec /opt/mssql-tools18/bin/sqlcmd -b -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -d ' + database + ' -W -h -1 -s "|" -i /dev/stdin'], { input: 'SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON;\n' + query, encoding: 'utf8' });
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
  const req = { nombre: 'E2E', apellido: suffix, dni, roles: [role], correos: [{ direccion: name + '@example.test' }], telefonos: [{ numero: '3815551234' }] };
  if (role === 'COMANDANTE') req.licenciaAeronautica = name.toUpperCase();
  const activation = (await call('/auth/users', { method: 'POST', body: req, token: admin })).data;
  await call('/auth/activar-cuenta', { method: 'POST', body: { dni, codigo: activation.codigo, username: name, password: PASSWORD, confirmacionPassword: PASSWORD }, expect: [204] });
  const token = (await ok('/auth/login', { method: 'POST', body: { username: name, password: PASSWORD } })).accessToken;
  const me = await ok('/auth/me', { token });
  return { name, token, id: me.id };
}

const PDF = (() => {
  const NL = String.fromCharCode(10);
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>", ["<< /Length 0 >>", "stream", "", "endstream"].join(NL)];
  let out = "%PDF-1.4" + NL; const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += [(i + 1) + " 0 obj", o, "endobj", ""].join(NL); });
  const xref = Buffer.byteLength(out);
  out += ["xref", "0 5", "0000000000 65535 f "].join(NL) + NL + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n " + NL).join("");
  return Buffer.from(out + ["trailer", "<< /Size 5 /Root 1 0 R >>", "startxref", String(xref), "%%EOF", ""].join(NL));
})();
async function provision(admin, user) {
  await call(`/crew-qualifications/${user.id}/COMANDANTE`, { method: 'PUT', token: admin, expect: [204] });
  const credential = await ok(`/users/${user.id}/professional-credentials`, { method: 'POST', token: admin, body: { roleCode: 'COMANDANTE', type: 'Documento de prueba', number: 'E2E-' + user.id, issuer: 'Organismo de prueba', expires: null, noExpiry: true, notes: 'Pruebas aisladas' } });
  const form = new FormData(); form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'credencial.pdf');
  const up = await fetch(`${BASE}/professional-credentials/${credential.id}/documents`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: form });
  assert.equal(up.status, 200, 'carga de credencial');
  await call(`/professional-credentials/${credential.id}/decision/VERIFICADA`, { method: 'POST', token: admin, body: { notes: 'Revisión manual de datos de prueba', confirmsSufficiency: true } });
}

async function waitHealthy() {
  for (let i = 0; i < 120; i++) { try { const r = await fetch('http://127.0.0.1:18080/actuator/health'); if (r.status === 200) return; } catch { /* reintentar */ } await sleep(2000); }
  throw new Error('El backend E2E no volvió a estar saludable');
}


module.exports = { PDF, ROOT, BASE, PROJECT, SQL_CONTAINER, BACKEND, MARK, PASSWORD, sleep, sql, one, count, call, ok, fmt, futureSlot, createUser, provision, waitHealthy };
