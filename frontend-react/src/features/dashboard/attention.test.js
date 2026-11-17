import { expect, test } from "vitest";
import { attentionFor } from "./attention";

test("a flight where the user is only the copilot never asks for the commander's action", () => {
  const flights = [
    { id: 1, estado: "PENDIENTE_CONFIRMACION_COMANDANTE", miFuncion: "COMANDANTE" },
    { id: 2, estado: "PENDIENTE_CONFIRMACION_COMANDANTE", miFuncion: "COPILOTO" },
    { id: 3, estado: "PLANIFICADO", miFuncion: "COPILOTO" },
    { id: 4, estado: "PLANIFICADO", miFuncion: "COMANDANTE" },
  ];
  expect(attentionFor("COMANDANTE", flights).map((flight) => flight.id)).toEqual([1, 4]);
});
