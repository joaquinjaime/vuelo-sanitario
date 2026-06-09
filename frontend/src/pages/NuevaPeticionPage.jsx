import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Send } from 'lucide-react'
import { peticionApi } from '../api/peticionApi'
import toast from 'react-hot-toast'

export default function NuevaPeticionPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fechaVuelo: '',
    horaDespegueSolicitada: '',
    prioridad: 'NORMAL',
    observaciones: '',
  })

  const mut = useMutation({
    mutationFn: () => peticionApi.crear(form),
    onSuccess: (data) => {
      toast.success('Petición creada exitosamente')
      navigate(`/vuelos/${data.idVuelo}`)
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Error al crear la petición'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.fechaVuelo || !form.horaDespegueSolicitada) {
      toast.error('Completá fecha y hora de despegue')
      return
    }
    mut.mutate()
  }

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-200">Nueva Petición de Vuelo</h1>
          <p className="text-slate-500 text-sm mt-0.5">Completá los datos para solicitar el vuelo sanitario</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="card space-y-5">

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha de vuelo *</label>
            <input type="date" className="input"
              value={form.fechaVuelo}
              onChange={set('fechaVuelo')}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div>
            <label className="label">Hora de despegue *</label>
            <input type="time" className="input"
              value={form.horaDespegueSolicitada}
              onChange={set('horaDespegueSolicitada')}
            />
          </div>
        </div>

        <div>
          <label className="label">Prioridad</label>
          <select className="input" value={form.prioridad} onChange={set('prioridad')}>
            <option value="BAJA">Baja</option>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta</option>
            <option value="URGENTE">Urgente</option>
          </select>
        </div>

        <div>
          <label className="label">Observaciones</label>
          <textarea className="input resize-none" rows={4}
            placeholder="Información adicional sobre el vuelo, condiciones especiales del paciente, etc."
            value={form.observaciones}
            onChange={set('observaciones')}
          />
        </div>

        <div className="flex gap-3 pt-2 border-t border-slate-800">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={mut.isPending} className="btn-primary ml-auto">
            <Send size={14} />
            {mut.isPending ? 'Enviando...' : 'Enviar Petición'}
          </button>
        </div>
      </form>
    </div>
  )
}
