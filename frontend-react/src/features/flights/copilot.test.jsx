import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { ResourceAssignment, CopilotCard } from "./resourceAssignment";
vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn() }));

const flight = (extra = {}) => ({ id: 7, estado: "PLANIFICADO", salida: "2026-11-10T10:00:00", ...extra });
const cand = (id, extra = {}) => ({ id, username: `cmd${id}`, nombre: `Nombre${id}`, apellido: `Apellido${id}`, licencia: `LIC-${id}`, provinciaId: 1, provincia: "Tucumán", ubicacionPrevistaTrasVuelo: null, elegibilidad: "ORDINARIA", codigoUbicacion: "MISMA_JURISDICCION", motivoUbicacion: "", ...extra });
const list = (extra = {}) => ({ salida: { provinciaId: 1, provincia: "Córdoba", aeropuertoId: 5, aeropuerto: "Taravella", fuente: "AEROPUERTO_CONFIRMADO", preliminar: false }, comandanteAsignadoId: 1, ordinarios: [], noElegiblesEnJurisdiccion: [], excepcionales: [], excepcionalesIncompletos: false, fueraDeJurisdiccion: {}, puedeAutorizarExcepcion: false, mensaje: null, advertencia: null, ...extra });
const crew = [{ id: 1, userId: 10, nombre: "Ana", apellido: "Piloto", username: "ana", crewRoleCode: "COMANDANTE", vigente: true }];
beforeEach(() => { vi.mocked(api).mockReset(); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test("el panel de recursos tiene dos selecciones diferenciadas: el comandante y el copiloto (opcional)", async () => {
  vi.mocked(api).mockResolvedValue(crew);
  render(<ResourceAssignment flight={flight()} resources={{ aircraftId: null, commanderId: null }} msg={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Comandante" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: /Copiloto/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Seleccionar comandante" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Seleccionar copiloto" })).toBeInTheDocument();
  expect(screen.getAllByText(/opcional/).length).toBeGreaterThan(0);
});

test("el copiloto se elige con la lista de comandantes de la función COPILOTO, muestra la ubicación prevista y se asigna con POST", async () => {
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path.startsWith("/flights/7/commander-candidates")) return Promise.resolve(list({ ordinarios: [cand(2, { provincia: "Córdoba", ubicacionPrevistaTrasVuelo: "V-100" })] }));
    if (opts?.method === "POST") return Promise.resolve(null);
    return Promise.resolve(crew);
  });
  const onChanged = vi.fn(async () => {}), msg = vi.fn();
  render(<CopilotCard flight={flight()} msg={msg} onChanged={onChanged} editable />);
  fireEvent.click(await screen.findByRole("button", { name: "Seleccionar copiloto" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining("/flights/7/commander-candidates?funcion=COPILOTO")));
  expect(await screen.findByText(/estará allí tras el vuelo V-100/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /Apellido2, Nombre2/ })); fireEvent.click(screen.getByRole("button", { name: "Confirmar copiloto" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights/7/crew", { method: "POST", body: JSON.stringify({ userId: 2, crewRoleCode: "COPILOTO", excepcionGeografica: null }) }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled()); expect(msg).toHaveBeenCalledWith("Copiloto asignado");
});

test("fuera de la jurisdicción sólo Centro de Operaciones puede elegir al copiloto y debe justificarlo (15 caracteres como mínimo)", async () => {
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path.startsWith("/flights/7/commander-candidates")) return Promise.resolve(list({ excepcionales: [cand(3, { provincia: "Salta", elegibilidad: "EXCEPCION", codigoUbicacion: "OTRA_PROVINCIA", motivoUbicacion: "Se encuentra en Salta y el vuelo sale de Córdoba" })], puedeAutorizarExcepcion: true }));
    if (opts?.method === "POST") return Promise.resolve(null);
    return Promise.resolve(crew);
  });
  render(<CopilotCard flight={flight()} msg={vi.fn()} onChanged={vi.fn(async () => {})} editable />);
  fireEvent.click(await screen.findByRole("button", { name: "Seleccionar copiloto" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Apellido3, Nombre3/ }));
  const confirm = screen.getByRole("button", { name: "Confirmar copiloto excepcional" }); expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificación de la excepción geográfica/), { target: { value: "Sin otro copiloto en la provincia" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar copiloto excepcional" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights/7/crew", { method: "POST", body: JSON.stringify({ userId: 3, crewRoleCode: "COPILOTO", excepcionGeografica: { motivo: "Sin otro copiloto en la provincia" } }) }));
});

test("con copiloto asignado se puede cambiar (PUT) o retirar (DELETE, con confirmación) y el estado sale del servidor", async () => {
  let current = [...crew, { id: 2, userId: 11, nombre: "Luis", apellido: "Gómez", username: "luis", crewRoleCode: "COPILOTO", vigente: true }];
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path === "/flights/7/crew/2" && opts?.method === "DELETE") { current = crew; return Promise.resolve(null); }
    return Promise.resolve(current);
  });
  const msg = vi.fn();
  render(<CopilotCard flight={flight()} msg={msg} onChanged={vi.fn(async () => {})} editable />);
  expect(await screen.findByText("Luis Gómez")).toBeInTheDocument(); expect(screen.getByText(/rol COMANDANTE/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cambiar copiloto" })).toBeInTheDocument();
  window.confirm.mockReturnValueOnce(false); fireEvent.click(screen.getByRole("button", { name: "Retirar copiloto" }));
  expect(api).not.toHaveBeenCalledWith("/flights/7/crew/2", { method: "DELETE" });
  fireEvent.click(screen.getByRole("button", { name: "Retirar copiloto" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights/7/crew/2", { method: "DELETE" }));
  expect(await screen.findByText("Sin copiloto")).toBeInTheDocument(); expect(msg).toHaveBeenCalledWith("Copiloto retirado");
});

test("un rechazo del servidor al asignar se muestra como error y no como éxito", async () => {
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path.startsWith("/flights/7/commander-candidates")) return Promise.resolve(list({ ordinarios: [cand(2)] }));
    if (opts?.method === "POST") return Promise.reject(Object.assign(new Error("Tiene el vuelo V-9 comprometido en un horario incompatible"), { status: 409 }));
    return Promise.resolve(crew);
  });
  const msg = vi.fn();
  render(<CopilotCard flight={flight()} msg={msg} onChanged={vi.fn(async () => {})} editable />);
  fireEvent.click(await screen.findByRole("button", { name: "Seleccionar copiloto" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Apellido2/ })); fireEvent.click(screen.getByRole("button", { name: "Confirmar copiloto" }));
  expect(await screen.findByText(/V-9 comprometido/, { selector: "p.error" })).toBeInTheDocument();
  expect(msg).toHaveBeenCalledWith(expect.stringContaining("V-9"), true); expect(msg).not.toHaveBeenCalledWith("Copiloto asignado");
});

test("con el vuelo sin horario o fuera de etapa la tarjeta explica el bloqueo en lugar de ofrecer la acción", async () => {
  vi.mocked(api).mockResolvedValue(crew);
  render(<CopilotCard flight={flight({ salida: null })} msg={vi.fn()} editable={false} blockedReason="Primero debe fijarse el horario definitivo." />);
  expect(await screen.findByText("Primero debe fijarse el horario definitivo.")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Seleccionar copiloto" })).toBeNull();
});
