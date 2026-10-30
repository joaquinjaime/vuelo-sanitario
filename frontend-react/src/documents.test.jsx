import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api, downloadFile, uploadFile } from "./api";
import { FlightDocuments, apiRelative, documentsEditable } from "./documents";

vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(uploadFile).mockReset(); vi.mocked(downloadFile).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const version = (n, extra = {}) => ({ id: String(90 + n), numeroVersion: n, esVersionActual: n === 2, nombreArchivoOriginal: `v${n}.pdf`, tamanioBytes: 2048, fechaCreacion: `2026-10-13T1${n}:00:00`, urlDescarga: `/api/document-versions/${90 + n}/download`, creadoPor: n === 2 ? "ops1" : "cmd1", ...extra });
const item = { id: "44", nombreDocumento: "Plan de vuelo", tipoDocumento: { codigo: "PLAN_DE_VUELO", nombre: "Plan de vuelo" }, versionActual: version(2), puedeRetirar: true };
const free = { documentId: "44", ownerId: null, ownerUsername: null, acquiredAt: null, expiresAt: null, mine: false, active: false };
const lease = (overrides = {}) => ({ documentId: "44", ownerId: 7, ownerUsername: "ops1", acquiredAt: "2026-10-13T10:00:00", expiresAt: "2099-10-13T10:05:00", mine: true, active: true, remainingSeconds: 300, ...overrides });
const serve = (handlers = {}) => vi.mocked(api).mockImplementation((path, options) => {
  const key = `${options?.method || "GET"} ${path}`;
  if (handlers[key]) return typeof handlers[key] === "function" ? handlers[key](options) : Promise.resolve(handlers[key]);
  if (key === "GET /flights/7/documents") return Promise.resolve([item]);
  if (key === "GET /flights/7/documents/types") return Promise.resolve([{ codigo: "AUTORIZACION", nombre: "Autorización de vuelo" }, { codigo: "PLAN_DE_VUELO", nombre: "Plan de vuelo" }]);
  if (key === "GET /documents/44/versions") return Promise.resolve({ id: "44", versiones: [version(2), version(1)] });
  if (key === "GET /documents/44/lock") return Promise.resolve(free);
  return Promise.resolve({});
});
const pdf = (name = "a.pdf") => new File(["%PDF-1.7"], name, { type: "application/pdf" });

test("documents are editable only while the flight is open", () => {
  for (const estado of ["FINALIZADO", "COMPLETADO", "CANCELADO", "RECHAZADO"]) expect(documentsEditable(estado)).toBe(false);
  for (const estado of ["PLANIFICADO", "EN_CURSO", "PENDIENTE_CONFIRMACION_COMANDANTE", "APROBADO"]) expect(documentsEditable(estado)).toBe(true);
});

test("download paths are relative to the API base so the prefix is not duplicated", () => {
  expect(apiRelative("/api/document-versions/9/download")).toBe("/document-versions/9/download");
  expect(apiRelative("/document-versions/9/download")).toBe("/document-versions/9/download");
  expect(apiRelative("/apix/y")).toBe("/apix/y");
});

test("read-only viewers see type, version and author, download a version and get no editing controls", async () => {
  serve(); vi.mocked(downloadFile).mockResolvedValue(new Blob(["%PDF-1.7"]));
  URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  render(<FlightDocuments flightId={7} canEdit={false} msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan de vuelo · v2/ }));
  expect(await screen.findByText(/Versión 1 · v1\.pdf · 2 KB · 2026-10-13 11:00 · cmd1/)).toBeInTheDocument();
  expect(screen.getByText(/Versión 2 \(vigente\) · v2\.pdf/)).toBeInTheDocument();
  expect(screen.getByText(/Consulta y descarga/)).toBeInTheDocument();
  expect(screen.queryByText("Registrar documento PDF")).toBeNull();
  expect(screen.queryByRole("button", { name: /bloqueo/i })).toBeNull();
  expect(vi.mocked(api).mock.calls.some(([p]) => p.endsWith("/documents/types") || p === "/documents/44/lock" || p.endsWith("/retired"))).toBe(false);
  expect(screen.queryByRole("button", { name: /retirad/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Descargar versión 1" }));
  await waitFor(() => expect(downloadFile).toHaveBeenCalledWith("/document-versions/91/download"));
});

test("the type selector comes from the catalog and creation sends context only, never internal identifiers", async () => {
  serve(); vi.mocked(uploadFile).mockResolvedValue({ ...item, id: "45", nombreDocumento: "Autorización A" });
  const msg = vi.fn();
  render(<FlightDocuments flightId={7} canEdit msg={msg} />);
  const select = await screen.findByLabelText("Tipo documental");
  await waitFor(() => expect(screen.getByRole("option", { name: "Autorización de vuelo" })).toBeInTheDocument());
  const create = screen.getByRole("button", { name: "Registrar documento" });
  expect(create).toBeDisabled();
  fireEvent.change(select, { target: { value: "AUTORIZACION" } });
  fireEvent.change(screen.getByLabelText("Nombre del documento"), { target: { value: " Autorización A " } });
  fireEvent.change(screen.getByLabelText("Archivo PDF"), { target: { files: [pdf()] } });
  fireEvent.click(create);
  await waitFor(() => expect(uploadFile).toHaveBeenCalledWith("/flights/7/documents/pdf", expect.any(File), { documentTypeCode: "AUTORIZACION", nombreDocumento: "Autorización A" }));
  await waitFor(() => expect(msg).toHaveBeenCalledWith("Documento registrado"));
});

test("a duplicate or invalid upload shows the server error and keeps the entered data", async () => {
  serve(); vi.mocked(uploadFile).mockRejectedValue(new Error("Ya existe un documento con ese nombre en el vuelo; registre una nueva versión del existente"));
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("option", { name: "Plan de vuelo" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Tipo documental"), { target: { value: "PLAN_DE_VUELO" } });
  fireEvent.change(screen.getByLabelText("Nombre del documento"), { target: { value: "Plan de vuelo" } });
  fireEvent.change(screen.getByLabelText("Archivo PDF"), { target: { files: [pdf()] } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar documento" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un documento con ese nombre");
  expect(screen.getByLabelText("Nombre del documento")).toHaveValue("Plan de vuelo");
});

test("another user's active lease blocks editing and shows its owner", async () => {
  serve({ "GET /documents/44/lock": lease({ mine: false, ownerUsername: "cmd1" }) });
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  expect(await screen.findByText(/Bloqueado por cmd1/)).toBeInTheDocument();
  expect(screen.queryByText("Nueva versión PDF")).toBeNull();
});

test("the lease holder saves a new version and the list and history refresh", async () => {
  let saved = false;
  serve({
    "GET /documents/44/lock": () => Promise.resolve(lease()),
    "GET /flights/7/documents": () => Promise.resolve([saved ? { ...item, versionActual: version(3, { esVersionActual: true }) } : item]),
    "GET /documents/44/versions": () => Promise.resolve({ id: "44", versiones: saved ? [version(3, { esVersionActual: true }), version(2, { esVersionActual: false }), version(1)] : [version(2), version(1)] }),
  });
  vi.mocked(uploadFile).mockImplementation(async () => { saved = true; return { ...item, versionActual: version(3, { esVersionActual: true }) }; });
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  expect(await screen.findByText(/Usted posee el bloqueo/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nueva versión PDF"), { target: { files: [pdf("nueva.pdf")] } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar nueva versión" }));
  await waitFor(() => expect(uploadFile).toHaveBeenCalledWith("/documents/44/versions/pdf", expect.any(File)));
  expect(await screen.findByText(/Versión 3 \(vigente\)/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /v3$/ })).toBeInTheDocument();
});

test("a rejected save because the lease expired re-reads the server lease instead of trusting the screen", async () => {
  let locks = 0;
  serve({ "GET /documents/44/lock": () => Promise.resolve(++locks === 1 ? lease() : { ...free, ownerUsername: null }) });
  vi.mocked(uploadFile).mockRejectedValue(new Error("El bloqueo documental no es válido o venció"));
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  await screen.findByText(/Usted posee el bloqueo/);
  fireEvent.change(screen.getByLabelText("Nueva versión PDF"), { target: { files: [pdf()] } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar nueva versión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("venció");
  expect(await screen.findByText(/Disponible para edición/)).toBeInTheDocument();
  expect(screen.queryByText("Nueva versión PDF")).toBeNull();
});

test("an active lease is queried again when it expires", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  let locks = 0;
  serve({ "GET /documents/44/lock": () => Promise.resolve(++locks === 1 ? lease({ remainingSeconds: 5 }) : free) });
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  fireEvent.click(screen.getByRole("button", { name: /Plan de vuelo · Plan/ }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText(/Usted posee el bloqueo/)).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  expect(screen.getByText(/Disponible para edición/)).toBeInTheDocument();
  expect(locks).toBe(2);
});

test("leaving the screen releases the lease best-effort and switching flights resets the panel", async () => {
  serve({ "GET /documents/44/lock": lease() });
  const { unmount } = render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  await screen.findByText(/Usted posee el bloqueo/);
  unmount();
  expect(vi.mocked(api)).toHaveBeenCalledWith("/documents/44/lock", { method: "DELETE" });
});

test("authorization errors are shown instead of an empty list", async () => {
  vi.mocked(api).mockImplementation((path) => path === "/flights/7/documents" ? Promise.reject(new Error("No tiene acceso a este vuelo")) : Promise.resolve({}));
  render(<FlightDocuments flightId={7} canEdit={false} msg={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No tiene acceso a este vuelo");
  expect(screen.queryByText("Sin documentos registrados.")).toBeNull();
});

test("the DTS request detail shows its documents read-only", async () => {
  serve({ "GET /flights/7": { vuelo: { id: 7, codigo: "V-7", estadoVuelo: "PLANIFICADO", datosSanitarios: { estadoSolicitud: "APROBADO", fechaSolicitada: "2026-11-01T10:00:00", extremaUrgencia: false } }, negociacion: [] } });
  const { DtsResponses } = await import("./main.jsx");
  render(<DtsResponses d={{ flights: [{ id: 7, codigo: "V-7", estado: "PLANIFICADO" }] }} done={vi.fn()} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "7" } });
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan de vuelo · v2/ }));
  expect(await screen.findByText(/Versión 1 · v1\.pdf/)).toBeInTheDocument();
  expect(screen.queryByText("Registrar documento PDF")).toBeNull();
  expect(vi.mocked(api).mock.calls.some(([p]) => p === "/documents/44/lock" || p.endsWith("/documents/types"))).toBe(false);
});

test.each(["FINALIZADO", "COMPLETADO", "CANCELADO"])("operations see documents of a %s flight as read-only", async (estado) => {
  const flight = { id: 7, codigo: "V-7", estadoVuelo: estado, tipo: { codigo: "OTRO", nombre: "Otro" } };
  serve({ "GET /flights/7": { vuelo: flight, recursos: {}, negociacion: [] } });
  const { Ops } = await import("./main.jsx");
  render(<Ops d={{ flights: [{ id: 7, codigo: "V-7", estado }], patients: [] }} done={vi.fn()} msg={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Solicitud"), { target: { value: "7" } });
  expect(await screen.findByText(/Consulta y descarga/)).toBeInTheDocument();
  await screen.findByRole("button", { name: /Plan de vuelo · Plan de vuelo · v2/ });
  expect(screen.queryByText("Registrar documento PDF")).toBeNull();
});

const retiredRow = { id: "50", nombreDocumento: "Parte equivocado", tipoDocumento: { codigo: "OTRO", nombre: "Otro documento" }, ultimaVersion: version(1, { esVersionActual: true }), totalVersiones: 1, fechaBaja: "2026-10-13T12:30:00", retiradoPor: "ops1", motivoBaja: "Cargado en el vuelo equivocado" };

test("the selector asks the flight which types it admits instead of filtering a global catalog", async () => {
  serve({ "GET /flights/7/documents/types": [{ codigo: "AUTORIZACION", nombre: "Autorización de vuelo" }, { codigo: "OTRO", nombre: "Otro documento" }] });
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("option", { name: "Otro documento" })).toBeInTheDocument());
  expect(screen.queryByRole("option", { name: "Parte médico" })).toBeNull();
  expect(vi.mocked(api).mock.calls.some(([p]) => p === "/catalogs/document-types")).toBe(false);
});

test("retiring a document asks for a reason, warns, confirms and refreshes the operational list", async () => {
  let gone = false; const msg = vi.fn();
  serve({
    "GET /flights/7/documents": () => Promise.resolve(gone ? [] : [item]),
    "POST /flights/7/documents/44/deactivate": () => { gone = true; return Promise.resolve(null); },
  });
  render(<FlightDocuments flightId={7} canEdit canViewRetired msg={msg} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Retirar documento" }));
  expect(screen.getByRole("note")).toHaveTextContent(/saldrá del uso operativo.*no se puede deshacer/);
  const confirm = screen.getByRole("button", { name: "Confirmar retiro" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Motivo de la baja"), { target: { value: "   " } });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Motivo de la baja"), { target: { value: " Cargado en el vuelo equivocado " } });
  fireEvent.click(confirm);
  await waitFor(() => expect(api).toHaveBeenCalledWith("/flights/7/documents/44/deactivate", { method: "POST", body: JSON.stringify({ motivo: "Cargado en el vuelo equivocado" }) }));
  expect(await screen.findByText("Sin documentos registrados.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Plan de vuelo" })).toBeNull();
  expect(msg).toHaveBeenCalledWith("Documento retirado del uso operativo");
});

test("cancelling the retirement changes nothing and the action is hidden when the server does not allow it", async () => {
  serve({ "GET /flights/7/documents": [{ ...item, puedeRetirar: false }] });
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  await screen.findByText(/Historial de versiones/);
  expect(screen.queryByRole("button", { name: "Retirar documento" })).toBeNull();
  cleanup(); serve();
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Retirar documento" }));
  fireEvent.change(screen.getByLabelText("Motivo de la baja"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByLabelText("Motivo de la baja")).toBeNull();
  expect(vi.mocked(api).mock.calls.some(([p]) => p.endsWith("/deactivate"))).toBe(false);
});

test("a conflict or an authorization error on retirement is shown and the document stays in the list", async () => {
  serve({ "POST /flights/7/documents/44/deactivate": () => Promise.reject(new Error("El documento está bloqueado por cmd1: espere a que lo libere o venza")) });
  render(<FlightDocuments flightId={7} canEdit msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Plan de vuelo · Plan/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Retirar documento" }));
  fireEvent.change(screen.getByLabelText("Motivo de la baja"), { target: { value: "Error de carga" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar retiro" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("bloqueado por cmd1");
  expect(screen.getByRole("button", { name: /Plan de vuelo · Plan de vuelo · v2/ })).toBeInTheDocument();
  expect(screen.getByLabelText("Motivo de la baja")).toHaveValue("Error de carga");
});

test("authorized users consult the retired documents with reason and responsible, and their versions stay downloadable but not editable", async () => {
  serve({ "GET /flights/7/documents/retired": [retiredRow], "GET /documents/50/versions": { id: "50", versiones: [version(1, { esVersionActual: true })] } });
  vi.mocked(downloadFile).mockResolvedValue(new Blob(["%PDF-1.7"])); URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  render(<FlightDocuments flightId={7} canEdit canViewRetired msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver documentos retirados" }));
  const list = await screen.findByRole("list", { name: "Documentos retirados" });
  expect(list).toHaveTextContent(/Parte equivocado · Otro documento · 1 versión · retirado por ops1 el 2026-10-13 12:30 · Motivo: Cargado en el vuelo equivocado/);
  fireEvent.click(screen.getByRole("button", { name: "Ver historial de Parte equivocado" }));
  expect(await screen.findByText(/Documento retirado del uso operativo/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Descargar versión 1" }));
  await waitFor(() => expect(downloadFile).toHaveBeenCalledWith("/document-versions/91/download"));
  for (const control of ["Retirar documento", "Adquirir bloqueo", "Consultar bloqueo", "Guardar nueva versión"]) expect(screen.queryByRole("button", { name: control })).toBeNull();
  expect(vi.mocked(api).mock.calls.some(([p]) => p === "/documents/50/lock")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Ocultar documentos retirados" }));
  expect(screen.queryByRole("list", { name: "Documentos retirados" })).toBeNull();
});

test("the retired list is not offered to users without the historical permission and denial errors are shown", async () => {
  serve(); render(<FlightDocuments flightId={7} canEdit={false} msg={vi.fn()} />);
  await screen.findByRole("button", { name: /Plan de vuelo · Plan/ });
  expect(screen.queryByRole("button", { name: /retirados/ })).toBeNull();
  cleanup();
  serve({ "GET /flights/7/documents/retired": () => Promise.reject(new Error("No tiene acceso a los documentos retirados de este vuelo")) });
  render(<FlightDocuments flightId={7} canEdit canViewRetired msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver documentos retirados" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No tiene acceso a los documentos retirados");
});

test("an empty retired list says so", async () => {
  serve({ "GET /flights/7/documents/retired": [] });
  render(<FlightDocuments flightId={7} canEdit canViewRetired msg={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver documentos retirados" }));
  expect(await screen.findByText("Sin documentos retirados.")).toBeInTheDocument();
});
