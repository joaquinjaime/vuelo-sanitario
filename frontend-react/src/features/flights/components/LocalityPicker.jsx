import React, { useEffect, useState } from "react";
import { api } from "../../../services/api";
import { locationLabel } from "../../../utils/format";

export function LocalityPicker({ title, provinces, provinceId, setProvinceId, selected, setSelected }) {
  const [query, setQuery] = useState(""), [options, setOptions] = useState([]), [loading, setLoading] = useState(false), [open, setOpen] = useState(false);
  const resetAutocomplete = () => { setSelected(null); setQuery(""); setOptions([]); setLoading(false); setOpen(false); };
  useEffect(() => { setSelected(null); setQuery(""); setOptions([]); }, [provinceId]);
  useEffect(() => {
    if (!provinceId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const results = await api(`/catalogs/localities?provinceId=${provinceId}&q=${encodeURIComponent(query)}`);
        if (!cancelled) setOptions(results);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [provinceId, query]);
  return <fieldset className="wide locality-picker"><legend>{title}</legend><label>Provincia<select aria-label={`Provincia ${title.toLowerCase()}`} required value={provinceId} onChange={e => setProvinceId(e.target.value)}><option value="">Seleccionar provincia</option>{provinces.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><label className="locality-search">Localidad<input aria-label={`Buscar localidad ${title.toLowerCase()}`} disabled={!provinceId} value={query} placeholder="Buscar localidad..." onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setSelected(null); setOpen(true); }} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }} />{selected && <small className="success">Seleccionada: {locationLabel(selected)} <button type="button" className="link-button" onClick={resetAutocomplete}>Limpiar</button></small>}{provinceId && open && <div className="autocomplete" role="listbox">{loading ? <small>Cargando...</small> : options.length ? options.map(x => <button type="button" role="option" key={x.id} onClick={() => { setSelected(x); setQuery(x.nombre); setOpen(false); }}>{locationLabel(x)}</button>) : <small>Sin resultados.</small>}</div>}</label>{!selected && <small className="hint">Busque y seleccione una localidad de la lista.</small>}</fieldset>;
}
