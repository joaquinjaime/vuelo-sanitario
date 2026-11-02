import React from "react";
import { Icon } from "./Icon";

/** Mensaje persistente dentro de la pantalla (no es un aviso transitorio). Los errores se anuncian como alerta. */
export function Alert({ tone = "info", title, children, action, className = "" }) {
  const icon = tone === "error" || tone === "warning" ? "alert" : tone === "success" ? "check" : "info";
  return (
    <div className={`alert alert-${tone} ${className}`.trim()} role={tone === "error" ? "alert" : "status"}>
      <Icon name={icon} />
      <div className="alert-body">{title && <strong>{title}</strong>}{children && <div>{children}</div>}</div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Cargando…" }) {
  return <span className="spinner-line" role="status"><span className="spinner" aria-hidden="true" />{label}</span>;
}

/** Estado de carga de un bloque o pantalla. */
export function LoadingBlock({ label = "Cargando…" }) {
  return <div className="loading-block"><Spinner label={label} /></div>;
}

/** Lista o pantalla sin registros: explica el motivo y, si corresponde, ofrece la acción para continuar. */
export function EmptyState({ title, children, action, icon = "inbox" }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={28} />
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}

/** Error de carga con reintento. */
export function ErrorState({ message, onRetry }) {
  return (
    <Alert tone="error" title="No se pudo cargar la información" action={onRetry && <button type="button" className="secondary-action" onClick={onRetry}>Reintentar</button>}>
      {message}
    </Alert>
  );
}
