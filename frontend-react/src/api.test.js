import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, downloadFile, uploadFile } from "./api";

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
  await expect(api("/x")).rejects.toMatchObject({ message: "No se pudo completar la operación (HTTP 500).", status: 500 });
});

test("una respuesta de sesión vencida sin JSON sigue siendo accionable", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply(401, "")));
  await expect(api("/auth/users")).rejects.toMatchObject({ message: "La sesión venció. Volvé a ingresar.", status: 401 });
});

test("una carga o descarga rechazada por el horario sin acordar conserva el código, el estado y los datos del servidor", async () => {
  const locked = { error: "Documentación no disponible", code: "DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED", estadoSolicitud: "SOLICITADO", pendientePor: "OPERACIONES" };
  vi.stubGlobal("fetch", vi.fn(() => reply(409, JSON.stringify(locked))));
  await expect(uploadFile("/flights/1/documents/pdf", new File(["%PDF"], "a.pdf"))).rejects.toMatchObject({ message: "Documentación no disponible", status: 409, code: locked.code, pendientePor: "OPERACIONES" });
  await expect(downloadFile("/document-versions/9/download")).rejects.toMatchObject({ status: 409, code: locked.code });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<html>", { status: 502 }))));
  await expect(uploadFile("/flights/1/documents/pdf", new File(["%PDF"], "a.pdf"))).rejects.toThrow("No se pudo procesar el documento");
});
