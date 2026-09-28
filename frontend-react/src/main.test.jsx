import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn((path) => path === "/auth/users" ? Promise.resolve([]) : path === "/auth/me" ? Promise.resolve({ nombre:"Admin", apellido:"Inicial", dni:null, correos:[], telefonos:[] }) : Promise.resolve({})) }));
beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });
test("admin only renders user management and never operational navigation", async () => {
 localStorage.setItem("vs-session", JSON.stringify({ username:"admin", roles:["ADMINISTRADOR"] }));
 await import("./main.jsx");
 expect((await screen.findAllByText("Gestión de usuarios")).length).toBeGreaterThan(0);
 expect(screen.queryByText("Vuelos")).toBeNull(); expect(screen.queryByText(/Notificaciones/)).toBeNull(); expect(document.querySelector(".icon")?.textContent).not.toContain("🔔");
});
test("saved dark preference is applied before app rendering", () => { localStorage.setItem("vs-theme", "dark"); document.documentElement.dataset.theme="dark"; expect(document.documentElement.dataset.theme).toBe("dark"); });
test("the license input follows the COMANDANTE role without clearing the form", async () => {
 const { AdminUsers } = await import("./main.jsx");
 render(<AdminUsers users={[]} reload={vi.fn()} notify={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
 fireEvent.click(screen.getByLabelText("CENTRO_OPERACIONES"));
 expect(screen.queryByLabelText("Número de licencia")).toBeNull();
 fireEvent.click(screen.getByLabelText("COMANDANTE"));
 const license = screen.getByLabelText("Número de licencia");
 expect(license).toBeRequired();
 fireEvent.change(license, { target: { value: "LIC-42" } });
 fireEvent.click(screen.getByLabelText("COMANDANTE"));
 expect(screen.queryByLabelText("Número de licencia")).toBeNull();
 fireEvent.click(screen.getByLabelText("COMANDANTE"));
 expect(screen.getByLabelText("Número de licencia")).toHaveValue("LIC-42");
});
test("an administrator can open a clean form and create another pending person", async () => {
 const { AdminUsers } = await import("./main.jsx");
 const reload = vi.fn().mockResolvedValue(undefined);
 vi.mocked(api).mockImplementation((path, options) => {
   if (path === "/auth/users" && options?.method === "POST") return Promise.resolve({ codigo: "codigo-prueba" });
   return Promise.resolve([]);
 });
 render(<AdminUsers users={[]} reload={reload} notify={vi.fn()} />);
 const completeAndSubmit = (dni) => {
   fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
   fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "Pérez" } });
   fireEvent.change(screen.getByLabelText("DNI"), { target: { value: dni } });
   fireEvent.change(screen.getByLabelText("Correo principal"), { target: { value: `${dni}@example.test` } });
   fireEvent.change(screen.getByLabelText("Teléfono principal"), { target: { value: "3815555555" } });
   fireEvent.click(screen.getByRole("button", { name: "Crear cuenta pendiente" }));
 };
 fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
 completeAndSubmit("30111222");
 await waitFor(() => expect(screen.queryByLabelText("DNI")).toBeNull());
 fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
 expect(screen.getByLabelText("DNI")).toHaveValue("");
 completeAndSubmit("30222333");
 await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
 expect(vi.mocked(api).mock.calls.filter(([path, options]) => path === "/auth/users" && options?.method === "POST")).toHaveLength(2);
});
