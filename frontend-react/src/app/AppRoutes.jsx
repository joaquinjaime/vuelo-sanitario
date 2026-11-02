import React, { lazy } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RedirectIfAuthenticated, RequireWorkspace, NotFound } from "./guards";
import { AppLayout } from "./layouts/AppLayout";
import { AuthLayout } from "../features/auth/AuthLayout";
import { LoginPage } from "../features/auth/LoginPage";
import { PasswordChangePage } from "../features/auth/PasswordChangePage";

// Cada pantalla se descarga al abrirla: el paquete inicial sólo trae el ingreso y la carcasa.
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const MyAccountPage = lazy(() => import("../features/account/MyAccountPage").then((m) => ({ default: m.MyAccountPage })));
const UsersListPage = lazy(() => import("../features/users/UsersListPage").then((m) => ({ default: m.UsersListPage })));
const UserCreatePage = lazy(() => import("../features/users/UserCreatePage").then((m) => ({ default: m.UserCreatePage })));
const UserDetailPage = lazy(() => import("../features/users/UserDetailPage").then((m) => ({ default: m.UserDetailPage })));
const AircraftListPage = lazy(() => import("../features/aircraft/AircraftListPage").then((m) => ({ default: m.AircraftListPage })));
const AircraftFormPage = lazy(() => import("../features/aircraft/AircraftFormPage").then((m) => ({ default: m.AircraftFormPage })));
const AircraftDetailPage = lazy(() => import("../features/aircraft/AircraftDetailPage").then((m) => ({ default: m.AircraftDetailPage })));
const RequestsPage = lazy(() => import("../features/flights/pages/RequestsPage").then((m) => ({ default: m.RequestsPage })));
const FlightsPage = lazy(() => import("../features/flights/pages/FlightsPage").then((m) => ({ default: m.FlightsPage })));
const NewRequestPage = lazy(() => import("../features/flights/pages/NewRequestPage").then((m) => ({ default: m.NewRequestPage })));
const NewOperationalFlightPage = lazy(() => import("../features/flights/pages/NewOperationalFlightPage").then((m) => ({ default: m.NewOperationalFlightPage })));
const FlightDetailPage = lazy(() => import("../features/flights/detail/FlightDetailPage").then((m) => ({ default: m.FlightDetailPage })));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const NotificationsPage = lazy(() => import("../features/notifications/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const GeographyPage = lazy(() => import("../features/admin/AdminPages").then((m) => ({ default: m.GeographyPage })));
const CommanderLocationsPage = lazy(() => import("../features/admin/AdminPages").then((m) => ({ default: m.CommanderLocationsPage })));
const PatientsPage = lazy(() => import("../features/admin/AdminPages").then((m) => ({ default: m.PatientsPage })));
const AuditPage = lazy(() => import("../features/admin/AdminPages").then((m) => ({ default: m.AuditPage })));
const HealthStaffPage = lazy(() => import("../features/admin/AdminPages").then((m) => ({ default: m.HealthStaffPage })));

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
