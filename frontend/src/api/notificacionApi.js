import api from './axiosInstance'

export const notificacionApi = {
  listar:         () => api.get('/notificaciones').then(r => r.data),
  contarNoLeidas: () => api.get('/notificaciones/no-leidas/count').then(r => r.data.count),
  marcarLeida:    (id) => api.patch(`/notificaciones/${id}/leer`).then(r => r.data),
}
