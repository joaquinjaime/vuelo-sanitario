import { beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";

vi.mock("./api", () => ({ api: vi.fn(() => Promise.resolve([])) }));
beforeEach(() => { cleanup(); localStorage.clear(); vi.mocked(api).mockReset(); });

/** Promesa que se resuelve a mano: permite que una respuesta antigua llegue después de una más nueva. */
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test("commander panel: a late detail response of the previously selected flight never replaces the selected one", async () => {
  const { Cmd } = await import("./main.jsx");
  const detail = (id, state) => ({ vuelo: { id, codigo: `OP-${id}`, estadoVuelo: state, tipo: { codigo: "OTRO", nombre: "Otro" } }, recursos: {}, negociacion: [] });
  const slow = deferred();
  vi.mocked(api).mockImplementation((path) => {
    if (path === "/flights/1") return slow.promise;
    if (path === "/flights/2") return Promise.resolve(detail("2", "PLANIFICADO"));
    if (path.endsWith("/route")) return Promise.resolve({ estado: "SIN_PLANIFICAR", versiones: [], editable: false, causas: [] });
    return Promise.resolve([]);
  });
  const flights = [{ id: "1", codigo: "OP-1", estadoVuelo: "PENDIENTE_CONFIRMACION_COMANDANTE", tipo: { codigo: "OTRO", nombre: "Otro" } }, { id: "2", codigo: "OP-2", estadoVuelo: "PLANIFICADO", tipo: { codigo: "OTRO", nombre: "Otro" } }];
  render(<Cmd d={{ flights }} done={vi.fn(() => Promise.resolve())} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Vuelo"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Vuelo"), { target: { value: "2" } });
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/2"));
  slow.resolve(detail("1", "PENDIENTE_CONFIRMACION_COMANDANTE"));            // llega tarde, después de la del vuelo 2
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole("button", { name: "Aceptar asignación" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Vuelo")).toHaveValue("2");
});

test("commander panel: after accepting, an older refresh that arrives late cannot bring the pending-assignment buttons back", async () => {
  const { Cmd } = await import("./main.jsx");
  const detail = (state) => ({ vuelo: { id: "1", codigo: "OP-1", estadoVuelo: state, tipo: { codigo: "OTRO", nombre: "Otro" } }, recursos: {}, negociacion: [] });
  let gets = 0, accepted = false; const staleRefresh = deferred();
  vi.mocked(api).mockImplementation((path, options) => {
    if (path === "/flights/1/commander-assignment/response" && options?.method === "POST") { accepted = true; return Promise.resolve({}); }
    if (path === "/flights/1") { gets += 1; if (gets === 2) return staleRefresh.promise; return Promise.resolve(detail(accepted ? "PLANIFICADO" : "PENDIENTE_CONFIRMACION_COMANDANTE")); }
    if (path.endsWith("/route")) return Promise.resolve({ estado: "SIN_PLANIFICAR", versiones: [], editable: accepted, causas: [] });
    return Promise.resolve([]);
  });
  const flights = [{ id: "1", codigo: "OP-1", estadoVuelo: "PENDIENTE_CONFIRMACION_COMANDANTE", tipo: { codigo: "OTRO", nombre: "Otro" } }];
  render(<Cmd d={{ flights }} done={vi.fn(() => Promise.resolve())} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Vuelo"), { target: { value: "1" } });
  const accept = await screen.findByRole("button", { name: "Aceptar asignación" });
  // 2.ª consulta (la lenta, anterior a la aceptación) queda pendiente; la 3.ª (posterior a aceptar) llega primero.
  fireEvent.click(accept);                                      // POST + refresco: es la 2.ª consulta, lenta
  await waitFor(() => expect(gets).toBe(2));
  fireEvent.change(screen.getByLabelText("Vuelo"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Vuelo"), { target: { value: "1" } });   // nueva consulta (3.ª) con el estado ya aceptado
  await waitFor(() => expect(gets).toBe(3));
  expect(await screen.findByLabelText("Recorrido y puntos intermedios en orden")).toBeInTheDocument();
  staleRefresh.resolve(detail("PENDIENTE_CONFIRMACION_COMANDANTE"));            // la respuesta vieja llega al final
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole("button", { name: "Aceptar asignación" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Recorrido y puntos intermedios en orden")).toBeInTheDocument();
});

test("hangar panel: switching flights ignores the late answer of the previous flight", async () => {
  const { HangarInfo } = await import("./main.jsx");
  const hangar = (aircraft) => ({ estado: "PENDIENTE", aeronave: aircraft, origenPlanificado: null, ubicacionConfirmada: null, versiones: [], puedeEditar: false });
  const slow = deferred();
  vi.mocked(api).mockImplementation((path) => path === "/flights/1/hangar" ? slow.promise : path === "/flights/2/hangar" ? Promise.resolve(hangar("LV-DOS")) : Promise.resolve([]));
  const view = render(<HangarInfo flightId={1} />);
  view.rerender(<HangarInfo flightId={2} />);
  expect(await screen.findByText(/LV-DOS/)).toBeInTheDocument();
  slow.resolve(hangar("LV-UNO"));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText(/LV-UNO/)).not.toBeInTheDocument();
  expect(screen.getByText(/LV-DOS/)).toBeInTheDocument();
});

test("flight log: a late page answer does not replace the newer page", async () => {
  const { FlightLog } = await import("./main.jsx");
  const page = (text) => ({ entradas: [{ id: text === "primera" ? 1 : 2, tipo: "DEMORA", descripcion: text, ocurrido: "2026-10-28T12:00:00Z", registrado: "2026-10-28T12:00:00Z", origen: "MANUAL", importancia: "NORMAL", responsable: "cmd" }], hayMas: false, puedeRegistrar: false });
  const slow = deferred();
  let calls = 0;
  vi.mocked(api).mockImplementation((path) => { if (!path.startsWith("/flights/7/log")) return Promise.resolve([]); calls += 1; return calls === 1 ? slow.promise : Promise.resolve(page("segunda")); });
  const view = render(<FlightLog flightId={7} revision={0} allowWrite={false} />);
  view.rerender(<FlightLog flightId={7} revision={1} allowWrite={false} />);
  expect(await screen.findByText("segunda")).toBeInTheDocument();
  slow.resolve(page("primera"));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText("primera")).not.toBeInTheDocument();
  expect(screen.getByText("segunda")).toBeInTheDocument();
});
