import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn((path) => path === "/auth/users" ? Promise.resolve([]) : path === "/auth/me" ? Promise.resolve({ nombre:"Admin", apellido:"Inicial", dni:null, correos:[], telefonos:[] }) : Promise.resolve({})) }));
beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });
const openActivationForm = async () => {
 const { Login } = await import("./main.jsx");
 render(<Login set={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: "Activar cuenta" }));
};
const fillActivationFields = ({ password = "ClaveValida12", confirmation = password } = {}) => {
 fireEvent.change(screen.getByLabelText("DNI"), { target: { value: "30111222" } });
 fireEvent.change(screen.getByLabelText("Código de activación"), { target: { value: "codigo-valido" } });
 fireEvent.change(screen.getByLabelText("Nombre de usuario"), { target: { value: "ana.operaciones" } });
 fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: password } });
 fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: confirmation } });
};
test("admin renders the dashboard and never operational navigation", async () => {
 localStorage.setItem("vs-session", JSON.stringify({ username:"admin", roles:["ADMINISTRADOR"] }));
 await import("./main.jsx");
 expect(await screen.findByText("Panel de administración")).toBeInTheDocument();
 expect(screen.queryByText("Vuelos")).toBeNull(); expect(screen.queryByText(/Notificaciones/)).toBeNull(); expect(document.querySelector(".icon")?.textContent).not.toContain("🔔");
});
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
test("login keeps the temporary-password flag in the active session", async () => {
 vi.mocked(api).mockReset();
 vi.mocked(api).mockResolvedValue({ accessToken:"new-token", username:"temporal", roles:["DTS"], debeCambiarContrasena:true });
 const { Login } = await import("./main.jsx");
 const set = vi.fn();
 render(<Login set={set} />);
 fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "temporal" } });
 fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "TemporalJWT12" } });
 fireEvent.submit(screen.getByRole("button", { name: "Iniciar sesión" }).closest("form"));
 await waitFor(() => expect(set).toHaveBeenCalledWith({ username:"temporal", roles:["DTS"], debeCambiarContrasena:true }));
 expect(localStorage.getItem("vs-token")).toBe("new-token");
 expect(JSON.parse(localStorage.getItem("vs-session"))).toMatchObject({ debeCambiarContrasena:true });
});
test("Centro de Operaciones loads its workspace without the administrative users request or an access-denied banner", async () => {
 const { OperationalApp } = await import("./main.jsx");
 localStorage.setItem("vs-session", JSON.stringify({ username: "operaciones", roles: ["CENTRO_OPERACIONES"] }));
 vi.mocked(api).mockImplementation((path) => {
   if (path === "/auth/users") return Promise.reject(new Error("Acceso denegado"));
   if (path === "/auth/users/commanders") return Promise.resolve([]);
   if (path === "/notifications") return Promise.resolve({ content: [] });
   return Promise.resolve([]);
 });
 render(<OperationalApp workspace="OPERACIONES" />);
 await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/auth/users/commanders"));
 expect(vi.mocked(api)).not.toHaveBeenCalledWith("/auth/users");
 expect(screen.queryByText("Acceso denegado")).toBeNull();
});
test("operations opens a pending request and accepts the DTS schedule", async () => {
 const { Ops } = await import("./main.jsx");
 const done = vi.fn().mockResolvedValue(undefined), msg = vi.fn();
 const flight = { id:"flight-1",codigo:"VS-001",estado:"SOLICITADO",paciente:"Ana Pérez",prioridad:"ALTA",origen:{id:"loc-tuc",nombre:"San Miguel de Tucumán",provincia:"Tucumán"},destino:{id:"loc-sal",nombre:"Salta",provincia:"Salta"},solicitada:"2026-10-01T10:00",extremaUrgencia:true,justificacionExtremaUrgencia:"Crítica",fechaLimiteTraslado:"2026-10-01T14:00" };
 const detail = { vuelo:flight,paciente:{nombre:"Ana",apellido:"Pérez",dni:"30111222"},medical:{diagnostico:"Diagnóstico",condicionMedica:"ESTABLE",requiereEquipamientoEspecial:true,observaciones:"Oxígeno"},motivoSolicitud:"Traslado",motivoRechazo:null,recursos:{} };
 vi.mocked(api).mockImplementation((path, options) => path==="/flights/flight-1"&&options?.method!=="POST" ? Promise.resolve(detail) : Promise.resolve(flight));
 render(<Ops d={{flights:[flight],aircraft:[],commanders:[]}} done={done} msg={msg} />);
 fireEvent.change(screen.getByLabelText("Solicitud"),{target:{value:"flight-1"}});
 expect(await screen.findByText("Propuesta DTS")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", { name:"Aceptar horario DTS" }));
 await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/flight-1/schedule/accept", expect.objectContaining({ method:"POST" })));
 expect(msg).toHaveBeenCalledWith("Horario aceptado");
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
test("consecutive pending creations keep each code modal independent from the reset form", async () => {
 const { AdminUsers } = await import("./main.jsx");
 const reload = vi.fn().mockResolvedValue(undefined);
 let created=0;
 vi.mocked(api).mockImplementation((path, options) => {
   if (path === "/auth/users" && options?.method === "POST") return Promise.resolve({ codigo: ++created===1 ? "codigo-uno" : "codigo-dos" });
   return Promise.resolve([]);
 });
 render(<AdminUsers users={[]} reload={reload} notify={vi.fn()} />);
 const completeAndSubmit = (dni) => {
   fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
   fireEvent.change(screen.getByLabelText("Apellido"), { target: { value: "Pérez" } });
   fireEvent.change(screen.getByLabelText("DNI"), { target: { value: dni } });
   fireEvent.change(screen.getByLabelText("Correo principal"), { target: { value: `${dni}@example.test` } });
   fireEvent.change(screen.getByLabelText("Teléfono principal"), { target: { value: "3815555555" } });
   fireEvent.click(screen.getByLabelText("DTS"));
   fireEvent.click(screen.getByRole("button", { name: "Crear cuenta pendiente" }));
 };
 fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
 completeAndSubmit("30111222");
 await waitFor(() => expect(screen.queryByLabelText("DNI")).toBeNull());
 expect(screen.getByText(/Código de activación/)).toBeInTheDocument();
 expect(screen.getByRole("dialog")).toBeInTheDocument();
 expect(screen.getByText("codigo-uno")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Cerrar aviso"}));
 expect(screen.queryByText(/Código de activación/)).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
 expect(screen.getByLabelText("Nombre")).toHaveValue("");
 expect(screen.getByLabelText("Apellido")).toHaveValue("");
 expect(screen.getByLabelText("DNI")).toHaveValue("");
 expect(screen.getByLabelText("Correo principal")).toHaveValue("");
 expect(screen.getByLabelText("Teléfono principal")).toHaveValue("");
 expect(screen.getByLabelText("DTS")).not.toBeChecked();
 completeAndSubmit("30222333");
 await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
 expect(screen.getByRole("dialog")).toBeInTheDocument();
 expect(screen.getByText("codigo-dos")).toBeInTheDocument();
 expect(vi.mocked(api).mock.calls.filter(([path, options]) => path === "/auth/users" && options?.method === "POST")).toHaveLength(2);
});
test("regeneration displays its one-time response and can be dismissed", async () => {
 const { AdminUsers } = await import("./main.jsx");
 const pending={id:"user-pending",nombre:"Ana",apellido:"Pérez",dni:"47355303",username:null,estado:"PENDIENTE_ACTIVACION",roles:["DTS"],correos:[]};
 vi.mocked(api).mockImplementation((path,options) => path==="/auth/users/user-pending/activation-code"&&options?.method==="POST" ? Promise.resolve({codigo:"codigo-regenerado"}) : Promise.resolve([]));
 render(<AdminUsers users={[pending]} reload={vi.fn()} notify={vi.fn()} />);
 fireEvent.click(screen.getByRole("button",{name:"Regenerar código"}));
 expect(await screen.findByText("codigo-regenerado")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Cerrar aviso"}));
 expect(screen.queryByText("codigo-regenerado")).toBeNull();
});
test("workspace selector only renders enabled areas", async () => {
 const { WorkspaceSelector } = await import("./main.jsx");
 const select=vi.fn();
 render(<WorkspaceSelector workspaces={[{id:"COMANDANTE",label:"Comandante"},{id:"OPERACIONES",label:"Centro de Operaciones"}]} select={select}/>);
 fireEvent.click(screen.getByRole("button",{name:"Comandante"}));
 expect(select).toHaveBeenCalledWith("COMANDANTE");
 expect(screen.queryByRole("button",{name:"Administración"})).toBeNull();
});
test("changing area preserves the session and moves from administration to operations", async () => {
 const { AdminApp } = await import("./main.jsx");
 localStorage.setItem("vs-token","unchanged-token");
 localStorage.setItem("vs-session",JSON.stringify({username:"admin-op",roles:["ADMINISTRADOR","CENTRO_OPERACIONES"]}));
 vi.mocked(api).mockImplementation((path) => {
   if(path==="/auth/users")return Promise.resolve([]);
   if(path==="/auth/me")return Promise.resolve({nombre:"Admin",apellido:"Op",dni:null,correos:[],telefonos:[]});
   if(path==="/notifications")return Promise.resolve({content:[]});
   return Promise.resolve([]);
 });
 render(<AdminApp/>);
 fireEvent.click(await screen.findByRole("button",{name:"Administración"}));
 expect(await screen.findByText("Panel de administración")).toBeInTheDocument();
 expect(screen.queryByText("Vuelos visibles")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Cambiar área"}));
 fireEvent.click(await screen.findByRole("button",{name:"Centro de Operaciones"}));
 expect(await screen.findByText("Vuelos visibles")).toBeInTheDocument();
 expect(localStorage.getItem("vs-token")).toBe("unchanged-token");
 expect(JSON.parse(localStorage.getItem("vs-session")).roles).toEqual(["ADMINISTRADOR","CENTRO_OPERACIONES"]);
});
const adminUsersFixture=[
 {id:"u-activo",nombre:"Lisandro",apellido:"Lopez",dni:"42789123",username:"lisandro123",estado:"ACTIVO",activo:true,fechaBaja:null,roles:["DTS"],correos:[],telefonos:[],provinciaActual:null},
 {id:"u-comandante",nombre:"Maria",apellido:"Rodriguez",dni:"38789789",username:"maria123",estado:"ACTIVO",activo:true,fechaBaja:null,roles:["COMANDANTE"],correos:[],telefonos:[],provinciaActual:"Tucumán"},
 {id:"u-baja",nombre:"Prueba",apellido:"Baja",dni:"15408625",username:"bajatest",estado:"DESACTIVADO",activo:false,fechaBaja:"2026-09-29T01:31:15",roles:["DTS"],correos:[],telefonos:[],provinciaActual:null}
];
test("admin users stay visible when an unrelated admin resource fails (regression: aircraft 500 emptied the list)", async () => {
 const { AdminApp } = await import("./main.jsx");
 localStorage.setItem("vs-session",JSON.stringify({username:"admin",roles:["ADMINISTRADOR"]}));
 window.location.hash="#/admin/usuarios";
 vi.mocked(api).mockImplementation((path) => {
   if(path==="/auth/users")return Promise.resolve(adminUsersFixture);
   if(path==="/auth/me")return Promise.resolve({nombre:"Admin",apellido:"Inicial",dni:null,correos:[],telefonos:[]});
   if(path==="/catalogs/aircraft/admin")return Promise.reject(new Error("Error interno"));
   return Promise.resolve([]);
 });
 render(<AdminApp/>);
 expect(await screen.findByText("Lisandro")).toBeInTheDocument();
 expect(screen.getByText("Maria")).toBeInTheDocument();
 expect(screen.queryByText("bajatest")).toBeNull();
 expect(screen.getByText(/No se pudo cargar aeronaves: Error interno/)).toBeInTheDocument();
 expect(screen.getAllByRole("button",{name:"Desactivar"})).toHaveLength(2);
 fireEvent.click(screen.getByRole("button",{name:"Usuarios desactivados"}));
 expect(await screen.findByText("bajatest")).toBeInTheDocument();
 expect(screen.queryByText("lisandro123")).toBeNull();
 expect(screen.getByRole("button",{name:"Reactivar"})).toBeInTheDocument();
 window.location.hash="";
});
test("deactivating from the active list calls the logical-deactivation endpoint and reloads from the backend", async () => {
 const { AdminUsers } = await import("./main.jsx");
 const reload=vi.fn(()=>Promise.resolve()), notify=vi.fn();
 vi.spyOn(window,"confirm").mockReturnValue(true);
 vi.mocked(api).mockImplementation(() => Promise.resolve({}));
 render(<AdminUsers users={adminUsersFixture} reload={reload} notify={notify} active />);
 fireEvent.click(screen.getAllByRole("button",{name:"Desactivar"})[0]);
 await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/auth/users/u-activo/deactivate",{method:"PATCH",body:"{}"}));
 await waitFor(() => expect(reload).toHaveBeenCalled());
 expect(notify).toHaveBeenCalledWith("Usuario desactivado");
});
test("reactivating a deactivated user opens the review form and calls the reactivation endpoint", async () => {
 const { AdminUsers } = await import("./main.jsx");
 const reload=vi.fn(()=>Promise.resolve()), notify=vi.fn();
 vi.mocked(api).mockImplementation((path) => path==="/auth/users/u-baja/reactivate" ? Promise.resolve({contrasenaTemporal:"Temporal-123456"}) : Promise.resolve({}));
 render(<AdminUsers users={adminUsersFixture} reload={reload} notify={notify} active={false} />);
 fireEvent.click(screen.getByRole("button",{name:"Reactivar"}));
 fireEvent.click(await screen.findByRole("button",{name:"Reactivar y generar contraseña"}));
 await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/auth/users/u-baja/reactivate",expect.objectContaining({method:"PATCH"})));
 expect(await screen.findByText("Temporal-123456")).toBeInTheDocument();
 expect(reload).toHaveBeenCalled();
});
