import api from './axiosInstance'

export const vueloApi = {
  listar:        (estado) => api.get('/vuelos', { params: estado ? { estado } : {} }).then(r => r.data),
  getById:       (id) => api.get(`/vuelos/${id}`).then(r => r.data),
  cancelar:      (id, motivoCancelacion) => api.patch(`/vuelos/${id}/cancelar`, { motivoCancelacion }).then(r => r.data),
  marcarAprobado:(id) => api.patch(`/vuelos/${id}/marcar-aprobado`).then(r => r.data),
  cambiarEstado: (id, estado) => api.patch(`/vuelos/${id}/estado`, { estado }).then(r => r.data),

  // Info del vuelo — multipart
  cargarInfo: (idVuelo, endpoint, datos, pdfFile) => {
    const form = new FormData()
    form.append('datos', new Blob([JSON.stringify(datos)], { type: 'application/json' }))
    if (pdfFile) form.append('pdf', pdfFile)
    return api.put(`/vuelos/${idVuelo}/${endpoint}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },
  getInfo:       (id) => api.get(`/vuelos/${id}/info`).then(r => r.data),
  getHistorial:  (id) => api.get(`/vuelos/${id}/historial`).then(r => r.data),

  // Informe final
  getInformeFinal:     (id) => api.get(`/vuelos/${id}/informe-final`).then(r => r.data),
  crearInformeFinal:   (id, data) => api.post(`/vuelos/${id}/informe-final`, data).then(r => r.data),
  editarInformeFinal:  (id, data) => api.put(`/vuelos/${id}/informe-final`, data).then(r => r.data),
}
