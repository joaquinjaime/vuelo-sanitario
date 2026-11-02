import React, { useEffect, useState } from "react";
import { api } from "../../services/api";
import { formatInstant } from "../audit/audit";
import { DniRectification } from "../../components/forms/DniRectification";
import { Modal } from "../../components/ui/Modal";

const message = (e, fallback = "No se pudo completar la operación") => e?.message || fallback;
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
export const ROLE_LABEL = { ADMINISTRADOR: "Administrador", CENTRO_OPERACIONES: "Centro de Operaciones", OPERACIONES: "Operaciones", COMANDANTE: "Comandante", DTS: "DTS" };
export const STATE_LABEL = { ACTIVO: "Activa", PENDIENTE_ACTIVACION: "Pendiente de activación", DESACTIVADO: "Desactivada" };
export const roleText = (roles = []) => roles.map((r) => ROLE_LABEL[r] || r).join(", ") || "—";

/** Lista de impedimentos devuelta por el backend: explica qué vuelo, informe o solicitud impide la acción. */
export function Blockers({ items = [], title = "Responsabilidades vigentes que lo impiden" }) {
  if (!items.length) return null;
  return <div role="alert" className="error user-blockers"><strong>{title}</strong><ul>{items.map((b, i) => <li key={`${b.tipo}-${b.vueloId}-${i}`}>{b.detalle}</li>)}</ul><p className="hint">No se reasigna ni se cancela nada automáticamente: resuelva estas responsabilidades y reintente.</p></div>;
}

/** Contraseña o código mostrados una única vez; no vuelven a consultarse desde ningún listado ni detalle. */
export function SecretNotice({ eyebrow, title, intro, label, secret, onClose }) {
  return <Modal eyebrow={eyebrow} title={title} onClose={onClose} dismissible={false}
    footer={<><button type="button" onClick={() => navigator.clipboard?.writeText(secret)}>Copiar</button><button type="button" className="secondary-action" data-autofocus onClick={onClose}>Cerrar aviso</button></>}>
    <p>{intro}</p>{label ? <p>{label}</p> : null}<code className="secret-code">{secret}</code>
  </Modal>;
}

/** Historial administrativo de la cuenta: reutiliza la auditoría V46 (sólo administración) con los eventos USER y USER_ROLE. */
function UserHistory({ userId, patientId, refresh }) {
  const [items, setItems] = useState(null), [error, setError] = useState(""), [zone, setZone] = useState("America/Argentina/Tucuman");
  useEffect(() => {
    let active = true; setItems(null); setError("");
    Promise.all([["USER", userId], ["USER_ROLE", userId], ...(patientId ? [["PATIENT_IDENTITY", patientId]] : [])].map(([t, entity]) => api(`/audit?entityType=${t}&entityId=${entity}&size=20`)))
      .then((pages) => { if (!active) return; setZone(pages[0]?.timeZone || zone); setItems(pages.flatMap((p) => p?.items || []).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id)); })
      .catch((e) => { if (active) setError(message(e, "No se pudo cargar el historial")); });
    return () => { active = false; };
  }, [userId, patientId, refresh]);
  return <section className="user-history" aria-label="Historial administrativo"><h4>Historial administrativo</h4>
    {error && <p role="alert" className="error">{error}</p>}{!items && !error && <p role="status">Cargando historial…</p>}
    {items && items.length === 0 && <p>Esta cuenta todavía no tiene operaciones administrativas registradas.</p>}
    {items && items.length > 0 && <ol className="audit-timeline">{items.map((e) => <li key={e.id}><p><strong>{e.operationLabel}</strong></p><p>{e.summary}</p><p className="hint"><time dateTime={e.occurredAt}>{formatInstant(e.occurredAt, zone)}</time> · {e.actor.label}</p></li>)}</ol>}
  </section>;
}

export function UserDetail({ id, roleOptions, notify, onChanged, onClose }) {
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
      <div><dt>Correos</dt><dd>{d.correos.map((c) => `${c.valor} (${c.verificacion === "VERIFICADO" ? "verificado" : "sin verificar"})`).join(", ") || "—"}</dd></div><div><dt>Teléfonos</dt><dd>{d.telefonos.map((c) => `${c.valor} (${c.pais ? "formato validado" : "sin validar"})`).join(", ") || "—"}</dd></div>
      {inactive && <><div><dt>Desactivada</dt><dd>{dt(d.fechaBaja)}</dd></div><div><dt>Desactivada por</dt><dd>{d.bajaPor || "No registrado"}</dd></div><div><dt>Motivo</dt><dd>{d.motivoBaja || "No registrado"}</dd></div></>}
    </dl>
    <DniRectification key={`dni-${d.id}`} path={`/auth/users/${id}/dni`} current={{ dni: d.dni, version: d.versionIdentidad, cuentaEstado: d.estado }} scope={d.pacienteId ? "cuenta de usuario y ficha de paciente" : "cuenta de usuario"} reloadLabel="Volver a cargar la cuenta" notify={notify}
      onReload={load} onChanged={async () => { await load(); setRefresh((x) => x + 1); await onChanged?.(); }} />
    <Blockers items={blockers} title="La operación fue rechazada" />
    <form className="grid-form" onSubmit={inactive ? reactivate : save} aria-label={inactive ? "Reactivar cuenta" : "Edición administrativa"}>
      <h4 className="wide">{inactive ? "Reactivar cuenta" : "Edición administrativa"}</h4>
      <label>Nombre<input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
      <label>Apellido<input required value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} /></label>
      <label>Fecha de nacimiento<input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} /></label>
      {form.roles.includes("COMANDANTE") && <label>Licencia aeronáutica<input value={form.licenciaAeronautica} onChange={(e) => setForm({ ...form, licenciaAeronautica: e.target.value })} /></label>}
      <fieldset className="wide"><legend>Roles</legend>{roleOptions.map((r) => <label className="check" key={r.codigo}><input type="checkbox" disabled={d.esUsted && !inactive} checked={form.roles.includes(r.codigo)} onChange={() => toggleRole(r.codigo)} />{ROLE_LABEL[r.codigo] || r.nombre}</label>)}
        {d.esUsted && !inactive && <p className="hint">No puede modificar sus propios roles.</p>}{!inactive && <p className="hint">Al cambiar los roles se cierran las sesiones abiertas de la cuenta. No se puede retirar un rol con responsabilidades vigentes.</p>}</fieldset>
      <p className="hint wide">El DNI identifica a la persona en todo el sistema: se corrige únicamente con "Rectificar DNI", que exige motivo y cotejo documental. Los datos de contacto los mantiene cada usuario desde Mi cuenta.</p>
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
    <UserHistory userId={id} patientId={d.pacienteId} refresh={refresh} />
    {secret && secret.kind === "activation" && <SecretNotice eyebrow="CÓDIGO DE ACTIVACIÓN" title="Código de activación" intro="Código numérico de 6 dígitos, válido por 10 minutos y de un solo uso. Se muestra una sola vez: guardalo antes de cerrar este aviso." label="" secret={secret.secret} onClose={() => setSecret(null)} />}
    {secret && secret.kind !== "activation" && <SecretNotice eyebrow={secret.kind === "reset" ? "CREDENCIALES RESTABLECIDAS" : "USUARIO REACTIVADO"} title="Contraseña temporal" intro="Se muestra una única vez y no puede consultarse después. El usuario deberá cambiarla al iniciar sesión." label={<>Usuario: <strong>{secret.username}</strong></>} secret={secret.secret} onClose={() => setSecret(null)} />}
  </section>;
}
