import React, { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "./providers/SessionProvider";
import { APP_BASE, appPath, legacyHashTarget, workspacesFor } from "./navigation";
import { EmptyState } from "../components/ui/feedback";

/** Exige sesión. Sin ella lleva a /login recordando la ruta pedida para volver tras ingresar; con contraseña temporal obliga a cambiarla. */
export function RequireAuth() {
  const { session } = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (session.debeCambiarContrasena) return <Navigate to="/cambiar-contrasena" replace />;
  return <Outlet />;
}

/** Ingresar a /login con sesión activa lleva a la aplicación (o a la ruta que se pedía). */
export function RedirectIfAuthenticated({ children }) {
  const { session } = useSession();
  const location = useLocation();
  if (session && !session.debeCambiarContrasena) return <Navigate to={location.state?.from || appPath("inicio")} replace />;
  if (session?.debeCambiarContrasena) return <Navigate to="/cambiar-contrasena" replace />;
  return children;
}

/**
 * Control de acceso por área. Si la ruta no pertenece al área activa pero sí a otra de las que el usuario tiene habilitadas,
 * cambia a esa área (una URL compartida abre la pantalla correcta); si no pertenece a ninguna, informa «sin permiso».
 */
export function RequireWorkspace({ segment, children }) {
  const { workspace, workspaces, selectWorkspace } = useSession();
  const allowed = workspacesFor(segment) || [];
  const owned = workspaces.map((x) => x.id);
  const permitted = allowed.includes(workspace);
  const alternative = !permitted ? allowed.find((id) => owned.includes(id)) : null;
  useEffect(() => { if (alternative) selectWorkspace(alternative); }, [alternative, selectWorkspace]);
  if (permitted) return children;
  if (alternative) return null;
  return <Forbidden />;
}

export function Forbidden() {
  return <EmptyState icon="lock" title="No tiene permiso para ver esta pantalla" action={<Link className="button-link" to={appPath("inicio")}>Ir al inicio</Link>}>Su área de trabajo no incluye este módulo. Si cree que es un error, consulte con un administrador.</EmptyState>;
}

export function NotFound() {
  return <EmptyState icon="search" title="La pantalla que busca no existe" action={<Link className="button-link" to={appPath("inicio")}>Ir al inicio</Link>}>Revise la dirección o use el menú lateral para navegar.</EmptyState>;
}

/** Convierte los enlaces antiguos «#/…» a rutas reales al abrir la aplicación. */
export function LegacyHashRedirect() {
  const { workspace } = useSession();
  const location = useLocation();
  const target = legacyHashTarget(location.hash, workspace);
  if (!target) return null;
  return <Navigate to={target} replace />;
}

export const HomeRedirect = () => <Navigate to={`${APP_BASE}/inicio`} replace />;
