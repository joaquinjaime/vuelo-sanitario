import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { PatientSearch, PatientMaintenance, dniProblem } from "./patients";

vi.mock("./api", () => ({ api: vi.fn() }));
beforeEach(() => vi.mocked(api).mockReset());

test("search is deliberate, paginated, and selects only a patient id", async () => {
 const select = vi.fn();
 vi.mocked(api).mockImplementation(path => String(path).includes("page=0") ? Promise.resolve({ items: [{ id: 7, nombre: "Ana", apellido: "Paz", dniTerminacion: "••••1234", anioNacimiento: 1980 }], page: 0, hasNext: true }) : Promise.resolve({ items: [{ id: 8, nombre: "Ana", apellido: "Pérez", dniTerminacion: "••••4321" }], page: 1, hasNext: false }));
 render(<PatientSearch onSelect={select} />);
 expect(api).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
 fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "P" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 expect(screen.getByRole("alert")).toHaveTextContent("mínimo dos letras");
 expect(api).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "Pa" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 expect(await screen.findByText(/DNI ••••1234/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
 expect(await screen.findByText(/DNI ••••4321/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
 expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }));
 expect(vi.mocked(api).mock.calls.every(([path]) => path.startsWith("/patients/search?"))).toBe(true);
});

test("administrator correction preserves the version and displays audit history", async () => {
 vi.mocked(api).mockImplementation((path, options) => {
  if (String(path).startsWith("/patients/search")) return Promise.resolve({ items: [{ id: 9, nombre: "Ana", apellido: "Paz", dniTerminacion: "••••1234" }], page: 0, hasNext: false });
  if (path === "/patients/9") return Promise.resolve({ id: 9, nombre: "Ana", apellido: "Paz", dni: "30111234", fechaNacimiento: "1980-01-01", version: 2 });
  if (path === "/patients/9/corrections?page=0&size=10") return Promise.resolve({ items: [{ id: 1, responsable: "admin", fecha: "2026-10-23T12:00:00Z", motivo: "Documento cotejado", cambios: [{ campo: "nombre", anterior: "Anita", nuevo: "Ana" }] }] });
  if (path === "/patients/9/identity" && options?.method === "PUT") return Promise.resolve({ id: 9, nombre: "Anabella", apellido: "Paz", dni: "30111234", fechaNacimiento: "1980-01-01", version: 3 });
  if (path === undefined) return Promise.resolve(); // Vitest probes mocks during cleanup.
  throw new Error(path);
 });
 render(<PatientMaintenance />);
 expect(api).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText("DNI exacto"), { target: { value: "30111234" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 fireEvent.click(await screen.findByRole("button", { name: "Revisar ficha" }));
 expect(await screen.findByText("DNI: 30111234")).toBeInTheDocument();
 expect(screen.getByText(/Documento cotejado/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Nombre corregido"), { target: { value: "Anabella" } });
 fireEvent.change(screen.getByLabelText("Motivo de la corrección"), { target: { value: "Documento cotejado nuevamente" } });
 fireEvent.submit(screen.getByRole("button", { name: "Guardar corrección" }).closest("form"));
 await waitFor(() => expect(api).toHaveBeenCalledWith("/patients/9/identity", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"version":2') })));
 expect(JSON.parse(vi.mocked(api).mock.calls.find(([path]) => path === "/patients/9/identity")[1].body)).not.toHaveProperty("dni");
});

test("a later query supersedes an unfinished result and clears the selection", async () => {
 let release;
 const pending = new Promise(resolve => { release = resolve; });
 vi.mocked(api).mockImplementation(path => String(path).includes('dni=30111234') ? pending : Promise.resolve({ items: [], page: 0, hasNext: false }));
 const reset = vi.fn();
 render(<PatientSearch onSelect={vi.fn()} onReset={reset} />);
 fireEvent.change(screen.getByLabelText("DNI exacto"), { target: { value: "30111234" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 expect(screen.getByRole("status")).toHaveTextContent("Buscando pacientes");
 fireEvent.change(screen.getByLabelText("DNI exacto"), { target: { value: "40111234" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 expect(await screen.findByText("No se encontraron pacientes con esos datos.")).toBeInTheDocument();
 release({ items: [{ id: 99, nombre: "Obsoleto", apellido: "Paz" }], page: 0, hasNext: false });
 await waitFor(() => expect(screen.queryByText(/Obsoleto/)).not.toBeInTheDocument());
 expect(reset).toHaveBeenCalled();
});

test("search errors are shown without selecting a patient", async () => {
 vi.mocked(api).mockImplementation(path => path === undefined ? Promise.resolve() : Promise.reject(new Error("Servicio no disponible")));
 const select = vi.fn();
 render(<PatientSearch onSelect={select} />);
 fireEvent.change(screen.getByLabelText("DNI exacto"), { target: { value: "30111234" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible");
 expect(select).not.toHaveBeenCalled();
});

test("a correction conflict keeps the entered values for review", async () => {
 vi.mocked(api).mockImplementation((path) => {
  if (path === undefined) return Promise.resolve();
  if (path.startsWith('/patients/search')) return Promise.resolve({ items: [{ id: 11, nombre: 'Ana', apellido: 'Paz', dniTerminacion: '••••1234' }], page: 0, hasNext: false });
  if (path === '/patients/11') return Promise.resolve({ id: 11, nombre: 'Ana', apellido: 'Paz', dni: '30111234', fechaNacimiento: null, version: 4 });
  if (path.includes('/corrections')) return Promise.resolve({ items: [] });
  if (path === '/patients/11/identity') return Promise.reject(new Error('La identidad cambió; vuelva a cargar la ficha'));
  throw new Error(path);
 });
 render(<PatientMaintenance />);
 fireEvent.change(screen.getByLabelText('DNI exacto'), { target: { value: '30111234' } });
 fireEvent.click(screen.getByRole('button', { name: 'Buscar paciente' }));
 fireEvent.click(await screen.findByRole('button', { name: 'Revisar ficha' }));
 await screen.findByText('DNI: 30111234');
 fireEvent.change(screen.getByLabelText('Nombre corregido'), { target: { value: 'Anabela' } });
 fireEvent.change(screen.getByLabelText('Motivo de la corrección'), { target: { value: 'Documento cotejado nuevamente' } });
 fireEvent.submit(screen.getByRole('button', { name: 'Guardar corrección' }).closest('form'));
 expect(await screen.findByRole('alert')).toHaveTextContent('vuelva a cargar la ficha');
 expect(screen.getByLabelText('Nombre corregido')).toHaveValue('Anabela');
});


// ---- Rectificación controlada del DNI ----
const fichaMock = (detail, rectify) => vi.mocked(api).mockImplementation((path, options) => {
 if (String(path).startsWith("/patients/search")) return Promise.resolve({ items: [{ id: 9, nombre: "Ana", apellido: "Paz", dniTerminacion: "••••1234" }], page: 0, hasNext: false });
 if (path === "/patients/9") return Promise.resolve(detail);
 if (path === "/patients/9/corrections?page=0&size=10") return Promise.resolve({ items: [] });
 if (path === "/patients/9/dni" && options?.method === "PUT") return rectify(options);
 if (path === undefined) return Promise.resolve();
 throw new Error(String(path));
});
const baseDetail = { id: 9, nombre: "Ana", apellido: "Paz", dni: "30111234", fechaNacimiento: "1980-01-01", version: 4, cuentaEstado: null };
const openFicha = async () => {
 render(<PatientMaintenance notify={vi.fn()} />);
 fireEvent.change(screen.getByLabelText("DNI exacto"), { target: { value: "30111234" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 fireEvent.click(await screen.findByRole("button", { name: "Revisar ficha" }));
 await screen.findByRole("button", { name: /Rectificar DNI|Asignar DNI/ });
};
const fillDni = (value = "30.111.999", reason = "Error de digitación al cargar la solicitud") => {
 fireEvent.change(screen.getByLabelText("DNI nuevo"), { target: { value } });
 fireEvent.change(screen.getByLabelText("Motivo de la rectificación"), { target: { value: reason } });
};
const cotejo = () => fireEvent.click(screen.getByLabelText(/Declaro que cotejé la identidad/));
const submitDni = () => fireEvent.submit(screen.getByRole("button", { name: "Confirmar rectificación" }).closest("form"));

test("the client warns with the server rules before sending a DNI", () => {
 expect(dniProblem("30111234", "")).toMatch(/Indique/);
 expect(dniProblem("30111234", "30A111")).toMatch(/sólo puede contener/);
 expect(dniProblem("30111234", "123456")).toMatch(/entre 7 y 12/);
 expect(dniProblem("30111234", "1234567890123")).toMatch(/entre 7 y 12/);
 expect(dniProblem("30111234", "30.111.234")).toMatch(/igual al actual/);
 expect(dniProblem("30111234", " 30-111-999 ")).toBe("");
 expect(dniProblem(null, "30111999")).toBe("");
});

test("rectifying a DNI needs the new number, a reason and the document check, and then refreshes the identity", async () => {
 const notify = vi.fn(); let saved = false;
 fichaMock(baseDetail, () => { saved = true; return Promise.resolve({ ...baseDetail, dni: "30111999", version: 5 }); });
 render(<PatientMaintenance notify={notify} />);
 fireEvent.change(screen.getByLabelText("DNI exacto"), { target: { value: "30111234" } });
 fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
 fireEvent.click(await screen.findByRole("button", { name: "Revisar ficha" }));
 fireEvent.click(await screen.findByRole("button", { name: "Rectificar DNI" }));
 expect(screen.getByRole("note")).toHaveTextContent(/nunca fusiona identidades/);
 const confirm = screen.getByRole("button", { name: "Confirmar rectificación" });
 expect(confirm).toBeDisabled();
 fillDni(); expect(confirm).toBeDisabled();
 cotejo(); expect(confirm).toBeEnabled();
 submitDni();
 await waitFor(() => expect(saved).toBe(true));
 const call = vi.mocked(api).mock.calls.find(([path]) => path === "/patients/9/dni");
 expect(JSON.parse(call[1].body)).toEqual({ dniNuevo: "30.111.999", version: 4, motivo: "Error de digitación al cargar la solicitud", cotejoDocumental: true, confirmaCuenta: null });
 expect(await screen.findByText("DNI: 30111999")).toBeInTheDocument();
 expect(notify).toHaveBeenCalledWith("DNI rectificado");
 expect(screen.queryByLabelText("DNI nuevo")).toBeNull();
 expect(vi.mocked(api).mock.calls.filter(([path]) => path === "/patients/9/corrections?page=0&size=10").length).toBe(2);
});

test("an invalid or unchanged DNI is flagged and cannot be confirmed", async () => {
 fichaMock(baseDetail, () => Promise.reject(new Error("no debería enviarse")));
 await openFicha(); fireEvent.click(screen.getByRole("button", { name: "Rectificar DNI" }));
 fillDni("30.111.234"); cotejo();
 expect(screen.getByText("El DNI nuevo es igual al actual")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirmar rectificación" })).toBeDisabled();
 fillDni("12ab"); expect(screen.getByText(/sólo puede contener/)).toBeInTheDocument();
 fillDni("30111999", "corto"); expect(screen.getByRole("button", { name: "Confirmar rectificación" })).toBeDisabled();
 submitDni();
 expect(vi.mocked(api).mock.calls.some(([path]) => path === "/patients/9/dni")).toBe(false);
});

test("a person with an account shows the warning and also needs its own confirmation", async () => {
 let body; fichaMock({ ...baseDetail, cuentaEstado: "PENDIENTE_ACTIVACION" }, (options) => { body = JSON.parse(options.body); return Promise.resolve({ ...baseDetail, dni: "30111999", version: 5, cuentaEstado: "PENDIENTE_ACTIVACION" }); });
 await openFicha(); expect(screen.getByText(/Tiene cuenta de usuario \(pendiente activacion\)/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Rectificar DNI" }));
 expect(screen.getAllByRole("note").map(n => n.textContent).join(" ")).toMatch(/no modifica su contraseña, roles, estado ni sesiones.*deberá activarla con el DNI corregido/);
 fillDni(); cotejo();
 const confirm = screen.getByRole("button", { name: "Confirmar rectificación" });
 expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByLabelText(/Confirmo que el cambio de DNI no altera/)); expect(confirm).toBeEnabled();
 submitDni();
 await waitFor(() => expect(body).toBeTruthy()); expect(body.confirmaCuenta).toBe(true);
});

test("a DNI taken by another person is reported and the form keeps what was typed", async () => {
 fichaMock(baseDetail, () => Promise.reject(Object.assign(new Error("Ese DNI ya está registrado para otra persona. No se fusionan identidades"), { code: "DNI_ALREADY_REGISTERED" })));
 await openFicha(); fireEvent.click(screen.getByRole("button", { name: "Rectificar DNI" })); fillDni(); cotejo();
 submitDni();
 expect(await screen.findByRole("alert")).toHaveTextContent("No se fusionan identidades");
 expect(screen.getByLabelText("DNI nuevo")).toHaveValue("30.111.999"); expect(screen.getByText("DNI: 30111234")).toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "Volver a cargar la ficha" })).toBeNull();
});

test("a stale identity offers to reload the record", async () => {
 let detailVersion = 4;
 vi.mocked(api).mockImplementation((path) => {
  if (String(path).startsWith("/patients/search")) return Promise.resolve({ items: [{ id: 9, nombre: "Ana", apellido: "Paz", dniTerminacion: "••••1234" }], page: 0, hasNext: false });
  if (path === "/patients/9") return Promise.resolve({ ...baseDetail, version: detailVersion });
  if (path === "/patients/9/corrections?page=0&size=10") return Promise.resolve({ items: [] });
  if (path === "/patients/9/dni") return Promise.reject(Object.assign(new Error("La identidad cambió; vuelva a cargar la ficha"), { code: "PATIENT_STALE_IDENTITY" }));
  if (path === undefined) return Promise.resolve();
  throw new Error(String(path));
 });
 await openFicha(); fireEvent.click(screen.getByRole("button", { name: "Rectificar DNI" })); fillDni(); cotejo();
 submitDni();
 expect(await screen.findByRole("alert")).toHaveTextContent("vuelva a cargar la ficha");
 detailVersion = 6; fireEvent.click(screen.getByRole("button", { name: "Volver a cargar la ficha" }));
 await waitFor(() => expect(screen.queryByLabelText("DNI nuevo")).toBeNull());
 await screen.findByRole("button", { name: "Rectificar DNI" });
});

test("a double submit sends a single rectification", async () => {
 let release; const pending = new Promise(resolve => { release = resolve; }); let calls = 0;
 fichaMock(baseDetail, () => { calls += 1; return pending; });
 await openFicha(); fireEvent.click(screen.getByRole("button", { name: "Rectificar DNI" })); fillDni(); cotejo();
 const form = screen.getByRole("button", { name: "Confirmar rectificación" }).closest("form");
 fireEvent.submit(form); fireEvent.submit(form);
 expect(calls).toBe(1); expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
 release({ ...baseDetail, dni: "30111999", version: 5 });
 await screen.findByText("DNI: 30111999");
});

test("a denial from the server is shown as is", async () => {
 fichaMock(baseDetail, () => Promise.reject(new Error("Acceso denegado")));
 await openFicha(); fireEvent.click(screen.getByRole("button", { name: "Rectificar DNI" })); fillDni(); cotejo();
 submitDni();
 expect(await screen.findByRole("alert")).toHaveTextContent("Acceso denegado");
});

test("a patient without DNI is offered an assignment instead of a rectification", async () => {
 fichaMock({ ...baseDetail, dni: null }, () => Promise.resolve({ ...baseDetail, dni: "30111999", version: 5 }));
 await openFicha(); expect(screen.getByText("DNI: No registrado")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Asignar DNI" })); expect(screen.getByRole("heading", { name: "Asignación del DNI" })).toBeInTheDocument();
});
