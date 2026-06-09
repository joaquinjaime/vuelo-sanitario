import api from './axiosInstance'

export const authApi = {
  login:   (data) => api.post('/auth/login', data).then(r => r.data),
  refresh: (token) => api.post('/auth/refresh', null, {
    headers: { 'X-Refresh-Token': token }
  }).then(r => r.data),
}
