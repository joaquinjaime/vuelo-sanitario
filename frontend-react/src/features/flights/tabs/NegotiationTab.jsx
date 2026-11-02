import React from "react";
import { NegotiationPanel, NegotiationHistory, RequestSummary } from "../negotiation";
import { Card } from "../../../components/ui/Card";
import { CommanderProposalResponse } from "../components/CommanderProposalResponse";
import { DtsScheduleResponse } from "../components/DtsScheduleResponse";

/** Negociación del horario: tarea principal mientras no hay acuerdo; luego, resumen e historial. */
export function NegotiationTab({ ctx }) {
  const { flight, events, workspace } = ctx;
  if (workspace === "DTS") return <DtsScheduleResponse flight={flight} events={events} reasons={ctx.reasons} respond={ctx.respond} busy={ctx.busy} />;
  if (flight.datosSanitarios) {
    // Mientras se negocia, quien decide necesita los datos de la solicitud a la vista, junto a la decisión.
    return <div className="tab-stack"><RequestSummary flight={flight} medical={ctx.detail.medical} /><NegotiationPanel flight={flight} events={events} call={ctx.call} reasons={ctx.reasons} /></div>;
  }
  return (
    <div className="tab-stack">
      <CommanderProposalResponse flight={flight} events={events} done={ctx.done} msg={ctx.notify} reload={ctx.reload} />
      <Card title="Historial de negociación"><NegotiationHistory events={events} /></Card>
    </div>
  );
}
