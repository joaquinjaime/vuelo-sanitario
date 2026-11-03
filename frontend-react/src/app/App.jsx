import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./providers/ThemeProvider";
import { NotifyProvider } from "./providers/NotifyProvider";
import { SessionProvider } from "./providers/SessionProvider";
import { AppRoutes } from "./AppRoutes";

/** Proveedores globales (tema, avisos, sesión). El enrutador se inyecta para poder probar con MemoryRouter. */
export function AppProviders({ children }) {
  return <ThemeProvider><NotifyProvider><SessionProvider>{children}</SessionProvider></NotifyProvider></ThemeProvider>;
}

const routes = [{ path: "*", element: <AppProviders><AppRoutes /></AppProviders> }];

export function App() {
  const [router] = React.useState(() => createBrowserRouter(routes));
  return <RouterProvider router={router} />;
}
