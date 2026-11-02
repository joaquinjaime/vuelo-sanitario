import { useEffect, useState } from "react";
import { api } from "../../services/api";

/** Estado de la ruta de cada vuelo (para la cola de revisión de Operaciones). `revision` fuerza una nueva lectura. */
export function useRouteStatuses(flights, revision = 0, enabled = true) {
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    api("/flights/route-statuses").then((rows) => { if (active && Array.isArray(rows)) setStatuses(Object.fromEntries(rows.map((row) => [row.flightId, row]))); }).catch(() => { if (active) setStatuses({}); });
    return () => { active = false; };
  }, [flights, revision, enabled]);
  return statuses;
}
