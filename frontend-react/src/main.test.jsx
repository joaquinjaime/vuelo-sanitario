import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
vi.mock("./api", () => ({ api: vi.fn((path) => path === "/auth/users" ? Promise.resolve([]) : path === "/auth/me" ? Promise.resolve({ nombre:"Admin", apellido:"Inicial", dni:null, correos:[], telefonos:[] }) : Promise.resolve({})) }));
beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });
test("admin only renders user management and never operational navigation", async () => {
 localStorage.setItem("vs-session", JSON.stringify({ username:"admin", roles:["ADMINISTRADOR"] }));
 await import("./main.jsx");
 expect((await screen.findAllByText("Gestión de usuarios")).length).toBeGreaterThan(0);
 expect(screen.queryByText("Vuelos")).toBeNull(); expect(screen.queryByText(/Notificaciones/)).toBeNull(); expect(document.querySelector(".icon")?.textContent).not.toContain("🔔");
});
test("saved dark preference is applied before app rendering", () => { localStorage.setItem("vs-theme", "dark"); document.documentElement.dataset.theme="dark"; expect(document.documentElement.dataset.theme).toBe("dark"); });
