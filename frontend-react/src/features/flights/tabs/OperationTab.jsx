import React from "react";
import { Link } from "react-router-dom";
import { appPath } from "../../../app/navigation";
import { Card } from "../../../components/ui/Card";
import { FlightClosure, LifecycleActions } from "../../reports/closure";
import { FlightLog } from "../components/FlightLog";

/** Ejecución y cierre: iniciar/finalizar (Operaciones), bitácora e informe final. */
export function OperationTab({ ctx }) {
  const { flight, detail, show, id, workspace } = ctx;
  return (
    <div className="tab-stack">
      {workspace === "OPERACIONES" && show.has("ciclo") && ["PLANIFICADO", "EN_CURSO"].includes(flight.estado) && <Card><LifecycleActions flight={flight} run={(path, ok) => ctx.call(path, null, ok)} /></Card>}
      {show.has("cierre") && (detail.cierre || ["FINALIZADO", "COMPLETADO"].includes(flight.estado)) && <Card title="Cierre del vuelo"><FlightClosure flight={flight} cierre={detail.cierre} /><p className="hint"><Link to={appPath("informes")}>Ir a informes finales</Link></p></Card>}
      {show.has("bitacora") && <Card><FlightLog key={`log-${id}`} flightId={id} revision={ctx.logRevision} msg={ctx.notify} /></Card>}
    </div>
  );
}
