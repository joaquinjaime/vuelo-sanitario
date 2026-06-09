import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { vueloApi } from '../api/vueloApi'
import VueloTimeline from '../components/vuelo/VueloTimeline'

export default function HistorialPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: historial = [], isLoading } = useQuery({
    queryKey: ['historial', id],
    queryFn: () => vueloApi.getHistorial(Number(id)),
  })

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-200">
            Historial — Vuelo <span className="font-mono text-blue-400">#{String(id).padStart(4,'0')}</span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Registro completo de acciones y cambios ({historial.length} eventos)
          </p>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-800 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-800 rounded animate-pulse w-1/3" />
                  <div className="h-12 bg-slate-800 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <VueloTimeline historial={historial} />
        )}
      </div>
    </div>
  )
}
