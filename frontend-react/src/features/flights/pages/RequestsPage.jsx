import React from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../../app/providers/SessionProvider";
import { appPath } from "../../../app/navigation";
import { Icon } from "../../../components/ui/Icon";
import { FlightListPage, requestsHome } from "../FlightListPage";
import { InboxCounters, compareRequests, requestStage } from "../requestInbox";
import { useOperationalData } from "../../../app/providers/OperationalDataProvider";

const sanitary = (flight) => Boolean(flight.datosSanitarios);
const detailPath = (flight) => appPath(`solicitudes/${flight.id}`);
const byNewest = (a, b) => Number(b.id) - Number(a.id);

const DTS_STATES = {
  respuesta: ["PENDIENTE_RESPUESTA_DTS"],
  negociacion: ["SOLICITADO", "PENDIENTE_RESPUESTA_DTS"],
  preparacion: ["APROBADO", "PLANIFICADO", "PENDIENTE_CONFIRMACION_COMANDANTE", "PENDIENTE_RESPUESTA_OPERACIONES", "PENDIENTE_REPLANIFICACION", "EN_CURSO"],
  finalizadas: ["FINALIZADO", "COMPLETADO"],
  cerradas: ["CANCELADO", "RECHAZADO"],
};
const inStates = (key) => (flight) => sanitary(flight) && DTS_STATES[key].includes(flight.estado);

export const DTS_REQUEST_CONFIG = {
  title: "Mis solicitudes",
  description: "Solicitudes de traslado sanitario que usted cargó. Abra una para negociar el horario o seguir su avance.",
  breadcrumbs: requestsHome("Mis solicitudes"),
  detailPath,
  order: byNewest,
  noun: "solicitudes",
  searchLabel: "Buscar mis solicitudes",
  dateHeader: "Salida solicitada",
  emptyTitle: "Todavía no cargó ninguna solicitud",
  emptyText: "Cree una nueva solicitud de vuelo sanitario para iniciar la negociación del horario con el Centro de Operaciones.",
  emptyAction: <Link className="button-link" to={appPath("solicitudes/nueva")}><Icon name="plus" size={16} />Nueva solicitud</Link>,
  filters: [
    { value: "todas", label: "Todas", predicate: sanitary },
    { value: "respuesta", label: "Requieren mi respuesta", predicate: inStates("respuesta") },
    { value: "negociacion", label: "En negociación", predicate: inStates("negociacion") },
    { value: "preparacion", label: "Acordadas y en preparación", predicate: inStates("preparacion") },
    { value: "finalizadas", label: "Finalizadas", predicate: inStates("finalizadas") },
    { value: "cerradas", label: "Rechazadas o canceladas", predicate: inStates("cerradas") },
  ],
};

export const OPS_REQUEST_CONFIG = {
  title: "Solicitudes sanitarias",
  description: "Bandeja de solicitudes del DTS. Las nuevas aparecen primero: abra una para aceptar el horario, proponer otro o rechazarla.",
  breadcrumbs: requestsHome("Solicitudes"),
  detailPath,
  order: compareRequests,
  noun: "solicitudes",
  searchLabel: "Buscar solicitudes",
  emptyTitle: "No hay solicitudes sanitarias registradas",
  emptyText: "Cuando el DTS cargue una solicitud aparecerá aquí y en el inicio.",
  filters: [
    { value: "intervencion", label: "Requieren intervención", predicate: (f) => sanitary(f) && requestStage(f).open && requestStage(f).needsOps },
    { value: "espera", label: "Esperando al DTS", predicate: (f) => sanitary(f) && requestStage(f).open && !requestStage(f).needsOps },
    { value: "avanzadas", label: "En etapas posteriores", predicate: (f) => sanitary(f) && requestStage(f).key === "AVANZADA" },
    { value: "cerradas", label: "Rechazadas o canceladas", predicate: (f) => sanitary(f) && requestStage(f).key === "CERRADA" },
    { value: "todas", label: "Todas", predicate: sanitary },
  ],
};

/** Mis solicitudes (DTS) / Solicitudes sanitarias (Centro de Operaciones). */
export function RequestsPage() {
  const { workspace } = useSession();
  const { flights } = useOperationalData();
  if (workspace === "DTS") {
    return <FlightListPage config={DTS_REQUEST_CONFIG} extraActions={<Link className="button-link" to={appPath("solicitudes/nueva")}><Icon name="plus" size={16} />Nueva solicitud</Link>} />;
  }
  return (
    <FlightListPage config={OPS_REQUEST_CONFIG}>
      <InboxCounters flights={flights} />
    </FlightListPage>
  );
}
