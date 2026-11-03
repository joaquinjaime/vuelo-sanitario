import React, { createContext, useContext, useId, useRef, useState } from "react";

export const DRAFT_WARNING = "Hay un formulario abierto. ¿Descartar los cambios sin guardar?";
const OpenPanel = createContext(null);

export function PlanningPanels({ children }) {
  const [activeId, setActiveId] = useState(null);
  const activePanel = useRef(null);
  const toggle = (id, close, panel) => {
    const previous = activePanel.current;
    if (previous?.id === id) {
      if (!close()) return;
      activePanel.current = null;
      setActiveId(null);
      return;
    }
    if (previous?.element?.isConnected && !previous.close()) return;
    activePanel.current = { id, close, element: panel };
    setActiveId(id);
  };
  return <OpenPanel.Provider value={{ activeId, toggle }}><div className="tab-stack">{children}</div></OpenPanel.Provider>;
}

export function PlanningPanel({ title, summary, children, onClose }) {
  const id = useId();
  const group = useContext(OpenPanel);
  const [standaloneOpen, setStandaloneOpen] = useState(false);
  const panel = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const open = group ? group.activeId === id : standaloneOpen;
  const close = () => {
    if (panel.current?.querySelector("[data-flight-draft]") && !window.confirm(DRAFT_WARNING)) return false;
    onCloseRef.current?.();
    return true;
  };
  return <details ref={panel} className="planning-panel" open={open}>
    <summary onClick={(event) => {
      event.preventDefault();
      if (group) group.toggle(id, close, panel.current);
      else if (!open || close()) setStandaloneOpen(!open);
    }}>
      <span className="planning-title">{title}</span>
      <span className="planning-status">{summary}</span>
    </summary>
    <div className="planning-body" hidden={!open}>{typeof children === "function" ? open && children() : children}</div>
  </details>;
}

export function readStatus({ data, error }, describe) {
  if (error && !data) return "Consulta no disponible";
  return data ? describe(data) : "Cargando información…";
}
