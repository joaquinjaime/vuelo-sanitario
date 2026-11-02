import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../services/api";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { ErrorState, LoadingBlock } from "../../components/ui/feedback";
import { Icon } from "../../components/ui/Icon";
import { AIRCRAFT_STATE_LABEL, AircraftActivity, AirportPicker, STATE_CLASS } from "./aircraft";

const dt = (v) => (v ? String(v).replace("T", " ").slice(0, 16) : "—");
const text = (e) => e?.message || "No se pudo completar la operación";

/** Detalle de una aeronave: datos, ubicación, vuelos e historial, con las acciones administrativas (editar, ubicación, activar/desactivar). */
export function AircraftDetailPage() {
  const { id } = useParams();
  const notify = useNotify();
  const aircraft = useResource("/catalogs/aircraft/admin", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const airports = useResource("/catalogs/airports", { map: (rows) => (Array.isArray(rows) ? rows : []) });
  const [busy, setBusy] = useState(false), [moving, setMoving] = useState(false), [target, setTarget] = useState(""), [reason, setReason] = useState(""), [moveError, setMoveError] = useState("");
  const x = (aircraft.data || []).find((item) => String(item.id) === String(id));
  const crumbs = [{ label: "Inicio", to: appPath("inicio") }, { label: "Aeronaves", to: appPath("aeronaves") }, { label: x?.matricula || `Aeronave ${id}` }];
  if (aircraft.loading) return <><PageHeader title="Aeronave" breadcrumbs={crumbs} /><LoadingBlock label="Cargando aeronave…" /></>;
  if (aircraft.error || !x) return <><PageHeader title="Aeronave" breadcrumbs={crumbs} /><ErrorState message={aircraft.error || "La aeronave no existe."} onRetry={aircraft.reload} /></>;

  const toggleActive = async () => {
    if (busy) return;
    const question = x.activo ? `¿Desactivar la aeronave ${x.matricula}? Conserva su historial pero dejará de poder asignarse.` : `¿Reactivar la aeronave ${x.matricula}?`;
    if (window.confirm?.(question) === false) return;
    setBusy(true);
    try { await api(`/catalogs/aircraft/${x.id}/active`, { method: "POST", body: JSON.stringify({ activo: !x.activo }) }); await aircraft.reload(); notify(x.activo ? `Aeronave ${x.matricula} desactivada` : `Aeronave ${x.matricula} reactivada`); }
    catch (e) { notify(text(e), true); } finally { setBusy(false); }
  };
  const openMove = () => { setMoving(true); setTarget(""); setReason(""); setMoveError(""); };
  const move = async (e) => {
    e.preventDefault(); if (busy || !target) return;
    setBusy(true); setMoveError("");
    try { await api(`/catalogs/aircraft/${x.id}/location`, { method: "POST", body: JSON.stringify({ locationId: Number(target), motivo: reason.trim() || null }) }); setMoving(false); await aircraft.reload(); notify(`Ubicación de ${x.matricula} actualizada`); }
    catch (err) { setMoveError(text(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title={`Aeronave ${x.matricula}`} breadcrumbs={crumbs} description={`${x.modelo} · ${x.tipo}`}
        titleExtra={<span className={STATE_CLASS[x.estadoOperativo] || "status"}>{AIRCRAFT_STATE_LABEL[x.estadoOperativo] || (x.activo ? "Activa" : "Inactiva")}</span>}
        actions={<>
          <Link className="button-link" to={appPath(`aeronaves/${x.id}/editar`)}><Icon name="edit" size={16} />Editar</Link>
          <button type="button" className="secondary-action" disabled={busy} onClick={openMove}>Cambiar ubicación</button>
          <button type="button" className="secondary-action" disabled={busy} onClick={toggleActive}>{x.activo ? "Desactivar" : "Reactivar"}</button>
        </>} />
      <Card title="Datos de la aeronave">
        <dl className="facts">
          <div><dt>Capacidad de pacientes</dt><dd>{x.capacidadPacientes}</dd></div>
          <div><dt>Capacidad de tripulación</dt><dd>{x.capacidadTripulacion}</dd></div>
          <div><dt>Ubicación actual</dt><dd>{x.aeropuertoActual || "Sin ubicación"}</dd></div>
          <div><dt>Próximo vuelo</dt><dd>{x.proximoVuelo ? `${x.proximoVuelo.codigo} · ${dt(x.proximoVuelo.salida)}` : "—"}</dd></div>
          {x.equipamientoMedico && <div className="wide"><dt>Equipamiento médico</dt><dd>{x.equipamientoMedico}</dd></div>}
          <div><dt>Alta</dt><dd>{dt(x.fechaCreacion)}</dd></div>
        </dl>
      </Card>
      <Card><AircraftActivity aircraft={x} /></Card>
      {moving && (
        <Modal title={`Ubicación de ${x.matricula}`} eyebrow="ADMINISTRACIÓN" onClose={() => setMoving(false)} dismissible={!busy}>
          <form className="form-stack" onSubmit={move}>
            <p>Ubicación actual: <strong>{x.aeropuertoActual || "Sin ubicación"}</strong>. Es un cambio administrativo: se audita y no se permite con la aeronave en vuelo ni si contradice vuelos ya asignados.</p>
            <AirportPicker label="Nueva ubicación" value={target} exclude={x.aeropuertoActualId} initial={airports.data || []} onChange={setTarget} />
            <label>Motivo (opcional)<textarea maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            {moveError && <p className="error" role="alert">{moveError}</p>}
            <div className="form-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => setMoving(false)}>Cancelar</button><button disabled={busy || !target}>{busy ? "Guardando…" : "Confirmar cambio de ubicación"}</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
