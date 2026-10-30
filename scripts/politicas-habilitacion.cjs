#!/usr/bin/env node
// Procedimiento de carga, simulación y activación de la política de suficiencia (I-5.7, fase 2).
//
//   node scripts/politicas-habilitacion.cjs validate <propuesta.json>
//   node scripts/politicas-habilitacion.cjs simulate <propuesta.json> [--out informe.json]
//   node scripts/politicas-habilitacion.cjs activate <propuesta.json> --fingerprint <huella> --approval "<referencia de la aprobación>" [--acknowledge]
//
// Entorno: POLICY_API_BASE (por defecto el E2E aislado, http://127.0.0.1:18080/api), POLICY_ADMIN_TOKEN o POLICY_ADMIN_USER + POLICY_ADMIN_PASSWORD.
// `validate` sólo comprueba el JSON localmente. `simulate` no modifica nada. `activate` exige la huella del informe de `simulate` (lo aprobado es lo que se activa)
// y la referencia de la aprobación; contra cualquier destino que no sea el E2E aislado exige además POLICY_ACTIVATION_TARGET_CONFIRMED=<POLICY_API_BASE exacto>.
const fs = require("fs"), path = require("path");

const E2E_BASE = "http://127.0.0.1:18080/api";
const base = (process.env.POLICY_API_BASE || E2E_BASE).replace(/\/$/, "");
const [command, file] = process.argv.slice(2);
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name) => process.argv.includes(`--${name}`);
// process.exit() con conexiones HTTP todavía cerrándose provoca en Node/Windows un «Assertion failed: UV_HANDLE_CLOSING» y un código de salida 0xC0000409: después de la red sólo se fija process.exitCode.
class Failure extends Error {}
const fail = (message) => { if (started) throw new Failure(message); console.error(message); process.exit(2); };
let started = false;

if (!["validate", "simulate", "activate"].includes(command) || !file) fail("Uso: politicas-habilitacion.cjs <validate|simulate|activate> <propuesta.json> [opciones]");
let proposal;
try { proposal = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); } catch (e) { fail(`No se pudo leer la propuesta: ${e.message}`); }
const known = new Set(["name", "roles", "policies", "pendingDecisions"]);
const unknown = Object.keys(proposal).filter((k) => !known.has(k));
if (unknown.length) fail(`Campos no admitidos en la propuesta: ${unknown.join(", ")}`);
if (!Array.isArray(proposal.roles) || !proposal.roles.length) fail("La propuesta debe indicar las funciones que abarca (roles)");
if (command === "validate") { console.log(`JSON válido: ${proposal.roles.length} función(es), ${(proposal.policies || []).length} política(s), ${(proposal.pendingDecisions || []).length} decisión(es) pendiente(s).`); process.exit(0); }

async function token() {
  if (process.env.POLICY_ADMIN_TOKEN) return process.env.POLICY_ADMIN_TOKEN;
  const username = process.env.POLICY_ADMIN_USER, password = process.env.POLICY_ADMIN_PASSWORD;
  if (!username || !password) fail("Defina POLICY_ADMIN_TOKEN o POLICY_ADMIN_USER y POLICY_ADMIN_PASSWORD");
  const res = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  if (!res.ok) fail(`Inicio de sesión rechazado (HTTP ${res.status})`);
  return (await res.json()).accessToken;
}
async function post(endpoint, body, bearer) {
  const res = await fetch(`${base}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  started = true;
  const bearer = await token();
  if (command === "simulate") {
    const { status, data } = await post("/credential-policies/simulation", proposal, bearer);
    if (status !== 200) fail(`La simulación fue rechazada (HTTP ${status}): ${JSON.stringify(data).slice(0, 500)}`);
    const out = arg("out"); if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(data, null, 2));
    console.log(`Huella de la propuesta: ${data.fingerprint}`);
    console.log(`Puede activarse: ${data.canActivate ? "sí" : "NO (hay errores)"} · requiere reconocer incompatibilidades: ${data.requiresAcknowledgement ? "sí" : "no"}`);
    for (const i of data.issues) console.log(`  [${i.severity}] ${i.message}`);
    for (const r of data.plan) console.log(`  ${r.roleCode}: ${r.proposed} propuesta(s), ${r.keep} sin cambios, ${r.create} alta(s), ${r.retire} baja(s)${r.eligibleAfterActivation ? "" : " — SIN POLÍTICA: no elegible"}`);
    for (const p of data.people) console.log(`  Personas ${p.roleCode}: seguirían elegibles ${p.stayEligible}, pasarían a no elegibles ${p.becomeIneligible}, pasarían a elegibles ${p.becomeEligible}, seguirían no elegibles ${p.stayIneligible}`);
    console.log(`  Vuelos abiertos examinados: ${data.flightsExamined} · nuevas incompatibilidades: ${data.newIncompatibilities} · resueltas: ${data.resolvedIncompatibilities}`);
    process.exitCode = data.canActivate ? 0 : 1;
    return;
  }
  // activate
  const fingerprint = arg("fingerprint"), approval = arg("approval");
  if (!fingerprint || !approval) fail("activate exige --fingerprint (del informe de simulate) y --approval \"<referencia de la aprobación>\"");
  if (base !== E2E_BASE && process.env.POLICY_ACTIVATION_TARGET_CONFIRMED !== base) fail(`Destino distinto del E2E aislado: confirme explícitamente con POLICY_ACTIVATION_TARGET_CONFIRMED=${base}`);
  const { status, data } = await post("/credential-policies/activation", { proposal, approvedFingerprint: fingerprint, approvalReference: approval, acknowledgeIncompatibilities: flag("acknowledge") }, bearer);
  if (status !== 200) fail(`La activación fue rechazada (HTTP ${status}): ${data.code || ""} ${data.message || JSON.stringify(data).slice(0, 400)}`);
  console.log(data.changed ? `Lote ${data.batchId}: ${data.created} alta(s), ${data.retired} baja(s), ${data.kept} sin cambios.` : "La política propuesta ya estaba activa: sin cambios.");
})().catch((e) => { console.error(e instanceof Failure ? e.message : "Error inesperado: " + e.message); process.exitCode = 2; });
