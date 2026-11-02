import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { api } from "../services/api";
import { useResource } from "./useResource";

vi.mock("../services/api", () => ({ api: vi.fn() }));

test("una respuesta antigua no reemplaza a la de una lectura posterior", async () => {
  let resolveOld, calls = 0;
  vi.mocked(api).mockImplementation(() => (++calls === 1 ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve([{ id: 92, matricula: "LV-NUE" }])));
  const { result } = renderHook(() => useResource("/catalogs/aircraft"));
  await act(async () => { await result.current.reload(); });
  expect(result.current.data).toEqual([{ id: 92, matricula: "LV-NUE" }]);
  await act(async () => resolveOld([{ id: 91, matricula: "LV-VIE" }]));
  expect(result.current.data).toEqual([{ id: 92, matricula: "LV-NUE" }]);
});

test("cambiar de recurso descarta la respuesta pendiente del anterior", async () => {
  const pending = {};
  vi.mocked(api).mockImplementation((path) => new Promise((resolve) => { pending[path] = resolve; }));
  const { result, rerender } = renderHook(({ path }) => useResource(path), { initialProps: { path: "/a" } });
  rerender({ path: "/b" });
  await act(async () => { pending["/b"]("B"); });
  await act(async () => { pending["/a"]("A"); });
  expect(result.current.data).toBe("B");
});

test("una falla se informa con el mensaje del servidor y una lectura silenciosa conserva lo que se ve", async () => {
  vi.mocked(api).mockResolvedValueOnce("datos").mockRejectedValueOnce(new Error("Sin conexión")).mockRejectedValueOnce(new Error("Acceso denegado"));
  const { result } = renderHook(() => useResource("/x"));
  await waitFor(() => expect(result.current.data).toBe("datos"));
  await act(async () => { await result.current.reload({ quiet: true }); });
  expect(result.current.data).toBe("datos"); expect(result.current.error).toBe("");
  await act(async () => { await result.current.reload(); });
  expect(result.current.error).toBe("Acceso denegado"); expect(result.current.data).toBeNull();
});

test("sin ruta no hay nada que leer", async () => {
  vi.mocked(api).mockReset();
  const { result } = renderHook(() => useResource(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(api).not.toHaveBeenCalled(); expect(result.current.data).toBeNull();
});
