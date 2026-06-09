import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, FileText } from 'lucide-react'
import { vueloApi } from '../api/vueloApi'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../utils/dateUtils'
import toast from 'react-hot-toast'

export default function InformeFinalPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const qc = useQueryClient()

  const canEdit = hasRole('COMANDANTE') || hasRole('OPERACIONES')

  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({
    cambiosOcurridos: '',
    ajustesRealizados: '',
    observacionesGenerales: '',
    archivosAdjuntos: '',
  })

  const { data: informe, isLoading, isError } = useQuery({
    queryKey: ['informe-final', id],
    queryFn: () => vueloApi.getInformeFinal(Number(id)),
    retry: false,
  })

  const crearMut = useMutation({
    mutationFn: () => vueloApi.crearInformeFinal(Number(id), form),
    onSuccess: () => {
      toast.success('Informe final creado')
      setEditMode(false)
      qc.invalidateQueries({ queryKey: ['informe-final', id] })
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const editarMut = useMutation({
    mutationFn: () => vueloApi.editarInformeFinal(Number(id), form),
    onSuccess: () => {
      toast.success('Informe actualizado')
      setEditMode(false)
      qc.invalidateQueries({ queryKey: ['informe-final', id] })
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const startEdit = () => {
    if (informe) {
      setForm({
        cambiosOcurridos:       informe.cambiosOcurridos       ?? '',
        ajustesRealizados:      informe.ajustesRealizados      ?? '',
        observacionesGenerales: informe.observacionesGenerales ?? '',
        archivosAdjuntos:       informe.archivosAdjuntos       ?? '',
      })
    }
    setEditMode(true)
  }

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const CAMPOS = [
    { key: 'cambiosOcurridos',       label: 'Cambios ocurridos durante la ejecución', icon: '🔄' },
    { key: 'ajustesRealizados',      label: 'Ajustes sobre el plan original',          icon: '🔧' },
    { key: 'observacionesGenerales', label: 'Observaciones generales',                 icon: '📝' },
    { key: 'archivosAdjuntos',       label: 'Archivos adjuntos (URLs o referencias)', icon: '📎' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-200">
            Informe Final — Vuelo <span className="font-mono text-blue-400">#{String(id).padStart(4,'0')}</span>
          </h1>
          {informe && (
            <p className="text-slate-500 text-sm mt-0.5">
              Creado el {formatDateTime(informe.fechaCreacion)}
            </p>
          )}
        </div>
        {canEdit && informe && !editMode && (
          <button onClick={startEdit} className="btn-secondary text-xs">
            ✏️ Editar
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-slate-800 rounded animate-pulse w-1/3" />
              <div className="h-20 bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (isError || !informe) && !editMode ? (
        <div className="card text-center py-12">
          <FileText size={36} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Sin informe final</p>
          <p className="text-slate-600 text-sm mt-1">Este vuelo aún no tiene informe final cargado</p>
          {canEdit && (
            <button onClick={() => setEditMode(true)} className="btn-primary mt-4 mx-auto">
              + Cargar Informe Final
            </button>
          )}
        </div>
      ) : editMode ? (
        <div className="card space-y-5">
          {CAMPOS.map(campo => (
            <div key={campo.key}>
              <label className="label">{campo.icon} {campo.label}</label>
              <textarea className="input resize-none" rows={4}
                value={form[campo.key]}
                onChange={set(campo.key)}
                placeholder={`Descripción de ${campo.label.toLowerCase()}...`}
              />
            </div>
          ))}
          <div className="flex gap-3 pt-3 border-t border-slate-800">
            <button onClick={() => setEditMode(false)} className="btn-secondary">Cancelar</button>
            <button
              onClick={() => informe ? editarMut.mutate() : crearMut.mutate()}
              disabled={crearMut.isPending || editarMut.isPending}
              className="btn-primary ml-auto">
              <Save size={14} />
              {crearMut.isPending || editarMut.isPending ? 'Guardando...' : 'Guardar Informe'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          {CAMPOS.map(campo => (
            <div key={campo.key}>
              <p className="label">{campo.icon} {campo.label}</p>
              <div className="bg-slate-800/50 rounded-lg px-4 py-3">
                <p className="text-sm text-slate-300 whitespace-pre-wrap">
                  {informe[campo.key] ?? <span className="text-slate-600 italic">Sin información</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
