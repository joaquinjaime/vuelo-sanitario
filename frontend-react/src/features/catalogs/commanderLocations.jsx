import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";

/**
 * Ubicación operativa actual de los comandantes (Administrador y Centro de Operaciones). Es sólo la jurisdicción donde se encuentra hoy cada comandante: una de las 23 provincias o la
 * Ciudad Autónoma de Buenos Aires (que es distinta de la provincia de Buenos Aires). No se pide una localidad ni es el domicilio habitual. La asignación de un vuelo sanitario compara esa
 * jurisdicción con la del aeropuerto de salida. El comandante la consulta pero no la modifica; cada cambio queda auditado (quién, cuándo y valor anterior).
 */
const civil = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");
const STATE_LABEL = { CONOCIDA: "Registrada", DESCONOCIDA: "Sin ubicación" };
const STATE_KIND = { CONOCIDA: "assigned", DESCONOCIDA: "pending" };
const UNKNOWN = "__desconocida__";

function LocationEditor({ commander, provinces, onSaved, onCancel, notify }) {
  const [provinceId, setProvinceId] = useState(commander.provinciaId ? String(commander.provinciaId) : ""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const save = async (event) => {
    event.preventDefault();
    if (lock.current || !provinceId) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await api(`/commanders/${commander.comandanteId}/location`, { method: "PUT", body: JSON.stringify({ provinciaId: provinceId === UNKNOWN ? null : Number(provinceId), motivo: reason.trim() || null }) });
      notify(`Ubicación de ${commander.apellido}, ${commander.nombre} actualizada`);
      await onSaved();
    } catch (e) { setError(e.message); notify(e.message, true); }
    finally { lock.current = false; setBusy(false); }
  };
  const name = `${commander.apellido}, ${commander.nombre}`;
  return <form className="resource-chooser location-editor" onSubmit={save} aria-label={`Ubicación de ${name}`} aria-busy={busy}>
    <label>Provincia / Jurisdicción<select value={provinceId} onChange={(e) => setProvinceId(e.target.value)} required disabled={busy}>
      <option value="">Seleccionar jurisdicción</option>
      {provinces.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      <option value={UNKNOWN}>Ubicación desconocida</option>
    </select></label>
    <label>Motivo del cambio (opcional)<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} disabled={busy}/></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions"><button disabled={busy || !provinceId}>{busy ? "Guardando…" : "Actualizar ubicación"}</button><button type="button" className="secondary-action" onClick={onCancel} disabled={busy}>Cancelar</button></div>
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
    <p className="hint">Es la provincia (o la Ciudad Autónoma de Buenos Aires) donde se encuentra hoy cada comandante para ser asignado a un vuelo; no se registra una localidad ni su domicilio. Un vuelo sanitario ofrece de forma ordinaria a los comandantes ubicados en la misma jurisdicción que su aeropuerto de salida; sin ubicación registrada no pueden ser elegidos. Cada cambio queda auditado.</p>
    <div className="grid-form">
      <label>Buscar<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Apellido, nombre, usuario o licencia"/></label>
      <label>Provincia / Jurisdicción<select value={provinceId} onChange={(e) => setProvinceId(e.target.value)}><option value="">Todas</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
      <label>Estado de la ubicación<select value={state} onChange={(e) => setState(e.target.value)}><option value="">Todos</option><option value="CONOCIDA">Registrada</option><option value="DESCONOCIDA">Sin ubicación</option></select></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p className="hint" role="status">Cargando comandantes…</p>}
    {!loading && !error && rows.length === 0 && <p className="hint" role="status">No hay comandantes activos que coincidan con la búsqueda.</p>}
    {rows.length > 0 && <div className="table-wrap"><table>
      <thead><tr><th>Comandante</th><th>Licencia</th><th>Provincia / Jurisdicción</th><th>Estado</th><th>Última actualización</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>{rows.map((c) => <tr key={c.comandanteId}>
        <td><strong>{c.apellido}, {c.nombre}</strong><br/><small>{c.username || "sin usuario"}</small></td>
        <td>{c.licencia}</td>
        <td>{c.provincia || "No registrada"}</td>
        <td><span className={`resource-status resource-status-${STATE_KIND[c.estadoUbicacion]}`}>{STATE_LABEL[c.estadoUbicacion] || c.estadoUbicacion}</span></td>
        <td>{c.actualizadaEn ? <>{civil(c.actualizadaEn)}<br/><small>por {c.actualizadaPor || "—"}</small></> : "—"}</td>
        <td><button type="button" className="secondary-action" aria-label={`${c.provinciaId ? "Cambiar" : "Registrar"} ubicación de ${c.apellido}, ${c.nombre}`} onClick={() => setEditing(editing === c.comandanteId ? null : c.comandanteId)}>{c.provinciaId ? "Cambiar" : "Registrar"}</button></td>
      </tr>)}</tbody>
    </table></div>}
    {truncated && <p className="hint">Se muestran los primeros resultados; afine la búsqueda para ver al resto.</p>}
    {editing != null && rows.filter((c) => c.comandanteId === editing).map((c) => <LocationEditor key={c.comandanteId} commander={c} provinces={provinces} onSaved={saved} onCancel={() => setEditing(null)} notify={notify}/>)}
  </section>;
}
