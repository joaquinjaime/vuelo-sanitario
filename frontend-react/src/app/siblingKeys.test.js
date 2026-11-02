import { expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regresión de la pantalla de tripulación que no se actualizaba: FlightCrew y WeatherHistory eran hermanos con la misma clave (`key={id}`). React avisa
 * "Encountered two children with the same key" y, al actualizar, puede duplicar u omitir hijos: el comandante veía un panel «Cargando tripulación…»
 * congelado junto al panel vigente. Dos componentes hermanos de un mismo bloque JSX no pueden compartir la expresión de clave.
 * Se revisan todos los módulos de la aplicación (no las pruebas).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = [];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) walk(full);
  else if (/\.jsx$/.test(entry.name) && !/\.test\./.test(entry.name)) sources.push(full);
});
walk(root);

test("ningún componente de un mismo bloque JSX comparte la expresión de clave con otro", () => {
  expect(sources.length).toBeGreaterThan(40);
  const repeated = [];
  for (const file of sources) {
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      const keys = [...line.matchAll(/<([A-Z][A-Za-z0-9]*)\s+key=(\{[^}]*\}|\{`[^`]*`\})/g)].map((m) => m[2]);
      const seen = new Set();
      for (const key of keys) { if (seen.has(key)) repeated.push(`${path.relative(root, file)}:${index + 1} ${key}`); seen.add(key); }
    });
  }
  expect(repeated).toEqual([]);
});
