import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { renderApp, ROLE } from "../../test-utils";

vi.mock("../../services/api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);

const detail = (estado) => ({ vuelo: { id: 7, codigo: "V-7", estadoVuelo: estado === "APROBADO" ? null : null, tipo: { codigo: "SANITARIO" }, salida: estado === "APROBADO" ? "2026-11-10T09:00:00" : null, datosSanitarios: { fechaSolicitada: "2026-11-10T09:00:00", extremaUrgencia: false, estadoSolicitud: estado } }, negociacion: [{ id: 1, tipo: "DTS_PROPUESTA", respondeA: null, fechaOcurrencia: "2026-11-02T08:00:00", actor: "dts1" }] });
const open = async (estado, route = "/app/solicitudes/7") => {
  vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/flights/7" ? detail(estado) : path === "/catalogs/cancellation-reasons" ? [] : path === "/flights/7/documents/access" ? { disponible: true } : path === "/notifications" ? { items: [], unread: 0 } : []));
  renderApp(route, { roles: [ROLE.dts] });
};
const requested = () => vi.mocked(api).mock.calls.map(([path]) => path);

test("the DTS sees the negotiation status and no documents while the schedule is not agreed", async () => {
  await open("SOLICITADO");
  await screen.findByText("Historial de negociación");
  expect(screen.getByText(/Operaciones debe aceptar el horario solicitado/)).toBeInTheDocument();
  expect(screen.getByText("Documentos", { selector: ".tab-locked" })).toBeInTheDocument(); // la pestaña existe pero está bloqueada
  expect(screen.queryByRole("link", { name: "Documentos" })).toBeNull();
  expect(screen.queryByText("Documentos del vuelo")).toBeNull();
  expect(requested().some((path) => path.includes("/documents"))).toBe(false);
  expect(screen.getByText("El DTS solicitó el horario")).toBeInTheDocument();
});

test("once the schedule is agreed the DTS gets the read-only documents section", async () => {
  await open("APROBADO", "/app/solicitudes/7/documentos");
  expect(await screen.findByText("Documentos del vuelo")).toBeInTheDocument();
  expect(screen.queryByText(/Pendiente de evaluación/)).toBeNull();
});

test("abrir directamente la pestaña de documentos antes del acuerdo no la habilita ni consulta documentos", async () => {
  await open("SOLICITADO", "/app/solicitudes/7/documentos");
  expect(await screen.findByText(/todavía no disponible/)).toBeInTheDocument();
  expect(screen.getAllByText(/Se habilita cuando el horario quede acordado/).length).toBeGreaterThan(0);
  expect(screen.queryByText("Documentos del vuelo")).toBeNull();
  expect(requested().some((path) => path.includes("/documents"))).toBe(false);
});
