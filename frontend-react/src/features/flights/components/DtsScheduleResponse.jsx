import React, { useEffect, useState } from "react";
import { dt } from "../../../utils/format";
import { openProposal, CancellationFields, NegotiationHistory } from "../negotiation";
import { Urgency } from "./Urgency";
import { CancellationNote } from "./CancellationNote";
import { flightStage } from "../flightStages";

const needsOther = (list, id) => list.find((x) => String(x.id) === String(id))?.codigo === "OTRO";

/**
 * Negociación del horario desde el DTS: horario pedido y definitivo, estado de la negociación y, cuando Operaciones hizo una
 * contrapropuesta vigente, su aceptación o rechazo (que cancela la solicitud y exige motivo).
 * `respond(path, body, mensaje)` ejecuta la operación y vuelve a leer el estado real.
 */
export function DtsScheduleResponse({ flight, events = [], reasons = [], respond, busy = false }) {
  const [reasonId, setReasonId] = useState(""), [custom, setCustom] = useState("");
  const proposal = openProposal(events, "CO_CONTRAPROPUESTA"), stage = flightStage(flight, events);
  useEffect(() => { setReasonId(""); setCustom(""); }, [flight.id, flight.estado]);
  const send = (aceptar) => respond(`/flights/${flight.id}/schedule/response`, { aceptar, propuestaId: proposal?.id, motivoCancelacionId: aceptar ? null : reasonId, motivoCancelacionPersonalizado: aceptar ? null : custom },
    aceptar ? "Contrapropuesta aceptada" : "Contrapropuesta rechazada: la solicitud fue cancelada");
  return (
    <section className="negotiation-panel is-primary" aria-label="Negociación del horario">
      <div className="negotiation-head"><div><p className="eyebrow">NEGOCIACIÓN</p><h3>Horario del traslado</h3></div></div>
      <div className="detail-grid">
        <div><h4>Horario solicitado por el DTS</h4><p>{dt(flight.solicitada)}</p></div>
        <div><h4>Horario definitivo</h4><p>{flight.salida ? dt(flight.salida) : "Pendiente"}</p></div>
      </div>
      <Urgency flight={flight} detail />
      <CancellationNote flight={flight} />
      {stage?.key === "NEGOCIACION" && <p className="negotiation-status" role="status">{flight.estado === "SOLICITADO" ? <><strong>Pendiente de evaluación:</strong> Operaciones debe aceptar el horario solicitado, presentar una contrapropuesta o rechazar la solicitud.</> : <><strong>Debe responder:</strong> Operaciones propuso otro horario y usted debe aceptarlo o rechazarlo.</>}</p>}
      {flight.estado === "PENDIENTE_RESPUESTA_DTS" && proposal && (
        <div className="negotiation-form" role="group" aria-label="Contrapropuesta pendiente">
          <h4>Contrapropuesta de Operaciones</h4>
          <p>Nuevo horario propuesto: <strong>{dt(proposal.fechaHoraPropuesta)}</strong> — {proposal.motivo}</p>
          <p className="hint">Si la rechaza, la solicitud se cancela y debe indicar el motivo. Sólo puede responder la propuesta vigente.</p>
          <div className="negotiation-actions"><button disabled={busy} onClick={() => send(true)}>Aceptar contrapropuesta</button></div>
          <CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom} />
          <div className="negotiation-actions"><button className="secondary-action danger-action" disabled={busy || !reasonId || (needsOther(reasons, reasonId) && !custom.trim())} onClick={() => send(false)}>Rechazar contrapropuesta y cancelar</button></div>
        </div>
      )}
      <h4>Historial de negociación</h4>
      <NegotiationHistory events={events} />
    </section>
  );
}
