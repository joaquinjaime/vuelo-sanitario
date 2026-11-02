import React from "react";
import { dt } from "../../../utils/format";

export const CANCELLABLE_REQUEST = ["SOLICITADO", "PENDIENTE_RESPUESTA_DTS", "APROBADO", "PLANIFICADO", "PENDIENTE_CONFIRMACION_COMANDANTE", "PENDIENTE_RESPUESTA_OPERACIONES", "PENDIENTE_REPLANIFICACION"];
export function CancellationNote({ flight }) {
  if (!flight) return null;
  return (
    <>
      {flight.datosSanitarios?.motivoRechazo && <p className="error wide" role="status">Solicitud RECHAZADA por Operaciones: {flight.datosSanitarios.motivoRechazo}</p>}
      {flight.cancelacion && <p className="error wide" role="status">Vuelo CANCELADO{flight.cancelacion.canceladoPor ? ` por ${flight.cancelacion.canceladoPor}` : ""}{flight.cancelacion.fecha ? ` el ${dt(flight.cancelacion.fecha)}` : ""}: {flight.cancelacion.motivo}</p>}
    </>
  );
}
