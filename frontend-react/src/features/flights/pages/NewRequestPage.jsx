import { useNavigate } from "react-router-dom";
import { useNotify } from "../../../app/providers/NotifyProvider";
import { useOperationalData } from "../../../app/providers/OperationalDataProvider";
import { useResource } from "../../../hooks/useResource";
import { appPath } from "../../../app/navigation";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ErrorState, LoadingBlock } from "../../../components/ui/feedback";
import { NewRequestForm } from "../components/NewRequestForm";

/** Nueva solicitud de vuelo sanitario (DTS). Al registrarla vuelve al listado, donde la nueva solicitud ya figura. */
export function NewRequestPage() {
  const notify = useNotify();
  const navigate = useNavigate();
  const { reload } = useOperationalData();
  const priorities = useResource("/catalogs/priorities", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const conditions = useResource("/catalogs/patient-conditions", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const catalogError = priorities.error || conditions.error;
  const retry = () => { priorities.reload(); conditions.reload(); };
  return (
    <>
      <PageHeader title="Nueva solicitud de vuelo sanitario" description="Complete los datos del paciente, el traslado y la urgencia. Operaciones recibirá la solicitud para acordar el horario."
        breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Mis solicitudes", to: appPath("solicitudes") }, { label: "Nueva solicitud" }]} />
      {priorities.loading || conditions.loading ? <LoadingBlock label="Cargando catálogos…" /> : catalogError ? <ErrorState message={catalogError} onRetry={retry} /> :
        <NewRequestForm d={{ priorities: priorities.data || [], conditions: conditions.data || [] }} msg={notify} done={async () => { await reload(); navigate(appPath("solicitudes")); }} />}
    </>
  );
}
