import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { api } from "../services/api";
import { AppProviders } from "./App";
import { AppRoutes } from "./AppRoutes";
import { NAVIGATION, ROUTE_ACCESS, legacyHashTarget } from "./navigation";
import { currentPath, go, renderApp, ROLE, signIn } from "../test-utils";

vi.mock("../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const me = { nombre: "Ana", apellido: "Paz", dni: "30111222", username: "ana", correos: [{ id: 1, valor: "ana@example.test", tipo: "PERSONAL", principal: true, version: 0 }], telefonos: [{ id: 2, valor: "3815551234", tipo: "PERSONAL", principal: true, version: 0 }] };
const defaults = (path) => {
  if (path === "/notifications") return Promise.resolve({ items: [], unread: 0 });
  if (path === "/auth/users/summary") return Promise.resolve({ activos: 3, pendientes: 1, inactivos: 2 });
  if (path === "/auth/me") return Promise.resolve(me);
  if (path.startsWith("/auth/users/search")) return Promise.resolve({ items: [], total: 0, page: 0, size: 20, totalPages: 0 });
  return Promise.resolve([]);
};
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(defaults); localStorage.clear(); sessionStorage.clear(); document.documentElement.dataset.theme = "light"; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const nav = () => screen.getByRole("navigation", { name: "Módulos" });
const linksOf = () => within(nav()).getAllByRole("link").map((a) => a.getAttribute("href"));

// ---- Definición de navegación ----

test("el menú nunca ofrece una pantalla que la ruta rechazaría: cada módulo del menú pertenece a su área", () => {
  for (const [workspace, groups] of Object.entries(NAVIGATION)) {
    for (const item of groups.flatMap((group) => group.items)) {
      const segment = item.to;
      expect(ROUTE_ACCESS[segment], `${workspace} → ${segment}`).toBeDefined();
      expect(ROUTE_ACCESS[segment], `${workspace} → ${segment}`).toContain(workspace);
    }
  }
});

test("los enlaces antiguos con #/… se convierten a rutas reales según el área", () => {
  expect(legacyHashTarget("#/vuelos/7", "DTS")).toBe("/app/solicitudes/7");
  expect(legacyHashTarget("#/vuelos/7", "OPERACIONES")).toBe("/app/vuelos/7");
  expect(legacyHashTarget("#/vuelos", "COMANDANTE")).toBe("/app/vuelos");
  expect(legacyHashTarget("#/admin/usuarios/desactivados", "ADMIN")).toBe("/app/usuarios?estado=desactivados");
  expect(legacyHashTarget("#/admin/ubicacion-comandantes", "ADMIN")).toBe("/app/comandantes");
  expect(legacyHashTarget("#/mi-cuenta", "DTS")).toBe("/app/mi-cuenta");
  expect(legacyHashTarget("#/personal-sanitario", "DTS")).toBe("/app/personal-sanitario");
  expect(legacyHashTarget("#/no-existe", "DTS")).toBeNull(); expect(legacyHashTarget("", "DTS")).toBeNull();
});

// ---- Acceso, sesión y redirecciones ----

test("sin sesión una URL privada lleva al ingreso y, al ingresar, vuelve a la pantalla pedida", async () => {
  vi.mocked(api).mockImplementation((path, options) => path === "/auth/login" && options?.method === "POST"
    ? Promise.resolve({ accessToken: "jwt", username: "admin", roles: ["ADMINISTRADOR"], debeCambiarContrasena: false }) : defaults(path));
  renderApp("/app/usuarios");
  expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  expect(currentPath()).toBe("/login");
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-de-prueba" } });
  fireEvent.submit(screen.getByRole("button", { name: "Iniciar sesión" }).closest("form"));
  expect(await screen.findByRole("heading", { level: 1, name: "Usuarios" })).toBeInTheDocument();
  expect(currentPath()).toBe("/app/usuarios");
  expect(localStorage.getItem("vs-token")).toBe("jwt");
});

test("el ingreso con contraseña temporal conserva la marca en la sesión y obliga a cambiarla", async () => {
  vi.mocked(api).mockImplementation((path, options) => path === "/auth/login" && options?.method === "POST"
    ? Promise.resolve({ accessToken: "new-token", username: "temporal", roles: ["DTS"], debeCambiarContrasena: true }) : defaults(path));
  renderApp("/login");
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "temporal" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "TemporalJWT12" } });
  fireEvent.submit(screen.getByRole("button", { name: "Iniciar sesión" }).closest("form"));
  expect(await screen.findByRole("heading", { name: "Actualizá tu contraseña" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("vs-session"))).toMatchObject({ debeCambiarContrasena: true });
  expect(localStorage.getItem("vs-token")).toBe("new-token");
});

test("con contraseña temporal ninguna pantalla privada carga recursos hasta cambiarla", async () => {
  renderApp("/app/usuarios", { roles: [ROLE.admin], debeCambiarContrasena: true });
  expect(await screen.findByRole("heading", { name: "Actualizá tu contraseña" })).toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith("/auth/users");
  expect(vi.mocked(api).mock.calls.some(([path]) => path.startsWith("/auth/users/search") || path === "/catalogs/aircraft/admin")).toBe(false);
});

test("con sesión activa /login lleva a la aplicación y la raíz abre el inicio", async () => {
  renderApp("/login", { roles: [ROLE.dts] });
  expect(await screen.findByRole("heading", { level: 1, name: /Hola,/ })).toBeInTheDocument();
  expect(currentPath()).toBe("/app/inicio");
  cleanup(); renderApp("/");
  await waitFor(() => expect(currentPath()).toBe("/app/inicio"));
});

test("recargar o abrir directamente una ruta conserva la sesión", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/catalogs/aircraft/admin" ? Promise.resolve([{ id: 1, matricula: "LV-AAA", modelo: "King Air", tipo: "T", capacidadPacientes: 1, capacidadTripulacion: 2, activo: true, aeropuertoActual: "Tucumán", estadoOperativo: "SIN_ASIGNACIONES" }]) : defaults(path));
  signIn([ROLE.admin]);
  const first = render(<MemoryRouter initialEntries={["/app/aeronaves/1"]}><AppProviders><AppRoutes /></AppProviders></MemoryRouter>);
  expect(await screen.findByRole("heading", { level: 1, name: "Aeronave LV-AAA" })).toBeInTheDocument();
  first.unmount();   // «recargar»: la sesión sale del almacenamiento y la URL decide la pantalla
  render(<MemoryRouter initialEntries={["/app/aeronaves/1"]}><AppProviders><AppRoutes /></AppProviders></MemoryRouter>);
  expect(await screen.findByRole("heading", { level: 1, name: "Aeronave LV-AAA" })).toBeInTheDocument();
});

test("una sesión vencida (401 con token) cierra la sesión y lo explica en el ingreso", async () => {
  renderApp("/app/inicio", { roles: [ROLE.dts] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  act(() => { window.dispatchEvent(new CustomEvent("vs:unauthorized", { detail: new Error("La sesión venció. Volvé a ingresar.") })); });
  expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  expect(screen.getByText("La sesión venció. Volvé a ingresar.")).toBeInTheDocument();
  expect(localStorage.getItem("vs-token")).toBeNull();
});

test("cerrar sesión limpia el almacenamiento y vuelve al ingreso", async () => {
  renderApp("/app/inicio", { roles: [ROLE.cmd], username: "piloto" });
  fireEvent.click(await screen.findByRole("button", { name: /piloto/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  expect(localStorage.getItem("vs-token")).toBeNull(); expect(localStorage.getItem("vs-session")).toBeNull();
});

// ---- Navegación por rol ----

const EXPECTED = {
  [ROLE.admin]: ["/app/inicio", "/app/usuarios", "/app/aeronaves", "/app/geografia", "/app/comandantes", "/app/pacientes", "/app/auditoria"],
  [ROLE.dts]: ["/app/inicio", "/app/solicitudes", "/app/solicitudes/nueva", "/app/personal-sanitario", "/app/notificaciones"],
  [ROLE.ops]: ["/app/inicio", "/app/solicitudes", "/app/vuelos", "/app/informes", "/app/comandantes", "/app/notificaciones"],
  [ROLE.cmd]: ["/app/inicio", "/app/vuelos", "/app/informes", "/app/notificaciones"],
};
test.each(Object.entries(EXPECTED))("el menú del rol %s muestra únicamente sus módulos", async (role, hrefs) => {
  renderApp("/app/inicio", { roles: [role] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  expect(linksOf()).toEqual(hrefs);
});

test("el administrador no ve navegación operativa ni notificaciones", async () => {
  renderApp("/app/inicio", { roles: [ROLE.admin] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  expect(within(nav()).queryByText("Vuelos")).toBeNull(); expect(within(nav()).queryByText("Solicitudes")).toBeNull();
  expect(screen.queryByRole("link", { name: /Notificaciones/ })).toBeNull();
  expect(vi.mocked(api).mock.calls.some(([path]) => path === "/flights" || path === "/notifications")).toBe(false); // el área administrativa no consulta vuelos ni avisos
});

test("elegir un módulo en el menú abre su pantalla (no se desplaza por una página larga) y el menú persiste", async () => {
  renderApp("/app/inicio", { roles: [ROLE.admin] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  fireEvent.click(within(nav()).getByRole("link", { name: "Aeronaves" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Aeronaves" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1, name: /Hola,/ })).toBeNull();
  expect(currentPath()).toBe("/app/aeronaves"); expect(within(nav()).getByRole("link", { name: "Aeronaves" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(within(nav()).getByRole("link", { name: "Usuarios" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Usuarios" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Módulos" })).toBeInTheDocument();
});

test("un área no autorizada informa «sin permiso» y no consulta datos del módulo", async () => {
  renderApp("/app/usuarios", { roles: [ROLE.dts] });
  expect(await screen.findByText("No tiene permiso para ver esta pantalla")).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls.some(([path]) => path.startsWith("/auth/users"))).toBe(false);
  cleanup(); renderApp("/app/solicitudes/nueva", { roles: [ROLE.ops] });
  expect(await screen.findByText("No tiene permiso para ver esta pantalla")).toBeInTheDocument();
});

test("las rutas inexistentes se informan, dentro y fuera de la aplicación", async () => {
  renderApp("/app/no-existe", { roles: [ROLE.dts] });
  expect(await screen.findByText("La pantalla que busca no existe")).toBeInTheDocument();
  cleanup(); renderApp("/cualquier-cosa", { roles: [ROLE.dts] });
  expect(await screen.findByText("La página no existe")).toBeInTheDocument();
});

test("usuarios con dos roles eligen el área, la cambian desde el menú de usuario y conservan la sesión", async () => {
  signIn([ROLE.admin, ROLE.ops]); localStorage.setItem("vs-token", "unchanged-token");
  renderApp("/app/inicio");
  fireEvent.click(await screen.findByRole("button", { name: "Administración" }));
  expect(await screen.findByRole("heading", { level: 1, name: /Hola,/ })).toBeInTheDocument();
  expect(within(nav()).getByRole("link", { name: "Usuarios" })).toBeInTheDocument(); expect(within(nav()).queryByRole("link", { name: "Vuelos" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /usuario/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Centro de Operaciones" }));
  expect(await screen.findByRole("link", { name: "Vuelos" })).toBeInTheDocument(); expect(within(nav()).queryByRole("link", { name: "Usuarios" })).toBeNull();
  expect(localStorage.getItem("vs-token")).toBe("unchanged-token"); expect(JSON.parse(localStorage.getItem("vs-session")).roles).toEqual(["ADMINISTRADOR", "CENTRO_OPERACIONES"]);
});

test("una URL de otra de sus áreas cambia al área correcta en lugar de rechazarla", async () => {
  renderApp("/app/usuarios", { roles: [ROLE.admin, ROLE.ops], workspace: "OPERACIONES" });
  expect(await screen.findByRole("heading", { level: 1, name: "Usuarios" })).toBeInTheDocument();
  expect(within(nav()).getByRole("link", { name: "Aeronaves" })).toBeInTheDocument();
});

// ---- Pantallas y datos ----

test("el Centro de Operaciones carga su área sin consultar usuarios administrativos ni mostrar un acceso denegado", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/auth/users" ? Promise.reject(new Error("Acceso denegado")) : defaults(path));
  renderApp("/app/inicio", { roles: [ROLE.ops] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights"));
  expect(api).not.toHaveBeenCalledWith("/auth/users"); expect(screen.queryByText("Acceso denegado")).toBeNull();
});

test("el comandante no pide recursos del administrador", async () => {
  renderApp("/app/inicio", { roles: [ROLE.cmd] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights"));
  expect(api).not.toHaveBeenCalledWith("/auth/users"); expect(api).not.toHaveBeenCalledWith("/catalogs/aircraft/admin");
});

test("el inicio del administrador muestra datos reales aunque falle otro recurso", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/catalogs/aircraft/admin" ? Promise.reject(new Error("Error interno")) : defaults(path));
  renderApp("/app/inicio", { roles: [ROLE.admin] });
  const stats = await screen.findByRole("region", { name: "Resumen administrativo" }, undefined);
  await waitFor(() => expect(within(stats).getByText("Cuentas activas").closest("a")).toHaveTextContent("3"));
  expect(within(stats).getByText("Activaciones pendientes").closest("a")).toHaveTextContent("1");
  expect(within(stats).getByText("Cuentas desactivadas").closest("a")).toHaveTextContent("2");
  expect(within(stats).getByText("Cuentas activas").closest("a")).toHaveAttribute("href", "/app/usuarios");
});

test("el trayecto de un vuelo operativo se muestra desde el contrato estructurado, sin «undefined»", async () => {
  const operational = { id: 5, codigo: "V-OP5", tipo: { codigo: "REGRESO_BASE", nombre: "Regreso a base" }, motivoVuelo: "Retorno", estadoVuelo: "PLANIFICADO", datosSanitarios: null, origen: "Aeroparque Jorge Newbery", destino: "Benjamín Matienzo", origenDetalle: { id: 1, nombre: "Aeroparque Jorge Newbery", provincia: "Buenos Aires", provinciaId: 2 }, destinoDetalle: { id: 2, nombre: "Benjamín Matienzo", provincia: "Tucumán", provinciaId: 3 } };
  const unplanned = { ...operational, id: 6, codigo: "V-SIN", estadoVuelo: "SOLICITADO", origen: null, destino: null, origenDetalle: null, destinoDetalle: null };
  const sanitary = { ...operational, id: 7, codigo: "V-SAN", datosSanitarios: { localidadOrigenSolicitada: { nombre: "Tafí Viejo", provincia: "Tucumán" }, localidadDestinoSolicitada: { nombre: "Rosario", provincia: "Santa Fe" }, estadoSolicitud: "SOLICITADO" }, estadoVuelo: null };
  vi.mocked(api).mockImplementation((path) => path === "/flights" ? Promise.resolve([operational, unplanned, sanitary]) : defaults(path));
  const { container } = renderApp("/app/vuelos?filtro=todos", { roles: [ROLE.ops] });
  await screen.findByText("V-OP5");
  const rows = [...container.querySelectorAll("table tbody tr")].map((r) => r.textContent);
  expect(rows.some((t) => t.includes("Aeroparque Jorge Newbery, Buenos Aires → Benjamín Matienzo, Tucumán"))).toBe(true);
  expect(rows.some((t) => t.includes("Tafí Viejo, Tucumán → Rosario, Santa Fe"))).toBe(true);
  expect(rows.some((t) => t.includes("V-SIN") && t.includes("— → —"))).toBe(true);
  expect(container.textContent).not.toContain("undefined");
});

test("el listado de vuelos conserva búsqueda y situación en la URL y el detalle se abre con un enlace", async () => {
  const flight = (id, codigo, estadoVuelo) => ({ id, codigo, tipo: { codigo: "OTRO", nombre: "Otro" }, motivoVuelo: "m", estadoVuelo, datosSanitarios: null, origen: "A", destino: "B" });
  vi.mocked(api).mockImplementation((path) => path === "/flights" ? Promise.resolve([flight(1, "V-ABIERTO", "PLANIFICADO"), flight(2, "V-FIN", "FINALIZADO")]) : defaults(path));
  renderApp("/app/vuelos", { roles: [ROLE.ops] });
  expect(await screen.findByRole("link", { name: "V-ABIERTO" })).toHaveAttribute("href", "/app/vuelos/1");
  expect(screen.queryByRole("link", { name: "V-FIN" })).toBeNull();            // por defecto sólo los abiertos
  fireEvent.click(screen.getByRole("button", { name: /Finalizados/ }));
  expect(await screen.findByRole("link", { name: "V-FIN" })).toBeInTheDocument(); expect(currentPath()).toContain("filtro=finalizados");
  fireEvent.change(screen.getByLabelText("Buscar vuelos"), { target: { value: "fin" } });
  await waitFor(() => expect(currentPath()).toContain("q=fin"));
});

test("«Mi cuenta» es alcanzable desde todas las áreas con sus propios contactos y sobrevive a la recarga", async () => {
  for (const [workspace, role] of [["DTS", ROLE.dts], ["COMANDANTE", ROLE.cmd], ["OPERACIONES", ROLE.ops], ["ADMIN", ROLE.admin]]) {
    renderApp("/app/inicio", { roles: [role], username: workspace.toLowerCase() });
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(workspace.toLowerCase()) }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mi cuenta" }));
    expect(await screen.findByRole("heading", { name: "Mis datos de contacto" })).toBeInTheDocument();
    expect(await screen.findByText("ana@example.test")).toBeInTheDocument();
    expect(currentPath()).toBe("/app/mi-cuenta");
    cleanup();
    renderApp("/app/mi-cuenta", { roles: [role] });          // «recargar» en esa URL
    expect(await screen.findByRole("heading", { name: "Mis datos de contacto" })).toBeInTheDocument();
    cleanup();
  }
});

// ---- Carcasa responsive y accesible ----

test("la barra lateral se contrae en escritorio y recuerda la preferencia", async () => {
  renderApp("/app/inicio", { roles: [ROLE.cmd] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  const sidebar = document.getElementById("app-sidebar");
  expect(sidebar).not.toHaveClass("is-collapsed");
  fireEvent.click(screen.getByRole("button", { name: "Contraer el menú lateral" }));
  expect(sidebar).toHaveClass("is-collapsed"); expect(localStorage.getItem("vs-sidebar")).toBe("collapsed");
  expect(screen.getByRole("button", { name: "Expandir el menú lateral" })).toHaveAttribute("aria-pressed", "true");
  expect(within(nav()).getByRole("link", { name: "Mis vuelos" })).toHaveAttribute("title", "Mis vuelos");     // sin texto visible, el nombre queda en el título
  cleanup(); renderApp("/app/inicio", { roles: [ROLE.cmd] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  expect(document.getElementById("app-sidebar")).toHaveClass("is-collapsed");
});

test("en móvil el menú se abre con el botón, se cierra con Escape y al navegar", async () => {
  renderApp("/app/inicio", { roles: [ROLE.dts] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  const toggle = screen.getByRole("button", { name: "Abrir el menú de navegación" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(document.getElementById("app-sidebar")).toHaveClass("is-open"); expect(toggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(document.getElementById("app-sidebar")).not.toHaveClass("is-open");
  fireEvent.click(toggle); fireEvent.click(within(nav()).getByRole("link", { name: "Personal sanitario" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Personal sanitario" })).toBeInTheDocument();
  expect(document.getElementById("app-sidebar")).not.toHaveClass("is-open");
});

test("la campana muestra los avisos sin leer y el tema claro/oscuro se recuerda", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/notifications" ? Promise.resolve({ items: [{ id: 1, tipo: "NEW_SANITARY_REQUEST", mensaje: "Nueva", leido: false }], unread: 3 }) : defaults(path));
  renderApp("/app/inicio", { roles: [ROLE.ops] });
  expect(await screen.findByRole("link", { name: "Notificaciones: 3 sin leer" })).toHaveAttribute("href", "/app/notificaciones");
  expect(within(nav()).getByRole("link", { name: /Notificaciones/ })).toHaveTextContent("3");
  fireEvent.click(screen.getByRole("button", { name: "Usar tema oscuro" }));
  expect(document.documentElement.dataset.theme).toBe("dark"); expect(document.body.dataset.theme).toBe("dark"); expect(localStorage.getItem("vs-theme")).toBe("dark");
  expect(screen.getByRole("button", { name: "Usar tema claro" })).toBeInTheDocument();
});

test("cada pantalla tiene un único título de nivel 1, migas de pan y actualiza el título del documento", async () => {
  renderApp("/app/aeronaves/nueva", { roles: [ROLE.admin] });
  const title = await screen.findByRole("heading", { level: 1, name: "Nueva aeronave" });
  expect(screen.getAllByRole("heading", { level: 1 })).toEqual([title]);
  const crumbs = screen.getByRole("navigation", { name: "Ruta de navegación" });
  expect(within(crumbs).getByRole("link", { name: "Aeronaves" })).toHaveAttribute("href", "/app/aeronaves");
  expect(within(crumbs).getByText("Nueva aeronave")).toHaveAttribute("aria-current", "page");
  expect(document.title).toBe("Nueva aeronave · Vuelos Sanitarios");
});

test("al cambiar de pantalla el foco pasa al contenido y hay un enlace para saltar la navegación", async () => {
  renderApp("/app/inicio", { roles: [ROLE.cmd] });
  await screen.findByRole("heading", { level: 1, name: /Hola,/ });
  expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute("href", "#main-content");
  await go("/app/informes");
  await screen.findByRole("heading", { level: 1, name: "Informes finales" });
  expect(document.getElementById("main-content")).toHaveFocus();
});
