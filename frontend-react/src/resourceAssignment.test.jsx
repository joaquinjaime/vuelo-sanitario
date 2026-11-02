import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { ResourceAssignment } from "./resourceAssignment";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const flight = (extra = {}) => ({ id: 7, estado: "APROBADO", salida: "2026-11-10T10:00:00", ...extra });
const noResources = { aircraftId: null, commanderId: null };
const candidate = (id, extra = {}) => ({ id, username: `cmd${id}`, nombre: `Nombre${id}`, apellido: `Apellido${id}`, licencia: `LIC-${id}`, provinciaId: 1, provincia: "Tucumán", ubicacionActualizadaEn: "2026-11-02T09:00:00", elegibilidad: "ORDINARIA", codigoUbicacion: "MISMA_JURISDICCION", motivoUbicacion: "Se encuentra en la jurisdicción del aeropuerto de salida (Tucumán)", codigoOperativo: null, motivoOperativo: null, ...extra });
const candidates = (extra = {}) => ({ salida: { provinciaId: 1, provincia: "Tucumán", aeropuertoId: 5, aeropuerto: "Matienzo", fuente: "AEROPUERTO_CONFIRMADO", preliminar: false }, comandanteAsignadoId: null, ordinarios: [], noElegiblesEnJurisdiccion: [], excepcionales: [], excepcionalesIncompletos: false, fueraDeJurisdiccion: {}, puedeAutorizarExcepcion: true, mensaje: null, advertencia: null, ...extra });
const plane = (id, extra = {}) => ({ id, matricula: `LV-${id}`, modelo: "King Air", tipo: "Avion", aeropuertoActualId: 5, aeropuertoActual: "Tucumán", disponible: true, motivoNoDisponible: null, conflictos: [], ...extra });
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);
const setup = (props = {}) => { const msg = vi.fn(), onChanged = vi.fn(async () => {}); render(<ResourceAssignment flight={flight()} resources={noResources} msg={msg} onChanged={onChanged} {...props} />); return { msg, onChanged }; };

test("muestra comandante y aeronave como pendientes, con una acción visible en cada tarjeta", () => {
  setup();
  expect(screen.getAllByText("Pendiente")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Seleccionar comandante" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Seleccionar aeronave" })).toBeEnabled();
});

test("sin comandantes en la jurisdicción explica por qué en lugar de mostrar una lista vacía", async () => {
  vi.mocked(api).mockResolvedValue(candidates({ mensaje: "No se encontraron comandantes disponibles en Tucumán, jurisdicción del aeropuerto de salida. Comandantes activos fuera de la jurisdicción: 1 sin ubicación registrada." }));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar comandante" }));
  expect(await screen.findByText(/No se encontraron comandantes disponibles en Tucumán/)).toBeInTheDocument();
  expect(screen.getByText(/1 sin ubicación registrada/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar comandante" })).toBeDisabled();
  expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/7/commander-candidates?q=");
});

test("avisa que los candidatos son preliminares mientras el aeropuerto de salida no esté confirmado y usa la provincia del paciente", async () => {
  vi.mocked(api).mockResolvedValue(candidates({ salida: { provinciaId: 1, provincia: "Tucumán", aeropuertoId: null, aeropuerto: null, fuente: "PROVINCIA_DEL_PACIENTE", preliminar: true }, ordinarios: [candidate(3)],
    advertencia: "Todavía no hay aeropuerto de salida: los candidatos son preliminares y se calcularon con la provincia donde se encuentra el paciente (Tucumán)." }));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar comandante" }));
  expect(await screen.findByText(/los candidatos son preliminares/)).toBeInTheDocument();
  expect(screen.getByText(/todavía no hay aeropuerto de salida/)).toBeInTheDocument();
  expect(screen.getByText("Disponibles en Tucumán (preliminar)")).toBeInTheDocument();
  expect(screen.queryByText(/Localidad de salida/)).toBeNull();
});

test("confirma un comandante ordinario: envía la elección, informa recién tras la respuesta y evita el doble envío", async () => {
  let finish;
  vi.mocked(api).mockImplementation((path, options) => options?.method === "PUT" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(candidates({ ordinarios: [candidate(3)] })));
  const { msg, onChanged } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar comandante" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Apellido3, Nombre3/ }));
  const confirm = screen.getByRole("button", { name: "Confirmar comandante" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmando…" })).toBeDisabled());
  expect(msg).not.toHaveBeenCalled();
  finish({});
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  const puts = vi.mocked(api).mock.calls.filter(([, o]) => o?.method === "PUT");
  expect(puts).toHaveLength(1);
  expect(puts[0][0]).toBe("/flights/7/commander");
  expect(JSON.parse(puts[0][1].body)).toEqual({ comandanteId: 3, excepcionGeografica: null });
  expect(msg).toHaveBeenCalledWith("Comandante reservado: falta confirmar la aeronave");
});

test("un comandante fuera de la localidad exige la justificación y la envía como excepción", async () => {
  vi.mocked(api).mockImplementation((path, options) => options?.method === "PUT" ? Promise.resolve({}) : Promise.resolve(candidates({ mensaje: "No se encontraron comandantes disponibles en Tucumán, jurisdicción del aeropuerto de salida.", excepcionales: [candidate(4, { elegibilidad: "EXCEPCION", codigoUbicacion: "OTRA_PROVINCIA", motivoUbicacion: "Se encuentra en Buenos Aires y el vuelo sale de Tucumán", provincia: "Buenos Aires" })] })));
  const { onChanged } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar comandante" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Apellido4, Nombre4/ }));
  const confirm = screen.getByRole("button", { name: "Confirmar asignación excepcional" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificación de la excepción geográfica/), { target: { value: "corta" } });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificación de la excepción geográfica/), { target: { value: "No hay otro comandante habilitado en Tucumán" } });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const put = vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(JSON.parse(put[1].body)).toEqual({ comandanteId: 4, excepcionGeografica: { motivo: "No hay otro comandante habilitado en Tucumán" } });
});

test("sin autorización para excepciones las opciones fuera de la jurisdicción no pueden elegirse", async () => {
  vi.mocked(api).mockResolvedValue(candidates({ puedeAutorizarExcepcion: false, excepcionales: [candidate(4, { elegibilidad: "EXCEPCION", codigoUbicacion: "UBICACION_DESCONOCIDA", motivoUbicacion: "No tiene una ubicación operativa registrada", provincia: null })] }));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar comandante" }));
  const radio = await screen.findByRole("radio", { name: /Apellido4, Nombre4/ });
  expect(radio).toBeDisabled();
  expect(screen.getByText(/requiere la autorización de Centro de Operaciones/)).toBeInTheDocument();
});

test("un error del servidor al confirmar se muestra, no informa éxito y vuelve a consultar los candidatos", async () => {
  let queries = 0;
  vi.mocked(api).mockImplementation((path, options) => {
    if (options?.method === "PUT") return Promise.reject(Object.assign(new Error("Tiene el vuelo V-1 comprometido en un horario incompatible"), { status: 409, code: "CONFLICTO_ASIGNACION" }));
    queries++; return Promise.resolve(candidates({ ordinarios: queries === 1 ? [candidate(3)] : [] }));
  });
  const { msg, onChanged } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar comandante" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Apellido3, Nombre3/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar comandante" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("comprometido en un horario incompatible");
  expect(msg).toHaveBeenCalledWith("Tiene el vuelo V-1 comprometido en un horario incompatible", true);
  expect(onChanged).not.toHaveBeenCalled();
  await waitFor(() => expect(queries).toBe(2));
  expect(screen.queryByRole("radio", { name: /Apellido3/ })).toBeNull();
});

test("la aeronave se elige entre las disponibles, explica las no disponibles y se confirma por separado", async () => {
  vi.mocked(api).mockImplementation((path, options) => options?.method === "PUT" ? Promise.resolve({}) : Promise.resolve([plane(1), plane(2, { disponible: false, motivoNoDisponible: "Tiene un vuelo comprometido en el horario de este vuelo" })]));
  const { msg, onChanged } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar aeronave" }));
  const select = await screen.findByLabelText("Aeronave disponible");
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Seleccionar", "LV-1 — King Air — Tucumán"]);
  fireEvent.click(screen.getByText(/No disponibles \(1\)/));
  expect(screen.getByText("Tiene un vuelo comprometido en el horario de este vuelo")).toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: "Confirmar aeronave" });
  expect(confirm).toBeDisabled();
  fireEvent.change(select, { target: { value: "1" } });
  fireEvent.click(confirm);
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const put = vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(put[0]).toBe("/flights/7/assigned-aircraft"); expect(JSON.parse(put[1].body)).toEqual({ aircraftId: 1 });
  expect(msg).toHaveBeenCalledWith("Aeronave reservada: falta confirmar el comandante");
});

test("un conflicto de aeronave se informa y actualiza la lista sin marcar nada como asignado", async () => {
  let loads = 0;
  vi.mocked(api).mockImplementation((path, options) => {
    if (options?.method === "PUT") return Promise.reject(Object.assign(new Error("La aeronave LV-1 tiene un vuelo comprometido en ese horario (V-9)"), { status: 409 }));
    loads++; return Promise.resolve(loads === 1 ? [plane(1)] : [plane(1, { disponible: false, motivoNoDisponible: "Tiene un vuelo comprometido en el horario de este vuelo" })]);
  });
  const { msg, onChanged } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar aeronave" }));
  fireEvent.change(await screen.findByLabelText("Aeronave disponible"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar aeronave" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("tiene un vuelo comprometido en ese horario (V-9)");
  expect(onChanged).not.toHaveBeenCalled(); expect(msg).not.toHaveBeenCalledWith(expect.stringMatching(/asignada|reservada/i));
  expect(await screen.findByText("No hay aeronaves disponibles para este vuelo en la jurisdicción de salida.")).toBeInTheDocument();
});

test("muestra los recursos asignados con la jurisdicción del comandante, su elegibilidad geográfica y la excepción registrada", () => {
  setup({
    flight: flight({ estado: "PLANIFICADO" }),
    resources: { aircraftId: 1, aircraftMatricula: "LV-AAA", aircraftModelo: "King Air", aircraftTipo: "Avion", aircraftUbicacion: "Tucumán", aircraftCapacidadTripulacion: 4, commanderId: 3, commanderNombre: "Ana", commanderApellido: "Paz", commanderLicencia: "LIC-9", commanderProvinciaActual: "Buenos Aires", commanderUbicacionActualizadaEn: "2026-11-02T09:00:00", excepcionGeografica: { id: 1, tipo: "OTRA_PROVINCIA", motivo: "No hay otro comandante habilitado", autorizadaPor: "Luis Gómez", fecha: "2026-11-02T10:00:00", localidadComandante: "Ciudad de Buenos Aires", localidadSalida: "Yerba Buena" } },
  });
  expect(screen.getAllByText("Asignado").length + screen.getAllByText("Asignada").length).toBe(2);
  expect(screen.getByText("Ana Paz")).toBeInTheDocument();
  expect(screen.getByText("Provincia / Jurisdicción actual")).toBeInTheDocument();
  expect(screen.getByText(/En otra provincia o jurisdicción/)).toBeInTheDocument(); expect(screen.getByText("Excepción geográfica autorizada")).toBeInTheDocument(); expect(screen.getByText(/No hay otro comandante habilitado/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cambiar comandante" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Cambiar aeronave" })).toBeNull();
  expect(screen.getByText(/use «Cambio de aeronave»/)).toBeInTheDocument();
});

test("con una asignación parcial indica qué falta", () => {
  setup({ resources: { aircraftId: null, commanderId: 3, commanderNombre: "Ana", commanderApellido: "Paz", commanderLicencia: "L", commanderProvinciaActual: "Tucumán" } });
  expect(screen.getByText("Reservado — falta la aeronave")).toBeInTheDocument();
  expect(screen.getByText("Pendiente")).toBeInTheDocument();
});

test("sin horario definitivo las acciones se bloquean y se explica la causa junto a la acción", () => {
  setup({ flight: flight({ salida: null }) });
  expect(screen.queryByRole("button", { name: "Seleccionar comandante" })).toBeNull();
  expect(screen.getAllByText("Primero debe fijarse el horario definitivo.")).toHaveLength(2);
});
