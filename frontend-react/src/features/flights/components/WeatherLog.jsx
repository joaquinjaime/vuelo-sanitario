import React, { useState } from "react";
import { api } from "../../../services/api";
import { WeatherHistory } from "./WeatherHistory";

const EMPTY = { condiciones: "", favorable: true, observaciones: "" };

/**
 * Condiciones meteorológicas del vuelo. El comandante las registra mientras el vuelo está planificado (`canRecord`);
 * el historial se muestra siempre y se actualiza al registrar una nueva.
 */
export function WeatherLog({ flightId, canRecord = false, msg = () => {} }) {
  const [weather, setWeather] = useState(EMPTY), [revision, setRevision] = useState(0);
  const save = async () => {
    try {
      await api(`/flights/${flightId}/weather`, { method: "POST", body: JSON.stringify(weather) });
      msg("Condiciones meteorológicas registradas"); setWeather(EMPTY); setRevision((x) => x + 1);
    } catch (e) { msg(e.message, true); }
  };
  return (
    <>
      {canRecord && (
        <fieldset className="wide">
          <legend>Condiciones meteorológicas</legend>
          <label>Condiciones<textarea required value={weather.condiciones} onChange={(e) => setWeather({ ...weather, condiciones: e.target.value })} /></label>
          <label>¿Condiciones favorables?<select value={String(weather.favorable)} onChange={(e) => setWeather({ ...weather, favorable: e.target.value === "true" })}><option value="true">Sí</option><option value="false">No</option></select></label>
          <label>Observaciones<textarea value={weather.observaciones} onChange={(e) => setWeather({ ...weather, observaciones: e.target.value })} /></label>
          <button type="button" disabled={!weather.condiciones.trim()} onClick={save}>Registrar clima</button>
        </fieldset>
      )}
      <WeatherHistory flightId={flightId} revision={revision} />
    </>
  );
}
