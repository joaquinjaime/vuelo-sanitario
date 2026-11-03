import React from "react";
import { act, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from "react-router-dom";
import { AppProviders } from "./app/App";
import { AppRoutes } from "./app/AppRoutes";

/** Deja una sesión iniciada (JWT simulado) con esos roles; `workspace` fija el área activa para usuarios con varios roles. */
export function signIn(roles, extra = {}) {
  localStorage.setItem("vs-token", "test-token");
  localStorage.setItem("vs-session", JSON.stringify({ username: extra.username || "usuario", roles, debeCambiarContrasena: false, ...extra }));
  try { sessionStorage.removeItem("vs-workspace"); if (extra.workspace) sessionStorage.setItem("vs-workspace", extra.workspace); } catch { /* sin almacenamiento */ }
}

export const ROLE = { admin: "ADMINISTRADOR", dts: "DTS", ops: "CENTRO_OPERACIONES", cmd: "COMANDANTE" };

// Permite a una prueba navegar dentro de la aplicación (como un clic en un enlace) y leer la ruta actual.
let navigateRef = null, locationRef = null;
function Probe() { navigateRef = useNavigate(); locationRef = useLocation(); return null; }
export const go = (to) => act(async () => { navigateRef(to); });
export const currentPath = () => `${locationRef.pathname}${locationRef.search}`;

/** Renderiza la aplicación completa (proveedores + tabla de rutas) en una ruta: lo más parecido a abrir esa URL en el navegador. */
export function renderApp(route = "/app/inicio", { roles, ...extra } = {}) {
  if (roles) signIn(roles, extra);
  const router = createMemoryRouter([{ path: "*", element: <AppProviders><Probe /><AppRoutes /></AppProviders> }], { initialEntries: Array.isArray(route) ? route : [route] });
  return render(<RouterProvider router={router} />);
}
