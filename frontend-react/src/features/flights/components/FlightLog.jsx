import React, { useState } from "react";
import { api } from "../../../services/api";
import { useResource } from "../../../hooks/useResource";
import { dt } from "../../../utils/format";

const TYPES = {
  PREPARACION: "Preparación", DEMORA: "Demora", INCIDENCIA: "Incidencia", METEOROLOGIA: "Meteorología",
  AERONAVE: "Aeronave", EJECUCION: "Ejecución", CIERRE: "Cierre", OTRO: "Otro",
};

export function FlightLog({ flightId, revision = 0, allowWrite = true, msg = () => {} }) {
  return <FlightLogHistory key={`${flightId}-${revision}`} {...{ flightId, allowWrite, msg }} />;
}

function FlightLogHistory({ flightId, allowWrite, msg }) {
  const path = `/flights/${flightId}/log`;
  const [page, setPage] = useState(0), [editor, setEditor] = useState(null);
  const { data, loading, error, reload } = useResource(`${path}?page=${page}`, { map: (result) => {
    if (!Array.isArray(result?.entradas)) throw Error("Respuesta de bitácora inválida");
    return result;
  } });
  const canWrite = allowWrite && data?.puedeRegistrar;
  return <section className="wide detail-actions">
    <h4>Bitácora operativa</h4>
    <p className="hint">Acontecimientos del vuelo, del más reciente al más antiguo. Las horas corresponden a la zona del navegador.</p>
    {error && <p role="alert">{error} <button type="button" onClick={reload}>Reintentar</button></p>}
    {loading && <p role="status">Cargando bitácora…</p>}
    {!loading && data && <>
      {data.entradas.length === 0 ? <p>Sin acontecimientos operativos.</p> : <ol className="operational-records">
        {data.entradas.map((entry) => <li key={entry.id}>
          <strong>{TYPES[entry.tipo] || entry.tipo.replaceAll("_", " ")} · {entry.origen === "AUTOMATICO" ? "Automático" : "Manual"}{entry.importancia === "IMPORTANTE" ? " · Importante" : ""}</strong>
          <p>{entry.descripcion}</p>
          <p className="hint">Ocurrió: {dt(entry.ocurrido)} · Registrado: {dt(entry.registrado)} · {entry.responsable}</p>
          {entry.correccionDe && <p>Corrección de #{entry.correccionDe}: {entry.motivoCorreccion}</p>}
          {canWrite && <button type="button" className="secondary-action" disabled={Boolean(editor)} onClick={() => setEditor({ target: entry })}>Corregir #{entry.id}</button>}
        </li>)}
      </ol>}
      {(page > 0 || data.hayMas) && <div className="form-actions">
        <button type="button" disabled={page === 0 || Boolean(editor)} onClick={() => setPage(page - 1)}>Más recientes</button>
        <span>Página {page + 1}</span>
        <button type="button" disabled={!data.hayMas || Boolean(editor)} onClick={() => setPage(page + 1)}>Más antiguos</button>
      </div>}
      {canWrite && !editor && <button type="button" onClick={() => setEditor({})}>Nuevo acontecimiento</button>}
      {canWrite && editor && <FlightLogEditor path={path} target={editor.target} onCancel={() => setEditor(null)} onSaved={async () => {
        setEditor(null);
        msg(editor.target ? "Corrección registrada" : "Novedad registrada");
        if (page === 0) await reload();
        else setPage(0);
      }} />}
      {allowWrite && data.motivo && <p className="hint">{data.motivo}</p>}
    </>}
  </section>;
}

function FlightLogEditor({ path, target, onCancel, onSaved }) {
  const [form, setForm] = useState({
    tipo: target ? (TYPES[target.tipo] ? target.tipo : "OTRO") : "PREPARACION",
    descripcion: target?.descripcion || "", ocurrido: "", importancia: target?.importancia || "NORMAL", motivoCorreccion: "",
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  const ready = form.descripcion.trim() && form.ocurrido && (!target || form.motivoCorreccion.trim());
  const save = async (event) => {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const occurred = new Date(form.ocurrido);
      if (Number.isNaN(occurred.getTime())) throw Error("Fecha y hora inválidas");
      await api(path, { method: "POST", body: JSON.stringify({
        ...form, ocurrido: occurred.toISOString(), correccionDe: target?.id ?? null, motivoCorreccion: target ? form.motivoCorreccion : null,
      }) });
      await onSaved();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <form data-flight-draft onSubmit={save}>
    <fieldset disabled={busy}>
      <legend>{target ? `Registrar corrección de #${target.id}` : "Registrar acontecimiento"}</legend>
      <p className="hint">{target && "La corrección queda vinculada al acontecimiento original. "}Omití diagnósticos y datos clínicos.</p>
      <label>Tipo de acontecimiento<select value={form.tipo} onChange={set("tipo")}>{Object.entries(TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Descripción de la novedad<textarea maxLength={4000} value={form.descripcion} onChange={set("descripcion")} /></label>
      <label>Fecha y hora del acontecimiento<input type="datetime-local" value={form.ocurrido} onChange={set("ocurrido")} /></label>
      <label>Importancia<select value={form.importancia} onChange={set("importancia")}><option value="NORMAL">Normal</option><option value="IMPORTANTE">Importante</option></select></label>
      {target && <label>Motivo de corrección<textarea maxLength={1000} value={form.motivoCorreccion} onChange={set("motivoCorreccion")} /></label>}
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button disabled={!ready}>{busy ? "Guardando…" : target ? "Guardar corrección" : "Registrar novedad"}</button>
        <button type="button" className="secondary-action" onClick={onCancel}>Cancelar</button>
      </div>
    </fieldset>
  </form>;
}
