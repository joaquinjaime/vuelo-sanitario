import React, { useState } from "react";
import { Modal } from "../../../components/ui/Modal";
import { CancellationFields } from "../negotiation";

/**
 * Cancelación de un vuelo o solicitud: exige el motivo (del catálogo, o texto propio si elige «Otro»).
 * `onConfirm({ motivoCancelacionId, motivoCancelacionPersonalizado })` ejecuta la operación; el servidor valida el estado.
 */
export function CancelFlightDialog({ title, description, confirmLabel, reasons, busy, onConfirm, onClose }) {
  const [reasonId, setReasonId] = useState(""), [custom, setCustom] = useState("");
  const other = reasons.find((x) => String(x.id) === String(reasonId))?.codigo === "OTRO";
  const invalid = !reasonId || (other && !custom.trim());
  return (
    <Modal title={title} eyebrow="CANCELACIÓN" onClose={onClose} dismissible={!busy}
      footer={<>
        <button type="button" className="secondary-action" disabled={busy} onClick={onClose}>Volver</button>
        <button type="button" className="danger-action" disabled={busy || invalid} onClick={() => onConfirm({ motivoCancelacionId: reasonId, motivoCancelacionPersonalizado: custom || null })}>{busy ? "Cancelando…" : confirmLabel}</button>
      </>}>
      <p>{description}</p>
      <div className="form-stack"><CancellationFields reasons={reasons} value={reasonId} setValue={setReasonId} custom={custom} setCustom={setCustom} /></div>
    </Modal>
  );
}
