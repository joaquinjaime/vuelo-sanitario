import React from "react";
import { dt } from "../../../utils/format";

export function Urgency({ flight, detail = false }) {
  return flight?.extremaUrgencia ? (
    <div className={detail ? "urgency-detail" : "urgency-badge"}>
      <span aria-hidden="true">⚠</span>
      <strong>EXTREMA URGENCIA</strong>
      {detail && (
        <>
          <span>Solicitado: {dt(flight.solicitada)}</span>
          <span>Límite de traslado: {dt(flight.fechaLimiteTraslado)}</span>
          {flight.justificacionExtremaUrgencia && (
            <span>Justificación: {flight.justificacionExtremaUrgencia}</span>
          )}
        </>
      )}
    </div>
  ) : null;
}
