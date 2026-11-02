import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { currentPath, renderApp, ROLE } from "../../test-utils";
vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const plane = (extra = {}) => ({ id: 1, matricula: "LV-AAA", modelo: "King Air", tipo: "Turbohélice", capacidadPacientes: 1, capacidadTripulacion: 4, equipamientoMedico: "Camilla", activo: true, aeropuertoActualId: 10, aeropuertoActual: "Tucumán", fechaCreacion: "2026-10-01T10:00:00", estadoOperativo: "SIN_ASIGNACIONES", enVuelo: false, vuelosComprometidos: 0, proximoVuelo: null, ...extra });
const airports = [{ id: 10, nombre: "Tucumán", codigoIata: "TUC" }, { id: 11, nombre: "Aeroparque", codigoIata: "AEP" }];
const failure = (message, extra = {}) => Object.assign(new Error(message), extra);
const admin = () => ({ roles: [ROLE.admin], username: "admin" });
beforeEach(() => { vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

/** Servidor simulado: catálogo de aeronaves (`items`), aeropuertos y respuestas propias de cada prueba. */
const serve = (items, own) => vi.mocked(api).mockImplementation((path, opts) => {
  const mine = own?.(path, opts); if (mine !== undefined) return mine;
  if (path === "/catalogs/aircraft/admin") return Promise.resolve(typeof items === "function" ? items() : items);
  if (path.startsWith("/catalogs/airports")) return Promise.resolve(airports);
  return Promise.resolve([]);
});

test("separa aeronaves activas de desactivadas, muestra el estado operativo y el estado vacío", async () => {
  serve([plane(), plane({ id: 2, matricula: "LV-BBB", estadoOperativo: "ASIGNADA", vuelosComprometidos: 2, proximoVuelo: { codigo: "V-9", salida: "2026-11-01T10:00:00" } }), plane({ id: 3, matricula: "LV-OFF", activo: false, estadoOperativo: "DESACTIVADA" })]);
  renderApp("/app/aeronaves", admin());
  await waitFor(() => expect(screen.getByRole("button", { name: /Aeronaves activas/ })).toHaveTextContent("2"));
  expect(screen.getByText("LV-AAA")).toBeInTheDocument(); expect(screen.queryByText("LV-OFF")).toBeNull();
  expect(screen.getByText("Activa · con vuelos asignados")).toBeInTheDocument(); expect(screen.getByText(/V-9/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Aeronaves desactivadas/ }));
  expect(screen.getByText("LV-OFF")).toBeInTheDocument(); expect(screen.getByText("Desactivada")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar aeronave"), { target: { value: "zzz" } });
  expect(screen.getByText("Ninguna aeronave coincide con la búsqueda")).toBeInTheDocument();
  expect(currentPath()).toContain("estado=desactivadas"); expect(currentPath()).toContain("q=zzz"); // los filtros viven en la URL
});

test("sin aeronaves registradas informa el estado vacío y ofrece registrar una", async () => {
  serve([]);
  renderApp("/app/aeronaves", admin());
  expect(await screen.findByText("Todavía no hay aeronaves registradas")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Registrar aeronave" })).toHaveAttribute("href", "/app/aeronaves/nueva");
});

test("el listado abre el detalle de la aeronave y permite volver conservando la búsqueda", async () => {
  serve([plane()]);
  renderApp("/app/aeronaves?q=king", admin());
  fireEvent.click(await screen.findByRole("link", { name: "Abrir aeronave LV-AAA" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Aeronave LV-AAA" })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Ruta de navegación" })).getByRole("link", { name: "Aeronaves" }));
  expect(await screen.findByLabelText("Buscar aeronave")).toBeInTheDocument();
});

const fillNew = async (plate = "lv-new") => {
  fireEvent.change(screen.getByLabelText(/^Matrícula/), { target: { value: plate } }); fireEvent.change(screen.getByLabelText(/^Modelo/), { target: { value: "Learjet" } }); fireEvent.change(screen.getByLabelText(/^Tipo/), { target: { value: "Jet" } });
  await screen.findByRole("option", { name: "Aeroparque (AEP)" }); fireEvent.change(screen.getByLabelText("Ubicación inicial"), { target: { value: "11" } });
};

test("el alta envía los datos y recién entonces informa el éxito; un doble clic crea una sola aeronave", async () => {
  let finish;
  serve([], (path, opts) => path === "/catalogs/aircraft" && opts?.method === "POST" ? new Promise((resolve) => { finish = resolve; }) : undefined);
  renderApp("/app/aeronaves/nueva", admin());
  await screen.findByRole("form", { name: "Nueva aeronave" }); await fillNew();
  const submit = screen.getByRole("button", { name: "Registrar aeronave" });
  fireEvent.click(submit); fireEvent.click(submit); fireEvent.submit(submit.closest("form"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled());
  expect(screen.queryByText("Aeronave registrada")).toBeNull();
  expect(vi.mocked(api).mock.calls.filter(([path, opts]) => path === "/catalogs/aircraft" && opts?.method === "POST")).toHaveLength(1);
  finish({}); expect(await screen.findByText("Aeronave registrada")).toBeInTheDocument();
  const call = vi.mocked(api).mock.calls.find(([path, opts]) => path === "/catalogs/aircraft" && opts?.method === "POST");
  expect(JSON.parse(call[1].body)).toMatchObject({ matricula: "lv-new", modelo: "Learjet", tipo: "Jet", capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: 11, activo: true });
  await waitFor(() => expect(currentPath()).toBe("/app/aeronaves"));
});

test("una matrícula duplicada se informa dentro del formulario, que permanece abierto, y no se presenta como éxito", async () => {
  serve([plane()], (path, opts) => path === "/catalogs/aircraft" && opts?.method === "POST" ? Promise.reject(failure("Ya existe una aeronave con la matrícula LV-AAA", { code: "DUPLICATE_PLATE" })) : undefined);
  renderApp("/app/aeronaves/nueva", admin());
  await screen.findByRole("form", { name: "Nueva aeronave" }); await fillNew("LV-AAA");
  fireEvent.click(screen.getByRole("button", { name: "Registrar aeronave" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una aeronave con la matrícula LV-AAA");
  expect(screen.getByRole("form", { name: "Nueva aeronave" })).toBeInTheDocument(); expect(screen.queryByText("Aeronave registrada")).toBeNull(); expect(currentPath()).toBe("/app/aeronaves/nueva");
});

test("valida en el cliente las capacidades y la matrícula antes de llamar al servidor", async () => {
  serve([]);
  renderApp("/app/aeronaves/nueva", admin());
  await screen.findByRole("form", { name: "Nueva aeronave" }); await fillNew("LV BAD!");
  fireEvent.submit(screen.getByRole("button", { name: "Registrar aeronave" }).closest("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("La matrícula sólo admite letras, números y guiones.");
  expect(vi.mocked(api).mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(false);
});

test("la edición envía sólo datos administrativos (sin ubicación ni estado) y vuelve al detalle", async () => {
  serve([plane()], (path, opts) => opts?.method === "PUT" ? Promise.resolve({}) : undefined);
  renderApp("/app/aeronaves/1/editar", admin());
  await screen.findByRole("form", { name: "Editar aeronave LV-AAA" });
  expect(screen.queryByLabelText("Ubicación inicial")).toBeNull(); expect(screen.getByText(/Ubicación actual: Tucumán/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Modelo/), { target: { value: "King Air B350" } }); fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByText("Aeronave actualizada")).toBeInTheDocument();
  const [path, opts] = vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT"); expect(path).toBe("/catalogs/aircraft/1");
  const body = JSON.parse(opts.body); expect(body.modelo).toBe("King Air B350"); expect(body).not.toHaveProperty("activo"); expect(body).not.toHaveProperty("aeropuertoActualId");
  await waitFor(() => expect(currentPath()).toBe("/app/aeronaves/1"));
});

test("desactivar pide confirmación; cancelada no llama al servidor y confirmada informa tras la respuesta", async () => {
  serve([plane()], (path, opts) => opts?.method === "POST" ? Promise.resolve({}) : undefined);
  renderApp("/app/aeronaves/1", admin());
  const button = await screen.findByRole("button", { name: "Desactivar" });
  window.confirm = vi.fn(() => false); fireEvent.click(button);
  expect(vi.mocked(api).mock.calls.some(([, o]) => o?.method === "POST")).toBe(false); expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("LV-AAA"));
  window.confirm = vi.fn(() => true); fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  expect(await screen.findByText("Aeronave LV-AAA desactivada")).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/catalogs/aircraft/1/active", { method: "POST", body: JSON.stringify({ activo: false }) });
});

test("si hay vuelos asignados el servidor rechaza la baja y el mensaje se muestra como error", async () => {
  serve([plane({ estadoOperativo: "ASIGNADA", vuelosComprometidos: 1 })], (path, opts) => opts?.method === "POST" ? Promise.reject(failure("La aeronave tiene vuelos asignados (V-5). Operaciones debe cambiar la aeronave o cancelar esos vuelos antes de desactivarla", { code: "AIRCRAFT_HAS_ASSIGNMENTS", vuelos: ["V-5"] })) : undefined);
  renderApp("/app/aeronaves/1", admin());
  fireEvent.click(await screen.findByRole("button", { name: "Desactivar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("V-5");
});

test("reactivar una aeronave desactivada", async () => {
  serve([plane({ id: 3, matricula: "LV-OFF", activo: false, estadoOperativo: "DESACTIVADA" })], (path, opts) => opts?.method === "POST" ? Promise.resolve({}) : undefined);
  renderApp("/app/aeronaves/3", admin());
  fireEvent.click(await screen.findByRole("button", { name: "Reactivar" }));
  expect(await screen.findByText("Aeronave LV-OFF reactivada")).toBeInTheDocument(); expect(api).toHaveBeenCalledWith("/catalogs/aircraft/3/active", { method: "POST", body: JSON.stringify({ activo: true }) });
});

test("el cambio de ubicación elige un aeropuerto distinto del actual, envía el motivo y muestra los conflictos del servidor", async () => {
  let reject = true;
  serve([plane()], (path, opts) => path.endsWith("/location") && opts?.method === "POST" ? (reject ? Promise.reject(failure("El cambio contradice vuelos ya asignados a la aeronave (V-8)", { code: "AIRCRAFT_LOCATION_CONFLICT" })) : Promise.resolve({})) : undefined);
  renderApp("/app/aeronaves/1", admin());
  fireEvent.click(await screen.findByRole("button", { name: "Cambiar ubicación" }));
  const dialog = await screen.findByRole("dialog"); await within(dialog).findByRole("option", { name: "Aeroparque (AEP)" }); expect(within(dialog).queryByRole("option", { name: "Tucumán (TUC)" })).toBeNull();
  fireEvent.change(within(dialog).getByLabelText("Nueva ubicación"), { target: { value: "11" } }); fireEvent.change(within(dialog).getByLabelText("Motivo (opcional)"), { target: { value: "Traslado en tierra" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cambio de ubicación" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("V-8"); expect(screen.queryByText("Ubicación de LV-AAA actualizada")).toBeNull();
  reject = false; fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cambio de ubicación" }));
  expect(await screen.findByText("Ubicación de LV-AAA actualizada")).toBeInTheDocument();
  const call = vi.mocked(api).mock.calls.filter(([path, opts]) => path === "/catalogs/aircraft/1/location" && opts?.method === "POST").pop(); expect(JSON.parse(call[1].body)).toEqual({ locationId: 11, motivo: "Traslado en tierra" });
});

test("el detalle carga los vuelos y el historial con sus estados de carga, vacío y error", async () => {
  let release;
  serve([plane()], (path) => {
    if (path === "/catalogs/aircraft/1/flights") return new Promise((resolve) => { release = resolve; });
    if (path === "/catalogs/aircraft/1/history") return Promise.resolve([{ id: 1, operacion: "SET_ACTIVE", usuario: "admin", fecha: "2026-10-02T09:00:00", valoresAnteriores: '{"activo":true}', valoresNuevos: '{"activo":false,"motivo":"Mantenimiento"}' }, { id: 2, operacion: "MANUAL_LOCATION_CHANGE", usuario: "admin", fecha: "2026-10-01T09:00:00", valoresAnteriores: '{"aeropuertoActual":"Tucumán"}', valoresNuevos: '{"aeropuertoActual":"Aeroparque"}' }]);
    return undefined;
  });
  renderApp("/app/aeronaves/1", admin());
  expect(await screen.findByText("Cargando vuelos…")).toBeInTheDocument();
  expect(await screen.findByText(/Desactivada · Mantenimiento/)).toBeInTheDocument(); expect(screen.getByText("Tucumán → Aeroparque")).toBeInTheDocument();
  release([]); expect(await screen.findByText("La aeronave no tiene vuelos registrados.")).toBeInTheDocument();
});

test("el detalle informa los errores de la API sin ocultar el resto", async () => {
  serve([plane()], (path) => path.endsWith("/flights") ? Promise.reject(failure("Error interno")) : path.endsWith("/history") ? Promise.resolve([]) : undefined);
  renderApp("/app/aeronaves/1", admin());
  expect(await screen.findByText(/No se pudieron cargar los vuelos: Error interno/)).toBeInTheDocument(); expect(await screen.findByText("Sin eventos registrados.")).toBeInTheDocument();
});

test("una aeronave que no existe informa el error en lugar de una pantalla vacía", async () => {
  serve([plane()]);
  renderApp("/app/aeronaves/99", admin());
  expect(await screen.findByRole("alert")).toHaveTextContent("La aeronave no existe.");
});
