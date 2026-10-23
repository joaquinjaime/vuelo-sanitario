import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

const reasons = [{ id: 1, codigo: "SIN_AERONAVE_ASIGNADA", nombre: "Falta de aeronave asignada" }, { id: 2, codigo: "OTRO", nombre: "Otro motivo" }];
const sanitary = (extra = {}) => ({ id: 7, codigo: "V-7", estadoVuelo: null, tipo: { codigo: "SANITARIO" }, datosSanitarios: { fechaSolicitada: "2026-10-23T09:00:00", extremaUrgencia: false, estadoSolicitud: "SOLICITADO", localidadOrigenSolicitada: { nombre: "Tafí Viejo", provincia: "Tucumán" }, localidadDestinoSolicitada: { nombre: "Rosario", provincia: "Santa Fe" }, ...extra.datos }, ...extra.flight });
const events = (...rows) => rows.map((r, i) => ({ id: i + 1, respondeA: null, tipo: "DTS_PROPUESTA", fechaHoraPropuesta: null, fechaHoraLlegadaPropuesta: null, motivo: null, actor: "x", fechaOcurrencia: "2026-10-20T10:00:00", ...r }));

test("openProposal devuelve sólo la propuesta vigente: la reemplazada o respondida es obsoleta", async () => {
 const { openProposal } = await import("./main.jsx");
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
  return Promise.resolve([]);
 });
 return calls;
}

test("el DTS ve la propuesta, la acepta enviando el identificador de la propuesta que vio y recupera el estado real", async () => {
 const { DtsResponses } = await import("./main.jsx"); const done = vi.fn(); const msg = vi.fn(); let state = "PENDIENTE_RESPUESTA_DTS";
 const calls = dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: state } }), negociacion: events({}, { tipo: "CO_CONTRAPROPUESTA", respondeA: 1, fechaHoraPropuesta: "2026-10-24T09:00:00", motivo: "No hay aeronave" }) }));
 render(<DtsResponses d={{ flights: [{ id: 7, codigo: "V-7", estado: "PENDIENTE_RESPUESTA_DTS", extremaUrgencia: true }] }} done={done} msg={msg} />);
 fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "7" } });
 expect(await screen.findByText(/Nuevo horario propuesto/)).toBeInTheDocument(); expect(screen.getAllByText(/No hay aeronave/).length).toBeGreaterThanOrEqual(1); expect(screen.getByRole("option", { name: /⚠ URGENTE · V-7/ })).toBeInTheDocument();
 state = "APROBADO"; fireEvent.click(screen.getByRole("button", { name: "Aceptar contrapropuesta" }));
 await waitFor(() => expect(calls).toEqual([["/flights/7/schedule/response", { aceptar: true, propuestaId: 2, motivoCancelacionId: null, motivoCancelacionPersonalizado: null }]]));
 expect(msg).toHaveBeenCalledWith("Contrapropuesta aceptada"); expect(done).toHaveBeenCalled(); await waitFor(() => expect(screen.queryByText(/Nuevo horario propuesto/)).toBeNull());
});

test("rechazar la contrapropuesta exige un motivo del catálogo (y descripción para OTRO) y avisa que la solicitud se cancela", async () => {
 const { DtsResponses } = await import("./main.jsx"); const msg = vi.fn();
 const calls = dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: "PENDIENTE_RESPUESTA_DTS" } }), negociacion: events({}, { tipo: "CO_CONTRAPROPUESTA", respondeA: 1, fechaHoraPropuesta: "2026-10-24T09:00:00", motivo: "m" }) }));
 render(<DtsResponses d={{ flights: [{ id: 7, codigo: "V-7", estado: "PENDIENTE_RESPUESTA_DTS" }] }} done={vi.fn()} msg={msg} />);
 fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "7" } });
 const reject = await screen.findByRole("button", { name: "Rechazar contrapropuesta y cancelar" }); expect(reject).toBeDisabled();
 const selects = screen.getAllByLabelText("Motivo de cancelación"); fireEvent.change(selects[0], { target: { value: "2" } }); expect(reject).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Especifique el motivo"), { target: { value: "No podemos esperar" } }); expect(reject).toBeEnabled(); fireEvent.click(reject);
 await waitFor(() => expect(calls[0]).toEqual(["/flights/7/schedule/response", { aceptar: false, propuestaId: 2, motivoCancelacionId: "2", motivoCancelacionPersonalizado: "No podemos esperar" }]));
 expect(msg).toHaveBeenCalledWith("Contrapropuesta rechazada: la solicitud fue cancelada");
});

test("sin propuesta vigente (reemplazada o respondida) el DTS no puede responder y ve el motivo de rechazo o cancelación", async () => {
 const { DtsResponses } = await import("./main.jsx");
 dtsApi(() => ({ vuelo: sanitary({ flight: { estadoVuelo: "CANCELADO", cancelacion: { motivo: "Falta de aeronave asignada", fecha: "2026-10-20T11:00:00", canceladoPor: "ops" } }, datos: { estadoSolicitud: "CANCELADO", motivoRechazo: null } }), negociacion: events({}) }));
 render(<DtsResponses d={{ flights: [{ id: 7, codigo: "V-7", estado: "CANCELADO" }] }} done={vi.fn()} msg={vi.fn()} />);
 fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "7" } });
 expect(await screen.findByText(/Vuelo CANCELADO por ops/)).toBeInTheDocument(); expect(screen.getByText(/Falta de aeronave asignada/)).toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "Aceptar contrapropuesta" })).toBeNull(); expect(screen.queryByRole("button", { name: "Cancelar solicitud" })).toBeNull();
 cleanup();
 dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: "RECHAZADO", motivoRechazo: "Sin cobertura" }, flight: { estadoVuelo: null } }), negociacion: events({}) }));
 render(<DtsResponses d={{ flights: [{ id: 7, codigo: "V-7", estado: "RECHAZADO" }] }} done={vi.fn()} msg={vi.fn()} />);
 fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "7" } }); expect(await screen.findByText(/RECHAZADA por Operaciones: Sin cobertura/)).toBeInTheDocument();
});

test("el DTS cancela su propia solicitud con motivo y la ficha se vuelve a leer del backend", async () => {
 const { DtsResponses } = await import("./main.jsx"); const msg = vi.fn();
 const calls = dtsApi(() => ({ vuelo: sanitary({ datos: { estadoSolicitud: "SOLICITADO" } }), negociacion: events({}) }));
 render(<DtsResponses d={{ flights: [{ id: 7, codigo: "V-7", estado: "SOLICITADO" }] }} done={vi.fn()} msg={msg} />);
 fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "7" } });
 const cancel = await screen.findByRole("button", { name: "Cancelar solicitud" }); expect(cancel).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Motivo de cancelación"), { target: { value: "1" } }); fireEvent.click(cancel);
 await waitFor(() => expect(calls).toEqual([["/flights/7/cancel", { motivoCancelacionId: "1", motivoCancelacionPersonalizado: null }]])); expect(msg).toHaveBeenCalledWith("Solicitud cancelada");
 const detailCalls = vi.mocked(api).mock.calls.filter(([p, o]) => p === "/flights/7" && o?.method !== "POST").length; expect(detailCalls).toBeGreaterThanOrEqual(2);
});

test("Operaciones aprueba, propone otro horario, reemplaza una propuesta y rechaza con motivo según el estado", async () => {
 const { RequestEvaluation } = await import("./main.jsx"); const call = vi.fn();
 const { rerender } = render(<RequestEvaluation flight={{ id: 7, estado: "SOLICITADO", datosSanitarios: {} }} events={events({})} call={call} reasons={reasons} />);
 fireEvent.click(screen.getByRole("button", { name: "Aceptar horario DTS" })); expect(call).toHaveBeenCalledWith("/flights/7/schedule/accept", null, "Horario aceptado");
 const propose = screen.getByRole("button", { name: "Proponer otro horario" }); expect(propose).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Nueva fecha y hora"), { target: { value: "2026-10-24T09:00" } }); fireEvent.change(screen.getByLabelText("Motivo de la propuesta"), { target: { value: "Sin aeronave" } }); fireEvent.click(propose);
 expect(call).toHaveBeenCalledWith("/flights/7/schedule/counterproposal", { salida: "2026-10-24T09:00", motivo: "Sin aeronave" }, "Propuesta enviada al DTS");
 const reject = screen.getByRole("button", { name: "Rechazar solicitud" }); expect(reject).toBeDisabled(); fireEvent.change(screen.getByLabelText("Motivo de cancelación"), { target: { value: "1" } }); fireEvent.click(reject);
 expect(call).toHaveBeenCalledWith("/flights/7/schedule/reject", { motivoCancelacionId: "1", motivoCancelacionPersonalizado: null }, "Solicitud rechazada");
 rerender(<RequestEvaluation flight={{ id: 7, estado: "PENDIENTE_RESPUESTA_DTS", datosSanitarios: {} }} events={events({}, { tipo: "CO_CONTRAPROPUESTA", respondeA: 1, fechaHoraPropuesta: "2026-10-24T09:00:00" })} call={call} reasons={reasons} />);
 expect(screen.getByText(/espera la respuesta del DTS/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Reemplazar propuesta" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Rechazar solicitud" })).toBeNull(); expect(screen.queryByRole("button", { name: "Aceptar horario DTS" })).toBeNull();
 rerender(<RequestEvaluation flight={{ id: 7, estado: "APROBADO", datosSanitarios: {} }} events={[]} call={call} reasons={reasons} />); expect(screen.queryByRole("heading", { name: "Evaluación de la solicitud" })).toBeNull();
 rerender(<RequestEvaluation flight={{ id: 8, estado: "SOLICITADO", datosSanitarios: null }} events={[]} call={call} reasons={reasons} />); expect(screen.queryByRole("heading", { name: "Evaluación de la solicitud" })).toBeNull();
});

test("la lista de Operaciones destaca las solicitudes de extrema urgencia en el selector", async () => {
 const { Ops } = await import("./main.jsx");
 vi.mocked(api).mockImplementation((p) => Promise.resolve(p === "/catalogs/cancellation-reasons" ? reasons : []));
 render(<Ops d={{ flights: [{ id: 1, codigo: "V-URG", estado: "SOLICITADO", extremaUrgencia: true }, { id: 2, codigo: "V-NOR", estado: "SOLICITADO", extremaUrgencia: false }], aircraft: [], commanders: [], airports: [] }} done={vi.fn()} msg={vi.fn()} />);
 expect(await screen.findByRole("option", { name: /⚠ URGENTE · V-URG/ })).toBeInTheDocument(); expect(screen.getByRole("option", { name: /^V-NOR/ })).toBeInTheDocument();
});
