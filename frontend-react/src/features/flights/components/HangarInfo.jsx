import React, { useState } from "react";
import { api } from "../../../services/api";
import { dt } from "../../../utils/format";
import { useResource } from "../../../hooks/useResource";
import { PlanningPanel, readStatus } from "./PlanningPanel";

const STATE = {
  SIN_REGISTRO: "Sin registrar",
  REQUIERE_REVISION: "Requiere revisión",
  NO_REQUERIDO: "Hangar no requerido",
  PREPARACION_COMPLETA: "Preparación completa",
  PREPARACION_PENDIENTE: "Preparación pendiente",
};

const currentVersion = (data) => data.versiones.find((version) => version.actual);
const hangarRequired = (version) => version.requiereHangar == null ? "Sin indicar" : version.requiereHangar ? "Sí" : "No";
const preparation = (version) => !version.requiereHangar ? "—" : version.preparacionCompleta ? "Completa" : "Pendiente";

function HangarEditor({ path, current, observing, canComplete, onCancel, onSaved }) {
  const [form, setForm] = useState({
    requiereHangar: current?.requiereHangar ?? true,
    preparacionCompleta: current?.preparacionCompleta ?? false,
    observaciones: (observing ? current?.observacionesComandante : current?.observaciones) ?? "",
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async (event) => {
    event.preventDefault();
    if (busy || (!observing && !canComplete && form.preparacionCompleta)) return;
    setBusy(true);
    setError("");
    try {
      const body = observing ? { observaciones: form.observaciones } : form;
      const saved = await api(path + (observing ? "/commander-observation" : ""), {
        method: "PUT", body: JSON.stringify({ version: current?.version ?? 0, ...body }),
      });
      onSaved(saved);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <form data-flight-draft onSubmit={save}>
    <fieldset disabled={busy}>
      <legend>{observing ? "Observación del comandante" : current ? "Modificar información de hangar" : "Registrar información de hangar"}</legend>
      {!observing && <>
        <label>¿Requiere hangar?<select value={String(form.requiereHangar)} onChange={(e) => setForm({ ...form, requiereHangar: e.target.value === "true", preparacionCompleta: false })}><option value="true">Sí</option><option value="false">No</option></select></label>
        {form.requiereHangar && <label>Preparación terrestre<select value={String(form.preparacionCompleta)} onChange={(e) => setForm({ ...form, preparacionCompleta: e.target.value === "true" })}><option value="false">Pendiente</option><option value="true" disabled={!canComplete}>Completa</option></select></label>}
      </>}
      <label>{observing ? "Observación" : "Observaciones de Operaciones"}<textarea maxLength={4000} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></label>
      {!observing && !canComplete && <p className="hint">La preparación de salida sólo puede marcarse completa antes de iniciar el vuelo.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button disabled={observing ? !form.observaciones.trim() : !canComplete && form.preparacionCompleta}>{busy ? "Guardando…" : observing ? "Guardar observación" : current ? "Guardar cambios" : "Guardar información"}</button>
        <button type="button" className="secondary-action" onClick={onCancel}>Cancelar</button>
      </div>
    </fieldset>
  </form>;
}

export function HangarInfo({ flightId, revision, canComplete = true, canManage = true, canObserve = true, msg = () => {} }) {
  const path = `/flights/${flightId}/hangar`;
  const resource = useResource(path, { revision, map: (result) => {
    if (typeof result?.estado !== "string" || !Array.isArray(result.versiones)) throw Error("Respuesta de hangar inválida");
    return result;
  } });
  const { data, error, reload, setData } = resource;
  const current = data && currentVersion(data);
  const summary = readStatus(resource, (result) => STATE[result.estado] || result.estado);
  return <PlanningPanel title="Hangar y preparación terrestre" summary={summary}>
    {() => <HangarDetails {...{ path, data, error, reload, current, canComplete, canManage, canObserve }} onSaved={(saved) => {
      setData(saved);
      msg("Información de hangar guardada");
    }} />}
  </PlanningPanel>;
}

function HangarDetails({ path, data, error, reload, current, canComplete, canManage, canObserve, onSaved }) {
  const [mode, setMode] = useState(null);
  return <div className="detail-actions">
    <p className="hint">Necesidades de hangar y preparación terrestre de la aeronave para la salida.</p>
    {error && <p role="alert">{error} <button type="button" onClick={reload}>Reintentar</button></p>}
    {data && <>
      <p>Aeronave asignada: {data.aeronave || "Sin asignar"} · Origen planificado: {data.origenPlanificado || "Sin definir"} · Última ubicación confirmada: {data.ubicacionConfirmada || "Sin definir"}</p>
      {data.estado === "REQUIERE_REVISION" && <p role="status">Operaciones debe revisar la información por cambio de contexto o por datos anteriores.</p>}
      {current ? <>
        <dl className="facts">
          <div><dt>Requiere hangar</dt><dd>{hangarRequired(current)}</dd></div>
          <div><dt>Preparación terrestre</dt><dd>{preparation(current)}</dd></div>
          <div><dt>Observaciones de Operaciones</dt><dd>{current.observaciones || "—"}</dd></div>
          <div><dt>Observaciones del comandante</dt><dd>{current.observacionesComandante || "—"}</dd></div>
          <div><dt>Última versión</dt><dd>{current.version} · {dt(current.fechaCreacion)} · {current.responsable}</dd></div>
        </dl>
      </> : <p>Todavía no se registró información sobre la preparación terrestre.</p>}
      {data.versiones.some((v) => !v.actual) && <details><summary>Versiones anteriores</summary>{data.versiones.filter((v) => !v.actual).map((v) =>
        <p key={v.id}>Versión {v.version} · {v.responsable} · {dt(v.fechaCreacion)} · Hangar: {hangarRequired(v)} · Preparación: {preparation(v)} · Operaciones: {v.observaciones || "—"} · Comandante: {v.observacionesComandante || "—"}</p>)}</details>}
      {!mode && <div className="form-actions">
        {canManage && data.puedeGestionar && <button type="button" onClick={() => setMode("manage")}>{current ? "Modificar información" : "Registrar información"}</button>}
        {canObserve && data.puedeObservar && <button type="button" onClick={() => setMode("observe")}>{current?.observacionesComandante ? "Actualizar observación" : "Registrar observación"}</button>}
      </div>}
      {((mode === "manage" && canManage && data.puedeGestionar) || (mode === "observe" && canObserve && data.puedeObservar)) && <HangarEditor path={path} current={current} canComplete={canComplete} observing={mode === "observe"} onCancel={() => setMode(null)} onSaved={(saved) => {
        setMode(null);
        onSaved(saved);
      }} />}
      {data.motivo && <p className="hint">{data.motivo}</p>}
    </>}
  </div>;
}
