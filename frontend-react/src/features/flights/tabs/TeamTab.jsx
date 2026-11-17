import { Card } from "../../../components/ui/Card";
import { FlightHealthStaff } from "../../health-staff/healthStaff";
import { FlightCrew } from "../components/FlightCrew";

/** Tripulación y personal sanitario, según el área. */
export function TeamTab({ ctx }) {
  const { flight, show, id, workspace } = ctx;
  const sanitary = Boolean(flight.datosSanitarios);
  const dts = workspace === "DTS", ops = workspace === "OPERACIONES", commander = workspace === "COMANDANTE";
  return (
    <div className="tab-stack">
      {show.has("tripulacion") && <Card><FlightCrew key={`crew-${id}`} flightId={id} canManage={ops} copilot={ops && !sanitary} state={flight.estado} msg={ctx.notify} /></Card>}
      {show.has("personal") && sanitary && !(commander && flight.estado === "PENDIENTE_CONFIRMACION_COMANDANTE") && <Card><FlightHealthStaff key={`health-staff-${id}-${flight.estado}`} flightId={id} mode={dts ? "dts" : "read"} state={flight.estado} msg={ctx.notify} /></Card>}
    </div>
  );
}
