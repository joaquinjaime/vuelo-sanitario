import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui/Icon";

const NotifyContext = createContext(null);
const SUCCESS_MS = 6000;

/**
 * Avisos de resultado de las operaciones. Un éxito se retira solo; un error permanece hasta que se lo cierra.
 * Las pantallas siguen llamando `notify(texto, esError)`, igual que antes con `msg`/`notify`.
 */
export function NotifyProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const dismiss = useCallback((id) => setToasts((current) => current.filter((x) => x.id !== id)), []);
  const notify = useCallback((text, bad = false) => {
    if (!text) return;
    const id = ++counter.current;
    setToasts((current) => [...current.filter((x) => x.text !== text).slice(-3), { id, text: String(text), bad: Boolean(bad) }]);
    if (!bad) setTimeout(() => dismiss(id), SUCCESS_MS);
  }, [dismiss]);
  useEffect(() => () => { counter.current = 0; }, []);
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {createPortal(<div className="toast-region" aria-label="Avisos">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.bad ? "toast-error" : "toast-success"}`} role={toast.bad ? "alert" : "status"}>
            <Icon name={toast.bad ? "alert" : "check"} />
            <p>{toast.text}</p>
            <button type="button" className="toast-close" aria-label="Descartar mensaje" onClick={() => dismiss(toast.id)}><Icon name="x" /></button>
          </div>
        ))}
      </div>, document.body)}
    </NotifyContext.Provider>
  );
}

/** Devuelve `notify(texto, esError)`. Fuera del proveedor es una función vacía (componentes aislados en pruebas). */
export const useNotify = () => useContext(NotifyContext) || (() => {});
