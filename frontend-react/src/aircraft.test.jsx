import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { AdminAircraft, FlightAircraft } from "./aircraft";
import { FlightCrew } from "./main.jsx";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const plane = (extra = {}) => ({ id: 1, matricula: "LV-AAA", modelo: "King Air", tipo: "Turbohélice", capacidadPacientes: 1, capacidadTripulacion: 4, equipamientoMedico: "Camilla", activo: true, aeropuertoActualId: 10, aeropuertoActual: "Tucumán", fechaCreacion: "2026-10-01T10:00:00", estadoOperativo: "SIN_ASIGNACIONES", enVuelo: false, vuelosComprometidos: 0, proximoVuelo: null, ...extra });
const airports = [{ id: 10, nombre: "Tucumán", codigoIata: "TUC" }, { id: 11, nombre: "Aeroparque", codigoIata: "AEP" }];
const failure = (message, extra = {}) => Object.assign(new Error(message), extra);
beforeEach(() => { vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);
const base = (path) => path.startsWith("/catalogs/airports") ? Promise.resolve(airports) : undefined;

test("separa aeronaves activas de desactivadas, muestra el estado operativo y el estado vacío", () => {
  const items = [plane(), plane({ id: 2, matricula: "LV-BBB", estadoOperativo: "ASIGNADA", vuelosComprometidos: 2, proximoVuelo: { codigo: "V-9", salida: "2026-11-01T10:00:00" } }), plane({ id: 3, matricula: "LV-OFF", activo: false, estadoOperativo: "DESACTIVADA" })];
  render(<AdminAircraft items={items} airports={airports} reload={vi.fn()} notify={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Aeronaves activas (2)" })).toBeInTheDocument();
  expect(screen.getByText("LV-AAA")).toBeInTheDocument(); expect(screen.queryByText("LV-OFF")).toBeNull();
  expect(screen.getByText("Activa · con vuelos asignados")).toBeInTheDocument(); expect(screen.getByText(/V-9/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aeronaves desactivadas (1)" }));
  expect(screen.getByText("LV-OFF")).toBeInTheDocument(); expect(screen.getByText("Desactivada")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar aeronave"), { target: { value: "zzz" } });
  expect(screen.getByText("No hay aeronaves desactivadas para mostrar.")).toBeInTheDocument();
});
test("sin aeronaves registradas informa el estado vacío", () => {
  render(<AdminAircraft items={[]} airports={airports} reload={vi.fn()} notify={vi.fn()} />);
  expect(screen.getByText("Todavía no hay aeronaves registradas.")).toBeInTheDocument();
});
test("el alta envía los datos y recién entonces informa el éxito; un doble clic crea una sola aeronave", async () => {
  let finish; const reload = vi.fn(async () => {}), notify = vi.fn();
  vi.mocked(api).mockImplementation((path, opts) => opts?.method === "POST" ? new Promise((resolve) => { finish = resolve; }) : base(path));
  render(<AdminAircraft items={[]} airports={airports} reload={reload} notify={notify} />);
  fireEvent.click(screen.getByRole("button", { name: "Nueva aeronave" }));
  fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "lv-new" } }); fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "Learjet" } }); fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "Jet" } });
  await screen.findByRole("option", { name: "Aeroparque (AEP)" }); fireEvent.change(screen.getByLabelText("Ubicación inicial"), { target: { value: "11" } });
  const submit = screen.getByRole("button", { name: "Registrar aeronave" });
  fireEvent.click(submit); fireEvent.click(submit); fireEvent.submit(submit.closest("form"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled());
  expect(notify).not.toHaveBeenCalled();
  expect(vi.mocked(api).mock.calls.filter(([path, opts]) => path === "/catalogs/aircraft" && opts?.method === "POST")).toHaveLength(1);
  finish({}); await waitFor(() => expect(notify).toHaveBeenCalledWith("Aeronave registrada"));
  const call = vi.mocked(api).mock.calls.find(([path, opts]) => path === "/catalogs/aircraft" && opts?.method === "POST");
  expect(JSON.parse(call[1].body)).toMatchObject({ matricula: "lv-new", modelo: "Learjet", tipo: "Jet", capacidadPacientes: 1, capacidadTripulacion: 2, aeropuertoActualId: 11, activo: true });
  expect(reload).toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
});
test("una matrícula duplicada se informa dentro del formulario, que permanece abierto, y no se presenta como éxito", async () => {
  const notify = vi.fn(), reload = vi.fn();
  vi.mocked(api).mockImplementation((path, opts) => opts?.method === "POST" ? Promise.reject(failure("Ya existe una aeronave con la matrícula LV-AAA", { code: "DUPLICATE_PLATE" })) : base(path));
  render(<AdminAircraft items={[plane()]} airports={airports} reload={reload} notify={notify} />);
  fireEvent.click(screen.getByRole("button", { name: "Nueva aeronave" }));
  fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "LV-AAA" } }); fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "M" } }); fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "T" } });
  await screen.findByRole("option", { name: "Tucumán (TUC)" }); fireEvent.change(screen.getByLabelText("Ubicación inicial"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar aeronave" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una aeronave con la matrícula LV-AAA");
  expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(notify).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
});
test("valida en el cliente las capacidades y la matrícula antes de llamar al servidor", async () => {
  vi.mocked(api).mockImplementation((path) => base(path));
  render(<AdminAircraft items={[]} airports={airports} reload={vi.fn()} notify={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Nueva aeronave" }));
  fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "LV BAD!" } }); fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "M" } }); fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "T" } });
  await screen.findByRole("option", { name: "Tucumán (TUC)" }); fireEvent.change(screen.getByLabelText("Ubicación inicial"), { target: { value: "10" } });
  fireEvent.submit(screen.getByRole("button", { name: "Registrar aeronave" }).closest("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("La matrícula sólo admite letras, números y guiones.");
  expect(vi.mocked(api).mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(false);
});
test("la edición envía sólo datos administrativos (sin ubicación ni estado) y actualiza el listado", async () => {
  const reload = vi.fn(async () => {}), notify = vi.fn(); vi.mocked(api).mockResolvedValue({});
  render(<AdminAircraft items={[plane()]} airports={airports} reload={reload} notify={notify} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  expect(screen.queryByLabelText("Ubicación inicial")).toBeNull(); expect(screen.getByText(/Ubicación actual: Tucumán/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "King Air B350" } }); fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Aeronave actualizada"));
  const [path, opts] = vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT"); expect(path).toBe("/catalogs/aircraft/1");
  const body = JSON.parse(opts.body); expect(body.modelo).toBe("King Air B350"); expect(body).not.toHaveProperty("activo"); expect(body).not.toHaveProperty("aeropuertoActualId"); expect(reload).toHaveBeenCalled();
});
test("desactivar pide confirmación; cancelada no llama al servidor y confirmada informa tras la respuesta", async () => {
  const reload = vi.fn(async () => {}), notify = vi.fn(); vi.mocked(api).mockResolvedValue({});
  render(<AdminAircraft items={[plane()]} airports={airports} reload={reload} notify={notify} />);
  window.confirm = vi.fn(() => false); fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  expect(api).not.toHaveBeenCalled(); expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("LV-AAA"));
  window.confirm = vi.fn(() => true); fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Aeronave LV-AAA desactivada"));
  expect(api).toHaveBeenCalledWith("/catalogs/aircraft/1/active", { method: "POST", body: JSON.stringify({ activo: false }) });
});
test("si hay vuelos asignados el servidor rechaza la baja y el mensaje se muestra como error", async () => {
  const notify = vi.fn(), reload = vi.fn();
  vi.mocked(api).mockRejectedValue(failure("La aeronave tiene vuelos asignados (V-5). Operaciones debe cambiar la aeronave o cancelar esos vuelos antes de desactivarla", { code: "AIRCRAFT_HAS_ASSIGNMENTS", vuelos: ["V-5"] }));
  render(<AdminAircraft items={[plane({ estadoOperativo: "ASIGNADA", vuelosComprometidos: 1 })]} airports={airports} reload={reload} notify={notify} />);
  fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("V-5"), true)); expect(reload).not.toHaveBeenCalled();
});
test("reactivar una aeronave desactivada", async () => {
  const notify = vi.fn(); vi.mocked(api).mockResolvedValue({});
  render(<AdminAircraft items={[plane({ id: 3, matricula: "LV-OFF", activo: false, estadoOperativo: "DESACTIVADA" })]} airports={airports} reload={vi.fn(async () => {})} notify={notify} />);
  fireEvent.click(screen.getByRole("button", { name: "Aeronaves desactivadas (1)" })); fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Aeronave LV-OFF reactivada")); expect(api).toHaveBeenCalledWith("/catalogs/aircraft/3/active", { method: "POST", body: JSON.stringify({ activo: true }) });
});
test("el cambio de ubicación elige un aeropuerto distinto del actual, envía el motivo y muestra los conflictos del servidor", async () => {
  const notify = vi.fn(), reload = vi.fn(async () => {}); let reject = true;
  vi.mocked(api).mockImplementation((path, opts) => opts?.method === "POST" ? (reject ? Promise.reject(failure("El cambio contradice vuelos ya asignados a la aeronave (V-8)", { code: "AIRCRAFT_LOCATION_CONFLICT" })) : Promise.resolve({})) : base(path));
  render(<AdminAircraft items={[plane()]} airports={airports} reload={reload} notify={notify} />);
  fireEvent.click(screen.getByRole("button", { name: "Ubicación" }));
  await screen.findByRole("option", { name: "Aeroparque (AEP)" }); expect(screen.queryByRole("option", { name: "Tucumán (TUC)" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Nueva ubicación"), { target: { value: "11" } }); fireEvent.change(screen.getByLabelText("Motivo (opcional)"), { target: { value: "Traslado en tierra" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio de ubicación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("V-8"); expect(notify).not.toHaveBeenCalled();
  reject = false; fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio de ubicación" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Ubicación de LV-AAA actualizada"));
  const call = vi.mocked(api).mock.calls.filter(([path, opts]) => path === "/catalogs/aircraft/1/location" && opts?.method === "POST").pop(); expect(JSON.parse(call[1].body)).toEqual({ locationId: 11, motivo: "Traslado en tierra" });
});
test("el detalle carga los vuelos y el historial con sus estados de carga, vacío y error", async () => {
  let release;
  vi.mocked(api).mockImplementation((path) => {
    if (path === "/catalogs/aircraft/1/flights") return new Promise((resolve) => { release = resolve; });
    if (path === "/catalogs/aircraft/1/history") return Promise.resolve([{ id: 1, operacion: "SET_ACTIVE", usuario: "admin", fecha: "2026-10-02T09:00:00", valoresAnteriores: '{"activo":true}', valoresNuevos: '{"activo":false,"motivo":"Mantenimiento"}' }, { id: 2, operacion: "MANUAL_LOCATION_CHANGE", usuario: "admin", fecha: "2026-10-01T09:00:00", valoresAnteriores: '{"aeropuertoActual":"Tucumán"}', valoresNuevos: '{"aeropuertoActual":"Aeroparque"}' }]);
    return base(path);
  });
  render(<AdminAircraft items={[plane()]} airports={airports} reload={vi.fn()} notify={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
  expect(await screen.findByText("Cargando vuelos…")).toBeInTheDocument();
  expect(await screen.findByText(/Desactivada · Mantenimiento/)).toBeInTheDocument(); expect(screen.getByText("Tucumán → Aeroparque")).toBeInTheDocument();
  release([]); expect(await screen.findByText("La aeronave no tiene vuelos registrados.")).toBeInTheDocument();
});
test("el detalle informa los errores de la API sin ocultar el resto", async () => {
  vi.mocked(api).mockImplementation((path) => path.endsWith("/flights") ? Promise.reject(failure("Error interno")) : path.endsWith("/history") ? Promise.resolve([]) : base(path));
  render(<AdminAircraft items={[plane()]} airports={airports} reload={vi.fn()} notify={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Detalle" }));
  expect(await screen.findByText(/No se pudieron cargar los vuelos: Error interno/)).toBeInTheDocument(); expect(await screen.findByText("Sin eventos registrados.")).toBeInTheDocument();
});

// ---------- Aeronave del vuelo (Operaciones) ----------
const resources = { aircraftId: 1, aircraftMatricula: "LV-AAA", aircraftModelo: "King Air", aircraftTipo: "Turbohélice", aircraftUbicacion: "Tucumán", aircraftCapacidadTripulacion: 4 };
const candidates = [{ id: 2, matricula: "LV-BBB", modelo: "Learjet", aeropuertoActual: "Tucumán", disponible: true, conflictos: [] }, { id: 3, matricula: "LV-CCC", modelo: "PC-12", aeropuertoActual: "Tucumán", disponible: false, motivoNoDisponible: "Tiene un vuelo comprometido en el horario de este vuelo", conflictos: [{ codigo: "V-77", salida: "2026-11-01T10:00:00", llegada: "2026-11-01T12:00:00" }] }];
test("operaciones ve la aeronave del vuelo, las no disponibles con su conflicto y cambia la aeronave tras confirmar", async () => {
  const done = vi.fn(async () => {}), reload = vi.fn(async () => {}), msg = vi.fn();
  let releaseCandidates;
  vi.mocked(api).mockImplementation((path, opts) => path === "/flights/7/aircraft-candidates" ? new Promise((resolve) => { releaseCandidates = () => resolve(candidates); }) : opts?.method === "POST" ? Promise.resolve({}) : Promise.resolve([]));
  render(<FlightAircraft flight={{ id: 7, codigo: "V-7", estado: "PLANIFICADO" }} recursos={resources} done={done} reload={reload} msg={msg} />);
  expect(screen.getByText("LV-AAA")).toBeInTheDocument(); expect(screen.getByText(/Ubicación actual: Tucumán/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cambiar aeronave" })); expect(await screen.findByText("Cargando aeronaves…")).toBeInTheDocument(); releaseCandidates();
  await screen.findByRole("option", { name: "LV-BBB — Learjet — Tucumán" }); expect(screen.queryByRole("option", { name: /LV-CCC/ })).toBeNull();
  expect(screen.getByText(/No disponibles \(1\)/)).toBeInTheDocument(); expect(screen.getByText(/V-77/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar cambio de aeronave" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Aeronave disponible"), { target: { value: "2" } }); fireEvent.change(screen.getByLabelText("Motivo del cambio (opcional)"), { target: { value: "Falla" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio de aeronave" }));
  await waitFor(() => expect(msg).toHaveBeenCalledWith("Aeronave del vuelo cambiada a LV-BBB"));
  expect(api).toHaveBeenCalledWith("/flights/7/aircraft", { method: "POST", body: JSON.stringify({ aircraftId: 2, motivo: "Falla" }) });
  expect(done).toHaveBeenCalled(); expect(reload).toHaveBeenCalled();
});
test("un conflicto de disponibilidad al cambiar la aeronave se informa, no se presenta como éxito y se refrescan los candidatos", async () => {
  const msg = vi.fn(); let calls = 0;
  vi.mocked(api).mockImplementation((path, opts) => { if (path === "/flights/7/aircraft-candidates") { calls++; return Promise.resolve(candidates); } return opts?.method === "POST" ? Promise.reject(failure("La aeronave LV-BBB tiene un vuelo comprometido en ese horario (V-80)")) : Promise.resolve([]); });
  render(<FlightAircraft flight={{ id: 7, codigo: "V-7", estado: "PENDIENTE_CONFIRMACION_COMANDANTE" }} recursos={resources} msg={msg} />);
  fireEvent.click(screen.getByRole("button", { name: "Cambiar aeronave" })); await screen.findByRole("option", { name: "LV-BBB — Learjet — Tucumán" });
  fireEvent.change(screen.getByLabelText("Aeronave disponible"), { target: { value: "2" } }); fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio de aeronave" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("V-80"); expect(msg).not.toHaveBeenCalled(); await waitFor(() => expect(calls).toBe(2));
});
test("no se ofrece cambiar la aeronave de un vuelo iniciado, finalizado o cancelado", () => {
  for (const estado of ["EN_CURSO", "FINALIZADO", "CANCELADO"]) { const { unmount } = render(<FlightAircraft flight={{ id: 7, codigo: "V-7", estado }} recursos={resources} />); expect(screen.queryByRole("button", { name: "Cambiar aeronave" })).toBeNull(); expect(screen.getByText(/sólo puede cambiarse antes del inicio/)).toBeInTheDocument(); unmount(); }
});
test("sin aeronave asignada y sin candidatos se informa el estado vacío", async () => {
  render(<FlightAircraft flight={{ id: 7, codigo: "V-7", estado: "PLANIFICADO" }} recursos={{}} />); expect(screen.getByText("Sin aeronave asignada.")).toBeInTheDocument(); cleanup();
  vi.mocked(api).mockResolvedValue([]); render(<FlightAircraft flight={{ id: 7, codigo: "V-7", estado: "PLANIFICADO" }} recursos={resources} />);
  fireEvent.click(screen.getByRole("button", { name: "Cambiar aeronave" })); expect(await screen.findByText("No hay aeronaves disponibles para este vuelo.")).toBeInTheDocument();
});

// ---------- Tripulación ----------
const crewRows = [{ id: 1, userId: 10, nombre: "Ana", apellido: "Piloto", crewRoleName: "Comandante", comandante: true, vigente: true }, { id: 2, userId: 11, nombre: "Luis", apellido: "Médico", crewRoleName: "Médico", comandante: false, vigente: true }];
test("la tripulación muestra el historial de retiros y reemplazos bajo demanda", async () => {
  const history = [...crewRows, { id: 3, userId: 12, nombre: "Eva", apellido: "Enfermera", crewRoleName: "Enfermero", comandante: false, vigente: false, motivoBaja: "REEMPLAZO", bajaPor: "ops", fechaBaja: "2026-10-01T10:00:00", asignadoPor: "ops2", asignadoEn: "2026-09-30T10:00:00" }];
  vi.mocked(api).mockImplementation((path) => path === "/flights/7/crew?history=true" ? Promise.resolve(history) : path === "/flights/7/crew" ? Promise.resolve(crewRows) : Promise.resolve([]));
  render(<FlightCrew flightId={7} state="PLANIFICADO" msg={vi.fn()} />);
  await screen.findByText(/Luis Médico/); expect(screen.queryByText(/Eva Enfermera/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ver historial de tripulación" }));
  const list = await screen.findByRole("list", { name: "Historial de tripulación" }); expect(within(list).getByText(/Eva Enfermera/)).toHaveTextContent(/Reemplazado por ops/);
  expect(screen.getAllByText(/Luis Médico/)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Ocultar historial de tripulación" })); expect(screen.queryByRole("list", { name: "Historial de tripulación" })).toBeNull();
});
test("retirar pide confirmación y no actúa si se cancela", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/flights/7/crew" ? Promise.resolve(crewRows) : Promise.resolve([]));
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await screen.findByText(/Luis Médico/); window.confirm = vi.fn(() => false); fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Luis Médico")); expect(api).not.toHaveBeenCalledWith("/flights/7/crew/2", expect.anything());
});
test("la asignación lista a quienes no están disponibles con el vuelo en conflicto y un conflicto 409 se muestra sin falso éxito", async () => {
  const msg = vi.fn(); let attempts = 0;
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path.startsWith("/flights/7/crew/available")) return Promise.resolve([{ userId: 13, nombre: "Pablo", apellido: "Médico", username: "pablo" }]);
    if (path.startsWith("/flights/7/crew/candidates")) return Promise.resolve([{ userId: 13, nombre: "Pablo", apellido: "Médico", username: "pablo", disponible: true }, { userId: 14, nombre: "Rosa", apellido: "Médica", username: "rosa", disponible: false, motivoNoDisponible: "Tiene el vuelo V-9 comprometido en un horario incompatible" }]);
    if (path === "/flights/7/crew" && opts?.method === "POST") { attempts++; return Promise.reject(failure("El tripulante tiene otro compromiso incompatible (V-9)")); }
    return Promise.resolve(path === "/flights/7/crew" ? crewRows : []);
  });
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={msg} />);
  await screen.findByText(/Luis Médico/); fireEvent.change(screen.getByLabelText("Función de tripulación"), { target: { value: "MEDICO" } });
  await screen.findByRole("option", { name: "Pablo Médico (pablo)" }); expect(screen.getByText(/No disponibles por conflicto \(1\)/)).toBeInTheDocument(); expect(screen.getByText(/Rosa Médica: Tiene el vuelo V-9/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Personal disponible"), { target: { value: "13" } });
  const assign = screen.getByRole("button", { name: "Asignar tripulante" }); fireEvent.click(assign); fireEvent.click(assign);
  expect(await screen.findByRole("alert")).toHaveTextContent("V-9"); expect(msg).not.toHaveBeenCalled(); expect(attempts).toBe(1);
});
test("sin personal disponible se informa el estado vacío y las funciones salen del catálogo", async () => {
  vi.mocked(api).mockImplementation((path) => {
    if (path === "/catalogs/crew-roles") return Promise.resolve([{ codigo: "COMANDANTE", nombre: "Comandante" }, { codigo: "MEDICO", nombre: "Médico" }, { codigo: "TECNICO", nombre: "Técnico de a bordo" }]);
    if (path.startsWith("/flights/7/crew/")) return Promise.resolve([]);
    return Promise.resolve(crewRows);
  });
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await screen.findByRole("option", { name: "Técnico de a bordo" }); expect(screen.queryByRole("option", { name: "Comandante" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Función de tripulación"), { target: { value: "TECNICO" } });
  expect(await screen.findByText("No hay personal disponible con esa función para el horario del vuelo.")).toBeInTheDocument();
});
test("un vuelo iniciado o finalizado no ofrece modificar la tripulación", async () => {
  vi.mocked(api).mockResolvedValue(crewRows);
  render(<FlightCrew flightId={7} state="EN_CURSO" canManage msg={vi.fn()} />);
  await screen.findByText(/Luis Médico/); expect(screen.queryByRole("button", { name: "Retirar" })).toBeNull(); expect(screen.queryByLabelText("Función de tripulación")).toBeNull();
});
