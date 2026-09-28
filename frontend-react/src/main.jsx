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
function Login({ set }) {
  const [u, su] = useState(""),
    [p, sp] = useState(""),
    [e, se] = useState(""),
    [activate, setActivate] = useState(false),
    [form, setForm] = useState({ dni: "", codigo: "", username: "", password: "", confirmacionPassword: "" });
  const change = (key, value) => setForm({ ...form, [key]: value });
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
              await api("/auth/activar-cuenta", { method: "POST", body: JSON.stringify(form) });
              setActivate(false); se("Cuenta activada. Ya podés iniciar sesión."); return;
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
            set({ username: r.username, roles: r.roles });
          } catch (x) {
            se(x.message);
          }
        }}
      >
        <h2>{activate ? "Activar cuenta" : "Ingresar"}</h2>
        {e && <p className="error">{e}</p>}
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
          <label>Contraseña<input required type="password" value={form.password} onChange={(x) => change("password", x.target.value)} /></label>
          <label>Confirmar contraseña<input required type="password" value={form.confirmacionPassword} onChange={(x) => change("confirmacionPassword", x.target.value)} /></label>
        </>}
        <button>{activate ? "Activar cuenta" : "Iniciar sesión"}</button>
        <button type="button" className="link-button" onClick={() => { setActivate(!activate); se(""); }}>
          {activate ? "Volver a iniciar sesión" : "Activar cuenta"}
        </button>
      </form>
    </main>
  );
}
function DTS({ d, done, msg }) {
  const [p, setP] = useState(""),
    [f, setF] = useState({
      nombre: "",
      apellido: "",
      origen: "",
      destino: "",
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
                ciudadOrigenSolicitada: f.origen,
                ciudadDestinoSolicitada: f.destino,
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
        <label>
          Ciudad origen
          <input
            required
            value={f.origen}
            onChange={(e) => change("origen", e.target.value)}
          />
        </label>
        <label>
          Ciudad destino
          <input
            required
            value={f.destino}
            onChange={(e) => change("destino", e.target.value)}
          />
        </label>
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
function Ops({ d, done, msg }) {
  const [id, setId] = useState(""),
    [a, setA] = useState(""),
    [c, setC] = useState(""),
    f = d.flights.find((x) => x.id === id),
    call = async (path, body) => {
      try {
        await api(path, { method: "POST", body: body && JSON.stringify(body) });
        msg("Operación registrada");
        done();
      } catch (x) {
        msg(x.message, true);
      }
    };
  return (
    <section className="card">
      <h2>Operaciones</h2>
      <div className="grid-form">
        <label>
          Vuelo
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Seleccionar</option>
            {d.flights.map((x) => (
              <option key={x.id} value={x.id}>
                {x.extremaUrgencia ? "⚠ " : ""}
                {x.codigo} — {x.estado}
              </option>
            ))}
          </select>
        </label>
        {f && (
          <>
            <Urgency flight={f} detail />
            <p>
              Estado: <span className={s(f.estado)}>{f.estado}</span> ·
              Prioridad operativa: {f.prioridad}
            </p>
            {f.estado === "SOLICITADO" && (
              <button
                onClick={() =>
                  call(`/flights/${id}/evaluation`, {
                    aprobar: true,
                    priorityCode: f.prioridad,
                  })
                }
              >
                Aprobar
              </button>
            )}
            {f.estado === "APROBADO" && (
              <>
                <label>
                  Aeronave
                  <select value={a} onChange={(e) => setA(e.target.value)}>
                    <option />{" "}
                    {d.aircraft.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.matricula}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Comandante
                  <select value={c} onChange={(e) => setC(e.target.value)}>
                    <option />{" "}
                    {d.users
                      .filter((x) => x.roles.includes("COMANDANTE"))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.username}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  disabled={!a || !c}
                  onClick={() =>
                    call(`/flights/${id}/resources`, {
                      aircraftId: a,
                      comandanteId: c,
                    })
                  }
                >
                  Asignar
                </button>
              </>
            )}
            {f.estado === "PLANIFICADO" && (
              <button onClick={() => call(`/flights/${id}/start`)}>
                Registrar inicio
              </button>
            )}
            {f.estado === "EN_CURSO" && (
              <button onClick={() => call(`/flights/${id}/finish`)}>
                Finalizar vuelo
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
function Cmd({ d, done, msg }) {
  const [id, setId] = useState(""),
    [o, setO] = useState(""),
    [de, setD] = useState(""),
    [salida, setSalida] = useState(""),
    [llegada, setLlegada] = useState(""),
    [r, setR] = useState(""),
    f = d.flights.find((x) => x.id === id),
    call = async (path, b) => {
      try {
        await api(path, { method: "POST", body: JSON.stringify(b) });
        msg("Operación registrada");
        done();
      } catch (x) {
        msg(x.message, true);
      }
    };
  return (
    <section className="card">
      <h2>Planificación del comandante</h2>
      <div className="grid-form">
        <label>
          Vuelo
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option />{" "}
            {d.flights.map((x) => (
              <option key={x.id} value={x.id}>
                {x.extremaUrgencia ? "⚠ " : ""}
                {x.codigo} — {x.estado}
              </option>
            ))}
          </select>
        </label>
        {f && <Urgency flight={f} detail />}
        {f?.estado === "APROBADO" && (
          <>
            <label>
              Origen
              <select value={o} onChange={(e) => setO(e.target.value)}>
                <option />{" "}
                {d.airports.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destino
              <select value={de} onChange={(e) => setD(e.target.value)}>
                <option />{" "}
                {d.airports.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Salida planificada
              <input
                type="datetime-local"
                required
                value={salida}
                onChange={(e) => setSalida(e.target.value)}
              />
            </label>
            <label>
              Llegada planificada
              <input
                type="datetime-local"
                required
                value={llegada}
                onChange={(e) => setLlegada(e.target.value)}
              />
            </label>
            {f.extremaUrgencia &&
              llegada &&
              f.fechaLimiteTraslado &&
              llegada > f.fechaLimiteTraslado && (
                <p className="error wide">
                  La planificación supera el horario límite declarado; no se
                  presenta como cumplimiento del traslado.
                </p>
              )}
            <button
              disabled={!o || !de || !salida || !llegada}
              onClick={() =>
                call(`/flights/${id}/plan`, {
                  origenId: o,
                  destinoId: de,
                  salida,
                  llegada,
                })
              }
            >
              Guardar y planificar
            </button>
          </>
        )}
      </div>
    </section>
  );
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
function OperationalApp({ workspace="DTS", workspaces=[], changeWorkspace=()=>{} }) {
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
      users: [],
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
      if (has("OPERACIONES") || has("CENTRO_OPERACIONES") || has("ADMINISTRADOR"))
        calls.push(api("/auth/users"));
      let [a, b, c, e, f, n, u = []] = await Promise.all(calls);
      setD({
        flights: a,
        patients: b,
        priorities: c,
        aircraft: e,
        airports: f,
        notifications: n.content || [],
        users: u,
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
        {workspace==="DTS" && <DTS d={d} done={load} msg={msg} />}{" "}
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
                      {x.ciudadOrigenSolicitada} → {x.ciudadDestinoSolicitada}
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
export function AdminUsers({ users, reload, notify }) {
 const emptyForm=()=>({nombre:"",apellido:"",dni:"",fechaNacimiento:"",licenciaAeronautica:"",roles:[],correos:[{direccion:"",tipo:"PERSONAL"}],telefonos:[{numero:"",tipo:"PERSONAL"}]});
 const [query,setQuery]=useState(""),[role,setRole]=useState(""),[state,setState]=useState(""),[open,setOpen]=useState(false),[activationCode,setActivationCode]=useState(""),[form,setForm]=useState(emptyForm);
 const allRoles=["ADMINISTRADOR","DTS","CENTRO_OPERACIONES","COMANDANTE"];
 const toggle=(r)=>setForm({...form,roles:form.roles.includes(r)?form.roles.filter(x=>x!==r):[...form.roles,r]});
 const openNewUser=()=>{setForm(emptyForm());setOpen(true);};
 const closeNewUser=()=>{setForm(emptyForm());setOpen(false);};
 const dismissCode=()=>setActivationCode("");
 const receiveActivationCode=(result)=>{if(!result?.codigo)throw new Error("El servidor no devolvió el código de activación. Regeneralo antes de continuar.");setActivationCode(result.codigo);};
 const create=async e=>{e.preventDefault();try{const r=await api("/auth/users",{method:"POST",body:JSON.stringify({...form,fechaNacimiento:form.fechaNacimiento||null})});receiveActivationCode(r);closeNewUser();await reload();notify("Cuenta pendiente creada. Guardá el código de activación antes de continuar.");}catch(x){notify(x.message,true);}};
 const shown=users.filter(x=>(!query||`${x.nombre} ${x.apellido} ${x.dni} ${x.username||""}`.toLowerCase().includes(query.toLowerCase()))&&(!role||x.roles.includes(role))&&(!state||x.estado===state));
 return <>{activationCode&&<div className="activation-modal-backdrop" role="presentation"><section className="activation-modal" role="dialog" aria-modal="true" aria-labelledby="activation-code-title"><p className="eyebrow">CUENTA PENDIENTE CREADA</p><h2 id="activation-code-title">Código de activación</h2><p>Este código se mostrará una sola vez. Guardalo antes de cerrar este aviso.</p><code>{activationCode}</code><div className="form-actions"><button onClick={()=>navigator.clipboard?.writeText(activationCode)}>Copiar</button><button className="secondary-action" onClick={dismissCode}>Cerrar aviso</button></div></section></div>}<section className="card"><div className="section-title"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Gestión de usuarios</h1><p>{users.length} personas con cuenta en el sistema</p></div><button onClick={openNewUser}>Nuevo usuario</button></div>
  {open&&<form className="grid-form form-panel" onSubmit={create}><label>Nombre<input required value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/></label><label>Apellido<input required value={form.apellido} onChange={e=>setForm({...form,apellido:e.target.value})}/></label><label>DNI<input required value={form.dni} onChange={e=>setForm({...form,dni:e.target.value})}/></label><label>Fecha de nacimiento<input type="date" value={form.fechaNacimiento} onChange={e=>setForm({...form,fechaNacimiento:e.target.value})}/></label><label>Correo principal<input type="email" required value={form.correos[0].direccion} onChange={e=>setForm({...form,correos:[{direccion:e.target.value,tipo:"PERSONAL"}]})}/></label><label>Teléfono principal<input required value={form.telefonos[0].numero} onChange={e=>setForm({...form,telefonos:[{numero:e.target.value,tipo:"PERSONAL"}]})}/></label><fieldset className="wide"><legend>Roles</legend>{allRoles.map(r=><label className="check" key={r}><input type="checkbox" checked={form.roles.includes(r)} onChange={()=>toggle(r)}/>{r}</label>)}</fieldset>{form.roles.includes("COMANDANTE")&&<label>Número de licencia<input required value={form.licenciaAeronautica} onChange={e=>setForm({...form,licenciaAeronautica:e.target.value})}/></label>}<div className="wide form-actions"><button>Crear cuenta pendiente</button><button type="button" className="secondary-action" onClick={closeNewUser}>Cancelar</button></div></form>}
  <div className="filters"><input placeholder="Buscar por nombre, DNI o usuario" value={query} onChange={e=>setQuery(e.target.value)}/><select value={role} onChange={e=>setRole(e.target.value)}><option value="">Todos los roles</option>{allRoles.map(x=><option key={x}>{x}</option>)}</select><select value={state} onChange={e=>setState(e.target.value)}><option value="">Todos los estados</option><option>PENDIENTE_ACTIVACION</option><option>ACTIVO</option><option>DESACTIVADO</option></select></div>
  <table><thead><tr><th>Nombre completo</th><th>DNI</th><th>Usuario</th><th>Correo principal</th><th>Roles</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td>{x.nombre} {x.apellido}</td><td>{x.dni}</td><td>{x.username||"—"}</td><td>{x.correos.find(c=>c.principal)?.valor||"—"}</td><td>{[...x.roles].join(", ")}</td><td><span className={s(x.estado)}>{x.estado}</span></td><td><button onClick={async()=>{try{receiveActivationCode(await api(`/auth/users/${x.id}/activation-code`,{method:"POST"}));reload();}catch(e){notify(e.message,true)}}} disabled={x.estado!=="PENDIENTE_ACTIVACION"}>Regenerar código</button></td></tr>)}</tbody></table></section></>;
}
export function WorkspaceSelector({workspaces,select}){return <main className="login"><section><p className="eyebrow">ÁREAS HABILITADAS</p><h1>Seleccione el área de trabajo</h1></section><div className="card">{workspaces.map(x=><button key={x.id} onClick={()=>select(x.id)}>{x.label}</button>)}</div></main>;}
export function AdminApp() {
 const [session,setSession]=useState(()=>{try{return JSON.parse(localStorage.getItem("vs-session"));}catch{return null;}}),[users,setUsers]=useState([]),[me,setMe]=useState(null),[page,setPage]=useState(location.hash==="#/admin/mi-cuenta"?"account":"users"),[note,setNote]=useState(""),[dark,setDark]=useState(()=>localStorage.getItem("vs-theme")==="dark"),[workspace,setWorkspace]=useState(null);
 const load=async()=>{try{const [u,m]=await Promise.all([api("/auth/users"),api("/auth/me")]);setUsers(u);setMe(m);}catch(e){setNote(e.message);}};
 useEffect(()=>{if(session)load();},[session]); useEffect(()=>{document.documentElement.dataset.theme=dark?"dark":"light";document.body.dataset.theme=dark?"dark":"light";localStorage.setItem("vs-theme",dark?"dark":"light");},[dark]);
 if(!session)return <Login set={setSession}/>; if(session.debeCambiarContrasena)return <PasswordRequired setSession={setSession}/>; const workspaces=workspaceForRoles(session.roles); const active=workspace||(workspaces.length===1?workspaces[0].id:null); if(workspaces.length>1&&!active)return <WorkspaceSelector workspaces={workspaces} select={setWorkspace}/>; if(active!=="ADMIN")return <OperationalApp workspace={active} workspaces={workspaces} changeWorkspace={setWorkspace}/>;
 const nav=(target)=>{setPage(target);history.replaceState(null,"",target==="account"?"#/admin/mi-cuenta":"#/admin/usuarios");}; const notify=(text,bad)=>setNote((bad?"":"✓ ")+text);
 return <div className="shell admin-shell"><aside><div className="brand">✈ <span>Vuelos<br/>Sanitarios</span></div><nav><a className={page==="users"?"active":""} onClick={()=>nav("users")}>Gestión de usuarios</a><a className={page==="account"?"active":""} onClick={()=>nav("account")}>Mi cuenta</a></nav><button className="secondary" onClick={()=>{localStorage.removeItem("vs-token");localStorage.removeItem("vs-session");setSession(null);}}>Cerrar sesión</button></aside><main className="content"><header><div><p className="eyebrow">PANEL ADMINISTRADOR</p><h1>{page==="users"?"Gestión de usuarios":"Mi cuenta"}</h1></div>{workspaces.length>1&&<button className="secondary-action" onClick={()=>setWorkspace(null)}>Cambiar área</button>}<button className="icon" onClick={()=>setDark(!dark)} aria-label="Cambiar tema">{dark?"☀":"◐"}</button></header>{note&&<p className={note.startsWith("✓")?"success":"error"}>{note}</p>}{page==="users"?<AdminUsers users={users} reload={load} notify={notify}/>:me&&<MyAccount user={me} reload={load} notify={notify}/>}</main></div>;
}
const root=document.getElementById("root");
if(root)createRoot(root).render(<AdminApp />);
