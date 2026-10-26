import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { DniRectification, dniProblem, dniDigits } from "./dniRectification";
export { dniProblem, dniDigits };

/** Deliberate search: no patient identities are downloaded when the page opens. */
export function PatientSearch({ onSelect, onReset = () => {}, selectedId, refreshToken = 0, actionLabel = "Seleccionar" }) {
  const [dni, setDni] = useState(""), [nombre, setNombre] = useState(""), [apellido, setApellido] = useState("");
  const [criteria, setCriteria] = useState(null), [result, setResult] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const sequence = useRef(0), busy = useRef(false);
  const invalidate = () => { sequence.current += 1; setCriteria(null); setResult(null); setError(""); setLoading(false); busy.current = false; onReset(); };
  const run = async (next, page) => {
    if (busy.current) return;
    const number = ++sequence.current;
    busy.current = true; setLoading(true); setError(""); setResult(null);
    const query = new URLSearchParams({ page: String(page), size: "10" });
    if (next.dni) query.set("dni", next.dni);
    else { query.set("nombre", next.nombre); query.set("apellido", next.apellido); }
    try { const response = await api(`/patients/search?${query}`); if (number === sequence.current) setResult(response); }
    catch (failure) { if (number === sequence.current) setError(failure.message || "No se pudo buscar pacientes"); }
    finally { if (number === sequence.current) { busy.current = false; setLoading(false); } }
  };
  const submit = () => {
    const next = { dni: dni.trim(), nombre: nombre.trim(), apellido: apellido.trim() };
    if (next.dni ? next.nombre || next.apellido : next.nombre.length < 2 || next.apellido.length < 2) { setError("Ingrese un DNI exacto o nombre y apellido (mínimo dos letras cada uno)."); return; }
    onReset(); setCriteria(next); run(next, 0);
  };
  useEffect(() => { if (criteria) run(criteria, 0); }, [refreshToken]); // refresh only after a confirmed correction
  return <div className="wide patient-search">
    <div className="grid-form patient-search-form">
      <label>DNI exacto<input value={dni} inputMode="numeric" onChange={e => { setDni(e.target.value); invalidate(); }} /></label>
      <label>Nombre<input value={nombre} onChange={e => { setNombre(e.target.value); invalidate(); }} /></label>
      <label>Apellido<input value={apellido} onChange={e => { setApellido(e.target.value); invalidate(); }} /></label>
      <button type="button" onClick={submit} disabled={loading}>Buscar paciente</button>
    </div>
    <p className="hint">Use el DNI completo o nombre y apellido. La búsqueda no muestra cuentas ni antecedentes médicos.</p>
    {loading && <p role="status">Buscando pacientes…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {result && <>
      {result.items.length ? <ul className="patient-results">{result.items.map(patient => <li key={patient.id}>
        <span>{patient.nombre} {patient.apellido}{patient.dniTerminacion ? ` · DNI ${patient.dniTerminacion}` : ""}{patient.anioNacimiento ? ` · ${patient.anioNacimiento}` : ""}</span>
        <button type="button" className={selectedId === patient.id ? "secondary-action" : ""} onClick={() => onSelect(patient)}>{selectedId === patient.id ? "Seleccionado" : actionLabel}</button>
      </li>)}</ul> : <p className="empty">No se encontraron pacientes con esos datos.</p>}
      <div className="form-actions"><button type="button" className="secondary-action" disabled={loading || result.page === 0} onClick={() => run(criteria, result.page - 1)}>Anterior</button><span>Página {result.page + 1}</span><button type="button" className="secondary-action" disabled={loading || !result.hasNext} onClick={() => run(criteria, result.page + 1)}>Siguiente</button></div>
    </>}
  </div>;
}

export function PatientMaintenance({ notify = () => {} }) {
  const [selected, setSelected] = useState(null), [detail, setDetail] = useState(null), [history, setHistory] = useState(null);
  const [form, setForm] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [refreshToken, setRefreshToken] = useState(0);
  const sequence = useRef(0);
  const load = async (patient) => {
    const number = ++sequence.current; setSelected(patient); setDetail(null); setHistory(null); setForm(null); setError(""); setLoading(true);
    try {
      const [identity, events] = await Promise.all([api(`/patients/${patient.id}`), api(`/patients/${patient.id}/corrections?page=0&size=10`)]);
      if (number !== sequence.current) return;
      setDetail(identity); setHistory(events); setForm({ nombre: identity.nombre, apellido: identity.apellido, fechaNacimiento: identity.fechaNacimiento || "", motivo: "" });
    } catch (failure) { if (number === sequence.current) setError(failure.message || "No se pudo cargar la ficha"); }
    finally { if (number === sequence.current) setLoading(false); }
  };
  const save = async (event) => {
    event.preventDefault(); if (!detail || saving) return;
    setSaving(true); setError("");
    try {
      const updated = await api(`/patients/${detail.id}/identity`, { method: "PUT", body: JSON.stringify({ ...form, fechaNacimiento: form.fechaNacimiento || null, version: detail.version }) });
      const next = { ...selected, nombre: updated.nombre, apellido: updated.apellido, anioNacimiento: updated.fechaNacimiento ? Number(updated.fechaNacimiento.slice(0, 4)) : null };
      setSelected(next); setDetail(updated); setForm({ nombre: updated.nombre, apellido: updated.apellido, fechaNacimiento: updated.fechaNacimiento || "", motivo: "" });
      setHistory(await api(`/patients/${updated.id}/corrections?page=0&size=10`)); setRefreshToken(value => value + 1); notify("Identidad corregida");
    } catch (failure) { setError(failure.message || "No se pudo corregir la identidad"); }
    finally { setSaving(false); }
  };
  return <section className="card"><h2>Identidad de pacientes</h2>
    <p className="hint">Corrección administrativa de nombre, apellido y fecha de nacimiento, y rectificación controlada del DNI. Los datos de cada vuelo no se modifican desde aquí.</p>
    <PatientSearch onSelect={load} onReset={() => { sequence.current += 1; setSelected(null); setDetail(null); setHistory(null); setForm(null); setError(""); }} selectedId={selected?.id} refreshToken={refreshToken} actionLabel="Revisar ficha" />
    {loading && <p role="status">Cargando ficha…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {detail && form && <div className="patient-maintenance">
      <h3>{detail.nombre} {detail.apellido}</h3><p>DNI: {detail.dni || "No registrado"}{detail.cuentaEstado && <> · Tiene cuenta de usuario ({detail.cuentaEstado.replaceAll("_", " ").toLowerCase()})</>}</p>
      <DniRectification key={detail.id} path={`/patients/${detail.id}/dni`} current={{ dni: detail.dni, version: detail.version, cuentaEstado: detail.cuentaEstado }} scope={detail.cuentaEstado ? "ficha de paciente y cuenta de usuario" : "ficha de paciente"} notify={notify}
        onReload={() => load(selected)} onChanged={async (updated) => {
          setDetail(updated); setSelected({ ...selected, dniTerminacion: "••••" + String(updated.dni).slice(-4) });
          setHistory(await api(`/patients/${updated.id}/corrections?page=0&size=10`)); setRefreshToken(value => value + 1);
        }} />
      <form className="grid-form" onSubmit={save}>
        <label>Nombre corregido<input required maxLength={100} value={form.nombre} onChange={event => setForm({ ...form, nombre: event.target.value })} /></label>
        <label>Apellido corregido<input required maxLength={100} value={form.apellido} onChange={event => setForm({ ...form, apellido: event.target.value })} /></label>
        <label>Fecha de nacimiento corregida<input type="date" value={form.fechaNacimiento} onChange={event => setForm({ ...form, fechaNacimiento: event.target.value })} /></label>
        <label className="wide">Motivo de la corrección<textarea required minLength={10} maxLength={500} value={form.motivo} onChange={event => setForm({ ...form, motivo: event.target.value })} /></label>
        <button disabled={saving}>{saving ? "Guardando…" : "Guardar corrección"}</button>
      </form>
      <h3>Correcciones anteriores</h3>
      {history?.items?.length ? <ul>{history.items.map(entry => <li key={entry.id}><strong>{entry.responsable}</strong> · {new Date(entry.fecha).toLocaleString("es-AR")} · {entry.operacion === "RECTIFY_DNI" ? "Rectificación de DNI · " : entry.operacion === "ASSIGN_DNI" ? "Asignación de DNI · " : ""}{entry.motivo}<ul>{entry.cambios.map(change => <li key={change.campo}>{change.campo}: {change.anterior ?? "—"} → {change.nuevo ?? "—"}</li>)}</ul></li>)}</ul> : <p>Sin correcciones registradas.</p>}
    </div>}
  </section>;
}
