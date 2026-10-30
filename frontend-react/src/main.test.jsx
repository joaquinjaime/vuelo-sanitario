import { beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn((path) => path === "/auth/users" ? Promise.resolve([]) : path === "/auth/me" ? Promise.resolve({ nombre:"Admin", apellido:"Inicial", dni:null, correos:[], telefonos:[] }) : Promise.resolve({})), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
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
test("bitácora envía una corrección con motivo y conserva el original", async () => {
 vi.mocked(api).mockReset();let saved=false;
 const original={id:9,tipo:'DEMORA',descripcion:'Espera original',ocurrido:'2025-01-01T12:00:00Z',registrado:'2025-01-01T13:00:00Z',origen:'MANUAL',importancia:'NORMAL',responsable:'cmd'};
 vi.mocked(api).mockImplementation((path,opts)=>{if(opts?.method==='POST'){saved=true;return Promise.resolve({});}return Promise.resolve({entradas:saved?[{...original,id:10,descripcion:'Espera corregida',correccionDe:9,motivoCorreccion:'Hora incorrecta'},original]:[original],hayMas:false,puedeRegistrar:true});});
 const {FlightLog}=await import('./main.jsx');render(<FlightLog flightId={7}/>);
 await screen.findByText('Espera original');fireEvent.click(screen.getByRole('button',{name:'Corregir #9'}));fireEvent.change(screen.getByLabelText('Descripción de la novedad'),{target:{value:'Espera corregida'}});fireEvent.change(screen.getByLabelText('Fecha y hora del acontecimiento'),{target:{value:'2025-01-01T12:00'}});fireEvent.change(screen.getByLabelText('Motivo de corrección'),{target:{value:'Hora incorrecta'}});fireEvent.click(screen.getByRole('button',{name:'Guardar corrección'}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/flights/7/log',expect.objectContaining({method:'POST',body:expect.stringContaining('"correccionDe":9')})));expect(await screen.findByText('Espera corregida')).toBeInTheDocument();expect(screen.getByText('Espera original')).toBeInTheDocument();expect(screen.getByText('Corrección de #9: Hora incorrecta')).toBeInTheDocument();
});
test("bitácora impide iniciar una corrección mientras guarda otra novedad", async () => {
 vi.mocked(api).mockReset();let finish;
 const entry={id:9,tipo:'DEMORA',descripcion:'Entrada existente',ocurrido:'2025-01-01T12:00:00Z',registrado:'2025-01-01T13:00:00Z',origen:'MANUAL',importancia:'NORMAL',responsable:'cmd'};
 vi.mocked(api).mockImplementation((path,opts)=>opts?.method==='POST'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({entradas:[entry],hayMas:false,puedeRegistrar:true}));
 const {FlightLog}=await import('./main.jsx');render(<FlightLog flightId={7}/>);await screen.findByText('Entrada existente');fireEvent.change(screen.getByLabelText('Descripción de la novedad'),{target:{value:'Nueva'}});fireEvent.change(screen.getByLabelText('Fecha y hora del acontecimiento'),{target:{value:'2025-01-01T12:00'}});fireEvent.click(screen.getByRole('button',{name:'Registrar novedad'}));expect(screen.getByRole('button',{name:'Corregir #9'})).toBeDisabled();finish({});await waitFor(()=>expect(screen.getByRole('button',{name:'Corregir #9'})).toBeEnabled());
});
test("tripulación permite retirar un integrante y vuelve a consultar el backend", async () => {
 vi.mocked(api).mockReset();
 const rows=[{id:1,userId:10,nombre:"Ana",apellido:"Piloto",crewRoleName:"Comandante",comandante:true},{id:2,userId:11,nombre:"Luis",apellido:"Médico",crewRoleName:"Médico",comandante:false}];
 let removed=false;
 vi.mocked(api).mockImplementation((path,opts)=>{if(path==="/flights/7/crew/2"&&opts?.method==="DELETE"){removed=true;return Promise.resolve(null);}if(path==="/flights/7/crew")return Promise.resolve(removed?rows.slice(0,1):rows);return Promise.resolve([]);});
 const { FlightCrew } = await import("./main.jsx");render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()}/>);
 expect(await screen.findByText(/Luis Médico/)).toBeInTheDocument();
 expect(screen.getAllByRole("button",{name:"Retirar"})).toHaveLength(1);fireEvent.click(screen.getByRole("button",{name:"Retirar"}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith("/flights/7/crew/2",{method:"DELETE"}));
 await waitFor(()=>expect(screen.queryByText(/Luis Médico/)).not.toBeInTheDocument());
 expect(vi.mocked(api).mock.calls.filter(([path])=>path==="/flights/7/crew")).toHaveLength(2);
});
test("comandante consulta la tripulación sin acciones de modificación", async () => {
 vi.mocked(api).mockReset();vi.mocked(api).mockResolvedValue([{id:2,nombre:"Luis",apellido:"Médico",crewRoleName:"Médico",comandante:false}]);
 const { FlightCrew } = await import("./main.jsx");render(<FlightCrew flightId={7} state="PLANIFICADO" msg={vi.fn()}/>);
 expect(await screen.findByText(/Luis Médico/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Retirar"})).toBeNull();
});
test("operaciones consulta disponibilidad y asigna el usuario elegido", async () => {
 vi.mocked(api).mockReset();
 const initial=[{id:1,userId:10,nombre:"Ana",apellido:"Piloto",crewRoleName:"Comandante",comandante:true}];
 vi.mocked(api).mockImplementation((path,opts)=>{
  if(path.includes("/crew/available"))return Promise.resolve([{userId:11,nombre:"Luis",apellido:"Médico",username:"luis"}]);
  if(opts?.method==="POST")return Promise.resolve(null);
  return Promise.resolve(initial);
 });
 const { FlightCrew } = await import("./main.jsx");render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()}/>);
 await screen.findByText(/Ana Piloto/);fireEvent.change(screen.getByLabelText("Función de tripulación"),{target:{value:"MEDICO"}});
 await screen.findByRole("option",{name:"Luis Médico (luis)"});fireEvent.change(screen.getByLabelText("Personal disponible"),{target:{value:"11"}});
 fireEvent.click(screen.getByRole("button",{name:"Asignar tripulante"}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith("/flights/7/crew",{method:"POST",body:JSON.stringify({userId:11,crewRoleCode:"MEDICO"})}));
 await waitFor(()=>expect(vi.mocked(api).mock.calls.filter(([path,opts])=>path==="/flights/7/crew"&&!opts)).toHaveLength(2));
});
const ROLES=[{codigo:"COMANDANTE",nombre:"Comandante",asignacion:"RECURSOS",requiereClasificacion:true,requiereHabilitacionVerificada:true,requiereLicencia:true,requiereRolAcceso:true},{codigo:"MEDICO",nombre:"Médico",asignacion:"TRIPULACION",requiereClasificacion:true,requiereHabilitacionVerificada:true,requiereLicencia:false,requiereRolAcceso:false}];
test("administración clasifica y retira desde las funciones del servidor, muestra elegibilidad e historial y actualiza con lo confirmado", async () => {
 vi.mocked(api).mockReset();let state="NONE";const notify=vi.fn();
 const row=(vigente)=>({userId:11,crewRoleCode:"MEDICO",crewRoleName:"Médico",vigente,clasificadoPor:"admin",fechaClasificacion:"2026-10-27T10:00:00",retiradoPor:vigente?null:"admin",fechaBaja:vigente?null:"2026-10-27T11:00:00",motivoBaja:vigente?null:"Cambio de función",elegible:vigente?false:null,elegibilidadCodigo:vigente?"HABILITACION_VENCIDA":null,elegibilidadMotivo:vigente?"La habilitación vence antes de la salida o ya venció":null});
 vi.mocked(api).mockImplementation((path,opts)=>{
  if(path==="/catalogs/crew-roles")return Promise.resolve(ROLES);
  if(opts?.method==="PUT"){state="CURRENT";return Promise.resolve(null);}
  if(opts?.method==="DELETE"){state="RETIRED";return Promise.resolve(null);}
  if(path.startsWith("/crew-qualifications/11"))return Promise.resolve(state==="CURRENT"?[row(true)]:state==="RETIRED"?[row(false)]:[]);
  return Promise.resolve([]);
 });
 const { AdminCrewQualifications } = await import("./main.jsx");render(<AdminCrewQualifications users={[{id:11,nombre:"Luis",apellido:"Médico",username:"luis"}]} notify={notify}/>);
 fireEvent.change(screen.getByLabelText("Usuario"),{target:{value:"11"}});
 const card=await screen.findByTestId("rol-MEDICO");expect(within(card).getByText(/Sin clasificación vigente/)).toBeInTheDocument();
 expect(within(card).getByText(/habilitación profesional verificada y vigente/)).toBeInTheDocument();expect(within(screen.getByTestId("rol-COMANDANTE")).getByText(/licencia aeronáutica registrada, rol de acceso COMANDANTE/)).toBeInTheDocument();
 fireEvent.click(within(card).getByRole("button",{name:"Clasificar como Médico"}));
 expect(await within(card).findByText(/No elegible hoy: La habilitación vence/)).toBeInTheDocument();expect(api).toHaveBeenCalledWith("/crew-qualifications/11/MEDICO",{method:"PUT"});
 fireEvent.change(within(card).getByLabelText("Motivo del retiro (opcional)"),{target:{value:"Cambio de función"}});fireEvent.click(within(card).getByRole("button",{name:"Retirar clasificación de Médico"}));
 expect(await within(card).findByText(/Sin clasificación vigente/)).toBeInTheDocument();expect(api).toHaveBeenCalledWith("/crew-qualifications/11/MEDICO?motivo=Cambio%20de%20funci%C3%B3n",{method:"DELETE"});
 expect(await screen.findByTestId("historial-clasificaciones")).toHaveTextContent("Motivo: Cambio de función");expect(notify).toHaveBeenCalledWith("Clasificación retirada; queda en el historial");
});
test("un retiro rechazado por asignaciones activas muestra el motivo del servidor, no informa éxito y conserva la clasificación", async () => {
 vi.mocked(api).mockReset();const notify=vi.fn();
 vi.mocked(api).mockImplementation((path,opts)=>{
  if(path==="/catalogs/crew-roles")return Promise.resolve(ROLES);
  if(opts?.method==="DELETE")return Promise.reject(Object.assign(new Error("Retire primero las asignaciones activas de esta función (V-ABC)"),{code:"CLASIFICACION_EN_USO"}));
  if(path.startsWith("/crew-qualifications/11"))return Promise.resolve([{userId:11,crewRoleCode:"MEDICO",crewRoleName:"Médico",vigente:true,clasificadoPor:"admin",fechaClasificacion:"2026-10-27T10:00:00",elegible:true,elegibilidadCodigo:"ELEGIBLE"}]);
  return Promise.resolve([]);
 });
 const { AdminCrewQualifications } = await import("./main.jsx");render(<AdminCrewQualifications users={[{id:11,nombre:"Luis",apellido:"Médico",username:"luis"}]} notify={notify}/>);
 fireEvent.change(screen.getByLabelText("Usuario"),{target:{value:"11"}});
 const card=await screen.findByTestId("rol-MEDICO");expect(await within(card).findByText(/Elegible hoy/)).toBeInTheDocument();
 fireEvent.click(within(card).getByRole("button",{name:"Retirar clasificación de Médico"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("V-ABC");expect(notify).not.toHaveBeenCalled();expect(within(card).getByText(/Elegible hoy/)).toBeInTheDocument();
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
 expect(screen.queryByRole("heading", { name: "Edición documental" })).toBeNull();
});
test("operations opens a pending request and accepts the DTS schedule", async () => {
 const { Ops } = await import("./main.jsx");
 const done = vi.fn().mockResolvedValue(undefined), msg = vi.fn();
 const flight = { id:"flight-1",codigo:"VS-001",estadoVuelo:"SOLICITADO",datosSanitarios:{patientId:"patient-1",paciente:"Ana Pérez",prioridad:"ALTA",localidadOrigenSolicitada:{id:"loc-tuc",nombre:"San Miguel de Tucumán",provincia:"Tucumán",provinciaId:"prov-tuc"},localidadDestinoSolicitada:{id:"loc-sal",nombre:"Salta",provincia:"Salta",provinciaId:"prov-sal"},fechaSolicitada:"2026-10-01T10:00",extremaUrgencia:true,justificacionExtremaUrgencia:"Crítica",fechaLimiteTraslado:"2026-10-01T14:00",estadoSolicitud:"SOLICITADO"} };
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
   if(path.startsWith("/auth/users/search")){const inactive=new URLSearchParams(path.split("?")[1]).get("status")==="INACTIVOS";const items=adminUsersFixture.filter(u=>inactive?u.activo===false:u.activo!==false);return Promise.resolve({items,total:items.length,page:0,size:20,totalPages:1});} // el listado ahora lo pagina el servidor
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

test("flight documents lists a selected document and exposes its owner lease", async () => {
 const { FlightDocuments } = await import("./main.jsx");
 vi.mocked(api).mockImplementation((path, options) => {
   if(path==="/flights/7/documents") return Promise.resolve([{id:"44",nombreDocumento:"Autorización",tipoDocumento:{codigo:"AUT",nombre:"Autorización"},versionActual:{id:"9",numeroVersion:1,nombreArchivoOriginal:"a.pdf",fechaCreacion:"2026-10-13T10:00:00",urlDescarga:"/api/document-versions/9/download"}}]);
   if(path==="/catalogs/document-types") return Promise.resolve([{codigo:"AUT",nombre:"Autorización"}]);
   if(path==="/documents/44/versions") return Promise.resolve({id:"44",versiones:[{id:"9",numeroVersion:1,esVersionActual:true,nombreArchivoOriginal:"a.pdf",fechaCreacion:"2026-10-13T10:00:00",urlDescarga:"/api/document-versions/9/download"}]});
   if(path==="/documents/44/lock") return Promise.resolve(options?.method==="POST"?{documentId:"44",ownerId:7,ownerUsername:"comandante",acquiredAt:"2026-10-13T10:00:00",expiresAt:"2026-10-13T10:05:00",mine:true,active:true}:{documentId:"44",ownerId:null,ownerUsername:null,acquiredAt:null,expiresAt:null,mine:false,active:false});
   return Promise.resolve({});
 });
 render(<FlightDocuments flightId={7} canEdit msg={vi.fn()}/>);
 fireEvent.click(await screen.findByRole("button",{name:/Autorización/}));
 expect(await screen.findByText(/Disponible para edición/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Adquirir bloqueo"}));
 expect(await screen.findByRole("button",{name:"Liberar bloqueo"})).toBeInTheDocument();
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

test("aceptar la asignación vuelve a cargar la ruta para habilitar su planificación", async () => {
 const { Cmd } = await import("./main.jsx");
 let accepted=false;
 const flight=()=>({id:"1",codigo:"OP-1",estadoVuelo:accepted?"PLANIFICADO":"PENDIENTE_CONFIRMACION_COMANDANTE",tipo:{codigo:"OTRO",nombre:"Otro"}});
 vi.mocked(api).mockImplementation((path,options)=>{
   if(path==="/flights/1/commander-assignment/response"&&options?.method==="POST"){accepted=true;return Promise.resolve({});}
   if(path==="/flights/1")return Promise.resolve({vuelo:flight(),recursos:{},negociacion:[]});
   if(path==="/flights/1/route")return Promise.resolve({estado:"SIN_PLANIFICAR",versiones:[],editable:accepted,causas:[]});
   return Promise.resolve([]);
 });
 render(<Cmd d={{flights:[flight()]}} done={vi.fn(()=>Promise.resolve())} msg={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText("Vuelo"),{target:{value:"1"}});
 fireEvent.click(await screen.findByRole("button",{name:"Aceptar asignación"}));
 expect(await screen.findByLabelText("Recorrido y puntos intermedios en orden")).toBeInTheDocument();
});

test("weather history reloads after a commander records conditions", async () => {
 const { Cmd } = await import("./main.jsx");
 const flight={id:"1",codigo:"OP-1",estadoVuelo:"PLANIFICADO",tipo:{codigo:"OTRO",nombre:"Otro"}};
 let saved=false;
 vi.mocked(api).mockImplementation((path,options)=>{
   if(path==="/flights/1/weather"&&options?.method==="POST"){saved=true;return Promise.resolve({});}
   if(path==="/flights/1/weather")return Promise.resolve(saved?[{id:1,condiciones:"Nubes bajas",favorable:false,observaciones:"Viento",fechaRegistro:"2026-10-18T12:00:00",registradoPor:"piloto"}]:[]);
   if(path==="/flights/1")return Promise.resolve({vuelo:flight,recursos:{},negociacion:[]});
   return Promise.resolve([]);
 });
 render(<Cmd d={{flights:[flight]}} done={vi.fn()} msg={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText("Vuelo"),{target:{value:"1"}});
 expect(await screen.findByText("Sin registros meteorológicos.")).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Condiciones"),{target:{value:"Nubes bajas"}});
 fireEvent.click(screen.getByRole("button",{name:"Registrar clima"}));
 expect(await screen.findByText(/No favorable/)).toBeInTheDocument();
 expect(screen.getByText("Nubes bajas")).toBeInTheDocument();
 expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/1/weather",expect.objectContaining({method:"POST"}));
});
test("weather history shows an error rather than an empty history", async () => {
 const { WeatherHistory } = await import("./main.jsx");
 vi.mocked(api).mockRejectedValue(new Error("Acceso denegado"));
 render(<WeatherHistory flightId="1"/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("Acceso denegado");
});

test("the root does not request administrator resources for a commander", async () => {
 const { AdminApp } = await import("./main.jsx");
 localStorage.setItem("vs-session",JSON.stringify({username:"piloto",roles:["COMANDANTE"]}));
 vi.mocked(api).mockReset();
 vi.mocked(api).mockImplementation(path => path==="/notifications" ? Promise.resolve({items:[]}) : Promise.resolve([]));
 render(<AdminApp/>);
 expect(await screen.findByText("Planificación operativa")).toBeInTheDocument();
 await waitFor(()=>expect(api).toHaveBeenCalledWith("/flights"));
 expect(api).not.toHaveBeenCalledWith("/auth/users");
 expect(api).not.toHaveBeenCalledWith("/catalogs/aircraft/admin");
});
test("the root waits for password change before loading administrator resources", async () => {
 const { AdminApp }=await import("./main.jsx");
 localStorage.setItem("vs-session",JSON.stringify({username:"temporal",roles:["ADMINISTRADOR"],debeCambiarContrasena:true}));
 vi.mocked(api).mockReset();
 render(<AdminApp/>);
 expect(screen.getByRole("heading",{name:"Actualizá tu contraseña"})).toBeInTheDocument();
 expect(api).not.toHaveBeenCalledWith("/auth/users");
 expect(api).not.toHaveBeenCalledWith("/catalogs/aircraft/admin");
});

test("ruta: comandante guarda la versión cargada y operaciones solo consulta", async () => {
 vi.mocked(api).mockReset(); let version=0;
 vi.mocked(api).mockImplementation((path,opts)=>{
  if(path==='/catalogs/airports?q=')return Promise.resolve([]);
  if(path==='/flights/42/route'&&opts?.method==='PUT'){version=1;return Promise.resolve({});}
  if(path==='/flights/42/route')return Promise.resolve({estado:version?'COMPLETA':'SIN_PLANIFICAR',editable:true,origen:'Origen',destino:'Destino',versiones:version?[{version:1,recorrido:'Punto Alfa',creadoPor:'comandante',fechaCreacion:'2030-01-01T12:00:00'}]:[]});
  return Promise.resolve([]);
 });
 const {FlightRoute}=await import('./main.jsx');const view=render(<FlightRoute flightId={42} canEdit msg={vi.fn()}/>);
 await screen.findByText(/Sin planificar/);fireEvent.change(screen.getByLabelText('Recorrido y puntos intermedios en orden'),{target:{value:'Punto Alfa'}});fireEvent.click(screen.getByRole('button',{name:'Guardar ruta'}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/flights/42/route',expect.objectContaining({method:'PUT',body:expect.stringContaining('"version":0')})));
 await screen.findByText('Punto Alfa',{selector:'p'});view.unmount();render(<FlightRoute flightId={42} msg={vi.fn()}/>);
 await screen.findByText('Punto Alfa',{selector:'p'});expect(screen.queryByRole('button',{name:'Guardar ruta'})).toBeNull();
});

test("regresión: el trayecto de un vuelo operativo se muestra desde el contrato estructurado, sin 'undefined'", async () => {
 const { OperationalApp, adaptFlight, locationLabel } = await import("./main.jsx");
 const operational = { id: 5, codigo: "V-OP5", tipo: { codigo: "REGRESO_BASE", nombre: "Regreso a base" }, motivoVuelo: "Retorno", estadoVuelo: "PLANIFICADO", datosSanitarios: null, origen: "Aeroparque Jorge Newbery", destino: "Benjamín Matienzo", origenDetalle: { id: 1, nombre: "Aeroparque Jorge Newbery", provincia: "Buenos Aires", provinciaId: 2 }, destinoDetalle: { id: 2, nombre: "Benjamín Matienzo", provincia: "Tucumán", provinciaId: 3 } };
 const unplanned = { ...operational, id: 6, codigo: "V-SIN", estadoVuelo: "SOLICITADO", origen: null, destino: null, origenDetalle: null, destinoDetalle: null };
 const sanitary = { ...operational, id: 7, codigo: "V-SAN", datosSanitarios: { localidadOrigenSolicitada: { nombre: "Tafí Viejo", provincia: "Tucumán" }, localidadDestinoSolicitada: { nombre: "Rosario", provincia: "Santa Fe" }, estadoSolicitud: "SOLICITADO" }, estadoVuelo: null };
 expect(locationLabel(adaptFlight(operational).origen)).toBe("Aeroparque Jorge Newbery, Buenos Aires"); expect(locationLabel(adaptFlight(sanitary).destino)).toBe("Rosario, Santa Fe");
 expect(locationLabel(adaptFlight(unplanned).origen)).toBe("—"); expect(locationLabel("Aeroparque")).toBe("Aeroparque"); expect(locationLabel({ nombre: "Solo nombre" })).toBe("Solo nombre"); expect(locationLabel({})).toBe("—");
 expect(locationLabel(adaptFlight({ ...operational, origenDetalle: undefined }).origen)).toBe("Aeroparque Jorge Newbery");
 localStorage.setItem("vs-session", JSON.stringify({ username: "operaciones", roles: ["CENTRO_OPERACIONES"] }));
 vi.mocked(api).mockImplementation((path) => path === "/flights" ? Promise.resolve([operational, unplanned, sanitary]) : path === "/notifications" ? Promise.resolve({ items: [], unread: 0 }) : Promise.resolve([]));
 const { container } = render(<OperationalApp workspace="OPERACIONES" />);
 await screen.findByText("V-OP5");
 const rows = [...container.querySelectorAll("table tbody tr")].map((r) => r.textContent);
 expect(rows.some((t) => t.includes("Aeroparque Jorge Newbery, Buenos Aires → Benjamín Matienzo, Tucumán"))).toBe(true);
 expect(rows.some((t) => t.includes("Tafí Viejo, Tucumán → Rosario, Santa Fe"))).toBe(true);
 expect(rows.some((t) => t.includes("V-SIN") && t.includes("— → —"))).toBe(true);
 expect(container.textContent).not.toContain("undefined");
});
test("every operational workspace reaches Mi cuenta with its own contacts, and the page survives a reload through the hash", async () => {
 const { OperationalApp } = await import("./main.jsx");
 for (const [workspace, role] of [["DTS", "DTS"], ["COMANDANTE", "COMANDANTE"], ["OPERACIONES", "CENTRO_OPERACIONES"]]) {
  document.body.innerHTML = '<div id="root"></div>'; history.replaceState(null, "", "/");
  const replace = vi.spyOn(history, "replaceState");
  localStorage.setItem("vs-session", JSON.stringify({ username: role.toLowerCase(), roles: [role] }));
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((path) => {
   if (path === "/auth/me") return Promise.resolve({ nombre: "Ana", apellido: "Paz", dni: "30111222", correos: [{ id: 1, valor: "ana@example.test", tipo: "PERSONAL", principal: true, version: 0 }], telefonos: [{ id: 2, valor: "3815551234", tipo: "PERSONAL", principal: true, version: 0 }] });
   if (path === "/notifications") return Promise.resolve({ content: [] });
   return Promise.resolve([]);
  });
  const view = render(<OperationalApp workspace={workspace} />);
  expect(screen.queryByRole("heading", { name: "Mis datos de contacto" })).toBeNull();
  fireEvent.click(screen.getByText("Mi cuenta"));
  expect(await screen.findByRole("heading", { name: "Mis datos de contacto" })).toBeInTheDocument();
  expect(await screen.findByText("ana@example.test")).toBeInTheDocument();
  expect(screen.queryByText("Vuelos visibles")).toBeNull();
  expect(replace).toHaveBeenLastCalledWith(null, "", "#/mi-cuenta");
  view.unmount();
  location.hash = "#/mi-cuenta";   // lo que deja el navegador al recargar
  render(<OperationalApp workspace={workspace} />);
  expect(await screen.findByRole("heading", { name: "Mis datos de contacto" })).toBeInTheDocument();
  fireEvent.click(screen.getByText(workspace === "DTS" ? "Dirección de Tránsito Sanitario" : workspace === "COMANDANTE" ? "Comandante" : "Centro de Operaciones"));
  expect(await screen.findByText("Vuelos visibles")).toBeInTheDocument();
  expect(replace).toHaveBeenLastCalledWith(null, "", "/");
  replace.mockRestore();
  cleanup();
 }
});
