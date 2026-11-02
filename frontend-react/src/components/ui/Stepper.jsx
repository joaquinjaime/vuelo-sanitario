import React from "react";
import { STAGE } from "../../features/flights/flightStages";

// Etapas del proceso tal como las deriva flightStages (el estado real del servidor), de la solicitud al cierre.
const STEPS = [
  { key: "NEGOCIACION", label: "Negociación del horario" },
  { key: "ACORDADO", label: "Horario acordado" },
  { key: "PREPARACION", label: "Preparación" },
  { key: "EJECUCION", label: "Vuelo" },
  { key: "CIERRE", label: "Cierre" },
];
const ORDER = STEPS.map((step) => step.key);

/** Indicador de avance del proceso. Informa en qué etapa está; no ejecuta ni habilita nada. */
export function ProcessStepper({ stage }) {
  if (!stage || stage.key === STAGE.OPERATIVO) return null;
  const closed = stage.key === STAGE.CERRADA;
  const current = closed ? -1 : ORDER.indexOf(stage.key);
  return (
    <ol className="stepper" aria-label="Etapas del proceso">
      {STEPS.map((step, index) => {
        const state = closed ? "idle" : index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li key={step.key} className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">{state === "done" ? "✓" : index + 1}</span>
            <span className="step-label">{step.label}<span className="visually-hidden">{state === "done" ? " (completada)" : state === "current" ? " (etapa actual)" : " (pendiente)"}</span></span>
          </li>
        );
      })}
    </ol>
  );
}
