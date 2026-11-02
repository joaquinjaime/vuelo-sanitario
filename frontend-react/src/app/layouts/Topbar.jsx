import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { useTheme } from "../providers/ThemeProvider";
import { appPath } from "../navigation";

function UserMenu({ username, workspaceLabel, workspaces, onSelectWorkspace, onSignOut }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); } };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="user-menu" ref={root}>
      <button type="button" className="user-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{String(username || "?").slice(0, 1).toUpperCase()}</span>
        <span className="user-menu-text"><strong>{username}</strong><small>{workspaceLabel}</small></span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <Link role="menuitem" to={appPath("mi-cuenta")} onClick={() => setOpen(false)}><Icon name="user" size={16} />Mi cuenta</Link>
          {workspaces.length > 1 && <>
            <p className="menu-title">Cambiar de área</p>
            {workspaces.map((area) => <button key={area.id} type="button" role="menuitem" onClick={() => { setOpen(false); onSelectWorkspace(area.id); navigate(appPath("inicio")); }}>{area.label}</button>)}
          </>}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}><Icon name="logout" size={16} />Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}

/** Barra superior: abre el menú en móvil y reúne las funciones globales (avisos, tema, usuario y área). */
export function Topbar({ session, workspace, workspaceLabel, workspaces, unread, showNotifications, onOpenMenu, menuOpen, onSelectWorkspace, onSignOut }) {
  const { dark, toggle } = useTheme();
  return (
    <div className="topbar">
      <button type="button" className="icon-button menu-toggle" aria-label="Abrir el menú de navegación" aria-expanded={menuOpen} aria-controls="app-sidebar" onClick={onOpenMenu}><Icon name="menu" /></button>
      <p className="topbar-area">{workspaceLabel}</p>
      <div className="topbar-actions">
        {showNotifications && (
          <Link className="icon-button bell" to={appPath("notificaciones")} aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}>
            <Icon name="bell" />{unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
          </Link>
        )}
        <button type="button" className="icon-button" onClick={toggle} aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"}><Icon name={dark ? "sun" : "moon"} /></button>
        <UserMenu username={session.username} workspaceLabel={workspaceLabel} workspaces={workspaces} onSelectWorkspace={onSelectWorkspace} onSignOut={onSignOut} />
      </div>
    </div>
  );
}
