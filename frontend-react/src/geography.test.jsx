import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { GeographicCatalog, blockedBy, historyOf } from "./geography";
vi.mock("./api", () => ({ api: vi.fn() }));

const clean = { puedeDesactivar: true, motivoBloqueo: null, vigentes: {}, historicas: {} };
const airport = (extra = {}) => ({ id: 1, codigoOaci: "SAZT", codigoIata: "TUC", nombre: "Tucumán", provincia: "Tucumán", provinciaId: 3, localidad: "San Miguel", activo: true, dependencias: clean, ...extra });
const page = (items) => ({ items, page: 0, size: 25, totalElements: items.length, totalPages: 1 });
const failure = (message, extra = {}) => Object.assign(new Error(message), extra);
const serve = (items) => vi.mocked(api).mockImplementation((path, options) => {
  if (path.startsWith("/catalogs/provinces")) return Promise.resolve([{ id: 3, nombre: "Tucumán" }]);
  if (path.startsWith("/admin/geography/airports/") && options?.method === "POST") return options.respond ? options.respond() : Promise.resolve({});
  if (path.startsWith("/admin/geography/")) return Promise.resolve(page(typeof items === "function" ? items() : items));
  return Promise.resolve([]);
});
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);
const openAirports = async () => { fireEvent.click(screen.getByRole("button", { name: "Aeropuertos" })); return screen.findByText("Tucumán", { selector: "td" }); };

test("distingue la baja posible, la bloqueada por una referencia vigente y la inactiva que conserva historia", async () => {
  serve([
    airport({ id: 1, nombre: "Libre", dependencias: clean }),
    airport({ id: 2, nombre: "Con vuelo abierto", dependencias: { puedeDesactivar: false, motivoBloqueo: "No puede desactivarse: 2 vuelos vigentes que lo usan como origen o destino", vigentes: { VUELOS_VIGENTES: 2 }, historicas: {} } }),
    airport({ id: 3, nombre: "Con historia", dependencias: { puedeDesactivar: true, motivoBloqueo: null, vigentes: {}, historicas: { VUELOS_HISTORICOS: 4, VERSIONES_RUTA_HISTORICAS: 1 } } }),
    airport({ id: 4, nombre: "Retirado", activo: false, dependencias: { puedeDesactivar: true, motivoBloqueo: null, vigentes: {}, historicas: { VUELOS_HISTORICOS: 1 } } }),
  ]);
  render(<GeographicCatalog notify={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Aeropuertos" }));
  const row = async (name) => (await screen.findByText(name, { selector: "td" })).closest("tr");
  const free = await row("Libre"), blocked = await row("Con vuelo abierto"), history = await row("Con historia"), retired = await row("Retirado");
  expect(within(free).getByRole("button", { name: "Desactivar" })).toBeEnabled(); expect(within(free).queryByTestId("geo-blocked")).toBeNull(); expect(within(free).queryByTestId("geo-history")).toBeNull();
  expect(within(blocked).getByRole("button", { name: "Desactivar" })).toBeDisabled();
  expect(within(blocked).getByTestId("geo-blocked")).toHaveTextContent("2 vuelos vigentes que lo usan como origen o destino");
  expect(within(history).getByRole("button", { name: "Desactivar" })).toBeEnabled();
  expect(within(history).getByTestId("geo-history")).toHaveTextContent("4 vuelos finalizados o cancelados, 1 versiones de ruta anteriores");
  expect(within(retired).getByText("Inactivo")).toBeInTheDocument(); expect(within(retired).getByRole("button", { name: "Reactivar" })).toBeEnabled();
  expect(within(retired).getByTestId("geo-history")).toHaveTextContent("Inactivo; conserva referencias históricas: 1 vuelos finalizados o cancelados");
});

test("una baja con historia se envía y se informa recién cuando el servidor la confirma", async () => {
  let rows = [airport({ dependencias: { puedeDesactivar: true, motivoBloqueo: null, vigentes: {}, historicas: { VUELOS_HISTORICOS: 2 } } })];
  const notify = vi.fn(); let finish;
  vi.mocked(api).mockImplementation((path, options) => {
    if (path.startsWith("/catalogs/provinces")) return Promise.resolve([]);
    if (options?.method === "POST") return new Promise((resolve) => { finish = () => { rows = [airport({ activo: false, dependencias: { puedeDesactivar: true, vigentes: {}, historicas: { VUELOS_HISTORICOS: 2 } } })]; resolve({}); }; });
    return Promise.resolve(page(rows));
  });
  render(<GeographicCatalog notify={notify} />); await openAirports();
  fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path, o]) => path === "/admin/geography/airports/1/active" && JSON.parse(o.body).activo === false)).toBe(true));
  expect(notify).not.toHaveBeenCalled(); expect(screen.getAllByRole("button", { name: "Desactivar" })[0]).toBeDisabled();
  finish(); await waitFor(() => expect(notify).toHaveBeenCalledWith("Registro desactivado"));
  expect(await screen.findByRole("button", { name: "Reactivar" })).toBeInTheDocument(); expect(screen.getByText("Inactivo")).toBeInTheDocument();
});

test("una baja rechazada por el servidor muestra el motivo real, no informa éxito y recarga las dependencias vigentes", async () => {
  let rows = [airport()]; const notify = vi.fn();
  vi.mocked(api).mockImplementation((path, options) => {
    if (path.startsWith("/catalogs/provinces")) return Promise.resolve([]);
    if (options?.method === "POST") { rows = [airport({ dependencias: { puedeDesactivar: false, motivoBloqueo: "No puede desactivarse: 1 vuelos vigentes que lo usan como origen o destino", vigentes: { VUELOS_VIGENTES: 1 }, historicas: {} } })]; return Promise.reject(failure("No puede desactivarse: 1 vuelos vigentes que lo usan como origen o destino", { code: "GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES" })); }
    return Promise.resolve(page(rows));
  });
  render(<GeographicCatalog notify={notify} />); await openAirports();
  fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("1 vuelos vigentes");
  expect(notify).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Desactivar" })).toBeDisabled());
  expect(screen.getByTestId("geo-blocked")).toBeInTheDocument(); expect(screen.getByText("Activo")).toBeInTheDocument();
});

test("una reactivación rechazada por jerarquía inactiva informa el motivo y mantiene el registro inactivo", async () => {
  let rows = [airport({ activo: false })]; const notify = vi.fn();
  vi.mocked(api).mockImplementation((path, options) => {
    if (path.startsWith("/catalogs/provinces")) return Promise.resolve([]);
    if (options?.method === "POST") return Promise.reject(failure("No se puede reactivar el aeropuerto: su provincia o localidad está inactiva", { code: "GEOGRAPHIC_PARENT_INACTIVE" }));
    return Promise.resolve(page(rows));
  });
  render(<GeographicCatalog notify={notify} />); await openAirports();
  fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("provincia o localidad está inactiva");
  expect(notify).not.toHaveBeenCalled(); expect(screen.getByText("Inactivo")).toBeInTheDocument();
});

test("las ayudas de bloqueo ignoran entidades sin dependencias o ya inactivas", () => {
  expect(blockedBy(null)).toBe(""); expect(blockedBy({ activo: true })).toBe(""); expect(blockedBy({ activo: false, dependencias: { puedeDesactivar: false, motivoBloqueo: "No puede desactivarse: x" } })).toBe("");
  expect(blockedBy({ activo: true, dependencias: { puedeDesactivar: false, motivoBloqueo: "No puede desactivarse: 1 localidades activas" } })).toBe("1 localidades activas");
  expect(historyOf({ dependencias: { historicas: { CLAVE_NUEVA: 2 } } })).toBe("2 CLAVE_NUEVA"); expect(historyOf(undefined)).toBe("");
});
