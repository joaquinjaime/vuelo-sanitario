import React, { useMemo, useState } from "react";
import { callingPrefix, countryName, filterCountries, formatInternational, normalizeTyped, phoneProblem, toE164 } from "./contactRules";

/**
 * Teléfono con país: el usuario elige el país (se puede buscar por nombre, código o prefijo), el prefijo internacional se muestra aparte,
 * escribe el número nacional y ve en vivo si es válido para ese país y cómo quedará guardado. La validación del navegador es una ayuda:
 * el servidor valida de nuevo con las mismas reglas y es quien decide.
 *
 * @param value   { pais, numero }  ("" = país sin elegir; no se infiere de la ubicación ni se supone Argentina en datos anteriores)
 * @param label   nombre accesible del campo del número (p. ej. "Nuevo teléfono")
 * @param touched muestra los errores aunque todavía no se haya escrito (p. ej. tras intentar enviar)
 */
export function PhoneField({ value, onChange, label = "Teléfono", idPrefix = "tel", touched = false, disabled = false }) {
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState(false);
  const options = useMemo(() => {
    const found = filterCountries(query);
    return found.some((c) => c.code === value.pais) || !value.pais ? found : [{ code: value.pais, name: countryName(value.pais), prefix: callingPrefix(value.pais) }, ...found];
  }, [query, value.pais]);
  const problem = value.pais && value.numero.trim() ? phoneProblem(value.numero, value.pais) : "";
  const final = !problem && value.pais && value.numero.trim() ? formatInternational(value.numero, value.pais) : "";
  const showHint = typed || touched;
  const change = (patch) => onChange({ ...value, ...patch });
  const typeNumber = (raw) => { setTyped(true); const next = normalizeTyped(raw, value.pais); onChange({ ...value, pais: next.country, numero: next.number }); };

  return <div className="phone-field">
    <label className="phone-country-search">Buscar país
      <input type="search" aria-label="Buscar país" value={query} placeholder="Nombre, código o prefijo" disabled={disabled} onChange={(e) => setQuery(e.target.value)} /></label>
    <label className="phone-country">País
      <select aria-label="País del teléfono" value={value.pais} disabled={disabled} onChange={(e) => change({ pais: e.target.value })}>
        <option value="">Seleccione el país</option>
        {options.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.prefix})</option>)}
      </select></label>
    <span className="phone-prefix" aria-label="Prefijo internacional">{value.pais ? callingPrefix(value.pais) : "+"}</span>
    <input id={`${idPrefix}-numero`} type="tel" inputMode="tel" autoComplete="tel-national" required aria-label={label} disabled={disabled} value={value.numero} maxLength={30}
      placeholder={value.pais ? "Número sin el prefijo" : "Elija primero el país"} onChange={(e) => typeNumber(e.target.value)} />
    {showHint && !value.pais && <small className="error phone-error">Seleccione el país del teléfono</small>}
    {showHint && problem && <small className="error phone-error">{problem}</small>}
    {final && <small className="hint phone-final">Se guardará como {final} ({toE164(value.numero, value.pais)}). El formato es válido para {countryName(value.pais)}; el número no se verifica por SMS.</small>}
  </div>;
}
