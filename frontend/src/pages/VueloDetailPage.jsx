import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, History, FileText, CheckCircle, XCircle, Play, Flag, AlertTriangle } from 'lucide-react'
import { vueloApi } from '../api/vueloApi'
import { peticionApi } from '../api/peticionApi'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/common/StatusBadge'
import ConfirmModal from '../components/common/ConfirmModal'
import InfoVueloSection from '../components/vuelo/InfoVueloSection'
import { formatDate, formatTime } from '../utils/dateUtils'
import { ROLE_LABELS, ROLE_COLORS } from '../utils/roleUtils'
import { ESTADO_PETICION_CONFIG } from '../utils/estadoUtils'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function VueloDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, hasRole } = useAuth()
  const qc = useQueryClient()

  const [modal, setModal] = useState(null) // 'cancelar' | 'aprobar' | 'ejecutar' | 'finalizar' | 'confirmar' | 'rechazar'
  const [motivoCancelacion, setMotivoCancelacion] = useState('')
  const [motivoRechazo, setMotivoRechazo]         = useState('')

  const { data: vuelo, isLoading } = useQuery({
    queryKey: ['vuelo', id],
    queryFn: () => vueloApi.getById(Number(id)),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vuelo', id] })

  const cancelarMut = useMutation({
    mutationFn: () => vueloApi.cancelar(vuelo.idVuelo, motivoCancelacion),
    onSuccess: () => { toast.success('Vuelo cancelado'); setModal(null); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error al cancelar'),
  })

  const aprobarMut = useMutation({
    mutationFn: () => vueloApi.marcarAprobado(vuelo.idVuelo),
    onSuccess: () => { toast.success('Vuelo aprobado — ahora está VIGENTE'); setModal(null); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const cambiarEstadoMut = useMutation({
    mutationFn: (estado) => vueloApi.cambiarEstado(vuelo.idVuelo, estado),
    onSuccess: (_, estado) => { toast.success(`Estado → ${estado}`); setModal(null); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const confirmarFactMut = useMutation({
    mutationFn: () => peticionApi.confirmarFactibilidad(vuelo.idPeticion),
    onSuccess: () => { toast.success('Factibilidad confirmada'); setModal(null); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const rechazarMut = useMutation({
    mutationFn: () => peticionApi.rechazar(vuelo.idPeticion, motivoRechazo),
    onSuccess: () => { toast.success('Petición rechazada'); setModal(null); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const confirmarDtsMut = useMutation({
    mutationFn: () => peticionApi.confirmarDts(vuelo.idPeticion),
    onSuccess: () => { toast.success('Confirmado'); setModal(null); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const aprobarOps = useMutation({
    mutationFn: () => peticionApi.aprobar(vuelo.idPeticion),
    onSuccess: () => { toast.success('Petición elevada al Comandante'); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
    </div>
  )
  if (!vuelo) return <div className="text-center text-slate-500 py-16">Vuelo no encontrado</div>

  const estado = vuelo.estado
  const isPlaneamiento = estado === 'PLANEAMIENTO'
  const isVigente      = estado === 'VIGENTE'
  const isEjecucion    = estado === 'EN_EJECUCION'
  const isFinalizado   = estado === 'FINALIZADO'
  const isCancelado    = estado === 'CANCELADO'
  const isActive       = !isFinalizado && !isCancelado

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-200">
              Vuelo <span className="font-mono text-blue-400">#{String(vuelo.idVuelo).padStart(4,'0')}</span>
            </h1>
            <StatusBadge estado={estado} />
            {vuelo.aprobacionCargada && (
              <span className="badge bg-emerald-900/30 text-emerald-400 border border-emerald-800/30">
                ✓ Aprobado por OPS
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            {vuelo.solicitanteNombre}
            <span className={clsx('ml-2 text-xs px-1.5 py-0.5 rounded border', ROLE_COLORS[vuelo.solicitanteRol])}>
              {vuelo.solicitanteRol}
            </span>
          </p>
        </div>

        {/* Quick nav */}
        <div className="flex gap-2">
          <Link to={`/vuelos/${id}/historial`}
            className="btn-secondary text-xs gap-1.5">
            <History size={14} />
            Historial
          </Link>
          {isFinalizado && (
            <Link to={`/vuelos/${id}/informe-final`}
              className="btn-primary text-xs gap-1.5">
              <FileText size={14} />
              Informe Final
            </Link>
          )}
        </div>
      </div>

      {/* Info básica */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Fecha', value: formatDate(vuelo.fechaVuelo) },
          { label: 'Despegue', value: formatTime(vuelo.horaDespegue) },
          { label: 'Aterrizaje', value: formatTime(vuelo.horaAterrizaje) },
          { label: 'Petición #', value: vuelo.idPeticion },
        ].map(item => (
          <div key={item.label} className="card !p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{item.label}</p>
            <p className="font-semibold text-slate-200">{item.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {vuelo.motivoCancelacion && (
        <div className="card border-red-800/40 bg-red-900/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Motivo de cancelación</p>
              <p className="text-sm text-slate-400 mt-0.5">{vuelo.motivoCancelacion}</p>
            </div>
          </div>
        </div>
      )}

      {/* Acciones por rol */}
      {isActive && (
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Acciones disponibles</p>
          <div className="flex flex-wrap gap-2">

            {/* DTS: confirmar oferta */}
            {hasRole('DTS') && isPlaneamiento && (
              <button onClick={() => setModal('confirmarDts')} className="btn-success">
                <CheckCircle size={14} />
                Confirmar oferta
              </button>
            )}

            {/* OPS: elevar al comandante */}
            {hasRole('OPERACIONES') && isPlaneamiento && (
              <button onClick={() => aprobarOps.mutate()} disabled={aprobarOps.isPending}
                className="btn-primary">
                <Play size={14} />
                Elevar al Comandante
              </button>
            )}

            {/* COMANDANTE: confirmar factibilidad */}
            {hasRole('COMANDANTE') && isPlaneamiento && (
              <button onClick={() => setModal('confirmar')} className="btn-success">
                <CheckCircle size={14} />
                Confirmar Factibilidad
              </button>
            )}

            {/* OPS: aprobar formulario */}
            {hasRole('OPERACIONES') && isPlaneamiento && !vuelo.aprobacionCargada && (
              <button onClick={() => setModal('aprobar')} className="btn-success">
                <Flag size={14} />
                Aprobar formulario
              </button>
            )}

            {/* OPS: cambiar a EN_EJECUCION */}
            {hasRole('OPERACIONES') && isVigente && (
              <button onClick={() => cambiarEstadoMut.mutate('EN_EJECUCION')} className="btn-primary">
                <Play size={14} />
                Iniciar ejecución
              </button>
            )}

            {/* OPS: finalizar */}
            {hasRole('OPERACIONES') && isEjecucion && (
              <button onClick={() => cambiarEstadoMut.mutate('FINALIZADO')} className="btn-success">
                <Flag size={14} />
                Finalizar vuelo
              </button>
            )}

            {/* COMANDANTE/OPS: rechazar */}
            {(hasRole('COMANDANTE') || hasRole('OPERACIONES')) && isPlaneamiento && (
              <button onClick={() => setModal('rechazar')} className="btn-danger">
                <XCircle size={14} />
                Rechazar
              </button>
            )}

            {/* Todos: cancelar */}
            <button onClick={() => setModal('cancelar')} className="btn-danger ml-auto">
              <XCircle size={14} />
              Cancelar vuelo
            </button>
          </div>
        </div>
      )}

      {/* Info técnica del vuelo */}
      <InfoVueloSection idVuelo={Number(id)} estado={estado} />

      {/* Modales */}
      <ConfirmModal open={modal === 'cancelar'} title="Cancelar vuelo" danger
        onCancel={() => { setModal(null); setMotivoCancelacion('') }}
        onConfirm={() => cancelarMut.mutate()}>
        <label className="label">Motivo de cancelación *</label>
        <textarea className="input resize-none" rows={3}
          value={motivoCancelacion}
          onChange={e => setMotivoCancelacion(e.target.value)}
          placeholder="Explicá el motivo..." />
      </ConfirmModal>

      <ConfirmModal open={modal === 'aprobar'} title="Aprobar formulario del vuelo"
        message="Esta acción marca el vuelo como VIGENTE. Confirmá que toda la información está correcta."
        onCancel={() => setModal(null)}
        onConfirm={() => aprobarMut.mutate()} />

      <ConfirmModal open={modal === 'confirmar'} title="Confirmar factibilidad"
        message="Confirmás que el vuelo es operativamente factible."
        onCancel={() => setModal(null)}
        onConfirm={() => confirmarFactMut.mutate()} />

      <ConfirmModal open={modal === 'confirmarDts'} title="Confirmar oferta de vuelo"
        message="Aceptás las condiciones del vuelo propuesto por Operaciones."
        onCancel={() => setModal(null)}
        onConfirm={() => confirmarDtsMut.mutate()} />

      <ConfirmModal open={modal === 'rechazar'} title="Rechazar petición" danger
        onCancel={() => { setModal(null); setMotivoRechazo('') }}
        onConfirm={() => rechazarMut.mutate()}>
        <label className="label">Motivo del rechazo *</label>
        <textarea className="input resize-none" rows={3}
          value={motivoRechazo}
          onChange={e => setMotivoRechazo(e.target.value)}
          placeholder="Indicá el motivo..." />
      </ConfirmModal>
    </div>
  )
}
