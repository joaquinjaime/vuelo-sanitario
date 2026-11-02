import { expect, test } from "vitest";
import { workspaceForRoles } from "./workspace";
test("single role enters its only workspace",()=>expect(workspaceForRoles(["COMANDANTE"])).toEqual([{id:"COMANDANTE",label:"Comandante"}]));
test("multi role exposes only enabled workspaces",()=>expect(workspaceForRoles(["ADMINISTRADOR","COMANDANTE","CENTRO_OPERACIONES"]).map(x=>x.id)).toEqual(["ADMIN","OPERACIONES","COMANDANTE"]));
test("operations, DTS and their permitted combinations expose no extra workspace",()=>{
 expect(workspaceForRoles(["CENTRO_OPERACIONES"]).map(x=>x.id)).toEqual(["OPERACIONES"]);
 expect(workspaceForRoles(["COMANDANTE","CENTRO_OPERACIONES"]).map(x=>x.id)).toEqual(["OPERACIONES","COMANDANTE"]);
 expect(workspaceForRoles(["DTS","CENTRO_OPERACIONES"]).map(x=>x.id)).toEqual(["DTS","OPERACIONES"]);
 expect(workspaceForRoles(["ADMINISTRADOR","CENTRO_OPERACIONES"]).map(x=>x.id)).toEqual(["ADMIN","OPERACIONES"]);
});
