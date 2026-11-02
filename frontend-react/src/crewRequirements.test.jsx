import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
import { PendingCommanders, RequirementList, UserRequirements } from "./crewRequirements";
vi.mock("./api", () => ({ api: vi.fn() }));

const item = (codigo, titulo, cumplido, extra = {}) => ({ codigo, titulo, cumplido, estado: cumplido ? "CUMPLIDO" : "NO_REGISTRADA", mensaje: cumplido ? "Todo en orden" : "Falta", resuelve: cumplido ? null : "ADMINISTRADOR", procedimiento: cumplido ? null : "Pasos legítimos", ...extra });
const view = (extra = {}) => ({ userId: 7, username: "maria123", nombre: "Maria", apellido: "Lopez", crewRoleCode: "COMANDANTE", crewRoleName: "Comandante", elegible: false, faltantes: 2, provinciaOperativa: "Tucumán", ubicacionActualizadaEn: "2026-11-02T13:17:00",
  requisitos: [item("LICENCIA", "Licencia aeronáutica registrada", true), item("CLASIFICACION", "Clasificación administrativa", false), item("HABILITACION", "Habilitación profesional verificada y vigente", false, { estado: "HABILITACION_AUSENTE" })], ...extra });
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(cleanup);

test("la lista distingue lo cumplido de lo que falta y sólo muestra procedimiento para lo pendiente", () => {
  render(<RequirementList items={view().requisitos}/>);
  expect(screen.getByText(/Licencia aeronáutica registrada/)).toBeInTheDocument();
  expect(screen.getAllByText(/Lo resuelve: Administración\. Pasos legítimos/)).toHaveLength(2);
  expect(screen.getByText(/habilitacion ausente/)).toBeInTheDocument();
});

test("con onlyMissing no se listan los requisitos cumplidos", () => {
  render(<RequirementList items={view().requisitos} onlyMissing/>);
  expect(screen.queryByText(/Licencia aeronáutica registrada/)).toBeNull();
  expect(screen.getByText(/Clasificación administrativa/)).toBeInTheDocument();
});

test("el administrador ve qué le falta a la persona, su ubicación como información y puede cambiar de función", async () => {
  vi.mocked(api).mockImplementation((path) => path.includes("role=MEDICO") ? Promise.resolve(view({ crewRoleCode: "MEDICO", crewRoleName: "Médico", elegible: true, faltantes: 0, requisitos: [item("CLASIFICACION", "Clasificación administrativa", true)] })) : Promise.resolve(view()));
  render(<UserRequirements userId={7} roles={[{ codigo: "COMANDANTE", nombre: "Comandante" }, { codigo: "MEDICO", nombre: "Médico" }]}/>);
  expect(await screen.findByText("Faltan 2 requisitos para Comandante.")).toBeInTheDocument();
  expect(screen.getByText(/Ubicación operativa: Tucumán/)).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/crew-qualifications/7/requirements?role=COMANDANTE");
  fireEvent.change(screen.getByLabelText("Función"), { target: { value: "MEDICO" } });
  expect(await screen.findByText("Cumple todos los requisitos para Médico.")).toBeInTheDocument();
});

test("un error del servidor se informa sin mostrar requisitos inventados", async () => {
  vi.mocked(api).mockRejectedValue(new Error("Usuario inexistente"));
  render(<UserRequirements userId={99}/>);
  expect(await screen.findByText("Usuario inexistente")).toBeInTheDocument();
  expect(screen.queryByText(/Faltan/)).toBeNull();
});

test("el listado de comandantes con pendientes permite gestionar a cada uno y pedir también los que cumplen todo", async () => {
  vi.mocked(api).mockImplementation((path) => Promise.resolve(path.includes("pendientes=false") ? [view(), view({ userId: 8, username: "ok123", apellido: "Ok", nombre: "Ana", elegible: true, faltantes: 0, requisitos: [] })] : [view()]));
  const onManage = vi.fn();
  render(<PendingCommanders onManage={onManage}/>);
  const row = (await screen.findByText("Lopez, Maria")).closest("tr");
  expect(within(row).getByText("Tucumán")).toBeInTheDocument();
  expect(within(row).getByText("Clasificación administrativa, Habilitación profesional verificada y vigente")).toBeInTheDocument();
  fireEvent.click(within(row).getByRole("button", { name: "Gestionar maria123" }));
  expect(onManage).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }));
  fireEvent.click(screen.getByLabelText(/Mostrar también los que cumplen todo/));
  expect(await screen.findByText("Ok, Ana")).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/crew-qualifications/requirements/commanders?q=&pendientes=false&size=100");
});

test("sin pendientes el listado lo dice", async () => {
  vi.mocked(api).mockResolvedValue([]);
  render(<PendingCommanders onManage={vi.fn()}/>);
  await waitFor(() => expect(screen.getByText("Todos los comandantes activos cumplen sus requisitos.")).toBeInTheDocument());
});
