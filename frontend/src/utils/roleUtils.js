export const ROLES = {
  DTS:         'DTS',
  COMANDANTE:  'COMANDANTE',
  OPERACIONES: 'OPERACIONES',
}

export const ROLE_LABELS = {
  DTS:         'Dirección de Tránsito Sanitario',
  COMANDANTE:  'Comandante',
  OPERACIONES: 'Centro de Operaciones',
}

export const ROLE_COLORS = {
  DTS:         'text-cyan-400 bg-cyan-900/30 border-cyan-800/40',
  COMANDANTE:  'text-purple-400 bg-purple-900/30 border-purple-800/40',
  OPERACIONES: 'text-amber-400 bg-amber-900/30 border-amber-800/40',
}

export function getRoleLabel(rol) {
  return ROLE_LABELS[rol] ?? rol
}

export function canCancelVuelo(rol) {
  return [ROLES.DTS, ROLES.COMANDANTE, ROLES.OPERACIONES].includes(rol)
}

export function canCargarInfo(rol) {
  return [ROLES.COMANDANTE, ROLES.OPERACIONES].includes(rol)
}

export function canApproveForm(rol) {
  return rol === ROLES.OPERACIONES
}

export function canCreatePeticion(rol) {
  return rol === ROLES.DTS
}
