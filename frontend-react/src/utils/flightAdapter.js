/** Normaliza el vuelo del servidor: estado efectivo (vuelo o, mientras no lo tiene, solicitud sanitaria) y datos de la solicitud al primer nivel. */
export const adaptFlight = (flight) => {
  const sanitary = flight?.datosSanitarios;
  return {
    ...flight,
    estado: flight?.estadoVuelo || sanitary?.estadoSolicitud || "SIN_ESTADO",
    prioridad: sanitary?.prioridad || "—",
    solicitada: sanitary?.fechaSolicitada || null,
    recibida: sanitary?.fechaRecepcion || null,
    extremaUrgencia: Boolean(sanitary?.extremaUrgencia),
    justificacionExtremaUrgencia: sanitary?.justificacionExtremaUrgencia,
    fechaLimiteTraslado: sanitary?.fechaLimiteTraslado,
    origen: sanitary?.localidadOrigenSolicitada || flight?.origenDetalle || flight?.origen,
    destino: sanitary?.localidadDestinoSolicitada || flight?.destinoDetalle || flight?.destino,
  };
};

/** The viewer is the flight's copilot: a read-only spectator (the commander operates the flight). */
export const isCopilotFlight = (flight) => flight?.miFuncion === "COPILOTO";

export const adaptDetail = (detail) => (detail ? { ...detail, vuelo: adaptFlight(detail.vuelo) } : detail);
