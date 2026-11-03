import React, { useState } from "react";
import { api } from "../../../services/api";
import { useResource } from "../../../hooks/useResource";
import { PlanningPanel, readStatus } from "./PlanningPanel";
import { dt } from "../../../utils/format";

const STATES = {
  PENDIENTE: "Pendiente",
  EN_SEGUIMIENTO: "En seguimiento",
  CONFIRMADO: "Confirmación declarada",
  RECHAZADO: "Rechazo informado",
  CANCELADO: "Cancelada",
};
const NEXT = {
  PENDIENTE: ["EN_SEGUIMIENTO", "CONFIRMADO", "RECHAZADO", "CANCELADO"],
  EN_SEGUIMIENTO: ["CONFIRMADO", "RECHAZADO", "CANCELADO"],
  CONFIRMADO: ["EN_SEGUIMIENTO", "CANCELADO"],
  RECHAZADO: ["CANCELADO"],
};
const VIGENCY = { VIGENTE: "Vigente", REQUIERE_REVISION: "Requiere revisión" };
const DATES = ["fechaSlot", "fechaComunicacion", "fechaRespuesta"];
const TEXT = ["finalidad", "descripcion", "contacto", "canal", "fuenteRespuesta", "referenciaExterna", "observaciones"];
const date = (value) => value ? dt(value) : "—";

export function AirportCoordinations({ flightId, revision, canManage = true, msg = () => {} }) {
  const path = `/flights/${flightId}/airport-coordinations`;
  const resource = useResource(path, { revision, map: (result) => {
    if (!Array.isArray(result?.versiones)) throw Error("Respuesta de coordinaciones inválida");
    return result;
  } });
  const { data, error, reload } = resource;
  const current = data?.versiones.filter((item) => item.actual) || [];
  const summary = readStatus(resource, () => {
    if (current.length === 0) return "Sin gestiones registradas";
    const registered = current.length === 1 ? "1 gestión registrada" : `${current.length} gestiones registradas`;
    const review = current.filter((item) => item.estadoVigencia === "REQUIERE_REVISION").length;
    return review ? `${registered} · ${review} para revisar` : registered;
  });
  return <PlanningPanel title="Coordinaciones aeroportuarias" summary={summary}>
    {() => <CoordinationDetails {...{ path, data, error, reload, current, canManage, msg }} />}
  </PlanningPanel>;
}

function CoordinationDetails({ path, data, error, reload, current, canManage, msg }) {
  const [editor, setEditor] = useState(null);
  return <div className="detail-actions">
    <p className="hint">Seguimiento manual de gestiones aeroportuarias. El personal registra las respuestas recibidas de AA2000.</p>
    {error && <p role="alert">{error} <button type="button" onClick={reload}>Reintentar</button></p>}
    {data && <>
      <p>Plan actual: {data.origen || "Origen pendiente"} → {data.destino || "Destino pendiente"} · {data.aeronave || "Aeronave pendiente"} · Salida: {date(data.salida)} · Llegada: {date(data.llegada)}</p>
      {current.length === 0 ? <p>Todavía no se registraron coordinaciones.</p> : <ul className="operational-records">
        {current.map((item) => <li key={item.gestionId}>
          <CoordinationRecord item={item} history={data.versiones.filter((v) => v.gestionId === item.gestionId && !v.actual)}
            onEdit={canManage && data.puedeGestionar && item.estado !== "CANCELADO" && !editor ? () => setEditor({ item }) : null} />
        </li>)}
      </ul>}
      {canManage && data.puedeGestionar && !editor && <button type="button" onClick={() => setEditor({})}>Nueva coordinación</button>}
      {canManage && data.puedeGestionar && editor && <CoordinationEditor path={path} item={editor.item} onCancel={() => setEditor(null)} onSaved={async () => {
        setEditor(null);
        msg(editor.item ? "Cambios de coordinación guardados" : "Coordinación registrada");
        await reload();
      }} />}
      {data.motivo && <p className="hint">{data.motivo}</p>}
    </>}
  </div>;
}

function CoordinationRecord({ item, history, onEdit }) {
  return <>
    <details>
      <summary><strong>{item.aeropuerto || "Aeropuerto sin registrar"} · {item.finalidad || "Finalidad sin registrar"}</strong> · {STATES[item.estado] || item.estado} · {VIGENCY[item.estadoVigencia] || item.estadoVigencia}</summary>
      <CoordinationFacts item={item} />
      {history.length > 0 && <details><summary>Versiones anteriores ({history.length})</summary>{history.map((version) =>
        <article key={version.id}>
          <strong>{STATES[version.estado] || version.estado} · {version.motivoCambio || "Alta"}</strong>
          <CoordinationFacts item={version} />
        </article>)}</details>}
    </details>
    {onEdit && <button type="button" className="secondary-action" onClick={onEdit}>Modificar coordinación</button>}
  </>;
}

function CoordinationFacts({ item }) {
  return <dl className="facts">
    <div><dt>Descripción</dt><dd>{item.descripcion || "—"}</dd></div>
    <div><dt>Observaciones</dt><dd>{item.observaciones || "—"}</dd></div>
    <div><dt>Slot informado</dt><dd>{date(item.fechaSlot)}</dd></div>
    <div><dt>Comunicación</dt><dd>{date(item.fechaComunicacion)} · {item.canal || "—"} · {item.contacto || "—"}</dd></div>
    <div><dt>Respuesta declarada</dt><dd>{date(item.fechaRespuesta)} · {item.fuenteRespuesta || "—"}</dd></div>
    <div><dt>Referencia externa</dt><dd>{item.referenciaExterna || "—"}</dd></div>
    <div><dt>Versión {item.version}</dt><dd>{date(item.fechaCreacion)} · {item.responsable}</dd></div>
  </dl>;
}

function CoordinationEditor({ path, item, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({
    aeropuertoId: item?.aeropuertoId ?? "",
    estado: item?.estado ?? "PENDIENTE",
    motivoCambio: "",
    ...Object.fromEntries(TEXT.map((key) => [key, item?.[key] ?? ""])),
    ...Object.fromEntries(DATES.map((key) => [key, item?.[key]?.slice(0, 16) ?? ""])),
  }));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const fixedAirport = Boolean(item?.aeropuertoId && item?.finalidad);
  const airports = useResource(fixedAirport ? null : `/catalogs/airports?q=${encodeURIComponent(query)}`);
  const choices = Array.isArray(airports.data) ? airports.data : [];
  const hasResponse = ["CONFIRMADO", "RECHAZADO"].includes(form.estado);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const dates = Object.fromEntries(DATES.map((key) => [key, form[key] || null]));
      await api(item ? `${path}/${item.gestionId}` : path, {
        method: item ? "PUT" : "POST",
        body: JSON.stringify({ ...form, ...dates, version: item?.version ?? 0, aeropuertoId: Number(form.aeropuertoId) }),
      });
      await onSaved();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <form data-flight-draft onSubmit={save}>
    <fieldset disabled={busy}>
      <legend>{item ? "Modificar coordinación" : "Registrar coordinación"}</legend>
      {!fixedAirport && <label>Buscar aeropuerto de coordinación<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>}
      {airports.error && <p role="alert">{airports.error} <button type="button" onClick={airports.reload}>Reintentar búsqueda</button></p>}
      <label>Aeropuerto de coordinación<select required value={form.aeropuertoId} disabled={fixedAirport} onChange={set("aeropuertoId")}>
        <option value="">{airports.loading ? "Consultando…" : "Seleccionar"}</option>
        {form.aeropuertoId && !choices.some((airport) => airport.id === Number(form.aeropuertoId)) && <option value={form.aeropuertoId}>{item?.aeropuerto || "Aeropuerto seleccionado"}</option>}
        {choices.map((airport) => <option key={airport.id} value={airport.id}>{airport.nombre}</option>)}
      </select></label>
      <label>Finalidad de coordinación<input required maxLength={200} disabled={fixedAirport} value={form.finalidad} onChange={set("finalidad")} /></label>
      <label>Descripción de la gestión<textarea required maxLength={4000} value={form.descripcion} onChange={set("descripcion")} /></label>
      {item && <label>Estado de seguimiento<select value={form.estado} onChange={(e) => {
        const estado = e.target.value;
        const response = ["CONFIRMADO", "RECHAZADO"].includes(estado);
        setForm({ ...form, estado, fechaRespuesta: response ? form.fechaRespuesta : "", fuenteRespuesta: response ? form.fuenteRespuesta : "" });
      }}>{[item.estado, ...(NEXT[item.estado] || [])].map((state) => <option key={state} value={state}>{STATES[state] || state}</option>)}</select></label>}
      <label>Fecha y hora del slot informado<input type="datetime-local" value={form.fechaSlot} onChange={set("fechaSlot")} /></label>
      <label>Contacto de coordinación<input maxLength={150} value={form.contacto} onChange={set("contacto")} /></label>
      <label>Canal de comunicación<input maxLength={100} value={form.canal} onChange={set("canal")} /></label>
      <label>Fecha y hora de comunicación<input type="datetime-local" value={form.fechaComunicacion} onChange={set("fechaComunicacion")} /></label>
      {hasResponse && <>
        <label>Fecha y hora de respuesta<input type="datetime-local" required value={form.fechaRespuesta} onChange={set("fechaRespuesta")} /></label>
        <label>Fuente de la respuesta<input required maxLength={250} value={form.fuenteRespuesta} onChange={set("fuenteRespuesta")} /></label>
      </>}
      <label>Referencia externa proporcionada<input maxLength={250} value={form.referenciaExterna} onChange={set("referenciaExterna")} /></label>
      <label>Observaciones de coordinación<textarea maxLength={4000} value={form.observaciones} onChange={set("observaciones")} /></label>
      {item && <label>Motivo del cambio<textarea required maxLength={1000} value={form.motivoCambio} onChange={set("motivoCambio")} /></label>}
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button disabled={!form.aeropuertoId || !form.finalidad.trim() || !form.descripcion.trim() || (item && !form.motivoCambio.trim())}>{busy ? "Guardando…" : item ? "Guardar cambios" : "Guardar coordinación"}</button>
        <button type="button" className="secondary-action" onClick={onCancel}>Cancelar</button>
      </div>
    </fieldset>
  </form>;
}
