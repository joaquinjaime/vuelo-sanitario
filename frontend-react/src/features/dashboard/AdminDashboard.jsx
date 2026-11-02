import React from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../app/providers/SessionProvider";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatCard } from "../../components/ui/data";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { ErrorState } from "../../components/ui/feedback";

/** Inicio del administrador: cuentas y aeronaves con sus datos reales (resumen de usuarios y catálogo de aeronaves). */
export function AdminDashboard() {
  const { session } = useSession();
  const users = useResource("/auth/users/summary");
  const aircraft = useResource("/catalogs/aircraft/admin", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const counts = users.data, fleet = aircraft.data || [];
  return (
    <>
      <PageHeader title={`Hola, ${session.username}`} description="Gestione cuentas y recursos. Las bajas y el historial siguen disponibles dentro de cada módulo." breadcrumbs={[{ label: "Inicio" }]}
        actions={<><Link className="button-link" to={appPath("usuarios/nuevo")}><Icon name="plus" size={16} />Añadir usuario</Link><Link className="button-link secondary-action" to={appPath("aeronaves/nueva")}><Icon name="plus" size={16} />Añadir aeronave</Link></>} />
      {users.error && <ErrorState message={`Resumen de usuarios: ${users.error}`} onRetry={users.reload} />}
      <section className="stat-grid" aria-label="Resumen administrativo">
        <StatCard label="Cuentas activas" value={counts ? counts.activos : "…"} hint="con acceso vigente" to={appPath("usuarios")} />
        <StatCard label="Activaciones pendientes" value={counts ? counts.pendientes : "…"} hint="requieren seguimiento" tone={counts?.pendientes ? "attention" : "neutral"} to={`${appPath("usuarios")}?estado=pendientes`} />
        <StatCard label="Cuentas desactivadas" value={counts ? counts.inactivos : "…"} hint="conservan su historial" to={`${appPath("usuarios")}?estado=desactivados`} />
        <StatCard label="Aeronaves activas" value={aircraft.loading ? "…" : fleet.filter((x) => x.activo).length} hint="disponibles en catálogo" to={appPath("aeronaves")} />
      </section>
      <Card eyebrow="ACCESOS RÁPIDOS" title="Gestión frecuente" className="quick-links">
        <div className="quick-grid">
          <Link className="quick-link" to={appPath("usuarios")}><Icon name="users" /><span><strong>Buscar y administrar usuarios</strong><small>Filtros por rol y estado, y acceso a desactivados.</small></span></Link>
          <Link className="quick-link" to={appPath("aeronaves")}><Icon name="plane" /><span><strong>Aeronaves</strong><small>Capacidad, ubicación y disponibilidad.</small></span></Link>
          <Link className="quick-link" to={appPath("auditoria")}><Icon name="shield" /><span><strong>Auditoría</strong><small>Operaciones administrativas registradas.</small></span></Link>
        </div>
      </Card>
    </>
  );
}
