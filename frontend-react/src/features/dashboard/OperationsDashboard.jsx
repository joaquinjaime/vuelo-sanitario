import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../../app/providers/SessionProvider";
import { useOperationalData } from "../../app/providers/OperationalDataProvider";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/data";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { locationLabel } from "../../utils/format";
import { InboxCounters, RequestInbox } from "../flights/requestInbox";
import { useRouteStatuses } from "../flights/useRouteStatuses";
import { AttentionList } from "./AttentionList";
import { attentionFor } from "./attention";

/** Inicio del Centro de Operaciones: solicitudes nuevas y en negociación primero, luego el resto de lo que pide una decisión. */
export function OperationsDashboard() {
  const { session } = useSession();
  const { flights, updatedAt } = useOperationalData();
  const navigate = useNavigate();
  const statuses = useRouteStatuses(flights);
  const reports = useResource("/final-reports/pending-review", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const others = attentionFor("OPERACIONES", flights).filter((flight) => !flight.datosSanitarios);
  const pendingRoutes = flights.filter((flight) => statuses[flight.id]?.estado === "PENDIENTE_REVISION");
  const pendingReports = reports.data?.length ?? 0;
  return (
    <>
      <PageHeader title={`Hola, ${session.username}`} description="Solicitudes que requieren su intervención y tareas pendientes del Centro de Operaciones." breadcrumbs={[{ label: "Inicio" }]}
        actions={<Link className="button-link secondary-action" to={appPath("vuelos/nuevo")}><Icon name="plus" size={16} />Nuevo vuelo operativo</Link>} />
      <InboxCounters flights={flights} />
      <RequestInbox flights={flights} onOpen={(id) => navigate(appPath(`solicitudes/${id}`))} place={locationLabel} updatedAt={updatedAt} />
      <section className="stat-grid" aria-label="Otras tareas pendientes">
        <StatCard label="Rutas por revisar" value={pendingRoutes.length} hint="enviadas por comandantes" to={appPath("vuelos")} tone={pendingRoutes.length ? "attention" : "neutral"} />
        <StatCard label="Informes finales por revisar" value={reports.loading ? "…" : pendingReports} hint="presentados por comandantes" to={appPath("informes")} tone={pendingReports ? "attention" : "neutral"} />
        <StatCard label="Vuelos operativos que requieren decisión" value={others.length} hint="propuestas o replanificaciones" to={appPath("vuelos")} />
      </section>
      {others.length > 0 && <AttentionList title="Vuelos operativos que requieren una decisión" flights={others} section="vuelos" seeAll={appPath("vuelos")} empty="" />}
      <Card eyebrow="ACCESOS RÁPIDOS" title="Continuar trabajando" className="quick-links">
        <div className="quick-grid">
          <Link className="quick-link" to={appPath("solicitudes")}><Icon name="inbox" /><span><strong>Todas las solicitudes</strong><small>Filtre por situación y busque por código.</small></span></Link>
          <Link className="quick-link" to={appPath("vuelos")}><Icon name="plane" /><span><strong>Vuelos</strong><small>Planificación, ejecución y cierre.</small></span></Link>
          <Link className="quick-link" to={appPath("comandantes")}><Icon name="map" /><span><strong>Ubicación de comandantes</strong><small>Provincia operativa de cada comandante.</small></span></Link>
        </div>
      </Card>
    </>
  );
}
