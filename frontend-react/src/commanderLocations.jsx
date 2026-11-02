import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Ubicación operativa actual de los comandantes (Administrador y Centro de Operaciones). Es el dato que usa la asignación de vuelos sanitarios: un comandante sólo es
 * elegible de forma ordinaria si está registrado en la localidad de salida. No es el domicilio habitual. El comandante la consulta pero no la modifica; cada cambio
 * queda auditado (quién, cuándo y valor anterior).
 */
const civil = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");
const STATE_LABEL = { CONOCIDA: "Registrada", SOLO_PROVINCIA: "Falta la localidad", DESCONOCIDA: "Sin ubicación", LOCALIDAD_DESHABILITADA: "Localidad deshabilitada" };
const STATE_KIND = { CONOCIDA: "assigned", SOLO_PROVINCIA: "reserved", DESCONOCIDA: "pending", LOCALIDAD_DESHABILITADA: "pending" };

function LocationEditor({ commander, provinces, onSaved, onCancel, notify }) {
  const [provinceId, setProvinceId] = useState(commander.provinciaId ? String(commander.provinciaId) : ""), [query, setQuery] = useState(""), [options, setOptions] = useState([]),
    [localityId, setLocalityId] = useState(commander.localidadId ? String(commander.localidadId) : ""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [searching, setSearching] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!provinceId) { setOptions([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try { const rows = await api(`/catalogs/localities?provinceId=${provinceId}&q=${encodeURIComponent(query)}`); if (!cancelled) setOptions(Array.isArray(rows) ? rows : []); }
      catch { if (!cancelled) setOptions([]); }
      finally { if (!cancelled) setSearching(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [provinceId, query]);
  // La localidad elegida debe seguir en la lista (cambiar de provincia o buscar otra cosa la descarta).
  const known = options.find((x) => String(x.id) === localityId) || (String(commander.localidadId) === localityId && String(commander.provinciaId) === provinceId ? { id: commander.localidadId, nombre: commander.localidad } : null);
  const save = async (event) => {
    event.preventDefault();
    if (lock.current || !provinceId || !localityId) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await api(`/commanders/${commander.comandanteId}/location`, { method: "PUT", body: JSON.stringify({ provinciaId: Number(provinceId), localidadId: Number(localityId), motivo: reason.trim() || null }) });
      notify(`Ubicación de ${commander.apellido}, ${commander.nombre} actualizada`);
      await onSaved();
    } catch (e) { setError(e.message); notify(e.message, true); }
    finally { lock.current = false; setBusy(false); }
  };
  const name = `${commander.apellido}, ${commander.nombre}`;
  return <form className="resource-chooser location-editor" onSubmit={save} aria-label={`Ubicación de ${name}`} aria-busy={busy}>
    <label>Provincia<select value={provinceId} onChange={(e) => { setProvinceId(e.target.value); setLocalityId(""); setQuery(""); }} required disabled={busy}><option value="">Seleccionar provincia</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
    <label>Buscar localidad<input value={query} onChange={(e) => setQuery(e.target.value)} disabled={!provinceId || busy} placeholder="Nombre de la localidad"/></label>
    <label>Localidad<select value={known ? localityId : ""} onChange={(e) => setLocalityId(e.target.value)} required disabled={!provinceId || busy}><option value="">{searching ? "Buscando…" : "Seleccionar localidad"}</option>{known && !options.some((x) => x.id === known.id) && <option value={known.id}>{known.nombre}</option>}{options.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
    <label>Motivo del cambio (opcional)<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} disabled={busy}/></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions"><button disabled={busy || !localityId}>{busy ? "Guardando…" : "Guardar ubicación"}</button><button type="button" className="secondary-action" onClick={onCancel} disabled={busy}>Cancelar</button></div>
  </form>;
}

export function CommanderLocations({ notify }) {
  const [provinces, setProvinces] = useState([]), [rows, setRows] = useState([]), [truncated, setTruncated] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""),
    [q, setQ] = useState(""), [provinceId, setProvinceId] = useState(""), [state, setState] = useState(""), [editing, setEditing] = useState(null), [revision, setRevision] = useState(0);
  const requests = useRef(0);
  useEffect(() => { api("/catalogs/provinces").then((x) => setProvinces(Array.isArray(x) ? x : [])).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    const mine = ++requests.current;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams(); if (q.trim()) params.set("q", q.trim()); if (provinceId) params.set("provinceId", provinceId); if (state) params.set("estado", state);
        const result = await api(`/commanders/locations?${params}`);
        if (mine === requests.current) { setRows(result?.comandantes || []); setTruncated(Boolean(result?.truncado)); }
      } catch (e) { if (mine === requests.current) { setRows([]); setError(e.message); } }
      finally { if (mine === requests.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, provinceId, state, revision]);
  const saved = async () => { setEditing(null); setRevision((x) => x + 1); };
  return <section className="card wide commander-locations">
    <h2>Ubicación operativa de los comandantes</h2>
    <p className="hint">Es dónde se encuentra hoy cada comandante para ser asignado a un vuelo (no su domicilio). Un vuelo sanitario sólo ofrece de forma ordinaria a los comandantes registrados en su localidad de salida; sin ubicación registrada no pueden ser elegidos. Cada cambio queda auditado.</p>
    <div className="grid-form">
      <label>Buscar<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Apellido, nombre, usuario o licencia"/></label>
      <label>Provincia<select value={provinceId} onChange={(e) => setProvinceId(e.target.value)}><option value="">Todas</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
      <label>Estado de la ubicación<select value={state} onChange={(e) => setState(e.target.value)}><option value="">Todos</option><option value="CONOCIDA">Registrada</option><option value="SOLO_PROVINCIA">Falta la localidad</option><option value="DESCONOCIDA">Sin ubicación</option></select></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p className="hint" role="status">Cargando comandantes…</p>}
    {!loading && !error && rows.length === 0 && <p className="hint" role="status">No hay comandantes activos que coincidan con la búsqueda.</p>}
    {rows.length > 0 && <div className="table-wrap"><table>
      <thead><tr><th>Comandante</th><th>Licencia</th><th>Ubicación operativa</th><th>Estado</th><th>Última actualización</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>{rows.map((c) => <tr key={c.comandanteId}>
        <td><strong>{c.apellido}, {c.nombre}</strong><br/><small>{c.username || "sin usuario"}</small></td>
        <td>{c.licencia}</td>
        <td>{c.localidad ? `${c.localidad}, ${c.provincia}` : c.provincia ? `${c.provincia} (sin localidad)` : "No registrada"}</td>
        <td><span className={`resource-status resource-status-${STATE_KIND[c.estadoUbicacion]}`}>{STATE_LABEL[c.estadoUbicacion] || c.estadoUbicacion}</span></td>
        <td>{c.actualizadaEn ? <>{civil(c.actualizadaEn)}<br/><small>por {c.actualizadaPor || "—"}</small></> : "—"}</td>
        <td><button type="button" className="secondary-action" aria-label={`${c.localidadId ? "Cambiar" : "Registrar"} ubicación de ${c.apellido}, ${c.nombre}`} onClick={() => setEditing(editing === c.comandanteId ? null : c.comandanteId)}>{c.localidadId ? "Cambiar" : "Registrar"}</button></td>
      </tr>)}</tbody>
    </table></div>}
    {truncated && <p className="hint">Se muestran los primeros resultados; afine la búsqueda para ver al resto.</p>}
    {editing != null && rows.filter((c) => c.comandanteId === editing).map((c) => <LocationEditor key={c.comandanteId} commander={c} provinces={provinces} onSaved={saved} onCancel={() => setEditing(null)} notify={notify}/>)}
  </section>;
}
