import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../../services/api";
import { currentPath, renderApp, ROLE } from "../../../test-utils";
import { tabsFor } from "./flightTabs";
import { nextStep } from "./nextStep";
import { adaptFlight } from "../../../utils/flightAdapter";

vi.mock("../../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); localStorage.clear(); sessionStorage.clear(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

const operational = (id, estadoVuelo, extra = {}) => ({ id, codigo: `OP-${id}`, estadoVuelo, tipo: { codigo: "OTRO", nombre: "Otro" }, motivoVuelo: "Reposicionamiento", datosSanitarios: null, origen: "A", destino: "B", ...extra });
const sanitary = (id, state, extra = {}) => ({ id, codigo: `SAN-${id}`, estadoVuelo: extra.estadoVuelo ?? null, tipo: { codigo: "SANITARIO" }, salida: extra.salida ?? null, datosSanitarios: { estadoSolicitud: state, fechaSolicitada: "2026-11-10T09:00:00", extremaUrgencia: false, prioridad: "ALTA", localidadOrigenSolicitada: { nombre: "Tafí Viejo", provincia: "Tucumán" }, localidadDestinoSolicitada: { nombre: "Rosario", provincia: "Santa Fe" } } });
const serve = (detail, own) => vi.mocked(api).mockImplementation((path, options) => {
  const mine = own?.(path, options); if (mine !== undefined) return mine;
  if (path === "/notifications") return Promise.resolve({ items: [], unread: 0 });
  if (/^\/flights\/\d+$/.test(path) && options?.method !== "POST") return Promise.resolve(typeof detail === "function" ? detail() : detail);
  if (path === "/catalogs/cancellation-reasons") return Promise.resolve([{ id: 1, codigo: "SIN_AERONAVE_ASIGNADA", nombre: "Falta de aeronave" }]);
  return Promise.resolve([]);
});

// ---- Reglas puras: pestañas habilitadas y guía por estado ----

const stageTabs = (workspace, state, extra = {}) => tabsFor({ workspace, flight: adaptFlight(sanitary(1, state, extra)), events: extra.events || [] });
const enabled = (model) => model.tabs.filter((tab) => !tab.locked).map((tab) => tab.key);

test("antes del acuerdo de horario sólo están habilitados el resumen y la negociación (y la solicitud se abre en la negociación)", () => {
  for (const state of ["SOLICITADO", "PENDIENTE_RESPUESTA_DTS"]) {
    const ops = stageTabs("OPERACIONES", state);
    expect(enabled(ops)).toEqual(["resumen", "negociacion"]); expect(ops.defaultKey).toBe("negociacion");
    expect(ops.tabs.filter((tab) => tab.locked).every((tab) => /acordado/.test(tab.reason))).toBe(true);
    const dts = stageTabs("DTS", state);
    expect(enabled(dts)).toEqual(["resumen", "negociacion", "historial"]); expect(dts.defaultKey).toBe("negociacion");
  }
});

test("con el horario acordado se habilitan la preparación y los documentos, y el detalle se abre en el resumen", () => {
  const ops = stageTabs("OPERACIONES", "APROBADO", { salida: "2026-11-10T09:00:00" });
  expect(enabled(ops)).toEqual(["resumen", "negociacion", "planificacion", "equipo", "documentos", "historial"]); expect(ops.defaultKey).toBe("resumen");
  expect(ops.tabs.find((tab) => tab.key === "operacion").locked).toBe(true);        // la ejecución sólo existe con recursos asignados
  const planned = stageTabs("OPERACIONES", "APROBADO", { estadoVuelo: "PLANIFICADO", salida: "2026-11-10T09:00:00" });
  expect(enabled(planned)).toContain("operacion");
});

test("una solicitud rechazada conserva sólo su resumen y su historial; un vuelo cancelado después del acuerdo conserva la consulta", () => {
  const rejected = stageTabs("OPERACIONES", "RECHAZADO");
  expect(enabled(rejected)).toEqual(["resumen", "negociacion", "historial"]); expect(rejected.tabs.find((tab) => tab.key === "documentos").reason).toMatch(/sin acuerdo/);
  const cancelled = stageTabs("OPERACIONES", "CANCELADO", { estadoVuelo: "CANCELADO", salida: "2026-11-10T09:00:00" });
  expect(enabled(cancelled)).toEqual(expect.arrayContaining(["resumen", "planificacion", "documentos", "operacion"]));
});

test("el DTS nunca tiene herramientas operativas y el comandante tiene todas sus pestañas", () => {
  const dts = stageTabs("DTS", "APROBADO", { salida: "2026-11-10T09:00:00" });
  expect(dts.tabs.map((tab) => tab.key)).toEqual(["resumen", "negociacion", "equipo", "documentos", "historial"]);
  expect(dts.tabs.find((tab) => tab.key === "equipo").label).toBe("Personal y contactos");
  const cmd = tabsFor({ workspace: "COMANDANTE", flight: adaptFlight(operational(1, "PLANIFICADO")), events: [] });
  expect(cmd.tabs.map((tab) => tab.key)).toEqual(["resumen", "planificacion", "equipo", "documentos", "operacion", "historial"]); expect(enabled(cmd)).toHaveLength(6);
});

test("los vuelos operativos (sin solicitud) conservan todas sus secciones", () => {
  const model = tabsFor({ workspace: "OPERACIONES", flight: adaptFlight(operational(1, "PENDIENTE_CONFIRMACION_COMANDANTE")), events: [] });
  expect(enabled(model)).toHaveLength(7); expect(model.defaultKey).toBe("resumen");
});

test("la guía «qué sigue» sale del estado real y apunta a la pestaña donde se resuelve", () => {
  const flight = (state, extra) => adaptFlight(sanitary(1, state, extra));
  expect(nextStep({ workspace: "OPERACIONES", flight: flight("SOLICITADO") })).toMatchObject({ tone: "action", tab: "negociacion" });
  expect(nextStep({ workspace: "OPERACIONES", flight: flight("PENDIENTE_RESPUESTA_DTS") })).toMatchObject({ tone: "wait" });
  expect(nextStep({ workspace: "OPERACIONES", flight: flight("APROBADO") })).toMatchObject({ tone: "action", tab: "planificacion" });
  expect(nextStep({ workspace: "DTS", flight: flight("PENDIENTE_RESPUESTA_DTS") })).toMatchObject({ tone: "action", tab: "negociacion" });
  expect(nextStep({ workspace: "DTS", flight: flight("APROBADO") })).toMatchObject({ tone: "wait", tab: "equipo" });
  expect(nextStep({ workspace: "COMANDANTE", flight: adaptFlight(operational(1, "PENDIENTE_CONFIRMACION_COMANDANTE")) })).toMatchObject({ tone: "action", inline: true });
  expect(nextStep({ workspace: "COMANDANTE", flight: adaptFlight(operational(1, "FINALIZADO")) })).toMatchObject({ link: "informes" });
  expect(nextStep({ workspace: "OPERACIONES", flight: flight("RECHAZADO") })).toMatchObject({ tone: "done", title: "Solicitud rechazada" });
  expect(nextStep({ workspace: "OPERACIONES", flight: null })).toBeNull();
});

// ---- Pantalla ----

test("una pestaña inexistente en la URL vuelve al detalle", async () => {
  serve({ vuelo: operational(1, "PLANIFICADO"), recursos: {}, negociacion: [] });
  renderApp("/app/vuelos/1/no-existe", { roles: [ROLE.ops] });
  expect(await screen.findByRole("heading", { level: 1, name: "Vuelo OP-1" })).toBeInTheDocument();
  await waitFor(() => expect(currentPath()).toBe("/app/vuelos/1"));
});

test("un vuelo que no se puede leer informa el error con reintento y enlace de regreso", async () => {
  vi.mocked(api).mockImplementation((path) => path.startsWith("/flights/") ? Promise.reject(Object.assign(new Error("No tiene acceso a este vuelo"), { status: 403 })) : Promise.resolve(path === "/notifications" ? { items: [], unread: 0 } : []));
  renderApp("/app/vuelos/9", { roles: [ROLE.cmd] });
  expect(await screen.findByRole("alert")).toHaveTextContent("No tiene acceso a este vuelo");
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Ruta de navegación" })).getByRole("link", { name: "Mis vuelos" })).toHaveAttribute("href", "/app/vuelos");
});

test("las pestañas tienen URL propia, marcan la actual y no suman entradas al historial", async () => {
  serve({ vuelo: operational(1, "PLANIFICADO"), recursos: {}, negociacion: [] });
  renderApp("/app/vuelos/1", { roles: [ROLE.ops] });
  const tabs = await screen.findByRole("navigation", { name: /Secciones de OP-1/ });
  expect(within(tabs).getByRole("link", { name: "Resumen" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(within(tabs).getByRole("link", { name: "Documentos" }));
  await waitFor(() => expect(currentPath()).toBe("/app/vuelos/1/documentos"));
  expect(within(tabs).getByRole("link", { name: "Documentos" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("region", { name: "Documentos" })).toBeInTheDocument();
});

test("el comandante acepta la asignación y la planificación de la ruta se habilita al releer el estado real", async () => {
  let accepted = false;
  serve(() => ({ vuelo: operational(1, accepted ? "PLANIFICADO" : "PENDIENTE_CONFIRMACION_COMANDANTE"), recursos: {}, negociacion: [] }), (path, options) => {
    if (path === "/flights/1/commander-assignment/response" && options?.method === "POST") { accepted = true; return Promise.resolve({}); }
    if (path === "/flights/1/route") return Promise.resolve({ estado: "SIN_PLANIFICAR", versiones: [], editable: accepted, causas: [] });
    return undefined;
  });
  renderApp("/app/vuelos/1", { roles: [ROLE.cmd] });
  expect(await screen.findByText("Confirme la asignación")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Aceptar asignación" }));
  expect(await screen.findByText("Prepare el vuelo")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Aceptar asignación" })).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Planificación" }));
  expect(await screen.findByLabelText("Recorrido y puntos intermedios en orden")).toBeInTheDocument();
});

test("el historial meteorológico se actualiza cuando el comandante registra las condiciones", async () => {
  let saved = false;
  serve({ vuelo: operational(1, "PLANIFICADO"), recursos: {}, negociacion: [] }, (path, options) => {
    if (path === "/flights/1/weather" && options?.method === "POST") { saved = true; return Promise.resolve({}); }
    if (path === "/flights/1/weather") return Promise.resolve(saved ? [{ id: 1, condiciones: "Nubes bajas", favorable: false, observaciones: "Viento", fechaRegistro: "2026-10-18T12:00:00", registradoPor: "piloto" }] : []);
    return undefined;
  });
  renderApp("/app/vuelos/1/planificacion", { roles: [ROLE.cmd] });
  expect(await screen.findByText("Sin registros meteorológicos.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Condiciones"), { target: { value: "Nubes bajas" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar clima" }));
  expect(await screen.findByText(/No favorable/)).toBeInTheDocument(); expect(screen.getByText("Nubes bajas")).toBeInTheDocument();
  expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/1/weather", expect.objectContaining({ method: "POST" }));
});

test("sólo el vuelo planificado permite registrar clima; Operaciones sólo consulta el historial", async () => {
  serve({ vuelo: operational(1, "PLANIFICADO"), recursos: {}, negociacion: [] });
  renderApp("/app/vuelos/1/planificacion", { roles: [ROLE.ops] });
  expect(await screen.findByText("Historial meteorológico")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Registrar clima" })).toBeNull();
});

test("Operaciones cancela un vuelo planificado con motivo desde el encabezado; en curso ya no se ofrece", async () => {
  let state = "PLANIFICADO";
  const calls = [];
  serve(() => ({ vuelo: operational(1, state), recursos: {}, negociacion: [] }), (path, options) => { if (options?.method === "POST") { calls.push([path, JSON.parse(options.body)]); state = "CANCELADO"; return Promise.resolve({}); } return undefined; });
  renderApp("/app/vuelos/1", { roles: [ROLE.ops] });
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar vuelo" }));
  const dialog = await screen.findByRole("dialog"); const confirm = within(dialog).getByRole("button", { name: "Confirmar cancelación" }); expect(confirm).toBeDisabled();
  await waitFor(() => expect(within(dialog).getByRole("option", { name: "Falta de aeronave" })).toBeInTheDocument());
  fireEvent.change(within(dialog).getByLabelText("Motivo de cancelación"), { target: { value: "1" } }); fireEvent.click(confirm);
  await waitFor(() => expect(calls).toEqual([["/flights/1/cancel", { motivoCancelacionId: "1", motivoCancelacionPersonalizado: null }]]));
  expect(await screen.findByText("Vuelo cancelado")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar vuelo" })).toBeNull());
  cleanup(); serve({ vuelo: operational(2, "EN_CURSO"), recursos: {}, negociacion: [] });
  renderApp("/app/vuelos/2", { roles: [ROLE.ops] });
  await screen.findByRole("heading", { level: 1, name: "Vuelo OP-2" }); expect(screen.queryByRole("button", { name: "Cancelar vuelo" })).toBeNull();
});

test("Operaciones inicia el vuelo planificado desde «Ejecución y cierre» con confirmación", async () => {
  serve({ vuelo: operational(1, "PLANIFICADO"), recursos: {}, negociacion: [] }, (path, options) => (path === "/flights/1/start" && options?.method === "POST" ? Promise.resolve({}) : undefined));
  renderApp("/app/vuelos/1/operacion", { roles: [ROLE.ops] });
  fireEvent.click(await screen.findByRole("button", { name: "Iniciar vuelo" }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("OP-1"));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights/1/start", expect.objectContaining({ method: "POST" })));
  expect(await screen.findByText("Vuelo iniciado")).toBeInTheDocument();
});

test("el DTS ve únicamente las pestañas de su área y nunca las herramientas de Operaciones", async () => {
  serve({ vuelo: sanitary(1, "APROBADO", { salida: "2026-11-10T09:00:00" }), negociacion: [] });
  renderApp("/app/solicitudes/1", { roles: [ROLE.dts] });
  const tabs = await screen.findByRole("navigation", { name: /Secciones de SAN-1/ });
  expect(within(tabs).getAllByRole("link").map((a) => a.textContent)).toEqual(["Resumen", "Negociación", "Personal y contactos", "Documentos", "Historial"]);
  expect(screen.queryByRole("button", { name: /Cancelar vuelo/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Cancelar solicitud" })).toBeInTheDocument();
});

test("la etapa se informa con el indicador de avance y el estado con texto, no sólo con color", async () => {
  serve({ vuelo: sanitary(1, "SOLICITADO"), negociacion: [] });
  renderApp("/app/solicitudes/1", { roles: [ROLE.ops] });
  const stepper = await screen.findByRole("list", { name: "Etapas del proceso" });
  expect(within(stepper).getByText(/Negociación del horario/).closest("li")).toHaveAttribute("aria-current", "step");
  expect(within(stepper).getByText(/etapa actual/)).toBeInTheDocument();
  expect(screen.getAllByText("Nueva solicitud").length).toBeGreaterThan(0);
});
