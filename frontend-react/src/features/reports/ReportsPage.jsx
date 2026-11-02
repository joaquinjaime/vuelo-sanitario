import React from "react";
import { useSession } from "../../app/providers/SessionProvider";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { PageHeader } from "../../components/ui/PageHeader";
import { CommanderReports, OperationsReports } from "./closure";
import { FlightLog } from "../flights/components/FlightLog";

/**
 * Informes finales. El comandante presenta (en 48 h desde la finalización), corrige y pide prórroga;
 * el Centro de Operaciones los revisa (aprobar y completar el vuelo, o devolver con motivo) y ve quiénes están atrasados.
 */
export function ReportsPage() {
  const { workspace } = useSession();
  const notify = useNotify();
  const commander = workspace === "COMANDANTE";
  return (
    <>
      <PageHeader title="Informes finales" breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Informes finales" }]}
        description={commander ? "Presente el informe de cada vuelo finalizado dentro del plazo. Un informe vencido bloquea sus funciones operativas." : "Revise los informes presentados por los comandantes y siga los que están pendientes."} />
      {commander
        ? <CommanderReports msg={notify} renderLog={(flightId) => <FlightLog flightId={flightId} allowWrite={false} msg={notify} />} />
        : <OperationsReports msg={notify} />}
    </>
  );
}
