import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { NAVIGATION, appPath } from "../navigation";

/**
 * Menú lateral persistente. Muestra sólo los módulos del área activa, agrupados; cada opción es un enlace a una pantalla real.
 * En escritorio puede contraerse a iconos; en móvil es un panel deslizable que se cierra al navegar.
 * `counts`: contadores dinámicos { attention, unread }.
 */
export function Sidebar({ workspace, workspaceLabel, counts, collapsed, onToggleCollapsed, mobileOpen, onClose }) {
  const groups = NAVIGATION[workspace] || [];
  const { pathname } = useLocation();
  return (
    <>
      <aside id="app-sidebar" className={`sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-open" : ""}`} aria-label="Navegación principal">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="plane" size={22} /></span>
          <span className="brand-text"><strong>Vuelos Sanitarios</strong><small>{workspaceLabel}</small></span>
        </div>
        <nav className="sidebar-nav" aria-label="Módulos">
          {groups.map((group, index) => (
            <div className="nav-group" key={group.title || index}>
              {group.title && <p className="nav-group-title">{group.title}</p>}
              <ul>
                {group.items.map((item) => {
                  const count = item.badge ? counts?.[item.badge] : 0;
                  return (
                    <li key={item.to}>
                      <NavLink to={appPath(item.to)} end={item.end ?? false} className={({ isActive }) => `nav-link${isActive && !(item.excludes || []).some((x) => pathname.startsWith(appPath(x))) ? " is-active" : ""}`} title={collapsed ? item.label : undefined} onClick={onClose}>
                        <Icon name={item.icon} />
                        <span className="nav-label">{item.label}</span>
                        {count > 0 && <span className="nav-count" title={item.badge === "unread" ? "Avisos sin leer" : "Requieren su atención"}>{count}<span className="visually-hidden"> {item.badge === "unread" ? "sin leer" : "pendientes"}</span></span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <button type="button" className="sidebar-collapse" onClick={onToggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? "Expandir el menú lateral" : "Contraer el menú lateral"}>
          <Icon name="panelLeft" /><span className="nav-label">Contraer menú</span>
        </button>
      </aside>
      {mobileOpen && <div className="sidebar-overlay" role="presentation" onClick={onClose} />}
    </>
  );
}
