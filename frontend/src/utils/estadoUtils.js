export const ESTADOS = {
  PLANEAMIENTO:  'PLANEAMIENTO',
  VIGENTE:       'VIGENTE',
  EN_EJECUCION:  'EN_EJECUCION',
  FINALIZADO:    'FINALIZADO',
  CANCELADO:     'CANCELADO',
}

export const ESTADO_CONFIG = {
  PLANEAMIENTO: {
    label:     'Planeamiento',
    badgeClass:'badge-planning',
    dot:       'bg-blue-400',
    icon:      '📋',
  },
  VIGENTE: {
    label:     'Vigente',
    badgeClass:'badge-vigente',
    dot:       'bg-emerald-400',
    icon:      '✅',
  },
  EN_EJECUCION: {
    label:     'En Ejecución',
    badgeClass:'badge-ejecucion',
    dot:       'bg-amber-400',
    icon:      '✈️',
  },
  FINALIZADO: {
    label:     'Finalizado',
    badgeClass:'badge-finalizado',
    dot:       'bg-purple-400',
    icon:      '🏁',
  },
  CANCELADO: {
    label:     'Cancelado',
    badgeClass:'badge-cancelado',
    dot:       'bg-red-400',
    icon:      '❌',
  },
}

export function getEstadoConfig(estado) {
  return ESTADO_CONFIG[estado] ?? { label: estado, badgeClass: 'badge', dot: 'bg-slate-400', icon: '•' }
}

export const ESTADO_PETICION_CONFIG = {
  PENDIENTE:           { label: 'Pendiente',           color: 'text-slate-400' },
  REVISADA_OPS:        { label: 'Revisada por OPS',    color: 'text-blue-400'  },
  ELEVADA_COMANDANTE:  { label: 'Elevada al CMD',       color: 'text-purple-400'},
  FACTIBLE:            { label: 'Factible',             color: 'text-emerald-400'},
  RECHAZADA:           { label: 'Rechazada',            color: 'text-red-400'   },
  CONFIRMADA_DTS:      { label: 'Confirmada por DTS',   color: 'text-cyan-400'  },
  CANCELADA:           { label: 'Cancelada',            color: 'text-red-400'   },
}
