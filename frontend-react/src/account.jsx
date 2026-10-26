import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { DEFAULT_COUNTRY, countryName, emailProblem, phoneProblem, toNational } from "./contactRules";
import { PhoneField } from "./phoneField";

const message = (e, fallback = "No se pudo completar la operación") => e?.message || fallback;
const TYPE_LABEL = { PERSONAL: "Personal", LABORAL: "Laboral" };
const TYPE_OPTION = { PERSONAL: "Personal (privado)", LABORAL: "Laboral (lo consulta Operaciones)" };
/** Qué implica cada tipo: se muestra junto al selector para que el titular sepa quién podrá ver el dato. */
const TYPE_HINT = {
  PERSONAL: "Contacto personal: privado, nunca se muestra al Centro de Operaciones.",
  LABORAL: "Contacto laboral: mientras esté asignado como comandante o tripulante a un vuelo abierto, el Centro de Operaciones podrá consultarlo para coordinar, siempre que el correo esté verificado y el teléfono tenga su país validado. Cada consulta queda auditada.",
};
const VERIFICATION_LABEL = { VERIFICADO: "Verificado", PENDIENTE: "Pendiente de verificación", EXPIRADO: "Código vencido", SIN_VERIFICAR: "Sin verificar" };
const SEND_NOTICE = {
  NO_CONFIGURADO: "El correo quedó registrado, pero el servicio de correo no está configurado: no se pudo enviar el código. Avise al administrador.",
  FALLIDO: "El correo quedó registrado, pero el servidor de correo no aceptó el mensaje. Reintente con «Reenviar código».",
  LIMITE_ALCANZADO: "El correo quedó registrado, pero se alcanzó el límite de códigos enviados. Reintente más tarde.",
};

/** Cada tipo de contacto: sus reglas previas al envío (el servidor decide) y sus textos. */
const KINDS = {
  correos: {
    title: "Correos electrónicos", singular: "correo electrónico", base: "/auth/me/correos", field: "direccion", inputType: "email", placeholder: "nombre@dominio.com",
    check: (v) => emailProblem(v),
  },
  telefonos: {
    title: "Teléfonos", singular: "teléfono", base: "/auth/me/telefonos", field: "numero", inputType: "tel", placeholder: "",
    check: (v, form) => phoneProblem(v, form.pais),
  },
};

function ContactList({ kind, items, refresh, notify, busy, setBusy }) {
  const cfg = KINDS[kind], isPhone = kind === "telefonos", isEmail = kind === "correos";
  const blank = () => ({ valor: "", tipo: "PERSONAL", pais: isPhone ? DEFAULT_COUNTRY : undefined });
  const [adding, setAdding] = useState(blank());
  const [editing, setEditing] = useState(null);   // { id, valor, tipo, version, pais, verificado }
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [tried, setTried] = useState(false);
  const [codes, setCodes] = useState({});          // id -> código que se está escribiendo

  const run = async (path, options, success) => {
    setBusy(true); setError("");
    try {
      const result = await api(path, options);
      if (success) notify(success);
      await refresh();
      return result ?? true;
    } catch (e) {
      setError(message(e));
      if (e?.code === "CONTACT_VERSION_CONFLICT") setEditing(null);   // la edición parte de una versión vencida
      await refresh().catch(() => {});   // el listado pudo cambiar (otra sesión, contacto ya retirado): se muestra el estado vigente
      return false;
    } finally { setBusy(false); }
  };
  const describeSend = (result, address) => {
    if (!result || typeof result !== "object" || !isEmail) return;
    if (result.envio === "ENVIADO") setNotice(`Enviamos un código a ${address}. Ingréselo abajo para verificar el correo; vence en pocos minutos.`);
    else if (SEND_NOTICE[result.envio]) setNotice(SEND_NOTICE[result.envio]);
  };
  const problemOf = (form) => cfg.check(form.valor, form);
  const submitAdd = async (event) => {
    event.preventDefault(); setTried(true);
    const problem = problemOf(adding);
    if (problem) { setError(problem); return; }
    const body = { [cfg.field]: adding.valor.trim(), tipo: adding.tipo, ...(isPhone ? { pais: adding.pais } : {}) };
    setNotice("");
    const result = await run(cfg.base, { method: "POST", body: JSON.stringify(body) }, "Contacto agregado");
    if (result) { setAdding(blank()); setTried(false); describeSend(result, adding.valor.trim()); }
  };
  const submitEdit = async (event) => {
    event.preventDefault(); setTried(true);
    const problem = editing.verificado ? "" : problemOf(editing);
    if (problem) { setError(problem); return; }
    const body = { [cfg.field]: editing.valor.trim(), tipo: editing.tipo, version: editing.version, ...(isPhone ? { pais: editing.pais } : {}) };
    if (await run(`${cfg.base}/${editing.id}`, { method: "PUT", body: JSON.stringify(body) }, "Contacto actualizado")) { setEditing(null); setTried(false); }
  };
  const startEdit = (x) => {
    setError(""); setTried(false);
    setEditing({ id: x.id, valor: isPhone && x.pais ? toNational(x.valor, x.pais) : x.valor, tipo: x.tipo, version: x.version, pais: isPhone ? (x.pais || "") : undefined, verificado: isEmail && x.verificacion === "VERIFICADO" });
  };
  const remove = (item) => {
    if (!window.confirm(`¿Quitar el ${cfg.singular} ${item.valor}? Se conserva en el historial de la persona, pero deja de estar vigente.`)) return;
    run(`${cfg.base}/${item.id}`, { method: "DELETE" }, "Contacto retirado");
  };
  const sendCode = async (x) => {
    setNotice("");
    const result = await run(`${cfg.base}/${x.id}/verificacion`, { method: "POST" }, null);
    if (result) describeSend(result, x.valor);
  };
  const confirmCode = async (x) => {
    const code = (codes[x.id] || "").trim();
    if (!code) { setError("Ingrese el código que recibió por correo"); return; }
    setNotice("");
    if (await run(`${cfg.base}/${x.id}/verificacion/confirmar`, { method: "POST", body: JSON.stringify({ codigo: code }) }, "Correo verificado")) setCodes((c) => ({ ...c, [x.id]: "" }));
  };

  const editForm = editing && <form className="contact-edit" onSubmit={submitEdit} aria-label={`Editar ${cfg.singular}`}>
    {isPhone
      ? <PhoneField label={`Nuevo valor del ${cfg.singular}`} idPrefix={`edit-${kind}`} touched={tried} value={{ pais: editing.pais, numero: editing.valor }} onChange={(v) => setEditing({ ...editing, pais: v.pais, valor: v.numero })} />
      : <>
          <input type={cfg.inputType} required aria-label={`Nuevo valor del ${cfg.singular}`} value={editing.valor} readOnly={editing.verificado} onChange={(e) => setEditing({ ...editing, valor: e.target.value })} />
          {editing.verificado && <small className="hint">Un correo verificado no se reemplaza en el lugar: para cambiar la dirección agregue el nuevo correo, confírmelo con su código y luego retire este.</small>}
        </>}
    <select aria-label="Tipo de contacto" value={editing.tipo} onChange={(e) => setEditing({ ...editing, tipo: e.target.value })}>{Object.entries(TYPE_OPTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    <button disabled={busy}>Guardar</button><button type="button" className="secondary-action" onClick={() => { setEditing(null); setError(""); }}>Cancelar</button>
    <small className="hint" role="note">{TYPE_HINT[editing.tipo]}</small>
  </form>;

  return <div className="contact-list">
    <h3>{cfg.title}</h3>
    {items.length === 0 && <p className="empty">No hay {cfg.title.toLowerCase()} registrados.</p>}
    <ul>
      {items.map((x) => <li key={x.id} className="contact">
        {editing?.id === x.id
          ? editForm
          : <>
              <span className="contact-value">{x.valor}</span> <small>{TYPE_LABEL[x.tipo] || x.tipo}</small> {x.principal && <strong>Principal</strong>}
              {isEmail && <small className={`verification verification-${x.verificacion}`} data-state={x.verificacion}>{VERIFICATION_LABEL[x.verificacion] || x.verificacion}</small>}
              {isPhone && (x.pais
                ? <small className="verification verification-VALIDADO" title="Número válido según el plan de numeración del país; no se verifica por SMS">Formato validado ({countryName(x.pais)})</small>
                : <small className="verification verification-SIN_VALIDAR">Sin país: edítelo para validarlo</small>)}
              <button disabled={busy} onClick={() => startEdit(x)}>Editar</button>
              {!x.principal && (!isEmail || x.verificacion === "VERIFICADO") && <button disabled={busy} onClick={() => run(`${cfg.base}/${x.id}/principal`, { method: "POST" }, "Contacto principal actualizado")}>Hacer principal</button>}
              {items.length > 1 && <button disabled={busy} onClick={() => remove(x)}>Quitar</button>}
              {isEmail && x.verificacion !== "VERIFICADO" && <div className="email-verification" role="group" aria-label={`Verificar ${x.valor}`}>
                <button type="button" disabled={busy} onClick={() => sendCode(x)}>{x.verificacion === "PENDIENTE" ? "Reenviar código" : "Enviar código"}</button>
                <input aria-label={`Código de verificación de ${x.valor}`} autoComplete="one-time-code" maxLength={16} placeholder="ABCD-EFGH" value={codes[x.id] || ""} onChange={(e) => setCodes((c) => ({ ...c, [x.id]: e.target.value }))} />
                <button type="button" disabled={busy} onClick={() => confirmCode(x)}>Confirmar código</button>
                <small className="hint">{x.verificacion === "EXPIRADO" ? "El código venció o se agotaron los intentos: solicite uno nuevo." : "Hasta confirmarlo, este correo no se usa como medio de contacto verificado (Operaciones no lo ve)."}</small>
              </div>}
            </>}
      </li>)}
    </ul>
    {items.length === 1 && <p className="hint">Debe conservar al menos un {cfg.singular}: agregue otro antes de quitar este.</p>}
    <form className="contact-add" onSubmit={submitAdd} aria-label={`Agregar ${cfg.singular}`}>
      {isPhone
        ? <PhoneField label={`Nuevo ${cfg.singular}`} idPrefix={`add-${kind}`} touched={tried} value={{ pais: adding.pais, numero: adding.valor }} onChange={(v) => setAdding({ ...adding, pais: v.pais, valor: v.numero })} />
        : <input type={cfg.inputType} required aria-label={`Nuevo ${cfg.singular}`} placeholder={cfg.placeholder} value={adding.valor} onChange={(e) => setAdding({ ...adding, valor: e.target.value })} />}
      <select aria-label={`Tipo del nuevo ${cfg.singular}`} value={adding.tipo} onChange={(e) => setAdding({ ...adding, tipo: e.target.value })}>{Object.entries(TYPE_OPTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button disabled={busy}>Agregar</button>
      <small className="hint" role="note">{TYPE_HINT[adding.tipo]}</small>
      {isEmail && <small className="hint">Se enviará un código a esa dirección para confirmar que usted puede recibir mensajes en ella.</small>}
    </form>
    {notice && <p role="status" className="hint">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

/**
 * Contactos de la propia persona del usuario autenticado, disponibles en todas las áreas de trabajo. Los contactos pertenecen a la
 * persona (identidad compartida con una eventual ficha de paciente), no a la cuenta; el servidor sólo opera sobre la persona del token.
 */
export function MyContacts({ notify = () => {} }) {
  const [me, setMe] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { setMe(await api("/auth/me")); setError(""); }, []);
  useEffect(() => { let alive = true; api("/auth/me").then((v) => { if (alive) setMe(v); }).catch((e) => { if (alive) setError(message(e, "No se pudieron cargar sus datos de contacto")); }); return () => { alive = false; }; }, []);
  if (error && !me) return <section className="card"><h2>Mis datos de contacto</h2><p role="alert" className="error">{error}</p></section>;
  if (!me) return <section className="card"><h2>Mis datos de contacto</h2><p role="status">Cargando contactos…</p></section>;
  return <section className="card my-contacts" aria-labelledby="my-contacts-title">
    <h2 id="my-contacts-title">Mis datos de contacto</h2>
    <p className="contact-owner">Persona: <strong>{me.nombre} {me.apellido}</strong> · DNI {me.dni || "—"}</p>
    <p className="hint">Estos contactos pertenecen a su persona, no sólo a su usuario: si la misma persona figura en otro registro del sistema (por ejemplo como paciente), comparte estos datos. Modificarlos no cambia su contraseña, sus roles ni los vuelos ya registrados, y cada cambio queda auditado. Los correos se verifican con un código que se envía a la dirección; los teléfonos se validan con las reglas de numeración del país elegido, pero no se verifican por SMS. El sistema no envía otros mensajes ni recupera accesos por correo o teléfono.</p>
    <p className="hint contact-types"><strong>Personal</strong> y <strong>Laboral</strong> no son lo mismo: sólo los contactos <strong>laborales</strong> pueden ser consultados por el Centro de Operaciones, y únicamente mientras usted esté asignado a un vuelo abierto. Un correo laboral sólo se muestra una vez verificado y un teléfono laboral sólo con su país validado; son datos declarados por usted. Los personales nunca se muestran a Operaciones.</p>
    <div className="account-columns">
      <ContactList kind="correos" items={me.correos || []} refresh={refresh} notify={notify} busy={busy} setBusy={setBusy} />
      <ContactList kind="telefonos" items={me.telefonos || []} refresh={refresh} notify={notify} busy={busy} setBusy={setBusy} />
    </div>
  </section>;
}
