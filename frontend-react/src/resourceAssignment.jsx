import { useRef, useState } from "react";
import { api } from "./api";

/**
 * Asignación de comandante y aeronave de una solicitud sanitaria con horario acordado (vista de Centro de Operaciones). Cada recurso tiene su
 * propia tarjeta, estado y acción; la elección se guarda en el servidor al confirmarla (queda «reservada» hasta que estén los dos) y el vuelo pasa
 * a Planificado cuando ambos están confirmados. El servidor es la autoridad: la elegibilidad geográfica, la autorización de excepciones y la
 * disponibilidad se validan allí; esta pantalla sólo ordena las opciones y explica las causas.
 */
const civil = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");
export const GEO_LABEL = Object.freeze({
  MISMA_LOCALIDAD: "En la localidad de salida", UBICACION_DESCONOCIDA: "Sin ubicación registrada", UBICACION_INCOMPLETA: "Sólo provincia registrada",
  LOCALIDAD_DESHABILITADA: "Localidad deshabilitada", OTRA_LOCALIDAD: "En otra localidad", OTRA_PROVINCIA: "En otra provincia",
});
const place = (x) => [x.localidad, x.provincia].filter(Boolean).join(", ") || "Ubicación no registrada";
const MIN_REASON = 15;

function StatusBadge({ kind, children }) {
  return <span className={`resource-status resource-status-${kind}`}>{children}</span>;
}

function CommanderCard({ flight, resources, msg, onChanged, editable, blockedReason }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(""),
    [selected, setSelected] = useState(""), [reason, setReason] = useState(""), [search, setSearch] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false), requests = useRef(0);
  const assigned = resources.commanderId != null, reserved = assigned && resources.aircraftId == null;
  const load = async (q = "", keepError = false) => {
    const mine = ++requests.current;
    setLoading(true); if (!keepError) setError("");
    try { const value = await api(`/flights/${flight.id}/commander-candidates?q=${encodeURIComponent(q)}`); if (mine === requests.current) setData(value); }
    catch (e) { if (mine === requests.current) { setData(null); setError(e.message); } }
    finally { if (mine === requests.current) setLoading(false); }
  };
  const openChooser = () => { setOpen(true); setSelected(""); setReason(""); setSearch(""); load(""); };
  const candidates = data ? [...data.ordinarios, ...data.excepcionales] : [];
  const chosen = candidates.find((x) => String(x.id) === String(selected));
  const exceptional = chosen?.elegibilidad === "EXCEPCION";
  const canPickException = Boolean(data?.puedeAutorizarExcepcion);
  const confirm = async () => {
    if (lock.current || !chosen) return;
    if (exceptional && reason.trim().length < MIN_REASON) { setError(`La excepción geográfica requiere una justificación de al menos ${MIN_REASON} caracteres.`); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      await api(`/flights/${flight.id}/commander`, { method: "PUT", body: JSON.stringify({ comandanteId: chosen.id, excepcionGeografica: exceptional ? { motivo: reason.trim() } : null }) });
      setOpen(false);
      msg(resources.aircraftId == null ? "Comandante reservado: falta confirmar la aeronave" : "Comandante asignado");
      await onChanged();
    } catch (e) {
      setError(e.message); msg(e.message, true); setSelected("");
      await load(search, true); // la selección pudo quedar desactualizada (otro usuario, cambio de ubicación o de disponibilidad)
    } finally { lock.current = false; setBusy(false); }
  };
  const exception = resources.excepcionGeografica;
  return <section className="resource-card" aria-labelledby="resource-commander-title">
    <header><h5 id="resource-commander-title">Comandante</h5>
      {assigned ? <StatusBadge kind={reserved ? "reserved" : "assigned"}>{reserved ? "Reservado — falta la aeronave" : "Asignado"}</StatusBadge> : <StatusBadge kind="pending">Pendiente</StatusBadge>}</header>
    {assigned ? <dl className="resource-facts">
      <div><dt>Comandante</dt><dd>{resources.commanderNombre} {resources.commanderApellido}</dd></div>
      <div><dt>Licencia</dt><dd>{resources.commanderLicencia || "—"}</dd></div>
      <div><dt>Ubicación operativa</dt><dd>{[resources.commanderLocalidadActual, resources.commanderProvinciaActual].filter(Boolean).join(", ") || "No registrada"}{resources.commanderUbicacionActualizadaEn && <small> · actualizada {civil(resources.commanderUbicacionActualizadaEn)}</small>}</dd></div>
      {exception && <div className="resource-exception"><dt>Excepción geográfica</dt><dd><strong>{GEO_LABEL[exception.tipo] || exception.tipo}</strong> — autorizada por {exception.autorizadaPor} el {civil(exception.fecha)}.<br/>Motivo: {exception.motivo}</dd></div>}
    </dl> : <p className="hint">Aún no hay un comandante asignado a este vuelo.</p>}
    {!open && (editable
      ? <button type="button" onClick={openChooser}>{assigned ? "Cambiar comandante" : "Seleccionar comandante"}</button>
      : blockedReason && <p className="hint resource-blocked">{blockedReason}</p>)}
    {open && <div className="resource-chooser" aria-busy={loading || busy}>
      {loading && !data && <p className="hint" role="status">Consultando comandantes…</p>}
      {data && <>
        <p className="hint">Localidad de salida: <strong>{data.localidadSalida}, {data.provinciaSalida}</strong>. Sólo se ofrecen de forma ordinaria los comandantes registrados en esa localidad; estar en la misma provincia no alcanza.</p>
        {data.mensaje && <p className="resource-empty" role="status">{data.mensaje}</p>}
        {data.ordinarios.length > 0 && <fieldset><legend>Disponibles en {data.localidadSalida}</legend>
          {data.ordinarios.map((c) => <label key={c.id} className="resource-option"><input type="radio" name="commander" checked={String(selected) === String(c.id)} onChange={() => setSelected(String(c.id))} disabled={busy}/> <span><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{place(c)}{c.ubicacionActualizadaEn ? ` · actualizada ${civil(c.ubicacionActualizadaEn)}` : ""}{c.id === data.comandanteAsignadoId ? " · asignado actualmente" : ""}</small></span></label>)}
        </fieldset>}
        {data.noElegiblesEnLocalidad.length > 0 && <fieldset className="resource-unavailable"><legend>En la localidad, pero no disponibles</legend>
          {data.noElegiblesEnLocalidad.map((c) => <p key={c.id}><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{c.motivoOperativo}</small></p>)}
        </fieldset>}
        <details className="resource-exceptions" open={data.ordinarios.length === 0 && data.excepcionales.length > 0}>
          <summary>Fuera de la localidad de salida — asignación excepcional{data.excepcionales.length > 0 ? ` (${data.excepcionales.length}${data.excepcionalesIncompletos ? "+" : ""})` : ""}</summary>
          {!canPickException && <p className="hint">Asignar un comandante fuera de la localidad requiere la autorización de Centro de Operaciones.</p>}
          <label className="resource-search">Buscar comandante<input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); load(search); } }} placeholder="Apellido, nombre o usuario"/></label>
          <button type="button" className="secondary-action" onClick={() => load(search)} disabled={loading}>Buscar</button>
          {data.excepcionalesIncompletos && <p className="hint">Se muestran los primeros resultados; use la búsqueda para acotar.</p>}
          {data.excepcionales.length === 0 && <p className="hint">No hay comandantes aptos fuera de la localidad{search ? " que coincidan con la búsqueda" : ""}.</p>}
          {data.excepcionales.map((c) => <label key={c.id} className="resource-option"><input type="radio" name="commander" checked={String(selected) === String(c.id)} onChange={() => setSelected(String(c.id))} disabled={busy || !canPickException}/> <span><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{GEO_LABEL[c.codigoUbicacion] || c.codigoUbicacion}: {c.motivoUbicacion}</small></span></label>)}
        </details>
        {exceptional && <label className="resource-reason">Justificación de la excepción geográfica (obligatoria, queda registrada y auditada)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={MIN_REASON} maxLength={500} rows={3} required disabled={busy}/>
          <small>{reason.trim().length}/{MIN_REASON} caracteres mínimos. Una excepción no omite las demás validaciones (habilitación, disponibilidad).</small></label>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={confirm} disabled={!chosen || busy || (exceptional && reason.trim().length < MIN_REASON)}>{busy ? "Confirmando…" : exceptional ? "Confirmar asignación excepcional" : "Confirmar comandante"}</button>
        <button type="button" className="secondary-action" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
        <button type="button" className="tertiary-action" onClick={() => load(search)} disabled={loading || busy}>Actualizar lista</button>
      </div>
    </div>}
  </section>;
}

function AircraftCard({ flight, resources, msg, onChanged, editable, blockedReason }) {
  const [open, setOpen] = useState(false), [list, setList] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [selected, setSelected] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false), requests = useRef(0);
  const assigned = resources.aircraftId != null, reserved = assigned && resources.commanderId == null;
  const load = async (keepError = false) => {
    const mine = ++requests.current;
    setLoading(true); if (keepError !== true) setError("");
    try { const value = await api(`/flights/${flight.id}/aircraft-candidates`); if (mine === requests.current) setList(Array.isArray(value) ? value : []); }
    catch (e) { if (mine === requests.current) { setList(null); setError(e.message); } }
    finally { if (mine === requests.current) setLoading(false); }
  };
  const openChooser = () => { setOpen(true); setSelected(""); load(false); };
  const available = (list || []).filter((x) => x.disponible), unavailable = (list || []).filter((x) => !x.disponible);
  const confirm = async () => {
    if (lock.current || !selected) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await api(`/flights/${flight.id}/assigned-aircraft`, { method: "PUT", body: JSON.stringify({ aircraftId: Number(selected) }) });
      setOpen(false);
      msg(resources.commanderId == null ? "Aeronave reservada: falta confirmar el comandante" : "Aeronave asignada");
      await onChanged();
    } catch (e) {
      setError(e.message); msg(e.message, true); setSelected("");
      await load(true); // si cambió su disponibilidad entre la consulta y la confirmación, la lista se actualiza
    } finally { lock.current = false; setBusy(false); }
  };
  return <section className="resource-card" aria-labelledby="resource-aircraft-title">
    <header><h5 id="resource-aircraft-title">Aeronave</h5>
      {assigned ? <StatusBadge kind={reserved ? "reserved" : "assigned"}>{reserved ? "Reservada — falta el comandante" : "Asignada"}</StatusBadge> : <StatusBadge kind="pending">Pendiente</StatusBadge>}</header>
    {assigned ? <dl className="resource-facts">
      <div><dt>Matrícula</dt><dd>{resources.aircraftMatricula}</dd></div>
      <div><dt>Modelo / tipo</dt><dd>{[resources.aircraftModelo, resources.aircraftTipo].filter(Boolean).join(" · ") || "—"}</dd></div>
      <div><dt>Ubicación actual</dt><dd>{resources.aircraftUbicacion || "—"}</dd></div>
      <div><dt>Capacidad de tripulación</dt><dd>{resources.aircraftCapacidadTripulacion ?? "—"}</dd></div>
    </dl> : <p className="hint">Aún no hay una aeronave asignada a este vuelo.</p>}
    {!open && (editable
      ? <button type="button" onClick={openChooser}>{assigned ? "Cambiar aeronave" : "Seleccionar aeronave"}</button>
      : blockedReason && <p className="hint resource-blocked">{blockedReason}</p>)}
    {open && <div className="resource-chooser" aria-busy={loading || busy}>
      {loading && !list && <p className="hint" role="status">Consultando aeronaves…</p>}
      {list && <>
        <p className="hint">Aeronaves activas de la provincia de origen solicitada; sólo pueden confirmarse las que no tienen un vuelo comprometido en el horario de este vuelo.</p>
        {available.length === 0 && <p className="resource-empty" role="status">No hay aeronaves disponibles para este vuelo en la provincia de origen.</p>}
        {available.length > 0 && <label>Aeronave disponible<select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy}><option value="">Seleccionar</option>{available.map((x) => <option key={x.id} value={x.id}>{x.matricula} — {x.modelo || x.tipo} — {x.aeropuertoActual}</option>)}</select></label>}
        {unavailable.length > 0 && <details className="resource-unavailable"><summary>No disponibles ({unavailable.length})</summary>{unavailable.slice(0, 25).map((x) => <p key={x.id}><strong>{x.matricula}</strong> · {x.aeropuertoActual}<small>{x.motivoNoDisponible}</small></p>)}{unavailable.length > 25 && <p className="hint">… y {unavailable.length - 25} más.</p>}</details>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={confirm} disabled={!selected || busy}>{busy ? "Confirmando…" : "Confirmar aeronave"}</button>
        <button type="button" className="secondary-action" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
        <button type="button" className="tertiary-action" onClick={() => load(false)} disabled={loading || busy}>Actualizar lista</button>
      </div>
    </div>}
  </section>;
}

export function ResourceAssignment({ flight, resources, msg, onChanged }) {
  const res = resources || {};
  const complete = res.commanderId != null && res.aircraftId != null;
  const agreed = flight.estado === "APROBADO" || flight.estado === "PLANIFICADO";
  const editable = agreed && Boolean(flight.salida);
  const blockedReason = !agreed ? "Las asignaciones sólo pueden gestionarse con el horario acordado y antes del inicio del vuelo." : !flight.salida ? "Primero debe fijarse el horario definitivo." : "";
  return <div className="wide resource-assignment" role="group" aria-label="Asignación de recursos">
    <h4>Asignación de recursos</h4>
    <p className="hint">{complete ? "El comandante y la aeronave están asignados. Los cambios se validan nuevamente y quedan auditados." : "El horario está acordado. Confirme el comandante y la aeronave: cada elección queda reservada y el vuelo pasa a Planificado cuando están los dos."}</p>
    <div className="resource-grid">
      <CommanderCard flight={flight} resources={res} msg={msg} onChanged={onChanged} editable={editable} blockedReason={blockedReason}/>
      <AircraftCard flight={flight} resources={res} msg={msg} onChanged={onChanged} editable={editable && flight.estado === "APROBADO"} blockedReason={flight.estado === "PLANIFICADO" ? "Para cambiar la aeronave de un vuelo planificado use «Cambio de aeronave»." : blockedReason}/>
    </div>
  </div>;
}
