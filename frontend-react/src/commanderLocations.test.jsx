import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { CommanderLocations } from "./commanderLocations";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const provinces = [{ id: 1, nombre: "Tucumán" }, { id: 2, nombre: "Buenos Aires" }];
const row = (id, extra = {}) => ({ comandanteId: id, username: `cmd${id}`, nombre: `Nombre${id}`, apellido: `Apellido${id}`, licencia: `LIC-${id}`, activo: true, estadoCuenta: "ACTIVO", provinciaId: null, provincia: null, localidadId: null, localidad: null, estadoUbicacion: "DESCONOCIDA", actualizadaEn: null, actualizadaPor: null, ...extra });
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);
const respond = (rows, extra = {}) => vi.mocked(api).mockImplementation((path, options) => {
  if (path === "/catalogs/provinces") return Promise.resolve(provinces);
  if (path.startsWith("/catalogs/localities")) return Promise.resolve([{ id: 10, nombre: "San Miguel de Tucumán", provincia: "Tucumán" }, { id: 11, nombre: "Yerba Buena", provincia: "Tucumán" }]);
  if (options?.method === "PUT") return extra.put ? extra.put(path, options) : Promise.resolve({});
  if (path.startsWith("/commanders/locations")) return Promise.resolve({ comandantes: rows, truncado: Boolean(extra.truncado) });
  return Promise.resolve(null);
});

test("lista los comandantes con su ubicación operativa, el estado y quién la registró", async () => {
  respond([row(1), row(2, { provinciaId: 1, provincia: "Tucumán", estadoUbicacion: "SOLO_PROVINCIA" }), row(3, { provinciaId: 1, provincia: "Tucumán", localidadId: 10, localidad: "San Miguel de Tucumán", estadoUbicacion: "CONOCIDA", actualizadaEn: "2026-11-02T09:30:00", actualizadaPor: "Ana Admin" })]);
  render(<CommanderLocations notify={vi.fn()} />);
  expect(await screen.findByText("Apellido1, Nombre1")).toBeInTheDocument();
  expect(screen.getByText("No registrada")).toBeInTheDocument();
  expect(screen.getByText("Tucumán (sin localidad)")).toBeInTheDocument();
  expect(screen.getByText("San Miguel de Tucumán, Tucumán")).toBeInTheDocument();
  expect(screen.getByText("por Ana Admin")).toBeInTheDocument();
  const table = within(screen.getByRole("table")); expect(table.getByText("Sin ubicación")).toBeInTheDocument(); expect(table.getByText("Falta la localidad")).toBeInTheDocument(); expect(table.getByText("Registrada")).toBeInTheDocument();
});

test("los filtros llegan al servidor", async () => {
  respond([]);
  render(<CommanderLocations notify={vi.fn()} />);
  expect(await screen.findByText("No hay comandantes activos que coincidan con la búsqueda.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Estado de la ubicación"), { target: { value: "DESCONOCIDA" } });
  fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "paz" } });
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/commanders/locations?q=paz&estado=DESCONOCIDA"));
});

test("registra la ubicación: provincia y localidad del catálogo, y recarga la lista recién después de la respuesta", async () => {
  let finish; const notify = vi.fn();
  respond([row(1)], { put: () => new Promise((resolve) => { finish = resolve; }) });
  render(<CommanderLocations notify={notify} />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar ubicación de Apellido1, Nombre1" }));
  const form = await screen.findByRole("form", { name: "Ubicación de Apellido1, Nombre1" });
  expect(form).toHaveTextContent("Guardar ubicación");
  fireEvent.change(within(form).getByLabelText("Provincia"), { target: { value: "1" } });
  await screen.findByRole("option", { name: "San Miguel de Tucumán" });
  fireEvent.change(screen.getByLabelText("Localidad"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Motivo del cambio (opcional)"), { target: { value: "Reubicado por turno" } });
  const save = screen.getByRole("button", { name: "Guardar ubicación" });
  fireEvent.click(save); fireEvent.submit(save.closest("form"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled());
  expect(notify).not.toHaveBeenCalled();
  finish({});
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Ubicación de Apellido1, Nombre1 actualizada"));
  const puts = vi.mocked(api).mock.calls.filter(([, o]) => o?.method === "PUT");
  expect(puts).toHaveLength(1);
  expect(puts[0][0]).toBe("/commanders/1/location");
  expect(JSON.parse(puts[0][1].body)).toEqual({ provinciaId: 1, localidadId: 10, motivo: "Reubicado por turno" });
});

test("un rechazo del servidor se muestra y no informa éxito", async () => {
  const notify = vi.fn();
  respond([row(1)], { put: () => Promise.reject(Object.assign(new Error("La localidad seleccionada no pertenece a la provincia indicada"), { status: 400 })) });
  render(<CommanderLocations notify={notify} />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar ubicación de Apellido1, Nombre1" }));
  const form = await screen.findByRole("form", { name: "Ubicación de Apellido1, Nombre1" });
  fireEvent.change(within(form).getByLabelText("Provincia"), { target: { value: "1" } });
  await screen.findByRole("option", { name: "Yerba Buena" });
  fireEvent.change(screen.getByLabelText("Localidad"), { target: { value: "11" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar ubicación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no pertenece a la provincia indicada");
  expect(notify).toHaveBeenCalledWith("La localidad seleccionada no pertenece a la provincia indicada", true);
  expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/actualizada/));
});

test("un fallo al listar se informa sin ocultarlo", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/catalogs/provinces" ? Promise.resolve(provinces) : Promise.reject(new Error("Error interno")));
  render(<CommanderLocations notify={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Error interno");
});
