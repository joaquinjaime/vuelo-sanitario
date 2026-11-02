import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { CommanderLocations } from "./commanderLocations";
vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const provinces = [{ id: 1, nombre: "Tucumán" }, { id: 2, nombre: "Buenos Aires" }, { id: 3, nombre: "Ciudad Autónoma de Buenos Aires" }];
const row = (id, extra = {}) => ({ comandanteId: id, username: `cmd${id}`, nombre: `Nombre${id}`, apellido: `Apellido${id}`, licencia: `LIC-${id}`, activo: true, estadoCuenta: "ACTIVO", provinciaId: null, provincia: null, estadoUbicacion: "DESCONOCIDA", actualizadaEn: null, actualizadaPor: null, ...extra });
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);
const respond = (rows, extra = {}) => vi.mocked(api).mockImplementation((path, options) => {
  if (path === "/catalogs/provinces") return Promise.resolve(provinces);
  if (options?.method === "PUT") return extra.put ? extra.put(path, options) : Promise.resolve({});
  if (path.startsWith("/commanders/locations")) return Promise.resolve({ comandantes: rows, truncado: Boolean(extra.truncado) });
  return Promise.resolve(null);
});

test("lista los comandantes con su jurisdicción, el estado y quién la registró, sin pedir ni mostrar localidad", async () => {
  respond([row(1), row(3, { provinciaId: 1, provincia: "Tucumán", estadoUbicacion: "CONOCIDA", actualizadaEn: "2026-11-02T09:30:00", actualizadaPor: "Ana Admin" }), row(4, { provinciaId: 3, provincia: "Ciudad Autónoma de Buenos Aires", estadoUbicacion: "CONOCIDA" })]);
  render(<CommanderLocations notify={vi.fn()} />);
  expect(await screen.findByText("Apellido1, Nombre1")).toBeInTheDocument();
  expect(screen.getByText("No registrada")).toBeInTheDocument();
  const table = within(screen.getByRole("table"));
  expect(table.getByText("Tucumán")).toBeInTheDocument();
  expect(table.getByText("Ciudad Autónoma de Buenos Aires")).toBeInTheDocument();
  expect(screen.getByText("por Ana Admin")).toBeInTheDocument();
  expect(table.getByText("Sin ubicación")).toBeInTheDocument(); expect(table.getAllByText("Registrada")).toHaveLength(2);
  expect(screen.queryByText(/localidad/i, { selector: "th" })).not.toBeInTheDocument();
});

test("los filtros llegan al servidor", async () => {
  respond([]);
  render(<CommanderLocations notify={vi.fn()} />);
  expect(await screen.findByText("No hay comandantes activos que coincidan con la búsqueda.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Estado de la ubicación"), { target: { value: "DESCONOCIDA" } });
  fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "paz" } });
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/commanders/locations?q=paz&estado=DESCONOCIDA"));
});

test("registra la jurisdicción (23 provincias y CABA diferenciadas) sin solicitar localidad y recarga recién después de la respuesta", async () => {
  let finish; const notify = vi.fn();
  respond([row(1)], { put: () => new Promise((resolve) => { finish = resolve; }) });
  render(<CommanderLocations notify={notify} />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar ubicación de Apellido1, Nombre1" }));
  const form = await screen.findByRole("form", { name: "Ubicación de Apellido1, Nombre1" });
  expect(form).toHaveTextContent("Actualizar ubicación");
  expect(within(form).queryByLabelText(/localidad/i)).not.toBeInTheDocument();
  const select = within(form).getByLabelText("Provincia / Jurisdicción");
  expect(within(select).getByRole("option", { name: "Buenos Aires" })).toBeInTheDocument();
  expect(within(select).getByRole("option", { name: "Ciudad Autónoma de Buenos Aires" })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Motivo del cambio (opcional)"), { target: { value: "Reubicado por turno" } });
  const save = screen.getByRole("button", { name: "Actualizar ubicación" });
  fireEvent.click(save); fireEvent.submit(save.closest("form"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled());
  expect(notify).not.toHaveBeenCalled();
  finish({});
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Ubicación de Apellido1, Nombre1 actualizada"));
  const puts = vi.mocked(api).mock.calls.filter(([, o]) => o?.method === "PUT");
  expect(puts).toHaveLength(1);
  expect(puts[0][0]).toBe("/commanders/1/location");
  expect(JSON.parse(puts[0][1].body)).toEqual({ provinciaId: 1, motivo: "Reubicado por turno" });
});

test("permite marcar la ubicación como desconocida", async () => {
  respond([row(1, { provinciaId: 1, provincia: "Tucumán", estadoUbicacion: "CONOCIDA" })]);
  render(<CommanderLocations notify={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Cambiar ubicación de Apellido1, Nombre1" }));
  const form = await screen.findByRole("form", { name: "Ubicación de Apellido1, Nombre1" });
  fireEvent.change(within(form).getByLabelText("Provincia / Jurisdicción"), { target: { value: "__desconocida__" } });
  fireEvent.click(within(form).getByRole("button", { name: "Actualizar ubicación" }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([, o]) => o?.method === "PUT")).toBe(true));
  expect(JSON.parse(vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT")[1].body)).toEqual({ provinciaId: null, motivo: null });
});

test("un rechazo del servidor se muestra y no informa éxito", async () => {
  const notify = vi.fn();
  respond([row(1)], { put: () => Promise.reject(Object.assign(new Error("La provincia seleccionada está deshabilitada"), { status: 400 })) });
  render(<CommanderLocations notify={notify} />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar ubicación de Apellido1, Nombre1" }));
  const form = await screen.findByRole("form", { name: "Ubicación de Apellido1, Nombre1" });
  fireEvent.change(within(form).getByLabelText("Provincia / Jurisdicción"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Actualizar ubicación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La provincia seleccionada está deshabilitada");
  expect(notify).toHaveBeenCalledWith("La provincia seleccionada está deshabilitada", true);
  expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/actualizada/));
});

test("un fallo al listar se informa sin ocultarlo", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/catalogs/provinces" ? Promise.resolve(provinces) : Promise.reject(new Error("Error interno")));
  render(<CommanderLocations notify={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Error interno");
});
