import api from './axiosInstance'

export const peticionApi = {
  listar:                () => api.get('/peticiones').then(r => r.data),
  getById:               (id) => api.get(`/peticiones/${id}`).then(r => r.data),
  crear:                 (data) => api.post('/peticiones', data).then(r => r.data),
  aprobar:               (id) => api.patch(`/peticiones/${id}/aprobar`).then(r => r.data),
  confirmarFactibilidad: (id) => api.patch(`/peticiones/${id}/confirmar-factibilidad`).then(r => r.data),
  confirmarDts:          (id) => api.patch(`/peticiones/${id}/confirmar-dts`).then(r => r.data),
  rechazar:              (id, motivo) => api.patch(`/peticiones/${id}/rechazar`, { motivo }).then(r => r.data),
}
