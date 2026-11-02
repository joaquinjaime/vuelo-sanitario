package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import org.springframework.http.HttpStatus;

import java.util.Map;
import java.util.Set;

/**
 * Regla única de habilitación documental: un vuelo sanitario sólo admite operaciones sobre sus documentos mientras exista un
 * acuerdo vigente sobre el horario de salida. El acuerdo es el estado APROBADO de la solicitud sanitaria, que el servidor sólo
 * fija cuando ambas partes coinciden (Operaciones acepta el horario solicitado por el DTS, o el DTS acepta la contrapropuesta de
 * Operaciones); una fecha planificada, una propuesta pendiente o la aprobación de la ruta del comandante no son un acuerdo.
 * El estado se evalúa en cada operación, sin copiarlo: si la negociación se reabre, la documentación vuelve a bloquearse sola y
 * ningún documento ni versión se altera. Los vuelos no sanitarios no están sujetos a esta regla.
 */
public final class DocumentScheduleGate {
 public static final String LOCKED_CODE="DOCUMENTS_LOCKED_SCHEDULE_NOT_AGREED";
 public static final String MESSAGE="Documentación no disponible: para comenzar a gestionar los documentos de este vuelo, primero debe acordarse el horario de salida.";
 /** Acuerdo vigente sobre el horario: es el único estado que habilita la gestión documental de un vuelo sanitario. */
 public static final String AGREED="APROBADO";
 /** Solicitudes cerradas sin vuelo en curso: sus documentos previos se conservan para consulta (las escrituras las rechaza la regla de sólo consulta). */
 private static final Set<String> CLOSED=Set.of("RECHAZADO","CANCELADO");
 private DocumentScheduleGate(){}

 /** Disponibilidad documental de un vuelo; {@code pendingParty} indica a quién corresponde el siguiente paso de la negociación. */
 public record Access(boolean available,String code,String message,String requestState,String pendingParty){}

 public static Access of(Flight flight){
  if(flight==null||flight.getSanitario()==null)return new Access(true,null,null,null,null);
  String state=flight.getSanitario().getEstadoSolicitud()==null?"":flight.getSanitario().getEstadoSolicitud().getCodigo();
  if(AGREED.equals(state)||CLOSED.contains(state))return new Access(true,null,null,state,null);
  // Cerrado ante cualquier otro estado: sólo el acuerdo (o el historial de una solicitud cerrada) abre la documentación.
  String pending="PENDIENTE_RESPUESTA_DTS".equals(state)?"DTS":"OPERACIONES";
  return new Access(false,LOCKED_CODE,MESSAGE,state,pending);
 }

 /** Rechaza con 409 (estado del vuelo, no falta de permisos) cuando todavía no hay horario acordado. */
 public static void require(Flight flight){
  Access access=of(flight);
  if(!access.available())throw new ApiException(HttpStatus.CONFLICT,access.code(),access.message(),Map.of("estadoSolicitud",access.requestState(),"pendientePor",access.pendingParty()));
 }
}
