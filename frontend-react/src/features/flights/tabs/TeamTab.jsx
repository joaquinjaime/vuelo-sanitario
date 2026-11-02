import React from "react";
import { Card } from "../../../components/ui/Card";
import { FlightHealthStaff } from "../../health-staff/healthStaff";
import { TransferContacts } from "../transferContacts";
import { FlightCrew } from "../components/FlightCrew";

/** Tripulación, personal sanitario y contactos del traslado, según el área. */
export function TeamTab({ ctx }) {
  const { flight, show, id, workspace } = ctx;
  const sanitary = Boolean(flight.datosSanitarios);
  const dts = workspace === "DTS", ops = workspace === "OPERACIONES", commander = workspace === "COMANDANTE";
  return (
    <div className="tab-stack">
      {show.has("tripulacion") && <Card><FlightCrew key={`crew-${id}`} flightId={id} canManage={ops} copilot={ops && !sanitary} state={flight.estado} msg={ctx.notify} /></Card>}
      {show.has("personal") && sanitary && !(commander && flight.estado === "PENDIENTE_CONFIRMACION_COMANDANTE") && <Card><FlightHealthStaff key={`health-staff-${id}-${flight.estado}`} flightId={id} mode={dts ? "dts" : "read"} state={flight.estado} msg={ctx.notify} /></Card>}
      {show.has("contactos") && sanitary && !commander && <Card><TransferContacts key={`tc-${id}`} flightId={id} mode={dts ? "dts" : "ops"} msg={ctx.notify} /></Card>}
    </div>
  );
}
