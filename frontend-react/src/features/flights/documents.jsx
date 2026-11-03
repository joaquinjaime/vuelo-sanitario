import React, { useEffect, useRef, useState } from "react";
import { api, uploadFile, downloadFile } from "../../services/api";

/** Estados de sólo consulta documental: el servidor es la autoridad y rechaza cualquier escritura en ellos. */
export const READ_ONLY_FLIGHT_STATES = ["FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"];
export const documentsEditable = (estado) => !READ_ONLY_FLIGHT_STATES.includes(estado);
/** Código con que el servidor rechaza (409) toda operación documental de un vuelo sanitario cuyo horario todavía no se acordó. */
export const DOCUMENTS_LOCKED_CODE = "DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED";
/** Mientras la documentación está bloqueada se vuelve a consultar al servidor con esta frecuencia, al volver a la pestaña y al recuperar el foco. */
export const GATE_REFRESH_MS = 15000;
const PENDING_TEXT = {
  OPERACIONES: "La solicitud espera la evaluación de Operaciones: deben aceptar el horario solicitado o proponer otro.",
  DTS: "Operaciones propuso otro horario: el DTS solicitante debe aceptarlo o rechazarlo.",
};

// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes ?? 0} B`);
const MAX_TIMER_MS = 2147483647;
/** La API informa la ruta desde la raíz del sitio ("/api/..."), pero `downloadFile` ya antepone la base de la API. */
export const apiRelative = (url) => String(url).replace(/^\/api(?=\/)/, "");

/**
 * Documentación PDF del vuelo (vale para vuelos sanitarios y operativos). El contexto del vuelo determina todas las
 * relaciones: nunca se piden identificadores. Con `canEdit` falso (DTS, vuelo cerrado) es sólo de consulta y descarga.
 * `canViewRetired` habilita la consulta histórica de los documentos dados de baja (Operaciones y comandante; el servidor decide).
 * Qué tipos se ofrecen y quién puede retirar cada documento lo dicen el servidor (`/documents/types`, `puedeRetirar`).
 * El bloqueo temporal lo decide el servidor; aquí sólo se refleja y se vuelve a consultar cuando vence o falla un guardado.
 */
export function FlightDocuments({ flightId, canEdit = false, canViewRetired = false, msg = () => {}, gateRefreshMs = GATE_REFRESH_MS }) {
  // null mientras se consulta; {disponible:false,...} con el horario sin acordar. El servidor es la autoridad: aquí sólo se refleja.
  const [creating, setCreating] = useState(false), [replacing, setReplacing] = useState(false);
  const [gate, setGate] = useState(null);
  const [documents, setDocuments] = useState(null), [types, setTypes] = useState(null), [selected, setSelected] = useState(null), [history, setHistory] = useState(null), [lock, setLock] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [retired, setRetired] = useState(null), [retiring, setRetiring] = useState(false), [reason, setReason] = useState("");
  const [name, setName] = useState(""), [typeCode, setTypeCode] = useState(""), [createFile, setCreateFile] = useState(null), [versionFile, setVersionFile] = useState(null);
  const current = useRef({ selected: null, lock: null, canEdit });
  current.current = { selected, lock, canEdit };
  const choice = useRef(0);

  /** Un rechazo por horario sin acordar (p. ej. la pantalla quedó desactualizada) pasa a la vista bloqueada, sin error engañoso. */
  const lockedBy = (e) => {
    if (e?.code !== DOCUMENTS_LOCKED_CODE) return false;
    setGate({ disponible: false, mensaje: e.error || e.message, estadoSolicitud: e.estadoSolicitud, pendientePor: e.pendientePor });
    setSelected(null); setHistory(null); setLock(null); setError("");
    return true;
  };
  const load = async () => {
    try {
      const rows = await api(`/flights/${flightId}/documents`);
      if (!Array.isArray(rows)) throw Error("Respuesta documental inválida");
      setDocuments(rows); setError("");
      return rows;
    } catch (e) { setDocuments(null); if (lockedBy(e)) return []; setError(e.message); return []; }
  };
  const inspect = async (id) => {
    try { const x = await api(`/documents/${id}/lock`); if (current.current.selected?.id === id) setLock(x); return x; }
    catch (e) { if (!lockedBy(e)) setError(e.message); return null; }
  };
  /** Libera sin esperar respuesta: si falla, el vencimiento del servidor sigue siendo la garantía. */
  const releaseQuietly = () => {
    const { selected: item, lock: held } = current.current;
    if (item && held?.active && held.mine) api(`/documents/${item.id}/lock`, { method: "DELETE" }).catch(() => {});
  };
  const loadRetired = async () => {
    try {
      const rows = await api(`/flights/${flightId}/documents/retired`);
      if (!Array.isArray(rows)) throw Error("Respuesta de documentos retirados inválida");
      setRetired(rows);
    } catch (e) { if (!lockedBy(e)) setError(e.message); }
  };
  const choose = async (item) => {
    if (current.current.selected && current.current.selected.id !== item.id) releaseQuietly();
    const mine = ++choice.current;
    setSelected(item); current.current.selected = item; setHistory(null); setLock(null); setVersionFile(null); setReplacing(false); setRetiring(false); setReason("");
    try {
      const h = await api(`/documents/${item.id}/versions`);
      if (!h || !Array.isArray(h.versiones)) throw Error("Respuesta de versiones inválida");
      if (mine !== choice.current) return;
      setHistory(h);
      if (current.current.canEdit && !item.fechaBaja) await inspect(item.id);
    } catch (e) { if (mine === choice.current && !lockedBy(e)) setError(e.message); }
  };

  /** Consulta si el horario está acordado. Si la consulta falla se continúa: las operaciones reales las rechazará el servidor con el motivo exacto. */
  const checkGate = async () => {
    try {
      const x = await api(`/flights/${flightId}/documents/access`);
      const open = !x || x.disponible !== false;
      setGate(open ? { disponible: true } : x);
      return open;
    } catch { setGate({ disponible: true }); return true; }
  };
  const start = () => {
    load();
    if (canEdit) api(`/flights/${flightId}/documents/types`).then((x) => setTypes(Array.isArray(x) ? x : [])).catch((e) => { setTypes([]); if (!lockedBy(e)) setError(e.message); });
  };
  const startRef = useRef(start); startRef.current = start;
  useEffect(() => {
    let alive = true;
    setCreating(false); setReplacing(false); setName(""); setTypeCode(""); setCreateFile(null); setVersionFile(null);
    setSelected(null); setHistory(null); setLock(null); setDocuments(null); setTypes(null); setError(""); setRetired(null); setRetiring(false); setReason(""); setGate(null); choice.current++;
    checkGate().then((open) => { if (alive && open) startRef.current(); });
    return () => { alive = false; releaseQuietly(); };
  }, [flightId, canEdit]);

  // Con la documentación bloqueada se vuelve a consultar sola: al acordarse el horario se habilita sin cerrar sesión ni recargar.
  const locked = gate?.disponible === false;
  useEffect(() => {
    if (!locked) return undefined;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const open = await checkGate();
      if (alive && open) { setError(""); startRef.current(); }
    };
    const timer = setInterval(tick, gateRefreshMs);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [locked, flightId, gateRefreshMs]);

  // Un bloqueo vence solo: al llegar su hora se consulta de nuevo al servidor (que decide) en lugar de seguir mostrándolo.
  useEffect(() => {
    if (!lock?.active || !lock.expiresAt || !selected) return undefined;
    // El servidor informa cuánto falta (no se compara la hora civil con el reloj del navegador, que puede estar en otra zona).
    const wait = Math.min(Math.max(Number(lock.remainingSeconds) || 0, 0) * 1000 + 1500, MAX_TIMER_MS);
    const id = selected.id;
    const timer = setTimeout(() => { inspect(id); }, wait);
    return () => clearTimeout(timer);
  }, [lock?.expiresAt, lock?.remainingSeconds, lock?.active, selected?.id]);

  const run = async (action) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { if (!lockedBy(e)) { setError(e.message); if (current.current.selected) await inspect(current.current.selected.id); } } finally { setBusy(false); }
  };
  const create = () => {
    if (!createFile || !typeCode || !name.trim()) return;
    return run(async () => {
      const created = await uploadFile(`/flights/${flightId}/documents/pdf`, createFile, { documentTypeCode: typeCode, nombreDocumento: name.trim() });
      setName(""); setTypeCode(""); setCreateFile(null); setCreating(false);
      await load(); await choose(created); msg("Documento registrado");
    });
  };
  const acquire = () => selected && run(async () => { const x = await api(`/documents/${selected.id}/lock`, { method: "POST" }); setLock(x); msg("Bloqueo documental adquirido"); });
  const release = () => selected && run(async () => { await api(`/documents/${selected.id}/lock`, { method: "DELETE" }); await inspect(selected.id); msg("Bloqueo documental liberado"); });
  const addVersion = () => selected && versionFile && run(async () => {
    const updated = await uploadFile(`/documents/${selected.id}/versions/pdf`, versionFile);
    setVersionFile(null); await load(); await choose(updated); msg("Nueva versión documental guardada");
  });
  const retire = () => selected && reason.trim() && run(async () => {
    await api(`/flights/${flightId}/documents/${selected.id}/deactivate`, { method: "POST", body: JSON.stringify({ motivo: reason.trim() }) });
    choice.current++; setSelected(null); setHistory(null); setLock(null); setRetiring(false); setReason("");
    await load(); if (retired !== null) await loadRetired();
    msg("Documento retirado del uso operativo");
  });
  const toggleRetired = () => { if (retired === null) loadRetired(); else setRetired(null); };
  const download = async (version) => {
    try {
      const blob = await downloadFile(apiRelative(version.urlDescarga));
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = version.nombreArchivoOriginal; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  if (locked) return (
    <section className="wide detail-actions documents-locked" aria-labelledby={`documents-locked-${flightId}`}>
      <h4 id={`documents-locked-${flightId}`}>Documentos del vuelo</h4>
      <div className="locked-panel" role="status">
        <strong>Documentación no disponible</strong>
        <p>Para comenzar a gestionar los documentos de este vuelo, primero debe acordarse el horario de salida.</p>
        {PENDING_TEXT[gate.pendientePor] && <p className="hint">{PENDING_TEXT[gate.pendientePor]}</p>}
        <p className="hint">Esta sección se habilitará automáticamente cuando el horario quede acordado.</p>
      </div>
    </section>
  );

  return (
    <section className="wide detail-actions">
      <h4>Documentos del vuelo</h4>
      <p>Los archivos son PDF versionados. La edición requiere un bloqueo temporal del servidor; las versiones anteriores conservan su descarga.</p>
      {!canEdit && <p className="hint">Consulta y descarga: este perfil o el estado del vuelo no permite registrar ni modificar documentos.</p>}
      {error && <p role="alert">{error}</p>}
      {documents === null ? !error && <p>Cargando documentos…</p> : documents.length === 0 ? <p>Sin documentos registrados.</p> : (
        <ul>{documents.map((item) => (
          <li key={item.id}>
            <button type="button" className="secondary-action" onClick={() => choose(item)}>{item.nombreDocumento} · {item.tipoDocumento.nombre} · v{item.versionActual.numeroVersion}</button>
            <small> {dt(item.versionActual.fechaCreacion)}{item.versionActual.creadoPor ? ` · ${item.versionActual.creadoPor}` : ""}</small>
          </li>
        ))}</ul>
      )}
      {canEdit && documents !== null && !creating && <button type="button" onClick={() => setCreating(true)}>Nuevo documento</button>}
      {canEdit && creating && (
        <div className="grid-form" data-flight-draft>
          <h4 className="wide">Registrar documento PDF</h4>
          <label>Tipo documental
            <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)} disabled={types === null}>
              <option value="">{types === null ? "Cargando tipos…" : "Seleccionar"}</option>
              {(types || []).map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
            </select>
          </label>
          <label>Nombre del documento<input maxLength="255" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Archivo PDF<input type="file" accept="application/pdf,.pdf" onChange={(e) => setCreateFile(e.target.files[0] || null)} /></label>
          <button type="button" disabled={busy || !typeCode || !name.trim() || !createFile} onClick={create}>Registrar documento</button>
          <button type="button" className="secondary-action" disabled={busy} onClick={() => { setCreating(false); setName(""); setTypeCode(""); setCreateFile(null); }}>Cancelar</button>
        </div>
      )}
      {canViewRetired && (
        <div className="wide">
          <button type="button" className="secondary-action" onClick={toggleRetired}>{retired === null ? "Ver documentos retirados" : "Ocultar documentos retirados"}</button>
          {retired !== null && (retired.length === 0 ? <p>Sin documentos retirados.</p> : (
            <ul aria-label="Documentos retirados">{retired.map((item) => (
              <li key={item.id}>
                {item.nombreDocumento} · {item.tipoDocumento.nombre} · {item.totalVersiones} {item.totalVersiones === 1 ? "versión" : "versiones"} · retirado por {item.retiradoPor} el {dt(item.fechaBaja)} · Motivo: {item.motivoBaja}{" "}
                <button type="button" className="secondary-action" onClick={() => choose(item)}>Ver historial de {item.nombreDocumento}</button>
              </li>
            ))}</ul>
          ))}
        </div>
      )}
      {selected && (
        <div className="wide">
          <h4>{selected.nombreDocumento}</h4>
          {selected.fechaBaja && <p className="hint">Documento retirado del uso operativo: se conservan sus versiones para consulta.</p>}
          {canEdit && !selected.fechaBaja && <>
            {!lock ? <button type="button" disabled={busy} onClick={() => inspect(selected.id)}>Consultar bloqueo</button>
              : !lock.active ? <><p>Disponible para edición: no hay bloqueo vigente.</p><button type="button" disabled={busy} onClick={acquire}>Adquirir bloqueo</button></>
              : lock.mine ? <><p className="success">Usted posee el bloqueo hasta {dt(lock.expiresAt)}.</p><button type="button" disabled={busy} onClick={acquire}>Renovar bloqueo</button><button type="button" className="secondary-action" disabled={busy} onClick={release}>Liberar bloqueo</button></>
              : <><p className="error">Bloqueado por {lock.ownerUsername} hasta {dt(lock.expiresAt)}.</p><button type="button" disabled={busy} onClick={acquire}>Intentar adquirir bloqueo</button></>}
          </>}
          {canEdit && selected.puedeRetirar && !retiring && <p><button type="button" className="secondary-action" disabled={busy} onClick={() => setRetiring(true)}>Retirar documento</button></p>}
          {canEdit && selected.puedeRetirar && retiring && (
            <fieldset className="wide" data-flight-draft>
              <legend>Retirar documento</legend>
              <p role="note">El documento saldrá del uso operativo y dejará de poder recibir versiones o bloqueos. Sus versiones y archivos se conservan y Operaciones y el comandante podrán consultarlos en «documentos retirados». Esta acción no se puede deshacer.</p>
              <label>Motivo de la baja<textarea maxLength="500" required value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <button type="button" disabled={busy || !reason.trim()} onClick={retire}>Confirmar retiro</button>
              <button type="button" className="secondary-action" disabled={busy} onClick={() => { setRetiring(false); setReason(""); }}>Cancelar</button>
            </fieldset>
          )}
          {canEdit && lock?.active && lock.mine && !selected.fechaBaja && (
            replacing ? <div data-flight-draft>
              <label>Nueva versión PDF<input type="file" accept="application/pdf,.pdf" onChange={(e) => setVersionFile(e.target.files[0] || null)} /></label>
              <button type="button" disabled={busy || !versionFile} onClick={addVersion}>Guardar nueva versión</button>
              <button type="button" className="secondary-action" disabled={busy} onClick={() => { setReplacing(false); setVersionFile(null); }}>Cancelar</button>
            </div> : <button type="button" disabled={busy} onClick={() => setReplacing(true)}>Cargar nueva versión</button>
          )}
          <h4>Historial de versiones</h4>
          {history === null ? <p>Cargando historial…</p> : history.versiones.length === 0 ? <p>Sin versiones disponibles.</p> : (
            <ul>{history.versiones.map((v) => (
              <li key={v.id}>
                Versión {v.numeroVersion}{v.esVersionActual ? " (vigente)" : ""} · {v.nombreArchivoOriginal} · {size(v.tamanioBytes)} · {dt(v.fechaCreacion)}{v.creadoPor ? ` · ${v.creadoPor}` : ""}{" "}
                <button type="button" className="secondary-action" onClick={() => download(v)}>Descargar versión {v.numeroVersion}</button>
              </li>
            ))}</ul>
          )}
        </div>
      )}
    </section>
  );
}
