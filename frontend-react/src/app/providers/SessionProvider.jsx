import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { workspaceForRoles } from "../../features/auth/workspace";

const SessionContext = createContext(null);

const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const readSession = () => { try { return JSON.parse(localStorage.getItem("vs-session")); } catch { return null; } };
const clearStored = () => { try { localStorage.removeItem("vs-token"); localStorage.removeItem("vs-session"); sessionStorage.removeItem("vs-workspace"); } catch { /* almacenamiento no disponible */ } };

/**
 * Sesión JWT y área de trabajo activa. El token y los datos de la sesión conservan las mismas claves de siempre (`vs-token`, `vs-session`)
 * para que recargar una ruta mantenga la sesión. El área elegida (usuarios con más de un rol) vive en la pestaña (`sessionStorage`).
 */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [chosen, setChosen] = useState(() => read(sessionStorage, "vs-workspace"));
  const [notice, setNotice] = useState("");
  const workspaces = useMemo(() => workspaceForRoles(session?.roles), [session]);
  const workspace = workspaces.find((x) => x.id === chosen)?.id || (workspaces.length === 1 ? workspaces[0].id : null);

  const signIn = useCallback((response) => {
    const next = { username: response.username, roles: response.roles, debeCambiarContrasena: response.debeCambiarContrasena };
    localStorage.setItem("vs-token", response.accessToken);
    localStorage.setItem("vs-session", JSON.stringify(next));
    setNotice("");
    setSession(next);
  }, []);
  const signOut = useCallback((reason = "") => { clearStored(); setChosen(null); setNotice(typeof reason === "string" ? reason : ""); setSession(null); }, []);
  const selectWorkspace = useCallback((id) => {
    try { if (id) sessionStorage.setItem("vs-workspace", id); else sessionStorage.removeItem("vs-workspace"); } catch { /* sin almacenamiento */ }
    setChosen(id);
  }, []);

  useEffect(() => {
    const onUnauthorized = (event) => signOut(event.detail?.message || "La sesión venció. Volvé a ingresar.");
    window.addEventListener("vs:unauthorized", onUnauthorized);
    return () => window.removeEventListener("vs:unauthorized", onUnauthorized);
  }, [signOut]);
  // Cerrar sesión en otra pestaña cierra también ésta.
  useEffect(() => {
    const onStorage = (event) => { if (event.key === "vs-token" && !event.newValue) { setSession(null); setChosen(null); } };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({ session, workspaces, workspace, notice, signIn, signOut, selectWorkspace, hasRole: (role) => Boolean(session?.roles?.includes(role)) }), [session, workspaces, workspace, notice, signIn, signOut, selectWorkspace]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession requiere SessionProvider");
  return value;
};
