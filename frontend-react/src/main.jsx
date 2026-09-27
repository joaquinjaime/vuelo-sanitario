import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
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
    [e, se] = useState("");
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
            let r = await api("/auth/login", {
              method: "POST",
              body: JSON.stringify({ username: u, password: p }),
            });
            localStorage.setItem("vs-token", r.accessToken);
            localStorage.setItem(
              "vs-session",
              JSON.stringify({ username: r.username, roles: r.roles }),
            );
            set({ username: r.username, roles: r.roles });
          } catch (x) {
            se(x.message);
          }
        }}
      >
        <h2>Ingresar</h2>
        {e && <p className="error">{e}</p>}
        <label>
          Usuario
          <input value={u} onChange={(x) => su(x.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={p}
            onChange={(x) => sp(x.target.value)}
            required
          />
        </label>
        <button>Iniciar sesión</button>
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
function App() {
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
      if (has("OPERACIONES") || has("ADMINISTRADOR"))
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
  useEffect(
    () => (document.body.dataset.theme = dark ? "dark" : "light"),
    [dark],
  );
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
          <a className="active">Panel operativo</a>
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
        {has("DTS") && <DTS d={d} done={load} msg={msg} />}{" "}
        {has("OPERACIONES") && (
          <>
            <Ops d={d} done={load} msg={msg} />
            <OperationsReports msg={msg} />
          </>
        )}{" "}
        {has("COMANDANTE") && (
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
createRoot(document.getElementById("root")).render(<App />);
