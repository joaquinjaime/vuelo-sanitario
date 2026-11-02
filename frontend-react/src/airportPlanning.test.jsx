import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { AirportPlanning, CommanderAirportPlanning } from "./airportPlanning";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const sanitary = { localidadOrigenSolicitada: { id: 10, nombre: "Yerba Buena", provincia: "Tucumán", provinciaId: 1 }, localidadDestinoSolicitada: { id: 20, nombre: "Villa Carlos Paz", provincia: "Córdoba", provinciaId: 2 } };
const flight = (extra = {}) => ({ id: 7, estado: "APROBADO", salida: "2026-11-10T10:00:00", llegada: null, datosSanitarios: sanitary, origen: sanitary.localidadOrigenSolicitada, destino: sanitary.localidadDestinoSolicitada, ...extra });
const slot = (extra = {}) => ({ aeropuertoId: null, aeropuerto: null, codigoOaci: null, provinciaId: null, provincia: null, estado: "PENDIENTE", ...extra });
const plan = (extra = {}) => ({ salida: slot(), llegada: slot(), fijadoPor: null, fijadoEn: null, elegibilidadPreliminar: true, advertenciaElegibilidad: null, pendientes: ["Aeropuerto de salida sin definir", "Aeropuerto de llegada sin definir"], ...extra });
const airport = (id, nombre, provincia, extra = {}) => ({ id, nombre, codigoOaci: `SA${id}`, codigoIata: null, tipo: "AEROPUERTO", ciudad: provincia, provinciaId: provincia === "Tucumán" ? 1 : 2, provincia, distanciaRectaKm: 12.5, mismaProvinciaQueElPaciente: provincia === "Tucumán", aeronaveAsignadaAqui: false, comandanteEnJurisdiccion: null, seleccionActual: false, estadoSeleccion: null, ...extra });
const candidates = (extra = {}) => ({ tipo: "SALIDA", localidadPaciente: { id: 10, nombre: "Yerba Buena", provincia: "Tucumán", provinciaId: 1 }, coordenadasPaciente: true, enProvinciaDelPaciente: [airport(1, "Teniente Benjamín Matienzo", "Tucumán")], enOtrasJurisdicciones: [airport(2, "Martín Miguel de Güemes", "Salta")], otrasJurisdiccionesIncompletas: false, aviso: "La distancia es una aproximación en línea recta: no equivale a tiempo de traslado por tierra.", mensaje: null, ...extra });
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);

test("distingue las localidades del paciente de los aeropuertos y muestra el estado de cada selección y lo pendiente", () => {
  render(<AirportPlanning flight={flight()} plan={plan({ salida: slot({ aeropuertoId: 1, aeropuerto: "Teniente Benjamín Matienzo", codigoOaci: "SANT", provincia: "Tucumán", estado: "PROPUESTO" }), pendientes: ["Aeropuerto de salida propuesto: falta la confirmación del comandante", "Aeropuerto de llegada sin definir"], advertenciaElegibilidad: "El aeropuerto de salida (Teniente Benjamín Matienzo, Tucumán) está propuesto pero no confirmado: los candidatos son preliminares" })} msg={vi.fn()} onChanged={vi.fn()} editable/>);
  expect(screen.getByText("Origen del paciente (solicitud de DTS)")).toBeInTheDocument();
  expect(screen.getByText("Yerba Buena, Tucumán")).toBeInTheDocument();
  expect(screen.getByText("Villa Carlos Paz, Córdoba")).toBeInTheDocument();
  expect(screen.getByText("Teniente Benjamín Matienzo")).toBeInTheDocument();
  expect(screen.getByText("Propuesto")).toBeInTheDocument(); expect(screen.getByText("Pendiente")).toBeInTheDocument();
  expect(screen.getByText("Aeropuerto de llegada sin definir")).toBeInTheDocument();
  expect(screen.getByText(/están propuestos|preliminares/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cambiar aeropuerto de salida" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Proponer aeropuerto de llegada" })).toBeEnabled();
});

test("no ofrece proponer aeropuertos cuando el vuelo ya no los admite", () => {
  render(<AirportPlanning flight={flight({ estado: "EN_CURSO" })} plan={plan()} msg={vi.fn()} onChanged={vi.fn()} editable={false}/>);
  expect(screen.queryByRole("button", { name: /Proponer aeropuerto/ })).toBeNull();
});

test("propone un aeropuerto de la provincia del paciente sin justificación y avisa que queda pendiente del comandante", async () => {
  vi.mocked(api).mockImplementation((path, options) => options?.method === "PUT" ? Promise.resolve({}) : Promise.resolve(candidates()));
  const msg = vi.fn(), onChanged = vi.fn(async () => {});
  render(<AirportPlanning flight={flight()} plan={plan()} msg={msg} onChanged={onChanged} editable/>);
  fireEvent.click(screen.getByRole("button", { name: "Proponer aeropuerto de salida" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Teniente Benjamín Matienzo/ }));
  expect(screen.getByText(/no el aeropuerto/)).toBeInTheDocument();
  expect(screen.getAllByText(/12,5 km en línea recta/).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText(/Justificación operativa/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Proponer aeropuerto de salida" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const put = vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(put[0]).toBe("/flights/7/airports");
  expect(JSON.parse(put[1].body)).toEqual({ origenId: 1, destinoId: null, justificacion: null, nuevoComandanteId: null, excepcionGeografica: null });
  expect(msg).toHaveBeenCalledWith(expect.stringContaining("pendiente de confirmación del comandante"));
});

test("un aeropuerto de otra provincia no se permite sin una justificación operativa", async () => {
  vi.mocked(api).mockImplementation((path, options) => options?.method === "PUT" ? Promise.resolve({}) : Promise.resolve(candidates()));
  const onChanged = vi.fn(async () => {});
  render(<AirportPlanning flight={flight()} plan={plan()} msg={vi.fn()} onChanged={onChanged} editable/>);
  fireEvent.click(screen.getByRole("button", { name: "Proponer aeropuerto de salida" }));
  fireEvent.click(await screen.findByText(/Otras provincias o jurisdicciones/));
  fireEvent.click(await screen.findByRole("radio", { name: /Güemes/ }));
  const submit = screen.getAllByRole("button", { name: "Proponer aeropuerto de salida" }).at(-1);
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificación operativa/), { target: { value: "corta" } });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificación operativa/), { target: { value: "Mejor conexión terrestre y clima" } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(JSON.parse(vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT")[1].body)).toMatchObject({ origenId: 2, justificacion: "Mejor conexión terrestre y clima" });
});

test("si el comandante asignado queda en otra jurisdicción exige reemplazarlo o autorizar una excepción, y no deja confirmar sin elegir", async () => {
  vi.mocked(api).mockImplementation((path, options) => {
    if (options?.method === "PUT") return Promise.resolve({});
    if (path.startsWith("/flights/7/commander-candidates")) return Promise.resolve({ ordinarios: [{ id: 33, nombre: "Luis", apellido: "Salteño", licencia: "L-33" }], puedeAutorizarExcepcion: true, mensaje: null });
    return Promise.resolve(candidates({ enProvinciaDelPaciente: [airport(1, "Matienzo", "Tucumán", { comandanteEnJurisdiccion: true })], enOtrasJurisdicciones: [airport(2, "Güemes", "Salta", { comandanteEnJurisdiccion: false })] }));
  });
  const onChanged = vi.fn(async () => {});
  render(<AirportPlanning flight={flight({ estado: "PLANIFICADO" })} plan={plan()} msg={vi.fn()} onChanged={onChanged} editable/>);
  fireEvent.click(screen.getByRole("button", { name: "Proponer aeropuerto de salida" }));
  fireEvent.click(await screen.findByText(/Otras provincias o jurisdicciones/));
  fireEvent.click(await screen.findByRole("radio", { name: /Güemes/ }));
  fireEvent.change(await screen.findByLabelText(/Justificación operativa/), { target: { value: "Mejor conexión terrestre y clima" } });
  expect(await screen.findByText(/volver a verificar la elegibilidad del comandante/)).toBeInTheDocument();
  expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/7/commander-candidates?q=&aeropuertoSalidaId=2");
  const submit = screen.getAllByRole("button", { name: "Proponer aeropuerto de salida" }).at(-1);
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: /Reemplazar por otro comandante/ }));
  fireEvent.change(await screen.findByLabelText("Comandante de reemplazo"), { target: { value: "33" } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(JSON.parse(vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT")[1].body)).toMatchObject({ origenId: 2, nuevoComandanteId: 33, excepcionGeografica: null });
});

test("un rechazo del servidor (aeropuerto sin provincia conocida) se muestra y no informa éxito", async () => {
  vi.mocked(api).mockImplementation((path, options) => options?.method === "PUT"
    ? Promise.reject(Object.assign(new Error("No se pudo determinar la provincia del aeropuerto de salida (X): no puede confirmarse"), { status: 409, code: "AIRPORT_PROVINCE_UNKNOWN" }))
    : Promise.resolve(candidates()));
  const msg = vi.fn(), onChanged = vi.fn();
  render(<AirportPlanning flight={flight()} plan={plan()} msg={msg} onChanged={onChanged} editable/>);
  fireEvent.click(screen.getByRole("button", { name: "Proponer aeropuerto de salida" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Matienzo/ }));
  fireEvent.click(screen.getAllByRole("button", { name: "Proponer aeropuerto de salida" }).at(-1));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo determinar la provincia del aeropuerto de salida");
  expect(onChanged).not.toHaveBeenCalled(); expect(msg).toHaveBeenCalledWith(expect.stringContaining("No se pudo determinar"), true);
});

test("sin aeropuertos adecuados lo informa en lugar de mostrar una lista vacía", async () => {
  vi.mocked(api).mockResolvedValue(candidates({ enProvinciaDelPaciente: [], enOtrasJurisdicciones: [], mensaje: "No existen aeropuertos operativamente adecuados entre los candidatos disponibles; busque por nombre o código para ver aeropuertos de otras provincias." }));
  render(<AirportPlanning flight={flight()} plan={plan()} msg={vi.fn()} onChanged={vi.fn()} editable/>);
  fireEvent.click(screen.getByRole("button", { name: "Proponer aeropuerto de salida" }));
  expect(await screen.findByText(/No existen aeropuertos operativamente adecuados/)).toBeInTheDocument();
});

test("el comandante ve lo propuesto por Centro de Operaciones, lo confirma y la justificación se exige sólo cuando el servidor la pide", async () => {
  let attempts = 0;
  vi.mocked(api).mockImplementation((path, options) => {
    if (options?.method === "POST") { attempts++; return attempts === 1 ? Promise.reject(Object.assign(new Error("El aeropuerto elegido está en una provincia distinta"), { status: 400, code: "AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED" })) : Promise.resolve({}); }
    return Promise.resolve(candidates());
  });
  const msg = vi.fn(), onSaved = vi.fn(async () => {});
  const proposed = plan({ salida: slot({ aeropuertoId: 1, aeropuerto: "Matienzo", provincia: "Tucumán", estado: "PROPUESTO" }), llegada: slot({ aeropuertoId: 2, aeropuerto: "Güemes", provincia: "Salta", estado: "PROPUESTO" }), pendientes: [] });
  render(<CommanderAirportPlanning flight={flight({ estado: "PLANIFICADO", llegada: "2026-11-10T13:00:00" })} plan={proposed} msg={msg} onSaved={onSaved}/>);
  expect(screen.getByText(/Centro de Operaciones propuso estos aeropuertos/)).toBeInTheDocument();
  expect(screen.getAllByText("Propuesto por Centro de Operaciones")).toHaveLength(2);
  const save = screen.getByRole("button", { name: "Confirmar aeropuertos y guardar planificación" });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent("provincia distinta");
  expect(onSaved).not.toHaveBeenCalled();
  const reason = await screen.findByLabelText(/Justificación operativa/);
  expect(screen.getByRole("button", { name: "Confirmar aeropuertos y guardar planificación" })).toBeDisabled();
  fireEvent.change(reason, { target: { value: "Mejor conexión terrestre y clima" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar aeropuertos y guardar planificación" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const calls = vi.mocked(api).mock.calls.filter(([, o]) => o?.method === "POST");
  expect(calls[1][0]).toBe("/flights/7/operational-planning");
  expect(JSON.parse(calls[1][1].body)).toEqual({ origenId: 1, destinoId: 2, llegada: "2026-11-10T13:00", justificacion: "Mejor conexión terrestre y clima" });
});

test("el rechazo por jurisdicción del comandante se muestra tal cual, sin guardar", async () => {
  vi.mocked(api).mockImplementation((path, options) => options?.method === "POST"
    ? Promise.reject(Object.assign(new Error("La modificación del aeropuerto requiere volver a verificar la elegibilidad del comandante: solicite a Centro de Operaciones que lo reasigne"), { status: 409, code: "COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION" }))
    : Promise.resolve(candidates()));
  const onSaved = vi.fn();
  const current = plan({ salida: slot({ aeropuertoId: 1, aeropuerto: "Matienzo", provincia: "Tucumán", estado: "CONFIRMADO" }), llegada: slot({ aeropuertoId: 2, aeropuerto: "Güemes", provincia: "Salta", estado: "CONFIRMADO" }), pendientes: [] });
  render(<CommanderAirportPlanning flight={flight({ estado: "PLANIFICADO", llegada: "2026-11-10T13:00:00" })} plan={current} msg={vi.fn()} onSaved={onSaved}/>);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar aeropuertos y guardar planificación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("volver a verificar la elegibilidad del comandante");
  expect(onSaved).not.toHaveBeenCalled();
});
