import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PlaneTakeoff, Clock, CheckCircle, XCircle, BarChart2, Plus } from 'lucide-react'
import { vueloApi } from '../api/vueloApi'
import { useAuth } from '../context/AuthContext'
import VueloCard from '../components/vuelo/VueloCard'
import { ROLE_LABELS, ROLE_COLORS, canCreatePeticion } from '../utils/roleUtils'
import clsx from 'clsx'

const STAT_CARDS = [
  { label: 'Planeamiento', estado: 'PLANEAMIENTO', icon: Clock,         color: 'text-blue-400',    bg: 'bg-blue-900/20' },
  { label: 'Vigentes',     estado: 'VIGENTE',       icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
  { label: 'En Ejecución', estado: 'EN_EJECUCION',  icon: PlaneTakeoff,  color: 'text-amber-400',   bg: 'bg-amber-900/20' },
  { label: 'Cancelados',   estado: 'CANCELADO',     icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-900/20' },
]

export default function DashboardPage() {
  const { user, hasRole } = useAuth()
  const navigate = useNavigate()

  const { data: vuelos = [], isLoading } = useQuery({
    queryKey: ['vuelos'],
    queryFn: () => vueloApi.listar(),
  })

  const countByEstado = (estado) => vuelos.filter(v => v.estado === estado).length
  const recientes = vuelos.slice(0, 6)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Bienvenido, <span className="text-slate-300">{user?.nombreCompleto}</span>
            {' · '}
            <span className={clsx('text-xs', ROLE_COLORS[user?.rol]?.split(' ')[0])}>
              {ROLE_LABELS[user?.rol]}
            </span>
          </p>
        </div>
        {canCreatePeticion(user?.rol) && (
          <button onClick={() => navigate('/nueva-peticion')} className="btn-primary">
            <Plus size={15} />
            Nueva Petición
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(stat => (
          <div key={stat.estado}
            onClick={() => navigate(`/vuelos?estado=${stat.estado}`)}
            className="card hover:border-slate-600/70 cursor-pointer transition-all group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {stat.label}
              </span>
              <div className={clsx('p-2 rounded-lg', stat.bg)}>
                <stat.icon size={15} className={stat.color} />
              </div>
            </div>
            {isLoading ? (
              <div className="h-8 w-16 bg-slate-700 animate-pulse rounded" />
            ) : (
              <span className={clsx('text-3xl font-bold', stat.color)}>
                {countByEstado(stat.estado)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Stats total */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={16} className="text-slate-500" />
          <h2 className="font-semibold text-sm text-slate-300">Resumen total</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden flex">
            {STAT_CARDS.map(stat => {
              const count = countByEstado(stat.estado)
              const pct = vuelos.length > 0 ? (count / vuelos.length) * 100 : 0
              return (
                <div key={stat.estado}
                  style={{ width: `${pct}%` }}
                  className={clsx('h-full transition-all', stat.bg.replace('/20', '/80'))}
                  title={`${stat.label}: ${count}`}
                />
              )
            })}
          </div>
          <span className="text-sm font-semibold text-slate-300">{vuelos.length} total</span>
        </div>
      </div>

      {/* Recientes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-300">Vuelos recientes</h2>
          <button onClick={() => navigate('/vuelos')}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Ver todos →
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card h-28 animate-pulse bg-slate-800/40" />
            ))}
          </div>
        ) : recientes.length === 0 ? (
          <div className="card text-center py-12">
            <PlaneTakeoff size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No hay vuelos registrados</p>
            {canCreatePeticion(user?.rol) && (
              <button onClick={() => navigate('/nueva-peticion')}
                className="btn-primary mt-4 mx-auto">
                <Plus size={14} />
                Crear primera petición
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recientes.map(v => <VueloCard key={v.idVuelo} vuelo={v} />)}
          </div>
        )}
      </div>
    </div>
  )
}
