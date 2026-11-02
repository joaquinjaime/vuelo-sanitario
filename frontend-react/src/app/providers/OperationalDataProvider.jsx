import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../services/api";
import { adaptFlight } from "../../utils/flightAdapter";
import { updateStamp } from "../../utils/format";
import { INBOX_REFRESH_MS } from "../../features/flights/requestInbox";
import { useNotify } from "./NotifyProvider";

const OperationalDataContext = createContext(null);

/**
 * Datos que comparten todas las pantallas operativas (DTS, Centro de Operaciones y Comandante): los vuelos visibles y los avisos.
 * Las solicitudes nuevas aparecen sin recargar: con la pestaña visible (y al volver a ella) se refrescan sólo estos dos GET.
 * Los catálogos (prioridades, aeronaves, aeropuertos, comandantes) los pide cada pantalla que los necesita.
 */
export function OperationalDataProvider({ children }) {
  const notify = useNotify();
  const [state, setState] = useState({ flights: [], notifications: [], unread: 0, updatedAt: null, loading: true, error: "" });
  const loadGeneration = useRef(0), pollGeneration = useRef(0);

  const apply = (rows, n) => {
    const items = n?.items || n?.content || [];
    return { flights: Array.isArray(rows) ? rows.map(adaptFlight) : [], notifications: items, unread: n?.unread ?? items.filter((x) => !x.leido).length, updatedAt: updateStamp() };
  };

  /** Carga completa: cada fuente por separado, para que la falla de una no vacíe a la otra. */
  const reload = useCallback(async () => {
    const generation = ++loadGeneration.current;
    pollGeneration.current++;
    const failures = [];
    await Promise.all([
      ["vuelos", "/flights", (rows) => ({ flights: rows.map(adaptFlight), updatedAt: updateStamp() })],
      ["notificaciones", "/notifications", (n) => { const rows = n.items || n.content || []; return { notifications: rows, unread: n.unread ?? rows.filter((x) => !x.leido).length }; }],
    ].map(async ([label, path, map]) => {
      try { const values = map(await api(path)); if (generation === loadGeneration.current) setState((previous) => ({ ...previous, ...values })); }
      catch (error) { failures.push(`No se pudo cargar ${label}: ${error.message}`); }
    }));
    if (generation !== loadGeneration.current) return;
    setState((previous) => ({ ...previous, loading: false, error: failures.join(" · ") }));
    if (failures.length) notify(failures.join(" · "), true);
  }, [notify]);

  const refresh = useCallback(async () => {
    const poll = ++pollGeneration.current, full = loadGeneration.current;
    try {
      const [rows, n] = await Promise.all([api("/flights"), api("/notifications")]);
      if (poll !== pollGeneration.current || full !== loadGeneration.current || !Array.isArray(rows)) return;
      setState((previous) => ({ ...previous, ...apply(rows, n), loading: false, error: "" }));
    } catch { /* El próximo ciclo o «Actualizar» lo reintenta; un fallo transitorio no debe tapar la pantalla con errores. */ }
  }, []);

  useEffect(() => { reload(); return () => { loadGeneration.current++; }; }, [reload]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState !== "hidden") refresh(); };
    const timer = setInterval(tick, INBOX_REFRESH_MS);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <OperationalDataContext.Provider value={value}>{children}</OperationalDataContext.Provider>;
}

const EMPTY = { flights: [], notifications: [], unread: 0, updatedAt: null, loading: false, error: "", reload: async () => {} };
/** Vuelos y avisos del usuario. Fuera del área operativa (administración) devuelve datos vacíos. */
export const useOperationalData = () => useContext(OperationalDataContext) || EMPTY;
