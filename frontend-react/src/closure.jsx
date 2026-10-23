import React, { useEffect, useState } from "react";
import { api, downloadFile, uploadFile } from "./api";

// Los instantes de las obligaciones son OffsetDateTime; se muestran siempre en la zona de negocio.
const BUSINESS_ZONE = "America/Argentina/Tucuman";
export const instant = (v) => {
  if (!v) return "—";
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return String(v);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};
export const remaining = (item) => {
  if (item.segundosRestantes == null) return null;
  const abs = Math.abs(item.segundosRestantes);
  const hours = Math.floor(abs / 3600), minutes = Math.floor((abs % 3600) / 60);
  const text = `${hours} h ${minutes} min`;
  return item.vencida || item.segundosRestantes <= 0 ? `VENCIDO hace ${text}` : `Quedan ${text}`;
};
const confirmAction = (text) => (typeof window.confirm === "function" ? window.confirm(text) : true);
export const STATUS_LABEL = { PENDIENTE: "Pendiente de presentación", PRESENTADO: "Presentado, en revisión", DEVUELTO: "Devuelto para corrección", APROBADO: "Aprobado" };
const ADMIN_LABEL = {
  INFORME_PENDIENTE: "Informe final pendiente de presentación",
  INFORME_VENCIDO: "Informe final VENCIDO",
  INFORME_DEVUELTO: "Informe devuelto para corrección",
  EN_REVISION: "Informe presentado, en revisión de Operaciones",
  CERRADO: "Cerrado administrativamente",
};
const VERSION_LABEL = { PRESENTADO: "Presentada", DEVUELTO: "Devuelta", APROBADO: "Aprobada", REEMPLAZADO: "Reemplazada (sin decisión registrada)", HISTORICO_SIN_DECISION: "Histórica (sin decisión de revisión verificable)" };
const FORMAT_LABEL = { TEXTO: "Texto", PDF: "PDF adjunto", TEXTO_Y_PDF: "Texto y PDF adjunto" };
const kb = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB");
/** Una decisión anterior a V42 sólo se muestra como decisión si la obligación la registraba; se aclara su procedencia. */
export const decisionNote = (v) => v.origenDecision === "HISTORICA_OBLIGACION" ? "decisión histórica registrada en la obligación" : v.origenDecision === "HISTORICA_OBLIGACION_AUDITADA" ? "decisión histórica registrada en la obligación y la auditoría" : null;

function Versions({ versions, onError = () => {} }) {
  const download = async (attachment, version) => {
    try {
      const blob = await downloadFile(attachment.urlDescarga.replace("/api", ""));
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `informe-final-v${version}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { onError(e.message); }
  };

  if (!versions?.length) return <p className="hint">Aún no hay versiones presentadas.</p>;
  return (
    <ol className="report-versions" reversed>
      {versions.map((v) => (
        <li key={v.id}>
          <strong>Versión {v.version}</strong> · {VERSION_LABEL[v.estado] || v.estado}{decisionNote(v) ? ` — ${decisionNote(v)}` : ""}
          {v.vigente ? " (vigente)" : ""} · {FORMAT_LABEL[v.formato] || v.formato} · presentada por {v.presentadoPor}
          {v.revisadoEn ? ` · revisada ${instant(v.revisadoEn)} por ${v.revisor}` : ""}
          {v.horasVuelo != null && <p>Horas de vuelo: {v.horasVuelo} · Combustible: {v.combustibleConsumidoLitros ?? "—"} L</p>}
          {v.texto && <p className="report-text">{v.texto}</p>}
          {v.adjunto && <p>PDF: {v.adjunto.nombre} ({kb(v.adjunto.tamanioBytes)}, SHA-256 {v.adjunto.sha256.slice(0, 12)}…) <button className="secondary-action" onClick={() => download(v.adjunto, v.version)}>Descargar PDF</button></p>}
          {v.incidentes && <p>Incidentes: {v.incidentes}</p>}
          {v.motivoDevolucion && <p className="error">Motivo de devolución: {v.motivoDevolucion}</p>}
        </li>
      ))}
    </ol>
  );
}

export function ReportHistory({ obligationId, trigger = 0, onError = () => {} }) {
  const [detail, setDetail] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/final-reports/${obligationId}`).then((x) => active && setDetail(x)).catch((e) => active && setError(e.message));
    return () => { active = false; };
  }, [obligationId, trigger]);
  if (error) return <p role="alert" className="error">{error}</p>;
  return detail ? <Versions versions={detail.versiones} onError={onError} /> : <p className="hint">Cargando historial…</p>;
}

const emptyForm = { texto: "", horasVuelo: "", combustibleConsumidoLitros: "", incidentes: "", archivo: null };

export function CommanderReports({ msg, renderLog = () => null }) {
  const [items, setItems] = useState(null), [forms, setForms] = useState({}), [open, setOpen] = useState({}), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const load = async () => {
    try { setItems(await api("/final-reports/mine")); } catch (e) { setItems([]); msg(e.message, true); }
  };
  useEffect(() => { load(); }, []);
  const form = (id) => forms[id] || emptyForm;
  const setField = (id, field, value) => setForms({ ...forms, [id]: { ...form(id), [field]: value } });
  const submit = async (x) => {
    const f = form(x.id);
    if (!f.texto.trim() && !f.archivo) return;
    if (!confirmAction(x.status === "DEVUELTO" ? "¿Presentar la corrección del informe final?" : "¿Presentar el informe final? Quedará en revisión de Operaciones.")) return;
    setBusy(true);
    try {
      if (f.archivo) {
        // Multipart: texto opcional + PDF; el servidor valida extensión, tipo, tamaño y estructura.
        const fields = {};
        if (f.texto.trim()) fields.texto = f.texto;
        if (f.horasVuelo !== "") fields.horasVuelo = f.horasVuelo;
        if (f.combustibleConsumidoLitros !== "") fields.combustibleConsumidoLitros = f.combustibleConsumidoLitros;
        if (f.incidentes) fields.incidentes = f.incidentes;
        await uploadFile(`/final-reports/${x.id}/submit`, f.archivo, fields);
      } else {
        await api(`/final-reports/${x.id}/submit`, {
          method: "POST",
          body: JSON.stringify({
            texto: f.texto,
            horasVuelo: f.horasVuelo === "" ? null : Number(f.horasVuelo),
            combustibleConsumidoLitros: f.combustibleConsumidoLitros === "" ? null : Number(f.combustibleConsumidoLitros),
            incidentes: f.incidentes || null,
          }),
        });
      }
      setForms({ ...forms, [x.id]: emptyForm });
      msg(x.status === "DEVUELTO" ? "Corrección presentada" : "Informe presentado");
      setRevision((n) => n + 1);
      await load();
    } catch (e) { msg(e.message, true); await load(); } finally { setBusy(false); }
  };
  const extend = async (x) => {
    setBusy(true);
    try { await api(`/final-reports/${x.id}/extension`, { method: "POST" }); msg("Prórroga de 24 h concedida"); await load(); }
    catch (e) { msg(e.message, true); await load(); } finally { setBusy(false); }
  };
  const list = items || [];
  const blocked = list.some((x) => x.bloqueado);
  const awaiting = list.filter((x) => x.status === "PENDIENTE" || x.status === "DEVUELTO");
  const reviewing = list.filter((x) => x.status === "PRESENTADO");
  const closed = list.filter((x) => x.status === "APROBADO");
  return (
    <section className={blocked ? "card report-blocked" : "card"} aria-label="Informes finales">
      <h2>{blocked ? "⚠ FUNCIONES BLOQUEADAS: INFORME FINAL VENCIDO" : "Informes finales"}</h2>
      <p className="hint">
        Dispone de 48 horas desde la finalización del vuelo. El vencimiento lo calcula el servidor.
        {blocked && " Mientras haya un informe vencido sólo puede consultar y presentar sus informes pendientes; presentar el informe restablece las funciones."}
      </p>
      {items === null && <p>Cargando informes…</p>}
      {items !== null && !list.length && <p className="empty">No tiene informes finales asociados.</p>}
      {awaiting.map((x) => (
        <article className={x.vencida ? "report-item report-overdue" : "report-item"} key={x.id}>
          <h3>{x.flightCode} · {STATUS_LABEL[x.status]}</h3>
          <p>
            Vence: {instant(x.vencimiento)} · <strong>{remaining(x)}</strong>{" "}
            {x.prorrogaUsada ? "(prórroga utilizada)" : "(prórroga disponible)"}
          </p>
          {x.motivoDevolucion && <p className="error">Devuelto por Operaciones: {x.motivoDevolucion}</p>}
          {renderLog(x.flightId)}
          <label>Informe de texto<textarea value={form(x.id).texto} onChange={(e) => setField(x.id, "texto", e.target.value)} placeholder="Describa la ejecución del vuelo (opcional si adjunta un PDF)" /></label>
          <label>Adjuntar informe PDF (opcional)<input type="file" accept="application/pdf,.pdf" onChange={(e) => setField(x.id, "archivo", e.target.files?.[0] || null)} /></label>
          <label>Horas de vuelo<input type="number" min="0" max="999.99" step="0.01" value={form(x.id).horasVuelo} onChange={(e) => setField(x.id, "horasVuelo", e.target.value)} /></label>
          <label>Combustible consumido (L)<input type="number" min="0" step="0.01" value={form(x.id).combustibleConsumidoLitros} onChange={(e) => setField(x.id, "combustibleConsumidoLitros", e.target.value)} /></label>
          <label>Incidentes<textarea value={form(x.id).incidentes} onChange={(e) => setField(x.id, "incidentes", e.target.value)} /></label>
          <div className="report-actions">
            <button disabled={busy || (!form(x.id).texto.trim() && !form(x.id).archivo)} onClick={() => submit(x)}>{x.status === "DEVUELTO" ? "Presentar corrección" : "Presentar informe"}</button>
            {!x.prorrogaUsada && <button className="secondary-action" disabled={busy} onClick={() => extend(x)}>Solicitar prórroga de 24 h</button>}
            <button className="secondary-action" onClick={() => setOpen({ ...open, [x.id]: !open[x.id] })}>{open[x.id] ? "Ocultar historial" : `Ver historial (${x.versiones})`}</button>
          </div>
          {open[x.id] && <ReportHistory obligationId={x.id} trigger={revision} onError={(m) => msg(m, true)} />}
        </article>
      ))}
      {reviewing.map((x) => (
        <article className="report-item" key={x.id}>
          <h3>{x.flightCode} · {STATUS_LABEL[x.status]}</h3>
          <p>Presentado: {instant(x.presentadoEn)}. Operaciones debe aprobarlo o devolverlo.</p>
          <button className="secondary-action" onClick={() => setOpen({ ...open, [x.id]: !open[x.id] })}>{open[x.id] ? "Ocultar informe" : "Ver informe e historial"}</button>
          {open[x.id] && <ReportHistory obligationId={x.id} trigger={revision} onError={(m) => msg(m, true)} />}
        </article>
      ))}
      {closed.length > 0 && (
        <details>
          <summary>Informes cerrados ({closed.length})</summary>
          {closed.map((x) => (
            <article className="report-item" key={x.id}>
              <h3>{x.flightCode} · {STATUS_LABEL[x.status]}</h3>
              <p>Aprobado: {instant(x.aprobadoEn)} · {x.versiones} versión(es)</p>
              <button className="secondary-action" onClick={() => setOpen({ ...open, [x.id]: !open[x.id] })}>{open[x.id] ? "Ocultar historial" : "Ver historial"}</button>
              {open[x.id] && <ReportHistory obligationId={x.id} trigger={revision} onError={(m) => msg(m, true)} />}
            </article>
          ))}
        </details>
      )}
    </section>
  );
}

export function OperationsReports({ msg }) {
  const [presented, setPresented] = useState(null), [awaiting, setAwaiting] = useState(null), [reason, setReason] = useState({}), [open, setOpen] = useState({}), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const load = async () => {
    try {
      const [a, b] = await Promise.all([api("/final-reports/pending-review"), api("/final-reports/awaiting-commander")]);
      setPresented(a); setAwaiting(b);
    } catch (e) { setPresented((p) => p || []); setAwaiting((p) => p || []); msg(e.message, true); }
  };
  useEffect(() => { load(); }, []);
  const review = async (x, aprobar) => {
    const text = aprobar ? `¿Aprobar el informe de ${x.flightCode} y completar el vuelo?` : `¿Devolver el informe de ${x.flightCode}? El comandante dispondrá de 48 horas para corregirlo.`;
    if (!confirmAction(text)) return;
    setBusy(true);
    try {
      await api(`/final-reports/${x.id}/review`, { method: "POST", body: JSON.stringify({ aprobar, motivoDevolucion: reason[x.id] }) });
      msg(aprobar ? "Informe aprobado y vuelo completado" : "Informe devuelto");
      setRevision((n) => n + 1);
      await load();
    } catch (e) { msg(e.message, true); await load(); } finally { setBusy(false); }
  };
  const overdue = (awaiting || []).filter((x) => x.vencida);
  return (
    <section className="card" aria-label="Revisión de informes finales">
      <h2>Revisión de informes finales</h2>
      {presented === null && <p>Cargando informes…</p>}
      {presented !== null && !presented.length && <p className="empty">No hay informes pendientes de revisión.</p>}
      {(presented || []).map((x) => (
        <article className="report-item" key={x.id}>
          <strong>{x.flightCode}</strong> · {x.comandante} · {x.versiones} versión(es)
          <p>Presentado: {instant(x.presentadoEn)}</p>
          <button className="secondary-action" onClick={() => setOpen({ ...open, [x.id]: !open[x.id] })}>{open[x.id] ? "Ocultar informe" : "Consultar informe"}</button>
          {open[x.id] && <ReportHistory obligationId={x.id} trigger={revision} onError={(m) => msg(m, true)} />}
          <button disabled={busy} onClick={() => review(x, true)}>Aprobar y completar vuelo</button>
          <label className="wide">Motivo de devolución<textarea value={reason[x.id] || ""} onChange={(e) => setReason({ ...reason, [x.id]: e.target.value })} /></label>
          <button className="secondary-action" disabled={busy || !(reason[x.id] || "").trim()} onClick={() => review(x, false)}>Devolver para corrección</button>
        </article>
      ))}
      <h3>Esperando informe del comandante {awaiting ? `(${awaiting.length})` : ""}</h3>
      {overdue.length > 0 && <p className="error">⚠ {overdue.length} informe(s) vencido(s): sus comandantes tienen las funciones operativas bloqueadas.</p>}
      {awaiting !== null && !awaiting.length && <p className="empty">No hay informes pendientes de presentación.</p>}
      {(awaiting || []).map((x) => (
        <article className={x.vencida ? "report-item report-overdue" : "report-item"} key={x.id}>
          <strong>{x.flightCode}</strong> · {x.comandante} · {STATUS_LABEL[x.status]}
          <p>Vence: {instant(x.vencimiento)} · <strong>{remaining(x)}</strong>{x.bloqueado ? " · comandante bloqueado" : ""}</p>
          {x.motivoDevolucion && <p>Devuelto: {x.motivoDevolucion}</p>}
        </article>
      ))}
    </section>
  );
}

/** Estado administrativo del cierre, separado del estado operativo del vuelo. */
export function FlightClosure({ flight, cierre }) {
  if (!cierre && !["FINALIZADO", "COMPLETADO"].includes(flight?.estado)) return null;
  return (
    <div className="wide detail-grid" aria-label="Cierre del vuelo">
      <div><h4>Estado operativo</h4><p>{flight.estado}</p></div>
      <div>
        <h4>Cierre administrativo</h4>
        {cierre ? (
          <>
            <p><strong>{ADMIN_LABEL[cierre.estadoAdministrativo] || cierre.estadoAdministrativo}</strong></p>
            {["INFORME_PENDIENTE", "INFORME_VENCIDO", "INFORME_DEVUELTO"].includes(cierre.estadoAdministrativo) && <p>Vence: {instant(cierre.vencimiento)}</p>}
            {cierre.comandanteBloqueado && <p className="error">El comandante tiene funciones operativas bloqueadas.</p>}
            <p>Versiones del informe: {cierre.versiones}{cierre.aprobadoEn ? ` · aprobado ${instant(cierre.aprobadoEn)}` : ""}</p>
          </>
        ) : <p>Sin obligación de informe registrada.</p>}
      </div>
    </div>
  );
}

/** Inicio y finalización a cargo del Centro de Operaciones; el servidor valida cada transición. */
export function LifecycleActions({ flight, run }) {
  if (flight?.estado === "PLANIFICADO") {
    return (
      <div className="wide detail-actions">
        <h4>Ejecución del vuelo</h4>
        <button onClick={() => confirmAction(`¿Iniciar el vuelo ${flight.codigo}?`) && run(`/flights/${flight.id}/start`, "Vuelo iniciado")}>Iniciar vuelo</button>
      </div>
    );
  }
  if (flight?.estado === "EN_CURSO") {
    return (
      <div className="wide detail-actions">
        <h4>Ejecución del vuelo</h4>
        <p className="hint">Al finalizar se registra la hora real, se actualiza la ubicación de los recursos y el comandante dispone de 48 horas para presentar el informe final.</p>
        <button onClick={() => confirmAction(`¿Finalizar el vuelo ${flight.codigo}?`) && run(`/flights/${flight.id}/finish`, "Vuelo finalizado; se generó la obligación de informe final")}>Finalizar vuelo</button>
      </div>
    );
  }
  return null;
}

export const NOTIFICATION_LABEL = {
  NEW_SANITARY_REQUEST: "Nueva solicitud",
  EXTREME_URGENCY_REQUEST: "⚠ Extrema urgencia",
  SCHEDULE_ACCEPTED: "Solicitud aprobada",
  REQUEST_REJECTED: "Solicitud rechazada",
  SCHEDULE_COUNTERPROPOSAL: "Propuesta de horario",
  SCHEDULE_PROPOSAL_ACCEPTED: "Propuesta aceptada",
  SCHEDULE_PROPOSAL_REJECTED: "Propuesta rechazada",
  FLIGHT_CANCELLED: "Vuelo cancelado",
  COMMANDER_ASSIGNED: "Asignación de vuelo",
  COMMANDER_ASSIGNMENT_PENDING: "Asignación pendiente",
  COMMANDER_ASSIGNMENT_ACCEPTED: "Comandante confirmó",
  COMMANDER_ASSIGNMENT_REJECTED: "Comandante rechazó",
  COMMANDER_SCHEDULE_PROPOSED: "Contrapropuesta del comandante",
  COMMANDER_SCHEDULE_ACCEPTED: "Horario aceptado",
  COMMANDER_SCHEDULE_REJECTED: "Horario rechazado",
  FLIGHT_FINISHED: "Vuelo finalizado",
  FLIGHT_COMPLETED: "Vuelo completado",
  FINAL_REPORT_PENDING: "Informe pendiente",
  FINAL_REPORT_DUE_SOON: "Vencimiento próximo",
  FINAL_REPORT_OVERDUE: "Informe vencido",
  COMMANDER_BLOCKED: "Funciones bloqueadas",
  COMMANDER_UNBLOCKED: "Funciones restablecidas",
  FINAL_REPORT_SUBMITTED: "Informe presentado",
  FINAL_REPORT_RESUBMITTED: "Nueva presentación",
  FINAL_REPORT_RETURNED: "Informe devuelto",
  FINAL_REPORT_APPROVED: "Informe aprobado",
  FINAL_REPORT_EXTENSION: "Prórroga concedida",
};

export function NotificationsPanel({ items = [], unread = 0, msg, reload }) {
  const mark = async (path) => {
    try { await api(path, { method: "POST" }); await reload(); } catch (e) { msg(e.message, true); }
  };
  return (
    <section className="card" aria-label="Notificaciones">
      <div className="section-title">
        <h2>Notificaciones {unread ? `(${unread} sin leer)` : ""}</h2>
        {unread > 0 && <button className="secondary-action" onClick={() => mark("/notifications/read-all")}>Marcar todas como leídas</button>}
      </div>
      {!items.length ? <p className="empty">No hay notificaciones.</p> : (
        <ul className="notification-list">
          {items.map((n) => (
            <li key={n.id} className={n.leido ? "" : "unread"}>
              <strong>{NOTIFICATION_LABEL[n.tipo] || n.tipo}</strong> — {n.mensaje} <small>{String(n.createdAt || "").replace("T", " ").slice(0, 16)}</small>
              {!n.leido && <button className="secondary-action" onClick={() => mark(`/notifications/${n.id}/read`)}>Marcar leída</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
