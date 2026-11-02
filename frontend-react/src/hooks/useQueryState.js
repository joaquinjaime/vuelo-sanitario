import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Filtros, búsqueda y página guardados en la URL (`?q=...&estado=...&pagina=2`): al volver desde un detalle o recargar,
 * el listado conserva su contexto, y la vista filtrada se puede compartir. Los cambios reemplazan la entrada del historial
 * para que Atrás regrese a la pantalla anterior y no recorra cada tecla escrita.
 * defaults: { clave: valorPorDefecto }; un valor igual al predeterminado no se escribe en la URL.
 */
export function useQueryState(defaults) {
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(defaults);
  const signature = keys.join("|");
  const values = useMemo(() => Object.fromEntries(keys.map((key) => [key, params.get(key) ?? defaults[key]])), [params, signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback((patch, { keepPage = false } = {}) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "" || String(value) === String(defaults[key] ?? "")) next.delete(key);
        else next.set(key, String(value));
      }
      if (!keepPage && !("pagina" in patch)) next.delete("pagina");
      return next;
    }, { replace: true });
  }, [setParams, signature]); // eslint-disable-line react-hooks/exhaustive-deps
  return [values, update];
}
