import React, { useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";
import { dt } from "../../../utils/format";
import { CrewContacts } from "../crewContacts";
import { CopilotCard } from "../resourceAssignment";

const CREW_REMOVAL_LABEL = { RETIRO: "Retirado", REEMPLAZO: "Reemplazado", CAMBIO_COMANDANTE: "Comandante reemplazado" };
const ELIGIBLE_CODES = new Set(["ELEGIBLE", "HISTORICO"]);
export const CREW_REFRESH_MS=15000;
export function FlightCrew({ flightId, canManage=false, state, copilot=false, msg=()=>{}, refreshMs=CREW_REFRESH_MS }) {
 const [rows,setRows]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[history,setHistory]=useState(null),[showHistory,setShowHistory]=useState(false);
  const latest=useRef(0);
 /** Sólo la respuesta de la consulta más reciente se aplica: una respuesta tardía (de un vuelo o estado anterior) nunca pisa a una más nueva. {@code quiet}: refresco de fondo, que ante una falla conserva lo que ya se ve. */
 const load=async(quiet=false)=>{const mine=++latest.current;try{const data=await api(`/flights/${flightId}/crew`);if(mine!==latest.current)return;if(!Array.isArray(data))throw new Error("Respuesta de tripulación inválida");setRows(data);setError("");}catch(e){if(mine!==latest.current||quiet)return;setRows(null);setError(e.message);}};
 const loadHistory=async()=>{try{const data=await api(`/flights/${flightId}/crew?history=true`);if(!Array.isArray(data))throw new Error("Respuesta de historial inválida");setHistory(data);}catch(e){setHistory(null);setError(e.message);}};
 useEffect(()=>{setRows(null);setError("");setShowHistory(false);setHistory(null);load();},[flightId,state]);
 useEffect(()=>{const tick=()=>{if(document.visibilityState==="hidden"||busy)return;load(true);};const timer=setInterval(tick,refreshMs);window.addEventListener("focus",tick);document.addEventListener("visibilitychange",tick);return()=>{clearInterval(timer);window.removeEventListener("focus",tick);document.removeEventListener("visibilitychange",tick);};},[flightId,busy,refreshMs]);
 const refreshAll=async()=>{await load();if(showHistory)await loadHistory();};
 const remove=async row=>{if(busy)return;if(window.confirm?.(`¿Retirar a ${row.nombre} ${row.apellido} de la tripulación? El registro queda en el historial.`)===false)return;setBusy(true);try{await api(`/flights/${flightId}/crew/${row.id}`,{method:"DELETE"});await refreshAll();msg("Tripulante retirado");}catch(e){await refreshAll();setError(e.message);}finally{setBusy(false);}};
 const toggleHistory=async()=>{if(showHistory){setShowHistory(false);return;}setShowHistory(true);await loadHistory();};
 const mutable=["PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PLANIFICADO","PENDIENTE_REPLANIFICACION"].includes(state);
 const current=(rows||[]).filter(r=>r.vigente!==false),removed=(history||[]).filter(r=>r.vigente===false);
 return <div className="wide"><h4>Tripulación</h4><p className="hint">Comandante y copiloto son usuarios con rol COMANDANTE; el copiloto no recibe las tareas del comandante principal de este vuelo. El personal sanitario lo asigna el DTS.</p><button type="button" className="link-button" onClick={()=>load()}>Actualizar elegibilidad</button>{error&&<p role="alert">{error}</p>}{rows===null?!error&&<p>Cargando tripulación…</p>:current.length===0?<p>Sin tripulantes registrados.</p>:current.map(row=><p key={row.id}><strong>{row.nombre} {row.apellido}</strong> · {row.crewRoleName}{row.comandante&&" (comandante principal)"}{row.elegibilidadCodigo&&<span role={ELIGIBLE_CODES.has(row.elegibilidadCodigo)?undefined:"status"} className={ELIGIBLE_CODES.has(row.elegibilidadCodigo)?"success":"error"}> · {ELIGIBLE_CODES.has(row.elegibilidadCodigo)?"Apto":"Requiere revisión"}{!ELIGIBLE_CODES.has(row.elegibilidadCodigo)?`: ${row.elegibilidadMotivo}`:""}</span>}{canManage&&mutable&&!row.comandante&&<button type="button" className="secondary-action" disabled={busy} onClick={()=>remove(row)}>Retirar</button>}</p>)}
  {canManage&&rows!==null&&current.length>0&&<CrewContacts flightId={flightId} state={state} crewKey={current.map(r=>`${r.id}:${r.userId}:${r.crewRoleCode}`).join("|")}/>}
  {rows!==null&&<button type="button" className="link-button" onClick={toggleHistory}>{showHistory?"Ocultar historial de tripulación":"Ver historial de tripulación"}</button>}
  {showHistory&&(history===null?<p>Cargando historial…</p>:removed.length===0?<p className="hint">Sin retiros ni reemplazos registrados.</p>:<ul aria-label="Historial de tripulación">{removed.map(r=><li key={r.id}>{r.nombre} {r.apellido} · {r.crewRoleName} — {CREW_REMOVAL_LABEL[r.motivoBaja]||r.motivoBaja} por {r.bajaPor||"—"} el {dt(r.fechaBaja)} (asignado por {r.asignadoPor||"—"} el {dt(r.asignadoEn)})</li>)}</ul>)}
  {canManage&&copilot&&<CopilotCard flight={{id:flightId,estado:state}} msg={msg} editable={mutable} blockedReason="El estado del vuelo no permite modificar la tripulación." onChanged={refreshAll}/>}</div>;
}
