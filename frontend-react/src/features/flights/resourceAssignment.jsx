import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import { RequirementList } from "./crewRequirements";

/**
 * Asignación de comandante, copiloto y aeronave de una solicitud sanitaria con horario acordado (vista de Centro de Operaciones). Cada recurso tiene su
 * propia tarjeta, estado y acción; la elección se guarda en el servidor al confirmarla (queda «reservada» hasta que estén los dos) y el vuelo pasa
 * a Planificado cuando ambos están confirmados. El servidor es la autoridad: la elegibilidad geográfica (la jurisdicción del comandante, provincia o CABA, contra la del
 * aeropuerto de salida; preliminar mientras ese aeropuerto no esté confirmado), la autorización de excepciones y la disponibilidad se validan allí; esta pantalla sólo ordena
 * las opciones y explica las causas.
 * El copiloto no es otro tipo de usuario: se elige entre los mismos usuarios COMANDANTE (con la misma regla geográfica y de disponibilidad, calculada con el itinerario previsto) y es opcional.
 */
const civil = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");
export const GEO_LABEL = Object.freeze({
  MISMA_JURISDICCION: "En la jurisdicción del aeropuerto de salida", UBICACION_DESCONOCIDA: "Sin ubicación registrada", OTRA_PROVINCIA: "En otra provincia o jurisdicción",
  UBICACION_INCOMPLETA: "Sólo provincia registrada (anterior)", LOCALIDAD_DESHABILITADA: "Localidad deshabilitada (anterior)", OTRA_LOCALIDAD: "En otra localidad (anterior)",
});
const place = (x) => (x.provincia || "Ubicación no registrada") + (x.ubicacionPrevistaTrasVuelo ? ` (estará allí tras el vuelo ${x.ubicacionPrevistaTrasVuelo})` : "");
const MIN_REASON = 15;

function StatusBadge({ kind, children }) {
  return <span className={`resource-status resource-status-${kind}`}>{children}</span>;
}

function geoStatus(resources, plan) {
  if (resources.commanderId == null) return null;
  if (resources.excepcionGeografica) return { kind: "reserved", text: "Excepción geográfica autorizada" };
  if ((plan?.pendientes || []).some((x) => x.startsWith("El comandante asignado se encuentra en una jurisdicción diferente"))) return { kind: "pending", text: "Fuera de la jurisdicción del aeropuerto de salida" };
  if (plan?.elegibilidadPreliminar) return { kind: "reserved", text: "Preliminar: se verificará al confirmar el aeropuerto de salida" };
  return { kind: "assigned", text: "En la jurisdicción del aeropuerto de salida" };
}

function CommanderCard({ flight, resources, plan, msg, onChanged, editable, blockedReason }) {
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
  const exception = resources.excepcionGeografica, geo = geoStatus(resources, plan);
  return <section className="resource-card" aria-labelledby="resource-commander-title">
    <header><h5 id="resource-commander-title">Comandante</h5>
      {assigned ? <StatusBadge kind={reserved ? "reserved" : "assigned"}>{reserved ? "Reservado — falta la aeronave" : "Asignado"}</StatusBadge> : <StatusBadge kind="pending">Pendiente</StatusBadge>}</header>
    {assigned ? <dl className="resource-facts">
      <div><dt>Comandante</dt><dd>{resources.commanderNombre} {resources.commanderApellido}</dd></div>
      <div><dt>Licencia</dt><dd>{resources.commanderLicencia || "—"}</dd></div>
      <div><dt>Provincia / Jurisdicción actual</dt><dd>{resources.commanderProvinciaActual || "No registrada"}{resources.commanderUbicacionActualizadaEn && <small> · actualizada {civil(resources.commanderUbicacionActualizadaEn)}</small>}</dd></div>
      {geo && <div><dt>Elegibilidad geográfica</dt><dd><StatusBadge kind={geo.kind}>{geo.text}</StatusBadge></dd></div>}
      {exception && <div className="resource-exception"><dt>Excepción geográfica</dt><dd><strong>{GEO_LABEL[exception.tipo] || exception.tipo}</strong> — autorizada por {exception.autorizadaPor} el {civil(exception.fecha)}{exception.provinciaSalida ? " para la salida desde " + exception.provinciaSalida : ""}.<br/>Motivo: {exception.motivo}</dd></div>}
    </dl> : <p className="hint">Aún no hay un comandante asignado a este vuelo.</p>}
    {!open && (editable
      ? <button type="button" onClick={openChooser}>{assigned ? "Cambiar comandante" : "Seleccionar comandante"}</button>
      : blockedReason && <p className="hint resource-blocked">{blockedReason}</p>)}
    {open && <div className="resource-chooser" aria-busy={loading || busy}>
      {loading && !data && <p className="hint" role="status">Consultando comandantes…</p>}
      {data && <>
        <p className="hint">Jurisdicción de salida: <strong>{data.salida.provincia}</strong>{data.salida.aeropuerto ? <> (aeropuerto {data.salida.aeropuerto})</> : " (provincia donde se encuentra el paciente; todavía no hay aeropuerto de salida)"}. Sólo se ofrecen de forma ordinaria los comandantes ubicados en esa provincia o CABA; la localidad del paciente no se compara con la del comandante.</p>
        {data.advertencia && <p className="resource-empty" role="status">{data.advertencia}</p>}
        {data.mensaje && <p className="resource-empty" role="status">{data.mensaje}</p>}
        {data.ordinarios.length > 0 && <fieldset><legend>Disponibles en {data.salida.provincia}{data.salida.preliminar ? " (preliminar)" : ""}</legend>
          {data.ordinarios.map((c) => <label key={c.id} className="resource-option"><input type="radio" name="commander" checked={String(selected) === String(c.id)} onChange={() => setSelected(String(c.id))} disabled={busy}/> <span><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{place(c)}{c.ubicacionActualizadaEn ? ` · actualizada ${civil(c.ubicacionActualizadaEn)}` : ""}{c.id === data.comandanteAsignadoId ? " · asignado actualmente" : ""}</small></span></label>)}
        </fieldset>}
        {data.noElegiblesEnJurisdiccion.length > 0 && <fieldset className="resource-unavailable"><legend>En la jurisdicción, pero no disponibles</legend>
          {data.noElegiblesEnJurisdiccion.map((c) => <div key={c.id} className="resource-unavailable-item"><p><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{c.motivoOperativo}</small></p>{c.requisitosFaltantes?.length > 0 && <><small>Condiciones pendientes (cuenta, rol, licencia registrada, informes finales, disponibilidad):</small><RequirementList items={c.requisitosFaltantes} onlyMissing/></>}</div>)}
        </fieldset>}
        <details className="resource-exceptions" open={data.ordinarios.length === 0 && data.excepcionales.length > 0}>
          <summary>Fuera de la jurisdicción de salida — asignación excepcional{data.excepcionales.length > 0 ? ` (${data.excepcionales.length}${data.excepcionalesIncompletos ? "+" : ""})` : ""}</summary>
          {!canPickException && <p className="hint">Asignar un comandante fuera de la jurisdicción requiere la autorización de Centro de Operaciones.</p>}
          <label className="resource-search">Buscar comandante<input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); load(search); } }} placeholder="Apellido, nombre o usuario"/></label>
          <button type="button" className="secondary-action" onClick={() => load(search)} disabled={loading}>Buscar</button>
          {data.excepcionalesIncompletos && <p className="hint">Se muestran los primeros resultados; use la búsqueda para acotar.</p>}
          {data.excepcionales.length === 0 && <p className="hint">No hay comandantes aptos fuera de la jurisdicción{search ? " que coincidan con la búsqueda" : ""}.</p>}
          {data.excepcionales.map((c) => <label key={c.id} className="resource-option"><input type="radio" name="commander" checked={String(selected) === String(c.id)} onChange={() => setSelected(String(c.id))} disabled={busy || !canPickException}/> <span><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{GEO_LABEL[c.codigoUbicacion] || c.codigoUbicacion}: {c.motivoUbicacion}</small></span></label>)}
        </details>
        {exceptional && <label className="resource-reason">Justificación de la excepción geográfica (obligatoria, queda registrada y auditada)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={MIN_REASON} maxLength={500} rows={3} required disabled={busy}/>
          <small>{reason.trim().length}/{MIN_REASON} caracteres mínimos. Una excepción no omite las demás validaciones (cuenta, licencia registrada, informes, disponibilidad).</small></label>}
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
        <p className="hint">Aeronaves activas ubicadas en la jurisdicción del aeropuerto de salida (o, mientras no haya, en la provincia del paciente) y, si ya hay aeropuerto de salida, en ese aeropuerto; sólo pueden confirmarse las que no tienen un vuelo comprometido en el horario de este vuelo.</p>
        {available.length === 0 && <p className="resource-empty" role="status">No hay aeronaves disponibles para este vuelo en la jurisdicción de salida.</p>}
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

/**
 * Copiloto del vuelo: otro usuario COMANDANTE asignado a esa función (opcional). Se elige con la misma lista de candidatos del comandante (jurisdicción de salida según el itinerario previsto,
 * excepción geográfica autorizada sólo por Centro de Operaciones, disponibilidad horaria); el servidor decide. No recibe tareas ni permisos del comandante principal de este vuelo.
 */
export function CopilotCard({ flight, msg = () => {}, onChanged = async () => {}, editable = true, blockedReason = "" }) {
  const [current, setCurrent] = useState(undefined), [open, setOpen] = useState(false), [data, setData] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(""),
    [selected, setSelected] = useState(""), [reason, setReason] = useState(""), [search, setSearch] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false), requests = useRef(0), currentRequests = useRef(0);
  const loadCurrent = async () => {
    const mine = ++currentRequests.current;
    try { const rows = await api(`/flights/${flight.id}/crew`); if (mine === currentRequests.current) setCurrent((Array.isArray(rows) ? rows : []).find((r) => r.crewRoleCode === "COPILOTO" && r.vigente !== false) || null); }
    catch { if (mine === currentRequests.current) setCurrent(null); }
  };
  useEffect(() => { setOpen(false); setData(null); loadCurrent(); }, [flight.id, flight.estado]);
  const load = async (q = "", keepError = false) => {
    const mine = ++requests.current;
    setLoading(true); if (!keepError) setError("");
    try { const value = await api(`/flights/${flight.id}/commander-candidates?funcion=COPILOTO&q=${encodeURIComponent(q)}`); if (mine === requests.current) setData(value); }
    catch (e) { if (mine === requests.current) { setData(null); setError(e.message); } }
    finally { if (mine === requests.current) setLoading(false); }
  };
  const openChooser = () => { setOpen(true); setSelected(""); setReason(""); setSearch(""); load(""); };
  const candidates = data ? [...data.ordinarios, ...data.excepcionales] : [];
  const chosen = candidates.find((x) => String(x.id) === String(selected));
  const exceptional = chosen?.elegibilidad === "EXCEPCION", canPickException = Boolean(data?.puedeAutorizarExcepcion);
  const confirm = async () => {
    if (lock.current || !chosen) return;
    if (exceptional && reason.trim().length < MIN_REASON) { setError(`La excepción geográfica requiere una justificación de al menos ${MIN_REASON} caracteres.`); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const body = JSON.stringify({ userId: chosen.id, crewRoleCode: "COPILOTO", excepcionGeografica: exceptional ? { motivo: reason.trim() } : null });
      await api(current ? `/flights/${flight.id}/crew/${current.id}` : `/flights/${flight.id}/crew`, { method: current ? "PUT" : "POST", body });
      setOpen(false); msg(current ? "Copiloto reemplazado" : "Copiloto asignado"); await loadCurrent(); await onChanged();
    } catch (e) { setError(e.message); msg(e.message, true); setSelected(""); await load(search, true); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (lock.current || !current) return;
    if (window.confirm?.(`¿Retirar a ${current.nombre} ${current.apellido} como copiloto? El registro queda en el historial.`) === false) return;
    lock.current = true; setBusy(true); setError("");
    try { await api(`/flights/${flight.id}/crew/${current.id}`, { method: "DELETE" }); msg("Copiloto retirado"); await loadCurrent(); await onChanged(); }
    catch (e) { setError(e.message); msg(e.message, true); await loadCurrent(); } finally { lock.current = false; setBusy(false); }
  };
  return <section className="resource-card" aria-labelledby={`resource-copilot-title-${flight.id}`}>
    <header><h5 id={`resource-copilot-title-${flight.id}`}>Copiloto <small>(opcional)</small></h5>
      {current ? <StatusBadge kind="assigned">Asignado</StatusBadge> : <StatusBadge kind="pending">Sin copiloto</StatusBadge>}</header>
    {current ? <dl className="resource-facts"><div><dt>Copiloto</dt><dd>{current.nombre} {current.apellido}</dd></div><div><dt>Usuario</dt><dd>{current.username} (rol COMANDANTE)</dd></div>
      {current.elegibilidadCodigo && current.elegibilidadCodigo !== "ELEGIBLE" && <div><dt>Revisión</dt><dd><strong className="error">{current.elegibilidadMotivo || current.elegibilidadCodigo}</strong></dd></div>}</dl>
      : <p className="hint">{current === undefined ? "Consultando la tripulación…" : "El vuelo no tiene copiloto. Si corresponde, elija a otro usuario COMANDANTE."}</p>}
    {!open && (editable ? <div className="form-actions"><button type="button" onClick={openChooser} disabled={busy}>{current ? "Cambiar copiloto" : "Seleccionar copiloto"}</button>{current && <button type="button" className="secondary-action" onClick={remove} disabled={busy}>Retirar copiloto</button>}</div>
      : blockedReason && <p className="hint resource-blocked">{blockedReason}</p>)}
    {open && <div className="resource-chooser" aria-busy={loading || busy}>
      {loading && !data && <p className="hint" role="status">Consultando comandantes disponibles como copiloto…</p>}
      {data && <>
        <p className="hint">Jurisdicción de salida: <strong>{data.salida.provincia}</strong>. Se ofrecen usuarios COMANDANTE distintos del comandante principal; cada uno se ubica donde estará al despegar este vuelo según los vuelos que ya tiene asignados.</p>
        {data.advertencia && <p className="resource-empty" role="status">{data.advertencia}</p>}
        {data.mensaje && <p className="resource-empty" role="status">{data.mensaje}</p>}
        {data.ordinarios.length > 0 && <fieldset><legend>Disponibles en {data.salida.provincia}{data.salida.preliminar ? " (preliminar)" : ""}</legend>
          {data.ordinarios.map((c) => <label key={c.id} className="resource-option"><input type="radio" name={`copilot-${flight.id}`} checked={String(selected) === String(c.id)} onChange={() => setSelected(String(c.id))} disabled={busy}/> <span><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{place(c)}</small></span></label>)}
        </fieldset>}
        {data.noElegiblesEnJurisdiccion.length > 0 && <fieldset className="resource-unavailable"><legend>En la jurisdicción, pero no disponibles</legend>
          {data.noElegiblesEnJurisdiccion.map((c) => <div key={c.id} className="resource-unavailable-item"><p><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{c.motivoOperativo}</small></p></div>)}
        </fieldset>}
        <details className="resource-exceptions" open={data.ordinarios.length === 0 && data.excepcionales.length > 0}>
          <summary>Fuera de la jurisdicción de salida — asignación excepcional{data.excepcionales.length > 0 ? ` (${data.excepcionales.length}${data.excepcionalesIncompletos ? "+" : ""})` : ""}</summary>
          {!canPickException && <p className="hint">Asignar a alguien fuera de la jurisdicción requiere la autorización de Centro de Operaciones.</p>}
          <label className="resource-search">Buscar comandante<input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); load(search); } }} placeholder="Apellido, nombre o usuario"/></label>
          <button type="button" className="secondary-action" onClick={() => load(search)} disabled={loading}>Buscar</button>
          {data.excepcionales.length === 0 && <p className="hint">No hay comandantes aptos fuera de la jurisdicción{search ? " que coincidan con la búsqueda" : ""}.</p>}
          {data.excepcionales.map((c) => <label key={c.id} className="resource-option"><input type="radio" name={`copilot-${flight.id}`} checked={String(selected) === String(c.id)} onChange={() => setSelected(String(c.id))} disabled={busy || !canPickException}/> <span><strong>{c.apellido}, {c.nombre}</strong> · {c.licencia}<small>{GEO_LABEL[c.codigoUbicacion] || c.codigoUbicacion}: {c.motivoUbicacion}</small></span></label>)}
        </details>
        {exceptional && <label className="resource-reason">Justificación de la excepción geográfica (obligatoria, queda registrada y auditada)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={MIN_REASON} maxLength={500} rows={3} required disabled={busy}/>
          <small>{reason.trim().length}/{MIN_REASON} caracteres mínimos.</small></label>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={confirm} disabled={!chosen || busy || (exceptional && reason.trim().length < MIN_REASON)}>{busy ? "Confirmando…" : exceptional ? "Confirmar copiloto excepcional" : "Confirmar copiloto"}</button>
        <button type="button" className="secondary-action" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
        <button type="button" className="tertiary-action" onClick={() => load(search)} disabled={loading || busy}>Actualizar lista</button>
      </div>
    </div>}
  </section>;
}

export function ResourceAssignment({ flight, resources, plan = null, msg, onChanged, copilot = true }) {
  const res = resources || {};
  const complete = res.commanderId != null && res.aircraftId != null;
  const agreed = flight.estado === "APROBADO" || flight.estado === "PLANIFICADO";
  const editable = agreed && Boolean(flight.salida);
  const blockedReason = !agreed ? "Las asignaciones sólo pueden gestionarse con el horario acordado y antes del inicio del vuelo." : !flight.salida ? "Primero debe fijarse el horario definitivo." : "";
  return <div className="wide resource-assignment" role="group" aria-label="Asignación de recursos">
    <h4>Asignación de recursos</h4>
    <p className="hint">{complete ? "El comandante y la aeronave están asignados. Los cambios se validan nuevamente y quedan auditados." : "El horario está acordado. Confirme el comandante y la aeronave: cada elección queda reservada y el vuelo pasa a Planificado cuando están los dos. El copiloto es opcional y se elige entre los demás usuarios COMANDANTE."}</p>
    <div className="resource-grid">
      <CommanderCard flight={flight} resources={res} plan={plan} msg={msg} onChanged={onChanged} editable={editable} blockedReason={blockedReason}/>
      <AircraftCard flight={flight} resources={res} msg={msg} onChanged={onChanged} editable={editable && flight.estado === "APROBADO"} blockedReason={flight.estado === "PLANIFICADO" ? "Para cambiar la aeronave de un vuelo planificado use «Cambio de aeronave»." : blockedReason}/>
      {copilot && <CopilotCard flight={flight} msg={msg} onChanged={onChanged} editable={editable} blockedReason={blockedReason}/>}
    </div>
  </div>;
}
