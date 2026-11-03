import React from "react";
import { Link } from "react-router-dom";
import { appPath } from "../../../app/navigation";
import { Alert } from "../../../components/ui/feedback";
import { Card } from "../../../components/ui/Card";
import { dt, locationLabel } from "../../../utils/format";
import { RequestSummary } from "../negotiation";
import { Urgency } from "../components/Urgency";
import { CancellationNote } from "../components/CancellationNote";
import { CommanderAssignment } from "../components/CommanderAssignment";
import { nextStep } from "../detail/nextStep";

/** Guía «qué sigue»: sólo informa y lleva a la pestaña donde se resuelve; no ejecuta ni habilita nada. */
export function NextStepCard({ ctx, basePath }) {
  const step = nextStep({ workspace: ctx.workspace, flight: ctx.flight });
  if (!step) return null;
  const tab = ctx.tabs.find((x) => x.key === step.tab);
  const target = step.link ? appPath(step.link) : step.tab && !step.inline && tab && !tab.locked ? (tab.key === ctx.defaultKey ? basePath : `${basePath}/${tab.key}`) : null;
  const tone = step.tone === "action" ? "warning" : step.tone === "done" ? "success" : "info";
  return (
    <Alert tone={tone} title={step.title} action={target && step.cta ? <Link className="button-link" to={target} replace>{step.cta}</Link> : null}>
      {step.text}
    </Alert>
  );
}

function Facts({ flight, detail }) {
  const sanitary = Boolean(flight.datosSanitarios), res = detail.recursos;
  const model = [res?.aircraftModelo, res?.aircraftTipo].filter(Boolean).join(" · ");
  return (
    <dl className="facts">
      {!sanitary && <div><dt>Tipo de vuelo</dt><dd>{flight.tipo?.nombre || flight.tipo?.codigo || "Operativo"}</dd></div>}
      {!sanitary && <div><dt>Trayecto</dt><dd>{locationLabel(flight.origen)} → {locationLabel(flight.destino)}</dd></div>}
      {!sanitary && flight.motivoVuelo && <div className="wide"><dt>Motivo</dt><dd>{flight.motivoVuelo}</dd></div>}
      <div><dt>Horario definitivo</dt><dd>{flight.salida ? dt(flight.salida) : sanitary ? "Pendiente de acuerdo" : "Aún en negociación"}</dd></div>
      {flight.llegada && <div><dt>Llegada prevista</dt><dd>{dt(flight.llegada)}</dd></div>}
      <div><dt>Aeronave</dt><dd>{res?.aircraftMatricula ? <>{res.aircraftMatricula}{model ? <small> {model}</small> : null}</> : "Sin asignar"}</dd></div>
      {res?.aircraftUbicacion && <div><dt>Ubicación de la aeronave</dt><dd>{res.aircraftUbicacion}</dd></div>}
    </dl>
  );
}

export function SummaryTab({ ctx, basePath }) {
  const { flight, detail, workspace } = ctx;
  const sanitary = Boolean(flight.datosSanitarios);
  return (
    <div className="tab-stack">
      <NextStepCard ctx={ctx} basePath={basePath} />
      <CancellationNote flight={flight} />
      {workspace === "COMANDANTE" && !ctx.commanderBlocked && <CommanderAssignment flight={flight} done={ctx.done} msg={ctx.notify} reload={ctx.reload} />}
      {sanitary ? <RequestSummary flight={flight} medical={detail.medical} /> : <Card title="Vuelo operativo"><Urgency flight={flight} detail /></Card>}
      <Card title="Situación del vuelo"><Facts flight={flight} detail={detail} /></Card>
    </div>
  );
}
