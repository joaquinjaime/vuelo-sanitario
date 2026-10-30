import React, { useRef, useState } from "react";
import { api } from "./api";

export const dniDigits = (value) => String(value ?? "").replace(/[^0-9]/g, "");
/** Avisa antes de enviar con las mismas reglas del servidor (que decide): formato, rango de dígitos e igualdad con el actual. */
export function dniProblem(current, next) {
  const raw = String(next ?? "").trim();
  if (!raw) return "Indique el DNI nuevo";
  if (!/^[0-9.\s-]+$/.test(raw)) return "El DNI sólo puede contener dígitos, puntos, guiones y espacios";
  const digits = dniDigits(raw);
  if (digits.length < 7 || digits.length > 12) return "El DNI debe tener entre 7 y 12 dígitos";
  if (current && digits === dniDigits(current)) return "El DNI nuevo es igual al actual";
  return "";
}
const EMPTY = { dniNuevo: "", motivo: "", cotejo: false, cuenta: false };

/**
 * Rectificación (o primera asignación) del DNI de una identidad compartida. Es el mismo formulario para la ficha de paciente y para el detalle de
 * usuario: sólo cambia el endpoint, que aplica las mismas reglas en el servidor (única autoridad).
 * `current` = { dni, version, cuentaEstado } de la identidad mostrada; `scope` describe con qué está compartida; `onChanged(resultado)` recibe la
 * respuesta del servidor para refrescar la pantalla; `onReload()` vuelve a cargar el registro cuando la versión quedó vencida.
 */
export function DniRectification({ path, current, scope, onChanged, onReload, reloadLabel = "Volver a cargar la ficha", notify = () => {} }) {
  const [open, setOpen] = useState(false), [form, setForm] = useState(EMPTY), [error, setError] = useState(null), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const check = form.dniNuevo ? dniProblem(current.dni, form.dniNuevo) : "";
  const ready = !check && form.dniNuevo.trim() && form.motivo.trim().length >= 10 && form.cotejo && (!current.cuentaEstado || form.cuenta);
  const close = () => { setOpen(false); setForm(EMPTY); setError(null); };
  const submit = async (event) => {
    event.preventDefault();
    if (busy.current || !ready) return;
    const problem = dniProblem(current.dni, form.dniNuevo);
    if (problem) { setError({ message: problem }); return; }
    busy.current = true; setSaving(true); setError(null);
    try {
      const result = await api(path, { method: "PUT", body: JSON.stringify({ dniNuevo: form.dniNuevo.trim(), version: current.version, motivo: form.motivo.trim(), cotejoDocumental: form.cotejo, confirmaCuenta: current.cuentaEstado ? form.cuenta : null }) });
      close(); await onChanged?.(result); notify("DNI rectificado");
    } catch (failure) { setError({ message: failure.message || "No se pudo rectificar el DNI", code: failure.code }); }
    finally { busy.current = false; setSaving(false); }
  };
  const state = current.cuentaEstado ? current.cuentaEstado.replaceAll("_", " ").toLowerCase() : "";
  if (!open) return <p><button type="button" className="secondary-action" onClick={() => { setOpen(true); setError(null); }}>{current.dni ? "Rectificar DNI" : "Asignar DNI"}</button></p>;
  return (
    <form className="grid-form" onSubmit={submit} aria-label="Rectificación del DNI">
      <h3 className="wide">{current.dni ? "Rectificación del DNI" : "Asignación del DNI"}</h3>
      <p className="wide" role="note">El DNI identifica una identidad compartida ({scope}). Se conservan la persona, su ficha, sus vuelos y sus documentos; sólo cambia el número. Si el DNI ya pertenece a otra persona se rechaza: este procedimiento nunca fusiona identidades.</p>
      <p className="wide">DNI actual: <strong>{current.dni || "No registrado"}</strong></p>
      <label>DNI nuevo<input inputMode="numeric" maxLength={20} value={form.dniNuevo} onChange={(event) => setForm({ ...form, dniNuevo: event.target.value })} /></label>
      {check && <p className="error wide" role="status">{check}</p>}
      <label className="wide">Motivo de la rectificación<textarea required minLength={10} maxLength={500} value={form.motivo} onChange={(event) => setForm({ ...form, motivo: event.target.value })} /></label>
      <label className="wide"><input type="checkbox" checked={form.cotejo} onChange={(event) => setForm({ ...form, cotejo: event.target.checked })} /> Declaro que cotejé la identidad con documentación suficiente (no es una verificación automática con organismos oficiales)</label>
      {current.cuentaEstado && <>
        <p className="wide" role="note">Esta persona tiene una cuenta de usuario ({state}). El cambio no modifica su contraseña, roles, estado ni sesiones.{current.cuentaEstado === "PENDIENTE_ACTIVACION" ? " Como la cuenta aún no se activó, deberá activarla con el DNI corregido; el código de activación vigente no se regenera." : ""}</p>
        <label className="wide"><input type="checkbox" checked={form.cuenta} onChange={(event) => setForm({ ...form, cuenta: event.target.checked })} /> Confirmo que el cambio de DNI no altera las credenciales ni los accesos de la cuenta</label>
      </>}
      {error && <p className="error wide" role="alert">{error.message}</p>}
      {error?.code === "PATIENT_STALE_IDENTITY" && <p className="wide"><button type="button" onClick={() => { close(); onReload?.(); }}>{reloadLabel}</button></p>}
      <button disabled={saving || !ready}>{saving ? "Guardando…" : "Confirmar rectificación"}</button>
      <button type="button" className="secondary-action" disabled={saving} onClick={close}>Cancelar</button>
    </form>
  );
}
