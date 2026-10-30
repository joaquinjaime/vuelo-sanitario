import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { FlightRoute, RouteReviewQueue } from "./flightRoute";

vi.mock("./api", () => ({ api: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(() => cleanup());

const version = (n, extra = {}) => ({
  version: n, estado: "BORRADOR", recorrido: `Recorrido ${n}`, alternativoId: null, alternativo: null, altitudPies: 9000, distanciaNm: 100, tiempoEstimadoMinutos: 90, observaciones: null,
  creadoPor: "comandante", fechaCreacion: `2030-01-0${n}T12:00:00`, vigente: true, actual: true, motivoModificacion: null, presentadoPor: null, fechaPresentacion: null,
  revisadoPor: null, fechaRevision: null, observacionesRevision: null, fechaInvalidacion: null, causaInvalidacion: null,
  condiciones: { origen: "Tucumán", destino: "Aeroparque", salida: "2030-01-05T10:00:00", llegada: "2030-01-05T12:00:00" }, ...extra,
});
const view = (estado, extra = {}) => ({
  estado, editable: false, motivo: null, origen: "Tucumán", destino: "Aeroparque", salida: "2030-01-05T10:00:00", llegada: "2030-01-05T12:00:00", versiones: [version(1, { estado })],
  versionVigente: 1, causas: [], requiereMotivo: false, puedePresentar: false, puedeRevisar: false, inicio: { aplica: true, permitido: false, codigo: "RUTA_NO_PRESENTADA", mensaje: "falta presentar" }, ...extra,
});
/** Sirve la ruta con el estado mutable `state` y registra las escrituras. */
const serve = (state, writes = {}) => vi.mocked(api).mockImplementation((path, options) => {
  const key = `${options?.method || "GET"} ${path}`;
  if (key === "GET /catalogs/airports?q=") return Promise.resolve([{ id: 12, nombre: "Aeroparque" }]);
  if (key === "GET /flights/7/route") return Promise.resolve(typeof state.value === "function" ? state.value() : state.value);
  if (writes[key]) return writes[key](options);
  return Promise.resolve({});
});
const body = (key) => JSON.parse(vi.mocked(api).mock.calls.find(([path, options]) => `${options?.method || "GET"} ${path}` === key)[1].body);
const calls = (key) => vi.mocked(api).mock.calls.filter(([path, options]) => `${options?.method || "GET"} ${path}` === key);

test("cada estado se explica con un mensaje claro y sin vocabulario técnico", async () => {
  const cases = [
    ["SIN_PLANIFICAR", "El comandante todavía no planificó la ruta."], ["BORRADOR", "falta presentarla a Operaciones"], ["PENDIENTE_REVISION", "Ruta pendiente de revisión de Operaciones."],
    ["APROBADA", "Ruta aprobada por Operaciones."], ["DEVUELTA", "Operaciones devolvió la ruta con observaciones."], ["REQUIERE_REVISION", "La ruta requiere una nueva revisión."],
  ];
  for (const [estado, text] of cases) {
    cleanup(); serve({ value: view(estado) });
    render(<FlightRoute flightId={7} />);
    expect(await screen.findByRole("status")).toHaveTextContent(text);
  }
});

test("una ruta devuelta muestra las observaciones de Operaciones y una invalidada, la causa de la nueva revisión", async () => {
  serve({ value: view("DEVUELTA", { versiones: [version(1, { estado: "DEVUELTA", revisadoPor: "operador", fechaRevision: "2030-01-02T09:00:00", observacionesRevision: "Falta el alternativo" })] }) });
  render(<FlightRoute flightId={7} />);
  expect(await screen.findByText("Falta el alternativo", { selector: ".route-observation" })).toBeInTheDocument();
  cleanup();
  serve({ value: view("REQUIERE_REVISION", { causas: ["cambió el horario de salida"], inicio: { aplica: true, permitido: false, codigo: "RUTA_REQUIERE_REVISION", mensaje: "La ruta requiere una nueva revisión: cambió el horario de salida" } }) });
  render(<FlightRoute flightId={7} />);
  expect((await screen.findByText(/Motivo de la nueva revisión:/)).closest("p")).toHaveTextContent("cambió el horario de salida");
  expect(screen.getByText(/Inicio del vuelo bloqueado por la ruta/)).toBeInTheDocument();
});

test("el comandante guarda la versión cargada y puede guardar y presentar en un solo paso", async () => {
  const state = { value: view("SIN_PLANIFICAR", { editable: true, versiones: [], versionVigente: null }) };
  serve(state, { "PUT /flights/7/route": () => { state.value = view("BORRADOR", { editable: true, puedePresentar: true }); return Promise.resolve({}); } });
  const msg = vi.fn(); render(<FlightRoute flightId={7} canEdit msg={msg} />);
  await screen.findByText("Sin planificar");
  expect(screen.getByRole("button", { name: "Guardar ruta" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Recorrido y puntos intermedios en orden"), { target: { value: "TUC - AEP directo" } });
  fireEvent.change(screen.getByLabelText("Altitud (pies)"), { target: { value: "9000" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar ruta" }));
  await waitFor(() => expect(calls("PUT /flights/7/route")).toHaveLength(1));
  expect(body("PUT /flights/7/route")).toMatchObject({ version: 0, recorrido: "TUC - AEP directo", altitudPies: 9000, alternativoId: null });
  expect(body("PUT /flights/7/route")).not.toHaveProperty("presentar");
  await waitFor(() => expect(msg).toHaveBeenCalledWith("Ruta guardada"));
  fireEvent.change(await screen.findByLabelText("Recorrido y puntos intermedios en orden"), { target: { value: "TUC - COR - AEP" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar y presentar a Operaciones" }));
  await waitFor(() => expect(calls("PUT /flights/7/route")).toHaveLength(2));
  expect(JSON.parse(calls("PUT /flights/7/route")[1][1].body)).toMatchObject({ version: 1, recorrido: "TUC - COR - AEP", presentar: true });
});

test("corregir una ruta devuelta exige el motivo de la modificación y lo envía", async () => {
  serve({ value: view("DEVUELTA", { editable: true, requiereMotivo: true, versiones: [version(1, { estado: "DEVUELTA", observacionesRevision: "Falta el alternativo" })] }) }, { "PUT /flights/7/route": () => Promise.resolve({}) });
  render(<FlightRoute flightId={7} canEdit msg={vi.fn()} />);
  await screen.findByLabelText("Motivo de la modificación");
  fireEvent.change(screen.getByLabelText("Aeropuerto alternativo"), { target: { value: "12" } });
  expect(screen.getByRole("button", { name: "Guardar y presentar a Operaciones" })).toBeDisabled();
  expect(screen.getByText(/Indique el motivo de la modificación/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Motivo de la modificación"), { target: { value: "Agrego el alternativo" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar y presentar a Operaciones" }));
  await waitFor(() => expect(calls("PUT /flights/7/route")).toHaveLength(1));
  expect(body("PUT /flights/7/route")).toMatchObject({ version: 1, alternativoId: 12, motivoModificacion: "Agrego el alternativo", presentar: true });
});

test("un borrador sin cambios se presenta con el botón de presentación y un envío doble no se duplica", async () => {
  let release; const pending = new Promise((resolve) => { release = resolve; });
  serve({ value: view("BORRADOR", { editable: true, puedePresentar: true }) }, { "POST /flights/7/route/submit": () => pending });
  render(<FlightRoute flightId={7} canEdit msg={vi.fn()} />);
  await screen.findByLabelText("Recorrido y puntos intermedios en orden");
  expect(screen.getByRole("button", { name: "Guardar ruta" })).toBeDisabled(); // sin cambios no hay nada que guardar
  const button = screen.getByRole("button", { name: "Presentar a Operaciones" });
  fireEvent.click(button); fireEvent.click(button);
  expect(calls("POST /flights/7/route/submit")).toHaveLength(1);
  expect(body("POST /flights/7/route/submit")).toEqual({ version: 1 });
  await act(async () => { release({}); });
});

test("el historial conserva todas las versiones: la vigente abierta y las anteriores plegadas, con autor, decisión y motivo", async () => {
  const v2 = version(2, { estado: "PENDIENTE_REVISION", motivoModificacion: "Agrego el alternativo", presentadoPor: "comandante", fechaPresentacion: "2030-01-03T08:00:00" });
  const v1 = version(1, { estado: "DEVUELTA", actual: false, vigente: false, presentadoPor: "comandante", fechaPresentacion: "2030-01-01T13:00:00", revisadoPor: "operador", fechaRevision: "2030-01-02T09:00:00", observacionesRevision: "Falta el alternativo" });
  serve({ value: view("PENDIENTE_REVISION", { versiones: [v2, v1], versionVigente: 2 }) });
  const { container } = render(<FlightRoute flightId={7} />);
  await screen.findByText("Recorrido 2", { selector: "p" });
  const items = container.querySelectorAll("details.route-version");
  expect(items).toHaveLength(2); expect(items[0]).toHaveProperty("open", true); expect(items[1]).toHaveProperty("open", false);
  expect(within(items[0]).getByText(/basada en la versión 1/)).toBeInTheDocument();
  expect(within(items[0]).getByText(/Motivo de la modificación: Agrego el alternativo/)).toBeInTheDocument();
  expect(within(items[1]).getByText(/Devuelta por operador/)).toHaveTextContent("Falta el alternativo");
  expect(within(items[1]).getByText(/Condiciones del vuelo: Tucumán → Aeroparque/)).toBeInTheDocument();
});

test("una aprobación invalidada se distingue en el historial y conserva quién la aprobó", async () => {
  const invalidated = version(1, { estado: "REQUIERE_REVISION", revisadoPor: "operador", fechaRevision: "2030-01-02T09:00:00", fechaInvalidacion: "2030-01-03T10:00:00", causaInvalidacion: "cambió la aeronave" });
  serve({ value: view("REQUIERE_REVISION", { versiones: [invalidated], causas: ["cambió la aeronave"] }) });
  render(<FlightRoute flightId={7} />);
  expect(await screen.findByText(/Aprobada por operador/)).toBeInTheDocument();
  expect(screen.getByText(/Aprobación invalidada el 2030-01-03 10:00: cambió la aeronave/)).toBeInTheDocument();
});

test("Operaciones aprueba la versión que está revisando y la pantalla se actualiza con la decisión", async () => {
  const state = { value: view("PENDIENTE_REVISION", { puedeRevisar: true, versionVigente: 3, versiones: [version(3, { estado: "PENDIENTE_REVISION" })] }) };
  serve(state, { "POST /flights/7/route/approve": () => { state.value = view("APROBADA", { versionVigente: 3, versiones: [version(3, { estado: "APROBADA", revisadoPor: "operador", fechaRevision: "2030-01-04T09:00:00" })], inicio: { aplica: true, permitido: true, codigo: null, mensaje: null } }); return Promise.resolve({}); } });
  const msg = vi.fn(), changed = vi.fn(); render(<FlightRoute flightId={7} canReview msg={msg} onChanged={changed} />);
  expect(await screen.findByText(/Revisión de Operaciones · versión 3/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Comentario de la aprobación (opcional)"), { target: { value: "Conforme" } });
  fireEvent.click(screen.getByRole("button", { name: "Aprobar ruta" }));
  await waitFor(() => expect(msg).toHaveBeenCalledWith("Ruta aprobada"));
  expect(body("POST /flights/7/route/approve")).toEqual({ version: 3, comentario: "Conforme" });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("status")).toHaveTextContent("Ruta aprobada por Operaciones.");
  expect(screen.queryByRole("button", { name: "Aprobar ruta" })).toBeNull();
  expect(screen.getByText("La ruta no impide el inicio del vuelo.")).toBeInTheDocument();
});

test("la devolución exige un motivo con contenido antes de habilitarse y lo envía con la versión revisada", async () => {
  serve({ value: view("PENDIENTE_REVISION", { puedeRevisar: true, versionVigente: 2, versiones: [version(2, { estado: "PENDIENTE_REVISION" })] }) }, { "POST /flights/7/route/return": () => Promise.resolve({}) });
  render(<FlightRoute flightId={7} canReview msg={vi.fn()} />);
  const button = await screen.findByRole("button", { name: "Devolver con observaciones" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Motivo de la devolución (obligatorio)"), { target: { value: "corto" } });
  expect(button).toBeDisabled(); expect(screen.getByText(/al menos 10 caracteres/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Motivo de la devolución (obligatorio)"), { target: { value: "  Falta el aeropuerto alternativo  " } });
  expect(button).toBeEnabled(); fireEvent.click(button);
  await waitFor(() => expect(calls("POST /flights/7/route/return")).toHaveLength(1));
  expect(body("POST /flights/7/route/return")).toEqual({ version: 2, motivo: "Falta el aeropuerto alternativo" });
});

test("un conflicto de versión muestra el mensaje del servidor y vuelve a cargar lo vigente", async () => {
  const state = { value: view("PENDIENTE_REVISION", { puedeRevisar: true, versionVigente: 1, versiones: [version(1, { estado: "PENDIENTE_REVISION" })] }) };
  serve(state, { "POST /flights/7/route/approve": () => { state.value = view("BORRADOR", { versionVigente: 2, versiones: [version(2, { estado: "BORRADOR" }), version(1, { estado: "SIN_REVISION", actual: false })] }); return Promise.reject(Object.assign(new Error("La ruta cambió: se está revisando la versión 1 y la vigente es la 2."), { code: "VERSION_RUTA_DESACTUALIZADA" })); } });
  render(<FlightRoute flightId={7} canReview msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Aprobar ruta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("la vigente es la 2");
  await waitFor(() => expect(calls("GET /flights/7/route")).toHaveLength(2));
  expect(await screen.findByText("Recorrido 2", { selector: "p" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Aprobar ruta" })).toBeNull(); // ya no hay una versión pendiente que aprobar
});

test("los controles dependen de lo que el servidor permite: DTS y comandante no ven la revisión; Operaciones no ve la edición", async () => {
  serve({ value: view("PENDIENTE_REVISION", { editable: true, puedeRevisar: true }) });
  render(<FlightRoute flightId={7} />);
  await screen.findAllByText("Pendiente de revisión");
  expect(screen.queryByRole("button", { name: "Aprobar ruta" })).toBeNull(); expect(screen.queryByLabelText("Recorrido y puntos intermedios en orden")).toBeNull();
  cleanup(); serve({ value: view("PENDIENTE_REVISION", { editable: true, puedeRevisar: true }) });
  render(<FlightRoute flightId={7} canReview />);
  await screen.findByRole("button", { name: "Aprobar ruta" }); expect(screen.queryByLabelText("Recorrido y puntos intermedios en orden")).toBeNull();
  cleanup(); serve({ value: view("PENDIENTE_REVISION", { editable: true, puedeRevisar: false }) });
  render(<FlightRoute flightId={7} canReview />);
  expect(await screen.findByText(/no puede revisarla quien la planificó o presentó/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Aprobar ruta" })).toBeNull();
  cleanup(); serve({ value: view("APROBADA", { editable: false, motivo: "La ruta sólo puede modificarse en estado PLANIFICADO", inicio: { aplica: false, permitido: false, codigo: null, mensaje: null } }) });
  render(<FlightRoute flightId={7} canEdit />);
  expect(await screen.findByText("La ruta sólo puede modificarse en estado PLANIFICADO")).toBeInTheDocument(); expect(screen.queryByText(/Inicio del vuelo bloqueado/)).toBeNull();
});

test("la cola de Operaciones lista sólo las rutas pendientes y abre el vuelo seleccionado", () => {
  const open = vi.fn();
  const statuses = { 1: { estado: "PENDIENTE_REVISION", version: 2 }, 2: { estado: "APROBADA", version: 1 }, 3: { estado: "SIN_PLANIFICAR" }, 4: { estado: "DEVUELTA", version: 1 } };
  const flights = [1, 2, 3, 4].map((id) => ({ id, codigo: `V-${id}`, salida: "2030-01-05T10:00:00" }));
  render(<RouteReviewQueue statuses={statuses} flights={flights} onOpen={open} />);
  expect(screen.getByText("Rutas pendientes de revisión (1)")).toBeInTheDocument(); expect(screen.queryByText(/V-2/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Revisar ruta de V-1" })); expect(open).toHaveBeenCalledWith("1");
  cleanup(); const { container } = render(<RouteReviewQueue statuses={{ 2: { estado: "APROBADA" } }} flights={flights} />); expect(container).toBeEmptyDOMElement();
});

test("una ruta histórica sin recorrido ni condiciones se muestra sin errores y no ofrece presentarla tal cual", async () => {
  serve({ value: view("BORRADOR", { editable: true, puedePresentar: false, versiones: [version(1, { estado: "BORRADOR", recorrido: null, alternativoId: null, altitudPies: null, distanciaNm: null, tiempoEstimadoMinutos: null, condiciones: null })] }) });
  const { container } = render(<FlightRoute flightId={7} canEdit msg={vi.fn()} />);
  await screen.findByLabelText("Recorrido y puntos intermedios en orden");
  expect(container.querySelectorAll("details.route-version")).toHaveLength(1);
  expect(screen.queryByText(/undefined|null/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Presentar a Operaciones", exact: true })).toBeNull();
  expect(screen.getByRole("button", { name: "Guardar ruta" })).toBeDisabled();
  expect(screen.getByText(/Altitud: — pies · Distancia: — NM · Tiempo: — min/)).toBeInTheDocument();
});
