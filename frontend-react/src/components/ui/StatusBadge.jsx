import React from "react";

/** Nombres comprensibles de los estados de vuelo/solicitud. El valor interno del servidor nunca se muestra tal cual. */
export const FLIGHT_STATE_LABEL = Object.freeze({
  SOLICITADO: "Nueva solicitud",
  PENDIENTE_RESPUESTA_DTS: "Contrapropuesta enviada al DTS",
  APROBADO: "Horario acordado",
  PLANIFICADO: "Planificado",
  PENDIENTE_CONFIRMACION_COMANDANTE: "Esperando al comandante",
  PENDIENTE_RESPUESTA_OPERACIONES: "Propuesta del comandante",
  PENDIENTE_REPLANIFICACION: "Para replanificar",
  EN_CURSO: "En curso",
  FINALIZADO: "Finalizado",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
  RECHAZADO: "Rechazado",
  SIN_ESTADO: "Sin estado",
});

// Cada estado se comunica con texto y con un símbolo, nunca sólo con color.
const TONE = {
  SOLICITADO: "attention", PENDIENTE_RESPUESTA_DTS: "negotiation", APROBADO: "info", PLANIFICADO: "info",
  PENDIENTE_CONFIRMACION_COMANDANTE: "attention", PENDIENTE_RESPUESTA_OPERACIONES: "attention", PENDIENTE_REPLANIFICACION: "attention",
  EN_CURSO: "active", FINALIZADO: "done", COMPLETADO: "done", CANCELADO: "closed", RECHAZADO: "closed",
};
const SYMBOL = { attention: "●", negotiation: "◆", info: "●", active: "▶", done: "✓", closed: "✕", neutral: "○" };

export const flightStateLabel = (state) => FLIGHT_STATE_LABEL[state] || String(state || "").replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) || "—";

export function StatusBadge({ state, label, tone }) {
  const kind = tone || TONE[state] || "neutral";
  return <span className={`badge badge-${kind}`} data-state={state}><span aria-hidden="true">{SYMBOL[kind]}</span>{label || flightStateLabel(state)}</span>;
}
