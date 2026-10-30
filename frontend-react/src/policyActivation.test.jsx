import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { CredentialPolicies, ProfessionalCredentials } from "./credentials";

vi.mock("./api", () => ({ api: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(() => cleanup());

const proposalText = JSON.stringify({ name: "prueba", roles: ["MEDICO"], policies: [{ roleCode: "MEDICO", credentialType: "Médico" }] });
const report = (extra = {}) => ({
  fingerprint: "f".repeat(64), canActivate: true, requiresAcknowledgement: false,
  issues: [{ severity: "INFO", code: "SIN_AERONAVES", message: "No hay aeronaves activas registradas" }, { severity: "WARNING", code: "DECISION_PENDIENTE", message: "Decisión pendiente (COMANDANTE): requisitos" }],
  plan: [{ roleCode: "MEDICO", currentActive: 0, proposed: 1, keep: 0, create: 1, retire: 0, eligibleAfterActivation: true }],
  uncovered: [], aircraftTypesInUse: [], people: [{ roleCode: "MEDICO", becomeIneligible: 0, becomeEligible: 2, stayEligible: 0, stayIneligible: 1, codesAfter: {} }],
  flightsExamined: 3, newIncompatibilities: 0, resolvedIncompatibilities: 0, flightImpacts: [], pendingDecisions: [], note: "", ...extra,
});
const serve = (handlers = {}) => vi.mocked(api).mockImplementation((path, options) => {
  const key = `${options?.method || "GET"} ${path}`;
  if (handlers[key]) return typeof handlers[key] === "function" ? handlers[key](options) : Promise.resolve(handlers[key]);
  if (path === "/credential-policies") return Promise.resolve([]);
  return Promise.resolve({});
});
const fillProposal = async (text = proposalText) => fireEvent.change(await screen.findByLabelText("Propuesta de políticas (JSON)"), { target: { value: text } });

test("simulating shows the findings, writes nothing and keeps activation locked until it is approved", async () => {
  serve({ "POST /credential-policies/simulation": report() });
  render(<CredentialPolicies notify={vi.fn()} />);
  await fillProposal();
  fireEvent.click(screen.getByRole("button", { name: "Validar y simular" }));
  expect(await screen.findByText(/Decisión pendiente \(COMANDANTE\)/)).toBeInTheDocument();
  expect(screen.getByText("f".repeat(64))).toBeInTheDocument();
  expect(vi.mocked(api).mock.calls.some(([p]) => p === "/credential-policies/activation")).toBe(false);
  const button = screen.getByRole("button", { name: "Activar política aprobada" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Referencia de la aprobación/), { target: { value: "Acta 12" } });
  expect(button).toBeEnabled();
});

test("activation sends exactly the simulated fingerprint with the approval reference and announces success only after the backend answers", async () => {
  const notify = vi.fn();
  let body = null;
  serve({ "POST /credential-policies/simulation": report(), "POST /credential-policies/activation": (o) => { body = JSON.parse(o.body); return Promise.resolve({ batchId: "b-1", changed: true, created: 1, retired: 0, kept: 0, createdIds: [7], retiredIds: [], report: report() }); } });
  render(<CredentialPolicies notify={notify} />);
  await fillProposal();
  fireEvent.click(screen.getByRole("button", { name: "Validar y simular" }));
  fireEvent.change(await screen.findByLabelText(/Referencia de la aprobación/), { target: { value: "Acta 12" } });
  fireEvent.click(screen.getByRole("button", { name: "Activar política aprobada" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Política activada: 1 alta(s), 0 baja(s)"));
  expect(body).toMatchObject({ approvedFingerprint: "f".repeat(64), approvalReference: "Acta 12", acknowledgeIncompatibilities: false });
  expect(body.proposal.roles).toEqual(["MEDICO"]);
});

test("editing the proposal after simulating invalidates the approval; blocking errors and unacknowledged incompatibilities lock activation", async () => {
  serve({ "POST /credential-policies/simulation": report({ requiresAcknowledgement: true, newIncompatibilities: 2, flightImpacts: [{ flightId: 1, flightCode: "VS-1", flightState: "PLANIFICADO", userId: 4, username: "medico1", roleCode: "MEDICO", before: "ELEGIBLE", after: "HABILITACION_NO_SUFICIENTE", message: "x" }] }) });
  render(<CredentialPolicies notify={vi.fn()} />);
  await fillProposal();
  fireEvent.click(screen.getByRole("button", { name: "Validar y simular" }));
  fireEvent.change(await screen.findByLabelText(/Referencia de la aprobación/), { target: { value: "Acta 12" } });
  const button = screen.getByRole("button", { name: "Activar política aprobada" });
  expect(await screen.findByText(/Vuelo VS-1/)).toBeInTheDocument();
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Reconozco que 2 integrante/));
  expect(button).toBeEnabled();
  await fillProposal(JSON.stringify({ roles: ["MEDICO"], policies: [] }));
  expect(await screen.findByText(/el texto cambió después de simular/)).toBeInTheDocument();
  expect(button).toBeDisabled();
});

test("a proposal with blocking errors cannot be activated and invalid JSON is reported without calling the backend", async () => {
  serve({ "POST /credential-policies/simulation": report({ canActivate: false, issues: [{ severity: "ERROR", code: "TIPO_HABILITACION_REQUERIDO", message: "La fila 1 no indica el tipo de habilitación aceptado" }] }) });
  render(<CredentialPolicies notify={vi.fn()} />);
  await fillProposal("{no es json");
  fireEvent.click(screen.getByRole("button", { name: "Validar y simular" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("El contenido no es un JSON válido");
  expect(vi.mocked(api).mock.calls.some(([p]) => p === "/credential-policies/simulation")).toBe(false);
  await fillProposal();
  fireEvent.click(screen.getByRole("button", { name: "Validar y simular" }));
  expect(await screen.findByText(/La fila 1 no indica el tipo/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Referencia de la aprobación/), { target: { value: "Acta 12" } });
  expect(screen.getByRole("button", { name: "Activar política aprobada" })).toBeDisabled();
});

test("the legacy-document panel explains what is restricted, who is affected and runs the regularization batch", async () => {
  const notify = vi.fn();
  serve({
    "GET /professional-credential-documents/legacy/report": { legacyDocuments: 8, byStatus: { LEGADO_SIN_ANALISIS: 8 }, withoutFingerprint: 8, pendingActive: 8, missingFiles: 1, analyzerConfigured: false, verifiedCredentialsSupportedOnlyByLegacy: 2,
      credentials: [{ credentialId: 5, userId: 9, username: "medico1", roleCode: "MEDICO", type: "Médico", documentStatus: "LEGADO_SIN_ANALISIS" }], openFlightsWithAffectedCrew: 1, flights: [], truncated: false, statement: "Los documentos anteriores a V59 no se consideran limpios." },
    "POST /professional-credential-documents/legacy/regularize?limit=50": { examined: 8, regularized: 0, rejected: 0, restricted: 8, alreadyResolved: 0 },
  });
  render(<CredentialPolicies notify={notify} />);
  expect(await screen.findByText(/8 documento\(s\) heredado\(s\)/)).toBeInTheDocument();
  expect(screen.getByText(/analizador NO disponible/)).toBeInTheDocument();
  expect(screen.getByText(/medico1 · Médico · Médico · documentos: LEGADO_SIN_ANALISIS/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Regularizar documentos heredados/ }));
  expect(await screen.findByText(/8 siguen restringidos/)).toBeInTheDocument();
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Regularización ejecutada"));
});

test("a legacy document is shown as restricted with its explanation, cannot be downloaded and offers regularization instead of a plain rescan", async () => {
  const notify = vi.fn();
  const legacy = { id: 41, name: "antiguo.pdf", uploader: "admin", uploadedAt: "2026-09-01T10:00:00", purpose: "EVIDENCIA", version: 1, sha256: null, sizeBytes: null, scanStatus: "LEGADO_SIN_ANALISIS", scanDetail: null, retired: false, retentionHold: false, origin: "ANTERIOR_V59", hashMoment: null, regularizedAt: null, regularizedBy: null, restriction: "Documento anterior a V59, sin análisis antimalware ni huella verificable: permanece restringido hasta regularizarlo" };
  const credential = { id: 5, personId: 3, roleCode: "MEDICO", type: "Médico", number: "MP-1", issuer: "Colegio", issued: null, expires: "2027-12-31", noExpiry: false, status: "VERIFICADA", verifier: "otro", verifiedAt: "2026-09-02T10:00:00", notes: null, current: true, documents: [legacy], aircraftCategory: null, jurisdictionId: null, jurisdiction: null, restrictions: null, renewsId: null, lifecycle: "VIGENTE", documentStatus: "LEGADO_SIN_ANALISIS", externalCheck: null, validationKind: "REVISION_INTERNA_SIN_CONSULTA_EXTERNA", eligibility: { eligible: true, code: "ELEGIBLE", message: "ok" }, lastDecisionReason: null };
  let regularized = 0;
  vi.mocked(api).mockImplementation((path, options) => {
    const key = `${options?.method || "GET"} ${path}`;
    if (key === "GET /users/9/professional-credentials") return Promise.resolve([credential]);
    if (key === "POST /professional-credential-documents/41/regularize") { regularized += 1; return Promise.resolve({ documentId: 41, result: "RESTRINGIDO", status: "LEGADO_SIN_ANALISIS", detail: "No hay un analizador antimalware configurado" }); }
    return Promise.resolve([]);
  });
  render(<ProfessionalCredentials userId={9} notify={notify} />);
  fireEvent.click(await screen.findByRole("button", { name: /Médico — Médico — MP-1/ }));
  expect(await screen.findByText(/Documento anterior a V59/, { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByText(/Restringido: Documento anterior a V59, sin análisis antimalware/)).toBeInTheDocument();
  expect(screen.getByText(/sin huella \(anterior a V59\)/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Descargar antiguo.pdf" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reintentar análisis" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Regularizar (huella y análisis)" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Sigue restringido: No hay un analizador antimalware configurado"));
  expect(regularized).toBe(1);
});

test("the readiness panel lists mandatory and pending items without claiming business decisions are done", async () => {
  serve({ "GET /admin/readiness": { environment: "produccion", readyForOperation: false, flywayVersion: "60", pendingMandatory: ["POLITICA_COMANDANTE", "ANTIMALWARE"], note: "No sustituye la aprobación de negocio.",
    items: [{ key: "POLITICA_COMANDANTE", label: "Política de suficiencia: COMANDANTE", status: "PENDIENTE", mandatory: true, detail: "Sin política activa" }, { key: "CORREO", label: "Servidor de correo saliente", status: "PENDIENTE", mandatory: false, detail: "No configurado" }, { key: "AVISOS_VENCIMIENTO", label: "Avisos de vencimiento (60,30,7,0 días)", status: "PROPUESTA", mandatory: false, detail: "Plazos propuestos" }] } });
  render(<CredentialPolicies notify={vi.fn()} />);
  expect(await screen.findByText(/Faltan configuraciones obligatorias: POLITICA_COMANDANTE, ANTIMALWARE/)).toBeInTheDocument();
  expect(screen.getByText(/Servidor de correo saliente:/)).toHaveTextContent("Pendiente");
  expect(screen.getByText(/Avisos de vencimiento/)).toHaveTextContent("Propuesta sin aprobar");
});
