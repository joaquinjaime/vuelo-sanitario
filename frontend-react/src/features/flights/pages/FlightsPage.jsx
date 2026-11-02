import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../../../app/providers/SessionProvider";
import { appPath } from "../../../app/navigation";
import { Icon } from "../../../components/ui/Icon";
import { Card } from "../../../components/ui/Card";
import { FlightListPage, requestsHome } from "../FlightListPage";
import { RouteReviewQueue, RouteStateBadge } from "../flightRoute";
import { useRouteStatuses } from "../useRouteStatuses";
import { useOperationalData } from "../../../app/providers/OperationalDataProvider";
import { ATTENTION_STATES } from "../../dashboard/attention";
import { isOpenState } from "../../../utils/format";

const detailPath = (flight) => appPath(`vuelos/${flight.id}`);
const byDeparture = (a, b) => String(b.salida || b.solicitada || "").localeCompare(String(a.salida || a.solicitada || "")) || Number(b.id) - Number(a.id);

const BASE_FILTERS = [
  { value: "abiertos", label: "Abiertos", predicate: (f) => isOpenState(f.estado) },
  { value: "encurso", label: "En curso", predicate: (f) => f.estado === "EN_CURSO" },
  { value: "finalizados", label: "Finalizados", predicate: (f) => ["FINALIZADO", "COMPLETADO"].includes(f.estado) },
  { value: "cerrados", label: "Cancelados o rechazados", predicate: (f) => ["CANCELADO", "RECHAZADO"].includes(f.estado) },
  { value: "todos", label: "Todos", predicate: () => true },
];

export const OPS_FLIGHT_CONFIG = {
  title: "Vuelos", description: "Todos los vuelos: sanitarios y operativos. Abra uno para planificarlo, asignar recursos o seguir su ejecución.",
  breadcrumbs: requestsHome("Vuelos"), detailPath, order: byDeparture, dateHeader: "Salida", noun: "vuelos", searchLabel: "Buscar vuelos",
  emptyTitle: "Todavía no hay vuelos registrados", emptyText: "Los vuelos sanitarios aparecen cuando el DTS carga una solicitud; también puede crear un vuelo operativo.",
  filters: BASE_FILTERS,
};

export const COMMANDER_FLIGHT_CONFIG = {
  title: "Mis vuelos", description: "Vuelos que se le asignaron. Primero figuran los que requieren su acción: confirmar una asignación o preparar el vuelo.",
  breadcrumbs: requestsHome("Mis vuelos"), detailPath, order: byDeparture, dateHeader: "Salida", noun: "vuelos", searchLabel: "Buscar mis vuelos",
  emptyTitle: "No tiene vuelos asignados", emptyText: "Cuando el Centro de Operaciones le asigne un vuelo aparecerá aquí y recibirá una notificación.",
  filters: [
    { value: "accion", label: "Requieren mi acción", predicate: (f) => ATTENTION_STATES.COMANDANTE.includes(f.estado) },
    ...BASE_FILTERS,
  ],
};

/** Vuelos (Centro de Operaciones, con la cola de revisión de rutas) / Mis vuelos (Comandante). */
export function FlightsPage() {
  const { workspace } = useSession();
  const { flights } = useOperationalData();
  const [revision] = useState(0);
  const statuses = useRouteStatuses(flights, revision, workspace === "OPERACIONES"); // la revisión de rutas es del Centro de Operaciones: al comandante el servidor se la niega
  const navigate = useNavigate();
  if (workspace === "COMANDANTE") return <FlightListPage config={COMMANDER_FLIGHT_CONFIG} />;
  const withRoute = [{ key: "ruta", header: "Ruta", render: (flight) => (statuses[flight.id]?.estado && statuses[flight.id].estado !== "SIN_PLANIFICAR" ? <RouteStateBadge estado={statuses[flight.id].estado} /> : <span className="hint">—</span>) }];
  const pending = flights.filter((f) => statuses[f.id]?.estado === "PENDIENTE_REVISION");
  return (
    <FlightListPage config={OPS_FLIGHT_CONFIG} extraColumns={withRoute}
      extraActions={<Link className="button-link" to={appPath("vuelos/nuevo")}><Icon name="plus" size={16} />Nuevo vuelo operativo</Link>}>
      {pending.length > 0 && <Card><RouteReviewQueue statuses={statuses} flights={flights} onOpen={(id) => navigate(appPath(`vuelos/${id}/planificacion`))} /></Card>}
    </FlightListPage>
  );
}
