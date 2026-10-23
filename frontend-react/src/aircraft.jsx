import React, { useEffect, useState } from "react";
import { api } from "./api";

// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const text = (e, fallback = "No se pudo completar la operación") => e?.message || fallback;
export const AIRCRAFT_STATE_LABEL = { DESACTIVADA: "Desactivada", EN_VUELO: "En vuelo", ASIGNADA: "Activa · con vuelos asignados", SIN_ASIGNACIONES: "Activa · sin asignaciones" };
const STATE_CLASS = { DESACTIVADA: "status status-cancelado", EN_VUELO: "status status-en_curso", ASIGNADA: "status status-aprobado", SIN_ASIGNACIONES: "status status-planificado" };
const OPERATION_LABEL = { CREATE: "Alta", UPDATE: "Edición de datos", SET_ACTIVE: "Cambio de estado", MANUAL_LOCATION_CHANGE: "Cambio manual de ubicación", UPDATE_LOCATION_AFTER_FINISH: "Ubicación al finalizar un vuelo" };
const FLIGHT_STATE_LABEL = (s) => String(s || "—").replaceAll("_", " ");
const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

/** Búsqueda de aeropuertos en el catálogo (el listado inicial está limitado, por eso se consulta por texto). */
function AirportPicker({ label, value, onChange, exclude, initial = [], currentLabel }) {
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

function Modal({ title, onClose, children, label }) {
  return <div className="activation-modal-backdrop" role="presentation"><div className="activation-modal" role="dialog" aria-modal="true" aria-labelledby={label}>
    <div><p className="eyebrow">ADMINISTRACIÓN</p><h2 id={label}>{title}</h2></div>{children}
  </div></div>;
}

const emptyForm = () => ({ matricula: "", modelo: "", tipo: "", capacidadPacientes: 1, capacidadTripulacion: 2, equipamientoMedico: "", aeropuertoActualId: "", activo: true });

function AircraftDetail({ aircraft, onClose }) {
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
  return <Modal title={`Aeronave ${aircraft.matricula}`} onClose={onClose} label="aircraft-detail-title">
    <p>{aircraft.modelo} · {aircraft.tipo} · Pacientes: {aircraft.capacidadPacientes} · Tripulación: {aircraft.capacidadTripulacion}</p>
    <p>Ubicación actual: <strong>{aircraft.aeropuertoActual || "Sin ubicación"}</strong> · <span className={STATE_CLASS[aircraft.estadoOperativo]}>{AIRCRAFT_STATE_LABEL[aircraft.estadoOperativo] || aircraft.estadoOperativo}</span></p>
    {aircraft.equipamientoMedico && <p>Equipamiento médico: {aircraft.equipamientoMedico}</p>}
    <p className="hint">Alta: {dt(aircraft.fechaCreacion)}</p>
    <h3>Vuelos</h3>
    {flightsError ? <p className="error" role="alert">No se pudieron cargar los vuelos: {flightsError}</p> : flights === null ? <p>Cargando vuelos…</p> : flights.length === 0 ? <p className="empty">La aeronave no tiene vuelos registrados.</p> :
      <table><thead><tr><th>Vuelo</th><th>Estado</th><th>Salida</th><th>Trayecto</th></tr></thead><tbody>{flights.map((f) => <tr key={f.id}><td>{f.codigo}</td><td>{FLIGHT_STATE_LABEL(f.estado)}</td><td>{dt(f.salida)}</td><td>{f.origen || "—"} → {f.destino || "—"}</td></tr>)}</tbody></table>}
    <h3>Historial administrativo</h3>
    {historyError ? <p className="error" role="alert">No se pudo cargar el historial: {historyError}</p> : history === null ? <p>Cargando historial…</p> : history.length === 0 ? <p className="empty">Sin eventos registrados.</p> :
      <ul>{history.map((h) => <li key={h.id}><strong>{OPERATION_LABEL[h.operacion] || h.operacion}</strong> · {h.usuario} · {dt(h.fecha)}<br /><small>{describe(h)}</small></li>)}</ul>}
    <div className="form-actions"><button type="button" className="secondary-action" onClick={onClose}>Cerrar</button></div>
  </Modal>;
}

/**
 * Administración de aeronaves (ADMINISTRADOR): alta, edición de datos, baja lógica / reactivación, ubicación e historial.
 * Ninguna operación se presenta como exitosa hasta que el servidor la confirma; los conflictos (409) se muestran tal como los informa.
 */
export function AdminAircraft({ items, airports, reload, notify, createOpen, onCreateOpenChange, showList = true }) {
  const [form, setForm] = useState(emptyForm), [editing, setEditing] = useState(null), [localOpen, setLocalOpen] = useState(false), [formError, setFormError] = useState(""), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("active"), [query, setQuery] = useState(""), [moving, setMoving] = useState(null), [target, setTarget] = useState(""), [moveReason, setMoveReason] = useState(""), [moveError, setMoveError] = useState(""), [detail, setDetail] = useState(null);
  const open = createOpen === undefined ? localOpen : createOpen;
  const setOpen = (value) => { if (createOpen === undefined) setLocalOpen(value); else onCreateOpenChange?.(value); };
  useEffect(() => { if (createOpen) { setForm(emptyForm()); setEditing(null); setFormError(""); } }, [createOpen]);
  const list = Array.isArray(items) ? items : [];
  const actives = list.filter((x) => x.activo), inactives = list.filter((x) => !x.activo);
  const visible = (tab === "active" ? actives : inactives).filter((x) => !query || `${x.matricula} ${x.modelo} ${x.tipo} ${x.aeropuertoActual || ""}`.toLowerCase().includes(query.toLowerCase()));
  const closeForm = () => { setOpen(false); setEditing(null); setForm(emptyForm()); setFormError(""); };
  const openCreate = () => { setForm(emptyForm()); setEditing(null); setFormError(""); setOpen(true); };
  const openEdit = (x) => { setForm({ matricula: x.matricula, modelo: x.modelo, tipo: x.tipo, capacidadPacientes: x.capacidadPacientes, capacidadTripulacion: x.capacidadTripulacion, equipamientoMedico: x.equipamientoMedico || "", aeropuertoActualId: x.aeropuertoActualId || "", activo: x.activo }); setEditing(x); setFormError(""); setOpen(true); };
  const save = async (e) => {
    e.preventDefault(); if (busy) return;
    if (Number(form.capacidadPacientes) < 1 || Number(form.capacidadTripulacion) < 1) { setFormError("Las capacidades deben ser de al menos 1."); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(form.matricula.trim())) { setFormError("La matrícula sólo admite letras, números y guiones."); return; }
    setBusy(true); setFormError("");
    try {
      const common = { matricula: form.matricula.trim(), modelo: form.modelo.trim(), tipo: form.tipo.trim(), capacidadPacientes: Number(form.capacidadPacientes), capacidadTripulacion: Number(form.capacidadTripulacion), equipamientoMedico: form.equipamientoMedico };
      if (editing) await api(`/catalogs/aircraft/${editing.id}`, { method: "PUT", body: JSON.stringify(common) });
      else await api("/catalogs/aircraft", { method: "POST", body: JSON.stringify({ ...common, aeropuertoActualId: Number(form.aeropuertoActualId), activo: form.activo }) });
      const wasEditing = Boolean(editing); closeForm(); await reload(); notify(wasEditing ? "Aeronave actualizada" : "Aeronave registrada");
    } catch (x) { setFormError(text(x)); } finally { setBusy(false); }
  };
  const toggleActive = async (x) => {
    if (busy) return;
    const question = x.activo ? `¿Desactivar la aeronave ${x.matricula}? Conserva su historial pero dejará de poder asignarse.` : `¿Reactivar la aeronave ${x.matricula}?`;
    if (window.confirm?.(question) === false) return;
    setBusy(true);
    try { await api(`/catalogs/aircraft/${x.id}/active`, { method: "POST", body: JSON.stringify({ activo: !x.activo }) }); await reload(); notify(x.activo ? `Aeronave ${x.matricula} desactivada` : `Aeronave ${x.matricula} reactivada`); }
    catch (e) { notify(text(e), true); } finally { setBusy(false); }
  };
  const openMove = (x) => { setMoving(x); setTarget(""); setMoveReason(""); setMoveError(""); };
  const move = async (e) => {
    e.preventDefault(); if (busy || !target) return;
    setBusy(true); setMoveError("");
    try { await api(`/catalogs/aircraft/${moving.id}/location`, { method: "POST", body: JSON.stringify({ locationId: Number(target), motivo: moveReason.trim() || null }) }); const plate = moving.matricula; setMoving(null); await reload(); notify(`Ubicación de ${plate} actualizada`); }
    catch (x) { setMoveError(text(x)); } finally { setBusy(false); }
  };
  const detailed = detail ? list.find((x) => x.id === detail.id) || detail : null;
  return <>
    {open && <Modal title={editing ? `Editar aeronave ${editing.matricula}` : "Añadir aeronave"} onClose={closeForm} label="aircraft-form-title"><form className="grid-form" onSubmit={save}>
      <label>Matrícula<input required maxLength="20" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} /></label>
      <label>Modelo<input required maxLength="100" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></label>
      <label>Tipo<input required maxLength="50" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></label>
      <label>Capacidad de pacientes<input required min="1" max="200" type="number" value={form.capacidadPacientes} onChange={(e) => setForm({ ...form, capacidadPacientes: e.target.value })} /></label>
      <label>Capacidad de tripulación<input required min="1" max="200" type="number" value={form.capacidadTripulacion} onChange={(e) => setForm({ ...form, capacidadTripulacion: e.target.value })} /></label>
      {!editing && <AirportPicker label="Ubicación inicial" value={form.aeropuertoActualId} initial={airports} onChange={(id) => setForm({ ...form, aeropuertoActualId: id })} />}
      {editing && <p className="hint wide">Ubicación actual: {editing.aeropuertoActual || "Sin ubicación"}. La ubicación y el estado activo se modifican con sus propias acciones.</p>}
      <label className="wide">Equipamiento médico<textarea value={form.equipamientoMedico} onChange={(e) => setForm({ ...form, equipamientoMedico: e.target.value })} /></label>
      {!editing && <label className="check"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activa desde el alta</label>}
      {formError && <p className="error wide" role="alert">{formError}</p>}
      <div className="wide form-actions"><button disabled={busy || (!editing && !form.aeropuertoActualId)}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Registrar aeronave"}</button><button type="button" className="secondary-action" disabled={busy} onClick={closeForm}>Cancelar</button></div>
    </form></Modal>}
    {moving && <Modal title={`Ubicación de ${moving.matricula}`} onClose={() => setMoving(null)} label="aircraft-move-title"><form className="grid-form" onSubmit={move}>
      <p className="wide">Ubicación actual: <strong>{moving.aeropuertoActual || "Sin ubicación"}</strong>. Es un cambio administrativo: se audita y no se permite con la aeronave en vuelo ni si contradice vuelos ya asignados.</p>
      <AirportPicker label="Nueva ubicación" value={target} exclude={moving.aeropuertoActualId} initial={airports} onChange={setTarget} />
      <label className="wide">Motivo (opcional)<textarea maxLength="500" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} /></label>
      {moveError && <p className="error wide" role="alert">{moveError}</p>}
      <div className="wide form-actions"><button disabled={busy || !target}>{busy ? "Guardando…" : "Confirmar cambio de ubicación"}</button><button type="button" className="secondary-action" disabled={busy} onClick={() => setMoving(null)}>Cancelar</button></div>
    </form></Modal>}
    {detailed && <AircraftDetail aircraft={detailed} onClose={() => setDetail(null)} />}
    {showList && <section className="card">
      <div className="section-title"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Aeronaves</h1><p>Estado administrativo, ubicación y vuelos asignados. «Activa» no implica disponible: la disponibilidad depende del horario del vuelo.</p></div><button onClick={openCreate}>Nueva aeronave</button></div>
      <div className="user-tabs"><button className={tab === "active" ? "selected-tab" : "secondary-action"} onClick={() => setTab("active")}>Aeronaves activas ({actives.length})</button><button className={tab === "inactive" ? "selected-tab" : "secondary-action"} onClick={() => setTab("inactive")}>Aeronaves desactivadas ({inactives.length})</button></div>
      <div className="filters"><input aria-label="Buscar aeronave" placeholder="Buscar por matrícula, modelo, tipo o ubicación" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      {visible.length === 0 ? <p className="empty">{list.length === 0 ? "Todavía no hay aeronaves registradas." : tab === "active" ? "No hay aeronaves activas para mostrar." : "No hay aeronaves desactivadas para mostrar."}</p> :
        <table><thead><tr><th>Matrícula</th><th>Modelo</th><th>Tipo</th><th>Capacidad</th><th>Ubicación actual</th><th>Estado</th><th>Próximo vuelo</th><th>Acciones</th></tr></thead><tbody>{visible.map((x) => <tr key={x.id}>
          <td>{x.matricula}</td><td>{x.modelo}</td><td>{x.tipo}</td><td>{x.capacidadPacientes} pac. · {x.capacidadTripulacion} trip.</td><td>{x.aeropuertoActual || "Sin ubicación"}</td>
          <td><span className={STATE_CLASS[x.estadoOperativo] || "status"}>{AIRCRAFT_STATE_LABEL[x.estadoOperativo] || (x.activo ? "ACTIVA" : "INACTIVA")}</span>{x.vuelosComprometidos > 0 && <small> {x.vuelosComprometidos} vuelo(s)</small>}</td>
          <td>{x.proximoVuelo ? `${x.proximoVuelo.codigo} · ${dt(x.proximoVuelo.salida)}` : "—"}</td>
          <td><button disabled={busy} onClick={() => setDetail(x)}>Detalle</button><button disabled={busy} onClick={() => openEdit(x)}>Editar</button><button disabled={busy} onClick={() => openMove(x)}>Ubicación</button><button className="secondary-action" disabled={busy} onClick={() => toggleActive(x)}>{x.activo ? "Desactivar" : "Reactivar"}</button></td>
        </tr>)}</tbody></table>}
    </section>}
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
