// En Docker, Nginx reenvía /api al backend y el navegador nunca conoce el
// hostname interno del contenedor. VITE_API_URL sólo es un override local.
const base = import.meta.env.VITE_API_URL || '/api';
export async function api(path, options = {}) {
  const token = localStorage.getItem('vs-token');
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); const error = new Error(body.error || 'No se pudo completar la operación'); Object.assign(error, body); throw error; }
  return response.status === 204 ? null : response.json();
}
export async function uploadFile(path, file, fields = {}) {
  const token = localStorage.getItem('vs-token');
  const body = new FormData();
  Object.entries(fields).forEach(([key, value]) => body.append(key, value));
  body.append('file', file);
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'No se pudo procesar el documento'); }
  return response.json();
}
export async function downloadFile(path) {
  const token = localStorage.getItem('vs-token');
  const response = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'No se pudo procesar el documento'); }
  return response.blob();
}
export async function credentialFile(path, file) {
  const token = localStorage.getItem('vs-token');
  const body = file ? new FormData() : undefined;
  if (file) body.append('file', file);
  const response = await fetch(`${base}${path}`, { method: file ? 'POST' : 'GET', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'No se pudo procesar el documento'); }
  return file ? response.json() : response.blob();
}
