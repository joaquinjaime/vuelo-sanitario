import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Requisitos para cumplir una función de tripulación, uno por uno: qué se cumple, qué falta, quién lo resuelve y el procedimiento legítimo.
 * El servidor es la autoridad: esta pantalla sólo lo muestra (no concede clasificaciones ni habilitaciones, que se gestionan en sus propias secciones).
 */
const WHO = { ADMINISTRADOR: "Administración", OPERACIONES: "Operaciones", COMANDANTE: "El comandante" };

/** Lista de requisitos; con {@code onlyMissing} muestra sólo los que faltan (así lo ve Centro de Operaciones junto a cada comandante no disponible). */
export function RequirementList({ items, onlyMissing = false }) {
  const shown = (Array.isArray(items) ? items : []).filter((r) => !onlyMissing || !r.cumplido);
  if (!shown.length) return null;
  return <ul className="requirement-list">{shown.map((r) => <li key={r.codigo} className={r.cumplido ? "requirement-ok" : "requirement-missing"}>
    <strong>{r.cumplido ? "✓" : "✗"} {r.titulo}</strong>{!r.cumplido && r.estado ? <span className="requirement-state"> · {r.estado.replaceAll("_", " ").toLowerCase()}</span> : null}
    <small>{r.mensaje}</small>
    {!r.cumplido && r.procedimiento && <small className="requirement-how">Lo resuelve: {WHO[r.resuelve] || r.resuelve}. {r.procedimiento}</small>}
  </li>)}</ul>;
}

/** Requisitos de la persona seleccionada para una función (por defecto Comandante). {@code version} fuerza una nueva consulta tras clasificar o retirar. */
export function UserRequirements({ userId, roles = [], version = 0 }) {
  const [role, setRole] = useState("COMANDANTE"), [data, setData] = useState(null), [error, setError] = useState(""), [tick, setTick] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    const mine = ++latest.current; setData(null); setError("");
    api(`/crew-qualifications/${userId}/requirements?role=${encodeURIComponent(role)}`)
      .then((value) => { if (mine === latest.current) setData(value && !Array.isArray(value) ? value : null); })
      .catch((e) => { if (mine === latest.current) setError(e.message); });
    return () => { latest.current++; };
  }, [userId, role, version, tick]);
  const options = roles.length ? roles : [{ codigo: "COMANDANTE", nombre: "Comandante" }];
  return <section className="wide user-requirements" aria-label="Requisitos para operar">
    <h3>Requisitos para operar</h3>
    <label>Función<select value={role} onChange={(e) => setRole(e.target.value)}>{options.map((r) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}</select></label>
    {error && <p className="error">{error}</p>}
    {!data && !error && <p className="hint" role="status">Consultando requisitos…</p>}
    {data && <>
      <p><strong>{data.elegible ? `Cumple todos los requisitos para ${data.crewRoleName}.` : `Faltan ${data.faltantes} ${data.faltantes === 1 ? "requisito" : "requisitos"} para ${data.crewRoleName}.`}</strong>
        {data.provinciaOperativa ? ` Ubicación operativa: ${data.provinciaOperativa} (se compara con la jurisdicción del aeropuerto de salida de cada vuelo; no es un requisito permanente).` : data.crewRoleCode === "COMANDANTE" ? " Ubicación operativa: sin registrar (se compara con la jurisdicción del aeropuerto de salida de cada vuelo)." : ""}</p>
      <RequirementList items={data.requisitos}/>
      <button type="button" className="secondary-action" onClick={() => setTick((n) => n + 1)}>Actualizar requisitos</button>
    </>}
  </section>;
}

/** Comandantes activos con requisitos pendientes: lo que Administración puede regularizar antes de que Centro de Operaciones los necesite. */
export function PendingCommanders({ onManage, version = 0 }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(""), [all, setAll] = useState(false), [term, setTerm] = useState("");
  useEffect(() => {
    let on = true; setError("");
    const timer = setTimeout(() => {
      api(`/crew-qualifications/requirements/commanders?q=${encodeURIComponent(term.trim())}&pendientes=${all ? "false" : "true"}&size=100`)
        .then((value) => { if (on) setRows(Array.isArray(value) ? value : []); })
        .catch((e) => { if (on) { setRows([]); setError(e.message); } });
    }, term ? 250 : 0);
    return () => { on = false; clearTimeout(timer); };
  }, [all, term, version]);
  return <section className="wide pending-commanders" aria-label="Comandantes con requisitos pendientes">
    <h3>Comandantes con requisitos pendientes</h3>
    <label>Buscar comandante<input value={term} placeholder="Nombre, apellido o usuario" onChange={(e) => setTerm(e.target.value)}/></label>
    <label className="inline-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)}/> Mostrar también los que cumplen todo</label>
    {error && <p className="error">{error}</p>}
    {rows && !rows.length && !error && <p className="hint">{all ? "No hay comandantes activos." : "Todos los comandantes activos cumplen sus requisitos."}</p>}
    {rows && rows.length > 0 && <table><thead><tr><th>Comandante</th><th>Usuario</th><th>Ubicación</th><th>Pendiente</th><th>Acciones</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.userId}>
        <td>{r.apellido}, {r.nombre}</td><td>{r.username}</td><td>{r.provinciaOperativa || "Sin registrar"}</td>
        <td>{r.elegible ? "Nada" : r.requisitos.filter((x) => !x.cumplido).map((x) => x.titulo).join(", ")}</td>
        <td><button type="button" className="secondary-action" onClick={() => onManage(r)}>Gestionar {r.username}</button></td>
      </tr>)}
    </tbody></table>}
  </section>;
}
