import { expect, test } from "vitest";
import { STAGE, flightStage, hadAgreement, pendingParty, visibleSections } from "./flightStages";

const sanitary = (estado, extra = {}) => ({ id: 1, estado, datosSanitarios: { estadoSolicitud: estado }, ...extra });
const keys = (flight, events = [], role = "OPERACIONES") => [...visibleSections(flight, events, role)].sort();
const LATER = ["recursos", "aeronave", "tripulacion", "ruta", "ciclo", "cierre", "cancelar", "documentos", "coordinaciones", "hangar", "contactos", "bitacora", "clima", "auditoria"];

test("the stage comes from the real state, never from a planned date", () => {
  expect(flightStage(sanitary("SOLICITADO", { salida: "2026-11-10T09:00:00" })).key).toBe(STAGE.NEGOCIACION);   // una fecha no es un acuerdo
  expect(flightStage(sanitary("PENDIENTE_RESPUESTA_DTS")).key).toBe(STAGE.NEGOCIACION);
  expect(flightStage(sanitary("APROBADO")).key).toBe(STAGE.ACORDADO);
  expect(flightStage(sanitary("PLANIFICADO")).key).toBe(STAGE.PREPARACION);
  expect(flightStage(sanitary("EN_CURSO")).key).toBe(STAGE.EJECUCION);
  expect(flightStage(sanitary("FINALIZADO")).key).toBe(STAGE.CIERRE);
  expect(flightStage(sanitary("COMPLETADO")).key).toBe(STAGE.CIERRE);
  expect(flightStage(sanitary("RECHAZADO")).key).toBe(STAGE.CERRADA);
  expect(flightStage({ id: 2, estado: "PLANIFICADO" }).key).toBe(STAGE.OPERATIVO);
  expect(flightStage(null)).toBeNull();
});

test("who must answer the negotiation", () => {
  expect(pendingParty({ estado: "SOLICITADO" })).toBe("OPERACIONES");
  expect(pendingParty({ estado: "PENDIENTE_RESPUESTA_DTS" })).toBe("DTS");
  expect(pendingParty({ estado: "APROBADO" })).toBeNull();
});

test("during the negotiation only the summary and the negotiation are shown, for both pending states", () => {
  for (const state of ["SOLICITADO", "PENDIENTE_RESPUESTA_DTS"]) {
    expect(keys(sanitary(state))).toEqual(["negociacion", "resumen"]);
    for (const key of LATER) expect(visibleSections(sanitary(state), [], "OPERACIONES").has(key)).toBe(false);
  }
});

test("once the schedule is agreed, preparation tools appear progressively and execution tools wait for the assigned resources", () => {
  const agreed = keys(sanitary("APROBADO"));
  expect(agreed).toEqual(expect.arrayContaining(["recursos", "documentos", "coordinaciones", "hangar", "contactos", "cancelar", "auditoria"]));
  for (const later of ["bitacora", "clima", "ruta", "ciclo", "aeronave", "tripulacion", "cierre"]) expect(agreed).not.toContain(later);
  const prepared = keys(sanitary("PLANIFICADO"));
  expect(prepared).toEqual(expect.arrayContaining(["aeronave", "tripulacion", "ruta", "bitacora", "clima", "ciclo", "documentos", "hangar", "cancelar"]));
  expect(prepared).toContain("recursos"); // consulta de lo asignado y cambio del comandante
  const running = keys(sanitary("EN_CURSO"));
  expect(running).toEqual(expect.arrayContaining(["bitacora", "ciclo", "ruta", "documentos"]));
  expect(running).not.toContain("cancelar"); expect(running).not.toContain("recursos");
  expect(keys(sanitary("FINALIZADO"))).toEqual(expect.arrayContaining(["cierre", "documentos", "bitacora"]));
  expect(keys(sanitary("FINALIZADO"))).not.toContain("ciclo");
});

test("a closed request keeps its decision history; only a cancelled flight that was agreed keeps its preparation records for consulting", () => {
  expect(keys(sanitary("RECHAZADO"))).toEqual(["auditoria", "negociacion", "resumen"]);
  expect(keys(sanitary("CANCELADO"))).toEqual(["auditoria", "negociacion", "resumen"]);              // cancelada antes del acuerdo
  const accepted = [{ tipo: "CO_ACEPTA_PROPUESTA" }];
  expect(hadAgreement(sanitary("CANCELADO"), accepted)).toBe(true);
  const history = keys(sanitary("CANCELADO"), accepted);
  expect(history).toEqual(expect.arrayContaining(["documentos", "hangar", "coordinaciones", "bitacora", "auditoria"]));
  for (const action of ["recursos", "cancelar", "ciclo", "contactos"]) expect(history).not.toContain(action);
  expect(flightStage(sanitary("RECHAZADO"), accepted).agreed).toBe(false);                             // un rechazo nunca tuvo acuerdo
});

test("operational flights keep every section, and the DTS never gets operations tools", () => {
  const all = keys({ id: 3, estado: "PENDIENTE_CONFIRMACION_COMANDANTE" });
  for (const key of ["hangar", "coordinaciones", "documentos", "bitacora", "ruta", "tripulacion", "cancelar"]) expect(all).toContain(key);
  const dts = keys(sanitary("PLANIFICADO"), [], "DTS");
  for (const key of ["recursos", "aeronave", "tripulacion", "ruta", "ciclo", "cierre", "coordinaciones", "hangar", "bitacora", "clima"]) expect(dts).not.toContain(key);
  expect(dts).toEqual(expect.arrayContaining(["documentos", "contactos", "auditoria", "negociacion"]));
  expect(keys(sanitary("SOLICITADO"), [], "DTS")).toEqual(["auditoria", "negociacion", "resumen"]);
});
