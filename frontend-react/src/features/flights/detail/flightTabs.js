import { flightStage, STAGE, visibleSections } from "../flightStages";

/**
 * Pestañas del detalle de una solicitud/vuelo. Qué pestañas existen para cada área y cuáles están habilitadas se deriva del
 * estado real que informa el servidor (flightStage/visibleSections): ninguna pantalla repite esas condiciones, y una pestaña
 * bloqueada se muestra con su motivo pero no ofrece acciones. El servidor sigue siendo la autoridad (409 ante etapas no habilitadas).
 */
export const TAB_DEFS = Object.freeze({
  resumen: { label: "Resumen", sections: ["resumen"] },
  negociacion: { label: "Negociación", sections: ["negociacion"] },
  planificacion: { label: "Planificación", sections: ["aeropuertos", "recursos", "aeronave", "ruta", "hangar", "coordinaciones", "clima"] },
  equipo: { label: "Tripulación y contactos", sections: ["tripulacion", "personal", "contactos"] },
  documentos: { label: "Documentos", sections: ["documentos"] },
  operacion: { label: "Ejecución y cierre", sections: ["ciclo", "bitacora", "cierre"] },
  historial: { label: "Historial", sections: ["auditoria"] },
});

const ORDER = {
  OPERACIONES: ["resumen", "negociacion", "planificacion", "equipo", "documentos", "operacion", "historial"],
  DTS: ["resumen", "negociacion", "equipo", "documentos", "historial"],
  COMANDANTE: ["resumen", "planificacion", "equipo", "documentos", "operacion", "historial"],
};
const LABEL_OVERRIDE = { DTS: { equipo: "Personal y contactos" }, COMANDANTE: { equipo: "Tripulación" } };
const ALL_SECTIONS = Object.values(TAB_DEFS).flatMap((tab) => tab.sections);

const lockReason = (stage) => {
  if (stage?.key === STAGE.NEGOCIACION) return "Se habilita cuando el horario quede acordado.";
  if (stage?.key === STAGE.CERRADA && !stage.agreed) return "La solicitud se cerró sin acuerdo de horario.";
  return "No corresponde a la etapa actual del vuelo.";
};

/**
 * @returns {{ tabs: {key,label,locked,reason}[], show: Set<string>, stage, defaultKey: string }}
 * El comandante sólo ve vuelos que ya le asignaron (con horario acordado): sus secciones no dependen de la etapa de negociación.
 */
export function tabsFor({ workspace, flight, events = [] }) {
  const stage = flightStage(flight, events);
  const show = workspace === "COMANDANTE" ? new Set(ALL_SECTIONS) : visibleSections(flight, events, workspace === "DTS" ? "DTS" : "OPERACIONES");
  const order = ORDER[workspace] || ORDER.OPERACIONES;
  const tabs = order.map((key) => {
    const locked = !TAB_DEFS[key].sections.some((section) => show.has(section));
    return { key, label: LABEL_OVERRIDE[workspace]?.[key] || TAB_DEFS[key].label, locked, reason: locked ? lockReason(stage) : undefined };
  });
  // Antes del acuerdo la tarea es la negociación: la solicitud se abre directamente allí.
  const defaultKey = workspace !== "COMANDANTE" && stage?.key === STAGE.NEGOCIACION ? "negociacion" : "resumen";
  return { tabs, show, stage, defaultKey };
}
