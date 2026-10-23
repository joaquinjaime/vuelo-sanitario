import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { AdminAudit, AuditTimeline, formatInstant } from "./audit";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const ZONE = "America/Argentina/Tucuman";
const actor = (extra = {}) => ({ id: 7, username: "ops1", name: "Ana Ops", active: true, label: "Ana Ops", ...extra });
const event = (id, extra = {}) => ({ id, occurredAt: "2033-03-10T02:30:00Z", actor: actor(), flightId: 5, flightCode: "V-5", entityType: "FLIGHT", entityTypeLabel: "Vuelo", entityId: 5, operation: "CANCEL", operationLabel: "Cancelación", summary: "Cancelación — Motivo: Meteorología", hasDetail: true, ...extra });
const page = (items, extra = {}) => ({ items, total: items.length, page: 0, size: 20, totalPages: items.length ? 1 : 0, order: "desc", timeZone: ZONE, ...extra });
const detail = (id, extra = {}) => ({ event: event(id), changes: [{ field: "estado", label: "Estado", before: "PLANIFICADO", after: "CANCELADO", changed: true, masked: false }, { field: "tipo", label: "Tipo", before: "SANITARIO", after: "SANITARIO", changed: false, masked: false }], hasPreviousValues: true, hasNewValues: true, notes: [], previousValues: { estado: "PLANIFICADO" }, newValues: { estado: "CANCELADO" }, timeZone: ZONE, ...extra });
const options = { entityTypes: [{ code: "FLIGHT", label: "Vuelo" }, { code: "AIRCRAFT", label: "Aeronave" }], operations: [{ code: "CANCEL", label: "Cancelación" }], actors: [{ id: 7, username: "ops1", name: "Ana Ops", active: true }, { id: 8, username: "baja1", name: "Beto Baja", active: false }], timeZone: ZONE, maxPageSize: 100 };

beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);

test("el instante UTC se muestra en la zona de negocio y no en la del navegador", () => {
  expect(formatInstant("2033-03-10T02:30:00Z", ZONE)).toMatch(/09\/03\/2033.*23:30:00/);
  expect(formatInstant("2033-03-10T02:30:00Z", "UTC")).toMatch(/10\/03\/2033.*02:30:00/);
  expect(formatInstant(null, ZONE)).toBe("—");
});

test("el historial contextual muestra quién, cuándo y qué cambió, y carga el detalle bajo demanda", async () => {
  vi.mocked(api).mockImplementation((path) => path.startsWith("/audit/flights/5") ? Promise.resolve(page([event(2), event(1, { operation: "START", operationLabel: "Inicio del vuelo", summary: "Inicio del vuelo", hasDetail: false })])) : path === "/audit/events/2" ? Promise.resolve(detail(2)) : Promise.reject(new Error("ruta inesperada " + path)));
  render(<AuditTimeline flightId={5} />);
  expect(screen.getByText("Cargando historial…")).toBeInTheDocument();
  expect(await screen.findByText("Cancelación")).toBeInTheDocument();
  expect(vi.mocked(api)).toHaveBeenCalledWith("/audit/flights/5?page=0&size=20&order=desc");
  expect(screen.getAllByText(/Ana Ops/).length).toBeGreaterThan(0); expect(screen.getAllByText(/23:30:00/).length).toBe(2);
  expect(screen.getAllByRole("button", { name: "Ver cambios" })).toHaveLength(1); // el evento sin valores no ofrece detalle
  fireEvent.click(screen.getByRole("button", { name: "Ver cambios" }));
  const region = await screen.findByLabelText("Detalle del evento 2");
  expect(within(region).getByText("PLANIFICADO")).toBeInTheDocument(); expect(within(region).getByText("CANCELADO")).toBeInTheDocument();
  expect(within(region).queryByText("SANITARIO")).toBeNull(); // sin cambios: oculto hasta pedirlo
  fireEvent.click(within(region).getByRole("button", { name: /Mostrar campos sin cambios \(1\)/ }));
  expect(within(region).getAllByText("SANITARIO").length).toBeGreaterThan(0);
  fireEvent.click(within(region).getByRole("button", { name: "Cerrar detalle" }));
  expect(screen.queryByLabelText("Detalle del evento 2")).toBeNull();
});

test("el historial informa el estado vacío, los errores con reintento y la paginación", async () => {
  vi.mocked(api).mockResolvedValueOnce(page([]));
  const { unmount } = render(<AuditTimeline flightId={9} />);
  expect(await screen.findByText("Todavía no hay actividad registrada para este vuelo.")).toBeInTheDocument(); unmount();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockRejectedValueOnce(Object.assign(new Error("No tiene acceso a este vuelo"), { status: 403 })).mockResolvedValueOnce(page([event(3)]));
  render(<AuditTimeline flightId={9} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No tiene acceso a este vuelo");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("Cancelación")).toBeInTheDocument(); cleanup();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((path) => Promise.resolve(path.includes("page=1") ? page([event(1)], { page: 1, total: 21, totalPages: 2 }) : page([event(2)], { total: 21, totalPages: 2 })));
  render(<AuditTimeline flightId={9} />);
  await screen.findByText("Página 1 de 2 · 21 eventos", { exact: false });
  fireEvent.click(screen.getByRole("button", { name: "Más antiguos" }));
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/audit/flights/9?page=1&size=20&order=desc"));
  await screen.findByText("Página 2 de 2 · 21 eventos", { exact: false });
});

const adminApi = (rows = [event(2), event(1, { actor: actor({ id: 8, username: "baja1", label: "Beto Baja (usuario desactivado)", active: false }), entityType: "AIRCRAFT", entityTypeLabel: "Aeronave", flightId: null, flightCode: null })], extra = {}) => (path) => {
  if (path === "/audit/filters") return Promise.resolve(options);
  if (path.startsWith("/audit/actors")) return Promise.resolve({ items: [{ id: 7, username: "ops1", name: "Ana Ops", active: true }, { id: 8, username: "baja1", name: "Beto Baja", active: false }], page: 0, size: 30, hasNext: false });
  if (path.startsWith("/audit?")) return Promise.resolve(page(rows, extra));
  if (path.startsWith("/audit/events/")) return Promise.resolve(detail(Number(path.split("/").pop()), { notes: ["Se ocultaron o enmascararon datos sensibles."], changes: [{ field: "clave", label: "Clave", before: "[oculto]", after: "[oculto]", changed: false, masked: true }, { field: "estado", label: "Estado", before: null, after: "EN_CURSO", changed: true, masked: false }] }));
  return Promise.reject(new Error("ruta inesperada " + path));
};

test("el administrador ve la tabla paginada, los usuarios desactivados y abre el detalle con datos enmascarados", async () => {
  vi.mocked(api).mockImplementation(adminApi());
  render(<AdminAudit />);
  const table = await screen.findByRole("table", { name: "Eventos de auditoría" });
  expect(vi.mocked(api)).toHaveBeenCalledWith("/audit?page=0&size=20&order=desc");
  expect(within(table).getByText("Beto Baja (usuario desactivado)")).toBeInTheDocument();
  expect(within(table).getAllByText("Cancelación").length).toBeGreaterThan(0);
  expect(await screen.findByRole("option", { name: /Beto Baja \(baja1\) · desactivado/ })).toBeInTheDocument();
  expect(within(table).getByRole("link", { name: "Ver aeronaves" })).toHaveAttribute("href", "#/admin/aeronaves");
  fireEvent.click(within(table).getAllByRole("button", { name: "Ver detalle" })[0]);
  const region = await screen.findByLabelText("Detalle del evento 2");
  expect(within(region).getByText("Se ocultaron o enmascararon datos sensibles.")).toBeInTheDocument();
  expect(within(region).getByText("EN_CURSO")).toBeInTheDocument(); expect(within(region).getByText("Detalle técnico")).toBeInTheDocument();
  expect(region.textContent).not.toMatch(/s3cr3t/);
});

test("el selector de actores busca de forma remota y conserva el filtro seleccionado al cambiar la búsqueda", async () => {
  vi.mocked(api).mockImplementation((path) => {
    if (path === "/audit/filters") return Promise.resolve(options);
    if (path.startsWith("/audit/actors?q=zz")) return Promise.resolve({ items: [{ id: 849, username: "zzhistorico", name: "Actor histórico", active: false }], page: 0, size: 30, hasNext: false });
    if (path.startsWith("/audit/actors")) return Promise.resolve({ items: [{ id: 7, username: "ops1", name: "Ana Ops", active: true }], page: 0, size: 30, hasNext: false });
    if (path.startsWith("/audit?")) return Promise.resolve(page([]));
    return Promise.reject(new Error("ruta inesperada " + path));
  });
  render(<AdminAudit />);
  const select = await screen.findByLabelText("Usuario responsable");
  fireEvent.change(screen.getByLabelText("Buscar usuario responsable"), { target: { value: "zz" } });
  const actorOption = await screen.findByRole("option", { name: /Actor histórico \(zzhistorico\).*desactivado/ });
  fireEvent.change(select, { target: { value: "849" } });
  fireEvent.change(screen.getByLabelText("Buscar usuario responsable"), { target: { value: "ana" } });
  await waitFor(() => expect(select).toHaveValue("849"));
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith(expect.stringContaining("actorId=849")));
  expect(actorOption).toBeInTheDocument();
});

test("una respuesta antigua del selector no reemplaza los resultados de la búsqueda más reciente", async () => {
  let resolveOld, resolveNew;
  vi.mocked(api).mockImplementation((path) => {
    if (path === "/audit/filters") return Promise.resolve(options);
    if (path.startsWith("/audit/actors?q=primera")) return new Promise((resolve) => { resolveOld = resolve; });
    if (path.startsWith("/audit/actors?q=segunda")) return new Promise((resolve) => { resolveNew = resolve; });
    if (path.startsWith("/audit/actors")) return Promise.resolve({ items: [], page: 0, size: 30, hasNext: false });
    if (path.startsWith("/audit?")) return Promise.resolve(page([]));
    return Promise.reject(new Error("ruta inesperada " + path));
  });
  render(<AdminAudit />);
  const input = screen.getByLabelText("Buscar usuario responsable");
  fireEvent.change(input, { target: { value: "primera" } });
  await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
  fireEvent.change(input, { target: { value: "segunda" } });
  await waitFor(() => expect(resolveNew).toBeTypeOf("function"));
  resolveNew({ items: [{ id: 22, username: "segunda", name: "Resultado nuevo", active: true }], page: 0, size: 30, hasNext: false });
  expect(await screen.findByRole("option", { name: /Resultado nuevo/ })).toBeInTheDocument();
  resolveOld({ items: [{ id: 11, username: "primera", name: "Resultado obsoleto", active: true }], page: 0, size: 30, hasNext: false });
  await waitFor(() => expect(screen.queryByRole("option", { name: /Resultado obsoleto/ })).toBeNull());
});

test("los filtros se envían al servidor combinados y la paginación pide la página siguiente", async () => {
  vi.mocked(api).mockImplementation(adminApi([event(2)], { total: 45, totalPages: 3 }));
  render(<AdminAudit />);
  await screen.findByRole("table", { name: "Eventos de auditoría" });
  await screen.findByRole("option", { name: /Ana Ops \(ops1\)/ });
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2033-03-09" } }); fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2033-03-10" } });
  fireEvent.change(screen.getByLabelText("Usuario responsable"), { target: { value: "7" } }); fireEvent.change(screen.getByLabelText("Tipo de entidad"), { target: { value: "FLIGHT" } });
  fireEvent.change(screen.getByLabelText("Acción"), { target: { value: "CANCEL" } }); fireEvent.change(screen.getByLabelText("ID de vuelo"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("ID del registro afectado"), { target: { value: "5" } }); fireEvent.change(screen.getByLabelText("Orden"), { target: { value: "asc" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/audit?page=0&size=20&from=2033-03-09&to=2033-03-10&actorId=7&entityType=FLIGHT&operation=CANCEL&flightId=5&entityId=5&order=asc"));
  await screen.findByText("Página 1 de 3 · 45 eventos", { exact: false });
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith(expect.stringContaining("page=1&size=20&from=2033-03-09")));
  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenLastCalledWith("/audit?page=0&size=20&order=desc"));
});

test("sin resultados con filtros, sin eventos y con error del servidor se informa cada caso", async () => {
  vi.mocked(api).mockImplementation(adminApi([]));
  render(<AdminAudit />);
  expect(await screen.findByText("Todavía no hay eventos de auditoría.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Acción"), { target: { value: "CANCEL" } }); fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(await screen.findByText("Ningún evento coincide con los filtros aplicados.")).toBeInTheDocument(); cleanup();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((path) => path === "/audit/filters" ? Promise.resolve(options) : Promise.reject(Object.assign(new Error("Acceso denegado"), { status: 403 })));
  render(<AdminAudit />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Acceso denegado");
});

// ---- integración en los detalles de Operaciones, Comandante y DTS ----
const auditItems = page([event(2, { operationLabel: "Aprobación", operation: "APPROVE", entityTypeLabel: "Solicitud sanitaria", summary: "Aprobación — Estado: SOLICITADO → APROBADO" })]);
const flightsApi = (flightId, detailBody, extra = () => undefined) => (path, options) => {
  const own = extra(path, options); if (own !== undefined) return own;
  if (path.startsWith(`/audit/flights/${flightId}`)) return Promise.resolve(auditItems);
  if (path === `/flights/${flightId}` && options?.method !== "POST") return Promise.resolve(detailBody);
  return Promise.resolve([]);
};

test("el detalle de Operaciones muestra el historial de actividad del vuelo desde el backend", async () => {
  const { Ops } = await import("./main.jsx");
  const flight = { id: 41, codigo: "VS-41", estadoVuelo: "PLANIFICADO", tipo: { codigo: "TRASLADO_OPERATIVO" }, motivoVuelo: "Reposicionamiento", origen: { nombre: "A" }, destino: { nombre: "B" }, fechaPlanificadaSalida: "2030-01-01T10:00:00" };
  vi.mocked(api).mockImplementation(flightsApi(41, { vuelo: flight, recursos: {}, negociacion: [] }));
  render(<Ops d={{ flights: [flight], aircraft: [], commanders: [] }} done={vi.fn()} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "41" } });
  expect(await screen.findByRole("region", { name: "Historial de actividad" })).toBeInTheDocument();
  expect(await screen.findByText(/Aprobación — Estado: SOLICITADO → APROBADO/)).toBeInTheDocument();
  expect(vi.mocked(api)).toHaveBeenCalledWith("/audit/flights/41?page=0&size=20&order=desc");
});

test("el detalle de planificación del comandante muestra el historial de su vuelo", async () => {
  const { Cmd } = await import("./main.jsx");
  const flight = { id: 42, codigo: "VS-42", estadoVuelo: "PLANIFICADO", tipo: { codigo: "TRASLADO_OPERATIVO" }, motivoVuelo: "Traslado", origen: { nombre: "A" }, destino: { nombre: "B" }, fechaPlanificadaSalida: "2030-01-01T10:00:00" };
  vi.mocked(api).mockImplementation(flightsApi(42, { vuelo: flight, recursos: {}, negociacion: [] }));
  render(<Cmd d={{ flights: [flight] }} done={vi.fn()} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Vuelo"), { target: { value: "42" } });
  expect(await screen.findByRole("region", { name: "Historial de actividad" })).toBeInTheDocument();
  expect(await screen.findByText(/Aprobación — Estado: SOLICITADO → APROBADO/)).toBeInTheDocument();
});

test("el DTS revisa la evolución de su propia solicitud y un acceso denegado se informa sin datos", async () => {
  const { DtsResponses } = await import("./main.jsx");
  const flight = { id: 43, codigo: "V-43", estadoVuelo: null, tipo: { codigo: "SANITARIO" }, datosSanitarios: { fechaSolicitada: "2030-01-01T09:00:00", extremaUrgencia: false, estadoSolicitud: "SOLICITADO", localidadOrigenSolicitada: { nombre: "A" }, localidadDestinoSolicitada: { nombre: "B" } } };
  vi.mocked(api).mockImplementation(flightsApi(43, { vuelo: flight, negociacion: [] }));
  render(<DtsResponses d={{ flights: [{ id: 43, codigo: "V-43", estado: "SOLICITADO" }] }} done={vi.fn()} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "43" } });
  expect(await screen.findByRole("region", { name: "Evolución de mi solicitud" })).toBeInTheDocument();
  expect(await screen.findByText(/Aprobación — Estado: SOLICITADO → APROBADO/)).toBeInTheDocument();
  cleanup(); vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(flightsApi(43, { vuelo: flight, negociacion: [] }, (path) => path.startsWith("/audit/flights/") ? Promise.reject(Object.assign(new Error("No tiene acceso a este vuelo"), { status: 403 })) : undefined));
  render(<DtsResponses d={{ flights: [{ id: 43, codigo: "V-43", estado: "SOLICITADO" }] }} done={vi.fn()} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "43" } });
  expect(await screen.findByText(/No tiene acceso a este vuelo/)).toBeInTheDocument();
  expect(screen.queryByText(/Aprobación/)).toBeNull();
});
