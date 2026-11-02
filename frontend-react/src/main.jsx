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
import { ProfessionalCredentials, CredentialPolicies } from "./credentials";
export { ProfessionalCredentials };
import { DEFAULT_COUNTRY, emailProblem, phoneProblem } from "./contactRules";
import { CrewContacts } from "./crewContacts";
import { FlightDocuments, documentsEditable } from "./documents";
import { FlightRoute, RouteReviewQueue, ROUTE_STATE_LABEL } from "./flightRoute";
import { RequestInbox, InboxCounters, inboxSections, INBOX_REFRESH_MS } from "./requestInbox";
import { openProposal, CancellationFields, NegotiationPanel, NegotiationHistory, RequestSummary } from "./negotiation";
import { flightStage, visibleSections } from "./flightStages";
import { ResourceAssignment } from "./resourceAssignment";
import { AirportPlanning, CommanderAirportPlanning } from "./airportPlanning";
import { CommanderLocations } from "./commanderLocations";
import { PendingCommanders, UserRequirements } from "./crewRequirements";
export { openProposal };
import { TransferContactFields, TransferContacts, contactsPayload, rowsProblem } from "./transferContacts";
export { AdminAircraft, FlightDocuments, FlightRoute };
import "./styles.css";
const s = (s) => `status status-${s?.toLowerCase()}`;
export const adaptFlight = (flight) => {
  const sanitary = flight?.datosSanitarios;
  return { ...flight, estado: flight?.estadoVuelo || sanitary?.estadoSolicitud || "SIN_ESTADO", prioridad: sanitary?.prioridad || "—", solicitada: sanitary?.fechaSolicitada || null, recibida: sanitary?.fechaRecepcion || null, extremaUrgencia: Boolean(sanitary?.extremaUrgencia), justificacionExtremaUrgencia: sanitary?.justificacionExtremaUrgencia, fechaLimiteTraslado: sanitary?.fechaLimiteTraslado, origen: sanitary?.localidadOrigenSolicitada || flight?.origenDetalle || flight?.origen, destino: sanitary?.localidadDestinoSolicitada || flight?.destinoDetalle || flight?.destino };
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
          <label>Código de activación<input aria-label="Código de activación" required inputMode="numeric" autoComplete="one-time-code" value={form.codigo} onChange={(x) => change("codigo", x.target.value)} aria-describedby="activation-code-hint" /><small id="activation-code-hint" className="hint">Los códigos nuevos tienen 6 dígitos, vencen en 10 minutos y se usan una sola vez. Si recibiste uno alfanumérico antes de esta actualización, podés usarlo hasta su vencimiento.</small></label>
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
 const idRef=useRef(id);idRef.current=id; const latest=useRef(0); /* siempre la solicitud elegida AHORA: un refresco tardío con el id de un clic anterior pisaba el detalle de la solicitud nueva */ const load=async()=>{const mine=++latest.current;const target=idRef.current;if(!target){setDetail(null);return;}try{const value=adaptDetail(await api(`/flights/${target}`));if(mine===latest.current)setDetail(value);}catch(e){if(mine===latest.current)msg(e.message,true);}};
 useEffect(()=>{setReasonId("");setCustom("");setCancelReasonId("");setCancelCustom("");load();},[id]); const f=detail?.vuelo; const proposal=openProposal(detail?.negociacion,"CO_CONTRAPROPUESTA"); const show=f?visibleSections(f,detail.negociacion,"DTS"):new Set(),stage=f?flightStage(f,detail.negociacion):null;
 const run=async(path,body,ok)=>{setBusy(true);try{await api(path,{method:"POST",body:JSON.stringify(body)});msg(ok);}catch(e){msg(e.message,true);}finally{await done();await load();setBusy(false);}};
 const respond=aceptar=>run(`/flights/${id}/schedule/response`,{aceptar,propuestaId:proposal?.id,motivoCancelacionId:aceptar?null:reasonId,motivoCancelacionPersonalizado:aceptar?null:custom},aceptar?"Contrapropuesta aceptada":"Contrapropuesta rechazada: la solicitud fue cancelada");
 const needsCustom=(list,rid)=>list.find(x=>String(x.id)===String(rid))?.codigo==="OTRO";
 return <section className="card"><h2>Mis solicitudes y contrapropuestas</h2><div className="grid-form"><label>Solicitud<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.extremaUrgencia?"⚠ URGENTE · ":""}{x.codigo} — {x.estado}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>Horario solicitado por DTS</h4><p>{dt(f.solicitada)}</p></div><div><h4>Horario definitivo</h4><p>{f.salida?dt(f.salida):"Pendiente"}</p></div></div><Urgency flight={f} detail/><CancellationNote flight={f}/>{stage?.key==="NEGOCIACION"&&<p className="negotiation-status" role="status">{f.estado==="SOLICITADO"?<><strong>Pendiente de evaluación:</strong> Operaciones debe aceptar el horario solicitado, presentar una contrapropuesta o rechazar la solicitud.</>:<><strong>Debe responder:</strong> Operaciones propuso otro horario y usted debe aceptarlo o rechazarlo.</>}</p>}{f.estado==="PENDIENTE_RESPUESTA_DTS"&&proposal&&<div className="wide detail-actions" aria-label="Contrapropuesta pendiente"><h4>Contrapropuesta de Operaciones</h4><p>Nuevo horario propuesto: <strong>{dt(proposal.fechaHoraPropuesta)}</strong> — {proposal.motivo}</p><p className="hint">Si la rechaza, la solicitud se cancela y debe indicar el motivo. Sólo puede responder la propuesta vigente.</p><button disabled={busy} onClick={()=>respond(true)}>Aceptar contrapropuesta</button><CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom}/><button className="secondary-action" disabled={busy||!reasonId||(needsCustom(reasons,reasonId)&&!custom.trim())} onClick={()=>respond(false)}>Rechazar contrapropuesta y cancelar</button></div>}{show.has("contactos")&&<TransferContacts key={`tc-${id}`} flightId={id} mode="dts" msg={msg}/>}{show.has("documentos")&&<FlightDocuments key={`documents-${id}`} flightId={id} canEdit={false} msg={msg}/>}<section className="wide"><h4>Historial de negociación</h4><NegotiationHistory events={detail.negociacion}/></section>{show.has("auditoria")&&<AuditTimeline key={`audit-${id}-${f.estado}`} flightId={id} title="Evolución de mi solicitud"/>}{CANCELLABLE_REQUEST.includes(f.estado)&&<div className="wide detail-actions" aria-label="Cancelar solicitud"><h4>Cancelar mi solicitud</h4><CancellationFields reasons={reasons} value={cancelReasonId} setValue={setCancelReasonId} custom={cancelCustom} setCustom={setCancelCustom}/><button className="secondary-action" disabled={busy||!cancelReasonId||(needsCustom(reasons,cancelReasonId)&&!cancelCustom.trim())} onClick={()=>window.confirm?.("¿Cancelar la solicitud?")!==false&&run(`/flights/${id}/cancel`,{motivoCancelacionId:cancelReasonId,motivoCancelacionPersonalizado:cancelCustom||null},"Solicitud cancelada")}>Cancelar solicitud</button></div>}</>}</div></section>;
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
 const latest=useRef(0);const load=async()=>{const mine=++latest.current;try{const x=await api(`/flights/${flightId}/airport-coordinations`);if(mine!==latest.current)return;if(!x||!Array.isArray(x.versiones))throw Error('Respuesta de coordinaciones inválida');setData(x);setError('');}catch(e){if(mine!==latest.current)return;setData(null);setError(e.message);}};
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
 const latest=useRef(0);const load=async()=>{const mine=++latest.current;try{const result=await api(`/flights/${flightId}/hangar`);if(mine!==latest.current)return;if(!result||typeof result.estado!=='string'||!Array.isArray(result.versiones))throw Error('Respuesta de hangar inválida');setData(result);const current=result.versiones.find(v=>v.actual);setForm({requiereHangar:current?.requiereHangar??true,preparacionCompleta:current?.preparacionCompleta??false,observaciones:current?.observaciones||''});setNote('');setError('');}catch(e){if(mine!==latest.current)return;setData(null);setError(e.message);}};
 useEffect(()=>{load();},[flightId]);
 const save=async commander=>{setBusy(true);try{const current=data.versiones.find(v=>v.actual);await api(`/flights/${flightId}/hangar${commander?'/commander-observation':''}`,{method:'PUT',body:JSON.stringify(commander?{version:current.version,observaciones:note}:{version:current?.version||0,...form})});await load();msg('Información de hangar guardada');}catch(e){setError(e.message);}finally{setBusy(false);}};
 const current=data?.versiones.find(v=>v.actual);
 return <section className="wide detail-actions"><h4>Hangar y preparación terrestre</h4>{error&&<p role="alert">{error}</p>}{!data?!error&&<p>Cargando información de hangar…</p>:<><p>Estado: {data.estado.replaceAll('_',' ')}</p><p>Aeronave asignada: {data.aeronave||'Sin asignar'} · Origen planificado: {data.origenPlanificado||'Sin definir'} · Última ubicación confirmada de la aeronave: {data.ubicacionConfirmada||'Sin definir'}</p>{data.estado==='REQUIERE_REVISION'&&<p>Operaciones debe revisar la información por cambio de contexto o por datos anteriores.</p>}{current&&<><p>Versión {current.version} · {current.responsable} · {dt(current.fechaCreacion)}</p><p>Observaciones de Operaciones: {current.observaciones||'—'}</p><p>Observaciones del comandante: {current.observacionesComandante||'—'}</p></>}{data.versiones.length>1&&<details><summary>Historial de versiones</summary>{data.versiones.map(v=><p key={v.id}>Versión {v.version} · {v.responsable} · {dt(v.fechaCreacion)} · {v.requiereHangar===null?'Anterior':v.requiereHangar?(v.preparacionCompleta?'Preparación completa':'Preparación pendiente'):'No requerido'} · {v.observaciones||'—'} · Comandante: {v.observacionesComandante||'—'}</p>)}</details>}{data.puedeGestionar&&<div><label>¿Requiere hangar?<select value={String(form.requiereHangar)} onChange={e=>setForm({...form,requiereHangar:e.target.value==='true',preparacionCompleta:false})}><option value="true">Sí</option><option value="false">No</option></select></label>{form.requiereHangar&&<label>Preparación terrestre<select value={String(form.preparacionCompleta)} onChange={e=>setForm({...form,preparacionCompleta:e.target.value==='true'})}><option value="false">Pendiente</option><option value="true">Completa</option></select></label>}<label>Observaciones de Operaciones<textarea maxLength={4000} value={form.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})}/></label><button type="button" disabled={busy} onClick={()=>save(false)}>Guardar información de hangar</button></div>}{data.puedeObservar&&<div><label>Observación del comandante<textarea maxLength={4000} value={note} onChange={e=>setNote(e.target.value)}/></label><button type="button" disabled={busy||!note.trim()} onClick={()=>save(true)}>Guardar observación del comandante</button></div>}{data.motivo&&<p>{data.motivo}</p>}</>}</section>;
}

export function FlightLog({flightId, revision=0, allowWrite=true, msg=()=>{}}) {
 const [page,setPage]=useState(0),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState(null),[form,setForm]=useState({tipo:'PREPARACION',descripcion:'',ocurrido:'',importancia:'NORMAL',motivoCorreccion:''});
 const latest=useRef(0);const load=async n=>{const mine=++latest.current;try{const result=await api(`/flights/${flightId}/log?page=${n}`);if(mine!==latest.current)return;if(!result||!Array.isArray(result.entradas))throw Error('Respuesta de bitácora inválida');setData(result);setError('');}catch(e){if(mine!==latest.current)return;setData(null);setError(e.message);}};
 useEffect(()=>{setPage(0);setTarget(null);setData(null);load(0);},[flightId,revision]);
 const navigate=n=>{setPage(n);setData(null);load(n);};
 const save=async()=>{setBusy(true);try{if(!form.ocurrido)throw Error('Indicá la fecha y hora del acontecimiento');const occurred=new Date(form.ocurrido);if(Number.isNaN(occurred.getTime()))throw Error('Fecha y hora inválidas');await api(`/flights/${flightId}/log`,{method:'POST',body:JSON.stringify({...form,ocurrido:occurred.toISOString(),correccionDe:target?.id||null,motivoCorreccion:target?form.motivoCorreccion:null})});setForm({tipo:'PREPARACION',descripcion:'',ocurrido:'',importancia:'NORMAL',motivoCorreccion:''});setTarget(null);setPage(0);await load(0);msg('Novedad registrada');}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="wide detail-actions"><h4>Bitácora operativa</h4><p>Horas expresadas en la zona del navegador. No incluya diagnósticos ni datos clínicos.</p>{error&&<p role="alert">{error}</p>}{!data?!error&&<p>Cargando bitácora…</p>:<><p>Más recientes primero · Página {page+1}</p>{data.entradas.length===0?<p>Sin acontecimientos operativos.</p>:data.entradas.map(e=><article key={e.id}><p><strong>{e.tipo.replaceAll('_',' ')} · {e.origen==='AUTOMATICO'?'Automático':'Manual'}{e.importancia==='IMPORTANTE'?' · Importante':''}</strong></p><p>{e.descripcion}</p><p>Ocurrió: {dt(e.ocurrido)} · Registrado: {dt(e.registrado)} · {e.responsable}</p>{e.correccionDe&&<p>Corrección de #{e.correccionDe}: {e.motivoCorreccion}</p>}{allowWrite&&data.puedeRegistrar&&<button type="button" className="secondary-action" disabled={busy} onClick={()=>{setTarget(e);setForm({...form,tipo:['PREPARACION','DEMORA','INCIDENCIA','METEOROLOGIA','AERONAVE','EJECUCION','CIERRE','OTRO'].includes(e.tipo)?e.tipo:'OTRO',descripcion:e.descripcion,motivoCorreccion:''});}}>Corregir #{e.id}</button>}</article>)}<button type="button" disabled={page===0} onClick={()=>navigate(page-1)}>Más recientes</button><button type="button" disabled={!data.hayMas} onClick={()=>navigate(page+1)}>Más antiguos</button>{allowWrite&&data.puedeRegistrar?<div><h4>{target?`Corrección de #${target.id}`:'Registrar acontecimiento'}</h4><label>Tipo de acontecimiento<select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>{[['PREPARACION','Preparación'],['DEMORA','Demora'],['INCIDENCIA','Incidencia'],['METEOROLOGIA','Meteorología'],['AERONAVE','Aeronave'],['EJECUCION','Ejecución'],['CIERRE','Cierre'],['OTRO','Otro']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Descripción de la novedad<textarea maxLength={4000} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/></label><label>Fecha y hora del acontecimiento<input type="datetime-local" value={form.ocurrido} onChange={e=>setForm({...form,ocurrido:e.target.value})}/></label><label>Importancia<select value={form.importancia} onChange={e=>setForm({...form,importancia:e.target.value})}><option value="NORMAL">Normal</option><option value="IMPORTANTE">Importante</option></select></label>{target&&<><label>Motivo de corrección<textarea maxLength={1000} value={form.motivoCorreccion} onChange={e=>setForm({...form,motivoCorreccion:e.target.value})}/></label><button type="button" onClick={()=>setTarget(null)}>Cancelar corrección</button></>}<button type="button" disabled={busy||!form.descripcion.trim()||!form.ocurrido||(target&&!form.motivoCorreccion.trim())} onClick={save}>{target?'Guardar corrección':'Registrar novedad'}</button></div>:allowWrite&&<p>{data.motivo}</p>}</>}</section>;
}
const DEFAULT_CREW_ROLES = [["COPILOTO", "Copiloto"], ["MEDICO", "Médico"], ["ENFERMERO", "Enfermero"]];
const CREW_REMOVAL_LABEL = { RETIRO: "Retirado", REEMPLAZO: "Reemplazado", CAMBIO_COMANDANTE: "Comandante reemplazado" };
/** Tripulación del vuelo. Operaciones asigna, reemplaza y retira antes del inicio; el comandante sólo consulta. Retirar conserva el registro como historial. */
/** Intervalo del refresco periódico de la tripulación: otras personas (Operaciones, el comandante, un administrador) la modifican sin cambiar el estado del vuelo. */
export const CREW_REFRESH_MS=15000;
export function FlightCrew({ flightId, canManage=false, state, msg=()=>{}, refreshMs=CREW_REFRESH_MS }) {
 const [rows,setRows]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[role,setRole]=useState(""),[available,setAvailable]=useState([]),[blocked,setBlocked]=useState([]),[member,setMember]=useState(""),[replace,setReplace]=useState(""),[roles,setRoles]=useState(DEFAULT_CREW_ROLES),[loadingCandidates,setLoadingCandidates]=useState(false),[history,setHistory]=useState(null),[showHistory,setShowHistory]=useState(false);
  const latest=useRef(0);
 /** Sólo la respuesta de la consulta más reciente se aplica: una respuesta tardía (de un vuelo o estado anterior) nunca pisa a una más nueva. {@code quiet}: refresco de fondo, que ante una falla conserva lo que ya se ve. */
 const load=async(quiet=false)=>{const mine=++latest.current;try{const data=await api(`/flights/${flightId}/crew`);if(mine!==latest.current)return;if(!Array.isArray(data))throw new Error("Respuesta de tripulación inválida");setRows(data);setError("");}catch(e){if(mine!==latest.current||quiet)return;setRows(null);setError(e.message);}};
 const loadHistory=async()=>{try{const data=await api(`/flights/${flightId}/crew?history=true`);if(!Array.isArray(data))throw new Error("Respuesta de historial inválida");setHistory(data);}catch(e){setHistory(null);setError(e.message);}};
 useEffect(()=>{setRows(null);setError("");setShowHistory(false);setHistory(null);setRole("");setMember("");setReplace("");load();},[flightId,state]);
 useEffect(()=>{const tick=()=>{if(document.visibilityState==="hidden"||busy)return;load(true);};const timer=setInterval(tick,refreshMs);window.addEventListener("focus",tick);document.addEventListener("visibilitychange",tick);return()=>{clearInterval(timer);window.removeEventListener("focus",tick);document.removeEventListener("visibilitychange",tick);};},[flightId,busy,refreshMs]);
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
export function OperationalAirportSelector({value,onChange,initial=[]}) {
 const [query,setQuery]=useState(""),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState("");
 useEffect(()=>{if(!query.trim()){setResults([]);setError("");return;}let active=true;const timer=setTimeout(()=>{api(`/catalogs/airports?q=${encodeURIComponent(query.trim())}`).then(rows=>{if(active){if(!Array.isArray(rows))throw new Error("Respuesta inválida");setResults(rows);setError("");}}).catch(()=>{if(active){setResults([]);setError("No se pudo buscar aeropuertos.");}});},250);return()=>{active=false;clearTimeout(timer);};},[query]);
 const options=query.trim()?results:initial;
 return <><label>Buscar aeropuerto de destino<input value={query} onChange={e=>setQuery(e.target.value)}/></label>{error&&<p role="alert" className="error">{error}</p>}<label>Destino<select required value={value} onChange={e=>{const id=e.target.value;setSelected(options.find(x=>String(x.id)===id)||null);onChange(id?Number(id):"");}}><option value="">Seleccionar aeropuerto</option>{selected&&value&&!options.some(x=>String(x.id)===String(value))&&<option value={selected.id}>{selected.nombre}</option>}{options.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label></>;
}
function OperationalReplanning({ flight, done, msg, reload }) {
 const [catalogs,setCatalogs]=useState({aircraft:[],commanders:[],airports:[]}),[form,setForm]=useState({aircraftId:"",comandanteId:"",destinoId:"",salida:"",llegada:""});
 useEffect(()=>{Promise.all([api("/catalogs/aircraft"),api("/auth/users/commanders"),api("/catalogs/airports")]).then(([aircraft,commanders,airports])=>setCatalogs({aircraft,commanders,airports})).catch(e=>msg(e.message,true));},[]);
 const send=async()=>{try{await api(`/flights/${flight.id}/operational-replanning`,{method:"POST",body:JSON.stringify(form)});msg("Nueva asignación enviada al comandante");await done();await reload();}catch(e){msg(e.message,true);}};
 return <div className="wide detail-actions"><h4>Replanificar asignación</h4><p>El origen se toma nuevamente de la ubicación actual de la aeronave.</p><label>Aeronave<select value={form.aircraftId} onChange={e=>setForm({...form,aircraftId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{catalogs.aircraft.map(x=><option key={x.id} value={x.id}>{x.matricula} — {x.aeropuertoActual}</option>)}</select></label><label>Comandante<select value={form.comandanteId} onChange={e=>setForm({...form,comandanteId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{catalogs.commanders.map(x=><option key={x.id} value={x.id}>{x.nombre} {x.apellido}</option>)}</select></label><OperationalAirportSelector value={form.destinoId} onChange={destinoId=>setForm({...form,destinoId})} initial={catalogs.airports}/><label>Salida<input type="datetime-local" value={form.salida} onChange={e=>setForm({...form,salida:e.target.value})}/></label><label>Llegada<input type="datetime-local" value={form.llegada} onChange={e=>setForm({...form,llegada:e.target.value})}/></label><button disabled={!form.aircraftId||!form.comandanteId||!form.destinoId||!form.salida||!form.llegada} onClick={send}>Enviar nueva asignación</button></div>;
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
export function OperationalFlightForm({ d, done, msg }) {
 const aircraft=Array.isArray(d.aircraft)?d.aircraft:[], commanders=Array.isArray(d.commanders)?d.commanders:[], airports=Array.isArray(d.airports)?d.airports:[];
 const [types,setTypes]=useState([]),[typeError,setTypeError]=useState(""),[typesVersion,setTypesVersion]=useState(0),[form,setForm]=useState({tipoVueloCode:"",motivoVuelo:"",aircraftId:"",comandanteId:"",destinoId:"",salida:"",llegada:""});
 useEffect(()=>{let active=true;api("/catalogs/flight-types?operationalOnly=true").then(rows=>{if(!active)return;if(!Array.isArray(rows)||rows.length===0||rows.some(x=>!x||typeof x.codigo!=="string"||!x.codigo.trim()||typeof x.nombre!=="string"||!x.nombre.trim())){setTypes([]);setForm(x=>({...x,tipoVueloCode:""}));setTypeError("No hay un catálogo válido de tipos de vuelo operativo. No se puede crear el vuelo.");return;}setTypeError("");setTypes(rows);setForm(x=>({...x,tipoVueloCode:rows.some(r=>r.codigo===x.tipoVueloCode)?x.tipoVueloCode:rows[0].codigo}));}).catch(()=>{if(active){setTypes([]);setForm(x=>({...x,tipoVueloCode:""}));setTypeError("No se pudo cargar el catálogo de tipos de vuelo operativo. No se puede crear el vuelo.");}});return()=>{active=false;};},[typesVersion]);
 const save=async e=>{e.preventDefault();try{await api("/flights/operational",{method:"POST",body:JSON.stringify(form)});msg("Vuelo operativo creado; queda pendiente de confirmación del comandante");setForm({tipoVueloCode:types[0]?.codigo||"",motivoVuelo:"",aircraftId:"",comandanteId:"",destinoId:"",salida:"",llegada:""});done();}catch(error){msg(error.message,true);if(error.code==="TIPO_VUELO_INACTIVO"||error.code==="TIPO_VUELO_INEXISTENTE")setTypesVersion(v=>v+1);}};
 return <section className="card"><h2>Nuevo vuelo operativo</h2><p className="hint">El origen se toma automáticamente de la ubicación actual de la aeronave.</p>{typeError&&<p className="error" role="alert">{typeError}</p>}<form className="grid-form" onSubmit={save}><label>Tipo<select required value={form.tipoVueloCode} onChange={e=>setForm({...form,tipoVueloCode:e.target.value})}><option value="">Seleccionar tipo</option>{types.map(x=><option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}</select></label><label>Aeronave<select required value={form.aircraftId} onChange={e=>setForm({...form,aircraftId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{aircraft.map(x=><option key={x.id} value={x.id}>{x.matricula} — {x.aeropuertoActual}</option>)}</select></label><label>Comandante<select required value={form.comandanteId} onChange={e=>setForm({...form,comandanteId:e.target.value?Number(e.target.value):""})}><option value="">Seleccionar</option>{commanders.map(x=><option key={x.id} value={x.id}>{x.nombre} {x.apellido}</option>)}</select></label><OperationalAirportSelector value={form.destinoId} onChange={destinoId=>setForm({...form,destinoId})} initial={airports}/><label>Salida<input required type="datetime-local" value={form.salida} onChange={e=>setForm({...form,salida:e.target.value})}/></label><label>Llegada<input required type="datetime-local" value={form.llegada} onChange={e=>setForm({...form,llegada:e.target.value})}/></label><label className="wide">Motivo<textarea required value={form.motivoVuelo} onChange={e=>setForm({...form,motivoVuelo:e.target.value})}/></label><button disabled={!form.tipoVueloCode}>Crear vuelo operativo</button></form></section>;
}
export function Ops({ d, done, msg, focus=null, onBack=null }) {
 const [id,setId]=useState(focus?.id?String(focus.id):""),[detail,setDetail]=useState(null),[reasons,setReasons]=useState([]),[reasonId,setReasonId]=useState(""),[custom,setCustom]=useState("");
 const [routeStates,setRouteStates]=useState({}),[logRevision,setLogRevision]=useState(0),[routeRevision,setRouteRevision]=useState(0);
 useEffect(()=>{let active=true;api('/flights/route-statuses').then(rows=>{if(active&&Array.isArray(rows))setRouteStates(Object.fromEntries(rows.map(r=>[r.flightId,r])));}).catch(()=>{if(active)setRouteStates({});});return ()=>{active=false;};},[d.flights,routeRevision]);
 const idRef=useRef(id);idRef.current=id; const panelRef=useRef(null); useEffect(()=>{if(focus?.id){setId(String(focus.id));panelRef.current?.scrollIntoView?.({block:"start"});}},[focus?.id,focus?.nonce]); const latest=useRef(0);const load=async flightId=>{if(!flightId)return;const mine=++latest.current;try{const value=adaptDetail(await api(`/flights/${flightId}`));if(mine===latest.current)setDetail(value);}catch(e){if(mine===latest.current)msg(e.message,true);}};
 useEffect(()=>{api("/catalogs/cancellation-reasons").then(x=>setReasons(Array.isArray(x)?x:[])).catch(e=>msg(e.message,true));},[]); useEffect(()=>{latest.current++;setDetail(null);setReasonId("");setCustom("");load(id);},[id]);
 // Si otra sesión cambió el estado (lo trae el refresco periódico de la lista), la ficha se vuelve a leer para mostrar la etapa real.
 useEffect(()=>{const current=d.flights.find(x=>String(x.id)===String(id));if(current&&detail?.vuelo&&current.estado!==detail.vuelo.estado)load(id);},[d.flights]);
 /** Ejecuta una operación y vuelve a leer el estado real. Devuelve false si falló (tras recuperar la ficha, por si la causa fue un estado desactualizado). */
 const call=async(path,body,success)=>{try{await api(path,{method:"POST",body:body&&JSON.stringify(body)});msg(success);await done();await load(idRef.current);setLogRevision(x=>x+1);return true;}catch(e){msg(e.message,true);await load(idRef.current);return false;}}; const f=detail?.vuelo;
 const events=detail?.negociacion||[],sanitary=Boolean(f?.datosSanitarios),show=f?visibleSections(f,events,"OPERACIONES"):new Set(),has=k=>show.has(k),stage=f?flightStage(f,events):null;
 return <>{!id&&<OperationalFlightForm d={d} done={done} msg={msg}/>}<section className="card" ref={panelRef}><h2>Centro de Operaciones</h2>{onBack&&<p><button type="button" className="tertiary-action" onClick={onBack}>← Volver a la bandeja de solicitudes</button></p>}<div className="grid-form">{!focus&&<RouteReviewQueue statuses={routeStates} flights={d.flights} onOpen={setId}/>}{!focus&&<label>Solicitud<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.extremaUrgencia?"⚠ URGENTE · ":""}{x.codigo} — {x.estado}{routeStates[x.id]?.estado&&routeStates[x.id].estado!=='SIN_PLANIFICAR'?` · Ruta ${ROUTE_STATE_LABEL[routeStates[x.id].estado]||routeStates[x.id].estado}`:''}</option>)}</select></label>}{f&&<>
  <CancellationNote flight={f}/>
  {sanitary?<><RequestSummary flight={f} medical={detail.medical}/><NegotiationPanel flight={f} events={events} call={call} reasons={reasons}/></>:<><div className="wide detail-grid"><div><h4>Vuelo operativo</h4><p>{f.motivoVuelo}</p><p>{locationLabel(f.origen)} → {locationLabel(f.destino)}</p></div><div><h4>Horario definitivo</h4><p>{f.salida?dt(f.salida):"Aún en negociación"}</p></div></div><Urgency flight={f} detail/></>}
  {has("cierre")&&<FlightClosure flight={f} cierre={detail.cierre}/>}
  {has("ciclo")&&<LifecycleActions flight={f} run={(path,ok)=>call(path,null,ok)}/>}
  {has("aeropuertos")&&sanitary&&<AirportPlanning key={`airports-${id}-${detail.aeropuertos?.salida?.estado}-${detail.aeropuertos?.llegada?.estado}`} flight={f} plan={detail.aeropuertos} msg={msg} editable={f.estado==="APROBADO"||f.estado==="PLANIFICADO"} onChanged={async()=>{await done();await load(idRef.current);setLogRevision(x=>x+1);}}/>}
  {has("recursos")&&sanitary&&(f.estado==="APROBADO"||f.estado==="PLANIFICADO")&&<ResourceAssignment key={`resources-${id}`} flight={f} resources={detail.recursos} plan={detail.aeropuertos} msg={msg} onChanged={async()=>{await done();await load(idRef.current);setLogRevision(x=>x+1);}}/>}
  {has("hangar")&&<HangarInfo key={`hangar-${id}`} flightId={id} msg={msg}/>}
  {has("coordinaciones")&&<AirportCoordinations key={`airport-${id}-${logRevision}`} flightId={id} msg={msg}/>}
  {has("documentos")&&<FlightDocuments key={`documents-${id}`} flightId={id} canEdit={documentsEditable(f.estado)} canViewRetired msg={msg}/>}
  {has("bitacora")&&<FlightLog key={`log-${id}`} flightId={id} revision={logRevision} msg={msg}/>}
  {has("auditoria")&&<AuditTimeline key={`audit-${id}-${logRevision}`} flightId={id}/>}
  {has("ruta")&&<FlightRoute key={`route-${id}`} flightId={id} canReview msg={msg} onChanged={()=>{setRouteRevision(x=>x+1);setLogRevision(x=>x+1);done();}}/>}
  {has("aeronave")&&<FlightAircraft key={`aircraft-${id}-${detail.recursos?.aircraftId||0}`} flight={f} recursos={detail.recursos} done={done} msg={msg} reload={()=>load(id)}/>}
  {has("tripulacion")&&<FlightCrew key={`crew-${id}`} flightId={id} canManage state={f.estado} msg={msg}/>}
  {has("clima")&&<WeatherHistory key={`weather-${id}`} flightId={id}/>}
  {has("contactos")&&sanitary&&<TransferContacts key={`tc-${id}`} flightId={id} mode="ops" msg={msg}/>}
  {!sanitary&&<><Negotiation events={events}/><CommanderProposalResponse flight={f} events={events} done={done} msg={msg} reload={()=>load(id)}/></>}
  {has("cancelar")&&![ "EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO","RECHAZADO"].includes(f.estado)&&<div className="wide detail-actions"><h4>Cancelar vuelo</h4><CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom}/><button className="secondary-action" disabled={!reasonId||(reasons.find(x=>String(x.id)===String(reasonId))?.codigo==="OTRO"&&!custom.trim())} onClick={()=>call(`/flights/${id}/cancel`,{motivoCancelacionId:reasonId,motivoCancelacionPersonalizado:custom||null},"Vuelo cancelado")}>Cancelar vuelo</button></div>}
 </>}</div></section></>;
}
export function Cmd({ d, done, msg }) {
 const [id,setId]=useState(""),[detail,setDetail]=useState(null),[origin,setOrigin]=useState(""),[destination,setDestination]=useState(""),[arrival,setArrival]=useState(""),[airports,setAirports]=useState([]),[weather,setWeather]=useState({condiciones:"",favorable:true,observaciones:""}),[weatherRevision,setWeatherRevision]=useState(0),[routeRevision,setRouteRevision]=useState(0);
 const idRef=useRef(id);idRef.current=id; const latest=useRef(0); const reload=async()=>{const mine=++latest.current;const value=adaptDetail(await api(`/flights/${idRef.current}`));if(mine===latest.current)setDetail(value);};
 useEffect(()=>{let active=true;setDetail(null);setWeather({condiciones:"",favorable:true,observaciones:""});if(id)reload().catch(e=>{if(active)msg(e.message,true);});return ()=>{active=false;latest.current++;};},[id]); const f=detail?.vuelo;
 const planningSaved=async()=>{await done();await reload();setRouteRevision(x=>x+1);};
 const saveWeather=async()=>{try{await api(`/flights/${id}/weather`,{method:"POST",body:JSON.stringify(weather)});msg("Condiciones meteorológicas registradas");setWeather({condiciones:"",favorable:true,observaciones:""});setWeatherRevision(x=>x+1);}catch(e){msg(e.message,true);}};
 return <section className="card"><h2>Planificación operativa</h2><p className="hint">La salida definitiva proviene del flujo que corresponda y no es editable por el comandante.</p><div className="grid-form"><label>Vuelo<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar vuelo</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.codigo} — {x.estado}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>Salida fijada</h4><p>{dt(f.salida)}</p></div><div><h4>Aeronave</h4><p>{detail.recursos?.aircraftMatricula||"Sin asignar"}</p>{detail.recursos?.aircraftMatricula&&<small>{[detail.recursos.aircraftModelo,detail.recursos.aircraftTipo].filter(Boolean).join(" · ")}{detail.recursos.aircraftUbicacion?` · Ubicación: ${detail.recursos.aircraftUbicacion}`:""}</small>}</div></div><Urgency flight={f} detail/><CancellationNote flight={f}/><FlightClosure flight={f} cierre={detail.cierre}/><CommanderAssignment flight={f} done={done} msg={msg} reload={reload}/>{f.estado==="PLANIFICADO"&&<>{f.datosSanitarios&&<CommanderAirportPlanning key={`airport-plan-${f.id}-${detail.aeropuertos?.salida?.aeropuertoId||0}-${detail.aeropuertos?.salida?.estado}-${detail.aeropuertos?.llegada?.aeropuertoId||0}-${detail.aeropuertos?.llegada?.estado}`} flight={f} plan={detail.aeropuertos} msg={msg} onSaved={planningSaved}/>}<fieldset className="wide"><legend>Condiciones meteorológicas</legend><label>Condiciones<textarea required value={weather.condiciones} onChange={e=>setWeather({...weather,condiciones:e.target.value})}/></label><label>¿Condiciones favorables?<select value={String(weather.favorable)} onChange={e=>setWeather({...weather,favorable:e.target.value==="true"})}><option value="true">Sí</option><option value="false">No</option></select></label><label>Observaciones<textarea value={weather.observaciones} onChange={e=>setWeather({...weather,observaciones:e.target.value})}/></label><button type="button" disabled={!weather.condiciones.trim()} onClick={saveWeather}>Registrar clima</button></fieldset></>}<HangarInfo key={`hangar-${id}`} flightId={id} msg={msg}/><AirportCoordinations key={`airport-${id}-${routeRevision}`} flightId={id} msg={msg}/><FlightDocuments key={`documents-${id}`} flightId={id} canEdit={documentsEditable(f.estado)} canViewRetired msg={msg}/><FlightLog key={`log-${id}`} flightId={id} msg={msg}/><AuditTimeline key={`audit-${id}-${routeRevision}`} flightId={id}/><FlightRoute key={`route-${id}-${routeRevision}-${f.estado}`} flightId={id} canEdit msg={msg}/><FlightCrew key={`crew-${id}`} flightId={id} state={f.estado} msg={msg}/><WeatherHistory key={`weather-${id}`} flightId={id} revision={weatherRevision}/><Negotiation events={detail.negociacion}/></>}</div></section>;
}
const ROLE_DASHBOARD = {
  DTS: { label: "Dirección de Tránsito Sanitario", eyebrow: "SOLICITUDES SANITARIAS", title: "Seguimiento de traslados", action: "Nueva solicitud", description: "Cree solicitudes y responda las decisiones que requieren su confirmación.", attention: flight => ["PENDIENTE_RESPUESTA_DTS", "RECHAZADO"].includes(flight.estado), attentionLabel: "Solicitudes que requieren su respuesta" },
  OPERACIONES: { label: "Centro de Operaciones", eyebrow: "GESTIÓN OPERATIVA", title: "Bandeja de operaciones", action: "Gestionar vuelos", description: "Priorice decisiones de planificación, asignación y revisión antes del seguimiento histórico.", attention: flight => ["SOLICITADO", "PENDIENTE_RESPUESTA_OPERACIONES", "PENDIENTE_REPLANIFICACION", "APROBADO"].includes(flight.estado), attentionLabel: "Vuelos que requieren una decisión" },
  COMANDANTE: { label: "Comandante", eyebrow: "OPERACIÓN DE VUELO", title: "Mi operación", action: "Ver asignaciones", description: "Revise asignaciones, prepare rutas y complete las obligaciones de cada vuelo.", attention: flight => ["PENDIENTE_CONFIRMACION_COMANDANTE", "PLANIFICADO", "PENDIENTE_REPLANIFICACION"].includes(flight.estado), attentionLabel: "Asignaciones y preparaciones pendientes" },
};
const hashFlight = () => /^#\/vuelos\/(\d+)$/.exec(location.hash)?.[1] || null;
const updateStamp = () => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Tucuman" }).format(new Date());
const stateLabel = state => String(state || "SIN_ESTADO").replaceAll("_", " ");
function AttentionQueue({ flights, title, onOpen }) {
  return <section className="card work-queue" aria-labelledby="attention-title"><div className="section-title"><div><p className="eyebrow">ATENCIÓN</p><h2 id="attention-title">{title}</h2></div><button className="tertiary-action" onClick={onOpen}>Ver gestión</button></div>{flights.length ? <ul className="queue-list">{flights.slice(0, 5).map(flight => <li key={flight.id} className={flight.extremaUrgencia ? "queue-item is-urgent" : "queue-item"}><div><strong>{flight.codigo || "Sin código"}</strong><span>{locationLabel(flight.origen)} → {locationLabel(flight.destino)}</span></div><div><Urgency flight={flight}/><span className={s(flight.estado)}>{stateLabel(flight.estado)}</span></div></li>)}</ul> : <p className="empty compact-empty">No hay tareas pendientes con los estados disponibles.</p>}</section>;
}
function FlightList({ flights, title="Vuelos", onRefresh, compact=false }) {
  return <section className="card flight-list-card"><div className="section-title"><div><p className="eyebrow">OPERACIÓN</p><h2>{title}</h2></div>{onRefresh && <button className="secondary-action" onClick={onRefresh}>Actualizar</button>}</div>{flights.length ? <div className="table-wrap"><table><thead><tr><th>Código</th><th>Trayecto</th><th>Fecha</th><th>Estado</th>{!compact && <th>Tipo</th>}</tr></thead><tbody>{flights.map(flight => <tr key={flight.id} className={flight.extremaUrgencia ? "urgent-row" : ""}><td><strong>{flight.codigo || "—"}</strong>{flight.extremaUrgencia && <Urgency flight={flight}/>}</td><td>{locationLabel(flight.origen)} → {locationLabel(flight.destino)}</td><td>{flight.solicitada ? dt(flight.solicitada) : "—"}</td><td><span className={s(flight.estado)}>{stateLabel(flight.estado)}</span></td>{!compact && <td>{flight.tipo?.nombre || flight.tipo?.codigo || "—"}</td>}</tr>)}</tbody></table></div> : <p className="empty">No hay vuelos para mostrar.</p>}</section>;
}
function OperationalDashboard({ workspace, data, openWork, openNotifications, openRequest, refresh }) {
  const config = ROLE_DASHBOARD[workspace] || ROLE_DASHBOARD.DTS, operations = workspace === "OPERACIONES", attention = data.flights.filter(config.attention).filter(flight => !operations || !flight.datosSanitarios), active = data.flights.filter(flight => !["FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"].includes(flight.estado)), urgent = data.flights.filter(flight => flight.extremaUrgencia && !["FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"].includes(flight.estado));
  return <><section className="workspace-hero"><div><p className="eyebrow">{config.eyebrow}</p><h2>{config.title}</h2><p>{config.description}</p></div><div className="hero-actions"><button onClick={openWork}>{config.action}</button>{data.unread > 0 && <button className="secondary-action" onClick={openNotifications}>Ver {data.unread} aviso{data.unread === 1 ? "" : "s"}</button>}</div></section>{operations ? <><InboxCounters flights={data.flights}/><RequestInbox flights={data.flights} onOpen={openRequest} place={locationLabel} updatedAt={data.updatedAt}/></> : <section className="operational-summary" aria-label="Resumen operativo"><article><span>Pendientes</span><strong>{attention.length}</strong><small>requieren una acción</small></article><article><span>Vuelos activos</span><strong>{active.length}</strong><small>en seguimiento</small></article><article><span>Extrema urgencia</span><strong>{urgent.length}</strong><small>activos</small></article></section>}<div className="dashboard-columns">{(!operations || attention.length > 0) && <AttentionQueue flights={attention} title={operations ? "Otros vuelos que requieren una decisión" : config.attentionLabel} onOpen={openWork}/>}<section className="card quick-links"><p className="eyebrow">ACCESOS RÁPIDOS</p><h2>Continuar trabajando</h2><button className="quick-link" onClick={openWork}><span aria-hidden="true">↗</span><span><strong>{workspace === "DTS" ? "Crear o consultar solicitudes" : workspace === "OPERACIONES" ? "Abrir planificación operativa" : "Abrir asignaciones y rutas"}</strong><small>Acceda a las herramientas y detalles disponibles.</small></span></button><button className="quick-link" onClick={openNotifications}><span aria-hidden="true">◉</span><span><strong>Notificaciones</strong><small>{data.unread ? `${data.unread} sin leer` : "No hay avisos sin leer"}</small></span></button></section></div></>;
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
    [dark, setDark] = useState(() => localStorage.getItem("vs-theme") === "dark"),
    [menuOpen, setMenuOpen] = useState(false),
    [view, setView] = useState(() => (location.hash === "#/mi-cuenta" ? "account" : location.hash === "#/vuelos" || hashFlight() ? "work" : location.hash === "#/notificaciones" ? "notifications" : location.hash === "#/comandantes" && workspace === "OPERACIONES" ? "commanders" : "panel")),
    // Solicitud abierta directamente desde la bandeja (o por una URL `#/vuelos/<id>`): conserva el contexto y permite volver.
    [focus, setFocus] = useState(() => (hashFlight() ? { id: hashFlight(), nonce: 0 } : null));
  const go = (target, flightId = null) => { setView(target); setMenuOpen(false); if (target !== "work") setFocus(null); history.replaceState(null, "", target === "account" ? "#/mi-cuenta" : target === "work" ? (flightId ? `#/vuelos/${flightId}` : "#/vuelos") : target === "notifications" ? "#/notificaciones" : target === "commanders" ? "#/comandantes" : location.pathname + location.search); };
  const openRequest = (id) => { setFocus({ id, nonce: Date.now() }); go("work", id); };
  const loadGeneration = useRef(0), pollGeneration = useRef(0);
  let has = (x) => session?.roles.includes(x);
  let load = async () => {
    const generation=++loadGeneration.current;
    pollGeneration.current++;
    const sources = [
      ["vuelos", "/flights", rows => ({flights: rows.map(adaptFlight), updatedAt: updateStamp()})],
      ["prioridades", "/catalogs/priorities", rows => ({priorities: rows})],
      ["aeronaves", "/catalogs/aircraft", rows => ({aircraft: rows})],
      ["aeropuertos", "/catalogs/airports", rows => ({airports: rows})],
      ["notificaciones", "/notifications", n => { const rows=n.items || n.content || []; return {notifications:rows, unread:n.unread ?? rows.filter(x=>!x.leido).length}; }],
    ];
    if (has("OPERACIONES") || has("CENTRO_OPERACIONES") || has("ADMINISTRADOR")) sources.push(["comandantes", "/auth/users/commanders", rows => ({commanders:rows})]);
    await Promise.all(sources.map(async ([label, path, map]) => {
      try { const values=map(await api(path)); if(generation===loadGeneration.current)setD(previous=>({...previous,...values})); }
      catch (error) { if(generation===loadGeneration.current)setNote(`No se pudo cargar ${label}: ${error.message}`); }
    }));
  };
  useEffect(() => {
    if (session) load();
    return () => { loadGeneration.current++; };
  }, [session]);
  // Las solicitudes nuevas aparecen sin recargar: se refrescan sólo vuelos y avisos (dos GET), con la pestaña visible y al volver a ella.
  const refreshInbox = async () => {
    const poll = ++pollGeneration.current, full = loadGeneration.current;
    try {
      const [rows, n] = await Promise.all([api("/flights"), api("/notifications")]);
      if (poll !== pollGeneration.current || full !== loadGeneration.current || !Array.isArray(rows)) return;
      const items = n?.items || n?.content || [];
      setD(previous => ({ ...previous, flights: rows.map(adaptFlight), notifications: items, unread: n?.unread ?? items.filter(x => !x.leido).length, updatedAt: updateStamp() }));
    } catch { /* El próximo ciclo o «Actualizar» lo reintenta; un fallo transitorio no debe tapar la pantalla con errores. */ }
  };
  useEffect(() => {
    if (!session) return undefined;
    const tick = () => { if (document.visibilityState !== "hidden") refreshInbox(); };
    const timer = setInterval(tick, INBOX_REFRESH_MS);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [session]);
  useEffect(() => {
    document.body.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("vs-theme", dark ? "dark" : "light");
  }, [dark]);
  if (!session) return <Login set={setSession} />;
  let msg = (x, bad) => setNote((bad ? "" : "✓ ") + x);
  const focusedRequest = workspace === "OPERACIONES" && view === "work" && Boolean(focus); // solicitud abierta desde la bandeja: sólo su detalle
  const pendingRequests = workspace === "OPERACIONES" ? inboxSections(d.flights).counts.intervencion : 0;
  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <aside aria-label="Navegación lateral">
        <div className="brand">
          ✈{" "}
          <span>
            Vuelos
            <br />
            Sanitarios
          </span>
        </div>
        <nav aria-label="Secciones de trabajo">
          <button className={view === "panel" ? "active" : ""} aria-current={view === "panel" ? "page" : undefined} onClick={() => go("panel")}>Inicio {pendingRequests > 0 && <span className="nav-count" title="Solicitudes sanitarias que requieren su intervención">{pendingRequests}<span className="visually-hidden"> solicitudes pendientes</span></span>}<small className="nav-workspace-label">{ROLE_DASHBOARD[workspace]?.label}</small></button>
          <button className={view === "work" ? "active" : ""} aria-current={view === "work" ? "page" : undefined} onClick={() => go("work")}>Gestión de vuelos</button>
          {workspace === "OPERACIONES" && <button className={view === "commanders" ? "active" : ""} aria-current={view === "commanders" ? "page" : undefined} onClick={() => go("commanders")}>Comandantes</button>}
          <button className={view === "notifications" ? "active" : ""} aria-current={view === "notifications" ? "page" : undefined} onClick={() => go("notifications")}>Notificaciones{d.unread ? <span className="nav-count">{d.unread}</span> : null}</button>
          <button className={view === "account" ? "active" : ""} aria-current={view === "account" ? "page" : undefined} onClick={() => go("account")}>Mi cuenta</button>
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
      <main className="content" id="main-content">
        <header>
          <div>
            <p className="eyebrow">PANEL PRINCIPAL</p>
            <h1>{view === "panel" ? `Hola, ${session.username}` : view === "work" ? "Gestión de vuelos" : view === "notifications" ? "Notificaciones" : view === "commanders" ? "Comandantes" : "Mi cuenta"}</h1>
          </div>
          <div className="header-actions">
            {workspaces.length>1&&<button className="secondary-action" onClick={()=>changeWorkspace(null)}>Cambiar área</button>}
            <button className="icon" onClick={() => setDark(!dark)} aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"}>
              {dark ? "☀" : "◐"}
            </button>
            <button className="menu-toggle" aria-label="Abrir navegación" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          </div>
        </header>
        {note && (
          <p className={note.startsWith("✓") ? "success" : "error"}>{note}</p>
        )}
        {view === "account" && <MyContacts notify={msg} />}
        {view === "commanders" && workspace === "OPERACIONES" && <CommanderLocations notify={msg} />}
        {view === "panel" && <OperationalDashboard workspace={workspace} data={d} openWork={() => go("work")} openNotifications={() => go("notifications")} openRequest={openRequest} refresh={load}/>}
        {(view === "panel" || view === "work") && <>
        {!focusedRequest && <section className="work-intro"><p className="eyebrow">{ROLE_DASHBOARD[workspace]?.eyebrow}</p><h2>{ROLE_DASHBOARD[workspace]?.title}</h2><p className="hint">Las acciones y estados disponibles dependen de su rol y del estado real de cada vuelo.</p></section>}
        {workspace==="DTS" && <><DTS d={d} done={load} msg={msg} /><DtsResponses d={d} done={load} msg={msg} /></>}{" "}
        {workspace==="OPERACIONES" && (
          <>
            <Ops d={d} done={load} msg={msg} focus={focus} onBack={focus ? () => go("panel") : null} />
            {!focusedRequest && <OperationsReports msg={msg} />}
          </>
        )}{" "}
        {workspace==="COMANDANTE" && (
          <>
            <CommanderReports msg={msg} renderLog={(flightId) => <FlightLog flightId={flightId} allowWrite={false} msg={msg} />} />
            <Cmd d={d} done={load} msg={msg} />
          </>
        )}
        </>}
        {(view === "panel" || view === "work") && !focusedRequest && <FlightList flights={d.flights} title="Vuelos visibles" onRefresh={load}/>}
        {view === "notifications" && <><NotificationsPanel items={d.notifications} unread={d.unread} msg={msg} reload={load} />{d.notifications.some((n) => n.tipo.includes("EXTREME_URGENCY")) && <section className="card notifications"><h2>Alertas de extrema urgencia</h2>{d.notifications.filter((n) => n.tipo.includes("EXTREME_URGENCY")).map((n) => <p className="urgency-detail" key={n.id}>⚠ <strong>EXTREMA URGENCIA</strong> — {n.mensaje}</p>)}</section>}</>}
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
 const [query,setQuery]=useState(""),[role,setRole]=useState(""),[localOpen,setLocalOpen]=useState(false),[activationCode,setActivationCode]=useState(""),[reactivation,setReactivation]=useState(null),[reactivating,setReactivating]=useState(null),[form,setForm]=useState(emptyForm),[creating,setCreating]=useState(false);
 const allRoles=["ADMINISTRADOR","DTS","CENTRO_OPERACIONES","COMANDANTE"];
 const open=createOpen===undefined?localOpen:createOpen;
 const setOpen=(value)=>{if(createOpen===undefined)setLocalOpen(value);else onCreateOpenChange?.(value);};
 useEffect(()=>{if(createOpen)setForm(emptyForm());},[createOpen]);
 const toggle=(r)=>setForm({...form,roles:form.roles.includes(r)?form.roles.filter(x=>x!==r):[...form.roles,r]});
 const openNewUser=()=>{setForm(emptyForm());setOpen(true);};
 const closeNewUser=()=>{if(creating)return;setForm(emptyForm());setOpen(false);};
 const dismissCode=()=>setActivationCode("");
 const receiveActivationCode=(result)=>{if(!result?.codigo)throw new Error("El servidor no devolvió el código de activación. Regeneralo antes de continuar.");setActivationCode(result.codigo);};
 const openReactivate=x=>setReactivating({id:x.id,username:x.username,nombre:x.nombre,apellido:x.apellido,fechaNacimiento:"",licenciaAeronautica:"",roles:[...(x.roles||[])]});
 const reactivate=async e=>{e.preventDefault();const x=reactivating;try{const result=await api(`/auth/users/${x.id}/reactivate`,{method:"PATCH",body:JSON.stringify({...x,fechaNacimiento:x.fechaNacimiento||null})});setReactivating(null);setReactivation({username:x.username,password:result.contrasenaTemporal});await reload();notify("Usuario reactivado. Guardá la contraseña temporal antes de cerrar este aviso.");}catch(error){notify(error.message,true);}};
 const userPayload=(extra={})=>({...form,fechaNacimiento:form.fechaNacimiento||null,...extra});
 const create=async e=>{e.preventDefault();if(creating)return;const contactProblem=emailProblem(form.correos[0].direccion)||phoneProblem(form.telefonos[0].numero,form.telefonos[0].pais);if(contactProblem){notify(contactProblem,true);return;}setCreating(true);try{const r=await api("/auth/users",{method:"POST",body:JSON.stringify(userPayload())});receiveActivationCode(r);setForm(emptyForm());setOpen(false);await reload();notify("Cuenta pendiente creada. Guardá el código de activación antes de continuar.");}catch(x){if(x.code==="PERSON_EXISTS_WITHOUT_ACCOUNT"&&x.personaId){if(x.coincideNombre&&confirm("Ya existe una persona registrada con ese DNI y el mismo nombre, sin cuenta en el sistema. ¿Asociar la nueva cuenta a esa identidad existente? No se creará una persona nueva.")){try{const r2=await api("/auth/users",{method:"POST",body:JSON.stringify(userPayload({personaExistenteId:x.personaId}))});receiveActivationCode(r2);setForm(emptyForm());setOpen(false);await reload();notify("Cuenta pendiente creada y asociada a la identidad existente. Guardá el código de activación antes de continuar.");}catch(y){notify(y.message,true);}return;}notify(x.coincideNombre?x.message:"Ya existe una persona con ese DNI pero con un nombre distinto; verifique los datos antes de continuar.",true);return;}if(x.code==="INACTIVE_USER_WITH_DNI_EXISTS"&&x.userId){const existing=users.find(u=>u.id===x.userId)||{id:x.userId,username:x.username,nombre:x.nombre,apellido:x.apellido,roles:[]};setForm(emptyForm());setOpen(false);if(existing&&confirm(`${x.message}\n\n${existing.nombre} ${existing.apellido} · ${existing.username||"sin usuario"}\n\n¿Revisar y reactivar la cuenta existente?`)){openReactivate(existing);return;}}notify(x.message,true);}finally{setCreating(false);}};
 const shown=users.filter(x=>(active?x.activo!==false:x.activo===false)&&(!query||`${x.nombre} ${x.apellido} ${x.dni} ${x.username||""}`.toLowerCase().includes(query.toLowerCase()))&&(!role||(x.roles||[]).includes(role)));
 return <>
  {activationCode&&<div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true" aria-labelledby="activation-code-title"><p className="eyebrow">CUENTA PENDIENTE CREADA</p><h2 id="activation-code-title">Código de activación</h2><p>Este código numérico de 6 dígitos vence en 10 minutos y se mostrará una sola vez. Guardalo antes de cerrar este aviso.</p><code>{activationCode}</code><div className="form-actions"><button onClick={()=>navigator.clipboard?.writeText(activationCode)}>Copiar</button><button className="secondary-action" onClick={dismissCode}>Cerrar aviso</button></div></section></div>}
  {reactivating&&<div className="activation-modal-backdrop" role="presentation"><form className="activation-modal grid-form" onSubmit={reactivate}><p className="eyebrow">REACTIVAR USUARIO</p><h2>Revisar cuenta existente</h2><p>Se conserva el DNI y todo el historial. Podés actualizar los datos administrativos antes de continuar.</p><label>Nombre<input required value={reactivating.nombre} onChange={e=>setReactivating({...reactivating,nombre:e.target.value})}/></label><label>Apellido<input required value={reactivating.apellido} onChange={e=>setReactivating({...reactivating,apellido:e.target.value})}/></label><label>Fecha de nacimiento<input type="date" value={reactivating.fechaNacimiento} onChange={e=>setReactivating({...reactivating,fechaNacimiento:e.target.value})}/></label><fieldset><legend>Roles</legend>{allRoles.map(r=><label className="check" key={r}><input type="checkbox" checked={reactivating.roles.includes(r)} onChange={()=>setReactivating({...reactivating,roles:reactivating.roles.includes(r)?reactivating.roles.filter(x=>x!==r):[...reactivating.roles,r]})}/>{r}</label>)}</fieldset>{reactivating.roles.includes("COMANDANTE")&&<label>Licencia aeronáutica<input value={reactivating.licenciaAeronautica} onChange={e=>setReactivating({...reactivating,licenciaAeronautica:e.target.value})}/></label>}<div className="form-actions"><button>Reactivar y generar contraseña</button><button type="button" className="secondary-action" onClick={()=>setReactivating(null)}>Cancelar</button></div></form></div>}
  {reactivation&&<div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true"><p className="eyebrow">USUARIO REACTIVADO</p><h2>Contraseña temporal</h2><p>Usuario: <strong>{reactivation.username}</strong>. Esta contraseña se muestra una única vez; deberá cambiarla al iniciar sesión.</p><code>{reactivation.password}</code><div className="form-actions"><button onClick={()=>navigator.clipboard?.writeText(reactivation.password)}>Copiar</button><button className="secondary-action" onClick={()=>setReactivation(null)}>Cerrar aviso</button></div></section></div>}
  {open&&<div className="activation-modal-backdrop" role="presentation"><form className="activation-modal user-create-modal" onSubmit={create} aria-busy={creating}>
    <header className="user-create-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h2>Añadir usuario</h2></div><p>La cuenta quedará pendiente hasta que la persona complete su activación.</p></header>
    <section className="user-create-section"><h3>Identificación</h3><div className="grid-form user-create-fields">
      <label>Nombre<input required disabled={creating} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/></label><label>Apellido<input required disabled={creating} value={form.apellido} onChange={e=>setForm({...form,apellido:e.target.value})}/></label><label>DNI<input required disabled={creating} value={form.dni} onChange={e=>setForm({...form,dni:e.target.value})}/></label><label>Fecha de nacimiento<input type="date" disabled={creating} value={form.fechaNacimiento} onChange={e=>setForm({...form,fechaNacimiento:e.target.value})}/></label>
    </div></section>
    <section className="user-create-section"><h3>Contacto principal</h3><div className="grid-form user-create-fields"><label className="wide">Correo principal<input type="email" required disabled={creating} value={form.correos[0].direccion} onChange={e=>setForm({...form,correos:[{direccion:e.target.value,tipo:"PERSONAL"}]})}/></label><div className="wide admin-phone"><PhoneField label="Teléfono principal" idPrefix="alta-telefono" disabled={creating} value={{pais:form.telefonos[0].pais,numero:form.telefonos[0].numero}} onChange={v=>setForm({...form,telefonos:[{numero:v.numero,pais:v.pais,tipo:"PERSONAL"}]})}/><small className="hint">Elegí el país antes del número. El prefijo se muestra una sola vez y el correo se verifica después desde “Mi cuenta”.</small></div></div></section>
    <section className="user-create-section"><h3>Acceso</h3><fieldset className="user-create-roles" disabled={creating}><legend>Roles</legend>{allRoles.map(r=><label className="check" key={r}><input type="checkbox" checked={form.roles.includes(r)} onChange={()=>toggle(r)}/>{r}</label>)}</fieldset>{form.roles.includes("COMANDANTE")&&<label>Número de licencia<input required disabled={creating} value={form.licenciaAeronautica} onChange={e=>setForm({...form,licenciaAeronautica:e.target.value})}/></label>}</section>
    <div className="form-actions"><button disabled={creating}>{creating?"Creando cuenta…":"Crear cuenta pendiente"}</button><button type="button" className="secondary-action" disabled={creating} onClick={closeNewUser}>Cancelar</button></div>
  </form></div>}
  {showList&&<section className="card"><div className="section-title"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>{active?"Usuarios activos":"Usuarios desactivados"}</h1><p>{shown.length} {active?"cuentas activas o pendientes de activación":"cuentas dadas de baja"}</p></div>{active&&<button onClick={openNewUser}>Nuevo usuario</button>}</div><div className="filters"><input placeholder="Buscar por nombre, DNI o usuario" value={query} onChange={e=>setQuery(e.target.value)}/><select value={role} onChange={e=>setRole(e.target.value)}><option value="">Todos los roles</option>{allRoles.map(x=><option key={x}>{x}</option>)}</select></div>{shown.length?<table><thead><tr><th>Nombre</th><th>Apellido</th><th>DNI</th><th>Usuario</th><th>Rol</th><th>Ubicación actual</th>{!active&&<th>Fecha de baja</th>}<th>Acciones</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td>{x.nombre}</td><td>{x.apellido}</td><td>{x.dni}</td><td>{x.username||"—"}</td><td>{(x.roles||[]).join(", ")}</td><td>{(x.roles||[]).includes("COMANDANTE")?(x.provinciaActual||"Sin configurar"):"—"}</td>{!active&&<td>{dt(x.fechaBaja)}</td>}<td>{active&&x.estado==="PENDIENTE_ACTIVACION"&&<button onClick={async()=>{try{receiveActivationCode(await api(`/auth/users/${x.id}/activation-code`,{method:"POST"}));reload();}catch(e){notify(e.message,true)}}}>Regenerar código</button>}{active&&x.username&&<button className="secondary-action" onClick={async()=>{if(!confirm(`¿Desactivar usuario? ${x.nombre} ${x.apellido} conservará su historial.`))return;try{await api(`/auth/users/${x.id}/deactivate`,{method:"PATCH",body:JSON.stringify({})});await reload();notify("Usuario desactivado");}catch(e){notify(e.message,true)}}}>Desactivar</button>}{!active&&x.username&&<button className="secondary-action" onClick={()=>openReactivate(x)}>Reactivar</button>}</td></tr>)}</tbody></table>:<p className="empty">No hay usuarios {active?"activos":"desactivados"} para mostrar.</p>}</section>}
 </>;
}
const REQUIREMENT_LABELS=[["requiereClasificacion","clasificación administrativa"],["requiereHabilitacionVerificada","habilitación profesional verificada y vigente"],["requiereLicencia","licencia aeronáutica registrada"],["requiereRolAcceso","rol de acceso COMANDANTE"]];
const when=v=>v?new Date(v).toLocaleString("es-AR"):"";
/** Clasificación administrativa por función: independiente del rol de acceso y de la habilitación. Todo estado se toma de la respuesta del servidor; el retiro conserva historial. */
export function AdminCrewQualifications({users:given,notify}) {
 const [id,setId]=useState(""),[rows,setRows]=useState([]),[roles,setRoles]=useState([]),[error,setError]=useState(""),[term,setTerm]=useState(""),[found,setFound]=useState([]),[busy,setBusy]=useState(""),[reasons,setReasons]=useState({}),[version,setVersion]=useState(0); const users=given||found;
 const manage=r=>{setFound(list=>list.some(u=>String(u.id)===String(r.userId))?list:[{id:r.userId,nombre:r.nombre,apellido:r.apellido,username:r.username},...list]);setId(String(r.userId));};
 useEffect(()=>{if(given)return undefined;let on=true;const t=setTimeout(()=>{api(`/auth/users/search?status=ACTIVOS&size=20&q=${encodeURIComponent(term)}`).then(p=>{if(on)setFound((p?.items||[]).filter(u=>u.username));}).catch(()=>{if(on)setFound([]);});},250);return()=>{on=false;clearTimeout(t);};},[term,given]);
 useEffect(()=>{let on=true;api("/catalogs/crew-roles").then(r=>{if(on)setRoles(Array.isArray(r)?r:[]);}).catch(e=>{if(on){setRoles([]);setError(e.message);}});return()=>{on=false;};},[]);
 const latest=useRef(0);const load=async userId=>{const mine=++latest.current;if(!userId){setRows([]);return;}try{const r=await api(`/crew-qualifications/${userId}?history=true`);if(mine!==latest.current)return;setRows(Array.isArray(r)?r:[]);setError("");}catch(e){if(mine===latest.current)setError(e.message);}};
 useEffect(()=>{load(id);},[id]);
 const act=async(code,retire)=>{setBusy(code);let failure="";try{await api(retire?`/crew-qualifications/${id}/${code}?motivo=${encodeURIComponent((reasons[code]||"").trim())}`:`/crew-qualifications/${id}/${code}`,{method:retire?"DELETE":"PUT"});setReasons(r=>({...r,[code]:""}));setError("");notify(retire?"Clasificación retirada; queda en el historial":"Clasificación registrada");}catch(e){failure=e.message;}finally{await load(id);if(failure)setError(failure);setVersion(v=>v+1);setBusy("");}};
 const current=code=>rows.find(x=>x.crewRoleCode===code&&x.vigente), retired=rows.filter(x=>!x.vigente);
 return <section className="card"><h2>Clasificación administrativa de tripulación</h2><p>La clasificación indica qué función puede cumplir una persona dentro de un vuelo. Es independiente del rol de acceso (qué puede hacer en la aplicación) y de la habilitación profesional (la acredita una revisión manual de documentos, no una consulta oficial automática). Clasificar no concede permisos ni reemplaza la habilitación.</p>{!given&&<PendingCommanders onManage={manage} version={version}/>}{!given&&<label>Buscar usuario<input value={term} placeholder="Nombre, apellido, DNI o usuario" onChange={e=>setTerm(e.target.value)}/></label>}<label>Usuario<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar usuario</option>{users.map(u=><option key={u.id} value={u.id}>{u.nombre} {u.apellido} ({u.username||"cuenta pendiente"})</option>)}</select></label>{error&&<p role="alert">{error}</p>}{id&&roles.length===0&&!error&&<p className="hint">Cargando las funciones de tripulación…</p>}{id&&<UserRequirements userId={id} roles={roles} version={version}/>}{id&&roles.map(role=>{const q=current(role.codigo);return <div className="wide detail-actions" key={role.codigo} data-testid={`rol-${role.codigo}`}><h4>{role.nombre} <small>({role.codigo})</small></h4><p className="hint">Exige: {REQUIREMENT_LABELS.filter(([key])=>role[key]).map(([,label])=>label).join(", ")||"sin requisitos adicionales"}. {role.asignacion==="RECURSOS"?"Se asigna junto con la aeronave.":"Se asigna desde la tripulación del vuelo."}</p>{q?<><p>Clasificado por {q.clasificadoPor||"—"} el {when(q.fechaClasificacion)}. {q.elegible?<strong>Elegible hoy{q.habilitacionVence?` (habilitación hasta ${q.habilitacionVence})`:""}.</strong>:<strong className="error">No elegible hoy: {q.elegibilidadMotivo||q.elegibilidadCodigo}.</strong>}</p><label>Motivo del retiro (opcional)<input maxLength={200} value={reasons[role.codigo]||""} onChange={e=>setReasons({...reasons,[role.codigo]:e.target.value})}/></label><button type="button" className="secondary-action" disabled={!!busy} onClick={()=>act(role.codigo,true)}>Retirar clasificación de {role.nombre}</button></>:<><p>Sin clasificación vigente.</p><button type="button" disabled={!!busy} onClick={()=>act(role.codigo,false)}>Clasificar como {role.nombre}</button></>}</div>;})}{id&&retired.length>0&&<details className="wide" data-testid="historial-clasificaciones"><summary>Historial de clasificaciones retiradas ({retired.length})</summary><ul>{retired.map((q,i)=><li key={i}>{q.crewRoleName}: clasificado por {q.clasificadoPor||"—"} el {when(q.fechaClasificacion)}; retirado por {q.retiradoPor||"—"} el {when(q.fechaBaja)}. Motivo: {q.motivoBaja}.</li>)}</ul></details>}{id&&<ProfessionalCredentials key={id} userId={id} notify={notify}/>}</section>;
}
function AdminDashboard({ users, counts, aircraft, onAddUser, onAddAircraft, onUsers }) {
 const userItems=Array.isArray(users)?users:[], aircraftItems=Array.isArray(aircraft)?aircraft:[];
 const activeUsers=counts?counts.activos:userItems.filter(x=>x.activo!==false).length, pendingUsers=counts?counts.pendientes:0, activeAircraft=aircraftItems.filter(x=>x.activo).length;
 return <><section className="workspace-hero admin-hero"><div><p className="eyebrow">ADMINISTRACIÓN</p><h2>Panel de administración</h2><p>Gestione cuentas y recursos activos. Las bajas e historial permanecen accesibles dentro de Usuarios.</p></div><div className="hero-actions"><button onClick={onAddUser}>Añadir usuario</button><button className="secondary-action" onClick={onAddAircraft}>Añadir aeronave</button></div></section><section className="operational-summary" aria-label="Resumen administrativo"><article><span>Cuentas activas</span><strong>{activeUsers}</strong><small>con acceso vigente</small></article><article><span>Activaciones pendientes</span><strong>{pendingUsers}</strong><small>requieren seguimiento</small></article><article><span>Aeronaves activas</span><strong>{activeAircraft}</strong><small>disponibles en catálogo</small></article></section><section className="card quick-links admin-links"><p className="eyebrow">ACCESOS RÁPIDOS</p><h2>Gestión frecuente</h2><div className="quick-action-grid"><button className="quick-link" onClick={onUsers}><span aria-hidden="true">⌕</span><span><strong>Buscar y administrar usuarios</strong><small>Incluye filtros y acceso a desactivados.</small></span></button><button className="quick-link" onClick={onAddAircraft}><span aria-hidden="true">✈</span><span><strong>Registrar aeronave</strong><small>Capacidad, ubicación y disponibilidad.</small></span></button></div></section></>;
}
export function WorkspaceSelector({workspaces,select}){return <main className="login"><section><p className="eyebrow">ÁREAS HABILITADAS</p><h1>Seleccione el área de trabajo</h1></section><div className="card">{workspaces.map(x=><button key={x.id} onClick={()=>select(x.id)}>{x.label}</button>)}</div></main>;}
export function AdminApp() {
 const hashPage=()=>location.hash==="#/admin/aeronaves"?"aircraft":location.hash==="#/admin/geografia"?"geography":location.hash==="#/admin/ubicacion-comandantes"?"commander-locations":location.hash==="#/admin/pacientes"?"patients":location.hash==="#/admin/auditoria"?"audit":location.hash==="#/admin/habilitaciones"?"credentials":location.hash==="#/admin/mi-cuenta"?"account":location.hash==="#/admin/usuarios"?"users":location.hash==="#/admin/usuarios/desactivados"?"users-inactive":"dashboard";
 const [session,setSession]=useState(()=>{try{return JSON.parse(localStorage.getItem("vs-session"));}catch{return null;}}),[counts,setCounts]=useState(null),[me,setMe]=useState(null),[aircraft,setAircraft]=useState([]),[airports,setAirports]=useState([]),[provinces,setProvinces]=useState([]),[page,setPage]=useState(hashPage),[note,setNote]=useState(""),[dark,setDark]=useState(()=>localStorage.getItem("vs-theme")==="dark"),[workspace,setWorkspace]=useState(null),[userCreateOpen,setUserCreateOpen]=useState(false),[aircraftCreateOpen,setAircraftCreateOpen]=useState(false);
 const load=async()=>{
  // Cada recurso se carga por separado: una falla en aeronaves o catálogos no debe vaciar la gestión de usuarios.
  const sources=[["resumen de usuarios","/auth/users/summary",setCounts,false],["mi cuenta","/auth/me",setMe,false],["aeronaves","/catalogs/aircraft/admin",setAircraft,true],["aeropuertos","/catalogs/airports",setAirports,true],["provincias","/catalogs/provinces",setProvinces,true]];
  const results=await Promise.allSettled(sources.map(([, path])=>api(path)));
  if(results.some(result=>result.status==="rejected"&&result.reason?.status===401)){
   localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);return;
  }
  const failed=[];
  results.forEach((result,i)=>{const [label,,apply,isList]=sources[i];if(result.status==="fulfilled")apply(isList&&!Array.isArray(result.value)?[]:result.value);else failed.push(`${label}: ${result.reason?.message||"error"}`);});
  setNote(failed.length?`No se pudo cargar ${failed.join(" · ")}`:"");
 };
 const workspaces=workspaceForRoles(session?.roles); const active=workspace||(workspaces.length===1?workspaces[0].id:null);
 useEffect(()=>{if(session&&!session.debeCambiarContrasena&&active==="ADMIN")load();},[session,active]); useEffect(()=>{document.documentElement.dataset.theme=dark?"dark":"light";document.body.dataset.theme=dark?"dark":"light";localStorage.setItem("vs-theme",dark?"dark":"light");},[dark]);
 if(!session)return <Login set={setSession}/>; if(session.debeCambiarContrasena)return <PasswordRequired setSession={setSession}/>; if(workspaces.length>1&&!active)return <WorkspaceSelector workspaces={workspaces} select={setWorkspace}/>; if(active!=="ADMIN")return <OperationalApp workspace={active} workspaces={workspaces} changeWorkspace={setWorkspace}/>;
 const nav=(target)=>{setPage(target);history.replaceState(null,"",target==="account"?"#/admin/mi-cuenta":target==="aircraft"?"#/admin/aeronaves":target==="geography"?"#/admin/geografia":target==="commander-locations"?"#/admin/ubicacion-comandantes":target==="patients"?"#/admin/pacientes":target==="audit"?"#/admin/auditoria":target==="credentials"?"#/admin/habilitaciones":target==="users"?"#/admin/usuarios":target==="users-inactive"?"#/admin/usuarios/desactivados":"#/admin");}; const notify=(text,bad)=>setNote((bad?"":"✓ ")+text);
 const title=page==="users"?"Usuarios activos":page==="users-inactive"?"Usuarios desactivados":page==="aircraft"?"Aeronaves":page==="geography"?"Geografía":page==="commander-locations"?"Ubicación de comandantes":page==="patients"?"Pacientes":page==="audit"?"Auditoría":page==="credentials"?"Política de habilitaciones":page==="account"?"Mi cuenta":"Dashboard";
 return <div className="shell admin-shell"><aside aria-label="Navegación lateral"><div className="brand">✈ <span>Vuelos<br/>Sanitarios</span></div><nav aria-label="Secciones de administración"><button className={page==="dashboard"?"active":""} aria-current={page==="dashboard"?"page":undefined} onClick={()=>nav("dashboard")}>Inicio</button><button className={page==="users"||page==="users-inactive"?"active":""} aria-current={page==="users"||page==="users-inactive"?"page":undefined} onClick={()=>nav("users")}>Usuarios</button><button className={page==="aircraft"?"active":""} aria-current={page==="aircraft"?"page":undefined} onClick={()=>nav("aircraft")}>Aeronaves</button><button className={page==="geography"?"active":""} aria-current={page==="geography"?"page":undefined} onClick={()=>nav("geography")}>Geografía</button><button className={page==="commander-locations"?"active":""} aria-current={page==="commander-locations"?"page":undefined} onClick={()=>nav("commander-locations")}>Ubicación de comandantes</button><button className={page==="patients"?"active":""} aria-current={page==="patients"?"page":undefined} onClick={()=>nav("patients")}>Pacientes</button><button className={page==="audit"?"active":""} aria-current={page==="audit"?"page":undefined} onClick={()=>nav("audit")}>Auditoría</button><button className={page==="credentials"?"active":""} aria-current={page==="credentials"?"page":undefined} onClick={()=>nav("credentials")}>Habilitaciones</button><button className={page==="account"?"active":""} aria-current={page==="account"?"page":undefined} onClick={()=>nav("account")}>Mi cuenta</button></nav><button className="secondary" onClick={()=>{localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}}>Cerrar sesión</button></aside><main className="content"><header><div><p className="eyebrow">PANEL ADMINISTRADOR</p><h1>{title}</h1></div>{workspaces.length>1&&<button className="secondary-action" onClick={()=>setWorkspace(null)}>Cambiar área</button>}<button className="icon" onClick={()=>setDark(!dark)} aria-label="Cambiar tema">{dark?"☀":"◐"}</button></header>{note&&<p className={note.startsWith("✓")?"success":"error"}>{note}</p>}{page==="credentials"&&<CredentialPolicies notify={notify}/>}{page==="dashboard"&&<><AdminDashboard counts={counts} aircraft={aircraft} onAddUser={()=>setUserCreateOpen(true)} onAddAircraft={()=>setAircraftCreateOpen(true)} onUsers={()=>nav("users")}/><AdminUsers users={[]} provinces={provinces} reload={load} notify={notify} showList={false} createOpen={userCreateOpen} onCreateOpenChange={setUserCreateOpen}/><AdminAircraft items={aircraft} airports={airports} reload={load} notify={notify} showList={false} createOpen={aircraftCreateOpen} onCreateOpenChange={setAircraftCreateOpen}/></>}{(page==="users"||page==="users-inactive")&&<><div className="user-tabs"><button className={page==="users"?"selected-tab":"secondary-action"} onClick={()=>nav("users")}>Usuarios activos</button><button className={page==="users-inactive"?"selected-tab":"secondary-action"} onClick={()=>nav("users-inactive")}>Usuarios desactivados</button></div><AdminUsers users={[]} provinces={provinces} reload={load} notify={notify} showList={false} createOpen={userCreateOpen} onCreateOpenChange={setUserCreateOpen}/><UserDirectory active={page==="users"} notify={notify} onChanged={load} onCreate={()=>setUserCreateOpen(true)} reloadToken={counts?`${counts.activos}-${counts.pendientes}-${counts.inactivos}`:0}/>{page==="users"&&<AdminCrewQualifications notify={notify}/>}</>} {page==="audit"&&<AdminAudit/>}{page==="patients"&&<PatientMaintenance notify={notify}/>} {page==="aircraft"&&<AdminAircraft items={aircraft} airports={airports} reload={load} notify={notify}/>} {page==="geography"&&<GeographicCatalog notify={notify}/>} {page==="commander-locations"&&<CommanderLocations notify={notify}/>} {page==="account"&&me&&<MyAccount user={me} reload={load} notify={notify} onPasswordChanged={()=>{localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}}/>}</main></div>;
}
const root=document.getElementById("root");
if(root)createRoot(root).render(<AdminApp />);
