import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, validatePhoneNumberLength } from "libphonenumber-js/max";

/**
 * Reglas de contacto en el navegador. Ayudan a escribir bien el dato y avisan antes de enviar; NO son la validación definitiva:
 * el servidor aplica sus propias reglas (libphonenumber de Google para teléfonos, reglas de dirección para correos) y decide.
 */

// ---- correos ----
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^([A-Za-z]{2,63}|[Xx][Nn]--[A-Za-z0-9-]{1,59})$/;
export const MAX_EMAIL_LENGTH = 150;

/** Mismas reglas que ContactNormalizer.emailProblem del servidor. Devuelve el motivo del rechazo o "". */
export function emailProblem(raw) {
  const value = (raw ?? "").trim();
  if (!value) return "Ingrese un correo electrónico";
  if (value.length > MAX_EMAIL_LENGTH) return `El correo electrónico admite hasta ${MAX_EMAIL_LENGTH} caracteres`;
  if (/[\s\p{Cc}]/u.test(value)) return "El correo electrónico no puede contener espacios ni caracteres de control";
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) return "El correo electrónico debe tener una sola @ con texto antes y después, por ejemplo nombre@dominio.com";
  const local = value.slice(0, at);
  let domain = value.slice(at + 1);
  if (local.length > 64) return "La parte anterior a la @ admite hasta 64 caracteres";
  if (!LOCAL_PART.test(local)) return "La parte anterior a la @ contiene caracteres no admitidos o puntos mal ubicados";
  try { domain = new URL(`http://${domain}`).hostname; } catch { return "El dominio del correo electrónico no es válido"; }
  if (domain.length > 253 || domain.endsWith(".")) return "El dominio del correo electrónico no es válido";
  const labels = domain.split(".");
  if (labels.length < 2) return "El dominio debe tener un punto, por ejemplo dominio.com";
  if (!labels.every((l) => DOMAIN_LABEL.test(l))) return "El dominio del correo electrónico no es válido";
  if (!TLD.test(labels[labels.length - 1])) return "La terminación del dominio no es válida";
  return "";
}

// ---- teléfonos ----
export const DEFAULT_COUNTRY = "AR";
const ALLOWED = /^\+?[0-9 ().-]+$/;
const EXTENSION_HINT = /ext|int\.|anexo|x|#|;|,/i;
let names;
const regionName = (code) => { try { names ??= new Intl.DisplayNames(["es"], { type: "region" }); return names.of(code) || code; } catch { return code; } };

/** Países con su prefijo, ordenados por nombre. {code, name, prefix, search}: `search` sin tildes para filtrar. */
export const COUNTRIES = getCountries()
  .map((code) => { const name = regionName(code); const prefix = `+${getCountryCallingCode(code)}`; return { code, name, prefix, search: fold(`${name} ${code} ${prefix}`) }; })
  .sort((a, b) => a.name.localeCompare(b.name, "es"));
export function fold(text) { return (text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(); }
export const countryName = (code) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
export const callingPrefix = (code) => { try { return `+${getCountryCallingCode(code)}`; } catch { return ""; } };
export const filterCountries = (query) => { const q = fold(query).trim(); return q ? COUNTRIES.filter((c) => c.search.includes(q)) : COUNTRIES; };

/** Motivo por el que el número no es válido para el país elegido, o "" si lo es. No prueba que la línea exista ni sea de su titular. */
export function phoneProblem(raw, country) {
  if (!country) return "Seleccione el país del teléfono";
  let calling;
  try { calling = getCountryCallingCode(country); } catch { return "El país seleccionado no está admitido"; }
  const text = (raw ?? "").trim();
  if (!text) return "Ingrese el número de teléfono";
  if (text.length > 30) return "El teléfono tiene demasiados caracteres";
  if (!ALLOWED.test(text) || text.indexOf("+") > 0) return EXTENSION_HINT.test(text) ? "No se admiten extensiones ni letras en el número: ingrese sólo el número telefónico" : "El teléfono sólo admite dígitos, espacios, guiones, puntos, paréntesis y un \"+\" inicial";
  const name = countryName(country);
  const parsed = parsePhoneNumberFromString(text, country);
  if (text.startsWith("+") && parsed && String(parsed.countryCallingCode) !== String(calling)) return `El prefijo +${parsed.countryCallingCode} no corresponde a ${name} (+${calling})`;
  const length = validatePhoneNumberLength(text, country);
  if (length === "TOO_SHORT") return `El número tiene muy pocos dígitos para ${name}`;
  if (length === "TOO_LONG") return `El número tiene demasiados dígitos para ${name}`;
  if (length === "INVALID_COUNTRY") return `El prefijo internacional no corresponde a ${name}`;
  if (length === "NOT_A_NUMBER") return "El teléfono no tiene un formato numérico válido";
  if (!parsed || !parsed.isValid() || (parsed.country && parsed.country !== country)) return `El número no es un teléfono válido de ${name} (+${calling})`;
  if (parsed.ext) return "No se admiten extensiones telefónicas";
  return "";
}

/** Número en formato internacional legible (el servidor guarda E.164 y este mismo formato), o "" si no es válido. */
export function formatInternational(raw, country) {
  if (!country || phoneProblem(raw, country)) return "";
  return parsePhoneNumberFromString(raw.trim(), country)?.formatInternational() ?? "";
}
export const toE164 = (raw, country) => (!country || phoneProblem(raw, country) ? "" : parsePhoneNumberFromString(raw.trim(), country)?.number ?? "");

/**
 * Mantiene el prefijo fuera del campo del número (se muestra aparte): si el usuario escribe "+54 …" se quita el prefijo del país
 * elegido; si escribe el prefijo de otro país inequívoco se cambia el país. Un prefijo compartido (+1) no cambia el país.
 */
export function normalizeTyped(raw, country) {
  const text = raw ?? "";
  if (!text.trim().startsWith("+")) return { country, number: text };
  const calling = (() => { try { return String(getCountryCallingCode(country)); } catch { return ""; } })();
  const digits = text.trim().slice(1).replace(/[^0-9]/g, "");
  if (calling && digits.startsWith(calling) && digits.length > calling.length) return { country, number: stripCalling(text, calling) };
  const detected = parsePhoneNumberFromString(text);
  if (detected?.country && detected.country !== country && detected.isValid()) return { country: detected.country, number: detected.formatNational() };
  return { country, number: text };
}
function stripCalling(text, calling) {
  let rest = text.trim().slice(1), consumed = "";
  while (rest && consumed.length < calling.length) { const c = rest[0]; rest = rest.slice(1); if (/[0-9]/.test(c)) consumed += c; }
  return rest.replace(/^[\s.-]+/, "");
}
/** Para editar un número ya guardado: el campo muestra el número nacional y el prefijo queda en el selector. */
export function toNational(stored, country) {
  const parsed = stored && country ? parsePhoneNumberFromString(stored, country) : undefined;
  return parsed && parsed.isValid() ? parsed.formatNational() : stored ?? "";
}
