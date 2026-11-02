import React from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../app/providers/SessionProvider";
import { useOperationalData } from "../../app/providers/OperationalDataProvider";
import { appPath } from "../../app/navigation";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/data";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { AttentionList } from "./AttentionList";
import { attentionFor } from "./attention";

const count = (flights, states) => flights.filter((f) => f.datosSanitarios && states.includes(f.estado)).length;

/** Inicio del DTS: qué solicitudes esperan su respuesta, cuáles están en curso y accesos a lo que hace con más frecuencia. */
export function DtsDashboard() {
  const { session } = useSession();
  const { flights, unread, updatedAt } = useOperationalData();
  const attention = attentionFor("DTS", flights).filter((f) => f.estado === "PENDIENTE_RESPUESTA_DTS");
  return (
    <>
      <PageHeader title={`Hola, ${session.username}`} description="Seguimiento de sus solicitudes de traslado sanitario." breadcrumbs={[{ label: "Inicio" }]}
        actions={<Link className="button-link" to={appPath("solicitudes/nueva")}><Icon name="plus" size={16} />Nueva solicitud</Link>} />
      <section className="stat-grid" aria-label="Resumen de mis solicitudes">
        <StatCard label="Requieren mi respuesta" value={attention.length} hint="contrapropuestas de Operaciones" tone={attention.length ? "attention" : "neutral"} to={`${appPath("solicitudes")}?filtro=respuesta`} />
        <StatCard label="En negociación" value={count(flights, ["SOLICITADO", "PENDIENTE_RESPUESTA_DTS"])} hint="horario sin acordar" to={`${appPath("solicitudes")}?filtro=negociacion`} />
        <StatCard label="Acordadas y en preparación" value={count(flights, ["APROBADO", "PLANIFICADO", "PENDIENTE_CONFIRMACION_COMANDANTE", "PENDIENTE_RESPUESTA_OPERACIONES", "PENDIENTE_REPLANIFICACION", "EN_CURSO"])} hint="vuelos en marcha" to={`${appPath("solicitudes")}?filtro=preparacion`} />
        <StatCard label="Avisos sin leer" value={unread} hint="notificaciones" to={appPath("notificaciones")} tone={unread ? "info" : "neutral"} />
      </section>
      <div className="dashboard-columns">
        <AttentionList title="Solicitudes que requieren su respuesta" flights={attention} section="solicitudes" seeAll={`${appPath("solicitudes")}?filtro=respuesta`} empty="No tiene solicitudes pendientes de respuesta." />
        <Card eyebrow="ACCESOS RÁPIDOS" title="Continuar trabajando" className="quick-links">
          <Link className="quick-link" to={appPath("solicitudes/nueva")}><Icon name="plus" /><span><strong>Crear una solicitud</strong><small>Registre un traslado sanitario y negocie el horario.</small></span></Link>
          <Link className="quick-link" to={appPath("solicitudes")}><Icon name="clipboard" /><span><strong>Consultar mis solicitudes</strong><small>Estados, contrapropuestas e historial.</small></span></Link>
          <Link className="quick-link" to={appPath("personal-sanitario")}><Icon name="heart" /><span><strong>Gestionar personal sanitario</strong><small>Médicos y enfermeros disponibles para sus vuelos.</small></span></Link>
        </Card>
      </div>
      {updatedAt && <p className="hint list-updated">Se actualiza automáticamente · última actualización {updatedAt}.</p>}
    </>
  );
}
