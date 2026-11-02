import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

/** Ruta de navegación («migas»): el último elemento es la pantalla actual y no es un enlace. */
export function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;
  return (
    <nav className="breadcrumbs" aria-label="Ruta de navegación">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {last || !item.to ? <span aria-current={last ? "page" : undefined}>{item.label}</span> : <Link to={item.to}>{item.label}</Link>}
              {!last && <Icon name="chevronRight" size={14} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Encabezado de cada pantalla: migas, título (h1 único de la página), descripción breve, estado y acciones principales.
 * También actualiza el título del documento para el historial y las pestañas del navegador.
 */
export function PageHeader({ title, description, breadcrumbs, actions, meta, titleExtra }) {
  useEffect(() => { document.title = `${typeof title === "string" ? title : "Vuelos Sanitarios"} · Vuelos Sanitarios`; }, [title]);
  return (
    <header className="page-header">
      <Breadcrumbs items={breadcrumbs} />
      <div className="page-header-row">
        <div className="page-header-text">
          <div className="page-title-line"><h1>{title}</h1>{titleExtra}</div>
          {description && <p className="page-description">{description}</p>}
          {meta && <div className="page-meta">{meta}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
