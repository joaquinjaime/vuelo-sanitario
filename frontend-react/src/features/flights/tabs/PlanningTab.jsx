import React from "react";
import { Card } from "../../../components/ui/Card";
import { AirportPlanning, CommanderAirportPlanning } from "../airportPlanning";
import { ResourceAssignment } from "../resourceAssignment";
import { FlightAircraft } from "../../aircraft/aircraft";
import { FlightRoute } from "../flightRoute";
import { HangarInfo } from "../components/HangarInfo";
import { AirportCoordinations } from "../components/AirportCoordinations";
import { WeatherLog } from "../components/WeatherLog";

/** Planificación del vuelo: aeropuertos, recursos, aeronave, ruta, hangar, coordinaciones y clima. Lo que se muestra lo fija la etapa. */
export function PlanningTab({ ctx }) {
  const { flight, detail, show, id, workspace } = ctx;
  const sanitary = Boolean(flight.datosSanitarios);
  const commander = workspace === "COMANDANTE";
  const planned = flight.estado === "PLANIFICADO";
  const agreedState = flight.estado === "APROBADO" || flight.estado === "PLANIFICADO";
  const airportsKey = `${id}-${detail.aeropuertos?.salida?.aeropuertoId || 0}-${detail.aeropuertos?.salida?.estado}-${detail.aeropuertos?.llegada?.aeropuertoId || 0}-${detail.aeropuertos?.llegada?.estado}`;
  return (
    <div className="tab-stack">
      {!commander && show.has("aeropuertos") && sanitary && <Card><AirportPlanning key={`airports-${airportsKey}`} flight={flight} plan={detail.aeropuertos} msg={ctx.notify} editable={agreedState} onChanged={ctx.afterChange} /></Card>}
      {commander && planned && sanitary && <Card><CommanderAirportPlanning key={`airport-plan-${airportsKey}`} flight={flight} plan={detail.aeropuertos} msg={ctx.notify} onSaved={ctx.afterRouteChange} /></Card>}
      {!commander && show.has("recursos") && sanitary && agreedState && <Card><ResourceAssignment key={`resources-${id}`} flight={flight} resources={detail.recursos} plan={detail.aeropuertos} msg={ctx.notify} onChanged={ctx.afterChange} /></Card>}
      {!commander && show.has("aeronave") && <Card><FlightAircraft key={`aircraft-${id}-${detail.recursos?.aircraftId || 0}`} flight={flight} recursos={detail.recursos} done={ctx.done} msg={ctx.notify} reload={ctx.reload} /></Card>}
      {show.has("ruta") && <Card><FlightRoute key={`route-${id}-${ctx.routeRevision}-${flight.estado}`} flightId={id} canEdit={commander} canReview={!commander} msg={ctx.notify} onChanged={commander ? undefined : ctx.afterRouteChange} /></Card>}
      {show.has("hangar") && <Card><HangarInfo key={`hangar-${id}`} flightId={id} msg={ctx.notify} /></Card>}
      {show.has("coordinaciones") && <Card><AirportCoordinations key={`airport-${id}-${ctx.logRevision}-${ctx.routeRevision}`} flightId={id} msg={ctx.notify} /></Card>}
      {show.has("clima") && <Card><WeatherLog key={`weather-${id}`} flightId={id} canRecord={commander && planned} msg={ctx.notify} /></Card>}
    </div>
  );
}
