import React, { useState } from "react";
import { api } from "../../../services/api";

export function CommanderAssignment({ flight, done, msg, reload }) {
 const [motivo,setMotivo]=useState(""),[salida,setSalida]=useState(""),[llegada,setLlegada]=useState("");
 if(flight?.estado!=="PENDIENTE_CONFIRMACION_COMANDANTE")return null;
 const send=async body=>{try{await api(`/flights/${flight.id}/commander-assignment/response`,{method:"POST",body:JSON.stringify(body)});msg("Respuesta enviada a Operaciones");await done();await reload();}catch(e){msg(e.message,true);}};
 return <div className="wide detail-actions"><h4>Confirmación de asignación</h4><p>Revise el vuelo asignado. Un rechazo no cancela el vuelo: vuelve a Operaciones para replanificarlo.</p><button onClick={()=>send({aceptar:true})}>Aceptar asignación</button><label>Motivo (obligatorio para rechazar o proponer)<textarea value={motivo} onChange={e=>setMotivo(e.target.value)}/></label><button className="secondary-action" disabled={!motivo.trim()} onClick={()=>send({aceptar:false,motivo})}>Rechazar y devolver a Operaciones</button><label>Nueva salida<input type="datetime-local" value={salida} onChange={e=>setSalida(e.target.value)}/></label><label>Nueva llegada<input type="datetime-local" value={llegada} onChange={e=>setLlegada(e.target.value)}/></label><button disabled={!motivo.trim()||!salida||!llegada} onClick={()=>send({aceptar:false,motivo,salidaPropuesta:salida,llegadaPropuesta:llegada})}>Proponer horario</button></div>;
}
