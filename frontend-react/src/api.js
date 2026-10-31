// En Docker, Nginx reenvía /api al backend y el navegador nunca conoce el
// hostname interno del contenedor. VITE_API_URL sólo es un override local.
const base = import.meta.env.VITE_API_URL || '/api';

const errorMessage = (status, body) => {
  if (body?.error) return body.error;
  if (status === 401) return "La sesión venció. Volvé a ingresar.";
  if (status === 403) return "No tenés permiso para realizar esta operación.";
  return `No se pudo completar la operación (HTTP ${status}).`;
};

async function responseError(response) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* La respuesta puede venir de un proxy sin JSON. */ }
  const error = new Error(errorMessage(response.status, body));
  Object.assign(error, body, { status: response.status });
  return error;
}

export async function api(path, options = {}) {
  const token = localStorage.getItem('vs-token');
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (!response.ok) throw await responseError(response);
  // Varias operaciones confirman con 200 y cuerpo vacío (p. ej. el cambio de contraseña): un éxito no debe leerse como error.
  if (response.status === 204) return null;
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
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
