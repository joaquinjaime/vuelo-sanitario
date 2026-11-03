import React, { useState } from "react";
import { api } from "../../../services/api";
import { useResource } from "../../../hooks/useResource";
import { dt } from "../../../utils/format";
import { PlanningPanel, readStatus } from "./PlanningPanel";

const EMPTY = { condiciones: "", favorable: true, observaciones: "" };

export function WeatherLog({ flightId, canRecord = false, msg = () => {} }) {
  const path = `/flights/${flightId}/weather`;
  const resource = useResource(path, { map: (rows) => {
    if (!Array.isArray(rows)) throw Error("Respuesta de historial inválida");
    return rows;
  } });
  const { data, error, reload } = resource;
  const summary = readStatus(resource, (rows) => rows.length ? `${rows.length} ${rows.length === 1 ? "registro" : "registros"}` : "Sin registros");
  return <PlanningPanel title="Condiciones meteorológicas" summary={summary}>
    {() => <div className="detail-actions">
      <p className="hint">Condiciones registradas por el comandante durante la preparación del vuelo.</p>
      {error && <p role="alert">{error} <button type="button" onClick={reload}>Reintentar</button></p>}
      {data && <>
        <h4>Historial meteorológico</h4>
        {data.length === 0 ? <p>Sin registros meteorológicos.</p> : <ul className="operational-records">{data.map((row) => <li key={row.id}>
          <strong>{dt(row.fechaRegistro)} · {row.favorable == null ? "Sin indicación" : row.favorable ? "Favorable" : "No favorable"}</strong> · {row.registradoPor}
          <p>{row.condiciones}</p>{row.observaciones && <p>{row.observaciones}</p>}
        </li>)}</ul>}
        {canRecord && <WeatherEditor path={path} onSaved={async () => { msg("Condiciones meteorológicas registradas"); await reload(); }} />}
      </>}
    </div>}
  </PlanningPanel>;
}

function WeatherEditor({ path, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const close = () => { setOpen(false); setForm(EMPTY); setError(""); };
  const save = async (event) => {
    event.preventDefault();
    if (busy || !form.condiciones.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "POST", body: JSON.stringify(form) });
      close();
      await onSaved();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)}>Registrar clima</button>;
  return <form data-flight-draft onSubmit={save}>
    <fieldset disabled={busy}>
      <legend>Registrar condiciones meteorológicas</legend>
      <label>Condiciones<textarea required value={form.condiciones} onChange={(e) => setForm({ ...form, condiciones: e.target.value })} /></label>
      <label>¿Condiciones favorables?<select value={String(form.favorable)} onChange={(e) => setForm({ ...form, favorable: e.target.value === "true" })}><option value="true">Sí</option><option value="false">No</option></select></label>
      <label>Observaciones<textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button disabled={!form.condiciones.trim()}>{busy ? "Guardando…" : "Guardar registro meteorológico"}</button>
        <button type="button" className="secondary-action" onClick={close}>Cancelar</button>
      </div>
    </fieldset>
  </form>;
}
