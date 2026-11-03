import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "../../../services/api";
vi.mock("../../../services/api", () => ({ api: vi.fn(() => Promise.resolve({})), uploadFile: vi.fn(), downloadFile: vi.fn(), credentialFile: vi.fn() }));
beforeEach(() => { localStorage.clear(); });
test("bitácora envía una corrección con motivo y conserva el original", async () => {
 vi.mocked(api).mockReset();let saved=false;
 const original={id:9,tipo:'DEMORA',descripcion:'Espera original',ocurrido:'2025-01-01T12:00:00Z',registrado:'2025-01-01T13:00:00Z',origen:'MANUAL',importancia:'NORMAL',responsable:'cmd'};
 vi.mocked(api).mockImplementation((path,opts)=>{if(opts?.method==='POST'){saved=true;return Promise.resolve({});}return Promise.resolve({entradas:saved?[{...original,id:10,descripcion:'Espera corregida',correccionDe:9,motivoCorreccion:'Hora incorrecta'},original]:[original],hayMas:false,puedeRegistrar:true});});
 const { FlightLog } = await import("./FlightLog");render(<FlightLog flightId={7}/>);
 await screen.findByText('Espera original');fireEvent.click(screen.getByRole('button',{name:'Corregir #9'}));fireEvent.change(screen.getByLabelText('Descripción de la novedad'),{target:{value:'Espera corregida'}});fireEvent.change(screen.getByLabelText('Fecha y hora del acontecimiento'),{target:{value:'2025-01-01T12:00'}});fireEvent.change(screen.getByLabelText('Motivo de corrección'),{target:{value:'Hora incorrecta'}});fireEvent.click(screen.getByRole('button',{name:'Guardar corrección'}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/flights/7/log',expect.objectContaining({method:'POST',body:expect.stringContaining('"correccionDe":9')})));expect(await screen.findByText('Espera corregida')).toBeInTheDocument();expect(screen.getByText('Espera original')).toBeInTheDocument();expect(screen.getByText('Corrección de #9: Hora incorrecta')).toBeInTheDocument();
});

test("bitácora impide iniciar una corrección mientras guarda otra novedad", async () => {
 vi.mocked(api).mockReset();let finish;
 const entry={id:9,tipo:'DEMORA',descripcion:'Entrada existente',ocurrido:'2025-01-01T12:00:00Z',registrado:'2025-01-01T13:00:00Z',origen:'MANUAL',importancia:'NORMAL',responsable:'cmd'};
 vi.mocked(api).mockImplementation((path,opts)=>opts?.method==='POST'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({entradas:[entry],hayMas:false,puedeRegistrar:true}));
 const { FlightLog } = await import("./FlightLog");render(<FlightLog flightId={7}/>);await screen.findByText('Entrada existente');fireEvent.click(screen.getByRole('button',{name:'Nuevo acontecimiento'}));fireEvent.change(screen.getByLabelText('Descripción de la novedad'),{target:{value:'Nueva'}});fireEvent.change(screen.getByLabelText('Fecha y hora del acontecimiento'),{target:{value:'2025-01-01T12:00'}});fireEvent.click(screen.getByRole('button',{name:'Registrar novedad'}));expect(screen.getByRole('button',{name:'Corregir #9'})).toBeDisabled();finish({});await waitFor(()=>expect(screen.getByRole('button',{name:'Corregir #9'})).toBeEnabled());
});

test("tripulación permite retirar un integrante y vuelve a consultar el backend", async () => {
 vi.mocked(api).mockReset();
 const rows=[{id:1,userId:10,nombre:"Ana",apellido:"Piloto",crewRoleName:"Comandante",comandante:true},{id:2,userId:11,nombre:"Luis",apellido:"Médico",crewRoleName:"Médico",comandante:false}];
 let removed=false;
 vi.mocked(api).mockImplementation((path,opts)=>{if(path==="/flights/7/crew/2"&&opts?.method==="DELETE"){removed=true;return Promise.resolve(null);}if(path==="/flights/7/crew")return Promise.resolve(removed?rows.slice(0,1):rows);return Promise.resolve([]);});
 const { FlightCrew } = await import("./FlightCrew");render(<FlightCrew flightId={7} state="PLANIFICADO" canManage msg={vi.fn()}/>);
 expect(await screen.findByText(/Luis Médico/)).toBeInTheDocument();
 expect(screen.getAllByRole("button",{name:"Retirar"})).toHaveLength(1);fireEvent.click(screen.getByRole("button",{name:"Retirar"}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith("/flights/7/crew/2",{method:"DELETE"}));
 await waitFor(()=>expect(screen.queryByText(/Luis Médico/)).not.toBeInTheDocument());
 expect(vi.mocked(api).mock.calls.filter(([path])=>path==="/flights/7/crew")).toHaveLength(2);
});

test("comandante consulta la tripulación sin acciones de modificación", async () => {
 vi.mocked(api).mockReset();vi.mocked(api).mockResolvedValue([{id:2,nombre:"Luis",apellido:"Médico",crewRoleName:"Médico",comandante:false}]);
 const { FlightCrew } = await import("./FlightCrew");render(<FlightCrew flightId={7} state="PLANIFICADO" msg={vi.fn()}/>);
 expect(await screen.findByText(/Luis Médico/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Retirar"})).toBeNull();
});

test("operaciones elige al copiloto entre los usuarios COMANDANTE y lo asigna con la función COPILOTO", async () => {
 vi.mocked(api).mockReset();
 const initial=[{id:1,userId:10,nombre:"Ana",apellido:"Piloto",crewRoleName:"Comandante",crewRoleCode:"COMANDANTE",comandante:true,vigente:true}];
 const candidate={id:11,username:"luis",nombre:"Luis",apellido:"Gómez",licencia:"L-11",provinciaId:1,provincia:"Tucumán",ubicacionPrevistaTrasVuelo:null,elegibilidad:"ORDINARIA"};
 vi.mocked(api).mockImplementation((path,opts)=>{
  if(path.startsWith("/flights/7/commander-candidates"))return Promise.resolve({salida:{provinciaId:1,provincia:"Tucumán",aeropuertoId:5,aeropuerto:"Matienzo",fuente:"AEROPUERTO_CONFIRMADO",preliminar:false},comandanteAsignadoId:10,ordinarios:[candidate],noElegiblesEnJurisdiccion:[],excepcionales:[],excepcionalesIncompletos:false,fueraDeJurisdiccion:{},puedeAutorizarExcepcion:false,mensaje:null,advertencia:null});
  if(opts?.method==="POST")return Promise.resolve(null);
  return Promise.resolve(initial);
 });
 const { FlightCrew } = await import("./FlightCrew");render(<FlightCrew flightId={7} state="PLANIFICADO" canManage copilot msg={vi.fn()}/>);
 await screen.findByText(/Ana Piloto/);fireEvent.click(await screen.findByRole("button",{name:"Seleccionar copiloto"}));
 expect(await screen.findByText("Disponibles en Tucumán")).toBeInTheDocument();expect(screen.queryByRole("option",{name:/Médico|Enfermero/})).toBeNull();
 fireEvent.click(screen.getByRole("radio",{name:/Gómez, Luis/}));fireEvent.click(screen.getByRole("button",{name:"Confirmar copiloto"}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith("/flights/7/crew",{method:"POST",body:JSON.stringify({userId:11,crewRoleCode:"COPILOTO",excepcionGeografica:null})}));
});

test("la tripulación explica que el copiloto no recibe las tareas del comandante principal", async () => {
 vi.mocked(api).mockReset();vi.mocked(api).mockResolvedValue([{id:2,userId:11,nombre:"Luis",apellido:"Gómez",crewRoleCode:"COPILOTO",crewRoleName:"Copiloto",comandante:false,vigente:true,elegibilidadCodigo:"ITINERARIO_INCOHERENTE",elegibilidadMotivo:"Estará en Tucumán al terminar el vuelo V-1"}]);
 const { FlightCrew } = await import("./FlightCrew");render(<FlightCrew flightId={7} state="PLANIFICADO" msg={vi.fn()}/>);
 expect(await screen.findByText(/Luis Gómez/)).toBeInTheDocument();expect(screen.getByText(/no recibe las tareas del comandante principal/)).toBeInTheDocument();
 expect(screen.getByRole("status")).toHaveTextContent("Requiere revisión: Estará en Tucumán");
});

test("flight documents lists a selected document and exposes its owner lease", async () => {
 const { FlightDocuments } = await import("../documents");
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

test("weather history shows an error rather than an empty history", async () => {
 const { WeatherLog } = await import("./WeatherLog");
 vi.mocked(api).mockRejectedValue(new Error("Acceso denegado"));
 render(<WeatherLog flightId="1"/>);
 fireEvent.click(screen.getByText("Condiciones meteorológicas"));
 expect(await screen.findByRole("alert")).toHaveTextContent("Acceso denegado");
});


test("ruta: comandante guarda la versión cargada y operaciones solo consulta", async () => {
 vi.mocked(api).mockReset(); let version=0;
 vi.mocked(api).mockImplementation((path,opts)=>{
  if(path==='/catalogs/airports?q=')return Promise.resolve([]);
  if(path==='/flights/42/route'&&opts?.method==='PUT'){version=1;return Promise.resolve({});}
  if(path==='/flights/42/route')return Promise.resolve({estado:version?'COMPLETA':'SIN_PLANIFICAR',editable:true,origen:'Origen',destino:'Destino',versiones:version?[{version:1,recorrido:'Punto Alfa',creadoPor:'comandante',fechaCreacion:'2030-01-01T12:00:00'}]:[]});
  return Promise.resolve([]);
 });
 const { FlightRoute } = await import("../flightRoute");const view=render(<FlightRoute flightId={42} canEdit msg={vi.fn()}/>);
 fireEvent.click(screen.getByText('Ruta operativa', { selector: '.planning-title' }));
 fireEvent.click(await screen.findByRole('button', { name: 'Registrar ruta' }));
 fireEvent.change(screen.getByLabelText('Recorrido y puntos intermedios en orden'),{target:{value:'Punto Alfa'}});fireEvent.click(screen.getByRole('button',{name:'Guardar ruta'}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/flights/42/route',expect.objectContaining({method:'PUT',body:expect.stringContaining('"version":0')})));
 await screen.findByText('Punto Alfa',{selector:'p'});view.unmount();render(<FlightRoute flightId={42} msg={vi.fn()}/>);
 fireEvent.click(screen.getByText("Ruta operativa", { selector: ".planning-title" }));
 await screen.findByText('Punto Alfa',{selector:'p'});expect(screen.queryByRole('button',{name:'Guardar ruta'})).toBeNull();
});


test("coordinaciones carga el catálogo al registrar y actualiza el grupo con la versión consultada", async () => {
  const { AirportCoordinations } = await import("./AirportCoordinations");
  const path = "/flights/7/airport-coordinations";
  let versions = [];
  const writes = [];
  vi.mocked(api).mockImplementation(async (url, options) => {
    if (url.startsWith("/catalogs/airports")) return [{ id: 8, nombre: "Rosario" }];
    if (options?.method) {
      const body = JSON.parse(options.body);
      writes.push({ url, method: options.method, body });
      const next = { ...body, id: body.version + 1, version: body.version + 1, gestionId: "grupo-1", aeropuerto: "Rosario", actual: true, estadoVigencia: "VIGENTE", responsable: "operador" };
      versions = [next, ...versions.map((v) => ({ ...v, actual: false }))];
      return next;
    }
    return { versiones: versions, puedeGestionar: true };
  });
  render(<AirportCoordinations flightId={7} />);
  fireEvent.click(screen.getByText("Coordinaciones aeroportuarias"));
  await screen.findByText("Todavía no se registraron coordinaciones.");
  expect(screen.queryByLabelText("Aeropuerto de coordinación")).toBeNull();
  expect(vi.mocked(api).mock.calls.some(([url]) => url.startsWith("/catalogs/airports"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Nueva coordinación" }));
  await screen.findByRole("option", { name: "Rosario" });
  fireEvent.change(screen.getByLabelText("Aeropuerto de coordinación"), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText("Finalidad de coordinación"), { target: { value: "Estacionamiento" } });
  fireEvent.change(screen.getByLabelText("Descripción de la gestión"), { target: { value: "Gestión original" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar coordinación" }));
  expect(await screen.findByText("1 gestión registrada")).toBeVisible();
  expect(writes[0]).toMatchObject({ url: path, method: "POST", body: { version: 0, estado: "PENDIENTE" } });

  fireEvent.click(screen.getByText("Rosario · Estacionamiento"));
  expect(screen.getByText("Gestión original", { selector: "dd" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Modificar coordinación" }));
  expect(screen.getByLabelText("Descripción de la gestión")).toHaveValue("Gestión original");
  expect(screen.getByLabelText("Aeropuerto de coordinación")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Descripción de la gestión"), { target: { value: "Gestión actualizada" } });
  fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Seguimiento de la misma gestión" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(writes[1]).toMatchObject({ url: path + "/grupo-1", method: "PUT", body: { version: 1 } }));
  expect(await screen.findByText("Gestión actualizada", { selector: "dd" })).toBeInTheDocument();
  expect(versions.filter((v) => v.actual)).toHaveLength(1);
});
