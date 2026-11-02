import React, { useEffect, useState } from "react";
import { api } from "../../../services/api";

export function OperationalAirportSelector({value,onChange,initial=[]}) {
 const [query,setQuery]=useState(""),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState("");
 useEffect(()=>{if(!query.trim()){setResults([]);setError("");return;}let active=true;const timer=setTimeout(()=>{api(`/catalogs/airports?q=${encodeURIComponent(query.trim())}`).then(rows=>{if(active){if(!Array.isArray(rows))throw new Error("Respuesta inválida");setResults(rows);setError("");}}).catch(()=>{if(active){setResults([]);setError("No se pudo buscar aeropuertos.");}});},250);return()=>{active=false;clearTimeout(timer);};},[query]);
 const options=query.trim()?results:initial;
 return <><label>Buscar aeropuerto de destino<input value={query} onChange={e=>setQuery(e.target.value)}/></label>{error&&<p role="alert" className="error">{error}</p>}<label>Destino<select required value={value} onChange={e=>{const id=e.target.value;setSelected(options.find(x=>String(x.id)===id)||null);onChange(id?Number(id):"");}}><option value="">Seleccionar aeropuerto</option>{selected&&value&&!options.some(x=>String(x.id)===String(value))&&<option value={selected.id}>{selected.nombre}</option>}{options.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label></>;
}
