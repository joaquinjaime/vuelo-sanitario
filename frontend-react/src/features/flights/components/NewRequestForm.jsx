import React, { useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";
import { isTodayOrTomorrow } from "../../../utils/format";
import { PatientSearch } from "../../patients/patients";
import { TransferContactFields, contactsPayload, rowsProblem } from "../transferContacts";
import { LocalityPicker } from "./LocalityPicker";

export function NewRequestForm({ d, done, msg }) {
  const submitLock = useRef(false);
  const [patientMode, setPatientMode] = useState("new"), [selectedPatient, setSelectedPatient] = useState(null), [contactRows, setContactRows] = useState([]),
    [submitting, setSubmitting] = useState(false),
    [provinces, setProvinces] = useState([]), [originProvince, setOriginProvince] = useState(""), [destinationProvince, setDestinationProvince] = useState(""), [origin, setOrigin] = useState(null), [destination, setDestination] = useState(null), [locationError, setLocationError] = useState(""),
    [f, setF] = useState({
      nombre: "",
      apellido: "",
      dni: "",
      fechaNacimiento: "",
      identidadConfirmada: false,
      prioridad: "ALTA",
      motivo: "",
      diagnostico: "",
      condicion: "ESTABLE",
      solicitada: "",
      urgente: false,
      justificacion: "",
      limite: "",
    });
  let change = (k, v) => setF((current) => ({
    ...current,
    [k]: v,
    ...(["nombre", "apellido", "dni", "fechaNacimiento"].includes(k) ? { identidadConfirmada: false } : {}),
  }));
  let todayOrTomorrow = isTodayOrTomorrow(f.solicitada);
  useEffect(() => { api("/catalogs/provinces").then(setProvinces).catch(x => msg(x.message, true)); }, []);
  return (
    <section className="form-page">
      <p className="hint">
        Los vuelos normales sólo pueden solicitarse para pasado mañana o una
        fecha posterior. La validación final se realiza con la zona de negocio.
      </p>
      {todayOrTomorrow && !f.urgente && (
        <p className="error">
          Los vuelos para hoy o mañana deben solicitarse como vuelos de extrema
          urgencia.
        </p>
      )}
      <form
        className="grid-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitLock.current) return;
          if (!origin || !destination) { setLocationError("Seleccione una localidad válida de origen y destino."); return; }
          if (patientMode === "search" && !selectedPatient) { msg("Busque y seleccione un paciente registrado.", true); return; }
          if (patientMode === "new" && f.dni && !f.identidadConfirmada) { msg("Confirme el cotejo de identidad para continuar.", true); return; }
          const contactProblem = rowsProblem(contactRows);
          if (contactProblem) { msg(contactProblem, true); return; }
          submitLock.current = true;
          setSubmitting(true);
          try {
            await api(patientMode === "search" ? "/flights" : "/flights/with-patient", {
              method: "POST",
              body: JSON.stringify({
                ...(patientMode === "search" ? { patientId: selectedPatient.id } : { patient: { nombre: f.nombre, apellido: f.apellido, dni: f.dni || null, fechaNacimiento: f.fechaNacimiento || null }, identidadConfirmada: f.identidadConfirmada }),
                contactos: contactsPayload(contactRows),
                localidadOrigenId: origin.id,
                localidadDestinoId: destination.id,
                priorityCode: f.prioridad,
                motivoVuelo: f.motivo,
                fechaSolicitada: f.solicitada,
                extremaUrgencia: f.urgente,
                justificacionExtremaUrgencia: f.urgente
                  ? f.justificacion
                  : null,
                fechaLimiteTraslado: f.urgente ? f.limite : null,
                medical: {
                  diagnostico: f.diagnostico,
                  condicionMedica: f.condicion,
                  requiereEquipamientoEspecial: false,
                  observaciones: null,
                },
              }),
            });
            msg("Solicitud registrada");
            setContactRows([]);
            done();
          } catch (x) {
            msg(x.message, true);
          } finally {
            submitLock.current = false;
            setSubmitting(false);
          }
        }}
      >
        <fieldset className="form-section wide"><legend>Datos del paciente</legend><div className="grid-form">
        <label>
          Paciente
          <select value={patientMode} onChange={(e) => { setPatientMode(e.target.value); setSelectedPatient(null); }}>
            <option value="new">Registrar paciente</option>
            <option value="search">Buscar paciente registrado</option>
          </select>
        </label>
        {patientMode === "search" && <><PatientSearch onSelect={setSelectedPatient} onReset={() => setSelectedPatient(null)} selectedId={selectedPatient?.id} />{selectedPatient && <p className="wide success">Paciente seleccionado: {selectedPatient.nombre} {selectedPatient.apellido} · DNI {selectedPatient.dniTerminacion || "sin registrar"}</p>}</>}
        {patientMode === "new" && (
          <>
            <label>
              Nombre
              <input
                required
                value={f.nombre}
                onChange={(e) => change("nombre", e.target.value)}
              />
            </label>
            <label>
              Apellido
              <input
                required
                value={f.apellido}
                onChange={(e) => change("apellido", e.target.value)}
              />
            </label>
            <label>
              DNI
              <input value={f.dni} inputMode="numeric" maxLength={20} onChange={(e) => change("dni", e.target.value)} />
            </label>
            <label>
              Fecha de nacimiento
              <input type="date" value={f.fechaNacimiento} onChange={(e) => change("fechaNacimiento", e.target.value)} />
            </label>
            {f.dni && <label className="check wide">
              <input type="checkbox" required checked={f.identidadConfirmada} onChange={(e) => change("identidadConfirmada", e.target.checked)} />{" "}
              Confirmo que cotejé los datos ingresados con el documento de identidad presentado
            </label>}
          </>
        )}
        </div></fieldset>
        <fieldset className="form-section wide"><legend>Traslado</legend><div className="grid-form">
        <LocalityPicker title="Origen" provinces={provinces} provinceId={originProvince} setProvinceId={setOriginProvince} selected={origin} setSelected={setOrigin} />
        <LocalityPicker title="Destino" provinces={provinces} provinceId={destinationProvince} setProvinceId={setDestinationProvince} selected={destination} setSelected={setDestination} />
        {locationError && <p className="error wide">{locationError}</p>}
        </div></fieldset>
        <fieldset className="form-section wide"><legend>Horario y urgencia</legend><div className="grid-form">
        <label>
          Fecha y hora solicitada
          <input
            type="datetime-local"
            required
            value={f.solicitada}
            onChange={(e) => change("solicitada", e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={f.urgente}
            onChange={(e) => change("urgente", e.target.checked)}
          />{" "}
          Extrema urgencia
        </label>
        {f.urgente && (
          <>
            <label className="wide">
              Justificación de extrema urgencia
              <textarea
                required
                value={f.justificacion}
                onChange={(e) => change("justificacion", e.target.value)}
              />
            </label>
            <label>
              Fecha y hora límite para el traslado
              <input
                type="datetime-local"
                required
                value={f.limite}
                onChange={(e) => change("limite", e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Prioridad operativa
          <select
            value={f.prioridad}
            onChange={(e) => change("prioridad", e.target.value)}
          >
            {d.priorities.map((x) => (
              <option key={x.codigo} value={x.codigo}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        </div></fieldset>
        <fieldset className="form-section wide"><legend>Datos clínicos y motivo</legend><div className="grid-form">
        <label>
          Diagnóstico
          <input
            required
            value={f.diagnostico}
            onChange={(e) => change("diagnostico", e.target.value)}
          />
        </label>
        <label>
          Condición
          <input
            required
            value={f.condicion}
            onChange={(e) => change("condicion", e.target.value)}
          />
        </label>
        <label className="wide">
          Motivo
          <textarea
            required
            value={f.motivo}
            onChange={(e) => change("motivo", e.target.value)}
          />
        </label>
        </div></fieldset>
        <TransferContactFields rows={contactRows} setRows={setContactRows} />
        <div className="form-actions wide"><button disabled={submitting}>{submitting ? "Registrando solicitud..." : "Crear solicitud"}</button></div>
      </form>
    </section>
  );
}
