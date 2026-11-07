import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { renderApp, ROLE } from "../../test-utils";
vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

const reasons = [{ id: 1, codigo: "SIN_AERONAVE_ASIGNADA", nombre: "Falta de aeronave asignada" }, { id: 2, codigo: "OTRO", nombre: "Otro motivo" }];
const sanitary = (extra = {}) => ({ id: 7, codigo: "V-7", estadoVuelo: null, tipo: { codigo: "SANITARIO" }, datosSanitarios: { fechaSolicitada: "2026-10-23T09:00:00", extremaUrgencia: false, estadoSolicitud: "SOLICITADO", localidadOrigenSolicitada: { nombre: "Tafí Viejo", provincia: "Tucumán" }, localidadDestinoSolicitada: { nombre: "Rosario", provincia: "Santa Fe" }, ...extra.datos }, ...extra.flight });
const events = (...rows) => rows.map((r, i) => ({ id: i + 1, respondeA: null, tipo: "DTS_PROPUESTA", fechaHoraPropuesta: null, fechaHoraLlegadaPropuesta: null, motivo: null, actor: "x", fechaOcurrencia: "2026-10-20T10:00:00", ...r }));

test("openProposal devuelve sólo la propuesta vigente: la reemplazada o respondida es obsoleta", async () => {
 const { openProposal } = await import("./negotiation");
 const first = events({}, { tipo: "CO_CONTRAPROPUESTA", respondeA: 1, fechaHoraPropuesta: "2026-10-24T09:00:00" });
 expect(openProposal(first, "CO_CONTRAPROPUESTA").id).toBe(2);
 const replaced = [...first, ...events({}, {}).slice(0, 0), { id: 3, respondeA: 2, tipo: "CO_CONTRAPROPUESTA", fechaHoraPropuesta: "2026-10-25T09:00:00" }];
 expect(openProposal(replaced, "CO_CONTRAPROPUESTA").id).toBe(3);
 const answered = [...replaced, { id: 4, respondeA: 3, tipo: "DTS_ACEPTA_CONTRAPROPUESTA" }];
 expect(openProposal(answered, "CO_CONTRAPROPUESTA")).toBeNull(); expect(openProposal([], "CO_CONTRAPROPUESTA")).toBeNull(); expect(openProposal(undefined, "X")).toBeNull();
});

function dtsApi(detail, calls = []) {
 vi.mocked(api).mockImplementation((path, options) => {
  if (path === "/catalogs/cancellation-reasons") return Promise.resolve(reasons);
  if (path === "/flights/7" && options?.method !== "POST") return Promise.resolve(detail());
  if (options?.method === "POST") { calls.push([path, JSON.parse(options.body)]); return Promise.resolve({}); }
  if (path === "/notifications") return Promise.resolve({ items: [], unread: 0 });
  return Promise.resolve([]);
 });
 return calls;
}

test("el DTS ve la propuesta, la acepta enviando el identificador de la propuesta que vio y recupera el estado real", async () => {
 let state = "PENDIENTE_RESPUESTA_DTS";
 const calls = dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: state } }), negociacion: events({}, { tipo: "CO_CONTRAPROPUESTA", respondeA: 1, fechaHoraPropuesta: "2026-10-24T09:00:00", motivo: "No hay aeronave" }) }));
 renderApp("/app/solicitudes/7", { roles: [ROLE.dts] });
 expect(await screen.findByText(/Nuevo horario propuesto/)).toBeInTheDocument(); expect(screen.getAllByText(/No hay aeronave/).length).toBeGreaterThanOrEqual(1);
 const listCalls = () => vi.mocked(api).mock.calls.filter(([p]) => p === "/flights?scope=mine").length, before = listCalls();
 state = "APROBADO"; fireEvent.click(screen.getByRole("button", { name: "Aceptar contrapropuesta" }));
 await waitFor(() => expect(calls).toEqual([["/flights/7/schedule/response", { aceptar: true, propuestaId: 2, motivoCancelacionId: null, motivoCancelacionPersonalizado: null }]]));
 expect(await screen.findByText("Contrapropuesta aceptada")).toBeInTheDocument(); await waitFor(() => expect(listCalls()).toBeGreaterThan(before)); await waitFor(() => expect(screen.queryByText(/Nuevo horario propuesto/)).toBeNull());
});

test("rechazar la contrapropuesta exige un motivo del catálogo (y descripción para OTRO) y avisa que la solicitud se cancela", async () => {
 const calls = dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: "PENDIENTE_RESPUESTA_DTS" } }), negociacion: events({}, { tipo: "CO_CONTRAPROPUESTA", respondeA: 1, fechaHoraPropuesta: "2026-10-24T09:00:00", motivo: "m" }) }));
 renderApp("/app/solicitudes/7", { roles: [ROLE.dts] });
 const reject = await screen.findByRole("button", { name: "Rechazar contrapropuesta y cancelar" }); expect(reject).toBeDisabled();
 await waitFor(() => expect(screen.getByRole("option", { name: "Otro motivo" })).toBeInTheDocument());
 fireEvent.change(screen.getByLabelText("Motivo de cancelación"), { target: { value: "2" } }); expect(reject).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Especifique el motivo"), { target: { value: "No podemos esperar" } }); expect(reject).toBeEnabled(); fireEvent.click(reject);
 await waitFor(() => expect(calls[0]).toEqual(["/flights/7/schedule/response", { aceptar: false, propuestaId: 2, motivoCancelacionId: "2", motivoCancelacionPersonalizado: "No podemos esperar" }]));
 expect(await screen.findByText("Contrapropuesta rechazada: la solicitud fue cancelada")).toBeInTheDocument();
});

test("sin propuesta vigente (reemplazada o respondida) el DTS no puede responder y ve el motivo de rechazo o cancelación", async () => {
 dtsApi(() => ({ vuelo: sanitary({ flight: { estadoVuelo: "CANCELADO", cancelacion: { motivo: "Falta de aeronave asignada", fecha: "2026-10-20T11:00:00", canceladoPor: "ops" } }, datos: { estadoSolicitud: "CANCELADO", motivoRechazo: null } }), negociacion: events({}) }));
 renderApp("/app/solicitudes/7", { roles: [ROLE.dts] });
 expect(await screen.findByText(/Vuelo CANCELADO por ops/)).toBeInTheDocument(); expect(screen.getByText(/Falta de aeronave asignada/)).toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "Aceptar contrapropuesta" })).toBeNull(); expect(screen.queryByRole("button", { name: "Cancelar solicitud" })).toBeNull();
 cleanup();
 dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: "RECHAZADO", motivoRechazo: "Sin cobertura" }, flight: { estadoVuelo: null } }), negociacion: events({}) }));
 renderApp("/app/solicitudes/7", { roles: [ROLE.dts] }); expect(await screen.findByText(/RECHAZADA por Operaciones: Sin cobertura/)).toBeInTheDocument();
});

test("el DTS cancela su propia solicitud con motivo y la ficha se vuelve a leer del backend", async () => {
 const calls = dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: "SOLICITADO" } }), negociacion: events({}) }));
 renderApp("/app/solicitudes/7", { roles: [ROLE.dts] });
 fireEvent.click(await screen.findByRole("button", { name: "Cancelar solicitud" }));
 const confirm = await screen.findByRole("button", { name: "Confirmar cancelación" }); expect(confirm).toBeDisabled();
 await waitFor(() => expect(screen.getByRole("option", { name: "Falta de aeronave asignada" })).toBeInTheDocument());
 fireEvent.change(screen.getByLabelText("Motivo de cancelación"), { target: { value: "1" } }); fireEvent.click(confirm);
 await waitFor(() => expect(calls).toEqual([["/flights/7/cancel", { motivoCancelacionId: "1", motivoCancelacionPersonalizado: null }]])); expect(await screen.findByText("Solicitud cancelada")).toBeInTheDocument();
 const detailCalls = vi.mocked(api).mock.calls.filter(([p, o]) => p === "/flights/7" && o?.method !== "POST").length; expect(detailCalls).toBeGreaterThanOrEqual(2);
});

test("Operaciones acepta, propone otro horario, reemplaza una propuesta y rechaza con motivo: cada acción se despliega sola y cancelar no cambia nada", async () => {
 const { NegotiationPanel } = await import("./negotiation"); const call = vi.fn().mockResolvedValue(true);
 const { rerender } = render(<NegotiationPanel flight={{ id: 7, codigo: "V-7", estado: "SOLICITADO", datosSanitarios: {} }} events={events({})} call={call} reasons={reasons} />);
 // al abrir sólo se ven las tres decisiones: ningún formulario
 expect(screen.getByRole("button", { name: "Aceptar horario solicitado" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Proponer otro horario" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Rechazar solicitud" })).toBeInTheDocument();
 expect(screen.queryByLabelText("Nueva fecha y hora")).toBeNull(); expect(screen.queryByLabelText("Motivo de cancelación")).toBeNull();
 // aceptar pide confirmación; cancelar vuelve sin llamar
 fireEvent.click(screen.getByRole("button", { name: "Aceptar horario solicitado" })); fireEvent.click(screen.getByRole("button", { name: "Cancelar" })); expect(call).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: "Aceptar horario solicitado" })); fireEvent.click(screen.getByRole("button", { name: "Confirmar horario" }));
 await waitFor(() => expect(call).toHaveBeenCalledWith("/flights/7/schedule/accept", null, "Horario aceptado"));
 // proponer abre su formulario y exige fecha y motivo
 fireEvent.click(screen.getByRole("button", { name: "Proponer otro horario" })); expect(screen.queryByRole("button", { name: "Aceptar horario solicitado" })).toBeNull();
 const send = screen.getByRole("button", { name: "Enviar propuesta" }); expect(send).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Nueva fecha y hora"), { target: { value: "2026-10-24T09:00" } }); fireEvent.change(screen.getByLabelText("Motivo de la propuesta"), { target: { value: "Sin aeronave" } }); fireEvent.click(send);
 await waitFor(() => expect(call).toHaveBeenCalledWith("/flights/7/schedule/counterproposal", { salida: "2026-10-24T09:00", motivo: "Sin aeronave" }, "Propuesta enviada al DTS"));
 // rechazar exige motivo del catálogo (y descripción para OTRO)
 fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud" }));
 const reject = screen.getByRole("button", { name: "Confirmar rechazo" }); expect(reject).toBeDisabled(); fireEvent.change(screen.getByLabelText("Motivo de cancelación"), { target: { value: "1" } }); fireEvent.click(reject);
 await waitFor(() => expect(call).toHaveBeenCalledWith("/flights/7/schedule/reject", { motivoCancelacionId: "1", motivoCancelacionPersonalizado: null }, "Solicitud rechazada"));
 // con una propuesta pendiente de respuesta del DTS sólo se puede reemplazar
 rerender(<NegotiationPanel flight={{ id: 7, codigo: "V-7", estado: "PENDIENTE_RESPUESTA_DTS", datosSanitarios: {} }} events={events({}, { tipo: "CO_CONTRAPROPUESTA", respondeA: 1, fechaHoraPropuesta: "2026-10-24T09:00:00", motivo: "Sin aeronave" })} call={call} reasons={reasons} />);
 expect(screen.getByText(/Esperando respuesta del DTS/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Reemplazar propuesta" })).toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "Rechazar solicitud" })).toBeNull(); expect(screen.queryByRole("button", { name: "Aceptar horario solicitado" })).toBeNull();
 expect(screen.getByText("Última propuesta vigente").nextSibling).toHaveTextContent("2026-10-24 09:00 · Sin aeronave");
 // acordado: sólo queda el resumen y el historial; no hay acciones de evaluación
 rerender(<NegotiationPanel flight={{ id: 7, codigo: "V-7", estado: "APROBADO", salida: "2026-10-24T09:00:00", datosSanitarios: {} }} events={[]} call={call} reasons={reasons} />);
 expect(screen.getByText(/Horario acordado:/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /horario|propuesta|Rechazar/i })).toBeNull();
 rerender(<NegotiationPanel flight={{ id: 8, codigo: "V-8", estado: "SOLICITADO", datosSanitarios: null }} events={[]} call={call} reasons={reasons} />); expect(screen.queryByRole("heading", { name: "Negociación del horario" })).toBeNull();
});

test("si la operación falla el formulario sigue abierto con lo escrito y la pantalla no queda rota", async () => {
 const { NegotiationPanel } = await import("./negotiation"); const call = vi.fn().mockResolvedValue(false);
 render(<NegotiationPanel flight={{ id: 7, codigo: "V-7", estado: "SOLICITADO", datosSanitarios: {} }} events={events({})} call={call} reasons={reasons} />);
 fireEvent.click(screen.getByRole("button", { name: "Proponer otro horario" }));
 fireEvent.change(screen.getByLabelText("Nueva fecha y hora"), { target: { value: "2026-10-24T09:00" } }); fireEvent.change(screen.getByLabelText("Motivo de la propuesta"), { target: { value: "Sin aeronave" } });
 fireEvent.click(screen.getByRole("button", { name: "Enviar propuesta" })); await waitFor(() => expect(call).toHaveBeenCalled());
 expect(screen.getByLabelText("Motivo de la propuesta")).toHaveValue("Sin aeronave");
});

test("la lista de Operaciones destaca las solicitudes de extrema urgencia", async () => {
 const flight = (id, codigo, urgent) => ({ id, codigo, estadoVuelo: null, tipo: { codigo: "SANITARIO" }, datosSanitarios: { fechaSolicitada: "2026-10-23T09:00:00", fechaRecepcion: "2026-10-20T09:00:00", extremaUrgencia: urgent, fechaLimiteTraslado: urgent ? "2026-10-23T12:00:00" : null, estadoSolicitud: "SOLICITADO", prioridad: "ALTA" } });
 vi.mocked(api).mockImplementation((p) => Promise.resolve(p === "/flights" ? [flight(1, "V-URG", true), flight(2, "V-NOR", false)] : p === "/notifications" ? { items: [], unread: 0 } : []));
 renderApp("/app/solicitudes", { roles: [ROLE.ops] });
 const urgent = (await screen.findByRole("link", { name: "V-URG" })).closest("tr");
 expect(within(urgent).getByText("EXTREMA URGENCIA")).toBeInTheDocument(); expect(urgent).toHaveClass("urgent-row");
 const normal = screen.getByRole("link", { name: "V-NOR" }).closest("tr"); expect(within(normal).queryByText("EXTREMA URGENCIA")).toBeNull();
 expect(urgent.compareDocumentPosition(normal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // la extrema urgencia se atiende primero
});
