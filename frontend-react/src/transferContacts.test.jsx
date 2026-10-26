import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { TransferContacts, contactProblem, contactsPayload, emptyContact, rowsProblem } from "./transferContacts";

vi.mock("./api", () => ({ api: vi.fn() }));
const provinces = [{ id: "tuc", nombre: "Tucumán" }, { id: "sal", nombre: "Salta" }];
const tuc = [{ id: "loc-tuc", nombre: "San Miguel de Tucumán", provincia: "Tucumán" }], sal = [{ id: "loc-sal", nombre: "Salta", provincia: "Salta" }];
const catalog = (path) => path === "/catalogs/provinces" ? Promise.resolve(provinces) : path.includes("provinceId=tuc") ? Promise.resolve(tuc) : path.includes("provinceId=sal") ? Promise.resolve(sal) : undefined;
beforeEach(() => { vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

const renderDts = async () => {
  vi.mocked(api).mockImplementation((path) => catalog(path) || Promise.resolve({}));
  const { DTS } = await import("./main.jsx"); const done = vi.fn(), msg = vi.fn();
  render(<DTS d={{ patients: [], priorities: [{ codigo: "ALTA", nombre: "Alta" }] }} done={done} msg={msg} />);
  await waitFor(() => expect(screen.getAllByRole("option", { name: "Tucumán" })).toHaveLength(2));
  return { done, msg };
};
const selectLocality = async (kind, province, locality) => { fireEvent.change(screen.getByLabelText(`Provincia ${kind}`), { target: { value: province } }); fireEvent.focus(screen.getByLabelText(`Buscar localidad ${kind}`)); const option = await screen.findByRole("option", { name: locality }); fireEvent.mouseDown(option); fireEvent.click(option); };
const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Crear solicitud" }).closest("form"));
const bodyOf = (path) => JSON.parse(vi.mocked(api).mock.calls.find(([p]) => p === path)[1].body);

test("las reglas de contacto avisan antes de enviar y rechazan la ambigüedad", () => {
  expect(contactProblem({ ...emptyContact(), nombre: "Ana", telefono: "" })).toMatch(/Indique el teléfono/);
  expect(contactProblem({ ...emptyContact(), nombre: "Ana", telefono: "12345" })).toMatch(/muy pocos dígitos|incompleto/);
  expect(contactProblem({ ...emptyContact(), nombre: "", telefono: "3815550001" })).toMatch(/nombre/);
  expect(contactProblem({ relacion: "PACIENTE", nombre: "", pais: "AR", telefono: "3815550001", observaciones: "" })).toBe("");
  expect(rowsProblem([{ ...emptyContact(), nombre: "A", telefono: "381-555-0001" }, { ...emptyContact(), nombre: "B", telefono: "3815550001" }])).toMatch(/mismo teléfono/);
  expect(rowsProblem([{ relacion: "PACIENTE", nombre: "", pais: "AR", telefono: "3815550001", observaciones: "" }, { relacion: "PACIENTE", nombre: "", pais: "AR", telefono: "3815550002", observaciones: "" }])).toMatch(/propio paciente/);
  expect(rowsProblem([emptyContact()])).toBe("");   // una fila vacía equivale a no informar contactos
  expect(contactsPayload([emptyContact(), { relacion: "PACIENTE", nombre: " ", pais: "AR", telefono: " 3815550001 ", observaciones: "" }])).toEqual([{ relacion: "PACIENTE", nombre: null, pais: "AR", telefono: "3815550001", observaciones: null }]);
});

test("la solicitud identifica a quién pertenece cada teléfono y lo envía junto con la solicitud (paciente nuevo)", async () => {
  const { done, msg } = await renderDts();
  expect(screen.getByText(/no se guardan como contacto personal del paciente ni de ninguna cuenta/)).toBeInTheDocument();
  await selectLocality("origen", "tuc", "San Miguel de Tucumán, Tucumán"); await selectLocality("destino", "sal", "Salta, Salta");
  fireEvent.change(screen.getByLabelText("Nombre", { exact: true }), { target: { value: "Ana" } }); fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "Paz" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar contacto de coordinación" }));
  fireEvent.change(screen.getByLabelText("Relación con el paciente"), { target: { value: "PACIENTE" } });
  fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "+54 381 555-1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar contacto de coordinación" }));
  const second = screen.getAllByLabelText("Relación con el paciente")[1];
  fireEvent.change(second, { target: { value: "ESTABLECIMIENTO_ORIGEN" } });
  fireEvent.change(screen.getAllByLabelText("Nombre de la persona o establecimiento")[0], { target: { value: "Hospital Padilla" } });
  fireEvent.change(screen.getAllByLabelText("Teléfono")[1], { target: { value: "3814440000" } });
  expect(screen.getByText("Contacto principal")).toBeInTheDocument();
  submit();
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/with-patient", expect.anything()));
  const body = bodyOf("/flights/with-patient");
  expect(body.contactos).toEqual([
    { relacion: "PACIENTE", nombre: null, pais: "AR", telefono: "381 555-1234", observaciones: null },
    { relacion: "ESTABLECIMIENTO_ORIGEN", nombre: "Hospital Padilla", pais: "AR", telefono: "3814440000", observaciones: null },
  ]);
  expect(body.patient).not.toHaveProperty("telefono");
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(msg).toHaveBeenCalledWith("Solicitud registrada");
  expect(screen.queryAllByLabelText("Teléfono")).toHaveLength(0);   // el formulario se reinicia
});

test("un contacto inválido o ambiguo detiene el envío y conserva lo escrito", async () => {
  const { msg } = await renderDts();
  await selectLocality("origen", "tuc", "San Miguel de Tucumán, Tucumán"); await selectLocality("destino", "sal", "Salta, Salta");
  fireEvent.click(screen.getByRole("button", { name: "Agregar contacto de coordinación" }));
  fireEvent.change(screen.getByLabelText("Nombre de la persona o establecimiento"), { target: { value: "Marta" } });
  fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "abc" } });
  submit();
  expect(msg).toHaveBeenCalledWith(expect.stringMatching(/admite dígitos/), true);
  expect(vi.mocked(api).mock.calls.some(([p]) => p === "/flights" || p === "/flights/with-patient")).toBe(false);
  expect(screen.getByLabelText("Teléfono")).toHaveValue("abc");
  // el servidor también valida: su error se muestra y el formulario no se pierde
  fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "3815550001" } });
  vi.mocked(api).mockImplementation((path) => path === "/flights/with-patient" ? Promise.reject(new Error("Campo no admitido: x")) : catalog(path) || Promise.resolve({}));
  submit();
  await waitFor(() => expect(msg).toHaveBeenCalledWith("Campo no admitido: x", true));
  expect(screen.getByLabelText("Teléfono")).toHaveValue("3815550001");
});

test("con un paciente elegido por búsqueda paginada el contacto viaja en la solicitud y no toca al paciente", async () => {
  await renderDts();
  vi.mocked(api).mockImplementation((path) => path.startsWith("/patients/search") ? Promise.resolve({ items: [{ id: 42, nombre: "Ana", apellido: "Pérez", dniTerminacion: "••••1234" }], page: 0, size: 10, hasNext: false }) : catalog(path) || Promise.resolve({}));
  fireEvent.change(screen.getByLabelText("Paciente"), { target: { value: "search" } });
  fireEvent.change(screen.getByLabelText("DNI exacto"), { target: { value: "30111234" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar paciente" }));
  fireEvent.click(await screen.findByRole("button", { name: "Seleccionar" }));
  await selectLocality("origen", "tuc", "San Miguel de Tucumán, Tucumán"); await selectLocality("destino", "sal", "Salta, Salta");
  fireEvent.click(screen.getByRole("button", { name: "Agregar contacto de coordinación" }));
  fireEvent.change(screen.getByLabelText("Nombre de la persona o establecimiento"), { target: { value: "Hija" } });
  fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "3815550123" } });
  submit();
  await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/flights", expect.anything()));
  const body = bodyOf("/flights");
  expect(body.patientId).toBe(42); expect(body.contactos).toEqual([{ relacion: "FAMILIAR_RESPONSABLE", nombre: "Hija", pais: "AR", telefono: "3815550123", observaciones: null }]);
  expect(vi.mocked(api).mock.calls.some(([p]) => p.startsWith("/auth/me") || p.startsWith("/patients/") && !p.startsWith("/patients/search"))).toBe(false);
});

const listing = (extra = {}) => ({ disponible: true, motivoNoDisponible: null, puedeEditar: false, maximo: 3, items: [{ id: 1, relacion: "FAMILIAR_RESPONSABLE", nombre: "Marta Paz", telefono: "3815550102", observaciones: "Atiende de 8 a 20", principal: true, version: 0 }], ...extra });

test("Operaciones consulta los contactos sólo a pedido, en el vuelo, sin acciones de edición", async () => {
  vi.mocked(api).mockImplementation(() => Promise.resolve(listing()));
  render(<TransferContacts flightId={7} mode="ops" />);
  expect(api).not.toHaveBeenCalled();
  expect(screen.getByText(/queda registrada en la auditoría/)).toBeInTheDocument();
  expect(screen.queryByText("3815550102")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver contactos de coordinación" }));
  expect(await screen.findByText("3815550102")).toBeInTheDocument();
  expect(api).toHaveBeenCalledTimes(1); expect(api).toHaveBeenCalledWith("/flights/7/transfer-contacts");
  expect(screen.getByText("Marta Paz")).toBeInTheDocument(); expect(screen.getByText(/Principal/)).toBeInTheDocument();
  expect(screen.getByText("3815550102").closest("a")).toHaveAttribute("href", "tel:3815550102");
  for (const name of ["Editar", "Retirar", "Agregar contacto", "Hacer principal"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
});

test("una coordinación terminada no muestra números y explica por qué; un acceso denegado se informa", async () => {
  vi.mocked(api).mockImplementation(() => Promise.resolve({ disponible: false, motivoNoDisponible: "La coordinación de este traslado ya terminó (FINALIZADO); los contactos no se muestran", puedeEditar: false, maximo: 3, items: [] }));
  render(<TransferContacts flightId={7} mode="ops" />);
  fireEvent.click(screen.getByRole("button", { name: "Ver contactos de coordinación" }));
  expect(await screen.findByText(/ya terminó/)).toBeInTheDocument();
  cleanup();
  vi.mocked(api).mockRejectedValue(new Error("No tiene acceso a los contactos de este vuelo"));
  render(<TransferContacts flightId={8} mode="ops" />);
  fireEvent.click(screen.getByRole("button", { name: "Ver contactos de coordinación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No tiene acceso");
});

test("el DTS solicitante mantiene los contactos de su solicitud con versión, principal y retiro", async () => {
  let state = listing({ puedeEditar: true, items: [
    { id: 1, relacion: "FAMILIAR_RESPONSABLE", nombre: "Marta Paz", telefono: "3815550102", observaciones: null, principal: true, version: 0 },
    { id: 2, relacion: "PACIENTE", nombre: null, telefono: "3815550103", pais: "AR", observaciones: null, principal: false, version: 3 }] });
  const msg = vi.fn();
  vi.mocked(api).mockImplementation((path, options) => {
    if (!options) return Promise.resolve(JSON.parse(JSON.stringify(state)));
    if (path.endsWith("/2/principal")) { state.items[0].principal = false; state.items[1].principal = true; }
    if (options.method === "DELETE") state.items = state.items.filter((c) => !path.endsWith(`/${c.id}`));
    if (options.method === "PUT") { const b = JSON.parse(options.body); if (b.version !== 3) { const e = new Error("El contacto fue modificado por otra operación"); e.code = "CONTACT_VERSION_CONFLICT"; return Promise.reject(e); } state.items[1] = { ...state.items[1], telefono: b.telefono, version: 4 }; }
    return Promise.resolve({});
  });
  render(<TransferContacts flightId={9} mode="dts" msg={msg} />);
  expect(await screen.findByText("3815550102")).toBeInTheDocument();
  expect(screen.queryByText(/queda registrada en la auditoría/)).not.toBeInTheDocument();   // el solicitante no es auditado por ver lo suyo
  const row = (text) => screen.getByText(text).closest("li");
  fireEvent.click(within(row("3815550103")).getByRole("button", { name: "Editar" }));
  const edit = screen.getByRole("form", { name: "Editar contacto de coordinación" });
  fireEvent.change(within(edit).getByLabelText("Teléfono"), { target: { value: "12" } });
  fireEvent.click(within(edit).getByRole("button", { name: "Guardar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/muy pocos dígitos|incompleto/);
  fireEvent.change(within(edit).getByLabelText("Teléfono"), { target: { value: "3815550199" } });
  fireEvent.click(within(edit).getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText("3815550199")).toBeInTheDocument();
  const put = vi.mocked(api).mock.calls.find(([, o]) => o?.method === "PUT");
  expect(put[0]).toBe("/flights/9/transfer-contacts/2"); expect(JSON.parse(put[1].body)).toMatchObject({ telefono: "3815550199", pais: "AR", relacion: "PACIENTE", version: 3 });
  fireEvent.click(within(row("3815550199")).getByRole("button", { name: "Hacer principal" }));
  await waitFor(() => expect(within(row("3815550199")).getByText(/Principal/)).toBeInTheDocument());
  fireEvent.click(within(row("3815550102")).getByRole("button", { name: "Retirar" }));
  await waitFor(() => expect(screen.queryByText("3815550102")).not.toBeInTheDocument());
  expect(msg).toHaveBeenCalledWith("Contacto de coordinación retirado");
  expect(vi.mocked(api).mock.calls.find(([, o]) => o?.method === "DELETE")[0]).toBe("/flights/9/transfer-contacts/1");
});

test("el rechazo del servidor sigue visible después de releer el estado vigente", async () => {
  vi.mocked(api).mockImplementation((path, options) => {
    if (!options) return Promise.resolve(listing({ puedeEditar: true }));
    return Promise.reject(Object.assign(new Error("El mismo teléfono figura más de una vez en la solicitud"), { code: "CONTACT_AMBIGUOUS" }));
  });
  render(<TransferContacts flightId={3} mode="dts" />);
  fireEvent.click(await screen.findByRole("button", { name: "Agregar contacto" }));
  const form = screen.getByRole("form", { name: "Agregar contacto de coordinación" });
  fireEvent.change(within(form).getByLabelText("Nombre de la persona o establecimiento"), { target: { value: "Otro" } });
  fireEvent.change(within(form).getByLabelText("Teléfono"), { target: { value: "3815550102" } });
  fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("mismo teléfono");
  await waitFor(() => expect(vi.mocked(api).mock.calls.filter(([, o]) => !o).length).toBeGreaterThanOrEqual(2));   // se volvió a leer el estado
  expect(screen.getByRole("alert")).toHaveTextContent("mismo teléfono");
});
