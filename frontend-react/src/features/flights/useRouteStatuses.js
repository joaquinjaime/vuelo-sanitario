/*
 * ACCESO A BASE DE DATOS
 * Trae datos de: rutas_vuelo.
 * No carga ni modifica datos (sólo lectura).
 * Lo hace a través de la API del backend (api.js); el detalle de cada llamada está comentado
 *   junto a ella.
 */
import { useEffect, useState } from "react";
import { api } from "../../services/api";

/** Estado de la ruta de cada vuelo (para la cola de revisión de Operaciones). `revision` fuerza una nueva lectura. */
export function useRouteStatuses(flights, revision = 0, enabled = true) {
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    // Lee el estado de la ruta de cada vuelo (GET): rutas_vuelo; sólo lectura.
    api("/flights/route-statuses").then((rows) => { if (active && Array.isArray(rows)) setStatuses(Object.fromEntries(rows.map((row) => [row.flightId, row]))); }).catch(() => { if (active) setStatuses({}); });
    return () => { active = false; };
  }, [flights, revision, enabled]);
  return statuses;
}
