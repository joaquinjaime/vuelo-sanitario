import React, { useEffect, useRef, useState } from "react";
import { StageBadge } from "./requestInbox";
import { flightStage, pendingParty, STAGE } from "./flightStages";

// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const place = (p) => (!p ? "—" : typeof p === "string" ? p : [p.nombre, p.provincia].filter(Boolean).join(", ") || "—");

/** Propuesta vigente: la última del tipo que todavía no tiene respuesta ni fue reemplazada. */
export const openProposal = (events = [], type) => {
  const last = [...(events || [])].reverse().find((e) => e.tipo === type);
  return last && !events.some((e) => e.respondeA === last.id) ? last : null;
};

export function CancellationFields({ reasons = [], value, setValue, custom, setCustom }) {
  const items = Array.isArray(reasons) ? reasons : [];
  const selected = items.find((x) => String(x.id) === String(value));
  return <>
    <label>Motivo de cancelación<select value={value} onChange={(e) => { setValue(e.target.value); if (items.find((x) => String(x.id) === e.target.value)?.codigo !== "OTRO") setCustom(""); }}><option value="">Seleccionar motivo</option>{items.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
    {selected?.codigo === "OTRO" && <label className="wide">Especifique el motivo<textarea required value={custom} onChange={(e) => setCustom(e.target.value)} /></label>}
  </>;
}

const EVENT_LABEL = {
  DTS_PROPUESTA: "El DTS solicitó el horario", CO_CONTRAPROPUESTA: "Operaciones propuso otro horario", CO_ACEPTA_PROPUESTA: "Operaciones aceptó el horario solicitado",
  DTS_ACEPTA_CONTRAPROPUESTA: "El DTS aceptó la contrapropuesta", DTS_RECHAZA_CONTRAPROPUESTA: "El DTS rechazó la contrapropuesta", CO_RECHAZO_DIRECTO: "Operaciones rechazó la solicitud",
  COMANDANTE_ACEPTA_ASIGNACION: "El comandante aceptó la asignación", COMANDANTE_PROPONE_HORARIO: "El comandante propuso un horario", COMANDANTE_RECHAZA_ASIGNACION: "El comandante rechazó la asignación",
  CO_ACEPTA_PROPUESTA_COMANDANTE: "Operaciones aceptó la propuesta del comandante", CO_RECHAZA_PROPUESTA_COMANDANTE: "Operaciones rechazó la propuesta del comandante",
};
export const eventLabel = (type) => EVENT_LABEL[type] || String(type || "").replaceAll("_", " ");

/** Registro cronológico de propuestas y respuestas, con la información que existe en el modelo. */
export function NegotiationHistory({ events = [] }) {
  if (!events?.length) return <p className="hint">Todavía no hay movimientos registrados.</p>;
  return (
    <ol className="negotiation-history" aria-label="Historial de negociación">
      {events.map((e, i) => (
        <li key={e.id ?? i}>
          <strong>{eventLabel(e.tipo)}</strong>
          <span>{[e.fechaOcurrencia && dt(e.fechaOcurrencia), e.actor].filter(Boolean).join(" · ")}</span>
          {(e.fechaHoraPropuesta || e.fechaHoraLlegadaPropuesta) && <span>Salida {dt(e.fechaHoraPropuesta)}{e.fechaHoraLlegadaPropuesta ? ` · llegada ${dt(e.fechaHoraLlegadaPropuesta)}` : ""}</span>}
          {e.motivo && <span>Motivo: {e.motivo}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Datos de la solicitud que el DTS cargó, de sólo consulta. No incluye información médica ni datos del paciente. */
export function RequestSummary({ flight, medical = null }) {
  if (!flight?.datosSanitarios) return null;
  return (
    <section className="request-summary" aria-label="Información de la solicitud">
      <div className="request-summary-head">
        <h3>Solicitud sanitaria {flight.codigo}</h3>
        <StageBadge flight={flight} />
      </div>
      <dl>
        <div><dt>Recibida</dt><dd>{dt(flight.recibida)}</dd></div>
        <div><dt>Salida solicitada</dt><dd>{dt(flight.solicitada)}</dd></div>
        <div><dt>Origen solicitado</dt><dd>{place(flight.origen)}</dd></div>
        <div><dt>Destino solicitado</dt><dd>{place(flight.destino)}</dd></div>
        <div><dt>Prioridad</dt><dd>{flight.prioridad || "—"}</dd></div>
        <div><dt>Urgencia</dt><dd>{flight.extremaUrgencia ? <span className="urgency-badge"><span aria-hidden="true">⚠</span><strong>EXTREMA URGENCIA</strong><span>Límite de traslado: {dt(flight.fechaLimiteTraslado)}</span></span> : "Sin extrema urgencia"}</dd></div>
        {flight.extremaUrgencia && flight.justificacionExtremaUrgencia && <div className="wide"><dt>Justificación</dt><dd>{flight.justificacionExtremaUrgencia}</dd></div>}
        {flight.motivoVuelo && <div className="wide"><dt>Motivo del traslado</dt><dd>{flight.motivoVuelo}</dd></div>}
        {medical && <div><dt>Equipamiento especial</dt><dd>{medical.requiereEquipamientoEspecial ? "Requerido" : "No requerido"}</dd></div>}
      </dl>
    </section>
  );
}

const WHO = { OPERACIONES: "Operaciones", DTS: "El DTS solicitante" };

/**
 * Negociación del horario desde Operaciones. Es la sección principal mientras no hay acuerdo; las acciones se despliegan una por vez
 * (aceptar con confirmación, proponer con su formulario, rechazar con motivo) y cancelar vuelve al resumen sin tocar nada.
 * `call(path, body, mensaje)` ejecuta la operación, vuelve a leer el estado y devuelve false si falló. Después del acuerdo se
 * reduce a su resumen e historial.
 */
export function NegotiationPanel({ flight, events = [], call, reasons = [] }) {
  const [mode, setMode] = useState(null), [counter, setCounter] = useState(""), [why, setWhy] = useState(""), [reasonId, setReasonId] = useState(""), [custom, setCustom] = useState(""), [busy, setBusy] = useState(false);
  const reset = () => { setMode(null); setCounter(""); setWhy(""); setReasonId(""); setCustom(""); };
  // Si el estado cambia desde otra sesión o por una acción, los formularios abiertos ya no corresponden. No se reinicia al montar:
  // un clic temprano (antes de que corran los efectos de montaje) no debe perderse.
  const stateKey = `${flight?.id}|${flight?.estado}`, lastKey = useRef(stateKey);
  useEffect(() => { if (lastKey.current !== stateKey) { lastKey.current = stateKey; reset(); } }, [stateKey]);
  if (!flight?.datosSanitarios) return null;
  const stage = flightStage(flight, events), party = pendingParty(flight), proposal = openProposal(events, "CO_CONTRAPROPUESTA");
  const act = async (path, body, success) => { setBusy(true); try { if ((await call(path, body, success)) !== false) reset(); } finally { setBusy(false); } };

  if (stage.key !== STAGE.NEGOCIACION) {
    const closed = stage.key === STAGE.CERRADA;
    return (
      <section className="negotiation-panel is-compact" aria-label="Negociación del horario">
        <div className="negotiation-head"><h3>Negociación del horario</h3><StageBadge flight={flight} /></div>
        <p>{closed ? (flight.estado === "RECHAZADO" ? "La solicitud fue rechazada: no hubo acuerdo sobre el horario." : "El vuelo fue cancelado.") : <>Horario acordado: <strong>{dt(flight.salida)}</strong></>}</p>
        <details open={closed}><summary>Historial de negociación</summary><NegotiationHistory events={events} /></details>
      </section>
    );
  }

  const pendingDts = party === "DTS", needsOther = reasons.find((x) => String(x.id) === String(reasonId))?.codigo === "OTRO";
  return (
    <section className="negotiation-panel is-primary" aria-label="Negociación del horario">
      <div className="negotiation-head"><div><p className="eyebrow">TAREA PRINCIPAL</p><h3>Negociación del horario</h3></div><StageBadge flight={flight} /></div>
      <p className="negotiation-status" role="status">
        {pendingDts
          ? <><strong>Esperando respuesta del DTS:</strong> el solicitante debe aceptar o rechazar el horario propuesto por Operaciones.</>
          : <><strong>Pendiente de evaluación:</strong> Operaciones debe aceptar el horario solicitado, presentar una contrapropuesta o rechazar la solicitud.</>}
      </p>
      <dl className="negotiation-facts">
        <div><dt>Horario solicitado por el DTS</dt><dd>{dt(flight.solicitada)}</dd></div>
        {proposal && <div><dt>Última propuesta vigente</dt><dd>{dt(proposal.fechaHoraPropuesta)}{proposal.motivo ? ` · ${proposal.motivo}` : ""}</dd></div>}
        <div><dt>Debe responder</dt><dd>{WHO[party]}</dd></div>
      </dl>

      {mode === null && (
        <div className="negotiation-actions">
          {!pendingDts && <button type="button" disabled={busy} onClick={() => setMode("accept")}>Aceptar horario solicitado</button>}
          <button type="button" className={pendingDts ? "" : "secondary-action"} disabled={busy} onClick={() => setMode("counter")}>{pendingDts ? "Reemplazar propuesta" : "Proponer otro horario"}</button>
          {!pendingDts && <button type="button" className="secondary-action danger-action" disabled={busy} onClick={() => setMode("reject")}>Rechazar solicitud</button>}
        </div>
      )}

      {mode === "accept" && (
        <div className="negotiation-form" role="group" aria-label="Confirmar horario">
          <p>¿Aceptar el horario solicitado por el DTS (<strong>{dt(flight.solicitada)}</strong>)? Quedará acordado y se habilitará la preparación del vuelo.</p>
          <div className="negotiation-actions">
            <button type="button" disabled={busy} onClick={() => act(`/flights/${flight.id}/schedule/accept`, null, "Horario aceptado")}>Confirmar horario</button>
            <button type="button" className="secondary-action" disabled={busy} onClick={reset}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "counter" && (
        <div className="negotiation-form" role="group" aria-label="Proponer otro horario">
          {pendingDts && <p className="hint">La nueva propuesta reemplaza a la vigente, que queda obsoleta.</p>}
          <label>Nueva fecha y hora<input type="datetime-local" value={counter} onChange={(e) => setCounter(e.target.value)} /></label>
          <label>Motivo de la propuesta<textarea value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          <div className="negotiation-actions">
            <button type="button" disabled={busy || !counter || !why.trim()} onClick={() => act(`/flights/${flight.id}/schedule/counterproposal`, { salida: counter, motivo: why }, pendingDts ? "Propuesta reemplazada" : "Propuesta enviada al DTS")}>Enviar propuesta</button>
            <button type="button" className="secondary-action" disabled={busy} onClick={reset}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="negotiation-form" role="group" aria-label="Rechazar solicitud">
          <p>El rechazo es definitivo y se informa al DTS. Indique el motivo.</p>
          <CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom} />
          <div className="negotiation-actions">
            <button type="button" className="danger-action" disabled={busy || !reasonId || (needsOther && !custom.trim())} onClick={() => act(`/flights/${flight.id}/schedule/reject`, { motivoCancelacionId: reasonId, motivoCancelacionPersonalizado: custom || null }, "Solicitud rechazada")}>Confirmar rechazo</button>
            <button type="button" className="secondary-action" disabled={busy} onClick={reset}>Cancelar</button>
          </div>
        </div>
      )}

      <h4>Historial de negociación</h4>
      <NegotiationHistory events={events} />
    </section>
  );
}
