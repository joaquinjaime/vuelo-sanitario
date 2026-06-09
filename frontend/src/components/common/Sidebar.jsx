import { NavLink } from 'react-router-dom'
import { LayoutDashboard, PlaneTakeoff, PlusCircle, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { ROLE_COLORS, ROLE_LABELS } from '../../utils/roleUtils'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard',       roles: null },
  { to: '/vuelos',         icon: PlaneTakeoff,    label: 'Vuelos',          roles: null },
  { to: '/nueva-peticion', icon: PlusCircle,      label: 'Nueva Petición',  roles: ['DTS'] },
]

export default function Sidebar({ open, onClose }) {
  const { user, hasRole } = useAuth()

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.some(r => hasRole(r))
  )

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />
      )}

      <aside className={clsx(
        'flex flex-col flex-shrink-0 bg-slate-900 border-r border-slate-800 z-40 transition-all duration-200',
        'fixed lg:relative h-full',
        open ? 'w-56 translate-x-0' : 'w-0 -translate-x-full lg:w-14 lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 flex-shrink-0">
          {open && <span className="font-bold text-sm text-slate-200 truncate">Vuelos Sanitarios</span>}
          <button onClick={onClose} className="lg:hidden text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-hidden">
          {visibleItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )}>
              <item.icon size={17} className="flex-shrink-0" />
              {open && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Role badge */}
        {open && (
          <div className="p-3 border-t border-slate-800">
            <div className={clsx('text-[10px] px-2 py-1 rounded border text-center font-semibold', ROLE_COLORS[user?.rol])}>
              {ROLE_LABELS[user?.rol]}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
