import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Personal sanitario (médicos y enfermeros) del DTS. Son registros administrativos: NO son usuarios (sin cuenta, contraseña, rol ni panel) y la matrícula es un dato
 * declarado que la aplicación no verifica. El servidor es la autoridad: sólo el DTS que los registró los ve o modifica, y sólo el DTS solicitante los asigna a su vuelo,
 * con el horario acordado y antes del inicio. Esta pantalla únicamente pide pocos datos y muestra lo que el servidor responde.
 */
const TYPE_LABEL = Object.freeze({ MEDICO: "Médico/a", ENFERMERO: "Enfermero/a" });
const civil = (value) => (value ? String(value).replace("T", " ").slice(0, 16) : "—");
const emptyForm = () => ({ nombre: "", apellido: "", dni: "", matricula: "", tipoProfesional: "MEDICO" });

/** Catálogo del DTS: tabla de profesionales y un formulario breve para registrar o editar. */
export function HealthStaffCatalog({ notify = () => {} }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(""), [form, setForm] = useState(emptyForm), [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [showInactive, setShowInactive] = useState(false);
  const latest = useRef(0);
  const load = async () => {
    const mine = ++latest.current;
    try { const data = await api(`/health-staff?inactivos=${showInactive}`); if (mine !== latest.current) return; if (!Array.isArray(data)) throw new Error("Respuesta de personal sanitario inválida"); setRows(data); setError(""); }
    catch (e) { if (mine === latest.current) { setRows(null); setError(e.message); } }
  };
  useEffect(() => { load(); }, [showInactive]);
  const reset = () => { setForm(emptyForm()); setEditing(null); };
  const edit = (row) => { setEditing(row); setForm({ nombre: row.nombre, apellido: row.apellido, dni: row.dni || "", matricula: row.matricula, tipoProfesional: row.tipoProfesional }); setError(""); };
  const submit = async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      if (editing) await api(`/health-staff/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...form, version: editing.version }) });
      else await api("/health-staff", { method: "POST", body: JSON.stringify(form) });
      notify(editing ? "Profesional actualizado" : "Profesional registrado"); reset(); await load();
    } catch (e) { await load(); setError(e.message); } finally { setBusy(false); }
  };
  const toggle = async (row) => {
    if (busy) return;
    if (row.activo && window.confirm?.(`¿Desactivar a ${row.nombre} ${row.apellido}? Dejará de ofrecerse para nuevos vuelos; su participación anterior se conserva.`) === false) return;
    setBusy(true); setError("");
    try { await api(`/health-staff/${row.id}/active`, { method: "POST", body: JSON.stringify({ activo: !row.activo, version: row.version }) }); notify(row.activo ? "Profesional desactivado" : "Profesional reactivado"); await load(); }
    catch (e) { await load(); setError(e.message); } finally { setBusy(false); }
  };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return <section className="card" aria-labelledby="health-staff-title">
    <p className="eyebrow">PERSONAL SANITARIO</p><h2 id="health-staff-title">Médicos y enfermeros</h2>
    <p className="hint">Registre a los profesionales que puede enviar en sus traslados. No necesitan usuario ni contraseña: usted los asigna a cada vuelo confirmado. La matrícula es un dato declarado y la aplicación no la verifica.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <form className="grid-form" onSubmit={submit} aria-label={editing ? "Editar profesional" : "Registrar profesional"}>
      <label>Tipo de profesional<select value={form.tipoProfesional} onChange={set("tipoProfesional")} disabled={busy}><option value="MEDICO">Médico/a</option><option value="ENFERMERO">Enfermero/a</option></select></label>
      <label>Nombre<input required maxLength={100} value={form.nombre} onChange={set("nombre")} disabled={busy}/></label>
      <label>Apellido<input required maxLength={100} value={form.apellido} onChange={set("apellido")} disabled={busy}/></label>
      <label>DNI<input required inputMode="numeric" maxLength={20} value={form.dni} onChange={set("dni")} disabled={busy}/></label>
      <label>Matrícula profesional<input required maxLength={50} value={form.matricula} onChange={set("matricula")} disabled={busy}/></label>
      <div className="form-actions"><button disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Registrar profesional"}</button>{editing && <button type="button" className="secondary-action" onClick={reset} disabled={busy}>Cancelar edición</button>}</div>
    </form>
    <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}/> Mostrar también los desactivados</label>
    {rows === null ? !error && <p>Cargando personal sanitario…</p> : rows.length === 0 ? <p className="hint">Todavía no registró personal sanitario.</p> :
      <table aria-label="Personal sanitario registrado"><thead><tr><th>Apellido y nombre</th><th>Tipo</th><th>DNI</th><th>Matrícula</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td>{row.apellido}, {row.nombre}</td><td>{TYPE_LABEL[row.tipoProfesional] || row.tipoProfesional}</td><td>{row.dni}</td><td>{row.matricula}</td>
          <td>{row.activo ? "Activo" : `Desactivado el ${civil(row.desactivadoEn)}`}{row.vuelosVigentes > 0 ? ` · en ${row.vuelosVigentes} vuelo(s) abierto(s)` : ""}</td>
          <td><button type="button" className="secondary-action" disabled={busy} onClick={() => edit(row)}>Editar</button> <button type="button" className="secondary-action" disabled={busy} onClick={() => toggle(row)}>{row.activo ? "Desactivar" : "Reactivar"}</button></td></tr>)}</tbody></table>}
  </section>;
}

/**
 * Personal sanitario de un vuelo. {@code mode="dts"}: el DTS solicitante elige entre sus profesionales activos (agregar, retirar, sustituir) mientras el servidor lo permita;
 * cualquier otro modo (Centro de Operaciones, comandante principal) lo ve sin poder modificarlo. El servidor decide si el vuelo admite cambios (horario acordado, sin iniciar).
 */
export function FlightHealthStaff({ flightId, mode = "read", state, msg = () => {} }) {
  const [rows, setRows] = useState(null), [history, setHistory] = useState(null), [showHistory, setShowHistory] = useState(false), [candidates, setCandidates] = useState(null), [error, setError] = useState(""), [pick, setPick] = useState(""), [replace, setReplace] = useState(""), [busy, setBusy] = useState(false);
  const latest = useRef(0), dts = mode === "dts";
  const editable = dts && ["APROBADO", "PLANIFICADO", "PENDIENTE_REPLANIFICACION"].includes(state);
  const load = async (quiet = false) => {
    const mine = ++latest.current;
    try {
      const data = await api(`/flights/${flightId}/health-staff`); if (mine !== latest.current) return; if (!Array.isArray(data)) throw new Error("Respuesta de personal sanitario inválida"); setRows(data); setError("");
      if (editable) { const list = await api(`/flights/${flightId}/health-staff/candidates`); if (mine === latest.current) setCandidates(Array.isArray(list) ? list : []); }
    } catch (e) { if (mine !== latest.current || quiet) return; setRows(null); setError(e.message); }
  };
  const loadHistory = async () => { try { const data = await api(`/flights/${flightId}/health-staff?history=true`); setHistory(Array.isArray(data) ? data : []); } catch (e) { setHistory(null); setError(e.message); } };
  useEffect(() => { setRows(null); setCandidates(null); setPick(""); setReplace(""); setShowHistory(false); setHistory(null); load(); }, [flightId, state]);
  const refresh = async () => { await load(); if (showHistory) await loadHistory(); };
  const save = async () => {
    if (busy || !pick) return; setBusy(true); setError("");
    try {
      await api(`/flights/${flightId}/health-staff${replace ? `/${replace}` : ""}`, { method: replace ? "PUT" : "POST", body: JSON.stringify({ personalSanitarioId: Number(pick) }) });
      setPick(""); setReplace(""); msg(replace ? "Profesional sustituido" : "Profesional asignado al vuelo"); await refresh();
    } catch (e) { msg(e.message, true); await refresh(); setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (row) => {
    if (busy) return;
    if (window.confirm?.(`¿Retirar a ${row.nombre} ${row.apellido} del vuelo? El registro queda en el historial.`) === false) return;
    setBusy(true); setError("");
    try { await api(`/flights/${flightId}/health-staff/${row.id}`, { method: "DELETE" }); msg("Profesional retirado del vuelo"); await refresh(); }
    catch (e) { msg(e.message, true); await refresh(); setError(e.message); } finally { setBusy(false); }
  };
  const toggleHistory = async () => { if (showHistory) { setShowHistory(false); return; } setShowHistory(true); await loadHistory(); };
  const available = (candidates || []).filter((c) => c.disponible), unavailable = (candidates || []).filter((c) => !c.disponible);
  const removed = (history || []).filter((r) => !r.vigente);
  return <section className="wide" aria-label="Personal sanitario del vuelo">
    <h4>Personal sanitario del vuelo</h4>
    {error && <p role="alert" className="error">{error}</p>}
    {rows === null ? !error && <p>Cargando personal sanitario…</p> : rows.length === 0 ? <p className="hint">{dts ? "Todavía no asignó personal sanitario a este vuelo." : "El DTS todavía no asignó personal sanitario a este vuelo."}</p> :
      rows.map((row) => <p key={row.id}><strong>{row.nombre} {row.apellido}</strong> · {TYPE_LABEL[row.tipoProfesional] || row.tipoProfesional} · matrícula {row.matricula}
        {editable && <> <button type="button" className="secondary-action" disabled={busy} onClick={() => remove(row)}>Retirar</button> <button type="button" className="secondary-action" disabled={busy} onClick={() => setReplace(String(row.id))}>Sustituir</button></>}</p>)}
    {rows !== null && <button type="button" className="link-button" onClick={toggleHistory}>{showHistory ? "Ocultar historial del personal sanitario" : "Ver historial del personal sanitario"}</button>}
    {showHistory && (history === null ? <p>Cargando historial…</p> : removed.length === 0 ? <p className="hint">Sin retiros ni sustituciones registrados.</p> :
      <ul aria-label="Historial del personal sanitario">{removed.map((r) => <li key={r.id}>{r.nombre} {r.apellido} · {TYPE_LABEL[r.tipoProfesional] || r.tipoProfesional} — {r.motivoBaja === "REEMPLAZO" ? "sustituido" : "retirado"} por {r.bajaPor || "—"} el {civil(r.fechaBaja)} (asignado por {r.asignadoPor || "—"} el {civil(r.asignadoEn)})</li>)}</ul>)}
    {editable && candidates !== null && <div className="detail-actions">
      <p>{replace ? "Seleccione el profesional que lo sustituirá." : "Seleccione a quién enviará en este traslado."}</p>
      <label>Profesional<select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}><option value="">Seleccionar</option>{available.map((c) => <option key={c.id} value={c.id}>{c.apellido}, {c.nombre} — {TYPE_LABEL[c.tipoProfesional] || c.tipoProfesional} ({c.matricula})</option>)}</select></label>
      {available.length === 0 && <p className="hint">No tiene profesionales disponibles. Registre más personal en «Personal sanitario».</p>}
      {unavailable.length > 0 && <details><summary>No disponibles en este horario ({unavailable.length})</summary><ul>{unavailable.map((c) => <li key={c.id}>{c.apellido}, {c.nombre}: {c.motivoNoDisponible}</li>)}</ul></details>}
      <button type="button" disabled={!pick || busy} onClick={save}>{busy ? "Guardando…" : replace ? "Confirmar sustitución" : "Asignar al vuelo"}</button>
      {replace && <button type="button" className="secondary-action" onClick={() => setReplace("")}>Cancelar sustitución</button>}
    </div>}
    {dts && !editable && <p className="hint">El personal sanitario se asigna cuando el horario está acordado y hasta que el vuelo inicia.</p>}
  </section>;
}
