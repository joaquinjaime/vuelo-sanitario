import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { DEFAULT_COUNTRY, phoneProblem, toE164, toNational } from "./contactRules";
import { PhoneField } from "./phoneField";

const message = (e, fallback = "No se pudo completar la operación") => e?.message || fallback;
export const MAX_CONTACTS = 3;
export const RELATIONS = {
  PACIENTE: "El propio paciente",
  FAMILIAR_RESPONSABLE: "Familiar o responsable",
  ESTABLECIMIENTO_ORIGEN: "Establecimiento de origen",
  ESTABLECIMIENTO_DESTINO: "Establecimiento de destino",
  OTRO: "Otro",
};
export const emptyContact = () => ({ relacion: "FAMILIAR_RESPONSABLE", nombre: "", pais: DEFAULT_COUNTRY, telefono: "", observaciones: "" });
const isBlank = (c) => !c.nombre.trim() && !c.telefono.trim() && !c.observaciones.trim();

/** Mismas reglas que el servidor (que decide): avisan antes de enviar. Devuelve el texto del primer problema o "". */
export function contactProblem(c) {
  if (!c.telefono.trim()) return "Indique el teléfono de contacto";
  const phone = phoneProblem(c.telefono, c.pais);
  if (phone) return phone;
  if (c.relacion !== "PACIENTE" && !c.nombre.trim()) return "Indique el nombre de la persona o del establecimiento a contactar";
  return "";
}
export function rowsProblem(rows) {
  const filled = rows.filter((c) => !isBlank(c));
  for (const c of filled) { const p = contactProblem(c); if (p) return p; }
  const phones = filled.map((c) => toE164(c.telefono, c.pais));
  if (new Set(phones).size !== phones.length) return "El mismo teléfono figura más de una vez: informe una sola vez a quién pertenece";
  if (filled.filter((c) => c.relacion === "PACIENTE").length > 1) return "Sólo puede informarse un contacto del propio paciente";
  return "";
}
/** Lo que se envía en la solicitud: filas completas, sin las vacías; el primero es el principal. */
export const contactsPayload = (rows) => rows.filter((c) => !isBlank(c)).map((c) => ({ relacion: c.relacion, nombre: c.nombre.trim() || null, pais: c.pais, telefono: c.telefono.trim(), observaciones: c.observaciones.trim() || null }));

function ContactRow({ value, onChange, idPrefix, namedHint }) {
  return <div className="transfer-contact-row">
    <label>Relación con el paciente
      <select value={value.relacion} onChange={(e) => onChange({ ...value, relacion: e.target.value })}>{Object.entries(RELATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>{value.relacion === "PACIENTE" ? "Nombre (opcional)" : "Nombre de la persona o establecimiento"}
      <input id={`${idPrefix}-nombre`} value={value.nombre} maxLength={150} onChange={(e) => onChange({ ...value, nombre: e.target.value })} placeholder={namedHint} /></label>
    <div className="wide transfer-contact-phone-field"><PhoneField label="Teléfono" idPrefix={`${idPrefix}-telefono`} value={{ pais: value.pais, numero: value.telefono }} onChange={(v) => onChange({ ...value, pais: v.pais, telefono: v.numero })} /></div>
    <label>Indicaciones (horarios, interno…)
      <input value={value.observaciones} maxLength={200} onChange={(e) => onChange({ ...value, observaciones: e.target.value })} /></label>
  </div>;
}

/**
 * Contactos para coordinar ESTE traslado, dentro de la solicitud del DTS. No son contactos personales de nadie: no modifican los
 * datos de la persona del paciente ni de ninguna cuenta. Opcionales; el primero es el principal. No incluir datos clínicos.
 */
export function TransferContactFields({ rows, setRows }) {
  const set = (i, v) => setRows(rows.map((r, j) => (j === i ? v : r)));
  return <fieldset className="wide transfer-contacts-fieldset">
    <legend>Contactos para coordinar el traslado (opcional)</legend>
    <p className="hint">Indique a quién llamar para coordinar este traslado. Pertenecen sólo a esta solicitud: no se guardan como contacto personal del paciente ni de ninguna cuenta, no se verifican y no se envían mensajes automáticos. Será visible para usted y para el Centro de Operaciones mientras el traslado esté en curso. No incluya datos clínicos.</p>
    {rows.map((r, i) => <div key={i} className="transfer-contact-block">
      <p className="eyebrow">{i === 0 ? "Contacto principal" : `Contacto ${i + 1}`}</p>
      <ContactRow value={r} onChange={(v) => set(i, v)} idPrefix={`contacto-${i}`} />
      <button type="button" className="secondary-action" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Quitar este contacto</button>
    </div>)}
    {rows.length < MAX_CONTACTS && <button type="button" className="secondary-action" onClick={() => setRows([...rows, emptyContact()])}>Agregar contacto de coordinación</button>}
  </fieldset>;
}

const toForm = (v) => ({ relacion: v.relacion, nombre: v.nombre || "", pais: v.pais || "", telefono: v.pais ? toNational(v.telefono, v.pais) : v.telefono, observaciones: v.observaciones || "" });

/**
 * Contactos de coordinación de un vuelo sanitario, en su detalle. mode="dts": el solicitante los consulta y mantiene.
 * mode="ops": Operaciones / Centro de Operaciones los consulta a pedido (la consulta queda auditada) y no los edita.
 */
export function TransferContacts({ flightId, mode = "ops", msg = () => {} }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [requested, setRequested] = useState(mode === "dts");
  const [adding, setAdding] = useState(null), [editing, setEditing] = useState(null);
  const base = `/flights/${flightId}/transfer-contacts`;
  const load = useCallback(async (keepError = false) => {
    try { setData(await api(base)); if (!keepError) setError(""); } catch (e) { setData(null); setError(message(e, "No se pudieron cargar los contactos")); }
  }, [base]);
  useEffect(() => { setData(null); setError(""); setAdding(null); setEditing(null); setRequested(mode === "dts"); }, [flightId, mode]);
  useEffect(() => { if (requested) load(); }, [requested, load]);   // el mensaje de un intento fallido sobrevive a la relectura del estado vigente

  const run = async (path, options, success) => {
    setBusy(true); setError("");
    try { await api(path, options); msg(success); await load(); return true; }
    catch (e) { setError(message(e)); await load(true); return false; }
    finally { setBusy(false); }
  };
  const submitAdd = async (event) => {
    event.preventDefault();
    const problem = contactProblem(adding) || rowsProblem([adding]);
    if (problem) { setError(problem); return; }
    if (await run(base, { method: "POST", body: JSON.stringify(contactsPayload([adding])[0]) }, "Contacto de coordinación agregado")) setAdding(null);
  };
  const submitEdit = async (event) => {
    event.preventDefault();
    const problem = contactProblem(editing.form);
    if (problem) { setError(problem); return; }
    const body = { ...contactsPayload([editing.form])[0], version: editing.version };
    if (await run(`${base}/${editing.id}`, { method: "PUT", body: JSON.stringify(body) }, "Contacto de coordinación actualizado")) setEditing(null);
  };
  const retire = (c) => { if (window.confirm(`¿Retirar el contacto ${c.nombre || RELATIONS[c.relacion]}? Se conserva en el historial de la solicitud.`)) run(`${base}/${c.id}`, { method: "DELETE" }, "Contacto de coordinación retirado"); };

  return <section className="wide transfer-contacts" aria-label="Contactos de coordinación del traslado">
    <h4>Contactos de coordinación del traslado</h4>
    {!requested && <>
      <p className="hint">Datos personales de terceros: se muestran sólo para coordinar este traslado y la consulta queda registrada en la auditoría.</p>
      <button type="button" onClick={() => setRequested(true)}>Ver contactos de coordinación</button>
    </>}
    {requested && !data && !error && <p role="status">Cargando contactos…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {data && !data.disponible && <p className="hint">{data.motivoNoDisponible}</p>}
    {data && data.disponible && <>
      {data.items.length === 0 && <p className="empty">{mode === "dts" ? "No informó contactos para coordinar este traslado." : "El DTS no informó contactos de coordinación para este traslado."}</p>}
      <ul className="transfer-contact-list">
        {data.items.map((c) => <li key={c.id} className="contact">
          {editing?.id === c.id
            ? <form className="transfer-contact-edit" onSubmit={submitEdit} aria-label="Editar contacto de coordinación">
                <ContactRow value={editing.form} onChange={(form) => setEditing({ ...editing, form })} idPrefix="edit-contacto" />
                <button disabled={busy}>Guardar</button><button type="button" className="secondary-action" onClick={() => { setEditing(null); setError(""); }}>Cancelar</button>
              </form>
            : <>
                <strong>{c.nombre || RELATIONS[c.relacion]}</strong> <small>{RELATIONS[c.relacion]}</small>{c.principal && <em> · Principal</em>}
                <a href={`tel:${c.telefono.replace(/[\s\-().]/g, "")}`} className="transfer-contact-phone">{c.telefono}</a>
                {c.observaciones && <span className="hint"> {c.observaciones}</span>}
                {data.puedeEditar && <>
                  <button disabled={busy} onClick={() => { setError(""); setEditing({ id: c.id, version: c.version, form: toForm(c) }); }}>Editar</button>
                  {!c.principal && <button disabled={busy} onClick={() => run(`${base}/${c.id}/principal`, { method: "POST" }, "Contacto principal actualizado")}>Hacer principal</button>}
                  <button disabled={busy} onClick={() => retire(c)}>Retirar</button>
                </>}
              </>}
        </li>)}
      </ul>
      {mode === "ops" && data.items.length > 0 && <p className="hint">Esta consulta quedó registrada en la auditoría. Los números no se verifican ni se contactan desde el sistema.</p>}
      {data.puedeEditar && !adding && data.items.length < data.maximo && <button type="button" className="secondary-action" onClick={() => { setError(""); setAdding(emptyContact()); }}>Agregar contacto</button>}
      {data.puedeEditar && adding && <form className="transfer-contact-edit" onSubmit={submitAdd} aria-label="Agregar contacto de coordinación">
        <ContactRow value={adding} onChange={setAdding} idPrefix="nuevo-contacto" />
        <button disabled={busy}>Agregar</button><button type="button" className="secondary-action" onClick={() => { setAdding(null); setError(""); }}>Cancelar</button>
      </form>}
      {data.puedeEditar && data.items.length >= data.maximo && <p className="hint">Alcanzó el máximo de {data.maximo} contactos vigentes: retire uno para agregar otro.</p>}
    </>}
  </section>;
}
