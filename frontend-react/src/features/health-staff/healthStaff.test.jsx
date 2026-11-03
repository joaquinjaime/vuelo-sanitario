import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { HealthStaffCatalog, FlightHealthStaff } from "./healthStaff";
vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn() }));

const person = (id, extra = {}) => ({ id, nombre: `Nombre${id}`, apellido: `Apellido${id}`, dni: `3000000${id}`, tipoProfesional: id % 2 ? "MEDICO" : "ENFERMERO", matricula: `M-${id}`, activo: true, version: 0, creadoEn: "2026-11-02T10:00:00", desactivadoEn: null, vuelosVigentes: 0, ...extra });
const failure = (message) => Object.assign(new Error(message), { status: 409 });
beforeEach(() => { vi.mocked(api).mockReset(); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test("el catálogo pide sólo los datos de identificación y no ofrece ni documentos, ni organismos, ni usuario o contraseña", async () => {
  vi.mocked(api).mockResolvedValue([]);
  render(<HealthStaffCatalog notify={vi.fn()} />);
  expect(await screen.findByText("Todavía no registró personal sanitario.")).toBeInTheDocument();
  for (const label of ["Tipo de profesional", "Nombre", "Apellido", "DNI", "Matrícula profesional"]) expect(screen.getByLabelText(label)).toBeInTheDocument();
  for (const forbidden of [/contraseña/i, /usuario/i, /organismo/i, /vencimiento/i, /emisión/i, /documento/i, /PDF/i, /jurisdicción de la matrícula/i, /categoría/i]) expect(screen.queryByLabelText(forbidden)).toBeNull();
  expect(screen.getByText(/no la verifica/)).toBeInTheDocument();
  expect(screen.getByText(/No necesitan usuario ni contraseña/)).toBeInTheDocument();
});

test("registra un médico y un enfermero y vuelve a leer el catálogo del servidor", async () => {
  let rows = [];
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path.startsWith("/health-staff") && opts?.method === "POST") { rows = [...rows, person(rows.length + 1)]; return Promise.resolve(rows.at(-1)); }
    return Promise.resolve(rows);
  });
  const notify = vi.fn();
  render(<HealthStaffCatalog notify={notify} />);
  await screen.findByText("Todavía no registró personal sanitario.");
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Juan" } }); fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "Pérez" } });
  fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "30111222" } }); fireEvent.change(screen.getByLabelText("Matrícula profesional"), { target: { value: "MP-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar profesional" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/health-staff", { method: "POST", body: JSON.stringify({ nombre: "Juan", apellido: "Pérez", dni: "30111222", matricula: "MP-1", tipoProfesional: "MEDICO" }) }));
  expect(await screen.findByRole("table", { name: "Personal sanitario registrado" })).toBeInTheDocument();
  expect(notify).toHaveBeenCalledWith("Profesional registrado");
  fireEvent.change(screen.getByLabelText("Tipo de profesional"), { target: { value: "ENFERMERO" } });
  expect(screen.getByLabelText("Tipo de profesional")).toHaveValue("ENFERMERO");
});

test("un error del servidor (identidad en conflicto) se muestra y no se presenta como éxito", async () => {
  vi.mocked(api).mockImplementation((path, opts) => opts?.method === "POST" ? Promise.reject(failure("No se pudo confirmar la identidad con los datos proporcionados")) : Promise.resolve([]));
  const notify = vi.fn();
  render(<HealthStaffCatalog notify={notify} />);
  await screen.findByText("Todavía no registró personal sanitario.");
  for (const [label, value] of [["Nombre", "A"], ["Apellido", "B"], ["DNI", "30111222"], ["Matrícula profesional", "X"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar profesional" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo confirmar la identidad"); expect(notify).not.toHaveBeenCalled();
});

test("edita con la versión del registro y desactiva con confirmación; el estado final lo da el servidor", async () => {
  let rows = [person(1)];
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path === "/health-staff/1" && opts?.method === "PUT") { rows = [person(1, { matricula: "NUEVA", version: 1 })]; return Promise.resolve(rows[0]); }
    if (path === "/health-staff/1/active" && opts?.method === "POST") { rows = [person(1, { activo: false, desactivadoEn: "2026-11-02T12:00:00", version: 2 })]; return Promise.resolve(rows[0]); }
    return Promise.resolve(rows);
  });
  render(<HealthStaffCatalog notify={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByLabelText("Matrícula profesional"), { target: { value: "NUEVA" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/health-staff/1", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"version":0') })));
  expect(await screen.findByText("NUEVA")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(api).toHaveBeenCalledWith("/health-staff/1/active", { method: "POST", body: JSON.stringify({ activo: false, version: 1 }) }));
  expect(await screen.findByText(/Desactivado el/)).toBeInTheDocument();
});

test("si se cancela la confirmación no se desactiva a nadie", async () => {
  vi.mocked(api).mockResolvedValue([person(1)]); window.confirm.mockReturnValue(false);
  render(<HealthStaffCatalog notify={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Desactivar" }));
  expect(vi.mocked(api).mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(false);
});

// ---------- Personal sanitario de un vuelo ----------
const assigned = (id, staffId, extra = {}) => ({ id, personalSanitarioId: staffId, nombre: `Nombre${staffId}`, apellido: `Apellido${staffId}`, tipoProfesional: staffId % 2 ? "MEDICO" : "ENFERMERO", matricula: `M-${staffId}`, vigente: true, asignadoEn: "2026-11-02T09:00:00", asignadoPor: "dts1", fechaBaja: null, bajaPor: null, motivoBaja: null, ...extra });
const candidate = (id, extra = {}) => ({ id, nombre: `Nombre${id}`, apellido: `Apellido${id}`, tipoProfesional: id % 2 ? "MEDICO" : "ENFERMERO", matricula: `M-${id}`, disponible: true, motivoNoDisponible: null, ...extra });

test("Operaciones y el comandante ven el personal asignado sin ninguna acción de modificación", async () => {
  vi.mocked(api).mockResolvedValue([assigned(1, 1), assigned(2, 2)]);
  render(<FlightHealthStaff flightId={9} mode="read" state="PLANIFICADO" msg={vi.fn()} />);
  expect(await screen.findByText(/Nombre1 Apellido1/)).toBeInTheDocument(); expect(screen.getByText(/Nombre2 Apellido2/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Retirar|Sustituir|Asignar/ })).toBeNull();
  expect(vi.mocked(api).mock.calls.every(([path]) => !path.includes("candidates"))).toBe(true);
});

test("el DTS asigna un profesional disponible a un vuelo con horario acordado y la lista se vuelve a leer", async () => {
  let rows = [];
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path === "/flights/9/health-staff" && opts?.method === "POST") { rows = [assigned(5, 3)]; return Promise.resolve(rows[0]); }
    if (path === "/flights/9/health-staff/candidates") return Promise.resolve([candidate(3), candidate(4, { disponible: false, motivoNoDisponible: "Participa en el vuelo V-8 en un horario que se superpone" })]);
    return Promise.resolve(rows);
  });
  const msg = vi.fn();
  render(<FlightHealthStaff flightId={9} mode="dts" state="APROBADO" msg={msg} />);
  expect(await screen.findByText("Todavía no asignó personal sanitario a este vuelo.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Profesional")).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Agregar profesional" }));
  await screen.findByRole("option", { name: /Apellido3, Nombre3/ });
  expect(screen.getByText(/No disponibles en este horario \(1\)/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Profesional"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar al vuelo" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights/9/health-staff", { method: "POST", body: JSON.stringify({ personalSanitarioId: 3 }) }));
  expect(await screen.findByText(/Nombre3 Apellido3/)).toBeInTheDocument(); expect(msg).toHaveBeenCalledWith("Profesional asignado al vuelo");
});

test("un rechazo del servidor (duplicado o vuelo bloqueado) se muestra sin falso éxito y se vuelve a consultar", async () => {
  vi.mocked(api).mockImplementation((path, opts) => {
    if (opts?.method === "POST") return Promise.reject(failure("El profesional ya integra la tripulación sanitaria del vuelo"));
    if (path.endsWith("/candidates")) return Promise.resolve([candidate(3)]);
    return Promise.resolve([]);
  });
  const msg = vi.fn();
  render(<FlightHealthStaff flightId={9} mode="dts" state="PLANIFICADO" msg={msg} />);
  fireEvent.click(await screen.findByRole("button", { name: "Agregar profesional" }));
  await screen.findByRole("option", { name: /Apellido3/ });
  fireEvent.change(screen.getByLabelText("Profesional"), { target: { value: "3" } }); fireEvent.click(screen.getByRole("button", { name: "Asignar al vuelo" }));
  expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("ya integra"); expect(msg).not.toHaveBeenCalledWith("Profesional asignado al vuelo");
});

test("retirar pide confirmación, sustituir usa PUT y el historial muestra quién y cuándo", async () => {
  let rows = [assigned(5, 3)], history = [assigned(5, 3), assigned(4, 1, { vigente: false, motivoBaja: "RETIRO", bajaPor: "dts1", fechaBaja: "2026-11-02T11:00:00" })];
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path === "/flights/9/health-staff/5" && opts?.method === "DELETE") { rows = []; return Promise.resolve(null); }
    if (path === "/flights/9/health-staff/5" && opts?.method === "PUT") { rows = [assigned(6, 5)]; return Promise.resolve(rows[0]); }
    if (path.endsWith("/candidates")) return Promise.resolve([candidate(5)]);
    if (path.endsWith("?history=true")) return Promise.resolve(history);
    return Promise.resolve(rows);
  });
  render(<FlightHealthStaff flightId={9} mode="dts" state="PLANIFICADO" msg={vi.fn()} />);
  await screen.findByText(/Nombre3 Apellido3/);
  fireEvent.click(screen.getByRole("button", { name: "Ver historial del personal sanitario" }));
  expect(await screen.findByText(/retirado por dts1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sustituir" }));
  await screen.findByText("Seleccione el profesional que lo sustituirá.");
  await screen.findByLabelText("Profesional");
  fireEvent.change(screen.getByLabelText("Profesional"), { target: { value: "5" } }); fireEvent.click(screen.getByRole("button", { name: "Confirmar sustitución" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights/9/health-staff/5", { method: "PUT", body: JSON.stringify({ personalSanitarioId: 5 }) }));
  window.confirm.mockReturnValue(false); fireEvent.click(await screen.findByRole("button", { name: "Retirar" }));
  expect(vi.mocked(api).mock.calls.some(([, opts]) => opts?.method === "DELETE")).toBe(false);
});

test("antes de acordar el horario o con el vuelo iniciado el DTS no puede modificar el personal", async () => {
  vi.mocked(api).mockResolvedValue([assigned(5, 3)]);
  const view = render(<FlightHealthStaff flightId={9} mode="dts" state="EN_CURSO" msg={vi.fn()} />);
  await screen.findByText(/Nombre3 Apellido3/);
  expect(screen.queryByRole("button", { name: /Retirar|Sustituir|Asignar/ })).toBeNull(); expect(screen.getByText(/hasta que el vuelo inicia/)).toBeInTheDocument();
  view.unmount();
});
