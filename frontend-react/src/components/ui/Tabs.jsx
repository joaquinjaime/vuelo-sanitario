import React from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "./Icon";

/**
 * Pestañas con ruta propia: cada una tiene URL (se puede compartir, recargar y usar con Atrás/Adelante).
 * Una pestaña bloqueada se muestra, con el motivo, pero no es un enlace: no ofrece acciones que todavía no corresponden.
 * tabs: [{ key, label, to, locked?, reason?, badge? }]
 */
export function RouteTabs({ tabs, label = "Secciones" }) {
  return (
    <nav className="tabs" aria-label={label}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.key}>
            {tab.locked
              ? <span className="tab tab-locked" aria-disabled="true" title={tab.reason}><Icon name="lock" size={14} />{tab.label}<span className="visually-hidden"> (bloqueada: {tab.reason})</span></span>
              : <NavLink to={tab.to} end replace className={({ isActive }) => `tab${isActive ? " tab-active" : ""}`}>{tab.label}{tab.badge ? <span className="tab-badge">{tab.badge}</span> : null}</NavLink>}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Pestañas locales (sin URL) para alternar vistas dentro de una misma pantalla, p. ej. activos/desactivados cuando el filtro ya vive en la URL. */
export function SegmentedControl({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className={option.value === value ? "is-selected" : ""} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}{option.count !== undefined && <span className="segmented-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
