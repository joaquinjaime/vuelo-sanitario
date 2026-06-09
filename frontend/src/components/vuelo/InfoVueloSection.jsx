import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Upload, CheckCircle } from 'lucide-react'
import { vueloApi } from '../../api/vueloApi'
import { useAuth } from '../../context/AuthContext'
import { canCargarInfo } from '../../utils/roleUtils'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const INFO_SECCIONES = [
  { key: 'ruta',         endpoint: 'ruta',         label: 'Ruta de Vuelo',        icon: '🗺️' },
  { key: 'hangar',       endpoint: 'hangar',        label: 'Hangar / Combustible', icon: '⛽' },
  { key: 'aa2000',       endpoint: 'aa2000',        label: 'Coordinación AA2000',  icon: '🏢' },
  { key: 'meteorologia', endpoint: 'meteorologia',  label: 'Meteorología',         icon: '🌤️' },
  { key: 'plan_vuelo',   endpoint: 'plan-de-vuelo', label: 'Plan de Vuelo',        icon: '📄' },
]

function SeccionInfo({ seccion, idVuelo, infoExistente, canEdit, isCancelado }) {
  const [open, setOpen]         = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [contenido, setContenido] = useState('')
  const [pdfFile, setPdfFile]   = useState(null)
  const qc = useQueryClient()

  const tieneInfo = !!infoExistente

  const guardarMut = useMutation({
    mutationFn: () => vueloApi.cargarInfo(idVuelo, seccion.endpoint, { contenido }, pdfFile),
    onSuccess: () => {
      toast.success(`${seccion.label} guardado`)
      setEditMode(false)
      qc.invalidateQueries({ queryKey: ['info-vuelo', idVuelo] })
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Error al guardar'),
  })

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
        <div className="flex items-center gap-3">
          <span>{seccion.icon}</span>
          <span className="font-medium text-sm text-slate-200">{seccion.label}</span>
          {tieneInfo && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle size={12} />
              Cargado
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
      </button>

      {open && (
        <div className="p-4 border-t border-slate-800 space-y-3">
          {tieneInfo && !editMode ? (
            <>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-sm text-slate-300 whitespace-pre-wrap">
                  {infoExistente.contenido ?? '(Sin contenido de texto)'}
                </p>
                {infoExistente.pdf && (
                  <p className="text-xs text-blue-400 mt-2">📎 PDF adjunto</p>
                )}
              </div>
              {canEdit && !isCancelado && (
                <button onClick={() => { setContenido(infoExistente.contenido ?? ''); setEditMode(true) }}
                  className="btn-secondary text-xs">
                  ✏️ Editar
                </button>
              )}
            </>
          ) : canEdit && !isCancelado ? (
            <>
              <textarea
                className="input resize-none"
                rows={4}
                placeholder={`Ingresá información de ${seccion.label}...`}
                value={contenido}
                onChange={e => setContenido(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer btn-secondary text-xs">
                  <Upload size={13} />
                  {pdfFile ? pdfFile.name : 'Adjuntar PDF'}
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={e => setPdfFile(e.target.files[0])} />
                </label>
                <button onClick={() => guardarMut.mutate()}
                  disabled={guardarMut.isPending}
                  className="btn-primary text-xs">
                  {guardarMut.isPending ? 'Guardando...' : 'Guardar'}
                </button>
                {editMode && (
                  <button onClick={() => setEditMode(false)} className="btn-secondary text-xs">
                    Cancelar
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600 italic">Sin información cargada</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function InfoVueloSection({ idVuelo, estado }) {
  const { user } = useAuth()
  const canEdit  = canCargarInfo(user?.rol)
  const isCancelado = estado === 'CANCELADO' || estado === 'FINALIZADO'

  const { data: infoList = [], isLoading } = useQuery({
    queryKey: ['info-vuelo', idVuelo],
    queryFn: () => vueloApi.getInfo(idVuelo),
  })

  const getInfo = (tipo) => infoList.find(i => i.tipo === tipo.toUpperCase())

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-300 mb-4 text-sm">📋 Información Técnica del Vuelo</h2>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {INFO_SECCIONES.map(sec => (
            <SeccionInfo key={sec.key}
              seccion={sec}
              idVuelo={idVuelo}
              infoExistente={getInfo(sec.key)}
              canEdit={canEdit}
              isCancelado={isCancelado}
            />
          ))}
        </div>
      )}
    </div>
  )
}
