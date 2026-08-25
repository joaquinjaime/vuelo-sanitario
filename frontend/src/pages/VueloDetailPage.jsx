import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, History, FileText, CheckCircle, XCircle, Play, Flag, AlertTriangle, Clock } from 'lucide-react'
import { vueloApi } from '../api/vueloApi'
import { peticionApi } from '../api/peticionApi'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/common/StatusBadge'
import ConfirmModal from '../components/common/ConfirmModal'
import InfoVueloSection from '../components/vuelo/InfoVueloSection'
import { formatDate, formatTime, formatDateTime } from '../utils/dateUtils'
import { ROLE_LABELS, ROLE_COLORS } from '../utils/roleUtils'
import { ESTADO_PETICION_CONFIG } from '../utils/estadoUtils'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function VueloDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, hasRole } = useAuth()
  const qc = useQueryClient()

  const [modal, setModal] = useState(null) // 'cancelar' | 'aprobar' | 'ejecutar' | 'finalizar' | 'confirmar' | 'rechazar' | 'proponerFecha'
  const [motivoCancelacion, setMotivoCancelacion] = useState('')
  const [motivoRechazo, setMotivoRechazo]         = useState('')
  const [nuevaFecha, setNuevaFecha]               = useState('')
  const [motivoPropuesta, setMotivoPropuesta]     = useState('')

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

  const proponerFechaMut = useMutation({
    mutationFn: () => peticionApi.proponerFecha(vuelo.idPeticion, nuevaFecha, motivoPropuesta),
    onSuccess: () => { toast.success('Nueva fecha propuesta — esperando respuesta del DTS'); setModal(null); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message ?? 'Error'),
  })

  const aceptarFechaMut = useMutation({
    mutationFn: () => peticionApi.aceptarFecha(vuelo.idPeticion),
    onSuccess: () => { toast.success('Fecha aceptada — OPS ya puede elevar al Comandante'); setModal(null); invalidate() },
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
  const estadoPeticion = vuelo.estadoPeticion
  const isPlaneamiento = estado === 'PLANEAMIENTO'
  const isVigente      = estado === 'VIGENTE'
  const isEjecucion    = estado === 'EN_EJECUCION'
  const isFinalizado   = estado === 'FINALIZADO'
  const isCancelado    = estado === 'CANCELADO'
  const isActive       = !isFinalizado && !isCancelado

  // Plazo de 48 hs para el informe final (desde inicio de ejecución)
  const limiteInforme = vuelo.fechaLimiteInforme ? new Date(vuelo.fechaLimiteInforme) : null
  const plazoVencido = limiteInforme ? limiteInforme <= new Date() : false

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
            {estadoPeticion && (
              <span className={clsx('badge border border-slate-700 bg-slate-800/50', ESTADO_PETICION_CONFIG[estadoPeticion]?.color)}>
                Petición: {ESTADO_PETICION_CONFIG[estadoPeticion]?.label ?? estadoPeticion}
              </span>
            )}
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

      {/* Fecha propuesta por OPS esperando respuesta del DTS */}
      {isActive && estadoPeticion === 'REVISADA_OPS' && (
        <div className="card border-amber-800/40 bg-amber-900/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">Nueva fecha propuesta por Operaciones</p>
              <p className="text-sm text-slate-300 mt-0.5">
                OPS no considera factible la fecha original y propone el{' '}
                <span className="font-semibold">{formatDate(vuelo.fechaVuelo)}</span>.
                El DTS debe aceptar o rechazar para continuar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plazo de 48 hs para el informe final */}
      {vuelo.fechaLimiteInforme && (isEjecucion || isFinalizado) && (
        <div className={clsx('card', plazoVencido ? 'border-red-800/40 bg-red-900/10' : 'border-cyan-800/40 bg-cyan-900/10')}>
          <div className="flex items-start gap-2">
            <Clock size={16} className={clsx('mt-0.5 flex-shrink-0', plazoVencido ? 'text-red-400' : 'text-cyan-400')} />
            <div>
              <p className={clsx('text-sm font-medium', plazoVencido ? 'text-red-400' : 'text-cyan-400')}>
                {plazoVencido ? 'Plazo del informe final VENCIDO' : 'Plazo del informe final en curso'}
              </p>
              <p className="text-sm text-slate-400 mt-0.5">
                {plazoVencido
                  ? <>Venció el <span className="font-semibold text-slate-200">{formatDateTime(vuelo.fechaLimiteInforme)}</span>. No se puede cargar ni editar el informe final.</>
                  : <>Vence el <span className="font-semibold text-slate-200">{formatDateTime(vuelo.fechaLimiteInforme)}</span> — 48 hs desde el inicio de ejecución.</>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Observaciones de la petición */}
      {vuelo.observaciones && (
        <div className="card border-cyan-800/40 bg-cyan-900/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-cyan-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-cyan-400">Observaciones de la petición (DTS)</p>
              <p className="text-sm text-slate-300 mt-0.5 whitespace-pre-wrap">{vuelo.observaciones}</p>
            </div>
          </div>
        </div>
      )}

      {/* Acciones por rol */}
      {isActive && (
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Acciones disponibles</p>
          <div className="flex flex-wrap gap-2">

            {/* OPS: fecha no factible → proponer nueva (solo con petición PENDIENTE) */}
            {hasRole('OPERACIONES') && isPlaneamiento && estadoPeticion === 'PENDIENTE' && (
              <button onClick={() => setModal('proponerFecha')} className="btn-secondary">
                <AlertTriangle size={14} />
                Fecha no factible — Proponer nueva
              </button>
            )}

            {/* DTS: aceptar fecha propuesta por OPS (petición REVISADA_OPS) */}
            {hasRole('DTS') && isPlaneamiento && estadoPeticion === 'REVISADA_OPS' && (
              <button onClick={() => aceptarFechaMut.mutate()} disabled={aceptarFechaMut.isPending}
                className="btn-success">
                <CheckCircle size={14} />
                Aceptar nueva fecha
              </button>
            )}

            {/* DTS: rechazar propuesta de OPS → petición RECHAZADA */}
            {hasRole('DTS') && isPlaneamiento && estadoPeticion === 'REVISADA_OPS' && (
              <button onClick={() => setModal('rechazar')} className="btn-danger">
                <XCircle size={14} />
                Rechazar propuesta
              </button>
            )}

            {/* DTS: confirmar oferta (solo cuando el Comandante ya la declaró FACTIBLE) */}
            {hasRole('DTS') && isPlaneamiento && estadoPeticion === 'FACTIBLE' && (
              <button onClick={() => setModal('confirmarDts')} className="btn-success">
                <CheckCircle size={14} />
                Confirmar oferta
              </button>
            )}

            {/* OPS: elevar al comandante (habilitado solo si no hay propuesta de fecha pendiente) */}
            {hasRole('OPERACIONES') && isPlaneamiento && estadoPeticion === 'PENDIENTE' && (
              <button onClick={() => aprobarOps.mutate()} disabled={aprobarOps.isPending}
                className="btn-primary">
                <Play size={14} />
                Elevar al Comandante
              </button>
            )}

            {/* COMANDANTE: confirmar factibilidad (solo petición ELEVADA_COMANDANTE) */}
            {hasRole('COMANDANTE') && isPlaneamiento && estadoPeticion === 'ELEVADA_COMANDANTE' && (
              <button onClick={() => setModal('confirmar')} className="btn-success">
                <CheckCircle size={14} />
                Confirmar Factibilidad
              </button>
            )}

            {/* OPS: aprobar formulario (recién cuando DTS confirmó) */}
            {hasRole('OPERACIONES') && isPlaneamiento && estadoPeticion === 'CONFIRMADA_DTS' && !vuelo.aprobacionCargada && (
              <button onClick={() => setModal('aprobar')} className="btn-success">
                <Flag size={14} />
                Aprobar formulario
              </button>
            )}

            {/* La entrada en ejecución es automática al alcanzarse el horario programado */}

            {/* OPS: finalizar */}
            {hasRole('OPERACIONES') && isEjecucion && (
              <button onClick={() => cambiarEstadoMut.mutate('FINALIZADO')} className="btn-success">
                <Flag size={14} />
                Finalizar vuelo
              </button>
            )}

            {/* COMANDANTE/OPS: rechazar petición (antes de que DTS confirme) */}
            {(hasRole('COMANDANTE') || hasRole('OPERACIONES')) && isPlaneamiento
              && (estadoPeticion === 'PENDIENTE' || estadoPeticion === 'ELEVADA_COMANDANTE') && (
              <button onClick={() => setModal('rechazar')} className="btn-danger">
                <XCircle size={14} />
                Rechazar
              </button>
            )}

            {/* Todos: cancelar (fuera de PLANEAMIENTO; en planeamiento el rechazo ya cancela) */}
            {!isPlaneamiento && (
              <button onClick={() => setModal('cancelar')} className="btn-danger ml-auto">
                <XCircle size={14} />
                Cancelar vuelo
              </button>
            )}
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

      <ConfirmModal open={modal === 'proponerFecha'} title="Proponer nueva fecha" danger
        onCancel={() => { setModal(null); setNuevaFecha(''); setMotivoPropuesta('') }}
        onConfirm={() => proponerFechaMut.mutate()}>
        <p className="text-sm text-slate-400 mb-4">
          La fecha actual (<span className="font-semibold text-slate-200">{formatDate(vuelo.fechaVuelo)}</span>) quedará marcada
          como no factible. El DTS deberá aceptar o rechazar la nueva fecha.
        </p>
        <label className="label">Nueva fecha prevista *</label>
        <input type="date" className="input"
          value={nuevaFecha}
          onChange={e => setNuevaFecha(e.target.value)} />
        <label className="label mt-3">Motivo *</label>
        <textarea className="input resize-none" rows={3}
          value={motivoPropuesta}
          onChange={e => setMotivoPropuesta(e.target.value)}
          placeholder="¿Por qué no es factible la fecha actual?" />
      </ConfirmModal>

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
