import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { UserDirectory } from "./users";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const roleOptions = [{ codigo: "ADMINISTRADOR", nombre: "Administrador" }, { codigo: "CENTRO_OPERACIONES", nombre: "Centro de Operaciones" }, { codigo: "COMANDANTE", nombre: "Comandante" }, { codigo: "DTS", nombre: "DTS" }];
const summary = (id, extra = {}) => ({ id, nombre: "Ana" + id, apellido: "Paz", dni: "3011" + id, username: "ana" + id, estado: "ACTIVO", activo: true, fechaBaja: null, bajaPor: null, motivoBaja: null, roles: ["DTS"], provinciaActual: null, debeCambiarContrasena: false, ...extra });
const page = (items, extra = {}) => ({ items, total: items.length, page: 0, size: 20, totalPages: items.length ? 1 : 0, ...extra });
const detail = (id, extra = {}) => ({ id, nombre: "Ana" + id, apellido: "Paz", dni: "3011" + id, fechaNacimiento: "1990-01-02", username: "ana" + id, estado: "ACTIVO", activo: true, debeCambiarContrasena: false, fechaCreacion: "2026-10-01T10:00:00", fechaBaja: null, bajaPorId: null, bajaPor: null, motivoBaja: null, roles: ["DTS"], correos: [{ id: 1, valor: "ana@example.test", principal: true }], telefonos: [{ id: 2, valor: "3815550000", principal: true }], licenciaAeronautica: null, provinciaActual: null, impedimentosBaja: [], ultimoAdministrador: false, esUsted: false, ...extra });
const history = (items = []) => ({ items, total: items.length, timeZone: "America/Argentina/Tucuman" });
let calls;
function backend({ list = [summary(1), summary(2)], det = detail(1), search = (p) => page(list), onPost } = {}) {
  calls = [];
  vi.mocked(api).mockImplementation((path, opts) => {
    calls.push([path, opts]);
    if (path === "/auth/roles") return Promise.resolve(roleOptions);
    if (path.startsWith("/auth/users/search")) return Promise.resolve(search(path));
    if (path.startsWith("/audit?entityType=USER_ROLE")) return Promise.resolve(history());
    if (path.startsWith("/audit?")) return Promise.resolve(history([{ id: 5, occurredAt: "2026-10-22T15:00:00Z", operationLabel: "Alta de cuenta", summary: "Alta de cuenta — Roles: DTS", actor: { label: "Admin Inicial" } }]));
    if (/^\/auth\/users\/\d+$/.test(path) && (!opts || !opts.method)) return Promise.resolve(typeof det === "function" ? det(path) : det);
    if (onPost) { const r = onPost(path, opts); if (r !== undefined) return r; }
    return Promise.resolve({});
  });
}
beforeEach(() => { vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

test("el listado se pide paginado y filtrado al servidor, con estado vacío y paginación", async () => {
  backend({ search: (p) => p.includes("q=zzz") ? page([]) : p.includes("page=1") ? page([summary(21)], { page: 1, total: 21, totalPages: 2 }) : page([summary(1), summary(2)], { total: 21, totalPages: 2 }) });
  render(<UserDirectory active notify={vi.fn()} />);
  expect(await screen.findByText("Ana1")).toBeInTheDocument();
  expect(calls.find(([p]) => p.startsWith("/auth/users/search"))[0]).toBe("/auth/users/search?status=ACTIVOS&page=0&size=20");
  expect(screen.getByText("Página 1 de 2 · 21 usuarios", { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(await screen.findByText("Ana21")).toBeInTheDocument(); expect(calls.some(([p]) => p.includes("page=1"))).toBe(true);
  fireEvent.change(screen.getByLabelText("Filtrar por rol"), { target: { value: "COMANDANTE" } });
  await waitFor(() => expect(calls.some(([p]) => p.includes("role=COMANDANTE") && p.includes("page=0"))).toBe(true));
  fireEvent.change(screen.getByLabelText("Filtrar por estado"), { target: { value: "PENDIENTES" } });
  await waitFor(() => expect(calls.some(([p]) => p.includes("status=PENDIENTES"))).toBe(true));
  fireEvent.change(screen.getByLabelText("Buscar usuarios"), { target: { value: "zzz" } });
  expect(await screen.findByText("Ningún usuario coincide con la búsqueda.")).toBeInTheDocument();
});

test("los desactivados muestran cuándo, quién y por qué, y el error del servidor se informa con reintento", async () => {
  backend({ search: () => page([summary(9, { activo: false, estado: "DESACTIVADO", fechaBaja: "2026-10-20T09:30:00", bajaPor: "Admin Inicial", motivoBaja: "fin de contrato" }), summary(10, { activo: false, estado: "DESACTIVADO" })]) });
  render(<UserDirectory active={false} notify={vi.fn()} />);
  expect(await screen.findByText("Admin Inicial")).toBeInTheDocument(); expect(screen.getByText("fin de contrato")).toBeInTheDocument(); expect(screen.getByText("2026-10-20 09:30")).toBeInTheDocument(); expect(screen.getAllByText("No registrado")).toHaveLength(1);
  expect(calls.find(([p]) => p.startsWith("/auth/users/search"))[0]).toContain("status=INACTIVOS"); expect(screen.getAllByRole("button", { name: "Reactivar" })).toHaveLength(2);
  cleanup(); vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((p) => p === "/auth/roles" ? Promise.resolve(roleOptions) : Promise.reject(Object.assign(new Error("Acceso denegado"), { status: 403 })));
  render(<UserDirectory active notify={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Acceso denegado"); expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
});

test("la edición administrativa envía el formulario, no permite editar el DNI y sólo informa éxito tras la respuesta", async () => {
  let finish; const notify = vi.fn();
  backend({ onPost: (path, opts) => path === "/auth/users/1" && opts.method === "PUT" ? new Promise((resolve) => { finish = () => resolve({}); }) : undefined });
  render(<UserDirectory active notify={notify} />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Detalle" }))[0]);
  const form = await screen.findByRole("form", { name: "Edición administrativa" });
  expect(within(form).queryByLabelText("DNI")).toBeNull(); expect(screen.getByText(/no se modifica desde aquí/)).toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Ana María" } });
  fireEvent.click(within(form).getByLabelText("Centro de Operaciones"));
  const save = within(form).getByRole("button", { name: "Guardar cambios" }); fireEvent.click(save); fireEvent.submit(form);
  await waitFor(() => expect(within(form).getByRole("button", { name: "Guardando…" })).toBeDisabled());
  expect(calls.filter(([p, o]) => p === "/auth/users/1" && o?.method === "PUT")).toHaveLength(1); expect(notify).not.toHaveBeenCalled();
  const body = JSON.parse(calls.find(([p, o]) => o?.method === "PUT")[1].body); expect(body).toMatchObject({ nombre: "Ana María", roles: ["DTS", "CENTRO_OPERACIONES"], activo: true }); expect(body.dni).toBeUndefined();
  finish(); await waitFor(() => expect(notify).toHaveBeenCalledWith("Datos de la cuenta guardados"));
});

test("las responsabilidades vigentes bloquean la baja y se muestran con el vuelo que la impide", async () => {
  backend({ det: detail(1, { roles: ["COMANDANTE"], impedimentosBaja: [{ tipo: "COMANDANTE_ASIGNADO", vueloId: 9, vueloCodigo: "V-9", detalle: "Comandante asignado al vuelo V-9 (PLANIFICADO)" }] }) });
  render(<UserDirectory active notify={vi.fn()} />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Detalle" }))[0]);
  const actions = await screen.findByLabelText("Acciones sobre la cuenta");
  expect(within(actions).getByText(/Comandante asignado al vuelo V-9/)).toBeInTheDocument(); expect(within(actions).getByRole("button", { name: "Desactivar cuenta" })).toBeDisabled(); expect(within(actions).getByText(/No se puede desactivar: Tiene responsabilidades operativas vigentes/)).toBeInTheDocument();
});

test("no se ofrece desactivarse a uno mismo ni al último administrador, ni cambiar los propios roles", async () => {
  backend({ det: detail(1, { esUsted: true, roles: ["ADMINISTRADOR"], ultimoAdministrador: true }) });
  render(<UserDirectory active notify={vi.fn()} />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Detalle" }))[0]);
  const actions = await screen.findByLabelText("Acciones sobre la cuenta");
  expect(within(actions).getByRole("button", { name: "Desactivar cuenta" })).toBeDisabled(); expect(within(actions).getByRole("button", { name: "Restablecer credenciales" })).toBeDisabled(); expect(screen.getByText("No puede modificar sus propios roles.")).toBeInTheDocument();
  expect(screen.getByLabelText("Administrador")).toBeDisabled();
});

test("desactivar pide confirmación, envía el motivo, informa tras la respuesta y un rechazo del backend muestra sus impedimentos", async () => {
  const notify = vi.fn(); let reject = false;
  backend({ onPost: (path, opts) => path === "/auth/users/1/deactivate" ? (reject ? Promise.reject(Object.assign(new Error("El usuario tiene responsabilidades operativas vigentes"), { code: "USER_HAS_OPERATIONAL_ASSIGNMENTS", impedimentos: [{ tipo: "INFORME_FINAL_PENDIENTE", vueloId: 3, vueloCodigo: "V-3", detalle: "Informe final pendiente de presentar o corregir del vuelo V-3" }] })) : Promise.resolve({})) : undefined });
  render(<UserDirectory active notify={notify} />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Detalle" }))[0]);
  const actions = await screen.findByLabelText("Acciones sobre la cuenta");
  fireEvent.change(within(actions).getByLabelText("Motivo de la baja (opcional)"), { target: { value: "fin de contrato" } });
  window.confirm = vi.fn(() => false); fireEvent.click(within(actions).getByRole("button", { name: "Desactivar cuenta" })); expect(calls.some(([p]) => p.endsWith("/deactivate"))).toBe(false);
  reject = true; window.confirm = vi.fn(() => true); fireEvent.click(within(actions).getByRole("button", { name: "Desactivar cuenta" }));
  expect(await screen.findByText(/Informe final pendiente de presentar o corregir del vuelo V-3/)).toBeInTheDocument(); expect(notify).toHaveBeenCalledWith("El usuario tiene responsabilidades operativas vigentes", true);
  reject = false; fireEvent.click(within(await screen.findByLabelText("Acciones sobre la cuenta")).getByRole("button", { name: "Desactivar cuenta" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Usuario desactivado")); expect(JSON.parse(calls.filter(([p]) => p.endsWith("/deactivate")).pop()[1].body)).toEqual({ motivo: "fin de contrato" });
});

test("el restablecimiento y la reactivación muestran la contraseña temporal una sola vez y no queda en el detalle", async () => {
  const notify = vi.fn(); let inactive = false;
  backend({ det: () => detail(1, inactive ? { activo: false, estado: "DESACTIVADO", fechaBaja: "2026-10-20T09:30:00", bajaPor: "Admin Inicial", motivoBaja: "x" } : {}),
    onPost: (path) => path === "/auth/users/1/credential-reset" ? Promise.resolve({ contrasenaTemporal: "Temporal-Reset-111" }) : path === "/auth/users/1/reactivate" ? Promise.resolve({ contrasenaTemporal: "Temporal-React-222", usuario: {} }) : undefined });
  render(<UserDirectory active notify={notify} />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Detalle" }))[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Restablecer credenciales" }));
  const notice = await screen.findByRole("dialog"); expect(within(notice).getByText("Temporal-Reset-111")).toBeInTheDocument(); expect(within(notice).getByText("ana1")).toBeInTheDocument();
  fireEvent.click(within(notice).getByRole("button", { name: "Cerrar aviso" })); expect(screen.queryByText("Temporal-Reset-111")).toBeNull(); expect(document.body.textContent).not.toContain("Temporal-Reset-111");
  inactive = true; cleanup(); backend({ det: () => detail(1, { activo: false, estado: "DESACTIVADO", fechaBaja: "2026-10-20T09:30:00", bajaPor: "Admin Inicial", motivoBaja: "x" }), search: () => page([summary(1, { activo: false, estado: "DESACTIVADO" })]), onPost: (path) => path === "/auth/users/1/reactivate" ? Promise.resolve({ contrasenaTemporal: "Temporal-React-222" }) : undefined });
  render(<UserDirectory active={false} notify={notify} />);
  fireEvent.click(await screen.findByRole("button", { name: "Detalle" }));
  const form = await screen.findByRole("form", { name: "Reactivar cuenta" }); expect(screen.getByText("Admin Inicial", { selector: "dd" })).toBeInTheDocument();
  fireEvent.click(within(form).getByRole("button", { name: "Reactivar y generar contraseña temporal" }));
  const dialog = await screen.findByRole("dialog"); expect(within(dialog).getByText("Temporal-React-222")).toBeInTheDocument(); expect(calls.find(([p]) => p.endsWith("/reactivate"))[1].method).toBe("PATCH");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar aviso" })); expect(document.body.textContent).not.toContain("Temporal-React-222");
});

test("el historial administrativo de la cuenta se obtiene de la auditoría y las cuentas pendientes ofrecen regenerar el código", async () => {
  const notify = vi.fn();
  backend({ det: detail(1, { estado: "PENDIENTE_ACTIVACION", username: null }), onPost: (path) => path.endsWith("/activation-code") ? Promise.resolve({ codigo: "CODIGO-UNICO-XYZ", expiraEn: "24 horas" }) : undefined });
  render(<UserDirectory active notify={notify} />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Detalle" }))[0]);
  const historyBox = await screen.findByLabelText("Historial administrativo"); expect(await within(historyBox).findByText("Alta de cuenta")).toBeInTheDocument(); expect(within(historyBox).getByText(/Admin Inicial/)).toBeInTheDocument();
  expect(calls.some(([p]) => p === "/audit?entityType=USER&entityId=1&size=20")).toBe(true); expect(calls.some(([p]) => p === "/audit?entityType=USER_ROLE&entityId=1&size=20")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Regenerar código de activación" }));
  expect(await screen.findByText("CODIGO-UNICO-XYZ")).toBeInTheDocument();
});

test("el alta con una persona ya registrada sin cuenta pide confirmación expresa y reenvía el identificador; sin coincidencia de nombre no asocia", async () => {
  const { AdminUsers } = await import("./main.jsx"); const reload = vi.fn(async () => {}), notify = vi.fn(); const posts = [];
  vi.mocked(api).mockImplementation((path, opts) => {
    if (path === "/auth/users" && opts?.method === "POST") { const body = JSON.parse(opts.body); posts.push(body); return body.personaExistenteId ? Promise.resolve({ codigo: "CODIGO-NUEVO", expiraEn: "24 horas" }) : Promise.reject(Object.assign(new Error("Ya existe una persona registrada con ese DNI que no tiene cuenta."), { code: "PERSON_EXISTS_WITHOUT_ACCOUNT", personaId: 7, coincideNombre: posts.length === 1 })); }
    return Promise.resolve([]);
  });
  const fill = () => { fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } }); fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "Paz" } }); fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "30111222" } }); fireEvent.change(screen.getByLabelText("Correo principal"), { target: { value: "ana@example.test" } }); fireEvent.change(screen.getByLabelText("Teléfono principal"), { target: { value: "3815550000" } }); fireEvent.click(screen.getByLabelText("DTS")); };
  render(<AdminUsers users={[]} reload={reload} notify={notify} showList={false} createOpen onCreateOpenChange={vi.fn()} />);
  fill(); window.confirm = vi.fn(() => true); fireEvent.click(screen.getByRole("button", { name: "Crear cuenta pendiente" }));
  expect(await screen.findByText("CODIGO-NUEVO")).toBeInTheDocument(); expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("No se creará una persona nueva"));
  expect(posts).toHaveLength(2); expect(posts[0].personaExistenteId).toBeUndefined(); expect(posts[1].personaExistenteId).toBe(7); expect(notify).toHaveBeenCalledWith(expect.stringContaining("asociada a la identidad existente"));
  cleanup(); posts.length = 0; posts.push({}); // el siguiente intento ya no coincide en nombre
  render(<AdminUsers users={[]} reload={reload} notify={notify} showList={false} createOpen onCreateOpenChange={vi.fn()} />);
  fill(); window.confirm = vi.fn(() => true); fireEvent.click(screen.getByRole("button", { name: "Crear cuenta pendiente" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("nombre distinto"), true)); expect(window.confirm).not.toHaveBeenCalled(); expect(posts).toHaveLength(2);
});
