import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, credentialFile, uploadFile, downloadFile } from "./api";
import { workspaceForRoles } from "./workspace";
import { CommanderReports, OperationsReports, FlightClosure, LifecycleActions, NotificationsPanel } from "./closure";
import { AdminAircraft, FlightAircraft } from "./aircraft";
import { GeographicCatalog } from "./geography";
import { AdminAudit, AuditTimeline } from "./audit";
import { UserDirectory } from "./users";
import { PatientSearch, PatientMaintenance } from "./patients";
import { MyContacts } from "./account";
import { PhoneField } from "./phoneField";
import { DEFAULT_COUNTRY, emailProblem, phoneProblem } from "./contactRules";
import { CrewContacts } from "./crewContacts";
import { FlightDocuments, documentsEditable } from "./documents";
import { FlightRoute, RouteReviewQueue, ROUTE_STATE_LABEL } from "./flightRoute";
import { TransferContactFields, TransferContacts, contactsPayload, rowsProblem } from "./transferContacts";
export { AdminAircraft, FlightDocuments, FlightRoute };
import "./styles.css";
const s = (s) => `status status-${s?.toLowerCase()}`;
export const adaptFlight = (flight) => {
  const sanitary = flight?.datosSanitarios;
  return { ...flight, estado: flight?.estadoVuelo || sanitary?.estadoSolicitud || "SIN_ESTADO", prioridad: sanitary?.prioridad || "—", solicitada: sanitary?.fechaSolicitada || null, extremaUrgencia: Boolean(sanitary?.extremaUrgencia), justificacionExtremaUrgencia: sanitary?.justificacionExtremaUrgencia, fechaLimiteTraslado: sanitary?.fechaLimiteTraslado, origen: sanitary?.localidadOrigenSolicitada || flight?.origenDetalle || flight?.origen, destino: sanitary?.localidadDestinoSolicitada || flight?.destinoDetalle || flight?.destino };
};
const adaptDetail = (detail) => detail ? { ...detail, vuelo: adaptFlight(detail.vuelo) } : detail;
// La API entrega DATETIME2 como hora civil de la zona de negocio; no se convierte al huso del navegador.
const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const businessDate = () => {
  let p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Tucuman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year").value}-${p.find((x) => x.type === "month").value}-${p.find((x) => x.type === "day").value}`;
};
const isTodayOrTomorrow = (v) => {
  if (!v) return false;
  let base = Date.parse(`${businessDate()}T00:00:00Z`),
    selected = Date.parse(`${v.slice(0, 10)}T00:00:00Z`),
    days = (selected - base) / 86400000;
  return days >= 0 && days < 2;
};
function Urgency({ flight, detail = false }) {
  return flight?.extremaUrgencia ? (
    <div className={detail ? "urgency-detail" : "urgency-badge"}>
      <span aria-hidden="true">⚠</span>
      <strong>EXTREMA URGENCIA</strong>
      {detail && (
        <>
          <span>Solicitado: {dt(flight.solicitada)}</span>
          <span>Límite de traslado: {dt(flight.fechaLimiteTraslado)}</span>
          {flight.justificacionExtremaUrgencia && (
            <span>Justificación: {flight.justificacionExtremaUrgencia}</span>
          )}
        </>
      )}
    </div>
  ) : null;
}
const activationErrors = (form) => {
  const errors = {};
  if (!form.password) errors.password = "La contraseña es obligatoria.";
  else if (form.password.length < 12) errors.password = "La contraseña debe tener al menos 12 caracteres.";
  else if (form.password.length > 100) errors.password = "La contraseña no puede tener más de 100 caracteres.";
  if (!form.confirmacionPassword) errors.confirmacionPassword = "La confirmación de contraseña es obligatoria.";
  else if (form.password !== form.confirmacionPassword) errors.confirmacionPassword = "Las contraseñas no coinciden.";
  return errors;
};

export function Login({ set }) {
  const [u, su] = useState(""),
    [p, sp] = useState(""),
    [e, se] = useState(null),
    [activate, setActivate] = useState(false),
    [activationSubmitted, setActivationSubmitted] = useState(false),
    [form, setForm] = useState({ dni: "", codigo: "", username: "", password: "", confirmacionPassword: "" });
  const change = (key, value) => { setForm({ ...form, [key]: value }); if (activate) se(null); };
  const errors = activate ? activationErrors(form) : {};
  const showPasswordError = activationSubmitted || form.password.length > 0;
  const showConfirmationError = activationSubmitted || form.confirmacionPassword.length > 0;
  return (
    <main className="login">
      <section>
        <p className="eyebrow">SISTEMA INSTITUCIONAL</p>
        <h1>Gestión de Vuelos Sanitarios</h1>
        <p>Acceso seguro para operaciones, planificación y coordinación.</p>
      </section>
      <form
        onSubmit={async (x) => {
          x.preventDefault();
          try {
            if (activate) {
              setActivationSubmitted(true);
              if (Object.keys(errors).length) return;
              await api("/auth/activar-cuenta", { method: "POST", body: JSON.stringify(form) });
              setActivate(false); se({ type: "success", text: "Cuenta activada correctamente. Ya puede iniciar sesión." }); return;
            }
            let r = await api("/auth/login", {
              method: "POST",
              body: JSON.stringify({ username: u, password: p }),
            });
            localStorage.setItem("vs-token", r.accessToken);
            localStorage.setItem(
              "vs-session",
              JSON.stringify({ username: r.username, roles: r.roles, debeCambiarContrasena: r.debeCambiarContrasena }),
            );
            set({ username: r.username, roles: r.roles, debeCambiarContrasena: r.debeCambiarContrasena });
          } catch (x) {
            se({ type: "error", text: x.message });
          }
        }}
      >
        <h2>{activate ? "Activar cuenta" : "Ingresar"}</h2>
        {e && <p className={e.type === "success" ? "success" : "error"}>{e.text}</p>}
        {!activate && <label>
          Usuario
          <input value={u} onChange={(x) => su(x.target.value)} required />
        </label>}
        {!activate && <label>
          Contraseña
          <input
            type="password"
            value={p}
            onChange={(x) => sp(x.target.value)}
            required
          />
        </label>}
        {activate && <>
          <label>DNI<input required value={form.dni} onChange={(x) => change("dni", x.target.value)} /></label>
          <label>Código de activación<input required value={form.codigo} onChange={(x) => change("codigo", x.target.value)} /></label>
          <label>Nombre de usuario<input required value={form.username} onChange={(x) => change("username", x.target.value)} /></label>
          <label>Contraseña<input required type="password" minLength="12" maxLength="100" value={form.password} onChange={(x) => change("password", x.target.value)} aria-describedby={showPasswordError && errors.password ? "password-hint password-error" : "password-hint"} aria-invalid={Boolean(showPasswordError && errors.password)} />
            <small id="password-hint" className="hint">La contraseña debe tener al menos 12 caracteres.</small>
            {showPasswordError && errors.password && <small id="password-error" className="error">{errors.password}</small>}
          </label>
          <label>Confirmar contraseña<input required type="password" value={form.confirmacionPassword} onChange={(x) => change("confirmacionPassword", x.target.value)} aria-describedby={showConfirmationError && errors.confirmacionPassword ? "confirmation-error" : undefined} aria-invalid={Boolean(showConfirmationError && errors.confirmacionPassword)} />
            {showConfirmationError && errors.confirmacionPassword && <small id="confirmation-error" className="error">{errors.confirmacionPassword}</small>}
          </label>
        </>}
        <button>{activate ? "Activar cuenta" : "Iniciar sesión"}</button>
        <button type="button" className="link-button" onClick={() => { setActivate(!activate); setActivationSubmitted(false); se(null); }}>
          {activate ? "Volver a iniciar sesión" : "Activar cuenta"}
        </button>
      </form>
    </main>
  );
}
// Acepta el lugar estructurado ({nombre, provincia}) o, en payloads antiguos, el nombre del aeropuerto como texto.
export const locationLabel = (location) => !location ? "—" : typeof location === "string" ? (location.trim() || "—") : ([location.nombre, location.provincia].filter(Boolean).join(", ") || "—");
function LocalityPicker({ title, provinces, provinceId, setProvinceId, selected, setSelected }) {
  const [query, setQuery] = useState(""), [options, setOptions] = useState([]), [loading, setLoading] = useState(false), [open, setOpen] = useState(false);
  const resetAutocomplete = () => { setSelected(null); setQuery(""); setOptions([]); setLoading(false); setOpen(false); };
  useEffect(() => { setSelected(null); setQuery(""); setOptions([]); }, [provinceId]);
  useEffect(() => {
    if (!provinceId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const results = await api(`/catalogs/localities?provinceId=${provinceId}&q=${encodeURIComponent(query)}`);
        if (!cancelled) setOptions(results);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [provinceId, query]);
  return <fieldset className="wide locality-picker"><legend>{title}</legend><label>Provincia<select aria-label={`Provincia ${title.toLowerCase()}`} required value={provinceId} onChange={e => setProvinceId(e.target.value)}><option value="">Seleccionar provincia</option>{provinces.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><label className="locality-search">Localidad<input aria-label={`Buscar localidad ${title.toLowerCase()}`} disabled={!provinceId} value={query} placeholder="Buscar localidad..." onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setSelected(null); setOpen(true); }} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }} />{selected && <small className="success">Seleccionada: {locationLabel(selected)} <button type="button" className="link-button" onClick={resetAutocomplete}>Limpiar</button></small>}{provinceId && open && <div className="autocomplete" role="listbox">{loading ? <small>Cargando...</small> : options.length ? options.map(x => <button type="button" role="option" key={x.id} onClick={() => { setSelected(x); setQuery(x.nombre); setOpen(false); }}>{locationLabel(x)}</button>) : <small>Sin resultados.</small>}</div>}</label>{!selected && <small className="hint">Busque y seleccione una localidad de la lista.</small>}</fieldset>;
}
export function DTS({ d, done, msg }) {
  const submitLock = useRef(false);
  const [patientMode, setPatientMode] = useState("new"), [selectedPatient, setSelectedPatient] = useState(null), [contactRows, setContactRows] = useState([]),
    [submitting, setSubmitting] = useState(false),
    [provinces, setProvinces] = useState([]), [originProvince, setOriginProvince] = useState(""), [destinationProvince, setDestinationProvince] = useState(""), [origin, setOrigin] = useState(null), [destination, setDestination] = useState(null), [locationError, setLocationError] = useState(""),
    [f, setF] = useState({
      nombre: "",
      apellido: "",
      dni: "",
      fechaNacimiento: "",
      identidadConfirmada: false,
      prioridad: "ALTA",
      motivo: "",
      diagnostico: "",
      condicion: "ESTABLE",
      solicitada: "",
      urgente: false,
      justificacion: "",
      limite: "",
    });
  let change = (k, v) => setF((current) => ({
    ...current,
    [k]: v,
    ...(["nombre", "apellido", "dni", "fechaNacimiento"].includes(k) ? { identidadConfirmada: false } : {}),
  }));
  let todayOrTomorrow = isTodayOrTomorrow(f.solicitada);
  useEffect(() => { api("/catalogs/provinces").then(setProvinces).catch(x => msg(x.message, true)); }, []);
  return (
    <section className="card">
      <h2>Nueva solicitud DTS</h2>
      <p className="hint">
        Los vuelos normales sólo pueden solicitarse para pasado mañana o una
        fecha posterior. La validación final se realiza con la zona de negocio.
      </p>
      {todayOrTomorrow && !f.urgente && (
        <p className="error">
          Los vuelos para hoy o mañana deben solicitarse como vuelos de extrema
          urgencia.
        </p>
      )}
      <form
        className="grid-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitLock.current) return;
          if (!origin || !destination) { setLocationError("Seleccione una localidad válida de origen y destino."); return; }
          if (patientMode === "search" && !selectedPatient) { msg("Busque y seleccione un paciente registrado.", true); return; }
          if (patientMode === "new" && f.dni && !f.identidadConfirmada) { msg("Confirme el cotejo de identidad para continuar.", true); return; }
          const contactProblem = rowsProblem(contactRows);
          if (contactProblem) { msg(contactProblem, true); return; }
          submitLock.current = true;
          setSubmitting(true);
          try {
            await api(patientMode === "search" ? "/flights" : "/flights/with-patient", {
              method: "POST",
              body: JSON.stringify({
                ...(patientMode === "search" ? { patientId: selectedPatient.id } : { patient: { nombre: f.nombre, apellido: f.apellido, dni: f.dni || null, fechaNacimiento: f.fechaNacimiento || null }, identidadConfirmada: f.identidadConfirmada }),
                contactos: contactsPayload(contactRows),
                localidadOrigenId: origin.id,
                localidadDestinoId: destination.id,
                priorityCode: f.prioridad,
                motivoVuelo: f.motivo,
                fechaSolicitada: f.solicitada,
                extremaUrgencia: f.urgente,
                justificacionExtremaUrgencia: f.urgente
                  ? f.justificacion
                  : null,
                fechaLimiteTraslado: f.urgente ? f.limite : null,
                medical: {
                  diagnostico: f.diagnostico,
                  condicionMedica: f.condicion,
                  requiereEquipamientoEspecial: false,
                  observaciones: null,
                },
              }),
            });
            msg("Solicitud registrada");
            setContactRows([]);
            done();
          } catch (x) {
            msg(x.message, true);
          } finally {
            submitLock.current = false;
            setSubmitting(false);
          }
        }}
      >
        <label>
          Paciente
          <select value={patientMode} onChange={(e) => { setPatientMode(e.target.value); setSelectedPatient(null); }}>
            <option value="new">Registrar paciente</option>
            <option value="search">Buscar paciente registrado</option>
          </select>
        </label>
        {patientMode === "search" && <><PatientSearch onSelect={setSelectedPatient} onReset={() => setSelectedPatient(null)} selectedId={selectedPatient?.id} />{selectedPatient && <p className="wide success">Paciente seleccionado: {selectedPatient.nombre} {selectedPatient.apellido} · DNI {selectedPatient.dniTerminacion || "sin registrar"}</p>}</>}
        {patientMode === "new" && (
          <>
            <label>
              Nombre
              <input
                required
                value={f.nombre}
                onChange={(e) => change("nombre", e.target.value)}
              />
            </label>
            <label>
              Apellido
              <input
                required
                value={f.apellido}
                onChange={(e) => change("apellido", e.target.value)}
              />
            </label>
            <label>
              DNI
              <input value={f.dni} inputMode="numeric" maxLength={20} onChange={(e) => change("dni", e.target.value)} />
            </label>
            <label>
              Fecha de nacimiento
              <input type="date" value={f.fechaNacimiento} onChange={(e) => change("fechaNacimiento", e.target.value)} />
            </label>
            {f.dni && <label className="check wide">
              <input type="checkbox" required checked={f.identidadConfirmada} onChange={(e) => change("identidadConfirmada", e.target.checked)} />{" "}
              Confirmo que cotejé los datos ingresados con el documento de identidad presentado
            </label>}
          </>
        )}
        <LocalityPicker title="Origen" provinces={provinces} provinceId={originProvince} setProvinceId={setOriginProvince} selected={origin} setSelected={setOrigin} />
        <LocalityPicker title="Destino" provinces={provinces} provinceId={destinationProvince} setProvinceId={setDestinationProvince} selected={destination} setSelected={setDestination} />
        {locationError && <p className="error wide">{locationError}</p>}
        <label>
          Fecha y hora solicitada
          <input
            type="datetime-local"
            required
            value={f.solicitada}
            onChange={(e) => change("solicitada", e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={f.urgente}
            onChange={(e) => change("urgente", e.target.checked)}
          />{" "}
          Extrema urgencia
        </label>
        {f.urgente && (
          <>
            <label className="wide">
              Justificación de extrema urgencia
              <textarea
                required
                value={f.justificacion}
                onChange={(e) => change("justificacion", e.target.value)}
              />
            </label>
            <label>
              Fecha y hora límite para el traslado
              <input
                type="datetime-local"
                required
                value={f.limite}
                onChange={(e) => change("limite", e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Prioridad operativa
          <select
            value={f.prioridad}
            onChange={(e) => change("prioridad", e.target.value)}
          >
            {d.priorities.map((x) => (
              <option key={x.codigo} value={x.codigo}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Diagnóstico
          <input
            required
            value={f.diagnostico}
            onChange={(e) => change("diagnostico", e.target.value)}
          />
        </label>
        <label>
          Condición
          <input
            required
            value={f.condicion}
            onChange={(e) => change("condicion", e.target.value)}
          />
        </label>
        <label className="wide">
          Motivo
          <textarea
            required
            value={f.motivo}
            onChange={(e) => change("motivo", e.target.value)}
          />
        </label>
        <TransferContactFields rows={contactRows} setRows={setContactRows} />
        <button disabled={submitting}>{submitting ? "Registrando solicitud..." : "Crear solicitud"}</button>
      </form>
    </section>
  );
}
function CancellationFields({reasons=[],value,setValue,custom,setCustom}) { const items=Array.isArray(reasons)?reasons:[]; const selected=items.find(x=>String(x.id)===String(value)); return <><label>Motivo de cancelación<select value={value} onChange={e=>{setValue(e.target.value);if(items.find(x=>String(x.id)===e.target.value)?.codigo!=="OTRO")setCustom("");}}><option value="">Seleccionar motivo</option>{items.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>{selected?.codigo==="OTRO"&&<label className="wide">Especifique el motivo<textarea required value={custom} onChange={e=>setCustom(e.target.value)}/></label>}</>; }
/** Propuesta vigente: la última del tipo que todavía no tiene respuesta ni fue reemplazada. */
export const openProposal = (events = [], type) => {
  const last = [...events].reverse().find((e) => e.tipo === type);
  return last && !events.some((e) => e.respondeA === last.id) ? last : null;
};
const CANCELLABLE_REQUEST = ["SOLICITADO", "PENDIENTE_RESPUESTA_DTS", "APROBADO", "PLANIFICADO", "PENDIENTE_CONFIRMACION_COMANDANTE", "PENDIENTE_RESPUESTA_OPERACIONES", "PENDIENTE_REPLANIFICACION"];
export function CancellationNote({ flight }) {
  if (!flight) return null;
  return (
    <>
      {flight.datosSanitarios?.motivoRechazo && <p className="error wide" role="status">Solicitud RECHAZADA por Operaciones: {flight.datosSanitarios.motivoRechazo}</p>}
      {flight.cancelacion && <p className="error wide" role="status">Vuelo CANCELADO{flight.cancelacion.canceladoPor ? ` por ${flight.cancelacion.canceladoPor}` : ""}{flight.cancelacion.fecha ? ` el ${dt(flight.cancelacion.fecha)}` : ""}: {flight.cancelacion.motivo}</p>}
    </>
  );
}
export function DtsResponses({ d, done, msg }) {
 const [id,setId]=useState(""),[detail,setDetail]=useState(null),[reasons,setReasons]=useState([]),[reasonId,setReasonId]=useState(""),[custom,setCustom]=useState(""),[cancelReasonId,setCancelReasonId]=useState(""),[cancelCustom,setCancelCustom]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{api("/catalogs/cancellation-reasons").then(x=>setReasons(Array.isArray(x)?x:[])).catch(e=>msg(e.message,true));},[]);
 const load=async()=>{if(!id){setDetail(null);return;}try{setDetail(adaptDetail(await api(`/flights/${id}`)));}catch(e){msg(e.message,true);}};
 useEffect(()=>{setReasonId("");setCustom("");setCancelReasonId("");setCancelCustom("");load();},[id]); const f=detail?.vuelo; const proposal=openProposal(detail?.negociacion,"CO_CONTRAPROPUESTA");
 const run=async(path,body,ok)=>{setBusy(true);try{await api(path,{method:"POST",body:JSON.stringify(body)});msg(ok);}catch(e){msg(e.message,true);}finally{await done();await load();setBusy(false);}};
 const respond=aceptar=>run(`/flights/${id}/schedule/response`,{aceptar,propuestaId:proposal?.id,motivoCancelacionId:aceptar?null:reasonId,motivoCancelacionPersonalizado:aceptar?null:custom},aceptar?"Contrapropuesta aceptada":"Contrapropuesta rechazada: la solicitud fue cancelada");
 const needsCustom=(list,rid)=>list.find(x=>String(x.id)===String(rid))?.codigo==="OTRO";
 return <section className="card"><h2>Mis solicitudes y contrapropuestas</h2><div className="grid-form"><label>Solicitud<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.extremaUrgencia?"⚠ URGENTE · ":""}{x.codigo} — {x.estado}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>Horario solicitado por DTS</h4><p>{dt(f.solicitada)}</p></div><div><h4>Horario definitivo</h4><p>{f.salida?dt(f.salida):"Pendiente"}</p></div></div><Urgency flight={f} detail/><CancellationNote flight={f}/><TransferContacts key={`tc-${id}`} flightId={id} mode="dts" msg={msg}/><FlightDocuments key={`documents-${id}`} flightId={id} canEdit={false} msg={msg}/><Negotiation events={detail.negociacion}/><AuditTimeline key={`audit-${id}-${f.estado}`} flightId={id} title="Evolución de mi solicitud"/>{f.estado==="PENDIENTE_RESPUESTA_DTS"&&proposal&&<div className="wide detail-actions" aria-label="Contrapropuesta pendiente"><h4>Contrapropuesta de Operaciones</h4><p>Nuevo horario propuesto: <strong>{dt(proposal.fechaHoraPropuesta)}</strong> — {proposal.motivo}</p><p className="hint">Si la rechaza, la solicitud se cancela y debe indicar el motivo. Sólo puede responder la propuesta vigente.</p><button disabled={busy} onClick={()=>respond(true)}>Aceptar contrapropuesta</button><CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom}/><button className="secondary-action" disabled={busy||!reasonId||(needsCustom(reasons,reasonId)&&!custom.trim())} onClick={()=>respond(false)}>Rechazar contrapropuesta y cancelar</button></div>}{CANCELLABLE_REQUEST.includes(f.estado)&&<div className="wide detail-actions" aria-label="Cancelar solicitud"><h4>Cancelar mi solicitud</h4><CancellationFields reasons={reasons} value={cancelReasonId} setValue={setCancelReasonId} custom={cancelCustom} setCustom={setCancelCustom}/><button className="secondary-action" disabled={busy||!cancelReasonId||(needsCustom(reasons,cancelReasonId)&&!cancelCustom.trim())} onClick={()=>window.confirm?.("¿Cancelar la solicitud?")!==false&&run(`/flights/${id}/cancel`,{motivoCancelacionId:cancelReasonId,motivoCancelacionPersonalizado:cancelCustom||null},"Solicitud cancelada")}>Cancelar solicitud</button></div>}</>}</div></section>;
}
/** Evaluación de Operaciones sobre una solicitud sanitaria: aprobar, proponer (o reemplazar) otro horario, o rechazar con motivo. */
export function RequestEvaluation({ flight, events, call, reasons }) {
 const [counter,setCounter]=useState(""),[why,setWhy]=useState(""),[reasonId,setReasonId]=useState(""),[custom,setCustom]=useState("");
 if(!flight?.datosSanitarios||!["SOLICITADO","PENDIENTE_RESPUESTA_DTS"].includes(flight.estado))return null;
 const proposal=openProposal(events,"CO_CONTRAPROPUESTA"),pending=flight.estado==="PENDIENTE_RESPUESTA_DTS";
 return <div className="wide detail-actions" aria-label="Evaluación de la solicitud"><h4>Evaluación de la solicitud</h4>{pending&&proposal&&<p>Propuesta vigente: <strong>{dt(proposal.fechaHoraPropuesta)}</strong> — espera la respuesta del DTS. Una nueva propuesta la reemplaza y la anterior queda obsoleta.</p>}{!pending&&<button onClick={()=>call(`/flights/${flight.id}/schedule/accept`,null,"Horario aceptado")}>Aceptar horario DTS</button>}<label>Nueva fecha y hora<input type="datetime-local" value={counter} onChange={e=>setCounter(e.target.value)}/></label><label>Motivo de la propuesta<textarea value={why} onChange={e=>setWhy(e.target.value)}/></label><button disabled={!counter||!why.trim()} onClick={()=>call(`/flights/${flight.id}/schedule/counterproposal`,{salida:counter,motivo:why},pending?"Propuesta reemplazada":"Propuesta enviada al DTS")}>{pending?"Reemplazar propuesta":"Proponer otro horario"}</button>{!pending&&<><CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom}/><button className="secondary-action" disabled={!reasonId||(reasons.find(x=>String(x.id)===String(reasonId))?.codigo==="OTRO"&&!custom.trim())} onClick={()=>window.confirm?.("¿Rechazar la solicitud?")!==false&&call(`/flights/${flight.id}/schedule/reject`,{motivoCancelacionId:reasonId,motivoCancelacionPersonalizado:custom||null},"Solicitud rechazada")}>Rechazar solicitud</button></>}</div>;
}
const Negotiation = ({ events=[] }) => <div className="wide"><h4>Historial de negociación</h4>{events.map((e,i)=><p key={i}><strong>{e.tipo.replaceAll("_"," ")}</strong>{e.fechaHoraPropuesta&&`: salida ${dt(e.fechaHoraPropuesta)}`}{e.fechaHoraLlegadaPropuesta&&` · llegada ${dt(e.fechaHoraLlegadaPropuesta)}`}{e.motivo&&` — ${e.motivo}`}</p>)}</div>;
export function WeatherHistory({ flightId, revision=0 }) {
 const [rows,setRows]=useState(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;setRows(null);setError("");api(`/flights/${flightId}/weather`).then(data=>{if(!Array.isArray(data))throw new Error("Respuesta de historial inválida");if(active)setRows(data);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[flightId,revision]);
 return <div className="wide"><h4>Historial meteorológico</h4>{error?<p role="alert">No se pudo cargar el historial: {error}</p>:rows===null?<p>Cargando historial…</p>:rows.length===0?<p>Sin registros meteorológicos.</p>:rows.map(row=><div key={row.id}><p><strong>{dt(row.fechaRegistro)} — {row.favorable===null||row.favorable===undefined?"Sin indicación":row.favorable?"Favorable":"No favorable"}</strong> · {row.registradoPor}</p><p>{row.condiciones}</p>{row.observaciones&&<p>{row.observaciones}</p>}</div>)}</div>;
}
export function AirportCoordinations({flightId, msg=()=>{}}) {
 const empty={aeropuertoId:'',finalidad:'',descripcion:'',estado:'PENDIENTE',fechaSlot:'',contacto:'',canal:'',fechaComunicacion:'',fechaRespuesta:'',fuenteRespuesta:'',referenciaExterna:'',observaciones:'',motivoCambio:''};
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(null),[form,setForm]=useState(empty),[query,setQuery]=useState(''),[airports,setAirports]=useState([]);
 const load=async()=>{try{const x=await api(`/flights/${flightId}/airport-coordinations`);if(!x||!Array.isArray(x.versiones))throw Error('Respuesta de coordinaciones inválida');setData(x);setError('');}catch(e){setData(null);setError(e.message);}};
 useEffect(()=>{setData(null);setEditing(null);setForm(empty);load();},[flightId]);
 useEffect(()=>{if(!data?.puedeGestionar)return;let active=true;api(`/catalogs/airports?q=${encodeURIComponent(query)}`).then(x=>{if(active)setAirports(x);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[query,data?.puedeGestionar]);
 const choose=v=>{setEditing(v.gestionId);setForm({aeropuertoId:v.aeropuertoId||'',finalidad:v.finalidad||'',descripcion:v.descripcion||'',estado:v.estado,fechaSlot:v.fechaSlot?.slice(0,16)||'',contacto:v.contacto||'',canal:v.canal||'',fechaComunicacion:v.fechaComunicacion?.slice(0,16)||'',fechaRespuesta:v.fechaRespuesta?.slice(0,16)||'',fuenteRespuesta:v.fuenteRespuesta||'',referenciaExterna:v.referenciaExterna||'',observaciones:v.observaciones||'',motivoCambio:''});};
 const save=async()=>{setBusy(true);try{const current=data.versiones.find(v=>v.actual&&v.gestionId===editing);const body={...form,version:current?.version||0,aeropuertoId:Number(form.aeropuertoId),fechaSlot:form.fechaSlot||null,fechaComunicacion:form.fechaComunicacion||null,fechaRespuesta:form.fechaRespuesta||null};await api(`/flights/${flightId}/airport-coordinations${editing?'/'+editing:''}`,{method:editing?'PUT':'POST',body:JSON.stringify(body)});await load();setEditing(null);setForm(empty);msg('Gestión aeroportuaria guardada');}catch(e){setError(e.message);}finally{setBusy(false);}};
 const current=data?.versiones.filter(v=>v.actual)||[];
 return <section className="wide detail-actions"><h4>Coordinaciones aeroportuarias</h4><p>Seguimiento manual: las respuestas son declaradas por el personal y no se envían ni verifican automáticamente con AA2000.</p>{error&&<p role="alert">{error}</p>}{!data?!error&&<p>Cargando coordinaciones…</p>:<><p>Plan actual: {data.origen||'Origen pendiente'} → {data.destino||'Destino pendiente'} · {data.aeronave||'Aeronave pendiente'} · Salida: {data.salida?dt(data.salida):'Pendiente'} · Llegada: {data.llegada?dt(data.llegada):'Pendiente'}</p>{current.length===0?<p>Sin gestiones registradas; no se presupone que sean necesarias.</p>:current.map(v=><article key={v.gestionId}><p><strong>{v.aeropuerto||'Aeropuerto pendiente'} · {v.finalidad||'Finalidad pendiente'}</strong> · {v.estado.replaceAll('_',' ')} · {v.estadoVigencia.replaceAll('_',' ')}</p><p>{v.descripcion||v.observaciones||'Gestión histórica'}</p><p>Comunicación: {v.fechaComunicacion?dt(v.fechaComunicacion):'No registrada'} · {v.canal||'—'} · {v.contacto||'—'}</p>{v.fechaRespuesta&&<p>Respuesta declarada: {dt(v.fechaRespuesta)} · Fuente: {v.fuenteRespuesta} · Referencia: {v.referenciaExterna||'—'}</p>}<p>Registró versión {v.version}: {v.responsable} · {dt(v.fechaCreacion)}</p><details><summary>Historial de esta gestión</summary>{data.versiones.filter(x=>x.gestionId===v.gestionId).map(x=><div key={x.id}><p>Versión {x.version} · {x.estado.replaceAll('_',' ')} · {x.responsable} · {dt(x.fechaCreacion)} · {x.motivoCambio||'Alta'}</p><p>{x.descripcion||'—'} · Observaciones: {x.observaciones||'—'}</p><p>Slot: {x.fechaSlot?dt(x.fechaSlot):'—'} · Comunicación: {x.fechaComunicacion?dt(x.fechaComunicacion):'—'} · {x.canal||'—'} · {x.contacto||'—'}</p><p>Respuesta: {x.fechaRespuesta?dt(x.fechaRespuesta):'—'} · Fuente: {x.fuenteRespuesta||'—'} · Referencia: {x.referenciaExterna||'—'}</p></div>)}</details>{data.puedeGestionar&&v.estado!=='CANCELADO'&&<button type="button" onClick={()=>choose(v)}>Actualizar gestión</button>}</article>)}{data.motivo&&<p>{data.motivo}</p>}{data.puedeGestionar&&<div><h4>{editing?'Actualizar gestión':'Nueva gestión'}</h4><label>Buscar aeropuerto de coordinación<input value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Aeropuerto de coordinación<select value={form.aeropuertoId} disabled={!!editing&&!!data.versiones.find(v=>v.actual&&v.gestionId===editing)?.aeropuertoId} onChange={e=>setForm({...form,aeropuertoId:e.target.value})}><option value="">Seleccionar</option>{form.aeropuertoId&&!airports.some(a=>a.id===Number(form.aeropuertoId))&&<option value={form.aeropuertoId}>{data.versiones.find(v=>v.actual&&v.gestionId===editing)?.aeropuerto||'Seleccionado'}</option>}{airports.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label>Finalidad de coordinación<input maxLength={200} disabled={!!editing&&!!data.versiones.find(v=>v.actual&&v.gestionId===editing)?.finalidad} value={form.finalidad} onChange={e=>setForm({...form,finalidad:e.target.value})}/></label><label>Descripción de la gestión<textarea maxLength={4000} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/></label>{editing&&<label>Estado de seguimiento<select value={form.estado} onChange={e=>setForm({...form,estado:e.target.value,fechaRespuesta:'',fuenteRespuesta:''})}><option value="PENDIENTE">Pendiente</option><option value="EN_SEGUIMIENTO">En seguimiento</option><option value="CONFIRMADO">Confirmación declarada</option><option value="RECHAZADO">Rechazo informado</option><option value="CANCELADO">Cancelada</option></select></label>}<label>Fecha y hora del slot informado<input type="datetime-local" value={form.fechaSlot} onChange={e=>setForm({...form,fechaSlot:e.target.value})}/></label><label>Contacto de coordinación<input maxLength={150} value={form.contacto} onChange={e=>setForm({...form,contacto:e.target.value})}/></label><label>Canal de comunicación<input maxLength={100} value={form.canal} onChange={e=>setForm({...form,canal:e.target.value})}/></label><label>Fecha y hora de comunicación<input type="datetime-local" value={form.fechaComunicacion} onChange={e=>setForm({...form,fechaComunicacion:e.target.value})}/></label>{['CONFIRMADO','RECHAZADO'].includes(form.estado)&&<><label>Fecha y hora de respuesta<input type="datetime-local" value={form.fechaRespuesta} onChange={e=>setForm({...form,fechaRespuesta:e.target.value})}/></label><label>Fuente de la respuesta<input maxLength={250} value={form.fuenteRespuesta} onChange={e=>setForm({...form,fuenteRespuesta:e.target.value})}/></label></>}<label>Referencia externa proporcionada<input maxLength={250} value={form.referenciaExterna} onChange={e=>setForm({...form,referenciaExterna:e.target.value})}/></label><label>Observaciones de coordinación<textarea maxLength={4000} value={form.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})}/></label>{editing&&<label>Motivo del cambio<textarea maxLength={1000} value={form.motivoCambio} onChange={e=>setForm({...form,motivoCambio:e.target.value})}/></label>}<button type="button" disabled={busy||!form.aeropuertoId||!form.finalidad.trim()||!form.descripcion.trim()||(editing&&!form.motivoCambio.trim())} onClick={save}>{editing?'Guardar seguimiento':'Registrar coordinación'}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(empty);}}>Cancelar edición</button>}</div>}</>}</section>;
}

export function HangarInfo({flightId, msg=()=>{}}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({requiereHangar:true,preparacionCompleta:false,observaciones:''}),[note,setNote]=useState('');
 const load=async()=>{try{const result=await api(`/flights/${flightId}/hangar`);if(!result||typeof result.estado!=='string'||!Array.isArray(result.versiones))throw Error('Respuesta de hangar inválida');setData(result);const current=result.versiones.find(v=>v.actual);setForm({requiereHangar:current?.requiereHangar??true,preparacionCompleta:current?.preparacionCompleta??false,observaciones:current?.observaciones||''});setNote('');setError('');}catch(e){setData(null);setError(e.message);}};
 useEffect(()=>{load();},[flightId]);
 const save=async commander=>{setBusy(true);try{const current=data.versiones.find(v=>v.actual);await api(`/flights/${flightId}/hangar${commander?'/commander-observation':''}`,{method:'PUT',body:JSON.stringify(commander?{version:current.version,observaciones:note}:{version:current?.version||0,...form})});await load();msg('Información de hangar guardada');}catch(e){setError(e.message);}finally{setBusy(false);}};
 const current=data?.versiones.find(v=>v.actual);
 return <section className="wide detail-actions"><h4>Hangar y preparación terrestre</h4>{error&&<p role="alert">{error}</p>}{!data?!error&&<p>Cargando información de hangar…</p>:<><p>Estado: {data.estado.replaceAll('_',' ')}</p><p>Aeronave asignada: {data.aeronave||'Sin asignar'} · Origen planificado: {data.origenPlanificado||'Sin definir'} · Última ubicación confirmada de la aeronave: {data.ubicacionConfirmada||'Sin definir'}</p>{data.estado==='REQUIERE_REVISION'&&<p>Operaciones debe revisar la información por cambio de contexto o por datos anteriores.</p>}{current&&<><p>Versión {current.version} · {current.responsable} · {dt(current.fechaCreacion)}</p><p>Observaciones de Operaciones: {current.observaciones||'—'}</p><p>Observaciones del comandante: {current.observacionesComandante||'—'}</p></>}{data.versiones.length>1&&<details><summary>Historial de versiones</summary>{data.versiones.map(v=><p key={v.id}>Versión {v.version} · {v.responsable} · {dt(v.fechaCreacion)} · {v.requiereHangar===null?'Anterior':v.requiereHangar?(v.preparacionCompleta?'Preparación completa':'Preparación pendiente'):'No requerido'} · {v.observaciones||'—'} · Comandante: {v.observacionesComandante||'—'}</p>)}</details>}{data.puedeGestionar&&<div><label>¿Requiere hangar?<select value={String(form.requiereHangar)} onChange={e=>setForm({...form,requiereHangar:e.target.value==='true',preparacionCompleta:false})}><option value="true">Sí</option><option value="false">No</option></select></label>{form.requiereHangar&&<label>Preparación terrestre<select value={String(form.preparacionCompleta)} onChange={e=>setForm({...form,preparacionCompleta:e.target.value==='true'})}><option value="false">Pendiente</option><option value="true">Completa</option></select></label>}<label>Observaciones de Operaciones<textarea maxLength={4000} value={form.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})}/></label><button type="button" disabled={busy} onClick={()=>save(false)}>Guardar información de hangar</button></div>}{data.puedeObservar&&<div><label>Observación del comandante<textarea maxLength={4000} value={note} onChange={e=>setNote(e.target.value)}/></label><button type="button" disabled={busy||!note.trim()} onClick={()=>save(true)}>Guardar observación del comandante</button></div>}{data.motivo&&<p>{data.motivo}</p>}</>}</section>;
}

export function FlightLog({flightId, revision=0, allowWrite=true, msg=()=>{}}) {
 const [page,setPage]=useState(0),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState(null),[form,setForm]=useState({tipo:'PREPARACION',descripcion:'',ocurrido:'',importancia:'NORMAL',motivoCorreccion:''});
 const load=async n=>{try{const result=await api(`/flights/${flightId}/log?page=${n}`);if(!result||!Array.isArray(result.entradas))throw Error('Respuesta de bitácora inválida');setData(result);setError('');}catch(e){setData(null);setError(e.message);}};
 useEffect(()=>{setPage(0);setTarget(null);setData(null);load(0);},[flightId,revision]);
 const navigate=n=>{setPage(n);setData(null);load(n);};
 const save=async()=>{setBusy(true);try{if(!form.ocurrido)throw Error('Indicá la fecha y hora del acontecimiento');const occurred=new Date(form.ocurrido);if(Number.isNaN(occurred.getTime()))throw Error('Fecha y hora inválidas');await api(`/flights/${flightId}/log`,{method:'POST',body:JSON.stringify({...form,ocurrido:occurred.toISOString(),correccionDe:target?.id||null,motivoCorreccion:target?form.motivoCorreccion:null})});setForm({tipo:'PREPARACION',descripcion:'',ocurrido:'',importancia:'NORMAL',motivoCorreccion:''});setTarget(null);setPage(0);await load(0);msg('Novedad registrada');}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="wide detail-actions"><h4>Bitácora operativa</h4><p>Horas expresadas en la zona del navegador. No incluya diagnósticos ni datos clínicos.</p>{error&&<p role="alert">{error}</p>}{!data?!error&&<p>Cargando bitácora…</p>:<><p>Más recientes primero · Página {page+1}</p>{data.entradas.length===0?<p>Sin acontecimientos operativos.</p>:data.entradas.map(e=><article key={e.id}><p><strong>{e.tipo.replaceAll('_',' ')} · {e.origen==='AUTOMATICO'?'Automático':'Manual'}{e.importancia==='IMPORTANTE'?' · Importante':''}</strong></p><p>{e.descripcion}</p><p>Ocurrió: {dt(e.ocurrido)} · Registrado: {dt(e.registrado)} · {e.responsable}</p>{e.correccionDe&&<p>Corrección de #{e.correccionDe}: {e.motivoCorreccion}</p>}{allowWrite&&data.puedeRegistrar&&<button type="button" className="secondary-action" disabled={busy} onClick={()=>{setTarget(e);setForm({...form,tipo:['PREPARACION','DEMORA','INCIDENCIA','METEOROLOGIA','AERONAVE','EJECUCION','CIERRE','OTRO'].includes(e.tipo)?e.tipo:'OTRO',descripcion:e.descripcion,motivoCorreccion:''});}}>Corregir #{e.id}</button>}</article>)}<button type="button" disabled={page===0} onClick={()=>navigate(page-1)}>Más recientes</button><button type="button" disabled={!data.hayMas} onClick={()=>navigate(page+1)}>Más antiguos</button>{allowWrite&&data.puedeRegistrar?<div><h4>{target?`Corrección de #${target.id}`:'Registrar acontecimiento'}</h4><label>Tipo de acontecimiento<select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>{[['PREPARACION','Preparación'],['DEMORA','Demora'],['INCIDENCIA','Incidencia'],['METEOROLOGIA','Meteorología'],['AERONAVE','Aeronave'],['EJECUCION','Ejecución'],['CIERRE','Cierre'],['OTRO','Otro']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Descripción de la novedad<textarea maxLength={4000} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/></label><label>Fecha y hora del acontecimiento<input type="datetime-local" value={form.ocurrido} onChange={e=>setForm({...form,ocurrido:e.target.value})}/></label><label>Importancia<select value={form.importancia} onChange={e=>setForm({...form,importancia:e.target.value})}><option value="NORMAL">Normal</option><option value="IMPORTANTE">Importante</option></select></label>{target&&<><label>Motivo de corrección<textarea maxLength={1000} value={form.motivoCorreccion} onChange={e=>setForm({...form,motivoCorreccion:e.target.value})}/></label><button type="button" onClick={()=>setTarget(null)}>Cancelar corrección</button></>}<button type="button" disabled={busy||!form.descripcion.trim()||!form.ocurrido||(target&&!form.motivoCorreccion.trim())} onClick={save}>{target?'Guardar corrección':'Registrar novedad'}</button></div>:allowWrite&&<p>{data.motivo}</p>}</>}</section>;
}
const DEFAULT_CREW_ROLES = [["COPILOTO", "Copiloto"], ["MEDICO", "Médico"], ["ENFERMERO", "Enfermero"]];
const CREW_REMOVAL_LABEL = { RETIRO: "Retirado", REEMPLAZO: "Reemplazado", CAMBIO_COMANDANTE: "Comandante reemplazado" };
/** Tripulación del vuelo. Operaciones asigna, reemplaza y retira antes del inicio; el comandante sólo consulta. Retirar conserva el registro como historial. */
export function FlightCrew({ flightId, canManage=false, state, msg=()=>{} }) {
 const [rows,setRows]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[role,setRole]=useState(""),[available,setAvailable]=useState([]),[blocked,setBlocked]=useState([]),[member,setMember]=useState(""),[replace,setReplace]=useState(""),[roles,setRoles]=useState(DEFAULT_CREW_ROLES),[loadingCandidates,setLoadingCandidates]=useState(false),[history,setHistory]=useState(null),[showHistory,setShowHistory]=useState(false);
 const load=async()=>{try{const data=await api(`/flights/${flightId}/crew`);if(!Array.isArray(data))throw new Error("Respuesta de tripulación inválida");setRows(data);setError("");}catch(e){setRows(null);setError(e.message);}};
 const loadHistory=async()=>{try{const data=await api(`/flights/${flightId}/crew?history=true`);if(!Array.isArray(data))throw new Error("Respuesta de historial inválida");setHistory(data);}catch(e){setHistory(null);setError(e.message);}};
 useEffect(()=>{setRows(null);setError("");setShowHistory(false);setHistory(null);setRole("");setMember("");setReplace("");load();},[flightId,state]);
 useEffect(()=>{if(!canManage)return;let active=true;api("/catalogs/crew-roles").then(list=>{const mapped=(Array.isArray(list)?list:[]).filter(r=>r&&r.codigo&&r.codigo!=="COMANDANTE").map(r=>[r.codigo,r.nombre]);if(active&&mapped.length)setRoles(mapped);}).catch(()=>{});return ()=>{active=false;};},[canManage]);
 const refreshAvailable=async code=>{if(!code){setAvailable([]);setBlocked([]);return;}setLoadingCandidates(true);try{const [free,all]=await Promise.all([api(`/flights/${flightId}/crew/available?role=${encodeURIComponent(code)}`),api(`/flights/${flightId}/crew/candidates?role=${encodeURIComponent(code)}`)]);setAvailable(Array.isArray(free)?free:[]);setBlocked((Array.isArray(all)?all:[]).filter(x=>x&&x.disponible===false));}catch(e){setAvailable([]);setBlocked([]);setError(e.message);}finally{setLoadingCandidates(false);}};
 const refreshAll=async()=>{await load();await refreshAvailable(role);if(showHistory)await loadHistory();};
 const remove=async row=>{if(busy)return;if(window.confirm?.(`¿Retirar a ${row.nombre} ${row.apellido} de la tripulación? El registro queda en el historial.`)===false)return;setBusy(true);try{await api(`/flights/${flightId}/crew/${row.id}`,{method:"DELETE"});await refreshAll();msg("Tripulante retirado");}catch(e){await refreshAll();setError(e.message);}finally{setBusy(false);}};
 const save=async()=>{if(busy)return;setBusy(true);try{await api(`/flights/${flightId}/crew${replace?`/${replace}`:""}`,{method:replace?"PUT":"POST",body:JSON.stringify({userId:Number(member),crewRoleCode:role})});setMember("");setReplace("");setError("");await refreshAll();msg(replace?"Tripulante reemplazado":"Tripulante asignado");}catch(e){await refreshAll();setError(e.message);}finally{setBusy(false);}};
 const toggleHistory=async()=>{if(showHistory){setShowHistory(false);return;}setShowHistory(true);await loadHistory();};
 const mutable=["PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PLANIFICADO","PENDIENTE_REPLANIFICACION"].includes(state);
 const current=(rows||[]).filter(r=>r.vigente!==false),removed=(history||[]).filter(r=>r.vigente===false);
 return <div className="wide"><h4>Tripulación</h4><button type="button" className="link-button" onClick={load}>Actualizar elegibilidad</button>{error&&<p role="alert">{error}</p>}{rows===null?!error&&<p>Cargando tripulación…</p>:current.length===0?<p>Sin tripulantes registrados.</p>:current.map(row=><p key={row.id}><strong>{row.nombre} {row.apellido}</strong> · {row.crewRoleName}{row.comandante&&" (comandante)"}{row.elegibilidadCodigo&&<span role={row.elegibilidadCodigo==="ELEGIBLE"?undefined:"status"} className={row.elegibilidadCodigo==="ELEGIBLE"?"success":row.elegibilidadCodigo==="HABILITACION_POR_VENCER"?"hint":"error"}> · {row.elegibilidadCodigo==="ELEGIBLE"?"Apto":row.elegibilidadCodigo==="HABILITACION_POR_VENCER"?"Por vencer · Revisión recomendada":"Requiere revisión"}{row.elegibilidadCodigo!=="ELEGIBLE"?`: ${row.elegibilidadMotivo}`:""}</span>}{canManage&&mutable&&!row.comandante&&<><button type="button" className="secondary-action" disabled={busy} onClick={()=>remove(row)}>Retirar</button><button type="button" className="secondary-action" disabled={busy} onClick={()=>setReplace(String(row.id))}>Reemplazar</button></>}</p>)}
  {canManage&&rows!==null&&current.length>0&&<CrewContacts flightId={flightId} state={state} crewKey={current.map(r=>`${r.id}:${r.userId}:${r.crewRoleCode}`).join("|")}/>}
  {rows!==null&&<button type="button" className="link-button" onClick={toggleHistory}>{showHistory?"Ocultar historial de tripulación":"Ver historial de tripulación"}</button>}
  {showHistory&&(history===null?<p>Cargando historial…</p>:removed.length===0?<p className="hint">Sin retiros ni reemplazos registrados.</p>:<ul aria-label="Historial de tripulación">{removed.map(r=><li key={r.id}>{r.nombre} {r.apellido} · {r.crewRoleName} — {CREW_REMOVAL_LABEL[r.motivoBaja]||r.motivoBaja} por {r.bajaPor||"—"} el {dt(r.fechaBaja)} (asignado por {r.asignadoPor||"—"} el {dt(r.asignadoEn)})</li>)}</ul>)}
  {canManage&&mutable&&<div className="detail-actions"><p>{replace?"Seleccioná la persona y función de reemplazo.":"Asignar una persona con clasificación administrativa."}</p><label>Función de tripulación<select value={role} onChange={e=>{setRole(e.target.value);setMember("");setError("");refreshAvailable(e.target.value);}}><option value="">Seleccionar</option>{roles.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>{role&&(loadingCandidates?<p>Consultando disponibilidad…</p>:<><label>Personal disponible<select value={member} onChange={e=>setMember(e.target.value)}><option value="">Seleccionar</option>{available.map(x=><option key={x.userId} value={x.userId}>{x.nombre} {x.apellido} ({x.username})</option>)}</select></label>{available.length===0&&<p className="hint">No hay personal disponible con esa función para el horario del vuelo.</p>}{blocked.length>0&&<details><summary>Personal que requiere revisión ({blocked.length})</summary><ul>{blocked.map(x=><li key={x.userId}>{x.nombre} {x.apellido}: {x.motivoNoDisponible}</li>)}</ul></details>}</>)}<button type="button" disabled={!member||!role||busy} onClick={save}>{busy?"Guardando…":replace?"Confirmar reemplazo":"Asignar tripulante"}</button>{replace&&<button type="button" className="secondary-action" onClick={()=>setReplace("")}>Cancelar reemplazo</button>}</div>}</div>;
}
function CommanderAssignment({ flight, done, msg, reload }) {
 const [motivo,setMotivo]=useState(""),[salida,setSalida]=useState(""),[llegada,setLlegada]=useState("");
 if(flight?.estado!=="PENDIENTE_CONFIRMACION_COMANDANTE")return null;
 const send=async body=>{try{await api(`/flights/${flight.id}/commander-assignment/response`,{method:"POST",body:JSON.stringify(body)});msg("Respuesta enviada a Operaciones");await done();await reload();}catch(e){msg(e.message,true);}};
 return <div className="wide detail-actions"><h4>Confirmación de asignación</h4><p>Revise el vuelo asignado. Un rechazo no cancela el vuelo: vuelve a Operaciones para replanificarlo.</p><button onClick={()=>send({aceptar:true})}>Aceptar asignación</button><label>Motivo (obligatorio para rechazar o proponer)<textarea value={motivo} onChange={e=>setMotivo(e.target.value)}/></label><button className="secondary-action" disabled={!motivo.trim()} onClick={()=>send({aceptar:false,motivo})}>Rechazar y devolver a Operaciones</button><label>Nueva salida<input type="datetime-local" value={salida} onChange={e=>setSalida(e.target.value)}/></label><label>Nueva llegada<input type="datetime-local" value={llegada} onChange={e=>setLlegada(e.target.value)}/></label><button disabled={!motivo.trim()||!salida||!llegada} onClick={()=>send({aceptar:false,motivo,salidaPropuesta:salida,llegadaPropuesta:llegada})}>Proponer horario</button></div>;
}
function OperationalReplanning({ flight, done, msg, reload }) {
 const [catalogs,setCatalogs]=useState({aircraft:[],commanders:[],airports:[]}),[form,setForm]=useState({aircraftId:"",comandanteId:"",destinoId:"",salida:"",llegada:""});
 useEffect(()=>{Promise.all([api("/catalogs/aircraft"),api("/auth/users/commanders"),api("/catalogs/airports")]).then(([aircraft,commanders,airports])=>setCatalogs({aircraft,commanders,airports})).catch(e=>msg(e.message,true));},[]);
 const send=async()=>{try{await api(`/flights/${flight.id}/operational-replanning`,{method:"POST",body:JSON.stringify(form)});msg("Nueva asignación enviada al comandante");await done();await reload();}catch(e){msg(e.message,true);}};
 return <div className="wide detail-actions"><h4>Replanificar asignación</h4><p>El origen se toma nuevamente de la ubicación actual de la aeronave.</p><label>Aeronave<select value={form.aircraftId} onChange={e=>setForm({...form,aircraftId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{catalogs.aircraft.map(x=><option key={x.id} value={x.id}>{x.matricula} — {x.aeropuertoActual}</option>)}</select></label><label>Comandante<select value={form.comandanteId} onChange={e=>setForm({...form,comandanteId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{catalogs.commanders.map(x=><option key={x.id} value={x.id}>{x.nombre} {x.apellido}</option>)}</select></label><label>Destino<select value={form.destinoId} onChange={e=>setForm({...form,destinoId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{catalogs.airports.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><label>Salida<input type="datetime-local" value={form.salida} onChange={e=>setForm({...form,salida:e.target.value})}/></label><label>Llegada<input type="datetime-local" value={form.llegada} onChange={e=>setForm({...form,llegada:e.target.value})}/></label><button disabled={!form.aircraftId||!form.comandanteId||!form.destinoId||!form.salida||!form.llegada} onClick={send}>Enviar nueva asignación</button></div>;
}
function CommanderProposalResponse({ flight, events=[], done, msg, reload }) {
 const [motivo,setMotivo]=useState("");
 if(flight?.estado==="PENDIENTE_REPLANIFICACION")return <OperationalReplanning flight={flight} done={done} msg={msg} reload={reload}/>;
 if(flight?.estado!=="PENDIENTE_RESPUESTA_OPERACIONES")return null;
 const proposal=openProposal(events,"COMANDANTE_PROPONE_HORARIO");
 if(!proposal)return <p className="wide hint">La propuesta del comandante ya fue respondida o reemplazada; actualice la ficha.</p>;
 const send=async aceptar=>{try{await api(`/flights/${flight.id}/commander-proposal/response`,{method:"POST",body:JSON.stringify({aceptar,propuestaId:proposal.id,motivo:aceptar?null:motivo})});msg(aceptar?"Horario del comandante aceptado":"Propuesta devuelta al comandante");await done();await reload();}catch(e){msg(e.message,true);}};
 return <div className="wide detail-actions"><h4>Propuesta de horario del comandante</h4><p>Propone salida <strong>{dt(proposal.fechaHoraPropuesta)}</strong> y llegada <strong>{dt(proposal.fechaHoraLlegadaPropuesta)}</strong> — {proposal.motivo}. La propuesta y sus horarios constan en el historial. Al rechazarla, el comandante debe confirmar o presentar una nueva propuesta.</p><button onClick={()=>send(true)}>Aceptar horario propuesto</button><label>Motivo del rechazo<textarea value={motivo} onChange={e=>setMotivo(e.target.value)}/></label><button className="secondary-action" disabled={!motivo.trim()} onClick={()=>send(false)}>Rechazar propuesta</button></div>;
}
function OperationalFlightForm({ d, done, msg }) {
 const aircraft=Array.isArray(d.aircraft)?d.aircraft:[], commanders=Array.isArray(d.commanders)?d.commanders:[], airports=Array.isArray(d.airports)?d.airports:[];
 const [types,setTypes]=useState([]),[form,setForm]=useState({tipoVueloCode:"",motivoVuelo:"",aircraftId:"",comandanteId:"",destinoId:"",salida:"",llegada:""});
 useEffect(()=>{let active=true;api("/catalogs/flight-types?operationalOnly=true").then(rows=>{if(active){setTypes(rows);setForm(x=>x.tipoVueloCode?x:{...x,tipoVueloCode:rows[0]?.codigo||""});}}).catch(e=>msg(e.message,true));return()=>{active=false;};},[]);
 const save=async e=>{e.preventDefault();try{await api("/flights/operational",{method:"POST",body:JSON.stringify(form)});msg("Vuelo operativo creado; queda pendiente de confirmación del comandante");setForm({tipoVueloCode:types[0]?.codigo||"",motivoVuelo:"",aircraftId:"",comandanteId:"",destinoId:"",salida:"",llegada:""});done();}catch(error){msg(error.message,true);}};
 return <section className="card"><h2>Nuevo vuelo operativo</h2><p className="hint">El origen se toma automáticamente de la ubicación actual de la aeronave.</p><form className="grid-form" onSubmit={save}><label>Tipo<select required value={form.tipoVueloCode} onChange={e=>setForm({...form,tipoVueloCode:e.target.value})}><option value="">Seleccionar tipo</option>{types.map(x=><option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}</select></label><label>Aeronave<select required value={form.aircraftId} onChange={e=>setForm({...form,aircraftId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{aircraft.map(x=><option key={x.id} value={x.id}>{x.matricula} — {x.aeropuertoActual}</option>)}</select></label><label>Comandante<select required value={form.comandanteId} onChange={e=>setForm({...form,comandanteId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{commanders.map(x=><option key={x.id} value={x.id}>{x.nombre} {x.apellido}</option>)}</select></label><label>Destino<select required value={form.destinoId} onChange={e=>setForm({...form,destinoId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar aeropuerto</option>{airports.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><label>Salida<input required type="datetime-local" value={form.salida} onChange={e=>setForm({...form,salida:e.target.value})}/></label><label>Llegada<input required type="datetime-local" value={form.llegada} onChange={e=>setForm({...form,llegada:e.target.value})}/></label><label className="wide">Motivo<textarea required value={form.motivoVuelo} onChange={e=>setForm({...form,motivoVuelo:e.target.value})}/></label><button disabled={!form.tipoVueloCode}>Crear vuelo operativo</button></form></section>;
}
export function Ops({ d, done, msg }) {
 const [id,setId]=useState(""),[detail,setDetail]=useState(null),[counter,setCounter]=useState(""),[reason,setReason]=useState(""),[reasons,setReasons]=useState([]),[reasonId,setReasonId]=useState(""),[custom,setCustom]=useState(""),[aircraft,setAircraft]=useState([]),[commanders,setCommanders]=useState([]),[a,setA]=useState(""),[c,setC]=useState(""),[provinces,setProvinces]=useState([]);
 const [routeStates,setRouteStates]=useState({}),[logRevision,setLogRevision]=useState(0),[routeRevision,setRouteRevision]=useState(0);
 useEffect(()=>{let active=true;api('/flights/route-statuses').then(rows=>{if(active&&Array.isArray(rows))setRouteStates(Object.fromEntries(rows.map(r=>[r.flightId,r])));}).catch(()=>{if(active)setRouteStates({});});return ()=>{active=false;};},[d.flights,routeRevision]);
 const load=async flightId=>{if(!flightId)return;try{setDetail(adaptDetail(await api(`/flights/${flightId}`)));}catch(e){msg(e.message,true);}};
 useEffect(()=>{api("/catalogs/provinces").then(setProvinces).catch(e=>msg(e.message,true));api("/catalogs/cancellation-reasons").then(x=>setReasons(Array.isArray(x)?x:[])).catch(e=>msg(e.message,true));},[]); useEffect(()=>{setDetail(null);setAircraft([]);setCommanders([]);setA("");setC("");setReasonId("");setCustom("");load(id);},[id]);
 const call=async(path,body,success)=>{try{await api(path,{method:"POST",body:body&&JSON.stringify(body)});msg(success);await done();await load(id);setLogRevision(x=>x+1);}catch(e){msg(e.message,true);}}; const f=detail?.vuelo;
 const resources=async()=>{try{const [as,cs]=await Promise.all([api(`/flights/${id}/available-aircraft`),api(`/flights/${id}/available-commanders`)]);setAircraft(as);setCommanders(cs);}catch(e){msg(e.message,true);}};
 return <><OperationalFlightForm d={d} done={done} msg={msg}/><section className="card"><h2>Centro de Operaciones</h2><div className="grid-form"><RouteReviewQueue statuses={routeStates} flights={d.flights} onOpen={setId}/><label>Solicitud<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.extremaUrgencia?"⚠ URGENTE · ":""}{x.codigo} — {x.estado}{routeStates[x.id]?.estado&&routeStates[x.id].estado!=='SIN_PLANIFICAR'?` · Ruta ${ROUTE_STATE_LABEL[routeStates[x.id].estado]||routeStates[x.id].estado}`:''}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>{f.datosSanitarios?"Propuesta DTS":"Vuelo operativo"}</h4><p>{f.datosSanitarios?dt(f.solicitada):f.motivoVuelo}</p><p>{locationLabel(f.origen)} → {locationLabel(f.destino)}</p></div><div><h4>Horario definitivo</h4><p>{f.salida?dt(f.salida):"Aún en negociación"}</p></div></div><Urgency flight={f} detail/><CancellationNote flight={f}/><FlightClosure flight={f} cierre={detail.cierre}/><LifecycleActions flight={f} run={(path,ok)=>call(path,null,ok)}/><HangarInfo key={`hangar-${id}`} flightId={id} msg={msg}/><AirportCoordinations key={`airport-${id}-${logRevision}`} flightId={id} msg={msg}/><FlightDocuments key={`documents-${id}`} flightId={id} canEdit={documentsEditable(f.estado)} canViewRetired msg={msg}/><FlightLog key={`log-${id}`} flightId={id} revision={logRevision} msg={msg}/><AuditTimeline key={`audit-${id}-${logRevision}`} flightId={id}/><FlightRoute key={`route-${id}`} flightId={id} canReview msg={msg} onChanged={()=>{setRouteRevision(x=>x+1);setLogRevision(x=>x+1);done();}}/><FlightAircraft key={`aircraft-${id}-${detail.recursos?.aircraftId||0}`} flight={f} recursos={detail.recursos} done={done} msg={msg} reload={()=>load(id)}/><FlightCrew key={id} flightId={id} canManage state={f.estado} msg={msg}/><WeatherHistory key={id} flightId={id}/>{f.datosSanitarios&&<TransferContacts key={`tc-${id}`} flightId={id} mode="ops" msg={msg}/>}<Negotiation events={detail.negociacion}/><CommanderProposalResponse flight={f} events={detail.negociacion} done={done} msg={msg} reload={()=>load(id)}/><RequestEvaluation flight={f} events={detail.negociacion} call={call} reasons={reasons}/>{![ "EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO","RECHAZADO"].includes(f.estado)&&<div className="wide detail-actions"><h4>Cancelar vuelo</h4><CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom}/><button className="secondary-action" disabled={!reasonId||(reasons.find(x=>String(x.id)===String(reasonId))?.codigo==="OTRO"&&!custom.trim())} onClick={()=>call(`/flights/${id}/cancel`,{motivoCancelacionId:reasonId,motivoCancelacionPersonalizado:custom||null},"Vuelo cancelado")}>Cancelar vuelo</button></div>}{f.estado==="APROBADO"&&<div className="wide detail-actions"><h4>Asignación de recursos</h4><button onClick={resources}>Consultar disponibilidad</button>{aircraft.length>0&&<label>Aeronave<select value={a} onChange={e=>setA(e.target.value)}><option value="">Seleccionar</option>{aircraft.map(x=><option key={x.id} value={x.id}>{x.matricula} — {x.aeropuertoActual}</option>)}</select></label>}{commanders.length>0&&<label>Comandante<select value={c} onChange={e=>setC(e.target.value)}><option value="">Seleccionar</option>{commanders.map(x=><option key={x.id} value={x.id}>{x.nombre} {x.apellido} — {x.provinciaActual}</option>)}</select></label>}<button disabled={!a||!c} onClick={()=>call(`/flights/${id}/resources`,{aircraftId:a,comandanteId:c},"Recursos asignados")}>Confirmar asignación</button></div>}</>}</div></section></>;
}
export function Cmd({ d, done, msg }) {
 const [id,setId]=useState(""),[detail,setDetail]=useState(null),[origin,setOrigin]=useState(""),[destination,setDestination]=useState(""),[arrival,setArrival]=useState(""),[airports,setAirports]=useState([]),[weather,setWeather]=useState({condiciones:"",favorable:true,observaciones:""}),[weatherRevision,setWeatherRevision]=useState(0),[routeRevision,setRouteRevision]=useState(0);
 useEffect(()=>{let active=true;setDetail(null);setWeather({condiciones:"",favorable:true,observaciones:""});if(id)api(`/flights/${id}`).then(x=>{if(active)setDetail(adaptDetail(x));}).catch(e=>{if(active)msg(e.message,true);});return ()=>{active=false;};},[id]); const f=detail?.vuelo;
 useEffect(()=>{if(!f?.datosSanitarios){setAirports([]);return;}Promise.all([api(`/catalogs/airports?provinceId=${f.origen.provinciaId}`),api(`/catalogs/airports?provinceId=${f.destino.provinciaId}`)]).then(([o,de])=>setAirports([{kind:"o",items:o},{kind:"d",items:de}])).catch(e=>msg(e.message,true));},[f?.id]); const originOptions=airports.find(x=>x.kind==="o")?.items||[],destinationOptions=airports.find(x=>x.kind==="d")?.items||[];
 const save=async()=>{try{await api(`/flights/${id}/operational-planning`,{method:"POST",body:JSON.stringify({origenId:origin,destinoId:destination,llegada:arrival})});msg("Planificación operativa guardada");await done();setDetail(adaptDetail(await api(`/flights/${id}`)));setRouteRevision(x=>x+1);}catch(e){msg(e.message,true);}};
 const saveWeather=async()=>{try{await api(`/flights/${id}/weather`,{method:"POST",body:JSON.stringify(weather)});msg("Condiciones meteorológicas registradas");setWeather({condiciones:"",favorable:true,observaciones:""});setWeatherRevision(x=>x+1);}catch(e){msg(e.message,true);}};
 return <section className="card"><h2>Planificación operativa</h2><p className="hint">La salida definitiva proviene del flujo que corresponda y no es editable por el comandante.</p><div className="grid-form"><label>Vuelo<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar vuelo</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.codigo} — {x.estado}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>Salida fijada</h4><p>{dt(f.salida)}</p></div><div><h4>Aeronave</h4><p>{detail.recursos?.aircraftMatricula||"Sin asignar"}</p>{detail.recursos?.aircraftMatricula&&<small>{[detail.recursos.aircraftModelo,detail.recursos.aircraftTipo].filter(Boolean).join(" · ")}{detail.recursos.aircraftUbicacion?` · Ubicación: ${detail.recursos.aircraftUbicacion}`:""}</small>}</div></div><Urgency flight={f} detail/><CancellationNote flight={f}/><FlightClosure flight={f} cierre={detail.cierre}/><CommanderAssignment flight={f} done={done} msg={msg} reload={async()=>setDetail(adaptDetail(await api(`/flights/${id}`)))}/>{f.estado==="PLANIFICADO"&&<>{f.datosSanitarios&&<><label>Aeropuerto de origen<select value={origin} onChange={e=>setOrigin(e.target.value)}><option value="">Seleccionar ({f.origen.provincia})</option>{originOptions.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label>Aeropuerto de destino<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Seleccionar ({f.destino.provincia})</option>{destinationOptions.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label>Llegada planificada<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)}/></label><button disabled={!origin||!destination||!arrival} onClick={save}>Guardar planificación</button></>}<fieldset className="wide"><legend>Condiciones meteorológicas</legend><label>Condiciones<textarea required value={weather.condiciones} onChange={e=>setWeather({...weather,condiciones:e.target.value})}/></label><label>¿Condiciones favorables?<select value={String(weather.favorable)} onChange={e=>setWeather({...weather,favorable:e.target.value==="true"})}><option value="true">Sí</option><option value="false">No</option></select></label><label>Observaciones<textarea value={weather.observaciones} onChange={e=>setWeather({...weather,observaciones:e.target.value})}/></label><button type="button" disabled={!weather.condiciones.trim()} onClick={saveWeather}>Registrar clima</button></fieldset></>}<HangarInfo key={`hangar-${id}`} flightId={id} msg={msg}/><AirportCoordinations key={`airport-${id}-${routeRevision}`} flightId={id} msg={msg}/><FlightDocuments key={`documents-${id}`} flightId={id} canEdit={documentsEditable(f.estado)} canViewRetired msg={msg}/><FlightLog key={`log-${id}`} flightId={id} msg={msg}/><AuditTimeline key={`audit-${id}-${routeRevision}`} flightId={id}/><FlightRoute key={`route-${id}-${routeRevision}`} flightId={id} canEdit msg={msg}/><FlightCrew key={id} flightId={id} state={f.estado} msg={msg}/><WeatherHistory key={id} flightId={id} revision={weatherRevision}/><Negotiation events={detail.negociacion}/></>}</div></section>;
}
export function OperationalApp({ workspace="DTS", workspaces=[], changeWorkspace=()=>{} }) {
  const [session, setSession] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("vs-session"));
      } catch {
        return null;
      }
    }),
    [d, setD] = useState({
      flights: [],
      priorities: [],
      aircraft: [],
      airports: [],
      commanders: [],
      notifications: [],
      unread: 0,
    }),
    [note, setNote] = useState(""),
    [dark, setDark] = useState(false),
    [view, setView] = useState(() => (location.hash === "#/mi-cuenta" ? "account" : "panel"));
  const go = (target) => { setView(target); history.replaceState(null, "", target === "account" ? "#/mi-cuenta" : location.pathname + location.search); };
  let has = (x) => session?.roles.includes(x);
  let load = async () => {
    try {
      let calls = [
        api("/flights"),
        api("/catalogs/priorities"),
        api("/catalogs/aircraft"),
        api("/catalogs/airports"),
        api("/notifications"),
      ];
      if (has("OPERACIONES") || has("CENTRO_OPERACIONES") || has("ADMINISTRADOR")) calls.push(api("/auth/users/commanders"));
      let [a, c, e, f, n, u = []] = await Promise.all(calls);
      setD({
        flights: a.map(adaptFlight),
        priorities: c,
        aircraft: e,
        airports: f,
        notifications: n.items || n.content || [],
        unread: n.unread ?? (n.items || n.content || []).filter((x) => !x.leido).length,
        commanders: u,
      });
    } catch (x) {
      setNote(x.message);
    }
  };
  useEffect(() => {
    if (session) load();
  }, [session]);
  useEffect(() => {
    document.body.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  if (!session) return <Login set={setSession} />;
  let msg = (x, bad) => setNote((bad ? "" : "✓ ") + x);
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          ✈{" "}
          <span>
            Vuelos
            <br />
            Sanitarios
          </span>
        </div>
        <nav>
          <a className={view === "panel" ? "active" : ""} onClick={() => go("panel")}>{workspace === "DTS" ? "Dirección de Tránsito Sanitario" : workspace === "COMANDANTE" ? "Comandante" : "Centro de Operaciones"}</a>
          <a>Vuelos</a>
          <a>Notificaciones</a>
          <a className={view === "account" ? "active" : ""} onClick={() => go("account")}>Mi cuenta</a>
        </nav>
        <button
          className="secondary"
          onClick={() => {
            localStorage.removeItem("vs-token");
            localStorage.removeItem("vs-session");
            setSession(null);
          }}
        >
          Cerrar sesión
        </button>
      </aside>
      <main className="content">
        <header>
          <div>
            <p className="eyebrow">PANEL PRINCIPAL</p>
            <h1>Hola, {session.username}</h1>
          </div>
          <div className="header-actions">
            {workspaces.length>1&&<button className="secondary-action" onClick={()=>changeWorkspace(null)}>Cambiar área</button>}
            <button className="icon" onClick={() => setDark(!dark)}>
              {dark ? "☀" : "◐"}
            </button>
            <button className="icon">🔔 {d.unread}</button>
          </div>
        </header>
        {note && (
          <p className={note.startsWith("✓") ? "success" : "error"}>{note}</p>
        )}
        {view === "account" && <MyContacts notify={msg} />}
        {view === "panel" && <>
        <section className="metrics">
          <article>
            <span>Solicitudes</span>
            <strong>{d.flights.length}</strong>
          </article>
          <article>
            <span>Planificados</span>
            <strong>
              {d.flights.filter((x) => x.estado === "PLANIFICADO").length}
            </strong>
          </article>
          <article>
            <span>En curso</span>
            <strong>
              {d.flights.filter((x) => x.estado === "EN_CURSO").length}
            </strong>
          </article>
        </section>
        {workspace==="DTS" && <><DTS d={d} done={load} msg={msg} /><DtsResponses d={d} done={load} msg={msg} /></>}{" "}
        {workspace==="OPERACIONES" && (
          <>
            <Ops d={d} done={load} msg={msg} />
            <OperationsReports msg={msg} />
          </>
        )}{" "}
        {workspace==="COMANDANTE" && (
          <>
            <CommanderReports msg={msg} renderLog={(flightId) => <FlightLog flightId={flightId} allowWrite={false} msg={msg} />} />
            <Cmd d={d} done={load} msg={msg} />
          </>
        )}
        <section className="card">
          <div className="section-title">
            <h2>Vuelos visibles</h2>
            <button onClick={load}>Actualizar</button>
          </div>
          {d.flights.length ? (
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Motivo</th>
                  <th>Prioridad / fecha</th>
                  <th>Trayecto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {d.flights.map((x) => (
                  <tr
                    className={x.extremaUrgencia ? "urgent-row" : ""}
                    key={x.id}
                  >
                    <td>{x.codigo}</td>
                    <td>{x.tipo?.nombre || x.tipo?.codigo || "—"}</td>
                    <td>{x.motivoVuelo}</td>
                    <td>{x.datosSanitarios ? <><Urgency flight={x} /><small>{x.prioridad} · {dt(x.solicitada)}</small></> : "—"}</td>
                    <td>
                      {locationLabel(x.origen)} → {locationLabel(x.destino)}
                    </td>
                    <td>
                      <span className={s(x.estado)}>{x.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No hay vuelos para mostrar.</p>
          )}
        </section>
        <NotificationsPanel items={d.notifications} unread={d.unread} msg={msg} reload={load} />
        {d.notifications.some((n) => n.tipo.includes("EXTREME_URGENCY")) && (
          <section className="card notifications">
            <h2>Alertas de extrema urgencia</h2>
            {d.notifications
              .filter((n) => n.tipo.includes("EXTREME_URGENCY"))
              .map((n) => (
                <p className="urgency-detail" key={n.id}>
                  ⚠ <strong>EXTREMA URGENCIA</strong> — {n.mensaje}
                </p>
              ))}
          </section>
        )}
        </>}
      </main>
    </div>
  );
}
function MyAccount({ user, notify, onPasswordChanged }) {
  const [password, setPassword] = useState({ passwordActual: "", nuevaPassword: "", confirmacionPassword: "" });
  return <><MyContacts notify={notify} /><section className="card"><h2>Seguridad de la cuenta</h2><p>{user.nombre} {user.apellido} · usuario {user.username}</p>
    <h3>Cambiar contraseña</h3><form className="grid-form" onSubmit={async e=>{e.preventDefault();try{await api("/auth/me/password",{method:"POST",body:JSON.stringify(password)});if(onPasswordChanged)onPasswordChanged();else notify("Contraseña actualizada");}catch(x){notify(x.message,true);}}}>{[["passwordActual","Contraseña actual"],["nuevaPassword","Nueva contraseña"],["confirmacionPassword","Confirmar contraseña"]].map(([key,label])=><label key={key}>{label}<input type="password" required value={password[key]} onChange={e=>setPassword({...password,[key]:e.target.value})}/></label>)}<button>Actualizar contraseña</button></form>
  </section></>;
}
function PasswordRequired({ setSession }) {
 const [form,setForm]=useState({passwordActual:"",nuevaPassword:"",confirmacionPassword:""}),[error,setError]=useState("");
 return <main className="login"><section><p className="eyebrow">SEGURIDAD DE LA CUENTA</p><h1>Actualizá tu contraseña</h1><p>La contraseña temporal sólo permite este cambio antes de continuar.</p></section><form onSubmit={async e=>{e.preventDefault();try{await api("/auth/me/password",{method:"POST",body:JSON.stringify(form)});localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}catch(x){setError(x.message);}}}><h2>Nueva contraseña</h2>{error&&<p className="error">{error}</p>}{[["passwordActual","Contraseña temporal"],["nuevaPassword","Nueva contraseña"],["confirmacionPassword","Confirmar contraseña"]].map(([key,label])=><label key={key}>{label}<input type="password" required value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<button>Guardar y volver a ingresar</button></form></main>;
}
export function AdminUsers({ users, provinces = [], reload, notify, active = true, createOpen, onCreateOpenChange, showList = true }) {
 const emptyForm=()=>({nombre:"",apellido:"",dni:"",fechaNacimiento:"",licenciaAeronautica:"",roles:[],correos:[{direccion:"",tipo:"PERSONAL"}],telefonos:[{numero:"",pais:DEFAULT_COUNTRY,tipo:"PERSONAL"}]});
 const [query,setQuery]=useState(""),[role,setRole]=useState(""),[localOpen,setLocalOpen]=useState(false),[activationCode,setActivationCode]=useState(""),[reactivation,setReactivation]=useState(null),[reactivating,setReactivating]=useState(null),[form,setForm]=useState(emptyForm);
 const allRoles=["ADMINISTRADOR","DTS","CENTRO_OPERACIONES","COMANDANTE"];
 const open=createOpen===undefined?localOpen:createOpen;
 const setOpen=(value)=>{if(createOpen===undefined)setLocalOpen(value);else onCreateOpenChange?.(value);};
 useEffect(()=>{if(createOpen)setForm(emptyForm());},[createOpen]);
 const toggle=(r)=>setForm({...form,roles:form.roles.includes(r)?form.roles.filter(x=>x!==r):[...form.roles,r]});
 const openNewUser=()=>{setForm(emptyForm());setOpen(true);};
 const closeNewUser=()=>{setForm(emptyForm());setOpen(false);};
 const dismissCode=()=>setActivationCode("");
 const receiveActivationCode=(result)=>{if(!result?.codigo)throw new Error("El servidor no devolvió el código de activación. Regeneralo antes de continuar.");setActivationCode(result.codigo);};
 const openReactivate=x=>setReactivating({id:x.id,username:x.username,nombre:x.nombre,apellido:x.apellido,fechaNacimiento:"",licenciaAeronautica:"",roles:[...(x.roles||[])]});
 const reactivate=async e=>{e.preventDefault();const x=reactivating;try{const result=await api(`/auth/users/${x.id}/reactivate`,{method:"PATCH",body:JSON.stringify({...x,fechaNacimiento:x.fechaNacimiento||null})});setReactivating(null);setReactivation({username:x.username,password:result.contrasenaTemporal});await reload();notify("Usuario reactivado. Guardá la contraseña temporal antes de cerrar este aviso.");}catch(error){notify(error.message,true);}};
 const create=async e=>{e.preventDefault();const contactProblem=emailProblem(form.correos[0].direccion)||phoneProblem(form.telefonos[0].numero,form.telefonos[0].pais);if(contactProblem){notify(contactProblem,true);return;}try{const r=await api("/auth/users",{method:"POST",body:JSON.stringify({...form,fechaNacimiento:form.fechaNacimiento||null})});receiveActivationCode(r);closeNewUser();await reload();notify("Cuenta pendiente creada. Guardá el código de activación antes de continuar.");}catch(x){if(x.code==="PERSON_EXISTS_WITHOUT_ACCOUNT"&&x.personaId){if(x.coincideNombre&&confirm("Ya existe una persona registrada con ese DNI y el mismo nombre, sin cuenta en el sistema. ¿Asociar la nueva cuenta a esa identidad existente? No se creará una persona nueva.")){try{const r2=await api("/auth/users",{method:"POST",body:JSON.stringify({...form,fechaNacimiento:form.fechaNacimiento||null,personaExistenteId:x.personaId})});receiveActivationCode(r2);closeNewUser();await reload();notify("Cuenta pendiente creada y asociada a la identidad existente. Guardá el código de activación antes de continuar.");}catch(y){notify(y.message,true);}return;}notify(x.coincideNombre?x.message:"Ya existe una persona con ese DNI pero con un nombre distinto; verifique los datos antes de continuar.",true);return;}if(x.code==="INACTIVE_USER_WITH_DNI_EXISTS"&&x.userId){const existing=users.find(u=>u.id===x.userId)||{id:x.userId,username:x.username,nombre:x.nombre,apellido:x.apellido,roles:[]};closeNewUser();if(existing&&confirm(`${x.message}\n\n${existing.nombre} ${existing.apellido} · ${existing.username||"sin usuario"}\n\n¿Revisar y reactivar la cuenta existente?`)){openReactivate(existing);return;}}notify(x.message,true);}};
 const shown=users.filter(x=>(active?x.activo!==false:x.activo===false)&&(!query||`${x.nombre} ${x.apellido} ${x.dni} ${x.username||""}`.toLowerCase().includes(query.toLowerCase()))&&(!role||(x.roles||[]).includes(role)));
 const setCommanderProvince=async(x,id)=>{try{await api(`/catalogs/commanders/${x.id}/location`,{method:"POST",body:JSON.stringify({locationId:id})});await reload();notify("Ubicación del comandante actualizada");}catch(e){notify(e.message,true);}};
 return <>{activationCode&&<div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true" aria-labelledby="activation-code-title"><p className="eyebrow">CUENTA PENDIENTE CREADA</p><h2 id="activation-code-title">Código de activación</h2><p>Este código se mostrará una sola vez. Guardalo antes de cerrar este aviso.</p><code>{activationCode}</code><div className="form-actions"><button onClick={()=>navigator.clipboard?.writeText(activationCode)}>Copiar</button><button className="secondary-action" onClick={dismissCode}>Cerrar aviso</button></div></section></div>}{reactivating&&<div className="activation-modal-backdrop" role="presentation"><form className="activation-modal grid-form" onSubmit={reactivate}><p className="eyebrow">REACTIVAR USUARIO</p><h2>Revisar cuenta existente</h2><p>Se conserva el DNI y todo el historial. Podés actualizar los datos administrativos antes de continuar.</p><label>Nombre<input required value={reactivating.nombre} onChange={e=>setReactivating({...reactivating,nombre:e.target.value})}/></label><label>Apellido<input required value={reactivating.apellido} onChange={e=>setReactivating({...reactivating,apellido:e.target.value})}/></label><label>Fecha de nacimiento<input type="date" value={reactivating.fechaNacimiento} onChange={e=>setReactivating({...reactivating,fechaNacimiento:e.target.value})}/></label><fieldset><legend>Roles</legend>{allRoles.map(r=><label className="check" key={r}><input type="checkbox" checked={reactivating.roles.includes(r)} onChange={()=>setReactivating({...reactivating,roles:reactivating.roles.includes(r)?reactivating.roles.filter(x=>x!==r):[...reactivating.roles,r]})}/>{r}</label>)}</fieldset>{reactivating.roles.includes("COMANDANTE")&&<label>Licencia aeronáutica<input value={reactivating.licenciaAeronautica} onChange={e=>setReactivating({...reactivating,licenciaAeronautica:e.target.value})}/></label>}<div className="form-actions"><button>Reactivar y generar contraseña</button><button type="button" className="secondary-action" onClick={()=>setReactivating(null)}>Cancelar</button></div></form></div>}{reactivation&&<div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true"><p className="eyebrow">USUARIO REACTIVADO</p><h2>Contraseña temporal</h2><p>Usuario: <strong>{reactivation.username}</strong>. Esta contraseña se muestra una única vez; deberá cambiarla al iniciar sesión.</p><code>{reactivation.password}</code><div className="form-actions"><button onClick={()=>navigator.clipboard?.writeText(reactivation.password)}>Copiar</button><button className="secondary-action" onClick={()=>setReactivation(null)}>Cerrar aviso</button></div></section></div>}{open&&<div className="activation-modal-backdrop" role="presentation"><form className="activation-modal grid-form" onSubmit={create}><p className="eyebrow wide">ADMINISTRACIÓN</p><h2 className="wide">Añadir usuario</h2><label>Nombre<input required value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/></label><label>Apellido<input required value={form.apellido} onChange={e=>setForm({...form,apellido:e.target.value})}/></label><label>DNI<input required value={form.dni} onChange={e=>setForm({...form,dni:e.target.value})}/></label><label>Fecha de nacimiento<input type="date" value={form.fechaNacimiento} onChange={e=>setForm({...form,fechaNacimiento:e.target.value})}/></label><label>Correo principal<input type="email" required value={form.correos[0].direccion} onChange={e=>setForm({...form,correos:[{direccion:e.target.value,tipo:"PERSONAL"}]})}/></label><div className="wide admin-phone"><PhoneField label="Teléfono principal" idPrefix="alta-telefono" value={{pais:form.telefonos[0].pais,numero:form.telefonos[0].numero}} onChange={v=>setForm({...form,telefonos:[{numero:v.numero,pais:v.pais,tipo:"PERSONAL"}]})}/><small className="hint">El correo se verifica después, desde "Mi cuenta" de la persona; el teléfono se valida con las reglas del país elegido.</small></div><fieldset className="wide"><legend>Roles</legend>{allRoles.map(r=><label className="check" key={r}><input type="checkbox" checked={form.roles.includes(r)} onChange={()=>toggle(r)}/>{r}</label>)}</fieldset>{form.roles.includes("COMANDANTE")&&<label>Número de licencia<input required value={form.licenciaAeronautica} onChange={e=>setForm({...form,licenciaAeronautica:e.target.value})}/></label>}<div className="wide form-actions"><button>Crear cuenta pendiente</button><button type="button" className="secondary-action" onClick={closeNewUser}>Cancelar</button></div></form></div>}{showList&&<section className="card"><div className="section-title"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>{active?"Usuarios activos":"Usuarios desactivados"}</h1><p>{shown.length} {active?"cuentas activas o pendientes de activación":"cuentas dadas de baja"}</p></div>{active&&<button onClick={openNewUser}>Nuevo usuario</button>}</div><div className="filters"><input placeholder="Buscar por nombre, DNI o usuario" value={query} onChange={e=>setQuery(e.target.value)}/><select value={role} onChange={e=>setRole(e.target.value)}><option value="">Todos los roles</option>{allRoles.map(x=><option key={x}>{x}</option>)}</select></div>{shown.length?<table><thead><tr><th>Nombre</th><th>Apellido</th><th>DNI</th><th>Usuario</th><th>Rol</th><th>Ubicación actual</th>{!active&&<th>Fecha de baja</th>}<th>Acciones</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td>{x.nombre}</td><td>{x.apellido}</td><td>{x.dni}</td><td>{x.username||"—"}</td><td>{(x.roles||[]).join(", ")}</td><td>{(x.roles||[]).includes("COMANDANTE")?(active?<select aria-label={`Ubicación de ${x.nombre}`} value="" onChange={e=>e.target.value&&setCommanderProvince(x,e.target.value)}><option value="">{x.provinciaActual||"Sin configurar"}</option>{provinces.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select>:(x.provinciaActual||"Sin configurar")):"—"}</td>{!active&&<td>{dt(x.fechaBaja)}</td>}<td>{active&&x.estado==="PENDIENTE_ACTIVACION"&&<button onClick={async()=>{try{receiveActivationCode(await api(`/auth/users/${x.id}/activation-code`,{method:"POST"}));reload();}catch(e){notify(e.message,true)}}}>Regenerar código</button>}{active&&x.username&&<button className="secondary-action" onClick={async()=>{if(!confirm(`¿Desactivar usuario? ${x.nombre} ${x.apellido} conservará su historial.`))return;try{await api(`/auth/users/${x.id}/deactivate`,{method:"PATCH",body:JSON.stringify({})});await reload();notify("Usuario desactivado");}catch(e){notify(e.message,true)}}}>Desactivar</button>}{!active&&x.username&&<button className="secondary-action" onClick={()=>openReactivate(x)}>Reactivar</button>}</td></tr>)}</tbody></table>:<p className="empty">No hay usuarios {active?"activos":"desactivados"} para mostrar.</p>}</section>}</>;
}
export function AdminCrewQualifications({users:given,notify}) {
 const [id,setId]=useState(""),[rows,setRows]=useState([]),[error,setError]=useState(""),[term,setTerm]=useState(""),[found,setFound]=useState([]); const users=given||found;
 useEffect(()=>{if(given)return undefined;let on=true;const t=setTimeout(()=>{api(`/auth/users/search?status=ACTIVOS&size=20&q=${encodeURIComponent(term)}`).then(p=>{if(on)setFound((p?.items||[]).filter(u=>u.username));}).catch(()=>{if(on)setFound([]);});},250);return()=>{on=false;clearTimeout(t);};},[term,given]);
 const load=async userId=>{if(!userId){setRows([]);return;}try{setRows(await api(`/crew-qualifications/${userId}`));setError("");}catch(e){setError(e.message);}};
 useEffect(()=>{load(id);},[id]);
 const toggle=async code=>{const present=rows.some(x=>x.crewRoleCode===code);try{await api(`/crew-qualifications/${id}/${code}`,{method:present?"DELETE":"PUT"});await load(id);notify("Clasificación de tripulación actualizada");}catch(e){setError(e.message);}};
 return <section className="card"><h2>Clasificación administrativa de tripulación</h2><p>La clasificación funcional es independiente de la habilitación profesional y de los roles de acceso. La revisión de credenciales es manual.</p>{!given&&<label>Buscar usuario<input value={term} placeholder="Nombre, apellido, DNI o usuario" onChange={e=>setTerm(e.target.value)}/></label>}<label>Usuario<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar usuario</option>{users.map(u=><option key={u.id} value={u.id}>{u.nombre} {u.apellido} ({u.username||"cuenta pendiente"})</option>)}</select></label>{error&&<p role="alert">{error}</p>}{id&&[["COMANDANTE","Comandante"],["COPILOTO","Copiloto"],["MEDICO","Médico"],["ENFERMERO","Enfermero"]].map(([code,label])=><label className="check" key={code}><input type="checkbox" checked={rows.some(x=>x.crewRoleCode===code)} onChange={()=>toggle(code)}/>{label}</label>)}{id&&<ProfessionalCredentials key={id} userId={id} notify={notify}/>}</section>;
}
export function ProfessionalCredentials({userId,notify}) {
 const empty={roleCode:"MEDICO",type:"",number:"",issuer:"",issued:"",expires:"",noExpiry:false,notes:""};
 const [items,setItems]=useState([]),[form,setForm]=useState(empty),[selected,setSelected]=useState(""),[file,setFile]=useState(null),[decision,setDecision]=useState(""),[confirmReview,setConfirmReview]=useState(false),[history,setHistory]=useState([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const load=async()=>{setItems(await api(`/users/${userId}/professional-credentials`));};
 useEffect(()=>{load().catch(e=>setError(e.message));},[userId]);
 const run=async(fn)=>{setBusy(true);try{await fn();setError("");await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const save=()=>run(async()=>{const payload={...form,issued:form.issued||null,expires:form.expires||null};const saved=await api(selected?`/professional-credentials/${selected}`:`/users/${userId}/professional-credentials`,{method:selected?"PUT":"POST",body:JSON.stringify(payload)});setSelected(String(saved.id));notify("Habilitación guardada; requiere revisión manual");});
 const choose=c=>{setSelected(String(c.id));setForm({roleCode:c.roleCode,type:c.type,number:c.number,issuer:c.issuer,issued:c.issued||"",expires:c.expires||"",noExpiry:c.noExpiry,notes:c.notes||""});setHistory([]);setFile(null);};
 const download=async(d)=>{try{const blob=await credentialFile(`/professional-credential-documents/${d.id}`);const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=d.name;a.click();URL.revokeObjectURL(url);}catch(e){setError(e.message);}};
 const current=items.find(c=>String(c.id)===selected);
 return <div className="wide"><h3>Habilitaciones profesionales</h3><p>La verificación es una revisión manual documentada; no se consulta automáticamente ninguna autoridad. Sin clasificación y credencial verificada y vigente no se habilitan nuevas asignaciones.</p>{error&&<p role="alert">{error}</p>}<ul>{items.length?items.map(c=><li key={c.id}><button type="button" className="secondary-action" onClick={()=>choose(c)}>{c.roleCode} — {c.type} — {c.number}</button> {c.status} {c.current?"vigente":"no habilitada"} · Vence: {c.expires||(c.noExpiry?"sin vencimiento declarado":"vencimiento no informado")}</li>):<li>Sin habilitaciones registradas</li>}</ul><button type="button" onClick={()=>{setSelected("");setForm(empty);setHistory([]);}}>Nueva habilitación</button><div className="grid-form"><label>Función profesional<select value={form.roleCode} onChange={e=>setForm({...form,roleCode:e.target.value})}><option value="COMANDANTE">Comandante</option><option value="COPILOTO">Copiloto</option><option value="MEDICO">Médico</option><option value="ENFERMERO">Enfermero</option></select></label><label>Tipo de habilitación<input value={form.type} onChange={e=>setForm({...form,type:e.target.value})}/></label><label>Número de licencia o matrícula<input value={form.number} onChange={e=>setForm({...form,number:e.target.value})}/></label><label>Organismo emisor<input value={form.issuer} onChange={e=>setForm({...form,issuer:e.target.value})}/></label><label>Fecha de emisión<input type="date" value={form.issued} onChange={e=>setForm({...form,issued:e.target.value})}/></label><label>Fecha de vencimiento<input type="date" value={form.expires} onChange={e=>setForm({...form,expires:e.target.value})}/></label><label className="check"><input type="checkbox" checked={form.noExpiry} onChange={e=>setForm({...form,noExpiry:e.target.checked,expires:e.target.checked?"":form.expires})}/>El vencimiento no aplica a esta credencial</label><label>Observaciones<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><button type="button" disabled={busy||!form.type.trim()||!form.number.trim()||!form.issuer.trim()} onClick={save}>Guardar habilitación</button></div>{current&&<><p>Estado: {current.status} · Verificador: {current.verifier||"—"} · Fecha: {dt(current.verifiedAt)}</p><p>Modificar los datos o incorporar documentación requiere una nueva revisión.</p><label>Documento PDF<input type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files[0]||null)}/></label><button type="button" disabled={!file||busy} onClick={()=>run(async()=>{await credentialFile(`/professional-credentials/${selected}/documents`,file);setFile(null);notify("Documento incorporado");})}>Adjuntar documento</button><ul>{current.documents.map(d=><li key={d.id}><button type="button" onClick={()=>download(d)}>Descargar {d.name}</button> · {d.uploader} · {dt(d.uploadedAt)}</li>)}</ul><label>Justificación de la revisión<textarea value={decision} onChange={e=>setDecision(e.target.value)}/></label><label className="check"><input type="checkbox" checked={confirmReview} onChange={e=>setConfirmReview(e.target.checked)}/>Confirmo la revisión manual y que la documentación acredita la función indicada</label>{[["VERIFICADA","Verificar manualmente"],["RECHAZADA","Rechazar"],["REVOCADA","Revocar verificación"]].map(([code,label])=><button type="button" key={code} disabled={busy||!decision.trim()||(code==="VERIFICADA"&&!confirmReview)||(code==="REVOCADA"&&current.status!=="VERIFICADA")} onClick={()=>run(async()=>{await api(`/professional-credentials/${selected}/decision/${code}`,{method:"POST",body:JSON.stringify({notes:decision,confirmsSufficiency:confirmReview})});setDecision("");setConfirmReview(false);notify("Revisión registrada");})}>{label}</button>)}<button type="button" onClick={()=>run(async()=>setHistory(await api(`/professional-credentials/${selected}/history`)))}>Consultar historial</button><ul>{history.map(h=><li key={h.id}>{dt(h.at)} · {h.actor} · {h.operation} · {h.before||"—"} → {h.after||"—"}</li>)}</ul></>}</div>;
}
function AdminDashboard({ users, counts, aircraft, onAddUser, onAddAircraft }) {
 const userItems=Array.isArray(users)?users:[], aircraftItems=Array.isArray(aircraft)?aircraft:[];
 const activeUsers=counts?counts.activos+counts.pendientes:userItems.filter(x=>x.activo!==false).length, inactiveUsers=counts?counts.inactivos:userItems.filter(x=>x.activo===false).length, activeAircraft=aircraftItems.filter(x=>x.activo).length;
 return <><section className="card admin-welcome"><p className="eyebrow">ADMINISTRACIÓN</p><h2>Panel de administración</h2><p className="hint">Accesos rápidos y un resumen del estado operativo.</p><div className="quick-actions"><button className="quick-action" onClick={onAddUser}><span aria-hidden="true">＋</span><strong>Añadir usuario</strong><small>Crear una cuenta y emitir su código de activación.</small></button><button className="quick-action" onClick={onAddAircraft}><span aria-hidden="true">＋</span><strong>Añadir aeronave</strong><small>Registrar capacidad, ubicación y estado operativo.</small></button></div></section><section className="metrics admin-metrics"><article><span>Usuarios activos</span><strong>{activeUsers}</strong></article><article><span>Usuarios desactivados</span><strong>{inactiveUsers}</strong></article><article><span>Aeronaves activas</span><strong>{activeAircraft}</strong></article></section></>;
}
export function WorkspaceSelector({workspaces,select}){return <main className="login"><section><p className="eyebrow">ÁREAS HABILITADAS</p><h1>Seleccione el área de trabajo</h1></section><div className="card">{workspaces.map(x=><button key={x.id} onClick={()=>select(x.id)}>{x.label}</button>)}</div></main>;}
export function AdminApp() {
 const hashPage=()=>location.hash==="#/admin/aeronaves"?"aircraft":location.hash==="#/admin/geografia"?"geography":location.hash==="#/admin/pacientes"?"patients":location.hash==="#/admin/auditoria"?"audit":location.hash==="#/admin/mi-cuenta"?"account":location.hash==="#/admin/usuarios"?"users":location.hash==="#/admin/usuarios/desactivados"?"users-inactive":"dashboard";
 const [session,setSession]=useState(()=>{try{return JSON.parse(localStorage.getItem("vs-session"));}catch{return null;}}),[counts,setCounts]=useState(null),[me,setMe]=useState(null),[aircraft,setAircraft]=useState([]),[airports,setAirports]=useState([]),[provinces,setProvinces]=useState([]),[page,setPage]=useState(hashPage),[note,setNote]=useState(""),[dark,setDark]=useState(()=>localStorage.getItem("vs-theme")==="dark"),[workspace,setWorkspace]=useState(null),[userCreateOpen,setUserCreateOpen]=useState(false),[aircraftCreateOpen,setAircraftCreateOpen]=useState(false);
 const load=async()=>{
  // Cada recurso se carga por separado: una falla en aeronaves o catálogos no debe vaciar la gestión de usuarios.
  const sources=[["resumen de usuarios","/auth/users/summary",setCounts,false],["mi cuenta","/auth/me",setMe,false],["aeronaves","/catalogs/aircraft/admin",setAircraft,true],["aeropuertos","/catalogs/airports",setAirports,true],["provincias","/catalogs/provinces",setProvinces,true]];
  const results=await Promise.allSettled(sources.map(([, path])=>api(path)));
  const failed=[];
  results.forEach((result,i)=>{const [label,,apply,isList]=sources[i];if(result.status==="fulfilled")apply(isList&&!Array.isArray(result.value)?[]:result.value);else failed.push(`${label}: ${result.reason?.message||"error"}`);});
  setNote(failed.length?`No se pudo cargar ${failed.join(" · ")}`:"");
 };
 const workspaces=workspaceForRoles(session?.roles); const active=workspace||(workspaces.length===1?workspaces[0].id:null);
 useEffect(()=>{if(session&&!session.debeCambiarContrasena&&active==="ADMIN")load();},[session,active]); useEffect(()=>{document.documentElement.dataset.theme=dark?"dark":"light";document.body.dataset.theme=dark?"dark":"light";localStorage.setItem("vs-theme",dark?"dark":"light");},[dark]);
 if(!session)return <Login set={setSession}/>; if(session.debeCambiarContrasena)return <PasswordRequired setSession={setSession}/>; if(workspaces.length>1&&!active)return <WorkspaceSelector workspaces={workspaces} select={setWorkspace}/>; if(active!=="ADMIN")return <OperationalApp workspace={active} workspaces={workspaces} changeWorkspace={setWorkspace}/>;
 const nav=(target)=>{setPage(target);history.replaceState(null,"",target==="account"?"#/admin/mi-cuenta":target==="aircraft"?"#/admin/aeronaves":target==="geography"?"#/admin/geografia":target==="patients"?"#/admin/pacientes":target==="audit"?"#/admin/auditoria":target==="users"?"#/admin/usuarios":target==="users-inactive"?"#/admin/usuarios/desactivados":"#/admin");}; const notify=(text,bad)=>setNote((bad?"":"✓ ")+text);
 const title=page==="users"?"Usuarios activos":page==="users-inactive"?"Usuarios desactivados":page==="aircraft"?"Aeronaves":page==="geography"?"Geografía":page==="patients"?"Pacientes":page==="audit"?"Auditoría":page==="account"?"Mi cuenta":"Dashboard";
 return <div className="shell admin-shell"><aside><div className="brand">✈ <span>Vuelos<br/>Sanitarios</span></div><nav><a className={page==="dashboard"?"active":""} onClick={()=>nav("dashboard")}>Dashboard</a><a className={page==="users"||page==="users-inactive"?"active":""} onClick={()=>nav("users")}>Usuarios</a><a className={page==="aircraft"?"active":""} onClick={()=>nav("aircraft")}>Aeronaves</a><a className={page==="geography"?"active":""} onClick={()=>nav("geography")}>Geografía</a><a className={page==="patients"?"active":""} onClick={()=>nav("patients")}>Pacientes</a><a className={page==="audit"?"active":""} onClick={()=>nav("audit")}>Auditoría</a><a className={page==="account"?"active":""} onClick={()=>nav("account")}>Mi cuenta</a></nav><button className="secondary" onClick={()=>{localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}}>Cerrar sesión</button></aside><main className="content"><header><div><p className="eyebrow">PANEL ADMINISTRADOR</p><h1>{title}</h1></div>{workspaces.length>1&&<button className="secondary-action" onClick={()=>setWorkspace(null)}>Cambiar área</button>}<button className="icon" onClick={()=>setDark(!dark)} aria-label="Cambiar tema">{dark?"☀":"◐"}</button></header>{note&&<p className={note.startsWith("✓")?"success":"error"}>{note}</p>}{page==="dashboard"&&<><AdminDashboard counts={counts} aircraft={aircraft} onAddUser={()=>setUserCreateOpen(true)} onAddAircraft={()=>setAircraftCreateOpen(true)}/><AdminUsers users={[]} provinces={provinces} reload={load} notify={notify} showList={false} createOpen={userCreateOpen} onCreateOpenChange={setUserCreateOpen}/><AdminAircraft items={aircraft} airports={airports} reload={load} notify={notify} showList={false} createOpen={aircraftCreateOpen} onCreateOpenChange={setAircraftCreateOpen}/></>}{(page==="users"||page==="users-inactive")&&<><div className="user-tabs"><button className={page==="users"?"selected-tab":"secondary-action"} onClick={()=>nav("users")}>Usuarios activos</button><button className={page==="users-inactive"?"selected-tab":"secondary-action"} onClick={()=>nav("users-inactive")}>Usuarios desactivados</button></div><AdminUsers users={[]} provinces={provinces} reload={load} notify={notify} showList={false} createOpen={userCreateOpen} onCreateOpenChange={setUserCreateOpen}/><UserDirectory active={page==="users"} notify={notify} onChanged={load} onCreate={()=>setUserCreateOpen(true)} reloadToken={counts?`${counts.activos}-${counts.pendientes}-${counts.inactivos}`:0}/>{page==="users"&&<AdminCrewQualifications notify={notify}/>}</>} {page==="audit"&&<AdminAudit/>}{page==="patients"&&<PatientMaintenance notify={notify}/>} {page==="aircraft"&&<AdminAircraft items={aircraft} airports={airports} reload={load} notify={notify}/>} {page==="geography"&&<GeographicCatalog notify={notify}/>} {page==="account"&&me&&<MyAccount user={me} reload={load} notify={notify} onPasswordChanged={()=>{localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}}/>}</main></div>;
}
const root=document.getElementById("root");
if(root)createRoot(root).render(<AdminApp />);
