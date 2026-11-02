package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import org.springframework.http.HttpStatus;

import java.util.Map;

/**
 * Las gestiones de preparación y seguimiento de un vuelo sanitario (hangar, coordinaciones aeroportuarias, bitácora manual)
 * pertenecen a etapas posteriores a la negociación: no pueden registrarse mientras el horario de salida no esté acordado
 * (solicitud `SOLICITADO` o `PENDIENTE_RESPUESTA_DTS`). Comparte con la regla documental la definición única de «acuerdo»
 * ({@link DocumentScheduleGate}). La creación, las propuestas, las aceptaciones y los rechazos de la negociación, su auditoría y
 * el historial automático no pasan por aquí: siguen registrándose siempre. Los vuelos no sanitarios no están sujetos a la regla.
 */
public final class PreparationStageGate {
 public static final String CODE="SCHEDULE_NOT_AGREED";
 private PreparationStageGate(){}

 /** Verdadero mientras la negociación del horario de un vuelo sanitario sigue abierta. */
 public static boolean pending(Flight flight){ return !DocumentScheduleGate.of(flight).available(); }

 /** Rechaza con 409 (estado del vuelo, no falta de permisos) la operación de una etapa posterior a la negociación. */
 public static void require(Flight flight,String operation){
  DocumentScheduleGate.Access access=DocumentScheduleGate.of(flight);
  if(access.available())return;
  throw new ApiException(HttpStatus.CONFLICT,CODE,"No se puede "+operation+" hasta que el horario de salida esté acordado: la solicitud todavía está en negociación.",
    Map.of("estadoSolicitud",access.requestState(),"pendientePor",access.pendingParty()));
 }
}
