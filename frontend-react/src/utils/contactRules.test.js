import { expect, test } from "vitest";
import { COUNTRIES, callingPrefix, countryName, emailProblem, filterCountries, formatInternational, normalizeTyped, phoneProblem, toE164, toNational } from "./contactRules";

test("los correos legítimos se aceptan, incluidas las etiquetas +, los puntos y los dominios internacionales", () => {
  for (const ok of ["ana.paz+vuelos@sub.example.test", "a@b.co", "o'brien@example.ie", "user_name-1@mail-server.example.org", "info@bücher.example", "UPPER@Example.COM", "usuario-inventado@dominio-real.com", "a!#$%&*+/=?^_{|}~-b@example.test"])
    expect(emailProblem(ok), ok).toBe("");
});

test("los correos mal formados, con espacios, controles o intentos de inyección se rechazan con un motivo claro", () => {
  const bad = ["", "  ", "ana", "ana@", "@example.test", "ana@example", "ana@example.", "ana@.example.test", "ana@example..test", "ana@-example.test", "a na@example.test", "ana@@example.test", "ana@example.t",
    ".ana@example.test", "ana.@example.test", "an..a@example.test", "ana@example.123", "\"ana\"@example.test", "ana<script>@example.test", "ana,luis@example.test", "ana;luis@example.test",
    "ana\n@example.test", "ana@example.test\r\nBcc: x@y.test", "ana(comentario)@example.test", "ñandú@example.test", `${"a".repeat(65)}@example.test`, `${"a".repeat(150)}@example.test`];
  for (const value of bad) expect(emailProblem(value), JSON.stringify(value)).not.toBe("");
  expect(emailProblem("a b@example.test")).toMatch(/espacios/);
  expect(emailProblem("")).toBe("Ingrese un correo electrónico");
});

test("el selector cubre los países de la biblioteca con su prefijo y se busca por nombre sin tildes, código o prefijo", () => {
  expect(COUNTRIES.length).toBeGreaterThan(200);
  for (const [code, name, prefix] of [["AR", "Argentina", "+54"], ["CL", "Chile", "+56"], ["BR", "Brasil", "+55"], ["US", "Estados Unidos", "+1"], ["CA", "Canadá", "+1"], ["ES", "España", "+34"]]) {
    expect(countryName(code)).toBe(name); expect(callingPrefix(code)).toBe(prefix);
  }
  expect(filterCountries("peru").map((c) => c.code)).toContain("PE");
  expect(filterCountries("PERÚ").map((c) => c.code)).toContain("PE");
  expect(filterCountries("+56").map((c) => c.code)).toContain("CL");
  expect(filterCountries("es").length).toBeGreaterThan(1);
  expect(filterCountries("zzzz-no-existe")).toEqual([]);
  expect(filterCountries("").length).toBe(COUNTRIES.length);
  // los prefijos compartidos conviven como países distintos
  expect(filterCountries("+1").map((c) => c.code)).toEqual(expect.arrayContaining(["US", "CA"]));
});

test("Argentina: formatos nacionales con 0 y 15, internacional y equivalencias a un único E.164", () => {
  expect(phoneProblem("0381 555-1234", "AR")).toBe("");
  expect(toE164("0381 15 555-1234", "AR")).toBe("+5493815551234");
  expect(toE164("+54 9 381 555 1234", "AR")).toBe("+5493815551234");
  expect(toE164("011 15 5555-1234", "AR")).toBe("+5491155551234");
  expect(toE164("(0381) 555.1234", "AR")).toBe(toE164("+54 381 5551234", "AR"));
  expect(formatInternational("0381 15 555-1234", "AR")).toBe("+54 9 381 555 1234");
});

test("otros países siguen su propio plan de numeración", () => {
  expect(toE164("9 8765 4321", "CL")).toBe("+56987654321");
  expect(toE164("(11) 98765-4321", "BR")).toBe("+5511987654321");
  expect(toE164("612 34 56 78", "ES")).toBe("+34612345678");
  expect(toE164("(202) 555-0123", "US")).toBe("+12025550123");
  expect(toE164("416 555 0123", "CA")).toBe("+14165550123");
  expect(toE164("020 7946 0958", "GB")).toBe("+442079460958");
});

test("se rechazan: país faltante o no admitido, pocos o demasiados dígitos, caracteres, extensiones, prefijo ajeno y número de otro país", () => {
  expect(phoneProblem("0381 555-1234", "")).toMatch(/Seleccione el país/);
  expect(phoneProblem("0381 555-1234", "ZZ")).toMatch(/no está admitido/);
  expect(phoneProblem("", "AR")).toMatch(/Ingrese el número/);
  expect(phoneProblem("381 555", "AR")).toMatch(/muy pocos dígitos|incompleto/);
  expect(phoneProblem("381 555 1234 5678 9012", "AR")).toMatch(/demasiados/);
  expect(phoneProblem("381-555-12$4", "AR")).toMatch(/sólo admite/);
  expect(phoneProblem("54+3815551234", "AR")).toMatch(/sólo admite/);
  expect(phoneProblem("0381 555-1234 ext. 12", "AR")).toMatch(/extensiones/);
  expect(phoneProblem("0381 555-1234 x12", "AR")).toMatch(/extensiones/);
  expect(phoneProblem("+56 9 8765 4321", "AR")).toMatch(/no corresponde a Argentina/);
  expect(phoneProblem("+54 54 381 555 1234", "AR")).not.toBe("");   // prefijo duplicado
  expect(phoneProblem("0000 000 0000", "AR")).not.toBe("");
  expect(phoneProblem("+1 416 555 0123", "US")).toMatch(/no es un teléfono válido de Estados Unidos/);
  expect(phoneProblem("202 555 0123", "CA")).toMatch(/no es un teléfono válido de Canadá/);
  expect(phoneProblem("381 555 1234", "CL")).not.toBe("");
});

test("el prefijo escrito no se duplica: se quita el del país elegido y se cambia de país sólo ante un prefijo inequívoco", () => {
  expect(normalizeTyped("+54 381 555-1234", "AR")).toEqual({ country: "AR", number: "381 555-1234" });
  expect(normalizeTyped("+54(381)555-1234", "AR").number).toBe("(381)555-1234");
  expect(normalizeTyped("381 555-1234", "AR")).toEqual({ country: "AR", number: "381 555-1234" });
  expect(normalizeTyped("+56 9 8765 4321", "AR")).toEqual({ country: "CL", number: "9 8765 4321" });
  expect(normalizeTyped("+1 416 555 0123", "CA")).toEqual({ country: "CA", number: "416 555 0123" });   // +1 es compartido: se conserva el país
  expect(normalizeTyped("+1 416 555 0123", "US").country).toBe("US");
  expect(normalizeTyped("+", "AR")).toEqual({ country: "AR", number: "+" });
});

test("al editar, un número guardado se muestra en formato nacional y uno sin validar se deja como está", () => {
  expect(toNational("+54 381 555-1234", "AR")).toBe("0381 555-1234");
  expect(toNational("3815559999", "AR")).toBe("0381 555-9999");
  expect(toNational("123", "AR")).toBe("123");
  expect(toNational("3815559999", "")).toBe("3815559999");
});
