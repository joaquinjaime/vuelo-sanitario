import React from "react";
import { NegotiationHistory } from "../negotiation";
import { AuditTimeline } from "../../audit/audit";

/** Historial de actividad del vuelo (línea de tiempo auditada). */
export function HistoryTab({ ctx }) {
  return <div className="tab-stack"><p className="hint">Actividad registrada del vuelo, de la más reciente a la más antigua.</p><AuditTimeline key={`audit-${ctx.id}-${ctx.flight.estado}-${ctx.logRevision}`} flightId={ctx.id} title={ctx.workspace === "DTS" ? "Evolución de mi solicitud" : "Historial de actividad"} />
    {ctx.workspace === "COMANDANTE" && ctx.events.length > 0 && <details><summary>Historial del horario</summary><NegotiationHistory events={ctx.events} /></details>}
  </div>;
}
