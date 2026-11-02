import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";

/**
 * Planificación aeronáutica del traslado sanitario: aeropuertos de salida y llegada. Es distinta de la solicitud de DTS: el origen y el destino del paciente son localidades
 * (dónde está y adónde debe llegar); el aeropuerto es dónde despega y aterriza la aeronave, y puede estar en otra localidad o provincia. Centro de Operaciones propone los
 * aeropuertos (quedan «Propuestos»); el comandante los revisa y confirma en su planificación. La elegibilidad geográfica del comandante se evalúa contra la jurisdicción del aeropuerto de
 * salida y es preliminar mientras no esté confirmado. El servidor valida todo; esta pantalla ordena alternativas y explica las causas. La distancia es en línea recta: no es tiempo de traslado.
 */
const civil = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");
export const AIRPORT_STATE_LABEL = Object.freeze({ PENDIENTE: "Pendiente", PROPUESTO: "Propuesto", CONFIRMADO: "Confirmado" });
const STATE_KIND = { PENDIENTE: "pending", PROPUESTO: "reserved", CONFIRMADO: "assigned" };
const MIN_REASON = 10, MIN_EXCEPTION = 15;
const km = (value) => (value == null ? "sin coordenadas" : `${String(value).replace(".", ",")} km en línea recta`);

export const placeLabel = (place) => (!place ? "—" : typeof place === "string" ? place : [place.nombre, place.provincia].filter(Boolean).join(", ") || "—");

/** Selector de aeropuertos candidatos de un traslado. `onSelect(candidato|null)`; muestra primero los de la jurisdicción del paciente y, sin impedirlo, los de otras jurisdicciones. */
export function AirportPicker({ flightId, kind, selectedId, onSelect, disabled = false }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [q, setQ] = useState("");
  const requests = useRef(0);
  const load = async (text = "") => {
    const mine = ++requests.current; setLoading(true); setError("");
    try { const value = await api(`/flights/${flightId}/airport-candidates?tipo=${kind}&q=${encodeURIComponent(text)}`); if (mine === requests.current) setData(value); }
    catch (e) { if (mine === requests.current) { setData(null); setError(e.message); } }
    finally { if (mine === requests.current) setLoading(false); }
  };
  useEffect(() => { load(""); return () => { requests.current++; }; }, [flightId, kind]);
  const all = data ? [...data.enProvinciaDelPaciente, ...data.enOtrasJurisdicciones] : [];
  const option = (c) => <label key={c.id} className="resource-option">
    <input type="radio" name={`airport-${kind}`} checked={String(selectedId) === String(c.id)} onChange={() => onSelect(c)} disabled={disabled}/>
    <span><strong>{c.nombre}</strong>{c.codigoOaci ? ` (${c.codigoOaci})` : ""} · {c.provincia}
      <small>{[km(c.distanciaRectaKm), c.tipo, c.seleccionActual ? `selección actual: ${AIRPORT_STATE_LABEL[c.estadoSeleccion] || c.estadoSeleccion}` : null, c.aeronaveAsignadaAqui ? "la aeronave asignada está aquí" : null,
        c.comandanteEnJurisdiccion === true ? "el comandante asignado está en esta jurisdicción" : c.comandanteEnJurisdiccion === false ? "el comandante asignado está en otra jurisdicción" : null].filter(Boolean).join(" · ")}</small></span>
  </label>;
  return <div className="resource-chooser airport-picker" aria-busy={loading}>
    {loading && !data && <p className="hint" role="status">Consultando aeropuertos…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {data && <>
      <p className="hint">{kind === "SALIDA" ? "Localidad donde se encuentra el paciente" : "Localidad de destino del paciente"}: <strong>{data.localidadPaciente.nombre}, {data.localidadPaciente.provincia}</strong>. Es la necesidad sanitaria, no el aeropuerto: el aeropuerto puede estar en otra localidad.</p>
      <p className="hint">{data.aviso}</p>
      {data.mensaje && <p className="resource-empty" role="status">{data.mensaje}</p>}
      {data.enProvinciaDelPaciente.length > 0 && <fieldset><legend>Aeropuertos en {data.localidadPaciente.provincia}</legend>{data.enProvinciaDelPaciente.map(option)}</fieldset>}
      <details className="resource-exceptions" open={data.enProvinciaDelPaciente.length === 0 && data.enOtrasJurisdicciones.length > 0}>
        <summary>Otras provincias o jurisdicciones{data.enOtrasJurisdicciones.length > 0 ? ` (${data.enOtrasJurisdicciones.length}${data.otrasJurisdiccionesIncompletas ? "+" : ""})` : ""} — requiere una justificación operativa</summary>
        {data.enOtrasJurisdicciones.map(option)}
        {!data.enOtrasJurisdicciones.length && <p className="hint">Use la búsqueda por nombre, ciudad o código para ver aeropuertos de otras jurisdicciones.</p>}
      </details>
      <div className="resource-search-row">
        <label className="resource-search">Buscar aeropuerto<input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); load(q); } }} placeholder="Nombre, ciudad, OACI o IATA"/></label>
        <button type="button" className="secondary-action" onClick={() => load(q)} disabled={loading}>Buscar</button>
      </div>
      {selectedId && !all.some((c) => String(c.id) === String(selectedId)) && <p className="hint">La selección actual no coincide con esta búsqueda.</p>}
    </>}
  </div>;
}

const SlotRow = ({ title, slot, place }) => <div className="airport-slot">
  <dt>{title}</dt>
  <dd>{slot?.aeropuertoId ? <><strong>{slot.aeropuerto}</strong>{slot.codigoOaci ? ` (${slot.codigoOaci})` : ""} · {slot.provincia || <em>provincia desconocida</em>}</> : "Sin definir"}
    {" "}<span className={`resource-status resource-status-${STATE_KIND[slot?.estado] || "pending"}`}>{AIRPORT_STATE_LABEL[slot?.estado] || "Pendiente"}</span>
    <small>{place}</small></dd>
</div>;

function Proposal({ flight, kind, msg, onChanged, onClose }) {
  const [picked, setPicked] = useState(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [resolution, setResolution] = useState("none"),
    [replacement, setReplacement] = useState(""), [candidates, setCandidates] = useState(null), [exceptionReason, setExceptionReason] = useState("");
  const lock = useRef(false);
  const outside = picked && !picked.mismaProvinciaQueElPaciente;
  const commanderOut = kind === "SALIDA" && picked?.comandanteEnJurisdiccion === false;
  useEffect(() => {
    setResolution("none"); setReplacement(""); setCandidates(null); setExceptionReason("");
    if (!commanderOut || !picked) return undefined;
    let active = true;
    api(`/flights/${flight.id}/commander-candidates?q=&aeropuertoSalidaId=${picked.id}`).then((v) => { if (active) setCandidates(v); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [picked?.id, commanderOut]);
  const ready = picked && (!outside || reason.trim().length >= MIN_REASON)
    && (!commanderOut || (resolution === "replace" && replacement) || (resolution === "exception" && exceptionReason.trim().length >= MIN_EXCEPTION));
  const confirm = async () => {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setError("");
    const body = { origenId: kind === "SALIDA" ? picked.id : null, destinoId: kind === "LLEGADA" ? picked.id : null, justificacion: outside ? reason.trim() : null,
      nuevoComandanteId: commanderOut && resolution === "replace" ? Number(replacement) : null, excepcionGeografica: commanderOut && resolution === "exception" ? { motivo: exceptionReason.trim() } : null };
    try {
      await api(`/flights/${flight.id}/airports`, { method: "PUT", body: JSON.stringify(body) });
      msg(`Aeropuerto de ${kind === "SALIDA" ? "salida" : "llegada"} propuesto: queda pendiente de confirmación del comandante`);
      onClose(); await onChanged();
    } catch (e) { setError(e.message); msg(e.message, true); }
    finally { lock.current = false; setBusy(false); }
  };
  const ordinary = candidates?.ordinarios || [], canAuthorizeException = Boolean(candidates?.puedeAutorizarExcepcion);
  return <div className="resource-chooser" aria-busy={busy}>
    <AirportPicker flightId={flight.id} kind={kind} selectedId={picked?.id} onSelect={setPicked} disabled={busy}/>
    {outside && <label className="resource-reason">Justificación operativa (el aeropuerto está fuera de la jurisdicción del paciente)
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={MIN_REASON} maxLength={500} rows={2} disabled={busy}/><small>{reason.trim().length}/{MIN_REASON} caracteres mínimos. Queda auditada.</small></label>}
    {commanderOut && <fieldset className="resource-exceptions"><legend>El comandante asignado se encuentra en una jurisdicción diferente a la de este aeropuerto de salida</legend>
      <p className="hint">La modificación del aeropuerto requiere volver a verificar la elegibilidad del comandante. No se mantiene la asignación en silencio: elija cómo resolverla.</p>
      <label className="resource-option"><input type="radio" name="geo-resolution" checked={resolution === "replace"} onChange={() => setResolution("replace")} disabled={busy}/> <span>Reemplazar por otro comandante elegible para {picked.provincia}</span></label>
      {resolution === "replace" && <label>Comandante de reemplazo<select value={replacement} onChange={(e) => setReplacement(e.target.value)} disabled={busy}><option value="">{candidates ? "Seleccionar" : "Consultando…"}</option>{ordinary.map((c) => <option key={c.id} value={c.id}>{c.apellido}, {c.nombre} · {c.licencia}</option>)}</select></label>}
      {resolution === "replace" && candidates && ordinary.length === 0 && <p className="resource-empty" role="status">{candidates.mensaje || `No hay comandantes elegibles en ${picked.provincia}.`}</p>}
      <label className="resource-option"><input type="radio" name="geo-resolution" checked={resolution === "exception"} onChange={() => setResolution("exception")} disabled={busy || !canAuthorizeException}/> <span>Mantener al comandante con una excepción geográfica {canAuthorizeException ? "" : "(requiere la autorización de Centro de Operaciones)"}</span></label>
      {resolution === "exception" && <label className="resource-reason">Justificación de la excepción (obligatoria, auditada)
        <textarea value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} minLength={MIN_EXCEPTION} maxLength={500} rows={2} disabled={busy}/><small>{exceptionReason.trim().length}/{MIN_EXCEPTION} caracteres mínimos.</small></label>}
    </fieldset>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" onClick={confirm} disabled={!ready || busy}>{busy ? "Guardando…" : `Proponer aeropuerto de ${kind === "SALIDA" ? "salida" : "llegada"}`}</button><button type="button" className="secondary-action" onClick={onClose} disabled={busy}>Cancelar</button></div>
  </div>;
}

/** Vista de Operaciones. `plan` es `recursos` de la ficha (`aeropuertos`); `editable` mientras el horario esté acordado y el vuelo no haya iniciado. */
export function AirportPlanning({ flight, plan, msg, onChanged, editable }) {
  const [open, setOpen] = useState(null);
  const p = plan || { salida: { estado: "PENDIENTE" }, llegada: { estado: "PENDIENTE" }, pendientes: [] };
  const sanitary = flight.datosSanitarios;
  return <div className="wide resource-assignment airport-planning" role="group" aria-label="Aeropuertos del vuelo">
    <h4>Aeropuertos de salida y llegada</h4>
    <p className="hint">Son los aeropuertos de la aeronave, distintos de las localidades del paciente de la solicitud. Centro de Operaciones los propone y el comandante los revisa y confirma en su planificación de ruta.</p>
    <dl className="resource-facts airport-facts">
      <div><dt>Origen del paciente (solicitud de DTS)</dt><dd>{placeLabel(sanitary?.localidadOrigenSolicitada || flight.origen)}</dd></div>
      <div><dt>Destino del paciente (solicitud de DTS)</dt><dd>{placeLabel(sanitary?.localidadDestinoSolicitada || flight.destino)}</dd></div>
      <SlotRow title="Aeropuerto de salida" slot={p.salida} place={p.fijadoPor && p.salida?.aeropuertoId ? `Registrado por ${p.fijadoPor} el ${civil(p.fijadoEn)}` : null}/>
      <SlotRow title="Aeropuerto de llegada" slot={p.llegada} place={null}/>
    </dl>
    {p.advertenciaElegibilidad && <p className="resource-empty" role="status">{p.advertenciaElegibilidad}</p>}
    {p.pendientes?.length > 0 && <div className="airport-pending" role="status"><strong>Datos de planificación pendientes</strong><ul>{p.pendientes.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    {editable && !open && <div className="form-actions">
      <button type="button" onClick={() => setOpen("SALIDA")}>{p.salida?.aeropuertoId ? "Cambiar aeropuerto de salida" : "Proponer aeropuerto de salida"}</button>
      <button type="button" onClick={() => setOpen("LLEGADA")}>{p.llegada?.aeropuertoId ? "Cambiar aeropuerto de llegada" : "Proponer aeropuerto de llegada"}</button>
    </div>}
    {editable && open && <Proposal key={open} flight={flight} kind={open} msg={msg} onChanged={onChanged} onClose={() => setOpen(null)}/>}
  </div>;
}

/** Vista de sólo lectura de la planificación aeronáutica para el comandante y las etapas posteriores. */
export function AirportSummary({ flight, plan }) {
  if (!plan) return null;
  return <AirportPlanning flight={flight} plan={plan} editable={false} msg={() => {}} onChanged={async () => {}}/>;
}

/**
 * Planificación aeroportuaria del comandante asignado (la planificación de ruta existente, no una segunda). Parte de lo que propuso Centro de Operaciones: puede confirmarlo tal cual o elegir
 * otros aeropuertos; una modificación queda auditada, Centro de Operaciones es avisado y la ruta presentada o aprobada vuelve a revisión. Un aeropuerto fuera de la jurisdicción del paciente
 * requiere una justificación operativa, y el servidor rechaza una salida fuera de la jurisdicción del propio comandante (no puede autorizarse una excepción a sí mismo).
 */
export function CommanderAirportPlanning({ flight, plan, onSaved, msg }) {
  const [origin, setOrigin] = useState(plan?.salida?.aeropuertoId ? { id: plan.salida.aeropuertoId } : null), [destination, setDestination] = useState(plan?.llegada?.aeropuertoId ? { id: plan.llegada.aeropuertoId } : null),
    [arrival, setArrival] = useState(flight.llegada ? String(flight.llegada).slice(0, 16) : ""), [reason, setReason] = useState(""), [needsReason, setNeedsReason] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [open, setOpen] = useState(null);
  const lock = useRef(false);
  const proposed = plan?.salida?.estado === "PROPUESTO" || plan?.llegada?.estado === "PROPUESTO";
  const outside = [origin, destination].some((x) => x && x.mismaProvinciaQueElPaciente === false);
  const showReason = outside || needsReason;
  const ready = origin && destination && arrival && (!showReason || reason.trim().length >= MIN_REASON);
  const save = async () => {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await api(`/flights/${flight.id}/operational-planning`, { method: "POST", body: JSON.stringify({ origenId: origin.id, destinoId: destination.id, llegada: arrival, justificacion: showReason ? reason.trim() : null }) });
      msg("Aeropuertos confirmados y planificación guardada");
      await onSaved();
    } catch (e) {
      setError(e.message); msg(e.message, true);
      if (e.code === "AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED") setNeedsReason(true);
    } finally { lock.current = false; setBusy(false); }
  };
  const slot = (title, current, selected, kind) => <div className="airport-slot-edit">
    <p><strong>{title}</strong>: {selected?.nombre || current?.aeropuerto || "sin definir"}{current?.provincia ? ` · ${current.provincia}` : ""} {current?.aeropuertoId && <span className={`resource-status resource-status-${STATE_KIND[current.estado]}`}>{AIRPORT_STATE_LABEL[current.estado]}{current.estado === "PROPUESTO" ? " por Centro de Operaciones" : ""}</span>}</p>
    {open === kind ? <AirportPicker flightId={flight.id} kind={kind} selectedId={selected?.id} onSelect={(c) => { kind === "SALIDA" ? setOrigin(c) : setDestination(c); }} disabled={busy}/>
      : <button type="button" className="secondary-action" onClick={() => setOpen(kind)} disabled={busy}>{`Elegir otro aeropuerto de ${kind === "SALIDA" ? "salida" : "llegada"}`}</button>}
  </div>;
  return <fieldset className="wide airport-commander-planning"><legend>Aeropuertos del vuelo</legend>
    <p className="hint">Origen del paciente: <strong>{placeLabel(flight.datosSanitarios?.localidadOrigenSolicitada || flight.origen)}</strong> · destino del paciente: <strong>{placeLabel(flight.datosSanitarios?.localidadDestinoSolicitada || flight.destino)}</strong>. Los aeropuertos son los de la aeronave y pueden estar en otra localidad.</p>
    {proposed && <p className="resource-empty" role="status">Centro de Operaciones propuso estos aeropuertos. Revíselos: puede confirmarlos tal cual o elegir otros (el cambio queda registrado y se avisa a Operaciones).</p>}
    {plan?.pendientes?.length > 0 && <div className="airport-pending" role="status"><ul>{plan.pendientes.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    {slot("Aeropuerto de salida", plan?.salida, origin?.nombre ? origin : null, "SALIDA")}
    {slot("Aeropuerto de llegada", plan?.llegada, destination?.nombre ? destination : null, "LLEGADA")}
    <label>Llegada planificada<input type="datetime-local" value={arrival} onChange={(e) => setArrival(e.target.value)} disabled={busy}/></label>
    {showReason && <label className="resource-reason">Justificación operativa (aeropuerto fuera de la jurisdicción del paciente)
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={MIN_REASON} maxLength={500} rows={2} disabled={busy}/><small>{reason.trim().length}/{MIN_REASON} caracteres mínimos.</small></label>}
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" disabled={!ready || busy} onClick={save}>{busy ? "Guardando…" : "Confirmar aeropuertos y guardar planificación"}</button>
  </fieldset>;
}
