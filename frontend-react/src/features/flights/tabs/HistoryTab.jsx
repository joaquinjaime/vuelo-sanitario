import React from "react";
import { AuditTimeline } from "../../audit/audit";

/** Historial de actividad del vuelo (línea de tiempo auditada). */
export function HistoryTab({ ctx }) {
  return <AuditTimeline key={`audit-${ctx.id}-${ctx.flight.estado}-${ctx.logRevision}`} flightId={ctx.id} title={ctx.workspace === "DTS" ? "Evolución de mi solicitud" : "Historial de actividad"} />;
}
