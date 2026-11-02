package com.vuelossanitarios.backend.api.dto;
import java.util.List;

/** Aeropuertos candidatos de salida o llegada de un traslado sanitario (selección asistida; no inventa tiempos de traslado). */
public final class AirportPlanningDtos {
 private AirportPlanningDtos(){}
 /**
  * distanciaRectaKm: línea recta entre el centroide de la localidad del paciente y el aeropuerto (null si no hay coordenadas); no equivale a distancia ni a tiempo de traslado terrestre.
  * mismaProvinciaQueElPaciente: el aeropuerto está en la misma jurisdicción (provincia o CABA) que la localidad del paciente. aeronaveAsignadaAqui: la aeronave del vuelo está en este aeropuerto.
  * comandanteEnJurisdiccion: sólo para el aeropuerto de salida y con comandante asignado: si está en la jurisdicción de este aeropuerto (null si no aplica).
  */
 public record AirportCandidate(Long id,String nombre,String codigoOaci,String codigoIata,String tipo,String ciudad,Long provinciaId,String provincia,Double distanciaRectaKm,
   boolean mismaProvinciaQueElPaciente,boolean aeronaveAsignadaAqui,Boolean comandanteEnJurisdiccion,boolean seleccionActual,String estadoSeleccion){}
 /** tipo: SALIDA o LLEGADA. Las mismas localidades del paciente (origen/destino de la solicitud) no se modifican por elegir aeropuertos. */
 public record AirportCandidates(String tipo,FlightDtos.LocalityView localidadPaciente,boolean coordenadasPaciente,List<AirportCandidate> enProvinciaDelPaciente,List<AirportCandidate> enOtrasJurisdicciones,
   boolean otrasJurisdiccionesIncompletas,String aviso,String mensaje){}
}
