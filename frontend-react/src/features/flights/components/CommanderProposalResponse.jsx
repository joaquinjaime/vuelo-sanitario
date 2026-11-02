import React, { useState } from "react";
import { api } from "../../../services/api";
import { dt } from "../../../utils/format";
import { openProposal } from "../negotiation";
import { OperationalReplanning } from "./OperationalReplanning";

export function CommanderProposalResponse({ flight, events=[], done, msg, reload }) {
 const [motivo,setMotivo]=useState("");
 if(flight?.estado==="PENDIENTE_REPLANIFICACION")return <OperationalReplanning flight={flight} done={done} msg={msg} reload={reload}/>;
 if(flight?.estado!=="PENDIENTE_RESPUESTA_OPERACIONES")return null;
 const proposal=openProposal(events,"COMANDANTE_PROPONE_HORARIO");
 if(!proposal)return <p className="wide hint">La propuesta del comandante ya fue respondida o reemplazada; actualice la ficha.</p>;
 const send=async aceptar=>{try{await api(`/flights/${flight.id}/commander-proposal/response`,{method:"POST",body:JSON.stringify({aceptar,propuestaId:proposal.id,motivo:aceptar?null:motivo})});msg(aceptar?"Horario del comandante aceptado":"Propuesta devuelta al comandante");await done();await reload();}catch(e){msg(e.message,true);}};
 return <div className="wide detail-actions"><h4>Propuesta de horario del comandante</h4><p>Propone salida <strong>{dt(proposal.fechaHoraPropuesta)}</strong> y llegada <strong>{dt(proposal.fechaHoraLlegadaPropuesta)}</strong> — {proposal.motivo}. La propuesta y sus horarios constan en el historial. Al rechazarla, el comandante debe confirmar o presentar una nueva propuesta.</p><button onClick={()=>send(true)}>Aceptar horario propuesto</button><label>Motivo del rechazo<textarea value={motivo} onChange={e=>setMotivo(e.target.value)}/></label><button className="secondary-action" disabled={!motivo.trim()} onClick={()=>send(false)}>Rechazar propuesta</button></div>;
}
