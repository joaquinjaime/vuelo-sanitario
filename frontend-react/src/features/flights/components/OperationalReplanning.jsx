/*
 * ACCESO A BASE DE DATOS
 * Trae datos de: aeronaves, aeropuertos, perfiles_comandante, usuarios.
 * Carga o modifica datos en: notificaciones, vuelos.
 * Lo hace a través de la API del backend (api.js); el detalle de cada llamada está comentado
 *   junto a ella.
 */
import { useEffect, useState } from "react";
import { api } from "../../../services/api";
import { OperationalAirportSelector } from "./OperationalAirportSelector";

export function OperationalReplanning({ flight, done, msg, reload }) {
 const [catalogs,setCatalogs]=useState({aircraft:[],commanders:[],airports:[]}),[form,setForm]=useState({aircraftId:"",comandanteId:"",destinoId:"",salida:"",llegada:""});
 // Lee aeronaves (aeronaves), comandantes activos (usuarios y perfiles_comandante) y aeropuertos (aeropuertos) para el formulario (GET).
 useEffect(()=>{Promise.all([api("/catalogs/aircraft"),api("/auth/users/commanders"),api("/catalogs/airports")]).then(([aircraft,commanders,airports])=>setCatalogs({aircraft,commanders,airports})).catch(e=>msg(e.message,true));},[]);
 // Envía la nueva asignación del vuelo operativo (POST): el backend actualiza vuelos y notifica al comandante (notificaciones).
 const send=async()=>{try{await api(`/flights/${flight.id}/operational-replanning`,{method:"POST",body:JSON.stringify(form)});msg("Nueva asignación enviada al comandante");await done();await reload();}catch(e){msg(e.message,true);}};
 return <div className="wide detail-actions"><h4>Replanificar asignación</h4><p>El origen se toma nuevamente de la ubicación actual de la aeronave.</p><label>Aeronave<select value={form.aircraftId} onChange={e=>setForm({...form,aircraftId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{catalogs.aircraft.map(x=><option key={x.id} value={x.id}>{x.matricula} — {x.aeropuertoActual}</option>)}</select></label><label>Comandante<select value={form.comandanteId} onChange={e=>setForm({...form,comandanteId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{catalogs.commanders.map(x=><option key={x.id} value={x.id}>{x.nombre} {x.apellido}</option>)}</select></label><OperationalAirportSelector value={form.destinoId} onChange={destinoId=>setForm({...form,destinoId})} initial={catalogs.airports}/><label>Salida<input type="datetime-local" value={form.salida} onChange={e=>setForm({...form,salida:e.target.value})}/></label><label>Llegada<input type="datetime-local" value={form.llegada} onChange={e=>setForm({...form,llegada:e.target.value})}/></label><button disabled={!form.aircraftId||!form.comandanteId||!form.destinoId||!form.salida||!form.llegada} onClick={send}>Enviar nueva asignación</button></div>;
}
