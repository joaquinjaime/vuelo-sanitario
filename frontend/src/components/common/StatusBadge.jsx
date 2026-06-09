import { getEstadoConfig } from '../../utils/estadoUtils'

export default function StatusBadge({ estado }) {
  const cfg = getEstadoConfig(estado)
  return (
    <span className={cfg.badgeClass}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.icon} {cfg.label}
    </span>
  )
}
