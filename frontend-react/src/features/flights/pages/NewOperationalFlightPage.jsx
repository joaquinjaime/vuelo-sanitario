import React from "react";
import { useNavigate } from "react-router-dom";
import { useNotify } from "../../../app/providers/NotifyProvider";
import { useOperationalData } from "../../../app/providers/OperationalDataProvider";
import { useResource } from "../../../hooks/useResource";
import { appPath } from "../../../app/navigation";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ErrorState, LoadingBlock } from "../../../components/ui/feedback";
import { OperationalFlightForm } from "../components/OperationalFlightForm";

const list = (rows) => (Array.isArray(rows) ? rows : []);

/** Nuevo vuelo operativo (Centro de Operaciones): el origen se toma de la ubicación actual de la aeronave. */
export function NewOperationalFlightPage() {
  const notify = useNotify();
  const navigate = useNavigate();
  const { reload } = useOperationalData();
  const aircraft = useResource("/catalogs/aircraft", { map: list });
  const commanders = useResource("/auth/users/commanders", { map: list });
  const airports = useResource("/catalogs/airports", { map: list });
  const loading = aircraft.loading || commanders.loading || airports.loading;
  const error = aircraft.error || commanders.error || airports.error;
  return (
    <>
      <PageHeader title="Nuevo vuelo operativo" description="Vuelos que no responden a una solicitud sanitaria. Queda pendiente de la confirmación del comandante."
        breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Vuelos", to: appPath("vuelos") }, { label: "Nuevo vuelo operativo" }]} />
      {loading ? <LoadingBlock label="Cargando catálogos…" /> : error ? <ErrorState message={error} onRetry={() => { aircraft.reload(); commanders.reload(); airports.reload(); }} /> :
        <OperationalFlightForm d={{ aircraft: aircraft.data, commanders: commanders.data, airports: airports.data }} msg={notify} done={async () => { await reload(); navigate(appPath("vuelos")); }} />}
    </>
  );
}
