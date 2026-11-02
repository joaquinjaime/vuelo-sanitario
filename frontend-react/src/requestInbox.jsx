import React, { useState } from "react";

// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const defaultPlace = (p) => (!p ? "—" : typeof p === "string" ? p : [p.nombre, p.provincia].filter(Boolean).join(", ") || "—");

/** Solicitudes visibles sin desplegar la lista completa; el contador siempre muestra el total real. */
export const INBOX_PAGE = 8;
/** Frecuencia del refresco de la bandeja: razonable para una cola humana y sin infraestructura nueva (dos GET livianos). */
export const INBOX_REFRESH_MS = 30000;

/**
 * Etapa de una solicitud sanitaria, derivada exclusivamente de los estados reales del servidor (`adaptFlight().estado`:
 * el estado del vuelo y, mientras no lo tiene, el de la solicitud). No existe un estado «bajo revisión» distinto de SOLICITADO:
 * la evaluación de Operaciones la resuelve de inmediato (aprueba, contrapropone o rechaza), así que no se simula.
 * `open` marca las que forman la bandeja; `needsOps` las que esperan una acción de Operaciones.
 */
export const requestStage = (flight) => {
  const state = flight?.estado;
  if (state === "SOLICITADO") return { key: "NUEVA", label: "Nueva", detail: "Pendiente de evaluación por Operaciones", tone: "new", open: true, needsOps: true };
  if (state === "PENDIENTE_RESPUESTA_DTS") return { key: "NEGOCIACION", label: "En negociación", detail: "Esperando la respuesta del DTS a la contrapropuesta", tone: "negotiation", open: true, needsOps: false };
  if (state === "APROBADO") return { key: "ACORDADA", label: "Horario acordado", detail: "Falta asignar aeronave y comandante", tone: "agreed", open: true, needsOps: true };
  if (state === "RECHAZADO" || state === "CANCELADO") return { key: "CERRADA", label: state === "RECHAZADO" ? "Rechazada" : "Cancelada", detail: "Solicitud cerrada", tone: "closed", open: false, needsOps: false };
  return { key: "AVANZADA", label: "Etapa posterior", detail: "El vuelo ya avanzó en su ciclo operativo", tone: "advanced", open: false, needsOps: false };
};

const PRIORITY_RANK = { CRITICA: 3, ALTA: 2, MEDIA: 1, BAJA: 0 };
const time = (value) => (value ? String(value) : "");
/**
 * Orden de atención: 1) extrema urgencia abierta primero, por horario límite (la misma regla con que el servidor ordena los vuelos);
 * 2) mayor prioridad declarada; 3) la que espera hace más tiempo (por recepción) y, sin fecha, la de menor identificador.
 */
export const compareRequests = (a, b) => {
  if (Boolean(a.extremaUrgencia) !== Boolean(b.extremaUrgencia)) return a.extremaUrgencia ? -1 : 1;
  if (a.extremaUrgencia && time(a.fechaLimiteTraslado) !== time(b.fechaLimiteTraslado)) return (time(a.fechaLimiteTraslado) || "9") < (time(b.fechaLimiteTraslado) || "9") ? -1 : 1;
  const priority = (PRIORITY_RANK[b.prioridad] ?? -1) - (PRIORITY_RANK[a.prioridad] ?? -1);
  if (priority) return priority;
  if (time(a.recibida) !== time(b.recibida)) return (time(a.recibida) || "9") < (time(b.recibida) || "9") ? -1 : 1;
  const x = Number(a.id), y = Number(b.id);
  return Number.isNaN(x) || Number.isNaN(y) ? String(a.id).localeCompare(String(b.id)) : x - y;
};

/** Divide las solicitudes sanitarias abiertas en las que exigen una acción de Operaciones y las que esperan al DTS. */
export const inboxSections = (flights = []) => {
  const open = flights.filter((f) => f?.datosSanitarios && requestStage(f).open).sort(compareRequests);
  const actionable = open.filter((f) => requestStage(f).needsOps), waiting = open.filter((f) => !requestStage(f).needsOps);
  return {
    actionable, waiting,
    counts: {
      nuevas: open.filter((f) => requestStage(f).key === "NUEVA").length,
      acordadas: actionable.filter((f) => requestStage(f).key === "ACORDADA").length,
      negociacion: waiting.length,
      urgentes: open.filter((f) => f.extremaUrgencia).length,
      intervencion: actionable.length,
    },
  };
};

export const StageBadge = ({ flight }) => {
  const stage = requestStage(flight);
  return <span className={`stage-badge stage-${stage.tone}`} title={stage.detail}>{stage.label}</span>;
};

function InboxItem({ flight, onOpen, place }) {
  const stage = requestStage(flight);
  return (
    <li className={`inbox-item${flight.extremaUrgencia ? " is-urgent" : ""}`} data-stage={stage.key}>
      <div className="inbox-main">
        <div className="inbox-heading">
          <strong>{flight.codigo || `Solicitud ${flight.id}`}</strong>
          <StageBadge flight={flight} />
          {flight.extremaUrgencia && <span className="urgency-badge"><span aria-hidden="true">⚠</span><strong>EXTREMA URGENCIA</strong><span>Límite: {dt(flight.fechaLimiteTraslado)}</span></span>}
        </div>
        <span className="inbox-route">{place(flight.origen)} → {place(flight.destino)}</span>
        <dl className="inbox-meta">
          <div><dt>Recibida</dt><dd>{dt(flight.recibida)}</dd></div>
          <div><dt>Salida solicitada</dt><dd>{dt(flight.solicitada)}</dd></div>
          <div><dt>Prioridad</dt><dd>{flight.prioridad || "—"}</dd></div>
        </dl>
        <small>{stage.detail}</small>
      </div>
      <button type="button" className={stage.needsOps ? "" : "secondary-action"} aria-label={`Abrir solicitud ${flight.codigo || flight.id}`} onClick={() => onOpen(flight.id)}>Abrir solicitud</button>
    </li>
  );
}

/** Bandeja de solicitudes sanitarias del Centro de Operaciones: se alimenta de los vuelos ya cargados (datos reales, sin contadores simulados). */
export function RequestInbox({ flights, onOpen, place = defaultPlace, updatedAt = null }) {
  const { actionable, waiting } = inboxSections(flights);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? actionable : actionable.slice(0, INBOX_PAGE);
  return (
    <section className="card request-inbox" aria-labelledby="request-inbox-title">
      <div className="section-title">
        <div>
          <p className="eyebrow">SOLICITUDES SANITARIAS</p>
          <h2 id="request-inbox-title">Solicitudes sanitarias pendientes</h2>
        </div>
      </div>
      <p className="hint inbox-hint">Se actualiza automáticamente{updatedAt ? ` · última actualización ${updatedAt}` : ""}. Orden: extrema urgencia, prioridad y antigüedad.</p>
      {actionable.length ? (
        <>
          <h3 className="inbox-group">Requieren su intervención <span className="inbox-count">{actionable.length}</span></h3>
          <ul className="inbox-list" aria-label="Solicitudes que requieren intervención de Operaciones">{shown.map((f) => <InboxItem key={f.id} flight={f} onOpen={onOpen} place={place} />)}</ul>
          {actionable.length > INBOX_PAGE && <button type="button" className="tertiary-action" onClick={() => setShowAll(!showAll)}>{showAll ? "Mostrar menos" : `Mostrar las ${actionable.length} solicitudes`}</button>}
        </>
      ) : <p className="empty compact-empty">No hay solicitudes sanitarias que requieran su intervención.</p>}
      {waiting.length > 0 && (
        <>
          <h3 className="inbox-group">Esperando respuesta del DTS <span className="inbox-count">{waiting.length}</span></h3>
          <ul className="inbox-list" aria-label="Solicitudes en negociación con el DTS">{waiting.map((f) => <InboxItem key={f.id} flight={f} onOpen={onOpen} place={place} />)}</ul>
        </>
      )}
    </section>
  );
}

/** Contadores de la bandeja: valores reales calculados de los vuelos cargados. */
export function InboxCounters({ flights }) {
  const { counts } = inboxSections(flights);
  return (
    <section className="operational-summary inbox-counters" aria-label="Resumen de solicitudes sanitarias" aria-live="polite">
      <article className="counter-new"><span>Nuevas</span><strong>{counts.nuevas}</strong><small>sin evaluar</small></article>
      <article className="counter-agreed"><span>Horario acordado</span><strong>{counts.acordadas}</strong><small>falta asignar recursos</small></article>
      <article className="counter-negotiation"><span>En negociación</span><strong>{counts.negociacion}</strong><small>esperan al DTS</small></article>
      <article className="counter-urgent"><span>Extrema urgencia</span><strong>{counts.urgentes}</strong><small>abiertas</small></article>
    </section>
  );
}
