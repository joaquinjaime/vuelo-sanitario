import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regresión de la pantalla de tripulación que no se actualizaba: FlightCrew y WeatherHistory eran hermanos con la misma clave (`key={id}`). React avisa
 * "Encountered two children with the same key" y, al actualizar, puede duplicar u omitir hijos: el comandante veía un panel «Cargando tripulación…»
 * congelado junto al panel vigente. Dos componentes hermanos de un mismo bloque JSX no pueden compartir la expresión de clave.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const sources = ["main.jsx", "aircraft.jsx", "closure.jsx", "documents.jsx", "flightRoute.jsx", "users.jsx", "patients.jsx", "geography.jsx", "audit.jsx", "credentials.jsx", "account.jsx"];

test("ningún componente de un mismo bloque JSX comparte la expresión de clave con otro", () => {
  const repeated = [];
  for (const file of sources) {
    readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).forEach((line, index) => {
      const keys = [...line.matchAll(/<([A-Z][A-Za-z0-9]*)\s+key=(\{[^}]*\}|\{`[^`]*`\})/g)].map((m) => m[2]);
      const seen = new Set();
      for (const key of keys) { if (seen.has(key)) repeated.push(`${file}:${index + 1} ${key}`); seen.add(key); }
    });
  }
  expect(repeated).toEqual([]);
});
