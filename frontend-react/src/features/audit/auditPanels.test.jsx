import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { api } from "../../services/api";
import { AdminAudit } from "./audit";
vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const ZONE = "America/Argentina/Tucuman";
const actor = (extra = {}) => ({ id: 7, username: "admin1", name: "Ana Admin", active: true, label: "Ana Admin", ...extra });
const event = (id, extra = {}) => ({ id, occurredAt: "2033-03-10T12:00:00Z", actor: actor(), flightId: null, flightCode: null, entityType: "AIRCRAFT", entityTypeLabel: "Aeronave", entityId: 3, operation: "CREATE", operationLabel: "Alta", summary: `Evento ${id}`, hasDetail: false, ...extra });
const page = (items, extra = {}) => ({ items, total: items.length, page: 0, size: 20, totalPages: items.length ? 1 : 0, order: "asc", timeZone: ZONE, ...extra });
const flights = [
  { id: 41, codigo: "VS-41", tipo: { codigo: "SANITARIO", nombre: "Sanitario" }, estadoVuelo: "FINALIZADO", salida: "2033-03-01T10:00:00", origen: "Tucumán", destino: "Córdoba" },
  { id: 42, codigo: "VS-42", tipo: { codigo: "SANITARIO", nombre: "Sanitario" }, estadoVuelo: "PLANIFICADO", salida: "2033-04-01T10:00:00", origen: "Salta", destino: "Jujuy" },
];
const empty = { items: [], page: 0, size: 100, hasNext: false };

let calls;
beforeEach(() => {
  calls = [];
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((path) => {
    calls.push(path);
    if (path === "/flights") return Promise.resolve(flights);
    if (path.startsWith("/audit/flights/41")) return Promise.resolve(page([
      event(1, { flightId: 41, flightCode: "VS-41", entityType: "FLIGHT", entityTypeLabel: "Vuelo", operationLabel: "Creación del vuelo", summary: "Primer paso" }),
      event(2, { flightId: 41, flightCode: "VS-41", entityType: "FLIGHT_CREW", entityTypeLabel: "Tripulación del vuelo", operationLabel: "Alta", summary: "Segundo paso" }),
    ]));
    if (path.startsWith("/audit/actors?role=ADMINISTRADOR")) return Promise.resolve({ ...empty, items: [{ id: 7, username: "admin1", name: "Ana Admin", active: true }] });
    if (path.startsWith("/audit/actors?role=DTS")) return Promise.resolve({ ...empty, items: [{ id: 9, username: "dts1", name: "Dora DTS", active: true }] });
    if (path.startsWith("/audit/actors")) return Promise.resolve(empty);
    if (path.startsWith("/audit?")) return Promise.resolve(page([event(5)]));
    return Promise.reject(new Error(`ruta no simulada ${path}`));
  });
});
afterEach(cleanup);

const renderAudit = () => render(<MemoryRouter><AdminAudit /></MemoryRouter>);

test("la auditoría se separa por defecto en subpaneles y abre en Vuelos", async () => {
  renderAudit();
  const panels = screen.getByRole("group", { name: "Secciones de auditoría" });
  expect(within(panels).getAllByRole("button").map((b) => b.textContent)).toEqual(["Vuelos", "Usuarios", "Aeronaves", "Personal sanitario", "Búsqueda general"]);
  expect(within(panels).getByRole("button", { name: "Vuelos" })).toHaveAttribute("aria-pressed", "true");
  expect(within(panels).queryByRole("button", { name: /Tripulación/ })).not.toBeInTheDocument();
  expect(await screen.findByText("VS-41")).toBeInTheDocument();
});

test("al elegir un vuelo se muestra todo su historial del más antiguo al más reciente, incluida la tripulación", async () => {
  renderAudit();
  const row = (await screen.findByText("VS-41")).closest("tr");
  fireEvent.click(within(row).getByRole("button", { name: "Ver historial" }));
  await waitFor(() => expect(calls).toContain("/audit/flights/41?page=0&size=50&order=asc"));
  const timeline = await screen.findByRole("region", { name: "Historial del vuelo VS-41" });
  const steps = within(timeline).getAllByRole("listitem").map((li) => li.textContent);
  expect(steps[0]).toMatch(/Primer paso/);
  expect(steps[1]).toMatch(/Tripulación del vuelo/);
});

test("la lista de vuelos se filtra por código y por fecha de salida", async () => {
  renderAudit();
  await screen.findByText("VS-41");
  fireEvent.change(screen.getByLabelText("Buscar vuelo"), { target: { value: "jujuy" } });
  expect(screen.queryByText("VS-41")).not.toBeInTheDocument();
  expect(screen.getByText("VS-42")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar vuelo"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Salida desde"), { target: { value: "2033-03-15" } });
  expect(screen.queryByText("VS-41")).not.toBeInTheDocument();
  expect(screen.getByText("VS-42")).toBeInTheDocument();
});

test("Aeronaves consulta sólo su auditoría en orden cronológico y ofrece únicamente administradores como responsables", async () => {
  renderAudit();
  fireEvent.click(screen.getByRole("button", { name: "Aeronaves" }));
  await waitFor(() => expect(calls).toContain("/audit?page=0&size=20&entityType=AIRCRAFT&order=asc"));
  await waitFor(() => expect(calls.some((p) => p.startsWith("/audit/actors?role=ADMINISTRADOR"))).toBe(true));
  const select = await screen.findByLabelText("Usuario responsable");
  await within(select).findByRole("option", { name: /Ana Admin/ });
  expect(within(select).queryByRole("option", { name: /Dora DTS/ })).not.toBeInTheDocument();
  fireEvent.change(select, { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2033-03-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() => expect(calls).toContain("/audit?page=0&size=20&entityType=AIRCRAFT&order=asc&from=2033-03-01&actorId=7"));
});

test("Personal sanitario muestra lo que carga DTS y sólo ofrece usuarios DTS", async () => {
  renderAudit();
  fireEvent.click(screen.getByRole("button", { name: "Personal sanitario" }));
  await waitFor(() => expect(calls).toContain("/audit?page=0&size=20&entityType=HEALTH_STAFF&order=asc"));
  await waitFor(() => expect(calls.some((p) => p.startsWith("/audit/actors?role=DTS"))).toBe(true));
  expect(await within(screen.getByLabelText("Usuario responsable")).findByRole("option", { name: /Dora DTS/ })).toBeInTheDocument();
});

test("Usuarios agrupa las altas de cuentas y sus cambios de perfiles", async () => {
  renderAudit();
  fireEvent.click(screen.getByRole("button", { name: "Usuarios" }));
  await waitFor(() => expect(calls).toContain("/audit?page=0&size=20&entityType=USER%2CUSER_ROLE&order=asc"));
  expect(await screen.findByText("Evento 5")).toBeInTheDocument();
});

test("Búsqueda general conserva la consulta libre anterior", async () => {
  renderAudit();
  vi.mocked(api).mockImplementation((path) => { calls.push(path); return path === "/audit/filters" ? Promise.resolve({ entityTypes: [], operations: [], actors: [], maxPageSize: 100 }) : path.startsWith("/audit/actors") ? Promise.resolve(empty) : Promise.resolve(page([])); });
  fireEvent.click(screen.getByRole("button", { name: "Búsqueda general" }));
  await waitFor(() => expect(calls).toContain("/audit?page=0&size=20&order=desc"));
  expect(screen.getByRole("form", { name: "Filtros de auditoría" })).toBeInTheDocument();
});
