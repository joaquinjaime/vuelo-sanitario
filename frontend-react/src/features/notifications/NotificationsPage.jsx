import React from "react";
import { useOperationalData } from "../../app/providers/OperationalDataProvider";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { useSession } from "../../app/providers/SessionProvider";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { NotificationsPanel } from "../reports/closure";

/** Notificaciones del usuario (DTS, Centro de Operaciones y comandante), con las alertas de extrema urgencia destacadas. */
export function NotificationsPage() {
  const { notifications, unread, reload } = useOperationalData();
  const notify = useNotify();
  const { workspace } = useSession();
  // El DTS y los avisos de solicitudes abren la solicitud; el comandante y los vuelos operativos, el vuelo.
  const REQUEST_NOTICES = /SANITARY|EXTREME_URGENCY|SCHEDULE|REQUEST_REJECTED/;
  const linkFor = (n) => appPath(`${workspace === "DTS" || (workspace === "OPERACIONES" && REQUEST_NOTICES.test(n.tipo || "")) ? "solicitudes" : "vuelos"}/${n.flightId}`);
  const urgent = notifications.filter((n) => String(n.tipo || "").includes("EXTREME_URGENCY"));
  return (
    <>
      <PageHeader title="Notificaciones" description="Avisos sobre sus solicitudes y vuelos. Se actualizan automáticamente." breadcrumbs={[{ label: "Inicio", to: appPath("inicio") }, { label: "Notificaciones" }]} />
      <NotificationsPanel items={notifications} unread={unread} msg={notify} reload={reload} linkFor={linkFor} />
      {urgent.length > 0 && (
        <Card title="Alertas de extrema urgencia" className="notifications">
          {urgent.map((n) => <p className="urgency-detail" key={n.id}>⚠ <strong>EXTREMA URGENCIA</strong> — {n.mensaje}</p>)}
        </Card>
      )}
    </>
  );
}
