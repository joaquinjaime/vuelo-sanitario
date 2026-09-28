import { expect, test } from "vitest";
import { workspaceForRoles } from "./workspace";
test("single role enters its only workspace",()=>expect(workspaceForRoles(["COMANDANTE"])).toEqual([{id:"COMANDANTE",label:"Comandante"}]));
test("multi role exposes only enabled workspaces",()=>expect(workspaceForRoles(["ADMINISTRADOR","COMANDANTE","CENTRO_OPERACIONES"]).map(x=>x.id)).toEqual(["ADMIN","OPERACIONES","COMANDANTE"]));
