import React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RedirectIfAuthenticated, RequireWorkspace, NotFound } from "./guards";
import { AppLayout } from "./layouts/AppLayout";
import { AuthLayout } from "../features/auth/AuthLayout";
import { LoginPage } from "../features/auth/LoginPage";
import { PasswordChangePage } from "../features/auth/PasswordChangePage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { MyAccountPage } from "../features/account/MyAccountPage";
import { UsersListPage } from "../features/users/UsersListPage";
import { UserCreatePage } from "../features/users/UserCreatePage";
import { UserDetailPage } from "../features/users/UserDetailPage";
import { AircraftListPage } from "../features/aircraft/AircraftListPage";
import { AircraftFormPage } from "../features/aircraft/AircraftFormPage";
import { AircraftDetailPage } from "../features/aircraft/AircraftDetailPage";
import { GeographyPage, CommanderLocationsPage, PatientsPage, AuditPage, HealthStaffPage } from "../features/admin/AdminPages";
import { RequestsPage } from "../features/flights/pages/RequestsPage";
import { FlightsPage } from "../features/flights/pages/FlightsPage";
import { NewRequestPage } from "../features/flights/pages/NewRequestPage";
import { NewOperationalFlightPage } from "../features/flights/pages/NewOperationalFlightPage";
import { FlightDetailPage } from "../features/flights/detail/FlightDetailPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";

const guard = (segment, element) => <RequireWorkspace segment={segment}>{element}</RequireWorkspace>;

/**
 * Tabla de rutas de la aplicación. Cada módulo tiene su pantalla; el detalle de solicitudes y vuelos admite una pestaña opcional
 * (`/app/vuelos/12/documentos`). El acceso por área lo define navigation.ROUTE_ACCESS (el mismo mapa que arma el menú lateral).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated>} />
      <Route path="/cambiar-contrasena" element={<PasswordChangePage />} />
      <Route path="/app" element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="inicio" replace />} />
          <Route path="inicio" element={guard("inicio", <DashboardPage />)} />
          <Route path="mi-cuenta" element={guard("mi-cuenta", <MyAccountPage />)} />

          <Route path="usuarios" element={guard("usuarios", <UsersListPage />)} />
          <Route path="usuarios/nuevo" element={guard("usuarios", <UserCreatePage />)} />
          <Route path="usuarios/:id" element={guard("usuarios", <UserDetailPage />)} />
          <Route path="aeronaves" element={guard("aeronaves", <AircraftListPage />)} />
          <Route path="aeronaves/nueva" element={guard("aeronaves", <AircraftFormPage />)} />
          <Route path="aeronaves/:id" element={guard("aeronaves", <AircraftDetailPage />)} />
          <Route path="aeronaves/:id/editar" element={guard("aeronaves", <AircraftFormPage />)} />
          <Route path="geografia" element={guard("geografia", <GeographyPage />)} />
          <Route path="pacientes" element={guard("pacientes", <PatientsPage />)} />
          <Route path="auditoria" element={guard("auditoria", <AuditPage />)} />
          <Route path="comandantes" element={guard("comandantes", <CommanderLocationsPage />)} />

          <Route path="solicitudes" element={guard("solicitudes", <RequestsPage />)} />
          <Route path="solicitudes/nueva" element={guard("solicitudes/nueva", <NewRequestPage />)} />
          <Route path="solicitudes/:id/:tab?" element={guard("solicitudes", <FlightDetailPage />)} />
          <Route path="vuelos" element={guard("vuelos", <FlightsPage />)} />
          <Route path="vuelos/nuevo" element={guard("vuelos/nuevo", <NewOperationalFlightPage />)} />
          <Route path="vuelos/:id/:tab?" element={guard("vuelos", <FlightDetailPage />)} />
          <Route path="informes" element={guard("informes", <ReportsPage />)} />
          <Route path="personal-sanitario" element={guard("personal-sanitario", <HealthStaffPage />)} />
          <Route path="notificaciones" element={guard("notificaciones", <NotificationsPage />)} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/app/inicio" replace />} />
      <Route path="*" element={<AuthLayout eyebrow="ERROR 404" title="La página no existe" lead="La dirección que abrió no corresponde a ninguna pantalla."><div className="auth-card"><Link className="button-link" to="/app/inicio">Ir al inicio</Link></div></AuthLayout>} />
    </Routes>
  );
}
