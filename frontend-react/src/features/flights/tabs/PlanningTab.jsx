import React from "react";
import { AIRPORT_STATE_LABEL, AirportPlanning, CommanderAirportPlanning } from "../airportPlanning";
import { ResourceAssignment } from "../resourceAssignment";
import { FlightAircraft } from "../../aircraft/aircraft";
import { FlightRoute } from "../flightRoute";
import { HangarInfo } from "../components/HangarInfo";
import { AirportCoordinations } from "../components/AirportCoordinations";
import { WeatherLog } from "../components/WeatherLog";
import { PlanningPanel, PlanningPanels } from "../components/PlanningPanel";

export function PlanningTab({ ctx }) {
  const { flight, detail, show, id, workspace } = ctx;
  const sanitary = Boolean(flight.datosSanitarios);
  const commander = workspace === "COMANDANTE";
  const commanderCanWrite = commander && !ctx.commanderBlocked;
  const ops = workspace === "OPERACIONES";
  const planned = flight.estado === "PLANIFICADO";
  const agreedState = flight.estado === "APROBADO" || planned;
  const { aeropuertos: airports, recursos: resources } = detail;
  const airportSummary = [airports?.salida, airports?.llegada].map((slot) =>
    slot?.aeropuertoId ? `${slot.aeropuerto} (${AIRPORT_STATE_LABEL[slot.estado] || slot.estado})` : "Sin definir",
  ).join(" → ");
  const aircraft = <FlightAircraft flight={flight} recursos={resources} canManage={ops} actionOnly={sanitary}
    done={ctx.done} msg={ctx.notify} reload={ctx.afterRouteChange} />;
  const revision = `${ctx.routeRevision}-${flight.estado}`;
  return (
    <PlanningPanels>
      {show.has("aeropuertos") && sanitary && <PlanningPanel title="Aeropuertos de salida y llegada" summary={airportSummary}>
        {() => <>
          <AirportPlanning flight={flight} plan={airports} msg={ctx.notify} editable={ops && agreedState} onChanged={ctx.afterRouteChange} />
          {commanderCanWrite && planned && <CommanderAirportPlanning flight={flight} plan={airports} msg={ctx.notify} onSaved={ctx.afterRouteChange} />}
        </>}
      </PlanningPanel>}
      {sanitary && (show.has("recursos") || show.has("aeropuertos")) && <PlanningPanel title="Asignación de recursos"
        summary={`${resources?.aircraftMatricula || "Aeronave sin asignar"} · ${resources?.commanderId ? "Comandante asignado" : "Comandante sin asignar"}`}>
        {() => <ResourceAssignment flight={flight} resources={resources} plan={airports} msg={ctx.notify}
          onChanged={ctx.afterRouteChange} canManage={ops} aircraftAction={ops && planned ? aircraft : null} />}
      </PlanningPanel>}
      {!sanitary && show.has("aeronave") && <PlanningPanel title="Aeronave" summary={resources?.aircraftMatricula || "Sin asignar"}>{() => aircraft}</PlanningPanel>}
      {show.has("ruta") && <FlightRoute revision={revision} flightId={id} canEdit={commanderCanWrite} canReview={ops} msg={ctx.notify} onChanged={commander ? undefined : ctx.afterChange} />}
      {show.has("hangar") && <HangarInfo canComplete={flight.estado !== "EN_CURSO"} canManage={ops} revision={revision} flightId={id} canObserve={commanderCanWrite} msg={ctx.notify} />}
      {show.has("coordinaciones") && <AirportCoordinations canManage={ops} revision={revision} flightId={id} msg={ctx.notify} />}
      {show.has("clima") && <WeatherLog flightId={id} canRecord={commanderCanWrite && planned} msg={ctx.notify} />}
    </PlanningPanels>
  );
}
