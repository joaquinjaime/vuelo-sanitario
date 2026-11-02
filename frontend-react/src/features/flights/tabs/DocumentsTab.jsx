import React from "react";
import { FlightDocuments, documentsEditable } from "../documents";

/** Documentación del vuelo. El DTS sólo consulta; Operaciones y el comandante cargan mientras el estado lo permita (el servidor valida el acuerdo de horario). */
export function DocumentsTab({ ctx }) {
  const dts = ctx.workspace === "DTS";
  return <FlightDocuments key={`documents-${ctx.id}`} flightId={ctx.id} canEdit={!dts && documentsEditable(ctx.flight.estado)} canViewRetired={!dts} msg={ctx.notify} />;
}
