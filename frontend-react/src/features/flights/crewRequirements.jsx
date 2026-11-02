/**
 * Condiciones para cumplir una función de tripulación (comandante o copiloto), una por una: qué se cumple, qué falta, quién lo resuelve y cómo.
 * El servidor es la autoridad: esta pantalla sólo lo muestra. No hay clasificaciones, políticas ni habilitaciones que gestionar: la licencia es un dato del perfil.
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
