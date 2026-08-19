import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PlaneTakeoff, Clock, Plus, CalendarDays } from 'lucide-react'
import { vueloApi } from '../api/vueloApi'
import { useAuth } from '../context/AuthContext'
import VueloCard from '../components/vuelo/VueloCard'
import { ROLE_LABELS, ROLE_COLORS, canCreatePeticion } from '../utils/roleUtils'
import clsx from 'clsx'

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const { data: vuelos = [], isLoading } = useQuery({
    queryKey: ['vuelos'],
    queryFn: () => vueloApi.listar(),
  })

  const vuelosFiltrados = useMemo(() => {
    return vuelos.filter(v => {
      if (!v.fechaVuelo) return false
      const fecha = v.fechaVuelo // "YYYY-MM-DD"
      if (fechaDesde && fecha < fechaDesde) return false
      if (fechaHasta && fecha > fechaHasta) return false
      return true
    })
  }, [vuelos, fechaDesde, fechaHasta])

  const planeamiento = useMemo(
    () => vuelosFiltrados.filter(v => v.estado === 'PLANEAMIENTO'),
    [vuelosFiltrados]
  )

  const recientes = vuelosFiltrados.slice(0, 6)

  const limpiarFiltros = () => { setFechaDesde(''); setFechaHasta('') }
  const tieneFiltro = fechaDesde || fechaHasta

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

      {/* Filtro de fechas */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={16} className="text-slate-500" />
          <h2 className="font-semibold text-sm text-slate-300">Filtrar por fecha</h2>
          {tieneFiltro && (
            <button onClick={limpiarFiltros}
              className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Limpiar
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Desde</label>
            <input type="date" value={fechaDesde}
              onChange={e => setFechaDesde(e.target.value)}
              className="input text-sm !py-1.5" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Hasta</label>
            <input type="date" value={fechaHasta}
              onChange={e => setFechaHasta(e.target.value)}
              className="input text-sm !py-1.5" />
          </div>
          {tieneFiltro && (
            <span className="text-xs text-slate-500">
              {vuelosFiltrados.length} vuelo{vuelosFiltrados.length !== 1 ? 's' : ''} encontrado{vuelosFiltrados.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Vuelos en Planeamiento */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-blue-400" />
            <h2 className="font-semibold text-slate-300">En Planeamiento</h2>
            {!isLoading && (
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                {planeamiento.length}
              </span>
            )}
          </div>
          <button onClick={() => navigate('/vuelos?estado=PLANEAMIENTO')}
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
        ) : planeamiento.length === 0 ? (
          <div className="card text-center py-10">
            <Clock size={28} className="text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">
              {tieneFiltro ? 'No hay vuelos en planeamiento en ese rango' : 'No hay vuelos en planeamiento'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {planeamiento.map(v => <VueloCard key={v.idVuelo} vuelo={v} />)}
          </div>
        )}
      </div>

      {/* Vuelos recientes */}
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
            <p className="text-slate-500 text-sm">
              {tieneFiltro ? 'No hay vuelos en ese rango de fechas' : 'No hay vuelos registrados'}
            </p>
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
