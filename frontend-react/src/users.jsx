import React, { useEffect, useState } from "react";
import { api } from "./api";
import { formatInstant } from "./audit";

const message = (e, fallback = "No se pudo completar la operación") => e?.message || fallback;
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
export const ROLE_LABEL = { ADMINISTRADOR: "Administrador", CENTRO_OPERACIONES: "Centro de Operaciones", OPERACIONES: "Operaciones", COMANDANTE: "Comandante", DTS: "DTS" };
const STATE_LABEL = { ACTIVO: "Activa", PENDIENTE_ACTIVACION: "Pendiente de activación", DESACTIVADO: "Desactivada" };
const roleText = (roles = []) => roles.map((r) => ROLE_LABEL[r] || r).join(", ") || "—";

/** Lista de impedimentos devuelta por el backend: explica qué vuelo, informe o solicitud impide la acción. */
export function Blockers({ items = [], title = "Responsabilidades vigentes que lo impiden" }) {
  if (!items.length) return null;
  return <div role="alert" className="error user-blockers"><strong>{title}</strong><ul>{items.map((b, i) => <li key={`${b.tipo}-${b.vueloId}-${i}`}>{b.detalle}</li>)}</ul><p className="hint">No se reasigna ni se cancela nada automáticamente: resuelva estas responsabilidades y reintente.</p></div>;
}

/** Contraseña o código mostrados una única vez; no vuelven a consultarse desde ningún listado ni detalle. */
export function SecretNotice({ eyebrow, title, intro, label, secret, onClose }) {
  return <div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true" aria-labelledby="secret-notice-title">
    <p className="eyebrow">{eyebrow}</p><h2 id="secret-notice-title">{title}</h2><p>{intro}</p><p>{label}</p><code>{secret}</code>
    <div className="form-actions"><button type="button" onClick={() => navigator.clipboard?.writeText(secret)}>Copiar</button><button type="button" className="secondary-action" onClick={onClose}>Cerrar aviso</button></div></section></div>;
}

/** Historial administrativo de la cuenta: reutiliza la auditoría V46 (sólo administración) con los eventos USER y USER_ROLE. */
function UserHistory({ userId, refresh }) {
  const [items, setItems] = useState(null), [error, setError] = useState(""), [zone, setZone] = useState("America/Argentina/Tucuman");
  useEffect(() => {
    let active = true; setItems(null); setError("");
    Promise.all(["USER", "USER_ROLE"].map((t) => api(`/audit?entityType=${t}&entityId=${userId}&size=20`)))
      .then((pages) => { if (!active) return; setZone(pages[0]?.timeZone || zone); setItems(pages.flatMap((p) => p?.items || []).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id)); })
      .catch((e) => { if (active) setError(message(e, "No se pudo cargar el historial")); });
    return () => { active = false; };
  }, [userId, refresh]);
  return <section className="user-history" aria-label="Historial administrativo"><h4>Historial administrativo</h4>
    {error && <p role="alert" className="error">{error}</p>}{!items && !error && <p role="status">Cargando historial…</p>}
    {items && items.length === 0 && <p>Esta cuenta todavía no tiene operaciones administrativas registradas.</p>}
    {items && items.length > 0 && <ol className="audit-timeline">{items.map((e) => <li key={e.id}><p><strong>{e.operationLabel}</strong></p><p>{e.summary}</p><p className="hint"><time dateTime={e.occurredAt}>{formatInstant(e.occurredAt, zone)}</time> · {e.actor.label}</p></li>)}</ol>}
  </section>;
}

function Detail({ id, roleOptions, notify, onChanged, onClose }) {
  const [detail, setDetail] = useState(null), [error, setError] = useState(""), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [reason, setReason] = useState(""), [secret, setSecret] = useState(null), [refresh, setRefresh] = useState(0), [blockers, setBlockers] = useState([]);
  const load = async () => {
    try { const d = await api(`/auth/users/${id}`); setDetail(d); setError("");
      setForm({ nombre: d.nombre, apellido: d.apellido, fechaNacimiento: d.fechaNacimiento || "", licenciaAeronautica: d.licenciaAeronautica || "", roles: [...(d.roles || [])] }); }
    catch (e) { setError(message(e, "No se pudo cargar el usuario")); }
  };
  useEffect(() => { setDetail(null); setBlockers([]); setReason(""); load(); }, [id]);
  /** Ejecuta una operación sensible: bloquea envíos duplicados y sólo informa éxito tras la confirmación del backend. */
  const run = async (fn, success) => {
    if (busy) return; setBusy(true); setBlockers([]);
    try { const result = await fn(); await load(); setRefresh((x) => x + 1); await onChanged?.(); if (success) notify(success); return result; }
    catch (e) { setBlockers(e.impedimentos || []); notify(message(e), true); }
    finally { setBusy(false); }
  };
  if (error) return <section className="card user-detail"><p role="alert" className="error">{error}</p><button type="button" className="secondary-action" onClick={onClose}>Cerrar</button></section>;
  if (!detail || !form) return <section className="card user-detail"><p role="status">Cargando usuario…</p></section>;
  const d = detail, inactive = !d.activo, pending = d.estado === "PENDIENTE_ACTIVACION", name = `${d.nombre} ${d.apellido}`;
  const toggleRole = (r) => setForm({ ...form, roles: form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r] });
  const save = (e) => { e.preventDefault(); if (!form.roles.length) { notify("La cuenta debe conservar al menos un rol", true); return; }
    run(() => api(`/auth/users/${id}`, { method: "PUT", body: JSON.stringify({ ...form, fechaNacimiento: form.fechaNacimiento || null, licenciaAeronautica: form.licenciaAeronautica || null, activo: d.activo }) }), "Datos de la cuenta guardados"); };
  const deactivate = () => { if (!window.confirm(`¿Desactivar a ${name}? Se cerrarán sus sesiones y se conservará todo su historial.`)) return;
    run(() => api(`/auth/users/${id}/deactivate`, { method: "PATCH", body: JSON.stringify({ motivo: reason.trim() || null }) }), "Usuario desactivado"); };
  const reactivate = (e) => { e.preventDefault(); if (!window.confirm(`¿Reactivar a ${name}? Se generará una contraseña temporal y deberá cambiarla al ingresar.`)) return;
    run(async () => { const r = await api(`/auth/users/${id}/reactivate`, { method: "PATCH", body: JSON.stringify({ ...form, fechaNacimiento: form.fechaNacimiento || null, licenciaAeronautica: form.licenciaAeronautica || null }) }); setSecret({ kind: "reactivation", username: d.username, secret: r.contrasenaTemporal }); return r; }, "Usuario reactivado. Guardá la contraseña temporal antes de cerrar el aviso."); };
  const reset = () => { if (!window.confirm(`¿Restablecer las credenciales de ${name}? Se cerrarán sus sesiones y deberá cambiar la contraseña temporal al ingresar.`)) return;
    run(async () => { const r = await api(`/auth/users/${id}/credential-reset`, { method: "POST" }); setSecret({ kind: "reset", username: d.username, secret: r.contrasenaTemporal }); return r; }, "Credenciales restablecidas. Guardá la contraseña temporal antes de cerrar el aviso."); };
  const regenerate = () => run(async () => { const r = await api(`/auth/users/${id}/activation-code`, { method: "POST" }); setSecret({ kind: "activation", secret: r.codigo }); return r; }, "Código de activación regenerado");
  const blockedReason = d.esUsted ? "No puede desactivar su propia cuenta." : d.ultimoAdministrador ? "Es el último administrador activo del sistema." : d.impedimentosBaja.length ? "Tiene responsabilidades operativas vigentes." : "";
  return <section className="card user-detail" aria-label={`Detalle de ${name}`}>
    <div className="section-title"><div><p className="eyebrow">CUENTA</p><h3>{name}</h3><p><span className={`status status-${(d.estado || "").toLowerCase()}`}>{STATE_LABEL[d.estado] || d.estado}</span>{d.debeCambiarContrasena && <span className="status status-pendiente_activacion">Debe cambiar la contraseña</span>}</p></div><button type="button" className="secondary-action" onClick={onClose}>Cerrar detalle</button></div>
    <dl className="audit-facts">
      <div><dt>DNI</dt><dd>{d.dni || "—"}</dd></div><div><dt>Usuario</dt><dd>{d.username || "Sin activar"}</dd></div><div><dt>Fecha de nacimiento</dt><dd>{d.fechaNacimiento || "—"}</dd></div><div><dt>Alta</dt><dd>{dt(d.fechaCreacion)}</dd></div>
      <div><dt>Roles</dt><dd>{roleText(d.roles)}</dd></div>{d.licenciaAeronautica && <div><dt>Licencia aeronáutica</dt><dd>{d.licenciaAeronautica}</dd></div>}{d.provinciaActual && <div><dt>Provincia actual</dt><dd>{d.provinciaActual}</dd></div>}
      <div><dt>Correos</dt><dd>{d.correos.map((c) => c.valor).join(", ") || "—"}</dd></div><div><dt>Teléfonos</dt><dd>{d.telefonos.map((c) => c.valor).join(", ") || "—"}</dd></div>
      {inactive && <><div><dt>Desactivada</dt><dd>{dt(d.fechaBaja)}</dd></div><div><dt>Desactivada por</dt><dd>{d.bajaPor || "No registrado"}</dd></div><div><dt>Motivo</dt><dd>{d.motivoBaja || "No registrado"}</dd></div></>}
    </dl>
    <Blockers items={blockers} title="La operación fue rechazada" />
    <form className="grid-form" onSubmit={inactive ? reactivate : save} aria-label={inactive ? "Reactivar cuenta" : "Edición administrativa"}>
      <h4 className="wide">{inactive ? "Reactivar cuenta" : "Edición administrativa"}</h4>
      <label>Nombre<input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
      <label>Apellido<input required value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} /></label>
      <label>Fecha de nacimiento<input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} /></label>
      {form.roles.includes("COMANDANTE") && <label>Licencia aeronáutica<input value={form.licenciaAeronautica} onChange={(e) => setForm({ ...form, licenciaAeronautica: e.target.value })} /></label>}
      <fieldset className="wide"><legend>Roles</legend>{roleOptions.map((r) => <label className="check" key={r.codigo}><input type="checkbox" disabled={d.esUsted && !inactive} checked={form.roles.includes(r.codigo)} onChange={() => toggleRole(r.codigo)} />{ROLE_LABEL[r.codigo] || r.nombre}</label>)}
        {d.esUsted && !inactive && <p className="hint">No puede modificar sus propios roles.</p>}{!inactive && <p className="hint">Al cambiar los roles se cierran las sesiones abiertas de la cuenta. No se puede retirar un rol con responsabilidades vigentes.</p>}</fieldset>
      <p className="hint wide">El DNI identifica a la persona en todo el sistema y no se modifica desde aquí. Los datos de contacto los mantiene cada usuario desde Mi cuenta.</p>
      <div className="wide form-actions"><button disabled={busy}>{busy ? "Guardando…" : inactive ? "Reactivar y generar contraseña temporal" : "Guardar cambios"}</button></div>
    </form>
    {!inactive && d.username && <section className="user-actions" aria-label="Acciones sobre la cuenta">
      <h4>Acceso y baja</h4>
      <Blockers items={d.impedimentosBaja} />
      <label>Motivo de la baja (opcional)<textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="form-actions"><button type="button" className="secondary-action" disabled={busy || !!blockedReason} onClick={deactivate}>Desactivar cuenta</button>
        <button type="button" className="secondary-action" disabled={busy || d.esUsted} onClick={reset}>Restablecer credenciales</button></div>
      {blockedReason && <p className="hint">No se puede desactivar: {blockedReason}</p>}
    </section>}
    {pending && <div className="form-actions"><button type="button" disabled={busy} onClick={regenerate}>Regenerar código de activación</button></div>}
    <UserHistory userId={id} refresh={refresh} />
    {secret && secret.kind === "activation" && <SecretNotice eyebrow="CÓDIGO DE ACTIVACIÓN" title="Código de activación" intro="Este código se mostrará una sola vez. Guardalo antes de cerrar este aviso." label="" secret={secret.secret} onClose={() => setSecret(null)} />}
    {secret && secret.kind !== "activation" && <SecretNotice eyebrow={secret.kind === "reset" ? "CREDENCIALES RESTABLECIDAS" : "USUARIO REACTIVADO"} title="Contraseña temporal" intro="Se muestra una única vez y no puede consultarse después. El usuario deberá cambiarla al iniciar sesión." label={<>Usuario: <strong>{secret.username}</strong></>} secret={secret.secret} onClose={() => setSecret(null)} />}
  </section>;
}

/** Listado administrativo paginado por el servidor, con búsqueda, filtro por rol y detalle. */
export function UserDirectory({ active = true, notify = () => {}, reloadToken = 0, onChanged, onCreate }) {
  const [text, setText] = useState(""), [query, setQuery] = useState(""), [role, setRole] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(0), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [selected, setSelected] = useState(null), [roleOptions, setRoleOptions] = useState([]), [attempt, setAttempt] = useState(0);
  useEffect(() => { let on = true; api("/auth/roles").then((r) => { if (on) setRoleOptions(Array.isArray(r) ? r : []); }).catch(() => { if (on) setRoleOptions(Object.keys(ROLE_LABEL).filter((c) => c !== "OPERACIONES").map((codigo) => ({ codigo, nombre: ROLE_LABEL[codigo] }))); }); return () => { on = false; }; }, []);
  useEffect(() => { const t = setTimeout(() => { setQuery(text.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setPage(0); setSelected(null); setStatus(""); }, [active]);
  useEffect(() => {
    let on = true; setLoading(true); setError("");
    const params = new URLSearchParams({ status: active ? (status || "ACTIVOS") : "INACTIVOS", page: String(page), size: "20" });
    if (query) params.set("q", query); if (role) params.set("role", role);
    api(`/auth/users/search?${params}`).then((d) => { if (on) setData(d); }).catch((e) => { if (on) { setData(null); setError(message(e, "No se pudo cargar los usuarios")); } }).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [active, status, query, role, page, reloadToken, attempt]);
  const items = data?.items || [], filtered = !!(query || role || status);
  const changed = async () => { setAttempt((x) => x + 1); await onChanged?.(); };
  return <section className="card user-directory">
    <div className="section-title"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>{active ? "Usuarios activos" : "Usuarios desactivados"}</h1><p>{data ? `${data.total} ${active ? "cuentas activas o pendientes de activación" : "cuentas dadas de baja"}` : "Cargando…"}</p></div>{active && onCreate && <button type="button" onClick={onCreate}>Nuevo usuario</button>}</div>
    <div className="filters">
      <input aria-label="Buscar usuarios" placeholder="Buscar por nombre, DNI o usuario" value={text} onChange={(e) => setText(e.target.value)} />
      <select aria-label="Filtrar por rol" value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }}><option value="">Todos los roles</option>{roleOptions.map((r) => <option key={r.codigo} value={r.codigo}>{ROLE_LABEL[r.codigo] || r.nombre}</option>)}</select>
      {active && <select aria-label="Filtrar por estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="">Activas y pendientes</option><option value="PENDIENTES">Sólo pendientes de activación</option></select>}
    </div>
    {loading && <p role="status">Cargando usuarios…</p>}
    {error && <p role="alert" className="error">{error} <button type="button" className="secondary-action" onClick={() => setAttempt((x) => x + 1)}>Reintentar</button></p>}
    {!loading && !error && data && items.length === 0 && <p className="empty">{filtered ? "Ningún usuario coincide con la búsqueda." : `No hay usuarios ${active ? "activos" : "desactivados"} para mostrar.`}</p>}
    {items.length > 0 && <table aria-label={active ? "Usuarios activos" : "Usuarios desactivados"}><thead><tr><th>Nombre</th><th>Apellido</th><th>DNI</th><th>Usuario</th><th>Roles</th><th>Estado</th>{!active && <><th>Baja</th><th>Responsable</th><th>Motivo</th></>}<th>Acciones</th></tr></thead>
      <tbody>{items.map((x) => <tr key={x.id} className={selected === x.id ? "audit-selected" : ""}><td>{x.nombre}</td><td>{x.apellido}</td><td>{x.dni || "—"}</td><td>{x.username || "—"}</td><td>{roleText(x.roles)}</td>
        <td>{STATE_LABEL[x.estado] || x.estado}{x.debeCambiarContrasena ? " · cambio de contraseña pendiente" : ""}</td>{!active && <><td>{dt(x.fechaBaja)}</td><td>{x.bajaPor || "No registrado"}</td><td>{x.motivoBaja || "—"}</td></>}
        <td><button type="button" className="secondary-action" onClick={() => setSelected(selected === x.id ? null : x.id)}>{selected === x.id ? "Cerrar" : "Detalle"}</button>{x.activo && x.username && <button type="button" className="secondary-action" onClick={() => setSelected(x.id)}>Desactivar</button>}{!x.activo && x.username && <button type="button" className="secondary-action" onClick={() => setSelected(x.id)}>Reactivar</button>}</td></tr>)}</tbody></table>}
    {data && data.totalPages > 0 && <p className="audit-pager"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Anterior</button> Página {page + 1} de {data.totalPages} · {data.total} usuarios <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Siguiente</button></p>}
    {selected && <Detail key={selected} id={selected} roleOptions={roleOptions} notify={notify} onChanged={changed} onClose={() => setSelected(null)} />}
  </section>;
}
