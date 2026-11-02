import React from "react";

/** Tarjeta de contenido con título opcional y acciones alineadas a la derecha. */
export function Card({ title, eyebrow, actions, children, className = "", as: Tag = "section", ...rest }) {
  return (
    <Tag className={`card ${className}`.trim()} {...rest}>
      {(title || actions) && (
        <div className="section-title">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}{title && <h2>{title}</h2>}</div>
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** Campo de formulario: etiqueta, control, ayuda y error asociados para lectores de pantalla. */
export function Field({ label, hint, error, required, children, className = "", id }) {
  const base = id || `f-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const describedBy = [hint && `${base}-hint`, error && `${base}-error`].filter(Boolean).join(" ") || undefined;
  const control = React.isValidElement(children) ? React.cloneElement(children, { id: children.props.id || base, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required: required ?? children.props.required }) : children;
  return (
    <div className={`field ${className}`.trim()}>
      <label htmlFor={base}>{label}{required && <span className="required-mark" aria-hidden="true"> *</span>}</label>
      {control}
      {hint && <small id={`${base}-hint`} className="hint">{hint}</small>}
      {error && <small id={`${base}-error`} className="error">{error}</small>}
    </div>
  );
}

/** Grupo de acciones de un formulario: primaria + cancelar. */
export function FormActions({ children }) {
  return <div className="form-actions">{children}</div>;
}
