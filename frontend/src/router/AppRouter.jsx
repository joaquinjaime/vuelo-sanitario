import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoginPage        from '../pages/LoginPage'
import DashboardPage    from '../pages/DashboardPage'
import VuelosListPage   from '../pages/VuelosListPage'
import VueloDetailPage  from '../pages/VueloDetailPage'
import NuevaPeticionPage from '../pages/NuevaPeticionPage'
import HistorialPage    from '../pages/HistorialPage'
import InformeFinalPage from '../pages/InformeFinalPage'
import Layout           from '../components/common/Layout'

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function RoleRoute({ children, roles }) {
  const { hasRole } = useAuth()
  const allowed = roles.some(r => hasRole(r))
  return allowed ? children : <Navigate to="/dashboard" replace />
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={
          <PrivateRoute><Layout /></PrivateRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"  element={<DashboardPage />} />
          <Route path="vuelos"     element={<VuelosListPage />} />
          <Route path="vuelos/:id" element={<VueloDetailPage />} />
          <Route path="vuelos/:id/historial"     element={<HistorialPage />} />
          <Route path="vuelos/:id/informe-final" element={<InformeFinalPage />} />

          <Route path="nueva-peticion" element={
            <RoleRoute roles={['DTS']}>
              <NuevaPeticionPage />
            </RoleRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
