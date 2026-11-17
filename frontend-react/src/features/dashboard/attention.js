import { isCopilotFlight } from "../../utils/flightAdapter";

/**
 * Qué vuelos requieren una acción del usuario según su área. Se deriva únicamente del estado real que informa el servidor;
 * no se inventan prioridades ni indicadores. (Para el Centro de Operaciones, la bandeja de solicitudes sanitarias usa
 * inboxSections; estas reglas cubren el resto de sus vuelos.)
 */
export const ATTENTION_STATES = {
  DTS: ["PENDIENTE_RESPUESTA_DTS", "RECHAZADO"],
  OPERACIONES: ["SOLICITADO", "PENDIENTE_RESPUESTA_OPERACIONES", "PENDIENTE_REPLANIFICACION", "APROBADO"],
  COMANDANTE: ["PENDIENTE_CONFIRMACION_COMANDANTE", "PLANIFICADO", "PENDIENTE_REPLANIFICACION"],
};

export const attentionFor = (workspace, flights = []) => {
  const states = ATTENTION_STATES[workspace] || [];
  return flights.filter((flight) => states.includes(flight.estado) && !(workspace === "COMANDANTE" && isCopilotFlight(flight)));
};

