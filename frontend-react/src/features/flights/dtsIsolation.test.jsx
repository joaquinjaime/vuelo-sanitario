import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { renderApp, ROLE, signIn } from "../../test-utils";
const session = (roles, username, token) => { signIn(roles, { username }); localStorage.setItem("vs-token", token); };

vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

/** Aislamiento de las solicitudes de cada DTS en la pantalla «Mis solicitudes» y al cambiar de cuenta en el mismo navegador. */
const request = (id, code, state = "SOLICITADO") => ({ id, codigo: code, estadoVuelo: null, tipo: { codigo: "SANITARIO" }, datosSanitarios: { fechaSolicitada: "2026-10-23T09:00:00", extremaUrgencia: false, estadoSolicitud: state, localidadOrigenSolicitada: { nombre: "Tafí Viejo", provincia: "Tucumán" }, localidadDestinoSolicitada: { nombre: "Rosario", provincia: "Santa Fe" } } });
// «Servidor» simulado: devuelve a cada token únicamente lo que el backend le devolvería a esa cuenta.
const BY_TOKEN = { "token-a": [request(1, "V-001"), request(2, "V-002", "APROBADO")], "token-b": [request(3, "V-003")], "token-vacio": [] };
const ACCOUNTS = { dtsa: { accessToken: "token-a", username: "dtsa", roles: ["DTS"], debeCambiarContrasena: false }, dtsb: { accessToken: "token-b", username: "dtsb", roles: ["DTS"], debeCambiarContrasena: false } };
const backend = () => vi.mocked(api).mockImplementation((path, options) => {
  if (path === "/auth/login" && options?.method === "POST") return Promise.resolve(ACCOUNTS[JSON.parse(options.body).username]);
  if (path.startsWith("/flights")) return Promise.resolve(BY_TOKEN[localStorage.getItem("vs-token")] || []);
  if (path === "/notifications") return Promise.resolve({ items: [], unread: 0 });
  return Promise.resolve([]);
});
beforeEach(() => { vi.mocked(api).mockReset(); localStorage.clear(); sessionStorage.clear(); backend(); });
afterEach(cleanup);

const rowsText = () => [...document.querySelectorAll("table tbody tr")].map((row) => row.textContent);
const login = async (username) => {
  fireEvent.change(await screen.findByLabelText("Usuario"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "clave-de-prueba" } });
  fireEvent.submit(screen.getByRole("button", { name: "Iniciar sesión" }).closest("form"));
};
const counter = (name) => within(screen.getByRole("group", { name: "Situación" })).getByRole("button", { name: new RegExp(`^${name}`) });

test("«Mis solicitudes» pide al servidor sólo las solicitudes propias y los contadores salen de ese conjunto", async () => {
  session([ROLE.dts], "dtsa", "token-a"); renderApp("/app/solicitudes");
  await screen.findByText("V-001");
  expect(api).toHaveBeenCalledWith("/flights?scope=mine");
  expect(vi.mocked(api).mock.calls.some(([path]) => path === "/flights")).toBe(false);
  expect(rowsText()).toHaveLength(2);
  expect(screen.queryByText("V-003")).not.toBeInTheDocument();
  expect(counter("Todas")).toHaveTextContent("2");
  // La búsqueda opera sobre el conjunto propio: el código de una solicitud ajena no produce resultados.
  fireEvent.change(screen.getByLabelText("Buscar mis solicitudes"), { target: { value: "V-003" } });
  expect(await screen.findByText("Ningún resultado coincide con la búsqueda")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar mis solicitudes"), { target: { value: "V-002" } });
  await waitFor(() => expect(rowsText()).toHaveLength(1));
});

test("al cerrar sesión e ingresar otra cuenta DTS no queda ningún dato de la anterior", async () => {
  renderApp("/app/solicitudes");
  await login("dtsa");
  await screen.findByText("V-001");
  expect(screen.getByText("V-002")).toBeInTheDocument();

  fireEvent.click(await screen.findByRole("button", { name: /dtsa/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/V-001|V-002/);

  await login("dtsb");
  await screen.findByText("V-003");
  expect(rowsText()).toHaveLength(1);
  expect(document.body.textContent).not.toMatch(/V-001|V-002/);
  expect(counter("Todas")).toHaveTextContent("1");
  expect(localStorage.getItem("vs-token")).toBe("token-b");
});

test("quien no creó solicitudes ve un estado vacío con la opción de crear la primera", async () => {
  session([ROLE.dts], "nuevo", "token-vacio"); renderApp("/app/solicitudes");
  expect(await screen.findByText("Todavía no cargó ninguna solicitud")).toBeInTheDocument();
  const create = screen.getAllByRole("link", { name: /Nueva solicitud/ }).find((link) => link.closest("main"));
  expect(create).toHaveAttribute("href", "/app/solicitudes/nueva");
  expect(rowsText()).toHaveLength(0);
});

test("las demás áreas conservan el listado completo que les corresponde (sin el alcance «mine»)", async () => {
  vi.mocked(api).mockImplementation((path) => path.startsWith("/flights") ? Promise.resolve([request(1, "V-001"), request(3, "V-003")]) : path === "/notifications" ? Promise.resolve({ items: [], unread: 0 }) : Promise.resolve([]));
  renderApp("/app/solicitudes", { roles: [ROLE.ops] });
  await screen.findByText("V-001");
  expect(screen.getByText("V-003")).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/flights");
  expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("scope=mine"))).toBe(false);
});
