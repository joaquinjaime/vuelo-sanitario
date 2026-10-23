import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./api";

const reply = (status, body) => Promise.resolve(new Response(body, { status, headers: { "Content-Type": "application/json" } }));
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

test("un éxito con cuerpo vacío (200 o 204) no se interpreta como error", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply(200, "")));
  await expect(api("/auth/me/password", { method: "POST", body: "{}" })).resolves.toBeNull();
  vi.stubGlobal("fetch", vi.fn(() => reply(204, null)));
  await expect(api("/auth/me/correos/1", { method: "DELETE" })).resolves.toBeNull();
});

test("devuelve el JSON, envía el token y conserva los campos del error del backend", async () => {
  localStorage.setItem("vs-token", "abc");
  const fetchMock = vi.fn(() => reply(200, JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetchMock);
  await expect(api("/x")).resolves.toEqual({ ok: true });
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer abc");
  vi.stubGlobal("fetch", vi.fn(() => reply(409, JSON.stringify({ error: "Conflicto", code: "USER_HAS_OPERATIONAL_ASSIGNMENTS", impedimentos: [{ vueloCodigo: "V-1" }] }))));
  await expect(api("/x", { method: "PATCH" })).rejects.toMatchObject({ message: "Conflicto", code: "USER_HAS_OPERATIONAL_ASSIGNMENTS", impedimentos: [{ vueloCodigo: "V-1" }] });
  vi.stubGlobal("fetch", vi.fn(() => reply(500, "no es json")));
  await expect(api("/x")).rejects.toThrow("No se pudo completar la operación");
});
