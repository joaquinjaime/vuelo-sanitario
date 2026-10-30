import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn() }));
const provinces=[{id:"tuc",nombre:"Tucumán"},{id:"sal",nombre:"Salta"}];
const tuc=[{id:"loc-tuc",nombre:"San Miguel de Tucumán",provincia:"Tucumán"},{id:"loc-yerba",nombre:"Yerba Buena",provincia:"Tucumán"}], sal=[{id:"loc-sal",nombre:"Salta",provincia:"Salta"}];
beforeEach(() => { vi.useRealTimers(); vi.mocked(api).mockImplementation(path => path==="/catalogs/provinces"?Promise.resolve(provinces):path.includes("provinceId=tuc")?Promise.resolve(tuc):path.includes("provinceId=sal")?Promise.resolve(sal):Promise.resolve({id:"patient"})); });
const renderDts=async(patients=[])=>{const { DTS }=await import("./main.jsx");const done=vi.fn(),msg=vi.fn();render(<DTS d={{patients,priorities:[{codigo:"ALTA",nombre:"Alta"}]}} done={done} msg={msg}/>);await waitFor(()=>expect(screen.getAllByRole("option",{name:"Tucumán"})).toHaveLength(2));return {done,msg};};
const selectLocality=async(kind,province,locality)=>{fireEvent.change(screen.getByLabelText(`Provincia ${kind}`),{target:{value:province}});fireEvent.focus(screen.getByLabelText(`Buscar localidad ${kind}`));const option=await screen.findByRole("option",{name:locality});fireEvent.mouseDown(option);fireEvent.click(option);};
test("typed locality is not a valid selection and sends no request",async()=>{await renderDts();fireEvent.change(screen.getByLabelText("Provincia origen"),{target:{value:"tuc"}});fireEvent.change(screen.getByLabelText("Buscar localidad origen"),{target:{value:"san mig"}});fireEvent.submit(screen.getByRole("button",{name:"Crear solicitud"}).closest("form"));expect(screen.getByText("Seleccione una localidad válida de origen y destino.")).toBeInTheDocument();expect(vi.mocked(api).mock.calls.some(([path])=>path==="/flights")).toBe(false);});
test("locality results stay anchored to their search field",async()=>{await renderDts();fireEvent.change(screen.getByLabelText("Provincia origen"),{target:{value:"tuc"}});const input=screen.getByLabelText("Buscar localidad origen");fireEvent.focus(input);expect(input.closest(".locality-search")).toContainElement(screen.getByRole("listbox"));});
test.each(["origen","destino"])("clearing %s only resets its locality autocomplete",async kind=>{await renderDts();const province=screen.getByLabelText(`Provincia ${kind}`),input=screen.getByLabelText(`Buscar localidad ${kind}`);expect(screen.getAllByRole("option",{name:"Tucumán"})).toHaveLength(2);expect(vi.mocked(api).mock.calls.filter(([path])=>path==="/catalogs/provinces")).toHaveLength(1);fireEvent.change(province,{target:{value:"tuc"}});expect(province).toHaveValue("tuc");fireEvent.focus(input);fireEvent.click(await screen.findByRole("option",{name:"San Miguel de Tucumán, Tucumán"}));expect(screen.getByText("Seleccionada: San Miguel de Tucumán, Tucumán")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Limpiar"}));expect(province).toHaveValue("tuc");expect(screen.getAllByRole("option",{name:"Tucumán"})).toHaveLength(2);expect(vi.mocked(api).mock.calls.filter(([path])=>path==="/catalogs/provinces")).toHaveLength(1);expect(input).toHaveValue("");expect(screen.queryByRole("listbox")).not.toBeInTheDocument();expect(screen.queryByText("Seleccionada: San Miguel de Tucumán, Tucumán")).not.toBeInTheDocument();fireEvent.focus(input);fireEvent.change(input,{target:{value:"Yerba"}});const listbox=await screen.findByRole("listbox");expect(input.closest(".locality-search")).toContainElement(listbox);fireEvent.click(await screen.findByRole("option",{name:"Yerba Buena, Tucumán"}));expect(screen.getByText("Seleccionada: Yerba Buena, Tucumán")).toBeInTheDocument();});
test("selection uses IDs only and changing province clears it",async()=>{await renderDts();await selectLocality("origen","tuc","San Miguel de Tucumán, Tucumán");expect(screen.getByText(/Seleccionada: San Miguel de Tucumán, Tucumán/)).toBeInTheDocument();fireEvent.change(screen.getByLabelText("Provincia origen"),{target:{value:"sal"}});expect(screen.queryByText(/Seleccionada: San Miguel/)).toBeNull();await selectLocality("origen","sal","Salta, Salta");await selectLocality("destino","tuc","San Miguel de Tucumán, Tucumán");fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Ana"}});fireEvent.change(screen.getByLabelText("Apellido"),{target:{value:"Pérez"}});fireEvent.change(screen.getByLabelText("DNI"),{target:{value:"30.111.222"}});fireEvent.click(screen.getByLabelText(/Confirmo que cotejé/));fireEvent.change(screen.getByLabelText("Fecha y hora solicitada"),{target:{value:"2026-10-10T10:00"}});fireEvent.change(screen.getByLabelText("Diagnóstico"),{target:{value:"Control"}});fireEvent.change(screen.getByLabelText("Condición"),{target:{value:"ESTABLE"}});fireEvent.change(screen.getByLabelText("Motivo"),{target:{value:"Traslado"}});fireEvent.submit(screen.getByRole("button",{name:"Crear solicitud"}).closest("form"));await waitFor(()=>expect(vi.mocked(api)).toHaveBeenCalledWith("/flights/with-patient",expect.objectContaining({method:"POST",body:expect.stringContaining("localidadOrigenId")})));const body=JSON.parse(vi.mocked(api).mock.calls.find(([path])=>path==="/flights/with-patient")[1].body);expect(body).toMatchObject({localidadOrigenId:"loc-sal",localidadDestinoId:"loc-tuc",identidadConfirmada:true,patient:{nombre:"Ana",apellido:"Pérez",dni:"30.111.222"}});expect(vi.mocked(api).mock.calls.some(([path])=>path==="/patients")).toBe(false);expect(body).not.toHaveProperty("ciudadOrigenSolicitada");expect(body).not.toHaveProperty("ciudadDestinoSolicitada");});
test("an existing patient is selected through explicit search",async()=>{await renderDts();expect(vi.mocked(api).mock.calls.some(([path])=>path.startsWith("/patients"))).toBe(false);vi.mocked(api).mockImplementation(path=>path.startsWith("/patients/search")?Promise.resolve({items:[{id:42,nombre:"Ana",apellido:"Pérez",dniTerminacion:"••••1234"}],page:0,size:10,hasNext:false}):path==="/catalogs/provinces"?Promise.resolve(provinces):path.includes("provinceId=tuc")?Promise.resolve(tuc):path.includes("provinceId=sal")?Promise.resolve(sal):Promise.resolve({}));fireEvent.change(screen.getByLabelText("Paciente"),{target:{value:"search"}});fireEvent.change(screen.getByLabelText("DNI exacto"),{target:{value:"30111234"}});fireEvent.click(screen.getByRole("button",{name:"Buscar paciente"}));fireEvent.click(await screen.findByRole("button",{name:"Seleccionar"}));await selectLocality("origen","tuc","San Miguel de Tucumán, Tucumán");await selectLocality("destino","sal","Salta, Salta");fireEvent.submit(screen.getByRole("button",{name:"Crear solicitud"}).closest("form"));await waitFor(()=>expect(vi.mocked(api)).toHaveBeenCalledWith("/flights",expect.anything()));const body=JSON.parse(vi.mocked(api).mock.calls.find(([path])=>path==="/flights")[1].body);expect(body.patientId).toBe(42);expect(vi.mocked(api).mock.calls.some(([path])=>path==="/flights/with-patient"||path==="/patients")).toBe(false);});

test("identity declaration is required in the form when a DNI is entered",async()=>{
 const {msg}=await renderDts();
 await selectLocality("origen","tuc","San Miguel de Tucumán, Tucumán");
 await selectLocality("destino","sal","Salta, Salta");
 fireEvent.change(screen.getByLabelText("DNI"),{target:{value:"40.111.222"}});
 fireEvent.submit(screen.getByRole("button",{name:"Crear solicitud"}).closest("form"));
 expect(msg).toHaveBeenCalledWith("Confirme el cotejo de identidad para continuar.",true);
 expect(vi.mocked(api).mock.calls.some(([path])=>path==="/flights/with-patient")).toBe(false);
});

test("editing identity after attestation clears the declaration",async()=>{
 await renderDts();
 fireEvent.change(screen.getByLabelText("DNI"),{target:{value:"40.111.222"}});
 fireEvent.click(screen.getByLabelText(/Confirmo que cotejé/));
 expect(screen.getByLabelText(/Confirmo que cotejé/)).toBeChecked();
 fireEvent.change(screen.getByLabelText("Apellido"),{target:{value:"Paz"}});
 expect(screen.getByLabelText(/Confirmo que cotejé/)).not.toBeChecked();
});

test("a recoverable identity conflict preserves entered data",async()=>{
 const {msg,done}=await renderDts();
 await selectLocality("origen","tuc","San Miguel de Tucumán, Tucumán");
 await selectLocality("destino","sal","Salta, Salta");
 fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Ana"}});
 fireEvent.change(screen.getByLabelText("Apellido"),{target:{value:"Paz"}});
 fireEvent.change(screen.getByLabelText("DNI"),{target:{value:"40.111.222"}});
 fireEvent.click(screen.getByLabelText(/Confirmo que cotejé/));
 vi.mocked(api).mockImplementation(path=>path==="/flights/with-patient"?Promise.reject(new Error("No se pudo confirmar la identidad")):path==="/catalogs/provinces"?Promise.resolve(provinces):path.includes("provinceId=tuc")?Promise.resolve(tuc):path.includes("provinceId=sal")?Promise.resolve(sal):Promise.resolve({}));
 fireEvent.submit(screen.getByRole("button",{name:"Crear solicitud"}).closest("form"));
 await waitFor(()=>expect(msg).toHaveBeenCalledWith("No se pudo confirmar la identidad",true));
 expect(done).not.toHaveBeenCalled();
 expect(screen.getByLabelText("Nombre")).toHaveValue("Ana");
 expect(screen.getByLabelText("DNI")).toHaveValue("40.111.222");
 expect(screen.getByLabelText(/Confirmo que cotejé/)).toBeChecked();
});

test("two immediate submits create one request",async()=>{
 const {done}=await renderDts();
 await selectLocality("origen","tuc","San Miguel de Tucumán, Tucumán");
 await selectLocality("destino","sal","Salta, Salta");
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 vi.mocked(api).mockImplementation(path=>path==="/flights/with-patient"?pending:Promise.resolve({}));
 const form=screen.getByRole("button",{name:"Crear solicitud"}).closest("form");
 fireEvent.submit(form);
 fireEvent.submit(form);
 expect(vi.mocked(api).mock.calls.filter(([path])=>path==="/flights/with-patient")).toHaveLength(1);
 expect(screen.getByRole("button",{name:"Registrando solicitud..."})).toBeDisabled();
 release({id:1});
 await waitFor(()=>expect(done).toHaveBeenCalledTimes(1));
});
