import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext({ dark: false, toggle: () => {} });
const readDark = () => { try { return localStorage.getItem("vs-theme") === "dark"; } catch { return false; } };

/** Tema claro/oscuro persistente (`vs-theme`). El atributo se aplica a <html> y <body> porque los estilos históricos leen cualquiera de los dos. */
export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(readDark);
  useEffect(() => {
    const theme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    try { localStorage.setItem("vs-theme", theme); } catch { /* sin almacenamiento */ }
  }, [dark]);
  const value = useMemo(() => ({ dark, toggle: () => setDark((x) => !x) }), [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
