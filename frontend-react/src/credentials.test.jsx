import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api, credentialFile } from "./api";
import { ProfessionalCredentials, CredentialPolicies } from "./credentials";

vi.mock("./api", () => ({ api: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(credentialFile).mockReset(); });
afterEach(() => cleanup());

const doc = (extra = {}) => ({ id: 31, name: "matricula.pdf", uploader: "admin", uploadedAt: "2026-10-27T10:00:00", purpose: "EVIDENCIA", version: 1, sha256: "a".repeat(64), sizeBytes: 100, scanStatus: "LIMPIO", scanDetail: null, retired: false, retentionHold: false, ...extra });
const credential = (extra = {}) => ({
  id: 5, personId: 3, roleCode: "MEDICO", type: "Médico", number: "MP-1", issuer: "Colegio", issued: null, expires: "2027-12-31", noExpiry: false, status: "PENDIENTE", verifier: null, verifiedAt: null, notes: null, current: false,
  documents: [doc()], aircraftCategory: null, jurisdictionId: null, jurisdiction: null, restrictions: null, renewsId: null, lifecycle: "PENDIENTE", documentStatus: "LIMPIO", externalCheck: null,
  validationKind: "REVISION_INTERNA_SIN_CONSULTA_EXTERNA", eligibility: { eligible: false, code: "HABILITACION_NO_VERIFICADA", message: "La habilitación requiere verificación vigente" }, lastDecisionReason: null, ...extra,
});
const serve = (handlers = {}, items = [credential()]) => vi.mocked(api).mockImplementation((path, options) => {
  const key = `${options?.method || "GET"} ${path}`;
  if (handlers[key]) return typeof handlers[key] === "function" ? handlers[key](options) : Promise.resolve(handlers[key]);
  if (key === "GET /users/9/professional-credentials") return Promise.resolve(items);
  if (key === "GET /catalogs/provinces") return Promise.resolve([{ id: 1, nombre: "Tucumán" }]);
  return Promise.resolve({});
});
const open = async (notify = vi.fn()) => {
  render(<ProfessionalCredentials userId={9} notify={notify} />);
  fireEvent.click(await screen.findByRole("button", { name: /Médico — Médico — MP-1/ }));
  return notify;
};

test("administrative, documentary and operational eligibility states are shown separately", async () => {
  serve();
  await open();
  const badges = (await screen.findByText(/Administrativo:/)).closest("p");
  expect(badges).toHaveTextContent("Administrativo: Pendiente de revisión");
  expect(badges).toHaveTextContent("Documental: Documentación analizada");
  expect(badges).toHaveTextContent("Elegibilidad operativa: No elegible (La habilitación requiere verificación vigente)");
});

test("an internal review is never presented as an official validation", async () => {
  serve({}, [credential({ status: "VERIFICADA", lifecycle: "VIGENTE", validationKind: "REVISION_INTERNA_CON_CONSULTA_EXTERNA_MANUAL" })]);
  await open();
  expect(await screen.findByText(/no es una validación emitida por el organismo/i, { selector: "p" })).toBeInTheDocument();
  expect(screen.getByText(/no equivale a una validación emitida por el organismo/)).toBeInTheDocument();
});

test("verification needs the justification and the manual-review confirmation", async () => {
  serve();
  await open();
  const verify = await screen.findByRole("button", { name: "Verificar (revisión interna)" });
  expect(verify).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificación de la decisión/), { target: { value: "Documentación revisada" } });
  expect(verify).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Confirmo la revisión manual/));
  expect(verify).toBeEnabled();
});

test("a rejected decision shows the backend error and never announces success", async () => {
  const notify = vi.fn();
  serve({ "POST /professional-credentials/5/decision/VERIFICADA": () => Promise.reject(Object.assign(new Error("Hay documentos sin análisis antimalware completo"), { code: "DOCUMENTACION_SIN_ANALISIS_COMPLETO" })) });
  await open(notify);
  fireEvent.change(await screen.findByLabelText(/Justificación de la decisión/), { target: { value: "ok" } });
  fireEvent.click(screen.getByLabelText(/Confirmo la revisión manual/));
  fireEvent.click(screen.getByRole("button", { name: "Verificar (revisión interna)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Hay documentos sin análisis antimalware completo");
  expect(notify).not.toHaveBeenCalled();
});

test("success is announced only after the backend confirms and the list is reloaded", async () => {
  const notify = vi.fn();
  let calls = 0;
  serve({ "POST /professional-credentials/5/decision/RECHAZADA": () => { calls += 1; return Promise.resolve(credential({ status: "RECHAZADA" })); } });
  await open(notify);
  fireEvent.change(await screen.findByLabelText(/Justificación de la decisión/), { target: { value: "Matrícula ilegible" } });
  fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Rechazar: registrado"));
  expect(calls).toBe(1);
  expect(vi.mocked(api).mock.calls.filter(([p, o]) => p === "/users/9/professional-credentials" && !o).length).toBeGreaterThanOrEqual(2);
});

test("a document that did not pass the antimalware analysis cannot be downloaded", async () => {
  serve({}, [credential({ documents: [doc({ id: 31, scanStatus: "LIMPIO" }), doc({ id: 32, name: "sospechoso.pdf", scanStatus: "RECHAZADO", scanDetail: "Eicar-Test-Signature" }), doc({ id: 33, name: "pendiente.pdf", scanStatus: "ERROR_ANALISIS" })], documentStatus: "RECHAZADO" })]);
  await open();
  expect(await screen.findByRole("button", { name: "Descargar matricula.pdf" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Descargar sospechoso.pdf" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Descargar pendiente.pdf" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reintentar análisis" })).toBeInTheDocument();
});

test("a revoked credential cannot be edited or receive documents", async () => {
  serve({}, [credential({ status: "REVOCADA", lifecycle: "REVOCADA" })]);
  await open();
  expect(await screen.findByRole("button", { name: "Guardar habilitación" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Adjuntar documento" })).toBeDisabled();
});

test("recording an external consultation sends the authority, result and compared data", async () => {
  const notify = vi.fn();
  let sent = null;
  serve({ "POST /professional-credentials/5/external-checks": (o) => { sent = JSON.parse(o.body); return Promise.resolve(credential()); } });
  await open(notify);
  fireEvent.change(await screen.findByLabelText(/Datos contrastados/), { target: { value: "Nombre y matrícula coinciden" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar consulta externa" }));
  await waitFor(() => expect(notify).toHaveBeenCalled());
  expect(sent).toMatchObject({ authority: "REFEPS_SISA", result: "COINCIDE", comparedData: "Nombre y matrícula coinciden" });
});

test("without policies the policy page says nobody can be eligible", async () => {
  vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/credential-policies" ? [] : path === "/professional-credential-documents/antimalware-status" ? { configured: false, engine: null, failSafe: true } : path === "/professional-credential-retention/report" ? { purgeEnabled: false, policyApproved: false, activeDocuments: 0, retiredDocuments: 0, heldDocuments: 0, unscannedDocuments: 0, statement: "No hay una política de retención aprobada" } : []));
  render(<CredentialPolicies notify={vi.fn()} />);
  expect(await screen.findByText(/ninguna persona puede ser elegible/)).toBeInTheDocument();
  expect(await screen.findByText(/NO configurado: ningún documento puede aprobarse/)).toBeInTheDocument();
  expect(await screen.findByText(/Purga automática: deshabilitada/)).toBeInTheDocument();
});

test("a policy citing an official source must name the source", async () => {
  vi.mocked(api).mockImplementation(() => Promise.resolve([]));
  render(<CredentialPolicies notify={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Tipo de habilitación aceptado"), { target: { value: "Médico" } });
  const add = screen.getByRole("button", { name: "Agregar política" });
  expect(add).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Origen"), { target: { value: "FUENTE_OFICIAL_CITADA" } });
  expect(add).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Fuente citada"), { target: { value: "Resolución X" } });
  expect(add).toBeEnabled();
});
