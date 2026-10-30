import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { FlightCrew } from "./main.jsx";

vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => vi.mocked(api).mockReset());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const row = (id, nombre, extra = {}) => ({ id, userId: 100 + id, nombre, apellido: "Prueba", crewRoleName: "Médico", comandante: false, vigente: true, ...extra });
const commander = row(1, "Comandante", { crewRoleName: "Comandante", comandante: true });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test("la tripulación se actualiza sola cuando otra persona la modifica, sin recargar la pantalla", async () => {
  let current = [commander, row(2, "Luis")];
  vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/flights/7/crew" ? current : []));
  render(<FlightCrew flightId={7} state="PLANIFICADO" refreshMs={40} msg={vi.fn()} />);
  await screen.findByText(/Luis Prueba/);
  current = [commander, row(3, "Marta")];                                             // reemplazo hecho por Operaciones
  await waitFor(() => expect(screen.getByText(/Marta Prueba/)).toBeInTheDocument());
  expect(screen.queryByText(/Luis Prueba/)).toBeNull();
  current = [commander];                                                                // retiro posterior
  await waitFor(() => expect(screen.queryByText(/Marta Prueba/)).toBeNull());
});

test("al cambiar el estado del vuelo (p. ej. tras aceptar la asignación) se vuelve a consultar la tripulación", async () => {
  let current = [commander];
  vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/flights/7/crew" ? current : []));
  const { rerender } = render(<FlightCrew flightId={7} state="PENDIENTE_CONFIRMACION_COMANDANTE" refreshMs={600000} msg={vi.fn()} />);
  await screen.findByText(/Comandante Prueba/);
  current = [commander, row(2, "Luis")];
  rerender(<FlightCrew flightId={7} state="PLANIFICADO" refreshMs={600000} msg={vi.fn()} />);
  expect(await screen.findByText(/Luis Prueba/)).toBeInTheDocument();
});

test("una respuesta tardía de una consulta anterior no pisa a la más nueva", async () => {
  const slow = deferred();
  const responses = [slow.promise, Promise.resolve([commander, row(3, "Marta")])];
  vi.mocked(api).mockImplementation((path) => path === "/flights/7/crew" ? (responses.shift() || Promise.resolve([commander, row(3, "Marta")])) : Promise.resolve([]));
  const { rerender } = render(<FlightCrew flightId={7} state="PENDIENTE_CONFIRMACION_COMANDANTE" refreshMs={600000} msg={vi.fn()} />);
  rerender(<FlightCrew flightId={7} state="PLANIFICADO" refreshMs={600000} msg={vi.fn()} />);   // segunda consulta, más reciente
  await screen.findByText(/Marta Prueba/);
  await act(async () => { slow.resolve([commander, row(2, "Luis")]); await Promise.resolve(); });   // llega tarde la primera, con datos viejos
  expect(screen.getByText(/Marta Prueba/)).toBeInTheDocument();
  expect(screen.queryByText(/Luis Prueba/)).toBeNull();
});

test("un fallo del refresco de fondo conserva lo que ya se ve y no muestra un error", async () => {
  let fail = false;
  vi.mocked(api).mockImplementation((path) => path === "/flights/7/crew" ? (fail ? Promise.reject(new Error("sin conexión")) : Promise.resolve([commander, row(2, "Luis")])) : Promise.resolve([]));
  render(<FlightCrew flightId={7} state="PLANIFICADO" refreshMs={40} msg={vi.fn()} />);
  await screen.findByText(/Luis Prueba/);
  fail = true;
  await new Promise((r) => setTimeout(r, 200));
  expect(screen.getByText(/Luis Prueba/)).toBeInTheDocument();
  expect(screen.queryByText(/sin conexión/)).toBeNull();
});

test("con la pestaña oculta no se consulta en segundo plano", async () => {
  vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/flights/7/crew" ? [commander] : []));
  render(<FlightCrew flightId={7} state="PLANIFICADO" refreshMs={30} msg={vi.fn()} />);
  await screen.findByText(/Comandante Prueba/);
  const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const before = vi.mocked(api).mock.calls.length;
  await new Promise((r) => setTimeout(r, 200));
  expect(vi.mocked(api).mock.calls.length).toBe(before);
  spy.mockReturnValue("visible");
  await waitFor(() => expect(vi.mocked(api).mock.calls.length).toBeGreaterThan(before));
});
