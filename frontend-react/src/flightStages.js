/**
 * Etapa de un vuelo y secciones que le corresponden, en un único lugar (el detalle de Operaciones y el del DTS lo consultan; ninguna
 * pantalla repite estas condiciones). Se deriva del estado real que informa el servidor (`adaptFlight().estado`: el estado del vuelo y,
 * mientras no lo tiene, el de la solicitud sanitaria) y, sólo para conservar el historial de un vuelo cancelado, del registro de aceptación
 * en la negociación. El servidor sigue siendo la autoridad: las operaciones de etapas posteriores se rechazan con 409
 * (`SCHEDULE_NOT_AGREED` / `DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED`); ocultar una sección aquí nunca es la única defensa.
 *
 * Etapas (relación con el workflow real):
 *  NEGOCIACION  SOLICITADO | PENDIENTE_RESPUESTA_DTS   decidir y acordar el horario
 *  ACORDADO     APROBADO (sin estado de vuelo)         horario acordado: falta asignar aeronave y comandante
 *  PREPARACION  PLANIFICADO (y pendientes de operativo) recursos asignados: preparación del vuelo
 *  EJECUCION    EN_CURSO                                vuelo en ejecución
 *  CIERRE       FINALIZADO | COMPLETADO                 informe final y revisión
 *  CERRADA      RECHAZADO | CANCELADO                   decisión final; el historial se conserva
 *  OPERATIVO    vuelo sin solicitud sanitaria           sin cambios: conserva todas sus secciones
 */
export const STAGE = Object.freeze({ NEGOCIACION: "NEGOCIACION", ACORDADO: "ACORDADO", PREPARACION: "PREPARACION", EJECUCION: "EJECUCION", CIERRE: "CIERRE", CERRADA: "CERRADA", OPERATIVO: "OPERATIVO" });

/** Eventos de la negociación que registran el acuerdo (los únicos que fijan APROBADO en el servidor). */
export const AGREEMENT_EVENTS = ["CO_ACEPTA_PROPUESTA", "DTS_ACEPTA_CONTRAPROPUESTA"];

export const STAGE_LABEL = Object.freeze({
  NEGOCIACION: "Solicitud y negociación", ACORDADO: "Horario acordado", PREPARACION: "Preparación del vuelo", EJECUCION: "Vuelo en ejecución",
  CIERRE: "Finalización y cierre", CERRADA: "Solicitud cerrada", OPERATIVO: "Vuelo operativo",
});

/** ¿Hubo acuerdo alguna vez? Un vuelo cancelado después de acordarse conserva el acceso a su preparación como consulta. */
export const hadAgreement = (flight, events = []) => (events || []).some((e) => AGREEMENT_EVENTS.includes(e.tipo)) || Boolean(flight?.salida);

/** Quién debe responder la negociación abierta (null si no hay una abierta). */
export const pendingParty = (flight) => flight?.estado === "SOLICITADO" ? "OPERACIONES" : flight?.estado === "PENDIENTE_RESPUESTA_DTS" ? "DTS" : null;

export function flightStage(flight, events = []) {
  if (!flight) return null;
  if (!flight.datosSanitarios) return { key: STAGE.OPERATIVO, label: STAGE_LABEL.OPERATIVO, agreed: true, pending: null };
  const state = flight.estado;
  if (state === "SOLICITADO" || state === "PENDIENTE_RESPUESTA_DTS") return { key: STAGE.NEGOCIACION, label: STAGE_LABEL.NEGOCIACION, agreed: false, pending: pendingParty(flight) };
  if (state === "APROBADO") return { key: STAGE.ACORDADO, label: STAGE_LABEL.ACORDADO, agreed: true, pending: null };
  if (state === "EN_CURSO") return { key: STAGE.EJECUCION, label: STAGE_LABEL.EJECUCION, agreed: true, pending: null };
  if (state === "FINALIZADO" || state === "COMPLETADO") return { key: STAGE.CIERRE, label: STAGE_LABEL.CIERRE, agreed: true, pending: null };
  if (state === "RECHAZADO" || state === "CANCELADO") return { key: STAGE.CERRADA, label: STAGE_LABEL.CERRADA, agreed: state === "CANCELADO" && hadAgreement(flight, events), pending: null };
  // PLANIFICADO y cualquier estado operativo posterior al acuerdo: no se oculta nada que pueda ser legítimo.
  return { key: STAGE.PREPARACION, label: STAGE_LABEL.PREPARACION, agreed: true, pending: null };
}

/**
 * Secciones del detalle de Operaciones/DTS por etapa. Las claves son estables y las usan las pantallas con `has(key)`.
 *  resumen        datos de la solicitud (consulta)        negociacion  panel de negociación e historial
 *  recursos       asignar comandante y aeronave (consulta/cambio del comandante una vez planificado)            cancelar     cancelación del vuelo ya acordado
 *  aeronave       cambio de aeronave                       tripulacion  tripulación adicional           ruta   ruta del comandante
 *  ciclo          iniciar / finalizar                      cierre       informe final
 *  documentos / coordinaciones / hangar / contactos / bitacora / clima / auditoria
 */
const COMMON_PREPARATION = ["resumen", "negociacion", "documentos", "coordinaciones", "hangar", "contactos", "auditoria"];
const BY_STAGE = {
  [STAGE.NEGOCIACION]: ["resumen", "negociacion"],
  [STAGE.ACORDADO]: [...COMMON_PREPARATION, "recursos", "cancelar"],
  [STAGE.PREPARACION]: [...COMMON_PREPARATION, "recursos", "aeronave", "tripulacion", "ruta", "bitacora", "clima", "ciclo", "cancelar", "cierre"],
  [STAGE.EJECUCION]: [...COMMON_PREPARATION, "tripulacion", "ruta", "bitacora", "clima", "ciclo", "cierre"],
  [STAGE.CIERRE]: ["resumen", "negociacion", "documentos", "coordinaciones", "hangar", "auditoria", "tripulacion", "ruta", "bitacora", "clima", "cierre"],
};
const HISTORY_ONLY = ["resumen", "negociacion", "documentos", "coordinaciones", "hangar", "auditoria", "tripulacion", "ruta", "bitacora", "clima"];
const ALL = ["resumen", "negociacion", "recursos", "aeronave", "tripulacion", "ruta", "ciclo", "cierre", "cancelar", "documentos", "coordinaciones", "hangar", "contactos", "bitacora", "clima", "auditoria"];

export function visibleSections(flight, events = [], role = "OPERACIONES") {
  const stage = flightStage(flight, events);
  if (!stage) return new Set();
  let keys;
  if (stage.key === STAGE.OPERATIVO) keys = ALL;
  else if (stage.key === STAGE.CERRADA) keys = stage.agreed ? HISTORY_ONLY : ["resumen", "negociacion", "auditoria"];
  else keys = BY_STAGE[stage.key];
  const set = new Set(keys);
  // El DTS no usa herramientas de gestión operativa: sólo su solicitud, la negociación, contactos propios, documentos (consulta) e historial.
  if (role === "DTS") set.add("auditoria");
  if (role === "DTS") for (const key of ["recursos", "aeronave", "tripulacion", "ruta", "ciclo", "cierre", "coordinaciones", "hangar", "bitacora", "clima"]) set.delete(key);
  return set;
}
