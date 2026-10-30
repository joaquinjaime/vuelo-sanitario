import React, { useEffect, useState } from "react";
import { api, credentialFile } from "./api";

const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const ROLES = { COMANDANTE: "Comandante", COPILOTO: "Copiloto", MEDICO: "Médico", ENFERMERO: "Enfermero" };
const STATUS = { PENDIENTE: "Pendiente de revisión", VERIFICADA: "Verificada (revisión interna)", RECHAZADA: "Rechazada", REVOCADA: "Revocada", CORRECCION_SOLICITADA: "Corrección solicitada" };
const LIFECYCLE = { VIGENTE: "Vigente", POR_VENCER: "Por vencer", VENCIDA: "Vencida", SIN_VIGENCIA_DEFINIDA: "Sin vigencia definida" };
const DOCUMENT = { SIN_DOCUMENTOS: "Sin documentos", EN_ANALISIS: "En análisis antimalware", ERROR_ANALISIS: "Error de análisis: reintente", RECHAZADO: "Documento rechazado por el análisis", LIMPIO: "Documentación analizada", LEGADO_SIN_ANALISIS: "Anterior al análisis: sin analizar" };
const SCAN = { EN_CUARENTENA: "En cuarentena", LIMPIO: "Limpio", RECHAZADO: "Rechazado", ERROR_ANALISIS: "Error de análisis", LEGADO_SIN_ANALISIS: "Sin analizar (legado)" };
const VALIDATION = {
  REVISION_INTERNA_SIN_CONSULTA_EXTERNA: "Revisión interna · sin consulta externa registrada",
  REVISION_INTERNA_CON_CONSULTA_EXTERNA_MANUAL: "Revisión interna · consulta manual coincidente (no es una validación emitida por el organismo)",
  REVISION_INTERNA_CON_CONSULTA_EXTERNA_NO_COINCIDENTE: "Revisión interna · la consulta manual NO coincidió",
};
const DECISIONS = { REGISTRO: "Registro", MODIFICACION: "Modificación", DOCUMENTO: "Documento", VERIFICADA: "Verificación", RECHAZADA: "Rechazo", CORRECCION_SOLICITADA: "Corrección solicitada", REVOCADA: "Revocación", RENOVACION: "Renovación", CONSULTA_EXTERNA: "Consulta externa", RETIRO_DOCUMENTO: "Retiro de documento", BLOQUEO_CONSERVACION: "Bloqueo de conservación", LIBERACION_BLOQUEO: "Liberación de bloqueo", SOLICITUD_RECTIFICACION: "Solicitud de rectificación", SOLICITUD_SUPRESION: "Solicitud de supresión", ANALISIS_DOCUMENTO: "Análisis de documento" };
const AUTHORITY = { ANAC: "ANAC — Personal aeronáutico", REFEPS_SISA: "REFEPS/SISA — Buscador Nacional de Profesionales de la Salud", OTRO: "Otra fuente" };
const RESULT = { COINCIDE: "Coincide", NO_COINCIDE: "No coincide", NO_ENCONTRADO: "No encontrado", NO_CONCLUYENTE: "No concluyente" };
const empty = { roleCode: "MEDICO", type: "", number: "", issuer: "", issued: "", expires: "", noExpiry: false, notes: "", aircraftCategory: "", jurisdictionId: "", restrictions: "" };
const toForm = (c) => ({ roleCode: c.roleCode, type: c.type, number: c.number, issuer: c.issuer, issued: c.issued || "", expires: c.expires || "", noExpiry: c.noExpiry, notes: c.notes || "", aircraftCategory: c.aircraftCategory || "", jurisdictionId: c.jurisdictionId ? String(c.jurisdictionId) : "", restrictions: c.restrictions || "" });
const payload = (f) => ({ ...f, issued: f.issued || null, expires: f.expires || null, aircraftCategory: f.aircraftCategory.trim() || null, jurisdictionId: f.jurisdictionId ? Number(f.jurisdictionId) : null, restrictions: f.restrictions.trim() || null });
// Sólo un documento con análisis antimalware limpio puede descargarse; uno anterior a V59 debe regularizarse primero.
const canDownload = (d) => d.scanStatus === "LIMPIO";
const HASH_MOMENT = { CARGA: "calculada al cargar", REGULARIZACION: "calculada en la regularización (no prueba integridad desde la carga original)" };

function Badges({ c }) {
  const el = c.eligibility;
  return <p className="badges">
    <span title="Estado administrativo">Administrativo: <strong>{STATUS[c.status] || c.status}</strong>{c.status === "VERIFICADA" && <> · {LIFECYCLE[c.lifecycle] || c.lifecycle}</>}</span>{" · "}
    <span title="Estado documental">Documental: <strong>{DOCUMENT[c.documentStatus] || c.documentStatus}</strong></span>{" · "}
    <span title="Elegibilidad operativa de la persona para la función">Elegibilidad operativa: <strong>{el ? (el.eligible ? "Elegible" : "No elegible") : "—"}</strong>{el && <> ({el.message})</>}</span>
  </p>;
}

export function ProfessionalCredentials({ userId, notify }) {
  const [items, setItems] = useState([]), [form, setForm] = useState(empty), [selected, setSelected] = useState(""), [provinces, setProvinces] = useState([]);
  const [file, setFile] = useState(null), [purpose, setPurpose] = useState("EVIDENCIA"), [replaces, setReplaces] = useState("");
  const [decision, setDecision] = useState(""), [confirmReview, setConfirmReview] = useState(false), [acceptRestrictions, setAcceptRestrictions] = useState(false);
  const [docReason, setDocReason] = useState(""), [requestType, setRequestType] = useState("RECTIFICACION"), [requestReason, setRequestReason] = useState("");
  const [check, setCheck] = useState({ authority: "REFEPS_SISA", result: "COINCIDE", comparedData: "", notes: "", consultedAt: "", evidenceDocumentId: "" });
  const [decisions, setDecisions] = useState([]), [history, setHistory] = useState([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = async () => { setItems(await api(`/users/${userId}/professional-credentials`)); };
  useEffect(() => { load().catch((e) => setError(e.message)); api("/catalogs/provinces").then((p) => setProvinces(Array.isArray(p) ? p : [])).catch(() => {}); }, [userId]);
  const current = items.find((c) => String(c.id) === selected);
  const run = async (fn, okMessage) => {
    setBusy(true);
    try { await fn(); setError(""); await load(); if (okMessage) notify(okMessage); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const refreshHistory = async (id) => { setDecisions(await api(`/professional-credentials/${id}/decisions`)); setHistory(await api(`/professional-credentials/${id}/history`)); };
  const choose = (c) => { setSelected(String(c.id)); setForm(toForm(c)); setDecisions([]); setHistory([]); setFile(null); setReplaces(""); setDecision(""); setConfirmReview(false); setAcceptRestrictions(false); setCheck({ ...check, authority: ["COMANDANTE", "COPILOTO"].includes(c.roleCode) ? "ANAC" : "REFEPS_SISA" }); };
  const save = () => run(async () => {
    const saved = await api(selected ? `/professional-credentials/${selected}` : `/users/${userId}/professional-credentials`, { method: selected ? "PUT" : "POST", body: JSON.stringify(payload(form)) });
    setSelected(String(saved.id));
  }, "Habilitación guardada; requiere revisión interna");
  const renew = () => run(async () => {
    const saved = await api(`/professional-credentials/${selected}/renew`, { method: "POST", body: JSON.stringify(payload({ ...form, issued: "", expires: "", noExpiry: false })) });
    setSelected(String(saved.id)); setForm(toForm(saved));
  }, "Renovación registrada como nueva habilitación pendiente");
  const download = async (d) => {
    try { const blob = await credentialFile(`/professional-credential-documents/${d.id}`); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = d.name; a.click(); URL.revokeObjectURL(url); }
    catch (e) { setError(e.message); }
  };
  const upload = () => run(async () => {
    const query = `?purpose=${purpose}${replaces ? `&replacesId=${replaces}` : ""}`;
    await credentialFile(`/professional-credentials/${selected}/documents${query}`, file); setFile(null); setReplaces("");
  }, "Documento incorporado");
  const decide = (code, label) => run(async () => {
    await api(`/professional-credentials/${selected}/decision/${code}`, { method: "POST", body: JSON.stringify({ notes: decision, confirmsSufficiency: confirmReview, acceptsRestrictions: acceptRestrictions }) });
    setDecision(""); setConfirmReview(false); setAcceptRestrictions(false);
  }, `${label}: registrado`);
  const documentAction = (id, path, body, message) => run(async () => { await api(`/professional-credential-documents/${id}/${path}`, { method: "POST", body: JSON.stringify(body) }); setDocReason(""); }, message);
  const recordCheck = () => run(async () => {
    await api(`/professional-credentials/${selected}/external-checks`, { method: "POST", body: JSON.stringify({ ...check, consultedAt: check.consultedAt || null, evidenceDocumentId: check.evidenceDocumentId ? Number(check.evidenceDocumentId) : null }) });
    setCheck({ ...check, comparedData: "", notes: "", evidenceDocumentId: "" });
  }, "Consulta externa registrada (no modifica el estado administrativo)");
  const activeDocs = current ? current.documents.filter((d) => !d.retired) : [];
  const verifyBlocked = !current || current.status !== "PENDIENTE";
  return <div className="wide credentials">
    <h3>Habilitaciones profesionales</h3>
    <p>La verificación es una <strong>revisión interna manual</strong> que realiza otro administrador. No se consulta automáticamente ninguna autoridad: una consulta a ANAC o a REFEPS/SISA se registra aparte y <strong>no equivale a una validación emitida por el organismo</strong>. Sin clasificación, habilitación verificada, vigente y suficiente según la política configurada, no se habilitan asignaciones.</p>
    {error && <p role="alert">{error}</p>}
    <ul>{items.length ? items.map((c) => <li key={c.id}>
      <button type="button" className="secondary-action" onClick={() => choose(c)}>{ROLES[c.roleCode] || c.roleCode} — {c.type} — {c.number}{c.renewsId ? ` (renueva #${c.renewsId})` : ""}</button>{" "}
      {STATUS[c.status] || c.status} · {c.current ? "vigente" : "no habilitada"} · Vence: {c.expires || (c.noExpiry ? "sin vencimiento declarado" : "vencimiento no informado")}
    </li>) : <li>Sin habilitaciones registradas</li>}</ul>
    <button type="button" onClick={() => { setSelected(""); setForm(empty); setDecisions([]); setHistory([]); }}>Nueva habilitación</button>
    <div className="grid-form">
      <label>Función profesional<select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Tipo de habilitación o profesión<input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></label>
      <label>Número de licencia o matrícula<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
      <label>Organismo emisor<input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} /></label>
      <label>Categoría de aeronave a la que aplica (opcional)<input value={form.aircraftCategory} onChange={(e) => setForm({ ...form, aircraftCategory: e.target.value })} /></label>
      <label>Jurisdicción de la matrícula (opcional)<select value={form.jurisdictionId} onChange={(e) => setForm({ ...form, jurisdictionId: e.target.value })}><option value="">Sin jurisdicción registrada</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.name}</option>)}</select></label>
      <label>Fecha de emisión<input type="date" value={form.issued} onChange={(e) => setForm({ ...form, issued: e.target.value })} /></label>
      <label>Fecha de vencimiento<input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={form.noExpiry} onChange={(e) => setForm({ ...form, noExpiry: e.target.checked, expires: e.target.checked ? "" : form.expires })} />El vencimiento no aplica a esta credencial</label>
      <label>Restricciones registradas (opcional)<textarea value={form.restrictions} onChange={(e) => setForm({ ...form, restrictions: e.target.value })} /></label>
      <label>Observaciones<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      <button type="button" disabled={busy || !form.type.trim() || !form.number.trim() || !form.issuer.trim() || (current && current.status === "REVOCADA")} onClick={save}>Guardar habilitación</button>
      {current && current.status === "VERIFICADA" && <button type="button" className="secondary-action" disabled={busy} onClick={renew}>Registrar renovación con estos datos (ingrese las nuevas fechas)</button>}
    </div>
    {current && <>
      <Badges c={current} />
      <p>{VALIDATION[current.validationKind]} · Responsable de la revisión: {current.verifier || "—"} · Fecha: {dt(current.verifiedAt)}{current.lastDecisionReason ? ` · Motivo: ${current.lastDecisionReason}` : ""}</p>
      <p>Modificar los datos o reemplazar documentación requiere una nueva revisión. Una habilitación revocada no se modifica: se registra una nueva.</p>

      <h4>Documentación</h4>
      <div className="grid-form">
        <label>Documento PDF<input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <label>Propósito<select value={purpose} onChange={(e) => setPurpose(e.target.value)}><option value="EVIDENCIA">Evidencia de la habilitación</option><option value="RENOVACION">Renovación</option><option value="CORRECCION">Corrección solicitada</option><option value="CONSULTA_EXTERNA">Evidencia de consulta externa</option></select></label>
        <label>Reemplaza al documento<select value={replaces} onChange={(e) => setReplaces(e.target.value)}><option value="">Ninguno (documento nuevo)</option>{activeDocs.map((d) => <option key={d.id} value={d.id}>v{d.version} — {d.name}</option>)}</select></label>
        <button type="button" disabled={!file || busy || current.status === "REVOCADA"} onClick={upload}>Adjuntar documento</button>
      </div>
      <label>Motivo (retiro o bloqueo de conservación)<input value={docReason} onChange={(e) => setDocReason(e.target.value)} /></label>
      <ul>{current.documents.map((d) => <li key={d.id}>
        v{d.version} · {d.name} · {d.purpose} · {SCAN[d.scanStatus] || d.scanStatus}{d.scanDetail ? ` (${d.scanDetail})` : ""} · {d.uploader} · {dt(d.uploadedAt)} · SHA-256 {d.sha256 ? <>{d.sha256.slice(0, 12)}… <em>{HASH_MOMENT[d.hashMoment] || ""}</em></> : "sin huella (anterior a V59)"}
        {d.origin === "ANTERIOR_V59" && <> · <strong>Documento anterior a V59</strong>{d.regularizedAt && <> (regularizado {dt(d.regularizedAt)} por {d.regularizedBy})</>}</>}
        {!d.retired && d.restriction && <> · <span className="restriction">Restringido: {d.restriction}</span></>}
        {d.retired && <> · RETIRADO {dt(d.retiredAt)}: {d.retireReason}</>}{d.retentionHold && <> · BLOQUEO DE CONSERVACIÓN: {d.holdReason}</>}{" "}
        {canDownload(d) && <button type="button" onClick={() => download(d)}>Descargar {d.name}</button>}
        {!d.retired && ["EN_CUARENTENA", "ERROR_ANALISIS"].includes(d.scanStatus) && <button type="button" disabled={busy} onClick={() => run(async () => { await api(`/professional-credential-documents/${d.id}/rescan`, { method: "POST" }); }, "Análisis solicitado")}>Reintentar análisis</button>}
        {!d.retired && d.origin === "ANTERIOR_V59" && !["LIMPIO", "RECHAZADO"].includes(d.scanStatus) && <button type="button" disabled={busy} onClick={() => run(async () => { const r = await api(`/professional-credential-documents/${d.id}/regularize`, { method: "POST" }); notify(r.result === "REGULARIZADO" ? "Documento regularizado y analizado" : r.result === "RECHAZADO" ? "El análisis rechazó el documento" : `Sigue restringido: ${r.detail || r.result}`); }, "")}>Regularizar (huella y análisis)</button>}
        {!d.retired && <button type="button" disabled={busy || !docReason.trim()} onClick={() => documentAction(d.id, "retire", { reason: docReason }, "Documento retirado (se conserva el registro)")}>Retirar documento</button>}
        {!d.retired && <button type="button" disabled={busy || !docReason.trim()} onClick={() => documentAction(d.id, "retention-hold", { hold: !d.retentionHold, reason: docReason }, d.retentionHold ? "Bloqueo liberado" : "Bloqueo de conservación aplicado")}>{d.retentionHold ? "Liberar bloqueo de conservación" : "Bloquear conservación"}</button>}
      </li>)}</ul>

      <h4>Revisión interna</h4>
      <label>Justificación de la decisión<textarea value={decision} onChange={(e) => setDecision(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={confirmReview} onChange={(e) => setConfirmReview(e.target.checked)} />Confirmo la revisión manual y que la documentación acredita la función indicada</label>
      {current.restrictions && <label className="check"><input type="checkbox" checked={acceptRestrictions} onChange={(e) => setAcceptRestrictions(e.target.checked)} />Confirmo que las restricciones registradas ("{current.restrictions}") no impiden la función</label>}
      {[["VERIFICADA", "Verificar (revisión interna)"], ["RECHAZADA", "Rechazar"], ["CORRECCION_SOLICITADA", "Solicitar corrección"], ["REVOCADA", "Revocar verificación"]].map(([code, label]) =>
        <button type="button" key={code} disabled={busy || !decision.trim() || (code === "VERIFICADA" && !confirmReview) || (code === "REVOCADA" ? current.status !== "VERIFICADA" : verifyBlocked)} onClick={() => decide(code, label)}>{label}</button>)}

      <h4>Consulta externa (registro manual)</h4>
      <p>Registre lo que contrastó en la fuente oficial: <a href="https://www.argentina.gob.ar/anac/personal-aeronautico" target="_blank" rel="noreferrer">ANAC — Personal aeronáutico</a> · <a href="https://www.argentina.gob.ar/salud/buscador-nacional-de-profesionales-de-la-salud" target="_blank" rel="noreferrer">Buscador Nacional de Profesionales de la Salud</a>. El sistema no consulta estos servicios ni los automatiza; el registro es una declaración del administrador.</p>
      <div className="grid-form">
        <label>Fuente consultada<select value={check.authority} onChange={(e) => setCheck({ ...check, authority: e.target.value })}>{Object.entries(AUTHORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Fecha y hora de la consulta<input type="datetime-local" value={check.consultedAt} onChange={(e) => setCheck({ ...check, consultedAt: e.target.value })} /></label>
        <label>Datos contrastados<textarea value={check.comparedData} onChange={(e) => setCheck({ ...check, comparedData: e.target.value })} /></label>
        <label>Resultado<select value={check.result} onChange={(e) => setCheck({ ...check, result: e.target.value })}>{Object.entries(RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Observaciones de la consulta<textarea value={check.notes} onChange={(e) => setCheck({ ...check, notes: e.target.value })} /></label>
        <label>Evidencia de la consulta (documento ya adjunto)<select value={check.evidenceDocumentId} onChange={(e) => setCheck({ ...check, evidenceDocumentId: e.target.value })}><option value="">Sin evidencia adjunta</option>{activeDocs.map((d) => <option key={d.id} value={d.id}>v{d.version} — {d.name}</option>)}</select></label>
        <button type="button" disabled={busy || !check.comparedData.trim()} onClick={recordCheck}>Registrar consulta externa</button>
      </div>
      {current.externalCheck && <p>Última consulta: {AUTHORITY[current.externalCheck.authority]} · {dt(current.externalCheck.consultedAt)} · {current.externalCheck.responsible} · {RESULT[current.externalCheck.result]} · número consultado {current.externalCheck.numberChecked}</p>}

      <h4>Solicitudes de rectificación o supresión</h4>
      <div className="grid-form">
        <label>Tipo<select value={requestType} onChange={(e) => setRequestType(e.target.value)}><option value="RECTIFICACION">Rectificación</option><option value="SUPRESION">Supresión</option></select></label>
        <label>Motivo de la solicitud<textarea value={requestReason} onChange={(e) => setRequestReason(e.target.value)} /></label>
        <button type="button" disabled={busy || !requestReason.trim()} onClick={() => run(async () => { await api(`/professional-credentials/${selected}/data-requests`, { method: "POST", body: JSON.stringify({ type: requestType, reason: requestReason }) }); setRequestReason(""); }, "Solicitud registrada; la documentación queda bajo bloqueo de conservación")}>Registrar solicitud</button>
      </div>

      <button type="button" onClick={() => run(async () => refreshHistory(selected))}>Consultar historial</button>
      <ul>{decisions.map((d) => <li key={`d${d.id}`}>{dt(d.at)} · {d.actor} · {DECISIONS[d.type] || d.type} → {STATUS[d.resultingStatus] || d.resultingStatus}{d.reason ? ` · ${d.reason}` : ""}</li>)}</ul>
      <ul>{history.map((h) => <li key={`h${h.id}`}>{dt(h.at)} · {h.actor} · {h.operation} · {h.before || "—"} → {h.after || "—"}</li>)}</ul>
    </>}
  </div>;
}

const emptyPolicy = { roleCode: "MEDICO", flightTypeCode: "", aircraftCategory: "", credentialType: "", requiresJurisdiction: false, requiresExternalCheck: false, origin: "CONFIGURACION_INTERNA", sourceReference: "", notes: "" };

export function CredentialPolicies({ notify }) {
  const [items, setItems] = useState([]), [types, setTypes] = useState([]), [form, setForm] = useState(emptyPolicy), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [scanner, setScanner] = useState(null), [retention, setRetention] = useState(null);
  const load = async () => { setItems(await api("/credential-policies")); };
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api("/catalogs/flight-types").then((t) => setTypes(Array.isArray(t) ? t : [])).catch(() => {});
    api("/professional-credential-documents/antimalware-status").then(setScanner).catch(() => {});
    api("/professional-credential-retention/report").then(setRetention).catch(() => {});
  }, []);
  const run = async (fn, ok) => { setBusy(true); try { await fn(); setError(""); await load(); notify(ok); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const roles = items.length ? new Set(items.filter((p) => p.active).map((p) => p.roleCode)) : new Set();
  return <section className="card">
    <h2>Política de suficiencia de habilitaciones</h2>
    <p>Define qué habilitación verificada y vigente es suficiente para cumplir cada función, según el tipo de operación y la categoría de aeronave. Es <strong>configuración interna de la organización</strong>: el sistema no trae requisitos regulatorios propios. Sin una política activa para una función, nadie queda habilitado para ella (POLITICA_HABILITACION_NO_CONFIGURADA).</p>
    {error && <p role="alert">{error}</p>}
    <p>Funciones con política activa: {Object.keys(ROLES).map((r) => <span key={r}>{ROLES[r]}: <strong>{roles.has(r) ? "configurada" : "sin configurar"}</strong> · </span>)}</p>
    <ul>{items.filter((p) => p.active).length ? items.filter((p) => p.active).map((p) => <li key={p.id}>
      {ROLES[p.roleCode]} · {p.credentialType} · operación: {p.flightTypeCode || "cualquiera"} · aeronave: {p.aircraftCategory || "cualquiera"}{p.requiresJurisdiction ? " · exige jurisdicción" : ""}{p.requiresExternalCheck ? " · exige consulta externa coincidente" : ""} · origen: {p.origin === "FUENTE_OFICIAL_CITADA" ? `fuente citada (${p.sourceReference})` : "configuración interna"} · {p.active ? "activa" : `dada de baja (${p.retireReason})`}
      {p.active && <button type="button" disabled={busy || !reason.trim()} onClick={() => run(async () => { await api(`/credential-policies/${p.id}/deactivate`, { method: "POST", body: JSON.stringify({ reason }) }); setReason(""); }, "Política dada de baja")}>Dar de baja</button>}
    </li>) : <li>No hay políticas configuradas: ninguna persona puede ser elegible.</li>}</ul>
    {items.some((p) => !p.active) && <details><summary>Historial de políticas dadas de baja ({items.filter((p) => !p.active).length})</summary><ul>{items.filter((p) => !p.active).map((p) => <li key={p.id}>{ROLES[p.roleCode]} · {p.credentialType} · operación: {p.flightTypeCode || "cualquiera"} · aeronave: {p.aircraftCategory || "cualquiera"} · dada de baja por {p.retiredBy} el {dt(p.retiredAt)} ({p.retireReason})</li>)}</ul></details>}
    <label>Motivo de baja<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    <div className="grid-form">
      <label>Función<select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Tipo de habilitación aceptado<input value={form.credentialType} onChange={(e) => setForm({ ...form, credentialType: e.target.value })} /></label>
      <label>Tipo de operación<select value={form.flightTypeCode} onChange={(e) => setForm({ ...form, flightTypeCode: e.target.value })}><option value="">Cualquiera</option>{types.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}</select></label>
      <label>Categoría de aeronave (vacío = cualquiera)<input value={form.aircraftCategory} onChange={(e) => setForm({ ...form, aircraftCategory: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={form.requiresJurisdiction} onChange={(e) => setForm({ ...form, requiresJurisdiction: e.target.checked })} />Exige jurisdicción de la matrícula registrada</label>
      <label className="check"><input type="checkbox" checked={form.requiresExternalCheck} onChange={(e) => setForm({ ...form, requiresExternalCheck: e.target.checked })} />Exige una consulta externa registrada con resultado coincidente</label>
      <label>Origen<select value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}><option value="CONFIGURACION_INTERNA">Configuración interna</option><option value="FUENTE_OFICIAL_CITADA">Fuente oficial citada por el administrador</option></select></label>
      {form.origin === "FUENTE_OFICIAL_CITADA" && <label>Fuente citada<input value={form.sourceReference} onChange={(e) => setForm({ ...form, sourceReference: e.target.value })} /></label>}
      <label>Observaciones<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      <button type="button" disabled={busy || !form.credentialType.trim() || (form.origin === "FUENTE_OFICIAL_CITADA" && !form.sourceReference.trim())} onClick={() => run(async () => { await api("/credential-policies", { method: "POST", body: JSON.stringify(form) }); setForm(emptyPolicy); }, "Política creada")}>Agregar política</button>
    </div>
    <PolicyActivation notify={notify} reload={load} />
    <h3>Análisis antimalware y retención</h3>
    <p>Analizador: {scanner ? (scanner.configured ? `activo (${scanner.engine})` : scanner.signatureProblem ? `NO acreditado: ${scanner.signatureProblem}. Los documentos permanecen en cuarentena` : "NO configurado: ningún documento puede aprobarse") : "—"}.</p>
    {retention && <p>Documentos activos: {retention.activeDocuments} · retirados: {retention.retiredDocuments} · bajo bloqueo de conservación: {retention.heldDocuments} · sin análisis limpio: {retention.unscannedDocuments}. Purga automática: {retention.purgeEnabled ? "habilitada" : "deshabilitada"}. {retention.statement}</p>}
    <LegacyDocuments notify={notify} />
    <ReadinessPanel />
  </section>;
}

const SEVERITY = { ERROR: "Error", WARNING: "Advertencia", INFO: "Información" };

/** Carga, simulación y activación aprobada de un lote de políticas. Nada se activa sin simular y sin referencia de aprobación. */
function PolicyActivation({ notify, reload }) {
  const [text, setText] = useState(""), [report, setReport] = useState(null), [simulated, setSimulated] = useState(""), [approval, setApproval] = useState(""), [ack, setAck] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  const parse = () => { try { return JSON.parse(text); } catch { throw new Error("El contenido no es un JSON válido"); } };
  const simulate = async () => {
    setBusy(true);
    try { const r = await api("/credential-policies/simulation", { method: "POST", body: JSON.stringify(parse()) }); setReport(r); setSimulated(text); setAck(false); setResult(null); setError(""); }
    catch (e) { setError(e.message); setReport(null); }
    finally { setBusy(false); }
  };
  const activate = async () => {
    setBusy(true);
    try {
      const r = await api("/credential-policies/activation", { method: "POST", body: JSON.stringify({ proposal: parse(), approvedFingerprint: report.fingerprint, approvalReference: approval, acknowledgeIncompatibilities: ack }) });
      setResult(r); setError(""); await reload(); notify(r.changed ? `Política activada: ${r.created} alta(s), ${r.retired} baja(s)` : "La política ya estaba activa: sin cambios");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const stale = !!report && simulated !== text;
  const canActivate = !!report && !stale && report.canActivate && approval.trim() && (!report.requiresAcknowledgement || ack);
  return <div className="policy-activation">
    <h3>Carga, simulación y activación de políticas</h3>
    <p>Pegue o cargue la propuesta aprobada (JSON). <strong>Simular no modifica nada</strong>: valida la propuesta y muestra qué personas y vuelos abiertos quedarían no elegibles. Activar exige la referencia de la aprobación y sólo acepta exactamente la propuesta simulada.</p>
    {error && <p role="alert">{error}</p>}
    <label>Archivo de propuesta (JSON)<input type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files[0]; if (f) { setText(await f.text()); setReport(null); } }} /></label>
    <label>Propuesta de políticas (JSON)<textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} /></label>
    <button type="button" disabled={busy || !text.trim()} onClick={simulate}>Validar y simular</button>
    {report && <div>
      <p>Huella de la propuesta: <code>{report.fingerprint}</code>{stale && <strong> · el texto cambió después de simular: vuelva a simular</strong>}</p>
      <p>{report.canActivate ? "Sin errores bloqueantes." : "Hay errores que impiden activarla."} Vuelos abiertos examinados: {report.flightsExamined} · integrantes que dejarían de ser elegibles: {report.newIncompatibilities} · que pasarían a serlo: {report.resolvedIncompatibilities}.</p>
      <ul>{report.issues.map((i, n) => <li key={n}>[{SEVERITY[i.severity] || i.severity}] {i.message}</li>)}</ul>
      <ul>{report.plan.map((r) => <li key={r.roleCode}>{ROLES[r.roleCode] || r.roleCode}: {r.proposed} política(s) propuesta(s) · {r.keep} sin cambios · {r.create} alta(s) · {r.retire} baja(s) · {r.eligibleAfterActivation ? "con política" : "sin política: no elegible"}</li>)}</ul>
      <ul>{report.people.map((r) => <li key={r.roleCode}>Personas clasificadas como {ROLES[r.roleCode] || r.roleCode}: seguirían elegibles {r.stayEligible} · pasarían a no elegibles {r.becomeIneligible} · pasarían a elegibles {r.becomeEligible} · seguirían no elegibles {r.stayIneligible}</li>)}</ul>
      {report.flightImpacts.length > 0 && <ul>{report.flightImpacts.map((f, n) => <li key={n}>Vuelo {f.flightCode} ({f.flightState}) · {f.username} como {ROLES[f.roleCode] || f.roleCode}: {f.before} → {f.after}</li>)}</ul>}
      <label>Referencia de la aprobación (acta, expediente o responsable)<input value={approval} onChange={(e) => setApproval(e.target.value)} /></label>
      {report.requiresAcknowledgement && <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />Reconozco que {report.newIncompatibilities} integrante(s) de vuelos abiertos dejarán de ser elegibles y se alertará a Operaciones</label>}
      <button type="button" disabled={busy || !canActivate} onClick={activate}>Activar política aprobada</button>
    </div>}
    {result && <p>Lote {result.batchId}: {result.created} alta(s), {result.retired} baja(s), {result.kept} sin cambios.</p>}
  </div>;
}

/** Documentos anteriores a V59: qué falta regularizar y a quién afecta. */
function LegacyDocuments({ notify }) {
  const [report, setReport] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [summary, setSummary] = useState(null);
  const load = () => api("/professional-credential-documents/legacy/report").then(setReport).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const regularize = async () => {
    setBusy(true);
    try { const s = await api("/professional-credential-documents/legacy/regularize?limit=50", { method: "POST" }); setSummary(s); setError(""); await load(); notify("Regularización ejecutada"); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  if (!report || typeof report.legacyDocuments !== "number") return error ? <p role="alert">{error}</p> : null;
  return <div className="legacy-documents">
    <h3>Documentos anteriores a V59</h3>
    {error && <p role="alert">{error}</p>}
    <p>{report.legacyDocuments} documento(s) heredado(s) · {report.pendingActive} activo(s) sin resultado de análisis · {report.withoutFingerprint} sin huella · {report.missingFiles} con archivo no disponible · analizador {report.analyzerConfigured ? "disponible" : "NO disponible"}. {report.statement}</p>
    <p>Habilitaciones verificadas sostenidas sólo por documentos heredados sin analizar: <strong>{report.verifiedCredentialsSupportedOnlyByLegacy}</strong> · vuelos abiertos con tripulantes en esa situación: {report.openFlightsWithAffectedCrew}.</p>
    {Array.isArray(report.credentials) && report.credentials.length > 0 && <ul>{report.credentials.slice(0, 10).map((c) => <li key={c.credentialId}>{c.username} · {ROLES[c.roleCode] || c.roleCode} · {c.type} · documentos: {c.documentStatus}</li>)}</ul>}
    <button type="button" disabled={busy || report.pendingActive === 0} onClick={regularize}>Regularizar documentos heredados (lote de 50)</button>
    {summary && <p>Lote: {summary.examined} examinados · {summary.regularized} regularizados · {summary.rejected} rechazados · {summary.restricted} siguen restringidos · {summary.alreadyResolved} ya resueltos.</p>}
  </div>;
}

const READINESS = { OK: "Correcto", PENDIENTE: "Pendiente", PROPUESTA: "Propuesta sin aprobar", ERROR: "Error", ATENCION: "Atención" };

/** Configuraciones obligatorias que faltan antes de operar (política, almacenamiento, antivirus en producción) y decisiones pendientes. */
function ReadinessPanel() {
  const [data, setData] = useState(null);
  useEffect(() => { api("/admin/readiness").then(setData).catch(() => {}); }, []);
  if (!data || !Array.isArray(data.items)) return null;
  return <div className="readiness">
    <h3>Preparación para operar ({data.environment})</h3>
    <p>{data.readyForOperation ? "Configuraciones obligatorias completas." : `Faltan configuraciones obligatorias: ${data.pendingMandatory.join(", ")}.`} Esquema V{data.flywayVersion}.</p>
    <ul>{data.items.map((i) => <li key={i.key}>{i.label}: <strong>{READINESS[i.status] || i.status}</strong>{i.mandatory ? " (obligatorio)" : ""} — {i.detail}</li>)}</ul>
    <p>{data.note}</p>
  </div>;
}
