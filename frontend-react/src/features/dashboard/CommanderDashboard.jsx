import React from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../app/providers/SessionProvider";
import { useOperationalData } from "../../app/providers/OperationalDataProvider";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/data";
import { Alert } from "../../components/ui/feedback";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { AttentionList } from "./AttentionList";

const inState = (flights, states) => flights.filter((f) => states.includes(f.estado));
const byDeparture = (a, b) => String(a.salida || "9").localeCompare(String(b.salida || "9"));

/** Inicio del comandante: asignaciones por aceptar, próximos vuelos preparados y el estado de sus informes finales. */
export function CommanderDashboard() {
  const { session } = useSession();
  const { flights } = useOperationalData();
  const reports = useResource("/final-reports/mine", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const pending = inState(flights, ["PENDIENTE_CONFIRMACION_COMANDANTE"]);
  const planned = inState(flights, ["PLANIFICADO"]).sort(byDeparture);
  const running = inState(flights, ["EN_CURSO"]);
  const due = (reports.data || []).filter((x) => x.status === "PENDIENTE" || x.status === "DEVUELTO");
  const blocked = (reports.data || []).some((x) => x.bloqueado);
  return (
    <>
      <PageHeader title={`Hola, ${session.username}`} description="Sus asignaciones, los vuelos que debe preparar y sus informes finales." breadcrumbs={[{ label: "Inicio" }]}
        actions={<Link className="button-link" to={appPath("vuelos")}><Icon name="plane" size={16} />Ver mis vuelos</Link>} />
      {blocked && <Alert tone="error" title="Funciones bloqueadas por un informe final vencido" action={<Link className="button-link" to={appPath("informes")}>Presentar informe</Link>}>Mientras haya un informe vencido sólo puede consultar y presentar sus informes pendientes.</Alert>}
      <section className="stat-grid" aria-label="Resumen de mi operación">
        <StatCard label="Asignaciones por aceptar" value={pending.length} hint="requieren su respuesta" tone={pending.length ? "attention" : "neutral"} to={`${appPath("vuelos")}?filtro=accion`} />
        <StatCard label="Vuelos planificados" value={planned.length} hint="para preparar" to={`${appPath("vuelos")}?filtro=accion`} />
        <StatCard label="En curso" value={running.length} hint="vuelos en ejecución" to={`${appPath("vuelos")}?filtro=encurso`} />
        <StatCard label="Informes finales pendientes" value={reports.loading ? "…" : due.length} hint="presentar o corregir" tone={due.length ? "attention" : "neutral"} to={appPath("informes")} />
      </section>
      <div className="dashboard-columns">
        <AttentionList title="Asignaciones por aceptar" flights={pending} section="vuelos" seeAll={`${appPath("vuelos")}?filtro=accion`} empty="No tiene asignaciones pendientes de aceptación." />
        <AttentionList title="Próximos vuelos" eyebrow="PREPARACIÓN" flights={planned} section="vuelos" seeAll={`${appPath("vuelos")}?filtro=accion`} empty="No tiene vuelos planificados." limit={5} />
      </div>
      <Card eyebrow="ACCESOS RÁPIDOS" title="Continuar trabajando" className="quick-links">
        <div className="quick-grid">
          <Link className="quick-link" to={appPath("vuelos")}><Icon name="plane" /><span><strong>Mis vuelos</strong><small>Asignaciones, ruta, clima y documentos.</small></span></Link>
          <Link className="quick-link" to={appPath("informes")}><Icon name="file" /><span><strong>Informes finales</strong><small>Presentación, corrección y prórroga.</small></span></Link>
        </div>
      </Card>
    </>
  );
}
