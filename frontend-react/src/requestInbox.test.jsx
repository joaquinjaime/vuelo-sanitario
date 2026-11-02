import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { OperationalApp, adaptFlight } from "./main";
import { INBOX_PAGE, INBOX_REFRESH_MS, InboxCounters, RequestInbox, compareRequests, inboxSections, requestStage } from "./requestInbox";

vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });

const place = (nombre, provincia) => ({ id: nombre, nombre, provincia, provinciaId: 1 });
/** Vuelo tal como lo entrega el servidor (FlightView) con su solicitud sanitaria. */
const view = (id, state, extra = {}, sanitary = {}) => ({
  id, codigo: `V-${id}`, tipo: { codigo: "SANITARIO", nombre: "Sanitario" }, motivoVuelo: "Traslado", estadoVuelo: extra.estadoVuelo ?? null, salida: null, llegada: null, origen: null, destino: null,
  datosSanitarios: { patientId: 1, paciente: "No debe mostrarse", prioridad: "MEDIA", localidadOrigenSolicitada: place("Tafí Viejo", "Tucumán"), localidadDestinoSolicitada: place("Rosario", "Santa Fe"), fechaSolicitada: "2026-11-10T09:00:00", extremaUrgencia: false, estadoSolicitud: state, fechaRecepcion: "2026-11-02T08:30:00", ...sanitary },
});
const flight = (...args) => adaptFlight(view(...args));

test("the stages come from the real backend states and nothing is invented", () => {
  const stage = (estado) => requestStage({ estado });
  expect(stage("SOLICITADO")).toMatchObject({ key: "NUEVA", open: true, needsOps: true });
  expect(stage("PENDIENTE_RESPUESTA_DTS")).toMatchObject({ key: "NEGOCIACION", open: true, needsOps: false });
  expect(stage("APROBADO")).toMatchObject({ key: "ACORDADA", open: true, needsOps: true });
  expect(stage("RECHAZADO")).toMatchObject({ key: "CERRADA", open: false });
  expect(stage("CANCELADO")).toMatchObject({ key: "CERRADA", open: false });
  for (const later of ["PLANIFICADO", "EN_CURSO", "FINALIZADO", "COMPLETADO"]) expect(stage(later)).toMatchObject({ key: "AVANZADA", open: false });
});

test("adaptFlight exposes the reception date so the inbox can show when a request arrived", () => {
  expect(flight(1, "SOLICITADO").recibida).toBe("2026-11-02T08:30:00");
  expect(adaptFlight({ id: 2, estadoVuelo: "PLANIFICADO" }).recibida).toBeNull();
});

test("extreme urgency goes first by deadline, then priority, then the request that has waited longest", () => {
  const rows = [
    flight(1, "SOLICITADO", {}, { prioridad: "BAJA", fechaRecepcion: "2026-11-01T08:00:00" }),
    flight(2, "SOLICITADO", {}, { prioridad: "CRITICA", fechaRecepcion: "2026-11-02T08:00:00" }),
    flight(3, "SOLICITADO", {}, { prioridad: "CRITICA", fechaRecepcion: "2026-11-01T12:00:00" }),
    flight(4, "SOLICITADO", {}, { extremaUrgencia: true, fechaLimiteTraslado: "2026-11-05T20:00:00", prioridad: "BAJA" }),
    flight(5, "SOLICITADO", {}, { extremaUrgencia: true, fechaLimiteTraslado: "2026-11-03T20:00:00", prioridad: "BAJA" }),
  ];
  expect([...rows].sort(compareRequests).map((f) => f.id)).toEqual([5, 4, 3, 2, 1]);
});

test("the inbox holds only open sanitary requests, split by who must act, and counts are the real totals", () => {
  const operational = { id: 90, codigo: "V-OP", estadoVuelo: "PENDIENTE_RESPUESTA_OPERACIONES", estado: "PENDIENTE_RESPUESTA_OPERACIONES" };
  const flights = [flight(1, "SOLICITADO"), flight(2, "SOLICITADO", {}, { extremaUrgencia: true, fechaLimiteTraslado: "2026-11-04T10:00:00" }), flight(3, "PENDIENTE_RESPUESTA_DTS"), flight(4, "APROBADO"),
    flight(5, "APROBADO", { estadoVuelo: "PLANIFICADO" }), flight(6, "RECHAZADO"), flight(7, "CANCELADO", { estadoVuelo: "CANCELADO" }), operational];
  const { actionable, waiting, counts } = inboxSections(flights);
  expect(actionable.map((f) => f.id)).toEqual([2, 1, 4]);
  expect(waiting.map((f) => f.id)).toEqual([3]);
  expect(counts).toEqual({ nuevas: 2, acordadas: 1, negociacion: 1, urgentes: 1, intervencion: 3 });
});

test("each pending request shows the summary data, never patient data, and opens directly", () => {
  const open = vi.fn();
  render(<RequestInbox flights={[flight(7, "SOLICITADO", {}, { extremaUrgencia: true, fechaLimiteTraslado: "2026-11-04T10:00:00", prioridad: "ALTA" })]} onOpen={open} place={(p) => `${p.nombre}, ${p.provincia}`} updatedAt="10:15" />);
  const list = screen.getByRole("list", { name: /requieren intervención/i });
  const item = within(list).getByRole("listitem");
  expect(item).toHaveTextContent("V-7"); expect(item).toHaveTextContent("Nueva"); expect(item).toHaveTextContent("EXTREMA URGENCIA");
  expect(item).toHaveTextContent("Tafí Viejo, Tucumán → Rosario, Santa Fe");
  expect(item).toHaveTextContent("2026-11-02 08:30"); expect(item).toHaveTextContent("2026-11-10 09:00"); expect(item).toHaveTextContent("ALTA");
  expect(screen.queryByText(/No debe mostrarse/)).toBeNull();
  expect(screen.getByText(/última actualización 10:15/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abrir solicitud V-7" }));
  expect(open).toHaveBeenCalledWith(7);
});

test("the list never hides requests: the total is shown and the rest can be expanded", () => {
  const flights = Array.from({ length: INBOX_PAGE + 3 }, (_, i) => flight(i + 1, "SOLICITADO"));
  render(<RequestInbox flights={flights} onOpen={vi.fn()} />);
  expect(screen.getByRole("heading", { name: /Requieren su intervención/ })).toHaveTextContent(String(INBOX_PAGE + 3));
  expect(screen.getAllByRole("button", { name: /Abrir solicitud/ })).toHaveLength(INBOX_PAGE);
  fireEvent.click(screen.getByRole("button", { name: `Mostrar las ${INBOX_PAGE + 3} solicitudes` }));
  expect(screen.getAllByRole("button", { name: /Abrir solicitud/ })).toHaveLength(INBOX_PAGE + 3);
});

test("requests waiting for the DTS are listed apart and an empty inbox says so", () => {
  const { rerender } = render(<RequestInbox flights={[]} onOpen={vi.fn()} />);
  expect(screen.getByText(/No hay solicitudes sanitarias que requieran su intervención/)).toBeInTheDocument();
  rerender(<RequestInbox flights={[flight(3, "PENDIENTE_RESPUESTA_DTS")]} onOpen={vi.fn()} />);
  expect(screen.getByRole("list", { name: /en negociación con el DTS/i })).toHaveTextContent("En negociación");
});

test("counters show the real totals", () => {
  render(<InboxCounters flights={[flight(1, "SOLICITADO"), flight(2, "SOLICITADO", {}, { extremaUrgencia: true, fechaLimiteTraslado: "2026-11-04T10:00:00" }), flight(3, "PENDIENTE_RESPUESTA_DTS"), flight(4, "APROBADO")]} />);
  const total = (label) => screen.getByText(label).closest("article").querySelector("strong").textContent;
  expect([total("Nuevas"), total("Horario acordado"), total("En negociación"), total("Extrema urgencia")]).toEqual(["2", "1", "1", "1"]);
});

/** Servidor simulado: aplica las transiciones reales de la negociación y responde con el estado vigente. */
const serveOperations = (state) => vi.mocked(api).mockImplementation((path, options) => {
  const post = options?.method === "POST";
  const current = () => state.flights.find((f) => f.id === 7);
  const move = (estado, event, extra = {}) => { state.flights = state.flights.map((f) => (f.id === 7 ? { ...f, ...extra, datosSanitarios: { ...f.datosSanitarios, estadoSolicitud: estado } } : f)); state.events = [...(state.events || []), { id: (state.events || []).length + 1, fechaOcurrencia: "2026-11-02T09:00:00", actor: "ops1", ...event }]; };
  if (path === "/flights") return Promise.resolve(state.flights);
  if (path === "/notifications") return Promise.resolve({ items: [], unread: 0 });
  if (path === "/catalogs/cancellation-reasons") return Promise.resolve([{ id: 1, codigo: "SIN_AERONAVE_ASIGNADA", nombre: "Falta de aeronave" }]);
  if (path === "/flights/7" && !post) return Promise.resolve({ vuelo: current(), negociacion: [{ id: 1, tipo: "DTS_PROPUESTA", fechaHoraPropuesta: "2026-11-10T09:00:00", actor: "dts1" }, ...(state.events || [])], medical: { requiereEquipamientoEspecial: true }, recursos: {}, cierre: null });
  if (path === "/flights/7/schedule/counterproposal" && post) { move("PENDIENTE_RESPUESTA_DTS", { tipo: "CO_CONTRAPROPUESTA", fechaHoraPropuesta: "2026-11-12T09:00:00", motivo: "Aeronave disponible ese día" }); return Promise.resolve({}); }
  if (path === "/flights/7/schedule/accept" && post) { move("APROBADO", { tipo: "CO_ACEPTA_PROPUESTA" }, { salida: "2026-11-10T09:00:00" }); return Promise.resolve({}); }
  if (path === "/flights/7/documents/access") { const agreed = current().datosSanitarios.estadoSolicitud === "APROBADO"; return Promise.resolve(agreed ? { disponible: true } : { disponible: false, codigo: "DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED", pendientePor: "OPERACIONES" }); }
  return Promise.resolve([]);
});
const requested = () => vi.mocked(api).mock.calls.map(([path]) => path).filter((path) => path.startsWith("/flights/7/"));
const STAGE_LATER = ["/flights/7/hangar", "/flights/7/airport-coordinations", "/flights/7/documents", "/flights/7/documents/access", "/flights/7/log", "/flights/7/weather", "/flights/7/crew", "/flights/7/route", "/flights/7/transfer-contacts"];

test("accepting the requested schedule asks for confirmation, records the agreement and reveals the preparation tools", async () => {
  localStorage.setItem("vs-session", JSON.stringify({ username: "ops", roles: ["CENTRO_OPERACIONES"] }));
  const state = { flights: [view(7, "SOLICITADO")] };
  serveOperations(state);
  location.hash = "#/vuelos/7";
  render(<OperationalApp workspace="OPERACIONES" />);
  fireEvent.click(await screen.findByRole("button", { name: "Aceptar horario solicitado" }));
  expect(await screen.findByText(/¿Aceptar el horario solicitado/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));                 // cancelar vuelve al resumen sin tocar el estado
  expect(screen.getByRole("button", { name: "Aceptar horario solicitado" })).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/flights/7/schedule/accept" && options?.method === "POST")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Aceptar horario solicitado" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar horario" }));
  expect(await screen.findByText("Asignación de recursos")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirmar horario" })).toBeNull();
  await waitFor(() => expect(requested()).toContain("/flights/7/hangar"));
});

test("a rejected request keeps its decision history and offers no operational tools", async () => {
  localStorage.setItem("vs-session", JSON.stringify({ username: "ops", roles: ["CENTRO_OPERACIONES"] }));
  const state = { flights: [view(7, "RECHAZADO", {}, { motivoRechazo: "Sin cobertura" })], events: [{ id: 2, tipo: "CO_RECHAZO_DIRECTO", actor: "ops1", motivo: "Sin cobertura", fechaOcurrencia: "2026-11-02T09:00:00" }] };
  serveOperations(state);
  location.hash = "#/vuelos/7";
  render(<OperationalApp workspace="OPERACIONES" />);
  expect(await screen.findByText(/Operaciones rechazó la solicitud/)).toBeInTheDocument();
  expect(screen.getByText(/Solicitud RECHAZADA por Operaciones: Sin cobertura/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Aceptar horario|Proponer|Rechazar solicitud|Reemplazar/ })).toBeNull();
  expect(screen.queryByText("Documentos del vuelo")).toBeNull();
  expect(requested().filter((path) => STAGE_LATER.some((later) => path.startsWith(later)))).toEqual([]);
});

test("a new request shows only its summary and the negotiation; later stages appear as the state really advances", async () => {
  localStorage.setItem("vs-session", JSON.stringify({ username: "ops", roles: ["CENTRO_OPERACIONES"] }));
  const state = { flights: [] };
  serveOperations(state);
  render(<OperationalApp workspace="OPERACIONES" />);
  expect(await screen.findByText(/No hay solicitudes sanitarias que requieran su intervención/)).toBeInTheDocument();
  expect(screen.queryByText(/solicitudes pendientes/)).toBeNull();

  // El DTS crea una solicitud: el operador la ve al volver a la pestaña, sin cerrar sesión ni recargar.
  state.flights = [view(7, "SOLICITADO", {}, { extremaUrgencia: true, fechaLimiteTraslado: "2026-11-04T10:00:00" })];
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  const open = await screen.findByRole("button", { name: "Abrir solicitud V-7" });
  expect(screen.getByRole("navigation", { name: "Secciones de trabajo" })).toHaveTextContent("1 solicitudes pendientes");
  expect(screen.getByText("Nuevas").closest("article")).toHaveTextContent("1");

  // Etapa 1: resumen + negociación como tarea principal; ninguna herramienta de etapas posteriores (ni siquiera consultada).
  fireEvent.click(open);
  expect(await screen.findByRole("heading", { name: "Negociación del horario" })).toBeInTheDocument();
  expect(location.hash).toBe("#/vuelos/7");
  expect(screen.queryByLabelText("Solicitud")).toBeNull();                          // abierta desde la bandeja: sin selector genérico
  expect(screen.getByRole("heading", { name: /Solicitud sanitaria V-7/ })).toBeInTheDocument();
  expect(screen.getByText(/Pendiente de evaluación:/)).toBeInTheDocument();
  for (const name of ["Aceptar horario solicitado", "Proponer otro horario", "Rechazar solicitud"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  expect(screen.queryByLabelText("Nueva fecha y hora")).toBeNull();                 // los formularios se despliegan al elegir la acción
  expect(screen.getByRole("region", { name: "Información de la solicitud" })).toHaveTextContent("EXTREMA URGENCIA");
  for (const text of ["Hangar y preparación terrestre", "Guardar información de hangar", "Documentos del vuelo", "Documentación no disponible", "Bitácora", "Asignación de recursos", "Cancelar vuelo", "Crear vuelo operativo"]) expect(screen.queryByText(new RegExp(text))).toBeNull();
  expect(requested().filter((path) => STAGE_LATER.some((later) => path.startsWith(later)))).toEqual([]);

  // Etapa 1 (contrapropuesta): el estado se actualiza y las acciones que ya no corresponden desaparecen.
  fireEvent.click(screen.getByRole("button", { name: "Proponer otro horario" }));
  fireEvent.change(screen.getByLabelText("Nueva fecha y hora"), { target: { value: "2026-11-12T09:00" } });
  fireEvent.change(screen.getByLabelText("Motivo de la propuesta"), { target: { value: "Aeronave disponible ese día" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar propuesta" }));
  expect(await screen.findByText(/Esperando respuesta del DTS:/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reemplazar propuesta" })).toBeInTheDocument();
  for (const name of ["Aceptar horario solicitado", "Rechazar solicitud"]) expect(screen.queryByRole("button", { name })).toBeNull();
  expect(requested().filter((path) => STAGE_LATER.some((later) => path.startsWith(later)))).toEqual([]);

  // El DTS acepta desde otra sesión: la pantalla abierta se actualiza sola y avanza a la preparación.
  state.flights = state.flights.map((f) => (f.id === 7 ? { ...f, salida: "2026-11-12T09:00:00", datosSanitarios: { ...f.datosSanitarios, estadoSolicitud: "APROBADO" } } : f));
  state.events = [...state.events, { id: 3, respondeA: 2, tipo: "DTS_ACEPTA_CONTRAPROPUESTA", actor: "dts1", fechaOcurrencia: "2026-11-02T10:00:00" }];
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(await screen.findByText("Asignación de recursos")).toBeInTheDocument();
  expect(screen.getByText(/Horario acordado:/)).toBeInTheDocument();
  expect(await screen.findByText("Documentos del vuelo")).toBeInTheDocument();
  await waitFor(() => expect(requested()).toContain("/flights/7/hangar"));
  expect(screen.queryByRole("button", { name: "Reemplazar propuesta" })).toBeNull();
  expect(screen.queryByText("Documentación no disponible")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Volver a la bandeja/ }));
  expect(await screen.findByRole("button", { name: "Abrir solicitud V-7" })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Resumen de solicitudes sanitarias" })).getByText("Horario acordado").closest("article")).toHaveTextContent("1");
  expect(location.hash).toBe("");
});

test("the inbox refreshes by itself on a modest interval", async () => {
  localStorage.setItem("vs-session", JSON.stringify({ username: "ops", roles: ["CENTRO_OPERACIONES"] }));
  serveOperations({ flights: [] });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  render(<OperationalApp workspace="OPERACIONES" />);
  await act(async () => { await Promise.resolve(); });
  const flightCalls = () => vi.mocked(api).mock.calls.filter(([path]) => path === "/flights").length;
  const before = flightCalls();
  await act(async () => { vi.advanceTimersByTime(INBOX_REFRESH_MS); await Promise.resolve(); });
  expect(flightCalls()).toBe(before + 1);
  expect(INBOX_REFRESH_MS).toBeGreaterThanOrEqual(15000);
});

test("a direct URL to a request keeps the context", async () => {
  localStorage.setItem("vs-session", JSON.stringify({ username: "ops", roles: ["CENTRO_OPERACIONES"] }));
  serveOperations({ flights: [view(7, "SOLICITADO")] });
  location.hash = "#/vuelos/7";
  render(<OperationalApp workspace="OPERACIONES" />);
  expect(await screen.findByRole("heading", { name: /Negociación del horario/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Volver a la bandeja/ })).toBeInTheDocument();
});
