import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { api } from "../../services/api";
import { AppProviders } from "../../app/App";
import { LoginPage } from "./LoginPage";
import { WorkspaceSelector } from "./WorkspaceSelector";
vi.mock("../../services/api", () => ({ api: vi.fn(() => Promise.resolve({})), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
const renderLogin = () => render(<MemoryRouter><AppProviders><LoginPage /></AppProviders></MemoryRouter>);
const openActivationForm = async () => {
 renderLogin();
 fireEvent.click(screen.getByRole("button", { name: "Activar cuenta" }));
};
const fillActivationFields = ({ password = "ClaveValida12", confirmation = password } = {}) => {
 fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "30111222" } });
 fireEvent.change(screen.getByLabelText("Código de activación"), { target: { value: "codigo-valido" } });
 fireEvent.change(screen.getByLabelText("Nombre de usuario"), { target: { value: "ana.operaciones" } });
 fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: password } });
 fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: confirmation } });
};
test("activation rejects an 11-character password without sending a request", async () => {
 vi.mocked(api).mockReset();
 await openActivationForm();
 fillActivationFields({ password: "claveonce1", confirmation: "claveonce1" });
 expect(screen.getAllByText("La contraseña debe tener al menos 12 caracteres.")).toHaveLength(2);
 fireEvent.click(screen.getByRole("button", { name: "Activar cuenta" }));
 expect(vi.mocked(api)).not.toHaveBeenCalledWith("/auth/activar-cuenta", expect.anything());
});

test("activation accepts passwords with at least 12 characters", async () => {
 vi.mocked(api).mockReset();
 await openActivationForm();
 fillActivationFields({ password: "ClaveValida12", confirmation: "ClaveValida12" });
 expect(screen.getAllByText("La contraseña debe tener al menos 12 caracteres.")).toHaveLength(1);
 expect(screen.queryByText("La contraseña no puede tener más de 100 caracteres.")).toBeNull();
 expect(screen.queryByText("La contraseña es obligatoria.")).toBeNull();
});

test("activation rejects different password confirmation without sending a request", async () => {
 vi.mocked(api).mockReset();
 await openActivationForm();
 fillActivationFields({ password: "ClaveValida12", confirmation: "OtraClave123" });
 expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name: "Activar cuenta" }));
 expect(vi.mocked(api)).not.toHaveBeenCalled();
});

test("activation sends the request when password and confirmation are valid", async () => {
 vi.mocked(api).mockReset();
 vi.mocked(api).mockResolvedValue(null);
 await openActivationForm();
 fillActivationFields({ password: "ClaveValida12", confirmation: "ClaveValida12" });
 fireEvent.submit(screen.getByRole("button", { name: "Activar cuenta" }).closest("form"));
 await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/auth/activar-cuenta", {
   method: "POST",
   body: JSON.stringify({ dni: "30111222", codigo: "codigo-valido", username: "ana.operaciones", password: "ClaveValida12", confirmacionPassword: "ClaveValida12" }),
 }));
 expect(await screen.findByText("Cuenta activada correctamente. Ya puede iniciar sesión.")).toHaveClass("success");
 expect(screen.getByText("Cuenta activada correctamente. Ya puede iniciar sesión.")).not.toHaveClass("error");
 expect(screen.getByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
});

test("activation errors remain styled as errors", async () => {
 vi.mocked(api).mockReset();
 vi.mocked(api).mockRejectedValue(new Error("Código de activación inválido"));
 await openActivationForm();
 fillActivationFields({ password: "ClaveValida12", confirmation: "ClaveValida12" });
 fireEvent.submit(screen.getByRole("button", { name: "Activar cuenta" }).closest("form"));
 expect(await screen.findByText("Código de activación inválido")).toHaveClass("error");
 expect(screen.getByText("Código de activación inválido")).not.toHaveClass("success");
});

test("workspace selector only renders enabled areas", async () => {
 const select=vi.fn();
 render(<MemoryRouter><AppProviders><WorkspaceSelector workspaces={[{id:"COMANDANTE",label:"Comandante"},{id:"OPERACIONES",label:"Centro de Operaciones"}]} select={select}/></AppProviders></MemoryRouter>);
 fireEvent.click(screen.getByRole("button",{name:"Comandante"}));
 expect(select).toHaveBeenCalledWith("COMANDANTE");
 expect(screen.queryByRole("button",{name:"Administración"})).toBeNull();
});
