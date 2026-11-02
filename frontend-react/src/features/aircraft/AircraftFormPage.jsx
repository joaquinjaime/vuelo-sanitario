import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../services/api";
import { useNotify } from "../../app/providers/NotifyProvider";
import { appPath } from "../../app/navigation";
import { useResource } from "../../hooks/useResource";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card, Field } from "../../components/ui/Card";
import { ErrorState, LoadingBlock } from "../../components/ui/feedback";
import { AirportPicker, emptyForm } from "./aircraft";

const text = (e) => e?.message || "No se pudo completar la operación";
const list = (rows) => (Array.isArray(rows) ? rows : []);
const formOf = (x) => ({ matricula: x.matricula, modelo: x.modelo, tipo: x.tipo, capacidadPacientes: x.capacidadPacientes, capacidadTripulacion: x.capacidadTripulacion, equipamientoMedico: x.equipamientoMedico || "", aeropuertoActualId: x.aeropuertoActualId || "", activo: x.activo });

/** Formulario de alta/edición. Nace con los datos de la aeronave (si se edita), sin pasar por un estado vacío intermedio. */
function AircraftForm({ editing, airports }) {
  const notify = useNotify();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => (editing ? formOf(editing) : emptyForm())), [formError, setFormError] = useState(""), [busy, setBusy] = useState(false);
  const back = editing ? appPath(`aeronaves/${editing.id}`) : appPath("aeronaves");
  const title = editing ? `Editar aeronave ${editing.matricula}` : "Nueva aeronave";

  const save = async (e) => {
    e.preventDefault(); if (busy) return;
    if (Number(form.capacidadPacientes) < 1 || Number(form.capacidadTripulacion) < 1) { setFormError("Las capacidades deben ser de al menos 1."); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(form.matricula.trim())) { setFormError("La matrícula sólo admite letras, números y guiones."); return; }
    setBusy(true); setFormError("");
    try {
      const common = { matricula: form.matricula.trim(), modelo: form.modelo.trim(), tipo: form.tipo.trim(), capacidadPacientes: Number(form.capacidadPacientes), capacidadTripulacion: Number(form.capacidadTripulacion), equipamientoMedico: form.equipamientoMedico };
      if (editing) await api(`/catalogs/aircraft/${editing.id}`, { method: "PUT", body: JSON.stringify(common) });
      else await api("/catalogs/aircraft", { method: "POST", body: JSON.stringify({ ...common, aeropuertoActualId: Number(form.aeropuertoActualId), activo: form.activo }) });
      notify(editing ? "Aeronave actualizada" : "Aeronave registrada");
      navigate(back);
    } catch (x) { setFormError(text(x)); } finally { setBusy(false); }
  };

  return (
    <form className="form-page" onSubmit={save} aria-label={title}>
      <Card title="Datos de la aeronave">
        <div className="form-grid">
          <Field label="Matrícula" required><input required maxLength="20" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} /></Field>
          <Field label="Modelo" required><input required maxLength="100" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></Field>
          <Field label="Tipo" required><input required maxLength="50" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></Field>
          <Field label="Capacidad de pacientes" required><input required min="1" max="200" type="number" value={form.capacidadPacientes} onChange={(e) => setForm({ ...form, capacidadPacientes: e.target.value })} /></Field>
          <Field label="Capacidad de tripulación" required><input required min="1" max="200" type="number" value={form.capacidadTripulacion} onChange={(e) => setForm({ ...form, capacidadTripulacion: e.target.value })} /></Field>
          <Field label="Equipamiento médico" className="span-2"><textarea value={form.equipamientoMedico} onChange={(e) => setForm({ ...form, equipamientoMedico: e.target.value })} /></Field>
        </div>
      </Card>
      <Card title="Ubicación y estado">
        {editing
          ? <p className="hint">Ubicación actual: {editing.aeropuertoActual || "Sin ubicación"}. La ubicación y el estado activo se modifican con sus propias acciones, desde el detalle de la aeronave.</p>
          : <div className="form-grid">
            <div className="span-2 aircraft-airport"><AirportPicker label="Ubicación inicial" value={form.aeropuertoActualId} initial={airports} onChange={(value) => setForm({ ...form, aeropuertoActualId: value })} /></div>
            <label className="check"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activa desde el alta</label>
          </div>}
      </Card>
      {formError && <p className="error" role="alert">{formError}</p>}
      <div className="form-actions sticky-actions">
        <button type="button" className="secondary-action" disabled={busy} onClick={() => navigate(back)}>Cancelar</button>
        <button disabled={busy || (!editing && !form.aeropuertoActualId)}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Registrar aeronave"}</button>
      </div>
    </form>
  );
}

/**
 * Alta (`/aeronaves/nueva`) y edición (`/aeronaves/:id/editar`) de una aeronave. La ubicación y el estado activo se modifican
 * con sus propias acciones en el detalle (auditadas); aquí sólo se editan los datos de la aeronave.
 */
export function AircraftFormPage() {
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const aircraft = useResource(editingId ? "/catalogs/aircraft/admin" : null, { map: list });
  const airports = useResource("/catalogs/airports", { map: list });
  const editing = editingId ? list(aircraft.data).find((x) => x.id === editingId) : null;
  const crumbs = [{ label: "Inicio", to: appPath("inicio") }, { label: "Aeronaves", to: appPath("aeronaves") }, ...(editing ? [{ label: editing.matricula, to: appPath(`aeronaves/${editing.id}`) }] : []), { label: editingId ? "Editar" : "Nueva aeronave" }];
  if (editingId && aircraft.loading) return <><PageHeader title="Editar aeronave" breadcrumbs={crumbs} /><LoadingBlock /></>;
  if (editingId && (aircraft.error || !editing)) return <><PageHeader title="Editar aeronave" breadcrumbs={crumbs} /><ErrorState message={aircraft.error || "La aeronave no existe."} onRetry={aircraft.reload} /></>;
  return (
    <>
      <PageHeader title={editing ? `Editar aeronave ${editing.matricula}` : "Nueva aeronave"} description={editing ? "Modifique los datos de la aeronave." : "Registre una aeronave del catálogo: capacidad, equipamiento y ubicación inicial."} breadcrumbs={crumbs} />
      <AircraftForm key={editing?.id || "new"} editing={editing} airports={airports.data || []} />
    </>
  );
}
