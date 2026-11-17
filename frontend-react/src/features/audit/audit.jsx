import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { SegmentedControl } from "../../components/ui/Tabs";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Pagination, paginate } from "../../components/ui/data";

const message = (e, fallback = "No se pudo cargar la auditoría") => e?.message || fallback;
const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;

/** Los instantes de auditoría llegan en UTC ("...Z"); se muestran siempre en la zona de negocio que informa el servidor, nunca en la del navegador. */
export function formatInstant(iso, timeZone) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat("es-AR", { timeZone: timeZone || "America/Argentina/Tucuman", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
  } catch { return String(iso); }
}
/** Los valores guardados dentro de un evento (salidas, vencimientos) ya están en hora civil de negocio. */
const formatValue = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  const m = LOCAL_DATETIME.exec(String(v));
  return m ? `${m[1]} ${m[2]}` : String(v);
};

/** Cambios de un evento: anterior y posterior legibles, notas sobre datos faltantes u ocultos y detalle técnico ya filtrado por el servidor. */
export function AuditChanges({ detail }) {
  const [all, setAll] = useState(false);
  const changes = Array.isArray(detail.changes) ? detail.changes : [];
  const changed = changes.filter((c) => c.changed), unchanged = changes.filter((c) => !c.changed);
  const rows = all ? changes : changed;
  return <div className="audit-changes">
    {Array.isArray(detail.notes) && detail.notes.map((n, i) => <p key={i} className="hint" role="note">{n}</p>)}
    {rows.length > 0 && <table aria-label="Cambios registrados">
      <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor posterior</th></tr></thead>
      <tbody>{rows.map((c) => <tr key={c.field} className={c.changed ? "audit-changed" : ""}><td>{c.label}</td><td>{c.masked && c.before ? <em>{c.before}</em> : formatValue(c.before)}</td><td>{c.masked && c.after ? <em>{c.after}</em> : formatValue(c.after)}</td></tr>)}</tbody>
    </table>}
    {unchanged.length > 0 && <button type="button" className="secondary-action" onClick={() => setAll((x) => !x)}>{all ? "Ocultar campos sin cambios" : `Mostrar campos sin cambios (${unchanged.length})`}</button>}
    {(detail.hasPreviousValues || detail.hasNewValues) && <details><summary>Detalle técnico</summary>
      <pre>{JSON.stringify({ valoresAnteriores: detail.previousValues, valoresNuevos: detail.newValues }, null, 2)}</pre></details>}
  </div>;
}

/** Carga el detalle de un evento desde el backend (cada perfil recibe sólo los campos que le corresponden). */
export function AuditEventDetail({ id, onClose, headingLevel = "h4" }) {
  const [detail, setDetail] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setDetail(null); setError("");
    api(`/audit/events/${id}`).then((d) => { if (active) setDetail(d); }).catch((e) => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [id]);
  const Heading = headingLevel;
  return <section className="audit-detail" aria-label={`Detalle del evento ${id}`}>
    <div className="audit-detail-head"><Heading>Detalle del evento #{id}</Heading>{onClose && <button type="button" className="secondary-action" onClick={onClose}>Cerrar detalle</button>}</div>
    {error && <p role="alert" className="error">{error}</p>}
    {!detail && !error && <p role="status">Cargando detalle…</p>}
    {detail && <>
      <dl className="audit-facts">
        <div><dt>Fecha y hora</dt><dd>{formatInstant(detail.event.occurredAt, detail.timeZone)}</dd></div>
        <div><dt>Responsable</dt><dd>{detail.event.actor.label}{detail.event.actor.id ? ` · ID ${detail.event.actor.id}` : ""}</dd></div>
        <div><dt>Acción</dt><dd>{detail.event.operationLabel}</dd></div>
        <div><dt>Entidad</dt><dd>{detail.event.entityTypeLabel}{detail.event.entityId ? ` #${detail.event.entityId}` : ""}</dd></div>
        {detail.event.flightCode && <div><dt>Vuelo</dt><dd>{detail.event.flightCode}</dd></div>}
      </dl>
      <AuditChanges detail={detail} />
    </>}
  </section>;
}

/** Historial contextual de un vuelo o solicitud. Los eventos, campos y responsables visibles los decide el servidor según el rol. */
export function AuditTimeline({ flightId, title = "Historial de actividad", pageSize = 20, order = "desc" }) {
  const [page, setPage] = useState(0), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [open, setOpen] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => { setPage(0); setOpen(null); }, [flightId]);
  useEffect(() => {
    if (!flightId) return undefined;
    let active = true; setLoading(true); setError("");
    api(`/audit/flights/${flightId}?page=${page}&size=${pageSize}&order=${order}`)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) { setData(null); setError(message(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [flightId, page, pageSize, order, attempt]);
  const items = data?.items || [];
  return <section className="wide detail-actions audit-timeline-section" aria-label={title}>
    <h4>{title}</h4>
    {loading && <p role="status">Cargando historial…</p>}
    {error && <p role="alert" className="error">{error} <button type="button" className="secondary-action" onClick={() => setAttempt((x) => x + 1)}>Reintentar</button></p>}
    {!loading && !error && data && items.length === 0 && <p>{page > 0 ? "No hay más actividad registrada." : "Todavía no hay actividad registrada para este vuelo."}</p>}
    {!loading && items.length > 0 && <ol className="audit-timeline">{items.map((e) => <li key={e.id}>
      <p><strong>{e.operationLabel}</strong> · <span>{e.entityTypeLabel}</span></p>
      <p>{e.summary}</p>
      <p className="hint"><time dateTime={e.occurredAt}>{formatInstant(e.occurredAt, data.timeZone)}</time> · {e.actor.label}</p>
      {e.hasDetail && <button type="button" className="secondary-action" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Ocultar cambios" : "Ver cambios"}</button>}
      {open === e.id && <AuditEventDetail id={e.id} onClose={() => setOpen(null)} />}
    </li>)}</ol>}
    {data && data.totalPages > 1 && <p className="audit-pager"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>{order === "asc" ? "Más antiguos" : "Más recientes"}</button> Página {page + 1} de {data.totalPages} · {data.total} eventos <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage(page + 1)}>{order === "asc" ? "Más recientes" : "Más antiguos"}</button></p>}
  </section>;
}

const EMPTY = { from: "", to: "", actorId: "", entityType: "", operation: "", flightId: "", entityId: "", order: "desc" };
const contextLink = (e) => e.entityType === "AIRCRAFT" ? { to: "/app/aeronaves", label: "Ver aeronaves" } : e.entityType === "USER" ? { to: "/app/usuarios", label: "Ver usuarios" } : null;

/** Búsqueda general de auditoría: tabla paginada con todos los filtros ejecutados en el backend y acceso al detalle de cada evento. */
export function AuditSearch() {
  const [options, setOptions] = useState({ entityTypes: [], operations: [], actors: [], maxPageSize: 100 }), [form, setForm] = useState(EMPTY), [applied, setApplied] = useState(EMPTY);
  const [actorQuery, setActorQuery] = useState(""), [actorOptions, setActorOptions] = useState([]), [actorPage, setActorPage] = useState(0), [actorMore, setActorMore] = useState(false), [actorLoading, setActorLoading] = useState(false), [actorError, setActorError] = useState("");
  const [page, setPage] = useState(0), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [selected, setSelected] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; api("/audit/filters").then((o) => { if (active) setOptions(o); }).catch((e) => { if (active) setError(message(e)); }); return () => { active = false; }; }, []);
  useEffect(() => {
    let active = true; const timer = setTimeout(() => {
      setActorLoading(true); setActorError("");
      api(`/audit/actors?q=${encodeURIComponent(actorQuery.trim())}&page=${actorPage}&size=30`)
        .then((result) => { if (!active) return; setActorOptions((old) => actorPage === 0 ? result.items : [...old, ...result.items.filter((x) => !old.some((y) => y.id === x.id))]); setActorMore(result.hasNext); })
        .catch((e) => { if (active) setActorError(message(e)); })
        .finally(() => { if (active) setActorLoading(false); });
    }, actorPage === 0 ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [actorQuery, actorPage]);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(page), size: "20" });
    Object.entries(applied).forEach(([k, v]) => { if (v !== "" && v !== null) params.set(k, v); });
    api(`/audit?${params}`)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) { setData(null); setError(message(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, page, attempt]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => { e.preventDefault(); setSelected(null); setPage(0); setApplied({ ...form }); };
  const clear = () => { setForm(EMPTY); setApplied(EMPTY); setActorQuery(""); setActorPage(0); setPage(0); setSelected(null); };
  const filterByFlight = (id) => { const next = { ...EMPTY, flightId: String(id) }; setForm(next); setApplied(next); setPage(0); setSelected(null); };
  const items = data?.items || [], filtered = JSON.stringify(applied) !== JSON.stringify(EMPTY);
  return <section className="card audit-admin">
    <p className="eyebrow">TRAZABILIDAD</p><h2>Auditoría de operaciones</h2>
    <p className="hint">Registro inmutable de las operaciones del sistema. Las fechas se expresan en la zona horaria {data?.timeZone || options.timeZone || "del sistema"}. Los filtros se aplican en el servidor.</p>
    <form className="grid-form audit-filters" onSubmit={submit} aria-label="Filtros de auditoría">
      <label>Desde<input type="date" value={form.from} onChange={set("from")} /></label>
      <label>Hasta<input type="date" value={form.to} onChange={set("to")} /></label>
      <label>Buscar usuario responsable<input type="search" value={actorQuery} onChange={(e) => { setActorQuery(e.target.value); setActorPage(0); }} placeholder="Nombre o usuario" /></label>
      <label>Usuario responsable<select aria-label="Usuario responsable" value={form.actorId} onChange={set("actorId")}><option value="">Todos</option>{form.actorId && !actorOptions.some((a) => String(a.id) === form.actorId) && <option value={form.actorId}>Usuario seleccionado (ID {form.actorId})</option>}{actorOptions.map((a) => <option key={a.id} value={a.id}>{a.name || a.username} ({a.username}){a.active ? "" : " · desactivado"}</option>)}</select>{actorLoading && <small role="status">Buscando usuarios…</small>}{actorError && <small role="alert" className="error">{actorError}</small>}{!actorLoading && !actorError && actorOptions.length === 0 && <small>No se encontraron actores.</small>}{actorMore && <button type="button" className="secondary-action" disabled={actorLoading} onClick={() => setActorPage((p) => p + 1)}>Cargar más actores</button>}</label>
      <label>Tipo de entidad<select value={form.entityType} onChange={set("entityType")}><option value="">Todos</option>{options.entityTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></label>
      <label>Acción<select value={form.operation} onChange={set("operation")}><option value="">Todas</option>{options.operations.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
      <label>ID de vuelo<input type="number" min="1" value={form.flightId} onChange={set("flightId")} /></label>
      <label>ID del registro afectado<input type="number" min="1" value={form.entityId} onChange={set("entityId")} /></label>
      <label>Orden<select value={form.order} onChange={set("order")}><option value="desc">Más recientes primero</option><option value="asc">Más antiguos primero</option></select></label>
      <div className="wide"><button type="submit">Aplicar filtros</button> <button type="button" className="secondary-action" onClick={clear}>Limpiar filtros</button></div>
    </form>
    {loading && <p role="status">Cargando eventos…</p>}
    {error && <p role="alert" className="error">{error} <button type="button" className="secondary-action" onClick={() => setAttempt((x) => x + 1)}>Reintentar</button></p>}
    {!loading && !error && data && items.length === 0 && <p>{filtered ? "Ningún evento coincide con los filtros aplicados." : "Todavía no hay eventos de auditoría."}</p>}
    {items.length > 0 && <table aria-label="Eventos de auditoría">
      <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>ID usuario</th><th>Acción</th><th>Entidad</th><th>ID registro</th><th>Descripción</th><th>Detalle</th></tr></thead>
      <tbody>{items.map((e) => { const link = contextLink(e); return <tr key={e.id} className={selected === e.id ? "audit-selected" : ""}>
        <td><time dateTime={e.occurredAt}>{formatInstant(e.occurredAt, data.timeZone)}</time></td>
        <td>{e.actor.label}</td><td>{e.actor.id ?? "—"}</td><td>{e.operationLabel}</td>
        <td>{e.entityTypeLabel}{e.flightCode ? <><br /><small>Vuelo {e.flightCode} <button type="button" className="link-button" onClick={() => filterByFlight(e.flightId)}>Ver su historial</button></small></> : null}</td>
        <td>{e.entityId ?? "—"}</td><td>{e.summary}</td>
        <td><button type="button" className="secondary-action" onClick={() => setSelected(selected === e.id ? null : e.id)}>{selected === e.id ? "Cerrar" : "Ver detalle"}</button>{link && <> <Link to={link.to}>{link.label}</Link></>}</td>
      </tr>; })}</tbody>
    </table>}
    {selected && <AuditEventDetail id={selected} onClose={() => setSelected(null)} headingLevel="h3" />}
    {data && data.totalPages > 0 && <p className="audit-pager"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Anterior</button> Página {page + 1} de {data.totalPages} · {data.total} eventos <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Siguiente</button></p>}
  </section>;
}

/** Subpaneles de la sección Auditoría del administrador. Cada uno acota la consulta a lo que audita y a quienes cargan esos datos. */
const PANELS = [
  { value: "flights", label: "Vuelos" },
  { value: "users", label: "Usuarios", entityTypes: ["USER", "USER_ROLE"], description: "Altas de cuentas, modificaciones y cambios de perfiles de los usuarios." },
  { value: "aircraft", label: "Aeronaves", entityTypes: ["AIRCRAFT"], actorRole: "ADMINISTRADOR", description: "Altas y modificaciones de aeronaves. Las carga la administración, por eso sólo se ofrecen administradores como responsables." },
  { value: "healthStaff", label: "Personal sanitario", entityTypes: ["HEALTH_STAFF"], actorRole: "DTS", description: "Altas y modificaciones del personal sanitario. Lo carga DTS, por eso sólo se ofrecen usuarios DTS como responsables." },
  { value: "search", label: "Búsqueda general" },
];

/** Sección Auditoría del administrador: separada por defecto en subpaneles (vuelos, usuarios, aeronaves y personal sanitario) más la búsqueda general. */
export function AdminAudit() {
  const [panel, setPanel] = useState("flights");
  const current = PANELS.find((p) => p.value === panel);
  return <>
    <SegmentedControl label="Secciones de auditoría" options={PANELS.map(({ value, label }) => ({ value, label }))} value={panel} onChange={setPanel} />
    {panel === "flights" && <FlightAuditPanel />}
    {panel === "search" && <AuditSearch />}
    {current.entityTypes && <EntityAuditPanel key={panel} title={current.label} description={current.description} entityTypes={current.entityTypes} actorRole={current.actorRole} />}
  </>;
}

const FLIGHT_PAGE = 20;
const flightDay = (f) => String(f.salida || "").slice(0, 10);

/** Vuelos: lista de todos los vuelos; al elegir uno se muestra su historial completo (incluida la tripulación) del más antiguo al más reciente. */
function FlightAuditPanel() {
  const [flights, setFlights] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [page, setPage] = useState(0), [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true; setError("");
    api("/flights").then((list) => { if (active) setFlights(Array.isArray(list) ? list : []); }).catch((e) => { if (active) setError(message(e, "No se pudieron cargar los vuelos")); });
    return () => { active = false; };
  }, [attempt]);
  const term = query.trim().toLowerCase();
  const visible = (flights || [])
    .filter((f) => !term || [f.codigo, f.origen, f.destino, f.tipo?.nombre].some((v) => String(v || "").toLowerCase().includes(term)))
    .filter((f) => (!from || flightDay(f) >= from) && (!to || flightDay(f) <= to))
    .sort((a, b) => String(b.salida || "").localeCompare(String(a.salida || "")) || b.id - a.id);
  const paged = paginate(visible, page, FLIGHT_PAGE);
  const filter = (setter) => (e) => { setter(e.target.value); setPage(0); };
  return <section className="card audit-admin" aria-label="Auditoría de vuelos">
    <p className="eyebrow">TRAZABILIDAD</p><h2>Auditoría de vuelos</h2>
    <p className="hint">Elegí un vuelo para ver todas las acciones registradas sobre él, incluidos los cambios de tripulación, en orden cronológico.</p>
    <div className="grid-form audit-filters">
      <label>Buscar vuelo<input type="search" value={query} onChange={filter(setQuery)} placeholder="Código, origen, destino o tipo" /></label>
      <label>Salida desde<input type="date" value={from} onChange={filter(setFrom)} /></label>
      <label>Salida hasta<input type="date" value={to} onChange={filter(setTo)} /></label>
    </div>
    {!flights && !error && <p role="status">Cargando vuelos…</p>}
    {error && <p role="alert" className="error">{error} <button type="button" className="secondary-action" onClick={() => setAttempt((x) => x + 1)}>Reintentar</button></p>}
    {flights && visible.length === 0 && <p>{flights.length ? "Ningún vuelo coincide con los filtros." : "Todavía no hay vuelos registrados."}</p>}
    {paged.items.length > 0 && <table aria-label="Vuelos">
      <thead><tr><th>Vuelo</th><th>Tipo</th><th>Estado</th><th>Salida</th><th>Ruta</th><th>Historial</th></tr></thead>
      <tbody>{paged.items.map((f) => <tr key={f.id} className={selected?.id === f.id ? "audit-selected" : ""}>
        <td>{f.codigo}</td><td>{f.tipo?.nombre || "—"}</td><td><StatusBadge state={f.estadoVuelo} /></td><td>{formatValue(f.salida)}</td><td>{f.origen || "—"} → {f.destino || "—"}</td>
        <td><button type="button" className="secondary-action" aria-pressed={selected?.id === f.id} onClick={() => setSelected(selected?.id === f.id ? null : f)}>{selected?.id === f.id ? "Ocultar historial" : "Ver historial"}</button></td>
      </tr>)}</tbody>
    </table>}
    <Pagination page={paged.current} pages={paged.pages} total={visible.length} onPage={setPage} noun="vuelos" />
    {selected && <AuditTimeline key={selected.id} flightId={selected.id} title={`Historial del vuelo ${selected.codigo}`} pageSize={50} order="asc" />}
  </section>;
}

const ENTITY_EMPTY = { from: "", to: "", actorId: "", order: "asc" };

/** Panel de auditoría de un tipo de registro (usuarios, aeronaves, personal sanitario) con filtros de fecha y responsable, en orden cronológico por defecto. */
function EntityAuditPanel({ title, description, entityTypes, actorRole }) {
  const [form, setForm] = useState(ENTITY_EMPTY), [applied, setApplied] = useState(ENTITY_EMPTY);
  const [actorQuery, setActorQuery] = useState(""), [actors, setActors] = useState([]), [actorError, setActorError] = useState("");
  const [page, setPage] = useState(0), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [selected, setSelected] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; const timer = setTimeout(() => {
      const params = new URLSearchParams(); if (actorRole) params.set("role", actorRole); params.set("q", actorQuery.trim()); params.set("page", "0"); params.set("size", "100");
      setActorError("");
      api(`/audit/actors?${params}`).then((r) => { if (active) setActors(r.items || []); }).catch((e) => { if (active) setActorError(message(e)); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [actorQuery, actorRole]);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(page), size: "20", entityType: entityTypes.join(","), order: applied.order });
    ["from", "to", "actorId"].forEach((k) => { if (applied[k]) params.set(k, applied[k]); });
    api(`/audit?${params}`)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) { setData(null); setError(message(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, page, attempt, entityTypes]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => { e.preventDefault(); setSelected(null); setPage(0); setApplied({ ...form }); };
  const clear = () => { setForm(ENTITY_EMPTY); setApplied(ENTITY_EMPTY); setActorQuery(""); setPage(0); setSelected(null); };
  const items = data?.items || [], filtered = JSON.stringify(applied) !== JSON.stringify(ENTITY_EMPTY);
  return <section className="card audit-admin" aria-label={`Auditoría de ${title.toLowerCase()}`}>
    <p className="eyebrow">TRAZABILIDAD</p><h2>Auditoría de {title.toLowerCase()}</h2>
    <p className="hint">{description} Las fechas se expresan en la zona horaria {data?.timeZone || "del sistema"}.</p>
    <form className="grid-form audit-filters" onSubmit={submit} aria-label={`Filtros de ${title.toLowerCase()}`}>
      <label>Desde<input type="date" value={form.from} onChange={set("from")} /></label>
      <label>Hasta<input type="date" value={form.to} onChange={set("to")} /></label>
      <label>Buscar usuario responsable<input type="search" value={actorQuery} onChange={(e) => setActorQuery(e.target.value)} placeholder="Nombre o usuario" /></label>
      <label>Usuario responsable<select aria-label="Usuario responsable" value={form.actorId} onChange={set("actorId")}><option value="">Todos</option>{form.actorId && !actors.some((a) => String(a.id) === form.actorId) && <option value={form.actorId}>Usuario seleccionado (ID {form.actorId})</option>}{actors.map((a) => <option key={a.id} value={a.id}>{a.name || a.username} ({a.username}){a.active ? "" : " · desactivado"}</option>)}</select>{actorError && <small role="alert" className="error">{actorError}</small>}</label>
      <label>Orden<select value={form.order} onChange={set("order")}><option value="asc">Más antiguos primero</option><option value="desc">Más recientes primero</option></select></label>
      <div className="wide"><button type="submit">Aplicar filtros</button> <button type="button" className="secondary-action" onClick={clear}>Limpiar filtros</button></div>
    </form>
    {loading && <p role="status">Cargando eventos…</p>}
    {error && <p role="alert" className="error">{error} <button type="button" className="secondary-action" onClick={() => setAttempt((x) => x + 1)}>Reintentar</button></p>}
    {!loading && !error && data && items.length === 0 && <p>{filtered ? "Ningún evento coincide con los filtros aplicados." : "Todavía no hay eventos registrados en esta sección."}</p>}
    {items.length > 0 && <table aria-label={`Eventos de ${title.toLowerCase()}`}>
      <thead><tr><th>Fecha y hora</th><th>Responsable</th><th>Acción</th><th>Registro</th><th>Descripción</th><th>Detalle</th></tr></thead>
      <tbody>{items.map((e) => <tr key={e.id} className={selected === e.id ? "audit-selected" : ""}>
        <td><time dateTime={e.occurredAt}>{formatInstant(e.occurredAt, data.timeZone)}</time></td>
        <td>{e.actor.label}</td><td>{e.operationLabel}</td><td>{e.entityTypeLabel}{e.entityId ? ` #${e.entityId}` : ""}</td><td>{e.summary}</td>
        <td><button type="button" className="secondary-action" onClick={() => setSelected(selected === e.id ? null : e.id)}>{selected === e.id ? "Cerrar" : "Ver detalle"}</button></td>
      </tr>)}</tbody>
    </table>}
    {selected && <AuditEventDetail id={selected} onClose={() => setSelected(null)} headingLevel="h3" />}
    {data && data.totalPages > 1 && <p className="audit-pager"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Anterior</button> Página {page + 1} de {data.totalPages} · {data.total} eventos <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Siguiente</button></p>}
  </section>;
}
