import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, User, ChevronRight } from 'lucide-react'
import StatusBadge from '../common/StatusBadge'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { ROLE_COLORS } from '../../utils/roleUtils'
import clsx from 'clsx'

export default function VueloCard({ vuelo }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/vuelos/${vuelo.idVuelo}`)}
      className="card hover:border-blue-500/40 hover:bg-slate-800/80 cursor-pointer transition-all duration-150 group">

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-mono text-slate-500">
              #V{String(vuelo.idVuelo).padStart(4, '0')}
            </span>
            <StatusBadge estado={vuelo.estado} />
            {vuelo.aprobacionCargada && (
              <span className="badge bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 text-[10px]">
                ✓ Aprobado
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Calendar size={13} className="text-slate-500" />
              <span>{formatDate(vuelo.fechaVuelo)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock size={13} className="text-slate-500" />
              <span>{formatTime(vuelo.horaDespegue)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 col-span-2">
              <User size={13} className="text-slate-500" />
              <span className="truncate">{vuelo.solicitanteNombre}</span>
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded border ml-auto',
                ROLE_COLORS[vuelo.solicitanteRol]
              )}>
                {vuelo.solicitanteRol}
              </span>
            </div>
          </div>
        </div>

        <ChevronRight size={16}
          className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" />
      </div>
    </div>
  )
}
