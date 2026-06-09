import { format, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatDate(date) {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return isValid(d) ? format(d, 'dd/MM/yyyy', { locale: es }) : '—'
  } catch { return '—' }
}

export function formatDateTime(date) {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return isValid(d) ? format(d, 'dd/MM/yyyy HH:mm', { locale: es }) : '—'
  } catch { return '—' }
}

export function formatTime(time) {
  if (!time) return '—'
  // time puede venir como "HH:mm:ss" o "HH:mm"
  return time?.substring(0, 5) ?? '—'
}
