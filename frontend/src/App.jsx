import { AuthProvider } from './context/AuthContext'
import { NotificacionProvider } from './context/NotificacionContext'
import AppRouter from './router/AppRouter'

export default function App() {
  return (
    <AuthProvider>
      <NotificacionProvider>
        <AppRouter />
      </NotificacionProvider>
    </AuthProvider>
  )
}
