import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";

/**
 * Lee un recurso de la API. Sólo la respuesta de la lectura más reciente se aplica: una respuesta tardía (de otro id o de una lectura
 * anterior) nunca pisa a una más nueva. `reload({ quiet: true })` vuelve a leer sin mostrar «cargando» ni borrar lo que ya se ve.
 * path null/"" = no hay nada que leer todavía.
 */
export function useResource(path, { map = (value) => value, revision } = {}) {
  const [state, setState] = useState({ data: null, error: "", loading: Boolean(path) });
  const latest = useRef(0);
  const mapRef = useRef(map);
  mapRef.current = map;
  const load = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++latest.current;
    if (!path) { setState({ data: null, error: "", loading: false }); return null; }
    if (!quiet) setState((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const value = mapRef.current(await api(path));
      if (mine === latest.current) setState({ data: value, error: "", loading: false });
      return value;
    } catch (error) {
      if (mine === latest.current && !quiet) setState({ data: null, error: error.message || "No se pudo cargar la información", loading: false });
      return null;
    }
  }, [path]);
  useEffect(() => { setState({ data: null, error: "", loading: Boolean(path) }); load(); return () => { latest.current++; }; }, [load, path, revision]);
  return { ...state, reload: load, setData: (data) => setState((previous) => ({ ...previous, data })) };
}
