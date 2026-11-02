import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: foco atrapado, Escape lo cierra (si `dismissible`), el foco vuelve al elemento que lo abrió
 * y el contenido de fondo queda inerte para lectores de pantalla.
 */
export function Modal({ title, eyebrow, onClose, children, dismissible = true, wide = false, footer }) {
  const titleId = useId();
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    const first = panel.current?.querySelector("[data-autofocus]") || panel.current?.querySelector(FOCUSABLE) || panel.current;
    first?.focus?.();
    return () => { root?.removeAttribute("inert"); if (previous?.isConnected) previous.focus?.(); };
  }, []);
  const onKeyDown = (event) => {
    if (event.key === "Escape" && dismissible) { event.stopPropagation(); onClose?.(); return; }
    if (event.key !== "Tab") return;
    const nodes = [...panel.current.querySelectorAll(FOCUSABLE)];
    if (!nodes.length) { event.preventDefault(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (dismissible && event.target === event.currentTarget) onClose?.(); }}>
      <div ref={panel} className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="modal-head">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>
          {dismissible && <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="x" /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmación de una acción que no se puede deshacer. */
export function ConfirmDialog({ title, children, confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} dismissible={!busy}
      footer={<><button type="button" className="secondary-action" disabled={busy} onClick={onCancel}>{cancelLabel}</button><button type="button" className={danger ? "danger-action" : ""} disabled={busy} data-autofocus onClick={onConfirm}>{busy ? "Procesando…" : confirmLabel}</button></>}>
      {children}
    </Modal>
  );
}
