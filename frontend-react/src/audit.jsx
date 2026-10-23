import React, { useEffect, useState } from "react";
import { api } from "./api";

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
export function AuditTimeline({ flightId, title = "Historial de actividad", pageSize = 20 }) {
  const [page, setPage] = useState(0), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [open, setOpen] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => { setPage(0); setOpen(null); }, [flightId]);
  useEffect(() => {
    if (!flightId) return undefined;
    let active = true; setLoading(true); setError("");
    api(`/audit/flights/${flightId}?page=${page}&size=${pageSize}&order=desc`)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) { setData(null); setError(message(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [flightId, page, pageSize, attempt]);
  const items = data?.items || [];
  return <section className="wide detail-actions audit-timeline-section" aria-label={title}>
    <h4>{title}</h4>
    {loading && <p role="status">Cargando historial…</p>}
    {error && <p role="alert" className="error">{error} <button type="button" className="secondary-action" onClick={() => setAttempt((x) => x + 1)}>Reintentar</button></p>}
    {!loading && !error && data && items.length === 0 && <p>{page > 0 ? "No hay más actividad registrada." : "Todavía no hay actividad registrada para este vuelo."}</p>}
    {items.length > 0 && <ol className="audit-timeline">{items.map((e) => <li key={e.id}>
      <p><strong>{e.operationLabel}</strong> · <span>{e.entityTypeLabel}</span></p>
      <p>{e.summary}</p>
      <p className="hint"><time dateTime={e.occurredAt}>{formatInstant(e.occurredAt, data.timeZone)}</time> · {e.actor.label}</p>
      {e.hasDetail && <button type="button" className="secondary-action" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Ocultar cambios" : "Ver cambios"}</button>}
      {open === e.id && <AuditEventDetail id={e.id} onClose={() => setOpen(null)} />}
    </li>)}</ol>}
    {data && data.totalPages > 1 && <p className="audit-pager"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Más recientes</button> Página {page + 1} de {data.totalPages} · {data.total} eventos <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Más antiguos</button></p>}
  </section>;
}

const EMPTY = { from: "", to: "", actorId: "", entityType: "", operation: "", flightId: "", entityId: "", order: "desc" };
const contextLink = (e) => e.entityType === "AIRCRAFT" ? { href: "#/admin/aeronaves", label: "Ver aeronaves" } : e.entityType === "USER" ? { href: "#/admin/usuarios", label: "Ver usuarios" } : null;

/** Sección Auditoría del administrador: tabla paginada con filtros ejecutados en el backend y acceso al detalle de cada evento. */
export function AdminAudit() {
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
        <td><button type="button" className="secondary-action" onClick={() => setSelected(selected === e.id ? null : e.id)}>{selected === e.id ? "Cerrar" : "Ver detalle"}</button>{link && <> <a href={link.href}>{link.label}</a></>}</td>
      </tr>; })}</tbody>
    </table>}
    {selected && <AuditEventDetail id={selected} onClose={() => setSelected(null)} headingLevel="h3" />}
    {data && data.totalPages > 0 && <p className="audit-pager"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Anterior</button> Página {page + 1} de {data.totalPages} · {data.total} eventos <button type="button" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Siguiente</button></p>}
  </section>;
}
