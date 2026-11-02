import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * «Volver» que respeta el contexto: regresa a la pantalla anterior del historial (con sus filtros y página, que viven en la URL)
 * y, si la pantalla se abrió directamente desde un enlace, lleva al listado de respaldo en lugar de salir de la aplicación.
 */
export function useBack(fallback) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => { if (location.key !== "default") navigate(-1); else navigate(fallback, { replace: true }); }, [navigate, location.key, fallback]);
}
