// En Docker, Nginx reenvía /api al backend y el navegador nunca conoce el
// hostname interno del contenedor. VITE_API_URL sólo es un override local.
const base = import.meta.env.VITE_API_URL || '/api';
export async function api(path, options = {}) {
  const token = localStorage.getItem('vs-token');
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); const error = new Error(body.error || 'No se pudo completar la operación'); Object.assign(error, body); throw error; }
  return response.status === 204 ? null : response.json();
}
