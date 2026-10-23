import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api, downloadFile, uploadFile } from "./api";
import { CommanderReports, FlightClosure, LifecycleActions, NotificationsPanel, OperationsReports, ReportHistory, instant, decisionNote } from "./closure";
vi.mock("./api", () => ({ api: vi.fn(), uploadFile: vi.fn(), downloadFile: vi.fn() }));
const obligation = (extra = {}) => ({ id: 21, flightId: 7, flightCode: "V-7", status: "PENDIENTE", vencimiento: "2026-10-22T12:00:00Z", vencimientoOriginal: "2026-10-22T12:00:00Z", prorrogaUsada: false, presentadoEn: null, motivoDevolucion: null, bloqueado: false, estadoVuelo: "FINALIZADO", tipoVuelo: "SANITARIO", comandanteId: 11, comandante: "Ana Pérez", vencida: false, segundosRestantes: 36000, versiones: 0, aprobadoEn: null, ...extra });
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(uploadFile).mockReset(); vi.mocked(downloadFile).mockReset(); window.confirm = vi.fn(() => true); });
afterEach(cleanup);

test("el comandante bloqueado ve la restricción, el tiempo vencido y puede presentar el informe con todos los campos", async () => {
 let state = [obligation({ vencida: true, bloqueado: true, segundosRestantes: -7260 })];
 vi.mocked(api).mockImplementation((path) => {
  if (path === "/final-reports/mine") return Promise.resolve(state);
  if (path === "/final-reports/21/submit") { state = [obligation({ status: "PRESENTADO", versiones: 1, presentadoEn: "2026-10-20T10:00:00Z" })]; return Promise.resolve(state[0]); }
  return Promise.resolve({});
 });
 const msg = vi.fn(); render(<CommanderReports msg={msg} />);
 expect(await screen.findByText("⚠ FUNCIONES BLOQUEADAS: INFORME FINAL VENCIDO")).toBeInTheDocument();
 expect(screen.getByText(/VENCIDO hace 2 h 1 min/)).toBeInTheDocument();
 const submit = screen.getByRole("button", { name: "Presentar informe" }); expect(submit).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Informe de texto"), { target: { value: "Vuelo sin novedades" } });
 fireEvent.change(screen.getByLabelText("Horas de vuelo"), { target: { value: "1.5" } });
 fireEvent.change(screen.getByLabelText("Combustible consumido (L)"), { target: { value: "200" } });
 fireEvent.change(screen.getByLabelText("Incidentes"), { target: { value: "Ninguno" } });
 fireEvent.click(submit);
 await waitFor(() => expect(api).toHaveBeenCalledWith("/final-reports/21/submit", { method: "POST", body: JSON.stringify({ texto: "Vuelo sin novedades", horasVuelo: 1.5, combustibleConsumidoLitros: 200, incidentes: "Ninguno" }) }));
 expect(await screen.findByText(/Presentado, en revisión/)).toBeInTheDocument();
 expect(screen.queryByText(/FUNCIONES BLOQUEADAS/)).toBeNull(); expect(msg).toHaveBeenCalledWith("Informe presentado");
});

test("cancelar la confirmación no presenta el informe", async () => {
 window.confirm = vi.fn(() => false);
 vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/final-reports/mine" ? [obligation()] : {}));
 render(<CommanderReports msg={vi.fn()} />);
 fireEvent.change(await screen.findByLabelText("Informe de texto"), { target: { value: "Texto" } });
 fireEvent.click(screen.getByRole("button", { name: "Presentar informe" }));
 expect(api).not.toHaveBeenCalledWith(expect.stringContaining("/submit"), expect.anything());
});

test("un informe devuelto muestra el motivo, el nuevo plazo y el historial de versiones", async () => {
 const detail = { obligacion: obligation(), versiones: [
  { id: 2, version: 2, vigente: true, estado: "PRESENTADO", texto: "Corregido", presentadoPor: "cmd", horasVuelo: 2, combustibleConsumidoLitros: null },
  { id: 1, version: 1, vigente: false, estado: "DEVUELTO", texto: "Primero", presentadoPor: "cmd", motivoDevolucion: "Faltan horas", revisadoEn: "2026-10-19T10:00:00Z", revisor: "ops" }] };
 vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/final-reports/mine" ? [obligation({ status: "DEVUELTO", motivoDevolucion: "Faltan horas", versiones: 2 })] : path === "/final-reports/21" ? detail : {}));
 render(<CommanderReports msg={vi.fn()} />);
 expect(await screen.findByText(/Devuelto por Operaciones: Faltan horas/)).toBeInTheDocument();
 expect(screen.getByRole("button", { name: "Presentar corrección" })).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Ver historial (2)" }));
 expect(await screen.findByText("Versión 1")).toBeInTheDocument(); expect(screen.getByText(/Motivo de devolución: Faltan horas/)).toBeInTheDocument(); expect(screen.getByText("Corregido")).toBeInTheDocument();
});

test("un error del servidor se informa y la lista se recarga", async () => {
 let calls = 0;
 vi.mocked(api).mockImplementation((path) => { if (path === "/final-reports/mine") { calls++; return Promise.resolve([obligation()]); } return Promise.reject(new Error("El informe ya fue presentado y está pendiente de revisión")); });
 const msg = vi.fn(); render(<CommanderReports msg={msg} />);
 fireEvent.change(await screen.findByLabelText("Informe de texto"), { target: { value: "Texto" } }); fireEvent.click(screen.getByRole("button", { name: "Presentar informe" }));
 await waitFor(() => expect(msg).toHaveBeenCalledWith("El informe ya fue presentado y está pendiente de revisión", true)); expect(calls).toBeGreaterThan(1);
});

test("operaciones aprueba, exige motivo para devolver y distingue los informes vencidos", async () => {
 let presented = [obligation({ status: "PRESENTADO", versiones: 1, presentadoEn: "2026-10-20T10:00:00Z" })];
 const awaiting = [obligation({ id: 22, flightCode: "V-8", vencida: true, bloqueado: true, segundosRestantes: -60 })];
 vi.mocked(api).mockImplementation((path) => {
  if (path === "/final-reports/pending-review") return Promise.resolve(presented);
  if (path === "/final-reports/awaiting-commander") return Promise.resolve(awaiting);
  if (path === "/final-reports/21/review") { presented = []; return Promise.resolve({}); }
  return Promise.resolve({});
 });
 const msg = vi.fn(); render(<OperationsReports msg={msg} />);
 expect(await screen.findByText("V-7")).toBeInTheDocument(); expect(screen.getByText(/1 informe\(s\) vencido\(s\)/)).toBeInTheDocument(); expect(screen.getByText(/comandante bloqueado/)).toBeInTheDocument();
 expect(screen.getByRole("button", { name: "Devolver para corrección" })).toBeDisabled();
 fireEvent.click(screen.getByRole("button", { name: "Aprobar y completar vuelo" }));
 await waitFor(() => expect(api).toHaveBeenCalledWith("/final-reports/21/review", { method: "POST", body: JSON.stringify({ aprobar: true }) }));
 expect(await screen.findByText("No hay informes pendientes de revisión.")).toBeInTheDocument(); expect(msg).toHaveBeenCalledWith("Informe aprobado y vuelo completado");
});

test("operaciones devuelve el informe con motivo", async () => {
 vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/final-reports/pending-review" ? [obligation({ status: "PRESENTADO", versiones: 1 })] : []));
 render(<OperationsReports msg={vi.fn()} />);
 fireEvent.change(await screen.findByLabelText("Motivo de devolución"), { target: { value: "Faltan datos" } });
 fireEvent.click(screen.getByRole("button", { name: "Devolver para corrección" }));
 await waitFor(() => expect(api).toHaveBeenCalledWith("/final-reports/21/review", { method: "POST", body: JSON.stringify({ aprobar: false, motivoDevolucion: "Faltan datos" }) }));
});

test("el Centro de Operaciones inicia y finaliza sólo desde los estados válidos y con confirmación", () => {
 const run = vi.fn();
 const { rerender } = render(<LifecycleActions flight={{ id: 7, codigo: "V-7", estado: "PLANIFICADO" }} run={run} />);
 fireEvent.click(screen.getByRole("button", { name: "Iniciar vuelo" })); expect(run).toHaveBeenCalledWith("/flights/7/start", "Vuelo iniciado");
 rerender(<LifecycleActions flight={{ id: 7, codigo: "V-7", estado: "EN_CURSO" }} run={run} />);
 window.confirm = vi.fn(() => false); fireEvent.click(screen.getByRole("button", { name: "Finalizar vuelo" })); expect(run).toHaveBeenCalledTimes(1);
 window.confirm = vi.fn(() => true); fireEvent.click(screen.getByRole("button", { name: "Finalizar vuelo" })); expect(run).toHaveBeenLastCalledWith("/flights/7/finish", expect.stringContaining("finalizado"));
 for (const estado of ["FINALIZADO", "COMPLETADO", "CANCELADO", "SOLICITADO"]) { rerender(<LifecycleActions flight={{ id: 7, estado }} run={run} />); expect(screen.queryByRole("button")).toBeNull(); }
});

test("la ficha separa el estado operativo del cierre administrativo", () => {
 const { rerender } = render(<FlightClosure flight={{ estado: "FINALIZADO" }} cierre={{ estadoAdministrativo: "INFORME_VENCIDO", vencimiento: "2026-10-20T10:00:00Z", comandanteBloqueado: true, versiones: 0 }} />);
 expect(screen.getByText("FINALIZADO")).toBeInTheDocument(); expect(screen.getByText("Informe final VENCIDO")).toBeInTheDocument(); expect(screen.getByText(/funciones operativas bloqueadas/)).toBeInTheDocument();
 rerender(<FlightClosure flight={{ estado: "COMPLETADO" }} cierre={{ estadoAdministrativo: "CERRADO", versiones: 2, aprobadoEn: "2026-10-20T10:00:00Z" }} />);
 expect(screen.getByText("Cerrado administrativamente")).toBeInTheDocument();
 rerender(<FlightClosure flight={{ estado: "PLANIFICADO" }} cierre={null} />); expect(screen.queryByLabelText("Cierre del vuelo")).toBeNull();
});

test("las notificaciones se consultan y se marcan como leídas", async () => {
 vi.mocked(api).mockResolvedValue(null); const reload = vi.fn(); const items = [{ id: 1, tipo: "FINAL_REPORT_RETURNED", mensaje: "Informe devuelto", leido: false, createdAt: "2026-10-20T10:00:00" }, { id: 2, tipo: "FLIGHT_FINISHED", mensaje: "Finalizado", leido: true, createdAt: "2026-10-20T09:00:00" }];
 render(<NotificationsPanel items={items} unread={1} msg={vi.fn()} reload={reload} />);
 expect(screen.getByText("Notificaciones (1 sin leer)")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Marcar leída" })); await waitFor(() => expect(api).toHaveBeenCalledWith("/notifications/1/read", { method: "POST" })); expect(reload).toHaveBeenCalled();
});

const pdfFile = () => new File(["%PDF-1.4 x"], "informe.pdf", { type: "application/pdf" });

test("el comandante puede presentar sólo un PDF, o texto y PDF, y el envío usa multipart", async () => {
 vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/final-reports/mine" ? [obligation()] : {}));
 vi.mocked(uploadFile).mockResolvedValue({});
 const msg = vi.fn(); const { container } = render(<CommanderReports msg={msg} />);
 const submit = await screen.findByRole("button", { name: "Presentar informe" }); expect(submit).toBeDisabled();
 fireEvent.change(container.querySelector("input[type=file]"), { target: { files: [pdfFile()] } });
 expect(submit).toBeEnabled();
 fireEvent.change(screen.getByLabelText("Horas de vuelo"), { target: { value: "2" } });
 fireEvent.click(submit);
 await waitFor(() => expect(uploadFile).toHaveBeenCalledWith("/final-reports/21/submit", expect.objectContaining({ name: "informe.pdf" }), { horasVuelo: "2" }));
 expect(api).not.toHaveBeenCalledWith("/final-reports/21/submit", expect.anything()); expect(msg).toHaveBeenCalledWith("Informe presentado");
 fireEvent.change(container.querySelector("input[type=file]"), { target: { files: [pdfFile()] } }); fireEvent.change(screen.getByLabelText("Informe de texto"), { target: { value: "Resumen" } });
 fireEvent.click(screen.getByRole("button", { name: "Presentar informe" }));
 await waitFor(() => expect(uploadFile).toHaveBeenLastCalledWith("/final-reports/21/submit", expect.anything(), { texto: "Resumen" }));
});

test("un rechazo del servidor sobre el PDF se informa y no se pierde la lista", async () => {
 vi.mocked(api).mockImplementation((path) => Promise.resolve(path === "/final-reports/mine" ? [obligation()] : {}));
 vi.mocked(uploadFile).mockRejectedValue(new Error("El PDF contiene contenido activo (scripts, ejecución o archivos incrustados) y no se admite"));
 const msg = vi.fn(); const { container } = render(<CommanderReports msg={msg} />);
 await screen.findByRole("button", { name: "Presentar informe" }); fireEvent.change(container.querySelector("input[type=file]"), { target: { files: [pdfFile()] } });
 fireEvent.click(screen.getByRole("button", { name: "Presentar informe" }));
 await waitFor(() => expect(msg).toHaveBeenCalledWith(expect.stringContaining("contenido activo"), true)); expect(screen.getByRole("button", { name: "Presentar informe" })).toBeInTheDocument();
});

test("el historial muestra formato, PDF descargable con ruta autenticada y la procedencia de las decisiones históricas", async () => {
 const adjunto = { nombre: "Informe vuelo.pdf", tamanioBytes: 2048, sha256: "abcdef0123456789".repeat(4), urlDescarga: "/api/final-reports/21/versions/3/file" };
 const detail = { obligacion: obligation(), versiones: [
  { id: 4, version: 3, vigente: true, estado: "PRESENTADO", origenDecision: "FLUJO_ACTUAL", formato: "PDF", texto: null, adjunto, presentadoPor: "cmd" },
  { id: 3, version: 2, vigente: false, estado: "APROBADO", origenDecision: "HISTORICA_OBLIGACION_AUDITADA", formato: "TEXTO", texto: "Aprobada antes de V42", adjunto: null, presentadoPor: "cmd", revisadoEn: "2026-10-13T20:00:00Z", revisor: "ops" },
  { id: 2, version: 1, vigente: false, estado: "HISTORICO_SIN_DECISION", origenDecision: "HISTORICA_SIN_EVIDENCIA", formato: "TEXTO", texto: "Informe antiguo", adjunto: null, presentadoPor: "cmd" }] };
 vi.mocked(api).mockResolvedValue(detail); vi.mocked(downloadFile).mockResolvedValue(new Blob(["%PDF"])); globalThis.URL.createObjectURL = vi.fn(() => "blob:x"); globalThis.URL.revokeObjectURL = vi.fn();
 render(<ReportHistory obligationId={21} onError={vi.fn()} />);
 expect(await screen.findByText(/PDF adjunto/)).toBeInTheDocument(); expect(screen.getByText(/Informe vuelo.pdf \(2 KB/)).toBeInTheDocument();
 expect(screen.getByText(/Histórica \(sin decisión de revisión verificable\)/)).toBeInTheDocument(); expect(screen.getByText(/Aprobada — decisión histórica registrada en la obligación y la auditoría/)).toBeInTheDocument();
 expect(screen.queryByText(/Histórica.*Aprobada|Aprobada.*sin decisión/)).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: "Descargar PDF" })); await waitFor(() => expect(downloadFile).toHaveBeenCalledWith("/final-reports/21/versions/3/file"));
 expect(decisionNote({ origenDecision: "FLUJO_ACTUAL" })).toBeNull(); expect(decisionNote({ origenDecision: "HISTORICA_SIN_EVIDENCIA" })).toBeNull();
});

test("los vencimientos se muestran en la zona de negocio aunque cambie el día respecto de UTC", () => {
 expect(instant("2026-10-23T02:30:00Z")).toContain("22/10/2026"); expect(instant("2026-10-23T02:30:00Z")).toContain("23:30");
 expect(instant("2026-10-20T03:00:00Z")).toContain("20/10/2026"); expect(instant("2026-10-20T02:59:00Z")).toContain("19/10/2026");
 expect(instant(null)).toBe("—"); expect(instant("no es fecha")).toBe("no es fecha");
});
