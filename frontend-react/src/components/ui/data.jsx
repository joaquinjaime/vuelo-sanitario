import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { EmptyState } from "./feedback";

/**
 * Tabla de datos: contenedor con desplazamiento horizontal propio (no desborda la página), encabezados asociados y filas con una acción.
 * columns: [{ key, header, render(row), className?, align? }]
 */
export function DataTable({ caption, columns, rows, rowKey = (row) => row.id, rowClassName, empty }) {
  if (!rows.length) return empty || null;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="data-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col" className={column.className}>{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClassName ? rowClassName(row) : undefined}>
              {columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Paginación de una lista ya cargada en memoria (sólo para listados que el servidor entrega completos). */
export function paginate(items, page, size) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { pages, current, items: items.slice(current * size, current * size + size) };
}

export function Pagination({ page, pages, total, onPage, noun = "registros", disabled = false }) {
  if (pages <= 1 && !total) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <button type="button" className="secondary-action" disabled={disabled || page <= 0} onClick={() => onPage(page - 1)}><Icon name="chevronLeft" size={16} />Anterior</button>
      <span>Página {page + 1} de {Math.max(1, pages)} · {total} {noun}</span>
      <button type="button" className="secondary-action" disabled={disabled || page + 1 >= pages} onClick={() => onPage(page + 1)}>Siguiente<Icon name="chevronRight" size={16} /></button>
    </nav>
  );
}

/** Barra de búsqueda y filtros de un listado. */
export function FilterBar({ children, label = "Filtros" }) {
  return <div className="filter-bar" role="search" aria-label={label}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder, label }) {
  return (
    <label className="search-input">
      <span className="visually-hidden">{label}</span>
      <Icon name="search" size={16} />
      <input type="search" value={value} placeholder={placeholder} aria-label={label} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/** Contador de un panel: si recibe `to` es un acceso directo al listado correspondiente. */
export function StatCard({ label, value, hint, to, tone = "neutral" }) {
  const body = <><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{hint && <small>{hint}</small>}</>;
  return to ? <Link className={`stat-card stat-${tone}`} to={to}>{body}</Link> : <article className={`stat-card stat-${tone}`}>{body}</article>;
}

export function EmptyRow({ title, children, action }) {
  return <EmptyState title={title} action={action}>{children}</EmptyState>;
}
