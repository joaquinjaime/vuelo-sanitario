import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../providers/SessionProvider";
import { OperationalDataProvider, useOperationalData } from "../providers/OperationalDataProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { inboxSections } from "../../features/flights/requestInbox";
import { attentionFor } from "../../features/dashboard/attention";
import { WorkspaceSelector } from "../../features/auth/WorkspaceSelector";
import { LegacyHashRedirect } from "../guards";
import { LoadingBlock } from "../../components/ui/feedback";

const readCollapsed = () => { try { return localStorage.getItem("vs-sidebar") === "collapsed"; } catch { return false; } };

function Shell() {
  const { session, workspace, workspaces, signOut, selectWorkspace } = useSession();
  const { flights, unread } = useOperationalData();
  const location = useLocation();
  const navigate = useNavigate();
  const main = useRef(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const label = workspaces.find((x) => x.id === workspace)?.label || "";

  // Contadores de la barra lateral: valores reales calculados con los vuelos ya cargados.
  const counts = useMemo(() => ({
    unread,
    attention: workspace === "OPERACIONES" ? inboxSections(flights).counts.intervencion : attentionFor(workspace, flights).length,
  }), [workspace, flights, unread]);

  // Cada pantalla nueva empieza arriba, con el foco en el contenido, y el menú móvil se cierra.
  const path = location.pathname;
  useEffect(() => { main.current?.scrollTo?.(0, 0); setMobileOpen(false); main.current?.focus({ preventScroll: true }); }, [path]);
  useEffect(() => { if (!mobileOpen) return undefined; const onKey = (e) => { if (e.key === "Escape") setMobileOpen(false); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [mobileOpen]);
  const toggleCollapsed = () => setCollapsed((value) => { const next = !value; try { localStorage.setItem("vs-sidebar", next ? "collapsed" : "expanded"); } catch { /* sin almacenamiento */ } return next; });

  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Saltar al contenido</a>
      <Sidebar workspace={workspace} workspaceLabel={label} counts={counts} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="app-body">
        <Topbar session={session} workspace={workspace} workspaceLabel={label} workspaces={workspaces} unread={unread} showNotifications={workspace !== "ADMIN"} menuOpen={mobileOpen}
          onOpenMenu={() => setMobileOpen(true)} onSelectWorkspace={selectWorkspace} onSignOut={() => { signOut(); navigate("/login", { replace: true }); }} />
        <main id="main-content" className="app-main" ref={main} tabIndex={-1}>
          <LegacyHashRedirect />
          <Suspense fallback={<LoadingBlock label="Cargando la pantalla…" />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}

/** Estructura de la aplicación autenticada: barra lateral persistente, barra superior y área de trabajo donde cambian las pantallas. */
export function AppLayout() {
  const { session, workspace } = useSession();
  if (!workspace) return <WorkspaceSelector />;
  // La clave incluye la cuenta: al cambiar de usuario no sobrevive ningún dato cargado para el anterior.
  return workspace === "ADMIN" ? <Shell /> : <OperationalDataProvider key={`${session?.username}:${workspace}`} scope={workspace === "DTS" ? "mine" : undefined}><Shell /></OperationalDataProvider>;
}
