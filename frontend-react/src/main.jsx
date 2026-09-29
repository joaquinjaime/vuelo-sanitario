import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { workspaceForRoles } from "./workspace";
import "./styles.css";
const s = (s) => `status status-${s?.toLowerCase()}`;
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
const locationLabel = (location) => location ? `${location.nombre}, ${location.provincia}` : "—";
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
  const [p, setP] = useState(""),
    [provinces, setProvinces] = useState([]), [originProvince, setOriginProvince] = useState(""), [destinationProvince, setDestinationProvince] = useState(""), [origin, setOrigin] = useState(null), [destination, setDestination] = useState(null), [locationError, setLocationError] = useState(""),
    [f, setF] = useState({
      nombre: "",
      apellido: "",
      prioridad: "ALTA",
      motivo: "",
      diagnostico: "",
      condicion: "ESTABLE",
      solicitada: "",
      urgente: false,
      justificacion: "",
      limite: "",
    });
  let change = (k, v) => setF({ ...f, [k]: v });
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
          if (!origin || !destination) { setLocationError("Seleccione una localidad válida de origen y destino."); return; }
          try {
            let id = p;
            if (!id)
              id = (
                await api("/patients", {
                  method: "POST",
                  body: JSON.stringify({
                    nombre: f.nombre,
                    apellido: f.apellido,
                  }),
                })
              ).id;
            await api("/flights", {
              method: "POST",
              body: JSON.stringify({
                patientId: id,
                localidadOrigenId: origin.id,
                localidadDestinoId: destination.id,
                priorityCode: f.prioridad,
                motivoSolicitud: f.motivo,
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
            done();
          } catch (x) {
            msg(x.message, true);
          }
        }}
      >
        <label>
          Paciente
          <select value={p} onChange={(e) => setP(e.target.value)}>
            <option value="">Registrar paciente</option>
            {d.patients.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre} {x.apellido}
              </option>
            ))}
          </select>
        </label>
        {!p && (
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
        <button>Crear solicitud</button>
      </form>
    </section>
  );
}
function DtsResponses({ d, done, msg }) {
 const [id,setId]=useState(""),[detail,setDetail]=useState(null),[reason,setReason]=useState("");
 useEffect(()=>{if(id)api(`/flights/${id}`).then(setDetail).catch(e=>msg(e.message,true));else setDetail(null);},[id]); const f=detail?.vuelo;
 const respond=async aceptar=>{try{await api(`/flights/${id}/schedule/response`,{method:"POST",body:JSON.stringify({aceptar,motivoRechazo:aceptar?null:reason})});msg(aceptar?"Contrapropuesta aceptada":"Solicitud cancelada");await done();setDetail(await api(`/flights/${id}`));}catch(e){msg(e.message,true);}};
 return <section className="card"><h2>Mis solicitudes y contrapropuestas</h2><div className="grid-form"><label>Solicitud<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.codigo} — {x.estado}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>Horario propuesto por DTS</h4><p>{dt(f.solicitada)}</p></div><div><h4>Horario definitivo</h4><p>{f.salida?dt(f.salida):"Pendiente"}</p></div></div><Negotiation events={detail.negociacion}/>{f.estado==="PENDIENTE_RESPUESTA_DTS"&&<div className="wide detail-actions"><p>Existe una contrapropuesta de Centro de Operaciones. Sólo puede aceptarla o rechazarla.</p><button onClick={()=>respond(true)}>Aceptar contrapropuesta</button><label>Motivo de rechazo<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="secondary-action" disabled={!reason.trim()} onClick={()=>respond(false)}>Rechazar contrapropuesta</button></div>}</>}</div></section>;
}
const Negotiation = ({ events=[] }) => <div className="wide"><h4>Historial de negociación</h4>{events.map((e,i)=><p key={i}><strong>{e.tipo.replaceAll("_"," ")}</strong>{e.fechaHoraPropuesta&&`: ${dt(e.fechaHoraPropuesta)}`}{e.motivo&&` — ${e.motivo}`}</p>)}</div>;
export function Ops({ d, done, msg }) {
 const [id,setId]=useState(""),[detail,setDetail]=useState(null),[counter,setCounter]=useState(""),[reason,setReason]=useState(""),[aircraft,setAircraft]=useState([]),[commanders,setCommanders]=useState([]),[a,setA]=useState(""),[c,setC]=useState(""),[provinces,setProvinces]=useState([]);
 const load=async flightId=>{if(!flightId)return;try{setDetail(await api(`/flights/${flightId}`));}catch(e){msg(e.message,true);}};
 useEffect(()=>{api("/catalogs/provinces").then(setProvinces).catch(e=>msg(e.message,true));},[]); useEffect(()=>{setDetail(null);setAircraft([]);setCommanders([]);setA("");setC("");load(id);},[id]);
 const call=async(path,body,success)=>{try{await api(path,{method:"POST",body:body&&JSON.stringify(body)});msg(success);await done();await load(id);}catch(e){msg(e.message,true);}}; const f=detail?.vuelo;
 const resources=async()=>{try{const [as,cs]=await Promise.all([api(`/flights/${id}/available-aircraft`),api(`/flights/${id}/available-commanders`)]);setAircraft(as);setCommanders(cs);}catch(e){msg(e.message,true);}};
 return <section className="card"><h2>Centro de Operaciones</h2><div className="grid-form"><label>Solicitud<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.codigo} — {x.estado}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>Propuesta DTS</h4><p>{dt(f.solicitada)}</p><p>{locationLabel(f.origen)} → {locationLabel(f.destino)}</p></div><div><h4>Horario definitivo</h4><p>{f.salida?dt(f.salida):"Aún en negociación"}</p></div></div><Urgency flight={f} detail/><Negotiation events={detail.negociacion}/>{f.estado==="SOLICITADO"&&<div className="wide detail-actions"><button onClick={()=>call(`/flights/${id}/schedule/accept`,null,"Horario aceptado")}>Aceptar horario DTS</button><label>Nueva fecha y hora<input type="datetime-local" value={counter} onChange={e=>setCounter(e.target.value)}/></label><label>Motivo<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={!counter||!reason.trim()} onClick={()=>call(`/flights/${id}/schedule/counterproposal`,{salida:counter,motivo:reason},"Contrapropuesta enviada")}>Contrapropone</button><button className="secondary-action" disabled={!reason.trim()} onClick={()=>call(`/flights/${id}/schedule/reject`,{motivo:reason},"Solicitud cancelada")}>Rechazar solicitud</button></div>}{f.estado==="APROBADO"&&<div className="wide detail-actions"><h4>Asignación de recursos</h4><button onClick={resources}>Consultar disponibilidad</button>{aircraft.length>0&&<label>Aeronave<select value={a} onChange={e=>setA(e.target.value)}><option value="">Seleccionar</option>{aircraft.map(x=><option key={x.id} value={x.id}>{x.matricula} — {x.aeropuertoActual}</option>)}</select></label>}{commanders.length>0&&<label>Comandante<select value={c} onChange={e=>setC(e.target.value)}><option value="">Seleccionar</option>{commanders.map(x=><option key={x.id} value={x.id}>{x.nombre} {x.apellido} — {x.provinciaActual}</option>)}</select></label>}<button disabled={!a||!c} onClick={()=>call(`/flights/${id}/resources`,{aircraftId:a,comandanteId:c},"Recursos asignados")}>Confirmar asignación</button></div>}{f.estado==="PLANIFICADO"&&<p className="success wide">Recursos asignados. El comandante debe completar la planificación operativa.</p>}</>}</div><section className="card"><h3>Ubicación de comandantes</h3>{d.commanders.map(x=><label key={x.id}>{x.nombre} {x.apellido} — {x.provinciaActual||"Sin configurar"}<select aria-label={`Provincia de ${x.nombre}`} value="" onChange={async e=>{if(!e.target.value)return;try{await api(`/catalogs/commanders/${x.id}/location`,{method:"POST",body:JSON.stringify({locationId:e.target.value})});msg("Ubicación actualizada");await done();}catch(err){msg(err.message,true)}}}><option value="">Establecer provincia</option>{provinces.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>)}</section></section>;
}
function Cmd({ d, done, msg }) {
 const [id,setId]=useState(""),[detail,setDetail]=useState(null),[origin,setOrigin]=useState(""),[destination,setDestination]=useState(""),[arrival,setArrival]=useState(""),[airports,setAirports]=useState([]);
 useEffect(()=>{if(!id){setDetail(null);return;}api(`/flights/${id}`).then(setDetail).catch(e=>msg(e.message,true));},[id]); const f=detail?.vuelo;
 useEffect(()=>{if(!f)return;Promise.all([api(`/catalogs/airports?provinceId=${f.origen.provinciaId}`),api(`/catalogs/airports?provinceId=${f.destino.provinciaId}`)]).then(([o,de])=>setAirports([{kind:"o",items:o},{kind:"d",items:de}])).catch(e=>msg(e.message,true));},[f?.id]); const originOptions=airports.find(x=>x.kind==="o")?.items||[],destinationOptions=airports.find(x=>x.kind==="d")?.items||[];
 const save=async()=>{try{await api(`/flights/${id}/operational-planning`,{method:"POST",body:JSON.stringify({origenId:origin,destinoId:destination,llegada:arrival})});msg("Planificación operativa guardada");await done();setDetail(await api(`/flights/${id}`));}catch(e){msg(e.message,true);}};
 return <section className="card"><h2>Planificación operativa</h2><p className="hint">La salida definitiva proviene de la negociación DTS–Operaciones y no es editable.</p><div className="grid-form"><label>Vuelo<select value={id} onChange={e=>setId(e.target.value)}><option value="">Seleccionar vuelo</option>{d.flights.map(x=><option key={x.id} value={x.id}>{x.codigo} — {x.estado}</option>)}</select></label>{f&&<><div className="wide detail-grid"><div><h4>Salida fijada</h4><p>{dt(f.salida)}</p></div><div><h4>Recursos</h4><p>{detail.recursos?.aircraftMatricula||"—"}</p></div></div>{f.estado==="PLANIFICADO"&&<><label>Aeropuerto de origen<select value={origin} onChange={e=>setOrigin(e.target.value)}><option value="">Seleccionar ({f.origen.provincia})</option>{originOptions.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label>Aeropuerto de destino<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Seleccionar ({f.destino.provincia})</option>{destinationOptions.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label>Llegada planificada<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)}/></label><button disabled={!origin||!destination||!arrival} onClick={save}>Guardar planificación</button></>}<Negotiation events={detail.negociacion}/></>}</div></section>;
}
function CommanderReports({ msg }) {
  const [items, setItems] = useState([]),
    [text, setText] = useState({});
  const load = async () => {
    try {
      setItems(await api("/final-reports/mine"));
    } catch (e) {
      msg(e.message, true);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const call = async (path, body) => {
    try {
      await api(path, { method: "POST", body: body && JSON.stringify(body) });
      msg("Informe actualizado");
      load();
    } catch (e) {
      msg(e.message, true);
    }
  };
  const blocked = items.some((x) => x.bloqueado);
  return (
    <section className={blocked ? "card report-blocked" : "card"}>
      <h2>
        {blocked
          ? "⚠ FUNCIONES BLOQUEADAS: INFORME FINAL VENCIDO"
          : "Informes finales pendientes"}
      </h2>
      <p className="hint">
        El vencimiento lo calcula el servidor. Presentar una versión válida
        restablece las funciones.
      </p>
      {items
        .filter((x) => x.status !== "APROBADO")
        .map((x) => (
          <article className="report-item" key={x.id}>
            <h3>
              {x.flightCode} · {x.status}
            </h3>
            <p>
              Vence: {dt(x.vencimiento)}{" "}
              {x.prorrogaUsada
                ? "(prórroga utilizada)"
                : "(prórroga disponible)"}
            </p>
            {x.motivoDevolucion && (
              <p className="error">Devuelto: {x.motivoDevolucion}</p>
            )}
            {(x.status === "PENDIENTE" || x.status === "DEVUELTO") && (
              <>
                <label>
                  Informe de texto
                  <textarea
                    value={text[x.id] || ""}
                    onChange={(e) =>
                      setText({ ...text, [x.id]: e.target.value })
                    }
                    placeholder="Describa la ejecución del vuelo"
                  />
                </label>
                <div className="report-actions">
                  <button
                    disabled={!(text[x.id] || "").trim()}
                    onClick={() =>
                      call(`/final-reports/${x.id}/submit`, {
                        texto: text[x.id],
                      })
                    }
                  >
                    Presentar informe
                  </button>
                  {!x.prorrogaUsada && (
                    <button
                      className="secondary-action"
                      onClick={() => call(`/final-reports/${x.id}/extension`)}
                    >
                      Solicitar prórroga de 24 h
                    </button>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
    </section>
  );
}
function OperationsReports({ msg }) {
  const [items, setItems] = useState([]),
    [reason, setReason] = useState({});
  const load = async () => {
    try {
      setItems(await api("/final-reports/pending-review"));
    } catch (e) {
      msg(e.message, true);
    }
  };
  useEffect(() => {
    load();
  }, []);
  let review = async (id, aprobar) => {
    try {
      await api(`/final-reports/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ aprobar, motivoDevolucion: reason[id] }),
      });
      msg(aprobar ? "Informe aprobado y vuelo completado" : "Informe devuelto");
      load();
    } catch (e) {
      msg(e.message, true);
    }
  };
  return (
    <section className="card">
      <h2>Revisión de informes finales</h2>
      {items.length ? (
        items.map((x) => (
          <article className="report-item" key={x.id}>
            <strong>{x.flightCode}</strong>
            <p>
              Presentado: {dt(x.presentadoEn)} · vencimiento:{" "}
              {dt(x.vencimiento)}
            </p>
            <button onClick={() => review(x.id, true)}>
              Aprobar y completar vuelo
            </button>
            <label className="wide">
              Motivo de devolución
              <textarea
                value={reason[x.id] || ""}
                onChange={(e) =>
                  setReason({ ...reason, [x.id]: e.target.value })
                }
              />
            </label>
            <button
              className="secondary-action"
              disabled={!(reason[x.id] || "").trim()}
              onClick={() => review(x.id, false)}
            >
              Devolver para corrección
            </button>
          </article>
        ))
      ) : (
        <p className="empty">No hay informes pendientes de revisión.</p>
      )}
    </section>
  );
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
      patients: [],
      priorities: [],
      aircraft: [],
      airports: [],
      commanders: [],
      notifications: [],
    }),
    [note, setNote] = useState(""),
    [dark, setDark] = useState(false);
  let has = (x) => session?.roles.includes(x);
  let load = async () => {
    try {
      let calls = [
        api("/flights"),
        api("/patients"),
        api("/catalogs/priorities"),
        api("/catalogs/aircraft"),
        api("/catalogs/airports"),
        api("/notifications"),
      ];
      if (has("OPERACIONES") || has("CENTRO_OPERACIONES")) calls.push(api("/auth/users/commanders"));
      let [a, b, c, e, f, n, u = []] = await Promise.all(calls);
      setD({
        flights: a,
        patients: b,
        priorities: c,
        aircraft: e,
        airports: f,
        notifications: n.content || [],
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
          <a className="active">{workspace === "DTS" ? "Dirección de Tránsito Sanitario" : workspace === "COMANDANTE" ? "Comandante" : "Centro de Operaciones"}</a>
          <a>Vuelos</a>
          <a>Notificaciones</a>
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
            <button className="icon">🔔 {d.notifications.length}</button>
          </div>
        </header>
        {note && (
          <p className={note.startsWith("✓") ? "success" : "error"}>{note}</p>
        )}
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
            <CommanderReports msg={msg} />
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
                  <th>Modalidad</th>
                  <th>Prioridad</th>
                  <th>Fecha solicitada</th>
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
                    <td>
                      <Urgency flight={x} />
                      {x.extremaUrgencia && (
                        <small>Límite: {dt(x.fechaLimiteTraslado)}</small>
                      )}
                    </td>
                    <td>{x.prioridad}</td>
                    <td>{dt(x.solicitada)}</td>
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
      </main>
    </div>
  );
}
function MyAccount({ user, reload, notify }) {
  const [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [password, setPassword] = useState({ passwordActual: "", nuevaPassword: "", confirmacionPassword: "" });
  const call = async (path, options = {}) => { try { await api(path, options); await reload(); notify("Cambios guardados"); } catch (e) { notify(e.message, true); } };
  return <section className="card"><h2>Mi cuenta</h2><p>{user.nombre} {user.apellido} · DNI {user.dni || "—"}</p>
    <div className="account-columns"><div><h3>Correos</h3>{user.correos.map(x => <p className="contact" key={x.id}>{x.valor} {x.principal && <strong>Principal</strong>} {!x.principal && <button onClick={() => call(`/auth/me/correos/${x.id}/principal`, { method: "POST" })}>Principal</button>} {user.correos.length > 1 && <button onClick={() => call(`/auth/me/correos/${x.id}`, { method: "DELETE" })}>Eliminar</button>}</p>)}<form onSubmit={e => {e.preventDefault(); call("/auth/me/correos", {method:"POST",body:JSON.stringify({direccion:email})});setEmail("");}}><input type="email" required placeholder="nuevo correo" value={email} onChange={e=>setEmail(e.target.value)}/><button>Agregar</button></form></div>
    <div><h3>Teléfonos</h3>{user.telefonos.map(x => <p className="contact" key={x.id}>{x.valor} {x.principal && <strong>Principal</strong>} {!x.principal && <button onClick={() => call(`/auth/me/telefonos/${x.id}/principal`, { method: "POST" })}>Principal</button>} {user.telefonos.length > 1 && <button onClick={() => call(`/auth/me/telefonos/${x.id}`, { method: "DELETE" })}>Eliminar</button>}</p>)}<form onSubmit={e => {e.preventDefault(); call("/auth/me/telefonos", {method:"POST",body:JSON.stringify({numero:phone})});setPhone("");}}><input required placeholder="nuevo teléfono" value={phone} onChange={e=>setPhone(e.target.value)}/><button>Agregar</button></form></div></div>
    <h3>Cambiar contraseña</h3><form className="grid-form" onSubmit={e=>{e.preventDefault();call("/auth/me/password",{method:"POST",body:JSON.stringify(password)});}}>{[["passwordActual","Contraseña actual"],["nuevaPassword","Nueva contraseña"],["confirmacionPassword","Confirmar contraseña"]].map(([key,label])=><label key={key}>{label}<input type="password" required value={password[key]} onChange={e=>setPassword({...password,[key]:e.target.value})}/></label>)}<button>Actualizar contraseña</button></form>
  </section>;
}
function PasswordRequired({ setSession }) {
 const [form,setForm]=useState({passwordActual:"",nuevaPassword:"",confirmacionPassword:""}),[error,setError]=useState("");
 return <main className="login"><section><p className="eyebrow">SEGURIDAD DE LA CUENTA</p><h1>Actualizá tu contraseña</h1><p>La contraseña temporal sólo permite este cambio antes de continuar.</p></section><form onSubmit={async e=>{e.preventDefault();try{await api("/auth/me/password",{method:"POST",body:JSON.stringify(form)});localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}catch(x){setError(x.message);}}}><h2>Nueva contraseña</h2>{error&&<p className="error">{error}</p>}{[["passwordActual","Contraseña temporal"],["nuevaPassword","Nueva contraseña"],["confirmacionPassword","Confirmar contraseña"]].map(([key,label])=><label key={key}>{label}<input type="password" required value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<button>Guardar y volver a ingresar</button></form></main>;
}
export function AdminUsers({ users, provinces = [], reload, notify, active = true, createOpen, onCreateOpenChange, showList = true }) {
 const emptyForm=()=>({nombre:"",apellido:"",dni:"",fechaNacimiento:"",licenciaAeronautica:"",roles:[],correos:[{direccion:"",tipo:"PERSONAL"}],telefonos:[{numero:"",tipo:"PERSONAL"}]});
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
 const create=async e=>{e.preventDefault();try{const r=await api("/auth/users",{method:"POST",body:JSON.stringify({...form,fechaNacimiento:form.fechaNacimiento||null})});receiveActivationCode(r);closeNewUser();await reload();notify("Cuenta pendiente creada. Guardá el código de activación antes de continuar.");}catch(x){if(x.code==="INACTIVE_USER_WITH_DNI_EXISTS"&&x.userId){const existing=users.find(u=>u.id===x.userId);closeNewUser();if(existing&&confirm(`${x.message}\n\n${existing.nombre} ${existing.apellido} · ${existing.username||"sin usuario"}\n\n¿Revisar y reactivar la cuenta existente?`)){openReactivate(existing);return;}}notify(x.message,true);}};
 const shown=users.filter(x=>(active?x.activo!==false:x.activo===false)&&(!query||`${x.nombre} ${x.apellido} ${x.dni} ${x.username||""}`.toLowerCase().includes(query.toLowerCase()))&&(!role||(x.roles||[]).includes(role)));
 const setCommanderProvince=async(x,id)=>{try{await api(`/catalogs/commanders/${x.id}/location`,{method:"POST",body:JSON.stringify({locationId:id})});await reload();notify("Ubicación del comandante actualizada");}catch(e){notify(e.message,true);}};
 return <>{activationCode&&<div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true" aria-labelledby="activation-code-title"><p className="eyebrow">CUENTA PENDIENTE CREADA</p><h2 id="activation-code-title">Código de activación</h2><p>Este código se mostrará una sola vez. Guardalo antes de cerrar este aviso.</p><code>{activationCode}</code><div className="form-actions"><button onClick={()=>navigator.clipboard?.writeText(activationCode)}>Copiar</button><button className="secondary-action" onClick={dismissCode}>Cerrar aviso</button></div></section></div>}{reactivating&&<div className="activation-modal-backdrop" role="presentation"><form className="activation-modal grid-form" onSubmit={reactivate}><p className="eyebrow">REACTIVAR USUARIO</p><h2>Revisar cuenta existente</h2><p>Se conserva el DNI y todo el historial. Podés actualizar los datos administrativos antes de continuar.</p><label>Nombre<input required value={reactivating.nombre} onChange={e=>setReactivating({...reactivating,nombre:e.target.value})}/></label><label>Apellido<input required value={reactivating.apellido} onChange={e=>setReactivating({...reactivating,apellido:e.target.value})}/></label><label>Fecha de nacimiento<input type="date" value={reactivating.fechaNacimiento} onChange={e=>setReactivating({...reactivating,fechaNacimiento:e.target.value})}/></label><fieldset><legend>Roles</legend>{allRoles.map(r=><label className="check" key={r}><input type="checkbox" checked={reactivating.roles.includes(r)} onChange={()=>setReactivating({...reactivating,roles:reactivating.roles.includes(r)?reactivating.roles.filter(x=>x!==r):[...reactivating.roles,r]})}/>{r}</label>)}</fieldset>{reactivating.roles.includes("COMANDANTE")&&<label>Licencia aeronáutica<input value={reactivating.licenciaAeronautica} onChange={e=>setReactivating({...reactivating,licenciaAeronautica:e.target.value})}/></label>}<div className="form-actions"><button>Reactivar y generar contraseña</button><button type="button" className="secondary-action" onClick={()=>setReactivating(null)}>Cancelar</button></div></form></div>}{reactivation&&<div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true"><p className="eyebrow">USUARIO REACTIVADO</p><h2>Contraseña temporal</h2><p>Usuario: <strong>{reactivation.username}</strong>. Esta contraseña se muestra una única vez; deberá cambiarla al iniciar sesión.</p><code>{reactivation.password}</code><div className="form-actions"><button onClick={()=>navigator.clipboard?.writeText(reactivation.password)}>Copiar</button><button className="secondary-action" onClick={()=>setReactivation(null)}>Cerrar aviso</button></div></section></div>}{open&&<div className="activation-modal-backdrop" role="presentation"><form className="activation-modal grid-form" onSubmit={create}><p className="eyebrow wide">ADMINISTRACIÓN</p><h2 className="wide">Añadir usuario</h2><label>Nombre<input required value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/></label><label>Apellido<input required value={form.apellido} onChange={e=>setForm({...form,apellido:e.target.value})}/></label><label>DNI<input required value={form.dni} onChange={e=>setForm({...form,dni:e.target.value})}/></label><label>Fecha de nacimiento<input type="date" value={form.fechaNacimiento} onChange={e=>setForm({...form,fechaNacimiento:e.target.value})}/></label><label>Correo principal<input type="email" required value={form.correos[0].direccion} onChange={e=>setForm({...form,correos:[{direccion:e.target.value,tipo:"PERSONAL"}]})}/></label><label>Teléfono principal<input required value={form.telefonos[0].numero} onChange={e=>setForm({...form,telefonos:[{numero:e.target.value,tipo:"PERSONAL"}]})}/></label><fieldset className="wide"><legend>Roles</legend>{allRoles.map(r=><label className="check" key={r}><input type="checkbox" checked={form.roles.includes(r)} onChange={()=>toggle(r)}/>{r}</label>)}</fieldset>{form.roles.includes("COMANDANTE")&&<label>Número de licencia<input required value={form.licenciaAeronautica} onChange={e=>setForm({...form,licenciaAeronautica:e.target.value})}/></label>}<div className="wide form-actions"><button>Crear cuenta pendiente</button><button type="button" className="secondary-action" onClick={closeNewUser}>Cancelar</button></div></form></div>}{showList&&<section className="card"><div className="section-title"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>{active?"Usuarios activos":"Usuarios desactivados"}</h1><p>{shown.length} {active?"cuentas activas o pendientes de activación":"cuentas dadas de baja"}</p></div>{active&&<button onClick={openNewUser}>Nuevo usuario</button>}</div><div className="filters"><input placeholder="Buscar por nombre, DNI o usuario" value={query} onChange={e=>setQuery(e.target.value)}/><select value={role} onChange={e=>setRole(e.target.value)}><option value="">Todos los roles</option>{allRoles.map(x=><option key={x}>{x}</option>)}</select></div>{shown.length?<table><thead><tr><th>Nombre</th><th>Apellido</th><th>DNI</th><th>Usuario</th><th>Rol</th><th>Ubicación actual</th>{!active&&<th>Fecha de baja</th>}<th>Acciones</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td>{x.nombre}</td><td>{x.apellido}</td><td>{x.dni}</td><td>{x.username||"—"}</td><td>{(x.roles||[]).join(", ")}</td><td>{(x.roles||[]).includes("COMANDANTE")?(active?<select aria-label={`Ubicación de ${x.nombre}`} value="" onChange={e=>e.target.value&&setCommanderProvince(x,e.target.value)}><option value="">{x.provinciaActual||"Sin configurar"}</option>{provinces.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select>:(x.provinciaActual||"Sin configurar")):"—"}</td>{!active&&<td>{dt(x.fechaBaja)}</td>}<td>{active&&x.estado==="PENDIENTE_ACTIVACION"&&<button onClick={async()=>{try{receiveActivationCode(await api(`/auth/users/${x.id}/activation-code`,{method:"POST"}));reload();}catch(e){notify(e.message,true)}}}>Regenerar código</button>}{active&&x.username&&<button className="secondary-action" onClick={async()=>{if(!confirm(`¿Desactivar usuario? ${x.nombre} ${x.apellido} conservará su historial.`))return;try{await api(`/auth/users/${x.id}/deactivate`,{method:"PATCH",body:JSON.stringify({})});await reload();notify("Usuario desactivado");}catch(e){notify(e.message,true)}}}>Desactivar</button>}{!active&&x.username&&<button className="secondary-action" onClick={()=>openReactivate(x)}>Reactivar</button>}</td></tr>)}</tbody></table>:<p className="empty">No hay usuarios {active?"activos":"desactivados"} para mostrar.</p>}</section>}</>;
}
export function AdminAircraft({ items, airports, reload, notify, createOpen, onCreateOpenChange, showList = true }) {
 const empty=()=>({matricula:"",modelo:"",tipo:"",capacidadPacientes:1,capacidadTripulacion:2,equipamientoMedico:"",aeropuertoActualId:"",activo:true});
 const [form,setForm]=useState(empty),[editing,setEditing]=useState(null),[localOpen,setLocalOpen]=useState(false);
 const open=createOpen===undefined?localOpen:createOpen;
 const setOpen=(value)=>{if(createOpen===undefined)setLocalOpen(value);else onCreateOpenChange?.(value);};
 useEffect(()=>{if(createOpen!==undefined&&createOpen){setForm(empty());setEditing(null);}},[createOpen]);
 const edit=(x)=>{setForm({matricula:x.matricula,modelo:x.modelo,tipo:x.tipo,capacidadPacientes:x.capacidadPacientes,capacidadTripulacion:x.capacidadTripulacion,equipamientoMedico:x.equipamientoMedico||"",aeropuertoActualId:x.aeropuertoActualId||"",activo:x.activo});setEditing(x.id);setOpen(true);};
 const save=async e=>{e.preventDefault();try{await api(editing?`/catalogs/aircraft/${editing}`:"/catalogs/aircraft",{method:editing?"PUT":"POST",body:JSON.stringify({...form,capacidadPacientes:Number(form.capacidadPacientes),capacidadTripulacion:Number(form.capacidadTripulacion)})});setOpen(false);setEditing(null);setForm(empty());await reload();notify(editing?"Aeronave actualizada":"Aeronave registrada");}catch(x){notify(x.message,true);}};
 return <>{open&&<div className="activation-modal-backdrop" role="presentation"><form className="activation-modal grid-form" onSubmit={save}><p className="eyebrow wide">ADMINISTRACIÓN</p><h2 className="wide">{editing?"Editar aeronave":"Añadir aeronave"}</h2><label>Matrícula<input required maxLength="20" value={form.matricula} onChange={e=>setForm({...form,matricula:e.target.value})}/></label><label>Modelo<input required value={form.modelo} onChange={e=>setForm({...form,modelo:e.target.value})}/></label><label>Tipo<input required value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}/></label><label>Capacidad de pacientes<input required min="1" type="number" value={form.capacidadPacientes} onChange={e=>setForm({...form,capacidadPacientes:e.target.value})}/></label><label>Capacidad de tripulación<input required min="1" type="number" value={form.capacidadTripulacion} onChange={e=>setForm({...form,capacidadTripulacion:e.target.value})}/></label><label>Ubicación actual<select required value={form.aeropuertoActualId} onChange={e=>setForm({...form,aeropuertoActualId:e.target.value})}><option value="">Seleccionar aeropuerto</option>{airports.map(a=><option key={a.id} value={a.id}>{a.nombre}{a.codigoIata?` (${a.codigoIata})`:""}</option>)}</select></label><label className="wide">Equipamiento médico<textarea value={form.equipamientoMedico} onChange={e=>setForm({...form,equipamientoMedico:e.target.value})}/></label><label className="check"><input type="checkbox" checked={form.activo} onChange={e=>setForm({...form,activo:e.target.checked})}/> Activa y operativa</label><div className="wide form-actions"><button>{editing?"Guardar cambios":"Registrar aeronave"}</button><button type="button" className="secondary-action" onClick={()=>{setOpen(false);setEditing(null);setForm(empty());}}>Cancelar</button></div></form></div>}{showList&&<section className="card"><div className="section-title"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Aeronaves</h1><p>Ubicación actual, capacidad y estado operativo administrativo.</p></div><button onClick={()=>{setForm(empty());setEditing(null);setOpen(true);}}>Nueva aeronave</button></div><table><thead><tr><th>Matrícula</th><th>Modelo</th><th>Tipo</th><th>Ubicación actual</th><th>Estado</th><th /></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.matricula}</td><td>{x.modelo}</td><td>{x.tipo}</td><td>{x.aeropuertoActual||"Sin ubicación"}</td><td><span className={x.activo?"status status-planificado":"status status-cancelado"}>{x.activo?"ACTIVA":"INACTIVA"}</span></td><td><button onClick={()=>edit(x)}>Editar</button><button className="secondary-action" onClick={async()=>{try{await api(`/catalogs/aircraft/${x.id}/active`,{method:"POST",body:JSON.stringify({activo:!x.activo})});await reload();notify(x.activo?"Aeronave desactivada":"Aeronave activada");}catch(e){notify(e.message,true)}}}>{x.activo?"Desactivar":"Activar"}</button></td></tr>)}</tbody></table></section>}</>;
}
function AdminDashboard({ users, aircraft, onAddUser, onAddAircraft }) {
 const userItems=Array.isArray(users)?users:[], aircraftItems=Array.isArray(aircraft)?aircraft:[];
 const activeUsers=userItems.filter(x=>x.activo!==false).length, inactiveUsers=userItems.filter(x=>x.activo===false).length, activeAircraft=aircraftItems.filter(x=>x.activo).length;
 return <><section className="card admin-welcome"><p className="eyebrow">ADMINISTRACIÓN</p><h2>Panel de administración</h2><p className="hint">Accesos rápidos y un resumen del estado operativo.</p><div className="quick-actions"><button className="quick-action" onClick={onAddUser}><span aria-hidden="true">＋</span><strong>Añadir usuario</strong><small>Crear una cuenta y emitir su código de activación.</small></button><button className="quick-action" onClick={onAddAircraft}><span aria-hidden="true">＋</span><strong>Añadir aeronave</strong><small>Registrar capacidad, ubicación y estado operativo.</small></button></div></section><section className="metrics admin-metrics"><article><span>Usuarios activos</span><strong>{activeUsers}</strong></article><article><span>Usuarios desactivados</span><strong>{inactiveUsers}</strong></article><article><span>Aeronaves activas</span><strong>{activeAircraft}</strong></article></section></>;
}
export function WorkspaceSelector({workspaces,select}){return <main className="login"><section><p className="eyebrow">ÁREAS HABILITADAS</p><h1>Seleccione el área de trabajo</h1></section><div className="card">{workspaces.map(x=><button key={x.id} onClick={()=>select(x.id)}>{x.label}</button>)}</div></main>;}
export function AdminApp() {
 const hashPage=()=>location.hash==="#/admin/aeronaves"?"aircraft":location.hash==="#/admin/mi-cuenta"?"account":location.hash==="#/admin/usuarios"?"users":location.hash==="#/admin/usuarios/desactivados"?"users-inactive":"dashboard";
 const [session,setSession]=useState(()=>{try{return JSON.parse(localStorage.getItem("vs-session"));}catch{return null;}}),[users,setUsers]=useState([]),[me,setMe]=useState(null),[aircraft,setAircraft]=useState([]),[airports,setAirports]=useState([]),[provinces,setProvinces]=useState([]),[page,setPage]=useState(hashPage),[note,setNote]=useState(""),[dark,setDark]=useState(()=>localStorage.getItem("vs-theme")==="dark"),[workspace,setWorkspace]=useState(null),[userCreateOpen,setUserCreateOpen]=useState(false),[aircraftCreateOpen,setAircraftCreateOpen]=useState(false);
 const load=async()=>{
  // Cada recurso se carga por separado: una falla en aeronaves o catálogos no debe vaciar la gestión de usuarios.
  const sources=[["usuarios","/auth/users",setUsers,true],["mi cuenta","/auth/me",setMe,false],["aeronaves","/catalogs/aircraft/admin",setAircraft,true],["aeropuertos","/catalogs/airports",setAirports,true],["provincias","/catalogs/provinces",setProvinces,true]];
  const results=await Promise.allSettled(sources.map(([, path])=>api(path)));
  const failed=[];
  results.forEach((result,i)=>{const [label,,apply,isList]=sources[i];if(result.status==="fulfilled")apply(isList&&!Array.isArray(result.value)?[]:result.value);else failed.push(`${label}: ${result.reason?.message||"error"}`);});
  setNote(failed.length?`No se pudo cargar ${failed.join(" · ")}`:"");
 };
 useEffect(()=>{if(session)load();},[session]); useEffect(()=>{document.documentElement.dataset.theme=dark?"dark":"light";document.body.dataset.theme=dark?"dark":"light";localStorage.setItem("vs-theme",dark?"dark":"light");},[dark]);
 if(!session)return <Login set={setSession}/>; if(session.debeCambiarContrasena)return <PasswordRequired setSession={setSession}/>; const workspaces=workspaceForRoles(session.roles); const active=workspace||(workspaces.length===1?workspaces[0].id:null); if(workspaces.length>1&&!active)return <WorkspaceSelector workspaces={workspaces} select={setWorkspace}/>; if(active!=="ADMIN")return <OperationalApp workspace={active} workspaces={workspaces} changeWorkspace={setWorkspace}/>;
 const nav=(target)=>{setPage(target);history.replaceState(null,"",target==="account"?"#/admin/mi-cuenta":target==="aircraft"?"#/admin/aeronaves":target==="users"?"#/admin/usuarios":target==="users-inactive"?"#/admin/usuarios/desactivados":"#/admin");}; const notify=(text,bad)=>setNote((bad?"":"✓ ")+text);
 const title=page==="users"?"Usuarios activos":page==="users-inactive"?"Usuarios desactivados":page==="aircraft"?"Aeronaves":page==="account"?"Mi cuenta":"Dashboard";
 return <div className="shell admin-shell"><aside><div className="brand">✈ <span>Vuelos<br/>Sanitarios</span></div><nav><a className={page==="dashboard"?"active":""} onClick={()=>nav("dashboard")}>Dashboard</a><a className={page==="users"||page==="users-inactive"?"active":""} onClick={()=>nav("users")}>Usuarios</a><a className={page==="aircraft"?"active":""} onClick={()=>nav("aircraft")}>Aeronaves</a><a className={page==="account"?"active":""} onClick={()=>nav("account")}>Mi cuenta</a></nav><button className="secondary" onClick={()=>{localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}}>Cerrar sesión</button></aside><main className="content"><header><div><p className="eyebrow">PANEL ADMINISTRADOR</p><h1>{title}</h1></div>{workspaces.length>1&&<button className="secondary-action" onClick={()=>setWorkspace(null)}>Cambiar área</button>}<button className="icon" onClick={()=>setDark(!dark)} aria-label="Cambiar tema">{dark?"☀":"◐"}</button></header>{note&&<p className={note.startsWith("✓")?"success":"error"}>{note}</p>}{page==="dashboard"&&<><AdminDashboard users={users} aircraft={aircraft} onAddUser={()=>setUserCreateOpen(true)} onAddAircraft={()=>setAircraftCreateOpen(true)}/><AdminUsers users={users} provinces={provinces} reload={load} notify={notify} showList={false} createOpen={userCreateOpen} onCreateOpenChange={setUserCreateOpen}/><AdminAircraft items={aircraft} airports={airports} reload={load} notify={notify} showList={false} createOpen={aircraftCreateOpen} onCreateOpenChange={setAircraftCreateOpen}/></>}{(page==="users"||page==="users-inactive")&&<><div className="user-tabs"><button className={page==="users"?"selected-tab":"secondary-action"} onClick={()=>nav("users")}>Usuarios activos</button><button className={page==="users-inactive"?"selected-tab":"secondary-action"} onClick={()=>nav("users-inactive")}>Usuarios desactivados</button></div><AdminUsers users={users} provinces={provinces} reload={load} notify={notify} active={page==="users"}/></>} {page==="aircraft"&&<AdminAircraft items={aircraft} airports={airports} reload={load} notify={notify}/>} {page==="account"&&me&&<MyAccount user={me} reload={load} notify={notify}/>}</main></div>;
}
const root=document.getElementById("root");
if(root)createRoot(root).render(<AdminApp />);
