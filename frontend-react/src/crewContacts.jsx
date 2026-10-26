import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Estados en los que el servidor ya no permite consultar: el botón ni siquiera se ofrece. */
export const CREW_CONTACTS_CLOSED_STATES = ["FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"];
/** Los contactos no quedan en pantalla indefinidamente: pasado este tiempo se descartan y hay que volver a consultar. */
export const CREW_CONTACTS_TTL_MS = 5 * 60 * 1000;
const message = (e) => e?.message || "No se pudieron consultar los contactos";

function Values({ label, items }) {
  if (!items.length) return null;
  return <p className="crew-contact-values"><span>{label}: </span>{items.map((x, i) => <span key={i} className="contact-value">{x.valor}{x.principal ? " (principal)" : ""}{i < items.length - 1 ? " · " : ""}</span>)}</p>;
}

/**
 * Consulta explícita de los contactos laborales de la tripulación vigente de un vuelo (sólo Operaciones). Nada se pide al cargar el
 * vuelo y nada se guarda más allá del estado de este componente: cerrar el panel, cambiar de vuelo, cambiar la tripulación, el paso del tiempo o
 * cualquier error descartan los datos. Los contactos nunca se persisten en el navegador.
 * @param crewKey firma de la tripulación vigente; si cambia, lo obtenido deja de ser vigente y se descarta.
 */
export function CrewContacts({ flightId, state, crewKey }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");   // "crew": cambió la tripulación; "time": venció el tiempo de exhibición
  const request = useRef(0);       // descarta respuestas que llegan después de cerrar, cambiar de vuelo o de tripulación
  const held = useRef(false);      // hay contactos en pantalla (para avisar si la tripulación cambia)
  const lastFlight = useRef(flightId);
  const keep = (value) => { held.current = value !== null; setData(value); };

  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    request.current += 1;
    setNotice(held.current && lastFlight.current === flightId ? "crew" : "");
    lastFlight.current = flightId;
    keep(null); setLoading(false); setError("");
  }, [flightId, crewKey]);
  useEffect(() => { if (CREW_CONTACTS_CLOSED_STATES.includes(state)) { request.current += 1; keep(null); setNotice(""); } }, [state]);
  useEffect(() => {
    if (!data) return undefined;
    const timer = setTimeout(() => { request.current += 1; keep(null); setNotice("time"); }, CREW_CONTACTS_TTL_MS);
    return () => clearTimeout(timer);
  }, [data]);

  if (CREW_CONTACTS_CLOSED_STATES.includes(state)) return null;

  const consult = async () => {
    const mine = ++request.current;
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await api(`/flights/${flightId}/crew/contacts`);
      if (mine !== request.current) return;
      if (!result || !Array.isArray(result.tripulantes)) throw new Error("Respuesta de contactos inválida");
      keep(result);
    } catch (e) {
      if (mine !== request.current) return;
      keep(null); setError(message(e));
    } finally { if (mine === request.current) setLoading(false); }
  };
  const close = () => { request.current += 1; keep(null); setError(""); setLoading(false); setNotice(""); };

  return <section className="crew-contacts" aria-label="Contactos laborales de la tripulación">
    {!data && <button type="button" className="secondary-action" disabled={loading} onClick={consult}>{loading ? "Consultando contactos…" : "Consultar contactos de la tripulación"}</button>}
    {notice === "crew" && !data && !loading && <p className="hint" role="status">La tripulación cambió: los contactos consultados antes ya no se muestran. Vuelva a consultarlos.</p>}
    {notice === "time" && !data && !loading && <p className="hint" role="status">Los contactos se ocultaron por el tiempo transcurrido. Vuelva a consultarlos para ver datos vigentes.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {data && <>
      <h5>Contactos laborales de la tripulación</h5>
      <p className="hint">Son datos laborales declarados por cada titular. Los correos que se muestran fueron verificados (el titular confirmó un código recibido en esa dirección); los teléfonos tienen un formato válido para su país, pero no se verifican por SMS ni se sabe si la línea está activa. Sólo se muestran los contactos laborales vigentes de las personas asignadas a este vuelo, y la consulta queda auditada.</p>
      {data.tripulantes.length === 0 && <p>No hay tripulantes asignados.</p>}
      <ul className="crew-contact-list">
        {data.tripulantes.map((m) => <li key={`${m.asignacionId ?? "c"}-${m.funcionCode}-${m.nombre}-${m.apellido}`}>
          <strong>{m.nombre} {m.apellido}</strong> · {m.funcion}{m.comandante && m.funcionCode !== "COMANDANTE" ? " (comandante)" : ""}
          {m.estado === "DISPONIBLE" && <><Values label="Teléfono" items={m.telefonos} /><Values label="Correo" items={m.correos} />{m.hayMasContactos && <p className="hint">Tiene más contactos laborales; se muestran los primeros.</p>}</>}
          {m.correoLaboralSinVerificar && <p className="hint">Tiene un correo laboral sin verificar: no se muestra hasta que su titular lo confirme.</p>}
          {m.telefonoLaboralSinValidar && <p className="hint">Tiene un teléfono laboral sin país validado: no se muestra hasta que su titular lo valide.</p>}
          {m.estado === "SIN_CONTACTO_LABORAL" && <p className="hint">No hay contacto laboral disponible.</p>}
          {m.estado === "CUENTA_NO_ACTIVA" && <p className="hint">La cuenta no está activa: no se muestran contactos.</p>}
        </li>)}
      </ul>
      <button type="button" className="secondary-action" onClick={close}>Ocultar contactos</button>
    </>}
  </section>;
}
