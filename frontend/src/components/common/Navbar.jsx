import { useState } from 'react'
import { Menu, Bell, LogOut, ChevronDown, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNotificaciones } from '../../context/NotificacionContext'
import { ROLE_LABELS, ROLE_COLORS } from '../../utils/roleUtils'
import { formatDateTime } from '../../utils/dateUtils'

export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const { notificaciones, noLeidas, marcarLeida } = useNotificaciones()
  const [showNotif, setShowNotif]   = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-slate-900/80 backdrop-blur border-b border-slate-800 z-20 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">✈️</span>
          <span className="font-semibold text-sm text-slate-200 hidden sm:block">
            Vuelos Sanitarios
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">

        {/* Notificaciones */}
        <div className="relative">
          <button onClick={() => { setShowNotif(o => !o); setShowProfile(false) }}
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <Bell size={18} />
            {noLeidas > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <span className="font-semibold text-sm">Notificaciones</span>
                {noLeidas > 0 && (
                  <span className="text-xs text-blue-400">{noLeidas} sin leer</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notificaciones.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">Sin notificaciones</div>
                ) : notificaciones.slice(0, 10).map(n => (
                  <div key={n.idNotificacion}
                    onClick={() => !n.leida && marcarLeida(n.idNotificacion)}
                    className={`px-4 py-3 border-b border-slate-800/50 cursor-pointer transition-colors
                      ${n.leida ? 'opacity-60' : 'bg-blue-900/10 hover:bg-blue-900/20'}`}>
                    <div className="flex items-start gap-2">
                      {!n.leida && <span className="w-2 h-2 mt-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                      <div className={!n.leida ? '' : 'pl-4'}>
                        <p className="text-sm font-medium text-slate-200">{n.titulo}</p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.mensaje}</p>
                        <p className="text-xs text-slate-600 mt-1">{formatDateTime(n.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button onClick={() => { setShowProfile(o => !o); setShowNotif(false) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
              <User size={14} className="text-white" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-slate-200 leading-none">{user?.nombreCompleto}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{ROLE_LABELS[user?.rol]}</p>
            </div>
            <ChevronDown size={14} className="text-slate-500" />
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="font-semibold text-sm">{user?.nombreCompleto}</p>
                <span className={`inline-flex mt-1 text-[10px] px-2 py-0.5 rounded border ${ROLE_COLORS[user?.rol]}`}>
                  {ROLE_LABELS[user?.rol]}
                </span>
              </div>
              <button onClick={logout}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-colors">
                <LogOut size={15} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
