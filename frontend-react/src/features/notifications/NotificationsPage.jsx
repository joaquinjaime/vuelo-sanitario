import React from "react";
import { useOperationalData } from "../../app/providers/OperationalDataProvider";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { NotificationsPanel } from "../reports/closure";

/** Notificaciones del usuario (DTS, Centro de Operaciones y comandante), con las alertas de extrema urgencia destacadas. */
export function NotificationsPage() {
  const { notifications, unread, reload } = useOperationalData();
  const notify = useNotify();
  const urgent = notifications.filter((n) => String(n.tipo || "").includes("EXTREME_URGENCY"));
  return (
    <>
      <PageHeader title="Notificaciones" description="Avisos sobre sus solicitudes y vuelos. Se actualizan automáticamente." breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Notificaciones" }]} />
      <NotificationsPanel items={notifications} unread={unread} msg={notify} reload={reload} />
      {urgent.length > 0 && (
        <Card title="Alertas de extrema urgencia" className="notifications">
          {urgent.map((n) => <p className="urgency-detail" key={n.id}>⚠ <strong>EXTREMA URGENCIA</strong> — {n.mensaje}</p>)}
        </Card>
      )}
    </>
  );
}
