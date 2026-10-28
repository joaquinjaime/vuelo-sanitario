#!/usr/bin/env node
// Verificación previa al despliegue del analizador antimalware (I-5.7, fase 4). NO prueba el backend: prueba el motor clamd que usará.
//   node scripts/verificar-antivirus-produccion.cjs --host <equipo-clamd> [--port 3310] [--max-age-days 7]
//   node scripts/verificar-antivirus-produccion.cjs --container <contenedor-clamd> [--max-age-days 7]      (ejecuta clamdscan dentro del contenedor)
// Comprueba, en este orden, que: (1) clamd responde, (2) declara una versión de firmas > 0 y una fecha reciente (una base mínima no la declara),
// (3) detecta la cadena de prueba EICAR por el mismo protocolo que usa la aplicación (zINSTREAM) y (4) un contenido inocuo da OK.
// Código de salida 0 sólo si todo se cumple; en cualquier otro caso el analizador NO está acreditado para producción.
const net = require("net"), { spawnSync } = require("child_process");

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const host = arg("host"), container = arg("container"), port = Number(arg("port", "3310")), maxAge = Number(arg("max-age-days", "7"));
if (!host && !container) { console.error("Indique --host o --container"); process.exit(2); }
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function tcp(commandBytes, chunks) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, timeout: 15000 }); const parts = [];
    socket.on("connect", () => { socket.write(commandBytes); for (const c of chunks || []) socket.write(c); });
    socket.on("data", (d) => parts.push(d)); socket.on("end", () => resolve(Buffer.concat(parts).toString("utf8").replace(/\0/g, "").trim()));
    socket.on("timeout", () => { socket.destroy(); reject(new Error("tiempo agotado")); }); socket.on("error", reject);
  });
}
const instream = (content) => {
  const data = Buffer.from(content, "latin1"), size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  return tcp(Buffer.from("zINSTREAM\0"), [size, data, Buffer.alloc(4)]);
};
const viaDocker = (args, input) => spawnSync("docker", ["exec", "-i", container, ...args], { input, encoding: "utf8" });

(async () => {
  const checks = []; const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? "OK    " : "FALLA "} ${name}${detail ? " — " + detail : ""}`); };
  let version;
  try {
    version = container ? viaDocker(["clamdscan", "--version"]).stdout.trim() : await tcp(Buffer.from("zVERSION\0"));
    check("clamd responde", !!version, version);
  } catch (e) { check("clamd responde", false, e.message); }
  if (version) {
    const parts = version.split("/");
    const dbVersion = parts.length >= 3 ? Number(parts[1]) : 0;
    check("la base de firmas declara versión", dbVersion > 0, dbVersion > 0 ? `versión ${dbVersion}` : "sin versión: base mínima o no inicializada");
    if (dbVersion > 0) {
      const m = parts[2].trim().replace(/\s+/g, " ").match(/^\w{3} (\w{3}) (\d{1,2}) [\d:]+ (\d{4})$/);
      const date = m ? new Date(Date.UTC(Number(m[3]), MONTHS[m[1]], Number(m[2]))) : null;
      const age = date ? Math.floor((Date.now() - date.getTime()) / 86400000) : null;
      check(`la base de firmas tiene como máximo ${maxAge} días`, age !== null && age <= maxAge, age === null ? "fecha ilegible" : `${age} día(s)`);
    }
  }
  try {
    let reply;
    if (container) { const r = viaDocker(["sh", "-c", "clamdscan --no-summary -"], EICAR); reply = (r.stdout || "") + (r.stderr || ""); check("detecta la cadena EICAR", /FOUND/.test(reply), reply.trim().slice(0, 120)); }
    else { reply = await instream(EICAR); check("detecta la cadena EICAR", /FOUND$/.test(reply), reply); }
    if (container) { const r = viaDocker(["sh", "-c", "clamdscan --no-summary -"], "%PDF-1.4\ncontenido inocuo\n"); check("un contenido inocuo da OK", /OK/.test((r.stdout || "") + (r.stderr || "")), ((r.stdout || "") + (r.stderr || "")).trim().slice(0, 120)); }
    else { reply = await instream("%PDF-1.4\ncontenido inocuo\n"); check("un contenido inocuo da OK", /OK$/.test(reply), reply); }
  } catch (e) { check("detecta la cadena EICAR", false, e.message); }
  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `\nRESULTADO: NO ACREDITADO PARA PRODUCCIÓN (${failed.length} comprobación(es) fallida(s))` : "\nRESULTADO: ACREDITADO (esta verificación no sustituye la prueba funcional del backend con documentos reales)");
  process.exit(failed.length ? 1 : 0);
})();
