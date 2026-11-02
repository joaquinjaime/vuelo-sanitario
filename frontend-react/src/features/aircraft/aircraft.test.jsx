import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { FlightAircraft } from "./aircraft";
import { FlightCrew } from "../flights/components/FlightCrew";
vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const plane = (extra = {}) => ({ id: 1, matricula: "LV-AAA", modelo: "King Air", tipo: "Turbohélice", capacidadPacientes: 1, capacidadTripulacion: 4, equipamientoMedico: "Camilla", activo: true, aeropuertoActualId: 10, aeropuertoActual: "Tucumán", fechaCreacion: "2026-10-01T10:00:00", estadoOperativo: "SIN_ASIGNACIONES", enVuelo: false, vuelosComprometidos: 0, proximoVuelo: null, ...extra });
const airports = [{ id: 10, nombre: "Tucumán", codigoIata: "TUC" }, { id: 11, nombre: "Aeroparque", codigoIata: "AEP" }];
const failure = (message, extra = {}) => Object.assign(new Error(message), extra);
beforeEach(() => { vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);
const base = (path) => path.startsWith("/catalogs/airports") ? Promise.resolve(airports) : undefined;

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
test("la asignación del copiloto lista a quienes no están disponibles con el vuelo en conflicto y un conflicto 409 se muestra sin falso éxito", async () => {
  const msg = vi.fn(); let attempts = 0;
  const candidate = (id, extra = {}) => ({ id, username: "u" + id, nombre: "Pablo" + id, apellido: "Cmd", licencia: "L" + id, provinciaId: 1, provincia: "Tucumán", elegibilidad: "ORDINARIA", ...extra });
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path.startsWith("/flights/7/commander-candidates")) return Promise.resolve({ salida: { provincia: "Tucumán", preliminar: false }, ordinarios: [candidate(13)], noElegiblesEnJurisdiccion: [candidate(14, { elegibilidad: "NO_ELEGIBLE", motivoOperativo: "Tiene el vuelo V-9 comprometido en un horario incompatible" })], excepcionales: [], puedeAutorizarExcepcion: false });
    if (path === "/flights/7/crew" && opts?.method === "POST") { attempts++; return Promise.reject(failure("Tiene el vuelo V-9 comprometido en un horario incompatible")); }
    return Promise.resolve(path === "/flights/7/crew" ? crewRows : []);
  });
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage copilot msg={msg} />);
  await screen.findByText(/Luis Médico/); fireEvent.click(await screen.findByRole("button", { name: "Seleccionar copiloto" }));
  expect(await screen.findByText(/Cmd, Pablo13/)).toBeInTheDocument(); expect(screen.getByText(/Cmd, Pablo14/)).toBeInTheDocument(); expect(screen.getByText(/Tiene el vuelo V-9 comprometido/)).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: /Pablo14/ })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: /Pablo13/ }));
  const confirm = screen.getByRole("button", { name: "Confirmar copiloto" }); fireEvent.click(confirm); fireEvent.click(confirm);
  expect(await screen.findByRole("alert")).toHaveTextContent("V-9"); expect(attempts).toBe(1);
});
test("sin comandantes disponibles como copiloto se informa el estado vacío y el rol de médico o enfermero no se ofrece como tripulación", async () => {
  vi.mocked(api).mockImplementation((path) => {
    if (path.startsWith("/flights/7/commander-candidates")) return Promise.resolve({ salida: { provincia: "Tucumán", preliminar: false }, ordinarios: [], noElegiblesEnJurisdiccion: [], excepcionales: [], puedeAutorizarExcepcion: false, mensaje: "No se encontraron comandantes disponibles en Tucumán, jurisdicción del aeropuerto de salida." });
    return Promise.resolve(crewRows);
  });
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage copilot msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Seleccionar copiloto" }));
  expect(await screen.findByText(/No se encontraron comandantes disponibles en Tucumán/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Función de tripulación")).toBeNull(); expect(screen.getByRole("button", { name: "Confirmar copiloto" })).toBeDisabled();
});
test("Operaciones ve la revocación y el estado actualizado después de regularizar", async () => {
  let revoked=true;
  vi.mocked(api).mockImplementation(path=>Promise.resolve(path==="/flights/7/crew"?crewRows.map(r=>r.userId===11?{...r,elegibilidadCodigo:revoked?"HABILITACION_REVOCADA":"ELEGIBLE",elegibilidadMotivo:revoked?"La verificación fue revocada":"Vigente"}:r):[]));
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()}/>);
  expect(await screen.findByText(/Requiere revisión: La verificación fue revocada/)).toBeInTheDocument();
  revoked=false;fireEvent.click(screen.getByRole("button",{name:"Actualizar elegibilidad"}));
  expect(await screen.findByText(/Apto/)).toBeInTheDocument();
 });
test("un vuelo iniciado o finalizado no ofrece modificar la tripulación", async () => {
  vi.mocked(api).mockResolvedValue(crewRows);
  render(<FlightCrew flightId={7} state="EN_CURSO" canManage msg={vi.fn()} />);
  await screen.findByText(/Luis Médico/); expect(screen.queryByRole("button", { name: "Retirar" })).toBeNull(); expect(screen.queryByLabelText("Función de tripulación")).toBeNull();
});
