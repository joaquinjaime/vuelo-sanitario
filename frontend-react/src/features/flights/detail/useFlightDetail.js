import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";
import { adaptDetail } from "../../../utils/flightAdapter";

/**
 * Detalle de un vuelo/solicitud. Sólo la lectura más reciente se aplica (una respuesta tardía de otro vuelo, o anterior a una
 * acción, nunca pisa a una más nueva). Si el refresco periódico de la lista informa otro estado (otra sesión actuó), vuelve a leer.
 */
export function useFlightDetail(id, flights = []) {
  const [state, setState] = useState({ detail: null, error: "", loading: true });
  const latest = useRef(0), idRef = useRef(id);
  idRef.current = id;
  const load = useCallback(async ({ quiet = false } = {}) => {
    const target = idRef.current;
    if (!target) return null;
    const mine = ++latest.current;
    try {
      const value = adaptDetail(await api(`/flights/${target}`));
      if (mine === latest.current) setState({ detail: value, error: "", loading: false });
      return value;
    } catch (error) {
      if (mine === latest.current && !quiet) setState((previous) => ({ detail: previous.detail, error: error.message || "No se pudo cargar el vuelo", loading: false }));
      return null;
    }
  }, []);
  useEffect(() => { latest.current++; setState({ detail: null, error: "", loading: true }); load(); return () => { latest.current++; }; }, [id, load]);
  useEffect(() => {
    const current = flights.find((flight) => String(flight.id) === String(id));
    if (current && state.detail?.vuelo && current.estado !== state.detail.vuelo.estado) load({ quiet: true });
  }, [flights]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}
