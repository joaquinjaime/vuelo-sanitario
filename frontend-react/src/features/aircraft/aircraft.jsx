import React, { useEffect, useState } from "react";
import { api } from "../../services/api";

// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const text = (e, fallback = "No se pudo completar la operación") => e?.message || fallback;
export const AIRCRAFT_STATE_LABEL = { DESACTIVADA: "Desactivada", EN_VUELO: "En vuelo", ASIGNADA: "Activa · con vuelos asignados", SIN_ASIGNACIONES: "Activa · sin asignaciones" };
export const STATE_CLASS = { DESACTIVADA: "status status-cancelado", EN_VUELO: "status status-en_curso", ASIGNADA: "status status-aprobado", SIN_ASIGNACIONES: "status status-planificado" };
export const OPERATION_LABEL = { CREATE: "Alta", UPDATE: "Edición de datos", SET_ACTIVE: "Cambio de estado", MANUAL_LOCATION_CHANGE: "Cambio manual de ubicación", UPDATE_LOCATION_AFTER_FINISH: "Ubicación al finalizar un vuelo" };
const FLIGHT_STATE_LABEL = (s) => String(s || "—").replaceAll("_", " ");
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

/** Búsqueda de aeropuertos en el catálogo (el listado inicial está limitado, por eso se consulta por texto). */
export function AirportPicker({ label, value, onChange, exclude, initial = [], currentLabel }) {
  const [query, setQuery] = useState(""), [options, setOptions] = useState(Array.isArray(initial) ? initial : []), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try { const rows = await api(`/catalogs/airports?q=${encodeURIComponent(query)}`); if (active) { setOptions(Array.isArray(rows) ? rows : []); setError(""); } }
      catch (e) { if (active) setError(text(e)); }
      finally { if (active) setLoading(false); }
    }, query ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  const shown = options.filter((a) => a.id !== exclude);
  return <>
    <label>Buscar aeropuerto<input value={query} placeholder="Nombre del aeropuerto" onChange={(e) => setQuery(e.target.value)} /></label>
    <label>{label}<select required value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}>
      <option value="">{loading ? "Cargando aeropuertos…" : "Seleccionar aeropuerto"}</option>
      {value && !shown.some((a) => a.id === Number(value)) && <option value={value}>{currentLabel || "Aeropuerto seleccionado"}</option>}
      {shown.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.codigoIata ? ` (${a.codigoIata})` : ""}</option>)}
    </select></label>
    {error && <p className="error wide" role="alert">No se pudo cargar el catálogo de aeropuertos: {error}</p>}
    {!loading && !error && shown.length === 0 && <p className="hint wide">Sin aeropuertos para esa búsqueda.</p>}
  </>;
}

export const emptyForm = () => ({ matricula: "", modelo: "", tipo: "", capacidadPacientes: 1, capacidadTripulacion: 2, equipamientoMedico: "", aeropuertoActualId: "", activo: true });

export function AircraftActivity({ aircraft }) {
  const [flights, setFlights] = useState(null), [history, setHistory] = useState(null), [flightsError, setFlightsError] = useState(""), [historyError, setHistoryError] = useState("");
  useEffect(() => {
    let active = true;
    setFlights(null); setHistory(null); setFlightsError(""); setHistoryError("");
    api(`/catalogs/aircraft/${aircraft.id}/flights`).then((rows) => { if (active) setFlights(Array.isArray(rows) ? rows : []); }).catch((e) => { if (active) setFlightsError(text(e)); });
    api(`/catalogs/aircraft/${aircraft.id}/history`).then((rows) => { if (active) setHistory(Array.isArray(rows) ? rows : []); }).catch((e) => { if (active) setHistoryError(text(e)); });
    return () => { active = false; };
  }, [aircraft.id, aircraft.estadoOperativo, aircraft.aeropuertoActualId, aircraft.activo]);
  const describe = (entry) => {
    const before = parse(entry.valoresAnteriores), after = parse(entry.valoresNuevos);
    if (entry.operacion === "SET_ACTIVE") return `${after?.activo ? "Reactivada" : "Desactivada"}${after?.motivo ? ` · ${after.motivo}` : ""}`;
    if (entry.operacion === "MANUAL_LOCATION_CHANGE" || entry.operacion === "UPDATE_LOCATION_AFTER_FINISH") return `${before?.aeropuertoActual || before?.aeropuertoActualId || "Sin ubicación"} → ${after?.aeropuertoActual || after?.aeropuertoActualId || "—"}${after?.motivo ? ` · ${after.motivo}` : ""}`;
    if (entry.operacion === "UPDATE") return Object.keys(after || {}).filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after[k])).map((k) => `${k}: ${before?.[k] ?? "—"} → ${after[k] ?? "—"}`).join(" · ") || "Sin cambios visibles";
    return after?.matricula ? `Matrícula ${after.matricula}` : "";
  };
  return <>
    <h3>Vuelos</h3>
    {flightsError ? <p className="error" role="alert">No se pudieron cargar los vuelos: {flightsError}</p> : flights === null ? <p>Cargando vuelos…</p> : flights.length === 0 ? <p className="empty">La aeronave no tiene vuelos registrados.</p> :
      <div className="table-wrap"><table><thead><tr><th>Vuelo</th><th>Estado</th><th>Salida</th><th>Trayecto</th></tr></thead><tbody>{flights.map((f) => <tr key={f.id}><td>{f.codigo}</td><td>{FLIGHT_STATE_LABEL(f.estado)}</td><td>{dt(f.salida)}</td><td>{f.origen || "—"} → {f.destino || "—"}</td></tr>)}</tbody></table></div>}
    <h3>Historial administrativo</h3>
    {historyError ? <p className="error" role="alert">No se pudo cargar el historial: {historyError}</p> : history === null ? <p>Cargando historial…</p> : history.length === 0 ? <p className="empty">Sin eventos registrados.</p> :
      <ul>{history.map((h) => <li key={h.id}><strong>{OPERATION_LABEL[h.operacion] || h.operacion}</strong> · {h.usuario} · {dt(h.fecha)}<br /><small>{describe(h)}</small></li>)}</ul>}
  </>;
}

/**
 * Aeronave del vuelo y su cambio (Centro de Operaciones). El cambio sólo se ofrece antes del inicio del vuelo; las aeronaves
 * no disponibles se listan con el motivo y los vuelos que generan el conflicto.
 */
export function FlightAircraft({ flight, recursos, done = async () => {}, msg = () => {}, reload = async () => {} }) {
  const [open, setOpen] = useState(false), [candidates, setCandidates] = useState(null), [error, setError] = useState(""), [selected, setSelected] = useState(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const changeable = Boolean(recursos?.aircraftId) && ["PLANIFICADO", "PENDIENTE_CONFIRMACION_COMANDANTE"].includes(flight?.estado);
  const loadCandidates = async () => { setCandidates(null); setError(""); try { const rows = await api(`/flights/${flight.id}/aircraft-candidates`); setCandidates(Array.isArray(rows) ? rows : []); } catch (e) { setCandidates([]); setError(text(e)); } };
  useEffect(() => { setOpen(false); setCandidates(null); setSelected(""); setReason(""); setError(""); }, [flight?.id, recursos?.aircraftId]);
  const start = async () => { setOpen(true); await loadCandidates(); };
  const available = (candidates || []).filter((x) => x.disponible), unavailable = (candidates || []).filter((x) => x.disponible === false);
  const chosen = available.find((x) => String(x.id) === String(selected));
  const confirm = async () => {
    if (busy || !chosen) return;
    if (window.confirm?.(`¿Cambiar la aeronave del vuelo ${flight.codigo} a ${chosen.matricula}?`) === false) return;
    setBusy(true); setError("");
    try { await api(`/flights/${flight.id}/aircraft`, { method: "POST", body: JSON.stringify({ aircraftId: Number(selected), motivo: reason.trim() || null }) }); msg(`Aeronave del vuelo cambiada a ${chosen.matricula}`); setOpen(false); setSelected(""); setReason(""); await done(); await reload(); }
    catch (e) { await loadCandidates(); setError(text(e)); } finally { setBusy(false); }
  };
  if (!recursos?.aircraftId) return <div className="wide"><h4>Aeronave</h4><p>Sin aeronave asignada.</p></div>;
  return <div className="wide detail-actions" aria-label="Aeronave del vuelo"><h4>Aeronave</h4>
    <p><strong>{recursos.aircraftMatricula}</strong>{recursos.aircraftModelo ? ` · ${recursos.aircraftModelo}` : ""}{recursos.aircraftTipo ? ` · ${recursos.aircraftTipo}` : ""} · Ubicación actual: {recursos.aircraftUbicacion || "—"} · Tripulación máx.: {recursos.aircraftCapacidadTripulacion ?? "—"}</p>
    {!changeable && <p className="hint">La aeronave sólo puede cambiarse antes del inicio del vuelo (planificado o pendiente de confirmación).</p>}
    {changeable && !open && <button type="button" className="secondary-action" onClick={start}>Cambiar aeronave</button>}
    {changeable && open && <div>
      <p className="hint">Se validan en el servidor: aeronave activa, fuera de vuelo, sin vuelos superpuestos, con capacidad para la tripulación asignada y en el origen correspondiente. En un vuelo operativo, si cambia el aeropuerto de origen el comandante deberá confirmar nuevamente.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {candidates === null ? <p>Cargando aeronaves…</p> : <>
        {available.length === 0 ? <p className="empty">No hay aeronaves disponibles para este vuelo.</p> : <label>Aeronave disponible<select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Seleccionar</option>{available.map((x) => <option key={x.id} value={x.id}>{x.matricula} — {x.modelo} — {x.aeropuertoActual}</option>)}</select></label>}
        {unavailable.length > 0 && <details><summary>No disponibles ({unavailable.length})</summary><ul>{unavailable.map((x) => <li key={x.id}><strong>{x.matricula}</strong>: {x.motivoNoDisponible}{(x.conflictos || []).length > 0 && <small> — {x.conflictos.map((c) => `${c.codigo} (${dt(c.salida)} → ${dt(c.llegada)})`).join(", ")}</small>}</li>)}</ul></details>}
        <label>Motivo del cambio (opcional)<textarea maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="button" disabled={busy || !chosen} onClick={confirm}>{busy ? "Cambiando…" : "Confirmar cambio de aeronave"}</button>
      </>}
      <button type="button" className="secondary-action" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>Cancelar</button>
    </div>}
  </div>;
}
