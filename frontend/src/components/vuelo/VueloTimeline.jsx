import { formatDateTime } from '../../utils/dateUtils'
import { ROLE_COLORS } from '../../utils/roleUtils'
import clsx from 'clsx'

const ACCION_CONFIG = {
  PETICION_CREADA:       { icon: '📩', color: 'border-blue-500 bg-blue-500' },
  PETICION_APROBADA_OPS: { icon: '✅', color: 'border-amber-500 bg-amber-500' },
  FACTIBILIDAD_CONFIRMADA:{ icon: '🛩️', color: 'border-purple-500 bg-purple-500' },
  CONFIRMADA_POR_DTS:    { icon: '🤝', color: 'border-cyan-500 bg-cyan-500' },
  VUELO_APROBADO:        { icon: '🟢', color: 'border-emerald-500 bg-emerald-500' },
  VUELO_CANCELADO:       { icon: '❌', color: 'border-red-500 bg-red-500' },
  CAMBIO_ESTADO:         { icon: '🔄', color: 'border-slate-500 bg-slate-500' },
  INFO_CARGADA:          { icon: '📋', color: 'border-blue-400 bg-blue-400' },
  INFO_ACTUALIZADA:      { icon: '✏️', color: 'border-blue-300 bg-blue-300' },
  INFORME_FINAL_CREADO:  { icon: '📝', color: 'border-violet-500 bg-violet-500' },
}

export default function VueloTimeline({ historial }) {
  if (!historial?.length) {
    return <p className="text-slate-500 text-sm text-center py-8">Sin registros en el historial</p>
  }

  return (
    <div className="relative">
      {/* Línea vertical */}
      <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-800" />

      <div className="space-y-4">
        {historial.map((item, i) => {
          const cfg = ACCION_CONFIG[item.accion] ?? { icon: '•', color: 'border-slate-600 bg-slate-600' }
          return (
            <div key={item.idHistorial} className="relative flex gap-4 items-start">
              {/* Dot */}
              <div className={clsx(
                'w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm flex-shrink-0 z-10',
                cfg.color.replace('bg-', 'bg-').replace('border-', 'border-')
              )}>
                <span className="text-xs">{cfg.icon}</span>
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="card !p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-200">
                      {item.accion.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {formatDateTime(item.fechaHoraModificacion)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{item.usuarioNombre}</span>
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded border text-[10px]',
                      ROLE_COLORS[item.usuarioRol]
                    )}>
                      {item.usuarioRol}
                    </span>
                  </div>

                  {item.comentarios && (
                    <p className="text-xs text-slate-400 mt-2 italic">"{item.comentarios}"</p>
                  )}

                  {(item.datosAnteriores || item.datosNuevos) && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      {item.datosAnteriores && (
                        <div className="bg-red-900/20 border border-red-800/30 rounded px-2 py-1">
                          <span className="text-red-400">Antes: </span>
                          <span className="text-slate-400">{item.datosAnteriores}</span>
                        </div>
                      )}
                      {item.datosNuevos && (
                        <div className="bg-emerald-900/20 border border-emerald-800/30 rounded px-2 py-1">
                          <span className="text-emerald-400">Ahora: </span>
                          <span className="text-slate-400">{item.datosNuevos}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
