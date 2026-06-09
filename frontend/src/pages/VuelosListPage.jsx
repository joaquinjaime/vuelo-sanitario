import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PlaneTakeoff, Search, Plus } from 'lucide-react'
import { vueloApi } from '../api/vueloApi'
import VueloCard from '../components/vuelo/VueloCard'
import { useAuth } from '../context/AuthContext'
import { canCreatePeticion } from '../utils/roleUtils'
import { ESTADO_CONFIG } from '../utils/estadoUtils'

const ESTADOS_FILTER = ['TODOS', ...Object.keys(ESTADO_CONFIG)]

export default function VuelosListPage() {
  const [searchParams] = useSearchParams()
  const [estadoFiltro, setEstadoFiltro] = useState(searchParams.get('estado') ?? 'TODOS')
  const [busqueda, setBusqueda] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: vuelos = [], isLoading } = useQuery({
    queryKey: ['vuelos', estadoFiltro],
    queryFn: () => vueloApi.listar(estadoFiltro === 'TODOS' ? null : estadoFiltro),
  })

  const filtered = vuelos.filter(v =>
    !busqueda ||
    v.solicitanteNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    String(v.idVuelo).includes(busqueda)
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Vuelos</h1>
          <p className="text-slate-500 text-sm mt-0.5">{vuelos.length} operaciones registradas</p>
        </div>
        {canCreatePeticion(user?.rol) && (
          <button onClick={() => navigate('/nueva-peticion')} className="btn-primary">
            <Plus size={14} />
            Nueva Petición
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Buscar por ID o solicitante..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        {/* Estado pills */}
        <div className="flex gap-1.5 flex-wrap">
          {ESTADOS_FILTER.map(e => {
            const cfg = e === 'TODOS' ? null : ESTADO_CONFIG[e]
            return (
              <button key={e}
                onClick={() => setEstadoFiltro(e)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                  estadoFiltro === e
                    ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                    : 'text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
                }`}>
                {e === 'TODOS' ? 'Todos' : `${cfg?.icon} ${cfg?.label}`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-slate-800/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <PlaneTakeoff size={36} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Sin vuelos</p>
          <p className="text-slate-600 text-sm mt-1">
            {busqueda ? 'No hay resultados para tu búsqueda' : 'No hay vuelos en este estado'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => <VueloCard key={v.idVuelo} vuelo={v} />)}
        </div>
      )}
    </div>
  )
}
