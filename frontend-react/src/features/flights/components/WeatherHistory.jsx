import React, { useEffect, useState } from "react";
import { api } from "../../../services/api";
import { dt } from "../../../utils/format";

export function WeatherHistory({ flightId, revision=0 }) {
 const [rows,setRows]=useState(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;setRows(null);setError("");api(`/flights/${flightId}/weather`).then(data=>{if(!Array.isArray(data))throw new Error("Respuesta de historial inválida");if(active)setRows(data);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[flightId,revision]);
 return <div className="wide"><h4>Historial meteorológico</h4>{error?<p role="alert">No se pudo cargar el historial: {error}</p>:rows===null?<p>Cargando historial…</p>:rows.length===0?<p>Sin registros meteorológicos.</p>:rows.map(row=><div key={row.id}><p><strong>{dt(row.fechaRegistro)} — {row.favorable===null||row.favorable===undefined?"Sin indicación":row.favorable?"Favorable":"No favorable"}</strong> · {row.registradoPor}</p><p>{row.condiciones}</p>{row.observaciones&&<p>{row.observaciones}</p>}</div>)}</div>;
}
