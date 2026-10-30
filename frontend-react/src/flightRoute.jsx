import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";

// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");

export const ROUTE_STATE_LABEL = {
  SIN_PLANIFICAR: "Sin planificar",
  BORRADOR: "Borrador",
  PENDIENTE_REVISION: "Pendiente de revisión",
  APROBADA: "Aprobada",
  DEVUELTA: "Devuelta con observaciones",
  REQUIERE_REVISION: "Requiere nueva revisión",
  SIN_REVISION: "Sin decisión de Operaciones",
};
const STATE_MESSAGE = {
  SIN_PLANIFICAR: "El comandante todavía no planificó la ruta.",
  BORRADOR: "Ruta guardada como borrador: falta presentarla a Operaciones.",
  PENDIENTE_REVISION: "Ruta pendiente de revisión de Operaciones.",
  APROBADA: "Ruta aprobada por Operaciones.",
  DEVUELTA: "Operaciones devolvió la ruta con observaciones.",
  REQUIERE_REVISION: "La ruta requiere una nueva revisión.",
  SIN_REVISION: "Esta ruta no recibió una decisión de Operaciones.",
};
/** Conflictos de versión o de estado: la ficha se recarga para mostrar lo que realmente está vigente. */
const RELOAD_CODES = ["VERSION_RUTA_DESACTUALIZADA", "TRANSICION_RUTA_NO_PERMITIDA", "RUTA_REQUIERE_REVISION", "RUTA_NO_DEFINIDA"];
const EMPTY = { recorrido: "", alternativoId: "", altitudPies: "", distanciaNm: "", tiempoEstimadoMinutos: "", observaciones: "", motivoModificacion: "" };
const formOf = (v) => ({
  recorrido: v?.recorrido || "", alternativoId: v?.alternativoId || "", altitudPies: v?.altitudPies ?? "", distanciaNm: v?.distanciaNm ?? "",
  tiempoEstimadoMinutos: v?.tiempoEstimadoMinutos ?? "", observaciones: v?.observaciones || "", motivoModificacion: "",
});
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const MIN_REASON = 8, MIN_RETURN = 10;

export const RouteStateBadge = ({ estado }) => <span className={`status status-ruta-${String(estado).toLowerCase()}`}>{ROUTE_STATE_LABEL[estado] || estado}</span>;

/**
 * Ruta del vuelo (sanitario u operativo) y su revisión. El comandante asignado la planifica y la presenta (`canEdit`); Operaciones la
 * aprueba o la devuelve con observaciones (`canReview`). Todo lo que se puede hacer lo informa el servidor (`editable`, `puedePresentar`,
 * `puedeRevisar`, `requiereMotivo`): aquí sólo se muestra, y el servidor revalida cada acción. Nunca se piden identificadores.
 */
export function FlightRoute({ flightId, canEdit = false, canReview = false, msg = () => {}, onChanged = () => {} }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [airports, setAirports] = useState([]), [airportQuery, setAirportQuery] = useState("");
  const [form, setForm] = useState(EMPTY), [note, setNote] = useState(""), [returnReason, setReturnReason] = useState("");

  const latest = useRef(0);
  const load = async () => {
    const mine = ++latest.current;
    try {
      const d = await api(`/flights/${flightId}/route`);
      if (mine !== latest.current) return;
      if (!d || typeof d.estado !== "string" || !Array.isArray(d.versiones)) throw new Error("Respuesta de ruta inválida");
      setData(d); setForm(formOf(d.versiones[0])); setNote(""); setReturnReason(""); setError("");
    } catch (e) { if (mine === latest.current) setError(e.message); }
  };
  useEffect(() => { load(); }, [flightId]);
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    api(`/catalogs/airports?q=${encodeURIComponent(airportQuery)}`).then((a) => { if (active) setAirports(a); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [canEdit, airportQuery]);

  const current = data?.versiones?.[0];
  const dirty = !data || !current || ["recorrido", "alternativoId", "altitudPies", "distanciaNm", "tiempoEstimadoMinutos", "observaciones"].some((k) => String(form[k] ?? "") !== String(formOf(current)[k] ?? ""));
  const reopen = ["DEVUELTA", "REQUIERE_REVISION"].includes(data?.estado);
  const reasonOk = !data?.requiereMotivo || form.motivoModificacion.trim().length >= MIN_REASON;
  const canSave = !busy && form.recorrido.trim() && reasonOk && (dirty || reopen);

  /** Ejecuta una acción de la ruta evitando envíos duplicados y mostrando el error estructurado del servidor. */
  const act = async (path, options, success) => {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/flights/${flightId}/route${path}`, options);
      await load(); msg(success); onChanged();
    } catch (e) {
      setError(e.message);
      if (RELOAD_CODES.includes(e.code)) { await load(); setError(e.message); }
    } finally { setBusy(false); }
  };
  const save = (present) => act("", { method: "PUT", body: JSON.stringify({
    version: current?.version || 0, recorrido: form.recorrido, alternativoId: form.alternativoId ? Number(form.alternativoId) : null,
    altitudPies: num(form.altitudPies), distanciaNm: num(form.distanciaNm), tiempoEstimadoMinutos: num(form.tiempoEstimadoMinutos),
    observaciones: form.observaciones, ...(data.requiereMotivo ? { motivoModificacion: form.motivoModificacion.trim() } : {}), ...(present ? { presentar: true } : {}),
  }) }, present ? "Ruta presentada a Operaciones" : "Ruta guardada");
  const submit = () => act("/submit", { method: "POST", body: JSON.stringify({ version: current.version }) }, "Ruta presentada a Operaciones");
  const approve = () => act("/approve", { method: "POST", body: JSON.stringify({ version: data.versionVigente, ...(note.trim() ? { comentario: note.trim() } : {}) }) }, "Ruta aprobada");
  const sendBack = () => act("/return", { method: "POST", body: JSON.stringify({ version: data.versionVigente, motivo: returnReason.trim() }) }, "Ruta devuelta al comandante");

  const inicio = data?.inicio;
  return (
    <div className="wide detail-actions route-panel">
      <h4>Ruta operativa</h4>
      <p>Planificación interna; no constituye autorización aeronáutica.</p>
      {error && <p role="alert">{error}</p>}
      {!data ? !error && <p>Cargando ruta…</p> : <>
        <p>Estado: <RouteStateBadge estado={data.estado} /> · {data.origen || "Origen pendiente"} → {data.destino || "Destino pendiente"}</p>
        <p>Salida: {data.salida ? dt(data.salida) : "Pendiente"} · Llegada: {data.llegada ? dt(data.llegada) : "Pendiente"}</p>
        <p role="status" className="hint">{STATE_MESSAGE[data.estado]}</p>
        {data.estado === "DEVUELTA" && current?.observacionesRevision && <p className="route-observation"><strong>Observaciones de Operaciones:</strong> {current.observacionesRevision}</p>}
        {data.estado === "REQUIERE_REVISION" && data.causas.length > 0 && <p className="route-observation"><strong>Motivo de la nueva revisión:</strong> {data.causas.join("; ")}.</p>}
        {inicio?.aplica && !inicio.permitido && <p className="hint">Inicio del vuelo bloqueado por la ruta: {inicio.mensaje}</p>}
        {inicio?.aplica && inicio.permitido && <p className="hint">La ruta no impide el inicio del vuelo.</p>}

        {canReview && data.puedeRevisar && <fieldset className="wide">
          <legend>Revisión de Operaciones · versión {data.versionVigente}</legend>
          <label>Comentario de la aprobación (opcional)<textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
          <button type="button" disabled={busy} onClick={approve}>Aprobar ruta</button>
          <label>Motivo de la devolución (obligatorio)<textarea value={returnReason} maxLength={1000} onChange={(e) => setReturnReason(e.target.value)} /></label>
          <button type="button" className="secondary-action" disabled={busy || returnReason.trim().length < MIN_RETURN} onClick={sendBack}>Devolver con observaciones</button>
          {returnReason.trim().length > 0 && returnReason.trim().length < MIN_RETURN && <p className="hint">Describa qué debe corregirse (al menos {MIN_RETURN} caracteres).</p>}
        </fieldset>}
        {canReview && !data.puedeRevisar && data.estado === "PENDIENTE_REVISION" && <p className="hint">Esta versión no puede revisarla quien la planificó o presentó.</p>}

        {canEdit && data.editable ? <>
          <label>Recorrido y puntos intermedios en orden<textarea value={form.recorrido} onChange={(e) => setForm({ ...form, recorrido: e.target.value })} /></label>
          <label>Buscar aeropuerto alternativo<input value={airportQuery} onChange={(e) => setAirportQuery(e.target.value)} /></label>
          <label>Aeropuerto alternativo<select value={form.alternativoId} onChange={(e) => setForm({ ...form, alternativoId: e.target.value })}><option value="">Ninguno</option>{form.alternativoId && !airports.some((a) => a.id === Number(form.alternativoId)) && <option value={form.alternativoId}>{current?.alternativo || "Alternativo seleccionado"}</option>}{airports.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
          {[["altitudPies", "Altitud (pies)"], ["distanciaNm", "Distancia (NM)"], ["tiempoEstimadoMinutos", "Tiempo estimado (minutos)"]].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step={key === "tiempoEstimadoMinutos" ? "1" : "0.01"} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
          <label>Observaciones<textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></label>
          {data.requiereMotivo && <label>Motivo de la modificación<textarea value={form.motivoModificacion} maxLength={500} onChange={(e) => setForm({ ...form, motivoModificacion: e.target.value })} /></label>}
          {data.requiereMotivo && !reasonOk && <p className="hint">Indique el motivo de la modificación (al menos {MIN_REASON} caracteres): la versión anterior ya fue presentada a Operaciones.</p>}
          <button type="button" disabled={!canSave} onClick={() => save(false)}>Guardar ruta</button>
          <button type="button" disabled={!canSave} onClick={() => save(true)}>Guardar y presentar a Operaciones</button>
          {data.puedePresentar && <button type="button" disabled={busy} onClick={submit}>Presentar a Operaciones</button>}
        </> : canEdit && <p>{data.motivo}</p>}

        <h4>Historial de ruta</h4>
        {data.versiones.length === 0 ? <p>Sin ruta registrada.</p> : data.versiones.map((v, i) => <RouteVersion key={v.version} v={v} open={i === 0} />)}
      </>}
    </div>
  );
}

function RouteVersion({ v, open }) {
  const c = v.condiciones;
  return (
    <details open={open} className="route-version">
      <summary><strong>Versión {v.version}</strong> <RouteStateBadge estado={v.estado} />{v.actual ? " · vigente" : ""}</summary>
      <p>Creada por {v.creadoPor} · {dt(v.fechaCreacion)}{v.version > 1 ? ` · basada en la versión ${v.version - 1}` : ""}</p>
      <p>{v.recorrido}</p>
      <p>Alternativo: {v.alternativo || "No indicado"} · Altitud: {v.altitudPies ?? "—"} pies · Distancia: {v.distanciaNm ?? "—"} NM · Tiempo: {v.tiempoEstimadoMinutos ?? "—"} min</p>
      {v.observaciones && <p>{v.observaciones}</p>}
      {c && <p>Condiciones del vuelo: {c.origen || "—"} → {c.destino || "—"} · Salida {dt(c.salida)} · Llegada {dt(c.llegada)}</p>}
      {v.motivoModificacion && <p>Motivo de la modificación: {v.motivoModificacion}</p>}
      {v.presentadoPor && <p>Presentada por {v.presentadoPor} el {dt(v.fechaPresentacion)}</p>}
      {v.revisadoPor && <p>{v.estado === "DEVUELTA" ? "Devuelta" : "Aprobada"} por {v.revisadoPor} el {dt(v.fechaRevision)}{v.observacionesRevision ? ` — ${v.observacionesRevision}` : ""}</p>}
      {v.fechaInvalidacion && <p>Aprobación invalidada el {dt(v.fechaInvalidacion)}: {v.causaInvalidacion}</p>}
    </details>
  );
}

/** Cola de Operaciones: vuelos cuya versión vigente espera revisión. Parte del mismo estado efectivo que la ficha de ruta. */
export function RouteReviewQueue({ statuses = {}, flights = [], onOpen = () => {} }) {
  const pending = flights.filter((f) => statuses[f.id]?.estado === "PENDIENTE_REVISION");
  if (pending.length === 0) return null;
  return (
    <div className="wide detail-actions" aria-label="Rutas pendientes de revisión">
      <h4>Rutas pendientes de revisión ({pending.length})</h4>
      {pending.map((f) => <p key={f.id}>{f.codigo} — {f.salida ? dt(f.salida) : "sin horario"} · versión {statuses[f.id].version} <button type="button" className="secondary-action" onClick={() => onOpen(String(f.id))}>Revisar ruta de {f.codigo}</button></p>)}
    </div>
  );
}
