import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { CREW_CONTACTS_TTL_MS, CrewContacts } from "./crewContacts";
import { FlightCrew } from "./main.jsx";

vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));

const failure = (message, extra = {}) => Object.assign(new Error(message), extra);
const crewRows = [
  { id: 1, userId: 10, nombre: "Ana", apellido: "Piloto", crewRoleCode: "COMANDANTE", crewRoleName: "Comandante", comandante: true, vigente: true },
  { id: 2, userId: 11, nombre: "Luis", apellido: "Médico", crewRoleCode: "MEDICO", crewRoleName: "Médico", comandante: false, vigente: true },
  { id: 3, userId: 12, nombre: "Eva", apellido: "Enfermera", crewRoleCode: "ENFERMERO", crewRoleName: "Enfermero", comandante: false, vigente: true },
];
const contacts = {
  vueloId: 7, vueloCodigo: "V-7",
  tripulantes: [
    { asignacionId: 1, nombre: "Ana", apellido: "Piloto", funcionCode: "COMANDANTE", funcion: "Comandante", comandante: true, estado: "DISPONIBLE", telefonos: [{ valor: "+54 381 555-0101", principal: true }], correos: [], hayMasContactos: false },
    { asignacionId: 2, nombre: "Luis", apellido: "Médico", funcionCode: "MEDICO", funcion: "Médico", comandante: false, estado: "DISPONIBLE", telefonos: [{ valor: "3815550201", principal: false }], correos: [{ valor: "luis@trabajo.test", principal: false }], hayMasContactos: true },
    { asignacionId: 3, nombre: "Eva", apellido: "Enfermera", funcionCode: "ENFERMERO", funcion: "Enfermero", comandante: false, estado: "SIN_CONTACTO_LABORAL", telefonos: [], correos: [], hayMasContactos: false },
  ],
};
let crew, contactsResult, calls;
function backend() {
  crew = crewRows.map((r) => ({ ...r })); contactsResult = () => Promise.resolve(JSON.parse(JSON.stringify(contacts))); calls = [];
  vi.mocked(api).mockImplementation((path, options) => {
    calls.push([path, options]);
    if (path === "/flights/7/crew") return Promise.resolve(crew.map((r) => ({ ...r })));
    if (path === "/flights/7/crew/contacts") return contactsResult();
    if (path.startsWith("/flights/7/crew/") && options?.method === "DELETE") { const id = Number(path.split("/").pop()); crew = crew.filter((r) => r.id !== id); return Promise.resolve(null); }
    if (path === "/catalogs/crew-roles") return Promise.resolve([]);
    return Promise.resolve([]);
  });
}
// El panel registra sus efectos de montaje tras el commit que muestra la tripulación: sin vaciarlos, bajo carga el clic llegaba antes y el efecto invalidaba la consulta recién iniciada.
const ready = async () => { await screen.findByText(/Luis Médico/); await act(async () => {}); };
const contactCalls = () => calls.filter(([p]) => p === "/flights/7/crew/contacts");
// Consultas por texto + selector: getByRole con nombre recorre todo el DOM de main.jsx y bajo carga paralela tarda segundos.
const button = () => screen.getByText("Consultar contactos de la tripulación", { selector: "button" });
const absent = () => screen.queryByText("Consultar contactos de la tripulación", { selector: "button" });
const hide = () => fireEvent.click(screen.getByText("Ocultar contactos", { selector: "button" }));
beforeEach(() => { vi.mocked(api).mockReset(); window.confirm = vi.fn(() => true); try { localStorage.clear(); sessionStorage.clear(); } catch { /* sin almacenamiento */ } });
afterEach(cleanup);

test("Operaciones ve el botón junto a la tripulación y no se piden contactos hasta presionarlo", async () => {
  backend();
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  expect(button()).toBeEnabled();
  expect(contactCalls()).toHaveLength(0);
  expect(screen.queryByText("3815550201")).toBeNull();
});

test("quien no gestiona el vuelo (comandante) no ve el botón", async () => {
  backend();
  render(<FlightCrew flightId={7} state="PLANIFICADO" msg={vi.fn()} />);
  await ready();
  expect(absent()).toBeNull();
  expect(contactCalls()).toHaveLength(0);
});

test("sin tripulantes o con el vuelo terminal el botón no se ofrece", async () => {
  backend(); crew = [];
  const { unmount } = render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await screen.findByText("Sin tripulantes registrados.");
  expect(absent()).toBeNull();
  unmount();
  for (const state of ["FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"]) {
    backend();
    const view = render(<FlightCrew flightId={7} state={state} canManage msg={vi.fn()} />);
    await ready();
    expect(absent()).toBeNull();
    view.unmount();
  }
});

test("la consulta explícita muestra a cada tripulante con su función, teléfono y correo por separado y los estados sin contacto", async () => {
  backend();
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  fireEvent.click(button());
  const panel = await screen.findByText("Contactos laborales de la tripulación", { selector: "h5" });
  expect(contactCalls()).toHaveLength(1);
  const section = panel.closest("section");
  const items = within(section).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent("Ana Piloto · Comandante");
  expect(items[0]).toHaveTextContent("Teléfono: +54 381 555-0101 (principal)");
  expect(items[0]).not.toHaveTextContent("Correo:");
  expect(items[1]).toHaveTextContent("Luis Médico · Médico");
  expect(items[1]).toHaveTextContent("Teléfono: 3815550201");
  expect(items[1]).toHaveTextContent("Correo: luis@trabajo.test");
  expect(items[1]).toHaveTextContent("Tiene más contactos laborales");
  expect(items[2]).toHaveTextContent("Eva Enfermera · Enfermero");
  expect(items[2]).toHaveTextContent("No hay contacto laboral disponible.");
  expect(items[2]).not.toHaveTextContent("Teléfono:");
  expect(section).toHaveTextContent(/datos laborales declarados/i);
  expect(section).toHaveTextContent(/correos que se muestran fueron verificados/i);
  expect(section).toHaveTextContent(/no se verifican por SMS/i);
  expect(section.textContent).not.toMatch(/tel[eé]fono[^.]*verificado/i);   // el teléfono nunca se presenta como verificado
  expect(absent()).toBeNull();
});

test("una cuenta no activa no muestra contactos", async () => {
  backend();
  contactsResult = () => Promise.resolve({ ...contacts, tripulantes: [{ ...contacts.tripulantes[2], estado: "CUENTA_NO_ACTIVA" }] });
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  fireEvent.click(button());
  expect(await screen.findByText("La cuenta no está activa: no se muestran contactos.")).toBeInTheDocument();
});

test("muestra el estado de carga y deshabilita el botón mientras consulta", async () => {
  backend(); let release;
  contactsResult = () => new Promise((resolve) => { release = () => resolve(JSON.parse(JSON.stringify(contacts))); });
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  fireEvent.click(button());
  const busy = await screen.findByText("Consultando contactos…", { selector: "button" });
  expect(busy).toBeDisabled(); fireEvent.click(busy); expect(contactCalls()).toHaveLength(1);
  release();
  expect(await screen.findByText("3815550201")).toBeInTheDocument();
});

test("un error de permisos o un vuelo cerrado se informa sin dejar datos en pantalla y permite reintentar", async () => {
  backend();
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  contactsResult = () => Promise.reject(failure("Acceso denegado", { code: undefined }));
  fireEvent.click(button());
  expect(await screen.findByRole("alert")).toHaveTextContent("Acceso denegado");
  expect(screen.queryByText("3815550201")).toBeNull();
  contactsResult = () => Promise.reject(failure("El vuelo está FINALIZADO; los contactos de la tripulación no se consultan", { code: "CREW_CONTACTS_CLOSED" }));
  fireEvent.click(button());
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("FINALIZADO"));
  expect(screen.queryByText("3815550201")).toBeNull();
  contactsResult = () => Promise.resolve(JSON.parse(JSON.stringify(contacts)));
  fireEvent.click(button());
  expect(await screen.findByText("3815550201")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("una respuesta inválida no se muestra como contactos", async () => {
  backend(); contactsResult = () => Promise.resolve({ algo: "inesperado" });
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  fireEvent.click(button());
  expect(await screen.findByRole("alert")).toHaveTextContent("Respuesta de contactos inválida");
});

test("cerrar el panel descarta los contactos del estado y volver a abrir pide datos nuevos", async () => {
  backend();
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  fireEvent.click(button());
  await screen.findByText("3815550201");
  hide();
  expect(screen.queryByText("3815550201")).toBeNull(); expect(screen.queryByText("luis@trabajo.test")).toBeNull();
  expect(document.body.textContent).not.toMatch(/555-0101|3815550201|luis@trabajo/);
  contacts.tripulantes[1].telefonos[0].valor = "3815550299";
  fireEvent.click(button());
  expect(await screen.findByText("3815550299")).toBeInTheDocument();
  expect(contactCalls()).toHaveLength(2);
  contacts.tripulantes[1].telefonos[0].valor = "3815550201";
});

test("si cambia la tripulación se descartan los contactos obtenidos y se avisa; no se consulta solo", async () => {
  backend();
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  fireEvent.click(button());
  await screen.findByText("luis@trabajo.test");
  fireEvent.click(screen.getAllByText("Retirar", { selector: "button" })[0]);   // retira a Luis (el comandante no tiene acción)
  await waitFor(() => expect(screen.queryByText(/Luis Médico/)).toBeNull());
  expect(screen.queryByText("luis@trabajo.test")).toBeNull(); expect(screen.queryByText("3815550201")).toBeNull();
  expect(await screen.findByRole("status")).toHaveTextContent("La tripulación cambió");
  expect(contactCalls()).toHaveLength(1);
  expect(button()).toBeEnabled();
});

test("una respuesta que llega después de cambiar de vuelo o de cerrar no se muestra", async () => {
  let resolveOld;
  vi.mocked(api).mockImplementation((path) => path === "/flights/7/crew/contacts" ? new Promise((resolve) => { resolveOld = () => resolve(JSON.parse(JSON.stringify(contacts))); }) : Promise.resolve([]));
  const { rerender } = render(<CrewContacts flightId={7} state="PLANIFICADO" crewKey="1:10:COMANDANTE" />);
  fireEvent.click(button());
  rerender(<CrewContacts flightId={8} state="PLANIFICADO" crewKey="9:10:COMANDANTE" />);
  resolveOld();
  await waitFor(() => expect(button()).toBeEnabled());
  expect(screen.queryByText("3815550201")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();   // otro vuelo: no es "la tripulación cambió"
});

test("al terminar el vuelo mientras se muestran, los contactos desaparecen", async () => {
  backend();
  const { rerender } = render(<CrewContacts flightId={7} state="PLANIFICADO" crewKey="k" />);
  fireEvent.click(button());
  await screen.findByText("3815550201");
  rerender(<CrewContacts flightId={7} state="FINALIZADO" crewKey="k" />);
  expect(screen.queryByText("3815550201")).toBeNull();
  expect(document.body.textContent).not.toMatch(/3815550201/);
});

test("los contactos no se guardan en el almacenamiento del navegador", async () => {
  backend();
  render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()} />);
  await ready();
  fireEvent.click(button());
  await screen.findByText("3815550201");
  const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
  expect(dump).not.toMatch(/3815550201|luis@trabajo|555-0101/);
});

test("los contactos se ocultan solos pasado el tiempo de exhibición y se avisa", async () => {
  backend();
  vi.useFakeTimers({ shouldAdvanceTime: true });   // el reloj avanza solo para que findBy/waitFor funcionen; el salto largo lo damos a mano
  try {
    render(<CrewContacts flightId={7} state="PLANIFICADO" crewKey="k" />);
    fireEvent.click(button());
    await screen.findByText("3815550201");
    await act(async () => {});   // vacía los efectos pendientes: el temporizador se registra al confirmarse el render
    await act(async () => { vi.advanceTimersByTime(CREW_CONTACTS_TTL_MS - 5000); });
    expect(screen.getByText("3815550201")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByText("3815550201")).toBeNull();
    expect(screen.getByText(/se ocultaron por el tiempo transcurrido/)).toBeInTheDocument();
    expect(button()).toBeEnabled();
    expect(contactCalls()).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});

test("informa que existe un correo o teléfono laboral sin verificar o sin validar, sin mostrarlo", async () => {
  backend();
  contactsResult = () => Promise.resolve({ ...contacts, tripulantes: [
    { ...contacts.tripulantes[2], estado: "SIN_CONTACTO_LABORAL", correoLaboralSinVerificar: true, telefonoLaboralSinValidar: false },
    { ...contacts.tripulantes[2], asignacionId: 9, nombre: "Zoe", apellido: "Vieja", estado: "SIN_CONTACTO_LABORAL", correoLaboralSinVerificar: false, telefonoLaboralSinValidar: true },
  ] });
  render(<CrewContacts flightId={7} state="PLANIFICADO" crewKey="k" />);
  fireEvent.click(button());
  const heading = await screen.findByText("Contactos laborales de la tripulación", { selector: "h5" });
  const items = within(heading.closest("section")).getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("Tiene un correo laboral sin verificar: no se muestra");
  expect(items[0]).toHaveTextContent("No hay contacto laboral disponible.");
  expect(items[1]).toHaveTextContent("Tiene un teléfono laboral sin país validado: no se muestra");
  expect(items[1]).not.toHaveTextContent("Correo:");
});
