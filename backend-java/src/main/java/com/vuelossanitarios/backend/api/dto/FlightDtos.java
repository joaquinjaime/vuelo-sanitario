package com.vuelossanitarios.backend.api.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import com.vuelossanitarios.backend.api.dto.FinalReportDtos;
import com.vuelossanitarios.backend.api.dto.PatientDtos.CreatePatient;
import jakarta.validation.Valid;

public final class FlightDtos { private FlightDtos(){}
 public record Medical(@Size(max=10000) String diagnostico,@Size(max=100) String condicionMedica,boolean requiereEquipamientoEspecial,@Size(max=10000) String observaciones){}
 /** DTS-only request. Type is deliberately absent: it is always SANITARIO. */
 @StrictJson
 public record CreateFlight(@NotNull Long patientId,@NotNull Long localidadOrigenId,@NotNull Long localidadDestinoId,@NotBlank String priorityCode,@NotBlank @Size(max=10000) String motivoVuelo,@NotNull LocalDateTime fechaSolicitada,boolean extremaUrgencia,@Size(max=10000) String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,@NotNull Medical medical,@Valid List<TransferContactDtos.Input> contactos){
  public CreateFlight(Long patientId,Long localidadOrigenId,Long localidadDestinoId,String priorityCode,String motivoVuelo,LocalDateTime fechaSolicitada,boolean extremaUrgencia,String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,Medical medical){this(patientId,localidadOrigenId,localidadDestinoId,priorityCode,motivoVuelo,fechaSolicitada,extremaUrgencia,justificacionExtremaUrgencia,fechaLimiteTraslado,medical,null);}
 }
 /** Alta de paciente y solicitud en una única transacción. La selección de pacientes existentes usa CreateFlight. */
 @StrictJson
 public record CreateFlightWithPatient(@NotNull @Valid CreatePatient patient,@NotNull Long localidadOrigenId,@NotNull Long localidadDestinoId,@NotBlank String priorityCode,@NotBlank @Size(max=10000) String motivoVuelo,@NotNull LocalDateTime fechaSolicitada,boolean extremaUrgencia,@Size(max=10000) String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,@NotNull @Valid Medical medical,boolean identidadConfirmada,@Valid List<TransferContactDtos.Input> contactos){
  public CreateFlightWithPatient(CreatePatient patient,Long localidadOrigenId,Long localidadDestinoId,String priorityCode,String motivoVuelo,LocalDateTime fechaSolicitada,boolean extremaUrgencia,String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,Medical medical,boolean identidadConfirmada){this(patient,localidadOrigenId,localidadDestinoId,priorityCode,motivoVuelo,fechaSolicitada,extremaUrgencia,justificacionExtremaUrgencia,fechaLimiteTraslado,medical,identidadConfirmada,null);}
 }
 public record CreateOperationalFlight(@NotBlank @Size(max=40) String tipoVueloCode,@NotBlank @Size(max=10000) String motivoVuelo,@NotNull Long aircraftId,@NotNull Long comandanteId,@NotNull Long destinoId,@NotNull LocalDateTime salida,@NotNull LocalDateTime llegada){}
 public record ReplanOperationalFlight(@NotNull Long aircraftId,@NotNull Long comandanteId,@NotNull Long destinoId,@NotNull LocalDateTime salida,@NotNull LocalDateTime llegada){}
 public record Evaluation(@NotNull Boolean aprobar,Long motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado,String priorityCode){}
 public record CounterProposal(@NotNull LocalDateTime salida,@NotBlank @Size(max=10000) String motivo){}
 /** propuestaId identifica la propuesta que el usuario vio y responde; si ya fue reemplazada o respondida la respuesta se rechaza como obsoleta. */
 public record NegotiationResponse(@NotNull Boolean aceptar,@NotNull Long propuestaId,Long motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado,@Size(max=10000) String motivo){}
 public record CommanderResponse(@NotNull Boolean aceptar,@Size(max=10000) String motivo,LocalDateTime salidaPropuesta,LocalDateTime llegadaPropuesta){}
 /** Justificación de una asignación excepcional de comandante (fuera de la localidad de salida); la autorización depende del rol de quien la envía. */
 public record GeographicExceptionRequest(@NotBlank @Size(min=15,max=500) String motivo){}
 /** Asignación combinada de aeronave y comandante (contrato original); excepcionGeografica sólo se informa si el comandante no está en la localidad de salida. */
 public record AssignResources(@NotNull Long aircraftId,@NotNull Long comandanteId,@jakarta.validation.Valid GeographicExceptionRequest excepcionGeografica){ public AssignResources(Long aircraftId,Long comandanteId){this(aircraftId,comandanteId,null);} }
 public record AssignCommander(@NotNull Long comandanteId,@jakarta.validation.Valid GeographicExceptionRequest excepcionGeografica){}
 public record AssignAircraft(@NotNull Long aircraftId,@Size(max=500) String motivo){}
 public record Plan(@NotNull Long origenId,@NotNull Long destinoId,@NotNull LocalDateTime salida,@NotNull LocalDateTime llegada){}
 /** justificacion: obligatoria cuando algún aeropuerto elegido no está en la provincia donde se encuentra / adonde debe llegar el paciente. */
 public record OperationalPlan(@NotNull Long origenId,@NotNull Long destinoId,@NotNull LocalDateTime llegada,@Size(max=500) String justificacion){ public OperationalPlan(Long origenId,Long destinoId,LocalDateTime llegada){this(origenId,destinoId,llegada,null);} }
 /**
  * Propuesta o cambio de los aeropuertos del vuelo por Centro de Operaciones (cada uno es opcional; al menos uno). El aeropuerto queda PROPUESTO hasta que el comandante lo confirma
  * en su planificación. Si el cambio deja inelegible al comandante asignado, hay que indicar otro comandante (nuevoComandanteId) o una excepción geográfica justificada.
  */
 public record SetAirports(Long origenId,Long destinoId,Long nuevoComandanteId,@jakarta.validation.Valid GeographicExceptionRequest excepcionGeografica,@Size(max=500) String justificacion){}
 public record Cancel(@NotNull Long motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado){}
 public record Weather(@NotBlank @Size(max=10000) String condiciones,@NotNull Boolean favorable,@Size(max=10000) String observaciones){}
 public record WeatherView(Long id,String condiciones,Boolean favorable,String observaciones,LocalDateTime fechaRegistro,String registradoPor){}
 /** Asignación del copiloto (único tipo de tripulante con cuenta además del comandante). {@code excepcionGeografica}: sólo Centro de Operaciones, con justificación, si está fuera de la jurisdicción de salida. */
 public record Crew(@NotNull Long userId,@NotBlank String crewRoleCode,@jakarta.validation.Valid GeographicExceptionRequest excepcionGeografica){ public Crew(Long userId,String crewRoleCode){this(userId,crewRoleCode,null);} }
 /** vigente=false: asignación dada de baja (retiro, reemplazo o cambio de comandante), conservada como historial. */
 public record CrewView(Long id,Long userId,String username,String nombre,String apellido,String crewRoleCode,String crewRoleName,boolean comandante,boolean vigente,LocalDateTime asignadoEn,String asignadoPor,LocalDateTime fechaBaja,String bajaPor,String motivoBaja,String elegibilidadCodigo,String elegibilidadMotivo){}
 public record FinalReport(@DecimalMin("0.0") BigDecimal horasVuelo,@DecimalMin("0.0") BigDecimal combustibleConsumidoLitros,@Size(max=10000) String incidentes,@Size(max=10000) String resumen){}
 public record LocalityView(Long id,String nombre,String provincia,Long provinciaId){}
 public record FlightTypeView(String codigo,String nombre){}
 public record SanitaryDataView(Long patientId,String paciente,String prioridad,LocalityView localidadOrigenSolicitada,LocalityView localidadDestinoSolicitada,LocalDateTime fechaSolicitada,boolean extremaUrgencia,String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,String estadoSolicitud,String motivoRechazo,LocalDateTime fechaRecepcion){}
 /** Lugar estructurado de un aeropuerto planificado (mismo formato que las localidades solicitadas: nombre y provincia). */
 public record CancellationView(String motivo,String codigoMotivo,LocalDateTime fecha,String canceladoPor){}
 public record PlaceView(Long id,String nombre,String provincia,Long provinciaId){}
 /** origen/destino conservan el nombre del aeropuerto; origenDetalle/destinoDetalle lo entregan estructurado (null mientras no hay aeropuerto planificado). */
 public record FlightView(Long id,String codigo,FlightTypeView tipo,String motivoVuelo,String estadoVuelo,SanitaryDataView datosSanitarios,LocalDateTime salida,LocalDateTime llegada,String origen,String destino,PlaceView origenDetalle,PlaceView destinoDetalle,CancellationView cancelacion){}
 public record PatientDetail(Long id,String nombre,String apellido,String dni){}
 public record AvailableAircraftView(Long id,String matricula,String modelo,String tipo,Long aeropuertoActualId,String aeropuertoActual,boolean disponible,String motivoNoDisponible,List<AircraftDtos.FlightSummary> conflictos){}
 public record ChangeAircraft(@NotNull Long aircraftId,@Size(max=500) String motivo){}
 public record AvailableCommanderView(Long id,String username,String nombre,String apellido,String licencia,String provinciaActual){}
 /**
  * Comandante evaluado para la jurisdicción (provincia o CABA) del aeropuerto de salida del vuelo. elegibilidad: ORDINARIA (en esa jurisdicción y apto), EXCEPCION (apto, pero en otra
  * jurisdicción o sin ubicación: requiere excepción justificada y autorizada) o NO_ELEGIBLE (no cumple una condición operativa; ninguna excepción geográfica lo habilita).
  * codigoUbicacion es MISMA_JURISDICCION o el tipo de excepción necesario; codigoOperativo/motivoOperativo, la causa si no es apto.
  */
 public record CommanderCandidateView(Long id,String username,String nombre,String apellido,String licencia,Long provinciaId,String provincia,String ubicacionPrevistaTrasVuelo,LocalDateTime ubicacionActualizadaEn,String elegibilidad,String codigoUbicacion,String motivoUbicacion,String codigoOperativo,String motivoOperativo,java.util.List<CrewRequirementDtos.RequirementView> requisitosFaltantes){}
 /** Jurisdicción contra la que se evalúa: fuente = AEROPUERTO_CONFIRMADO, AEROPUERTO_PROPUESTO o PROVINCIA_DEL_PACIENTE; preliminar si el aeropuerto de salida todavía no está confirmado. */
 public record DepartureView(Long provinciaId,String provincia,Long aeropuertoId,String aeropuerto,String fuente,boolean preliminar){}
 public record CommanderCandidates(DepartureView salida,Long comandanteAsignadoId,List<CommanderCandidateView> ordinarios,List<CommanderCandidateView> noElegiblesEnJurisdiccion,List<CommanderCandidateView> excepcionales,boolean excepcionalesIncompletos,Map<String,Long> fueraDeJurisdiccion,boolean puedeAutorizarExcepcion,String mensaje,String advertencia){}
 public record GeographicExceptionView(Long id,String tipo,String motivo,String autorizadaPor,LocalDateTime fecha,String provinciaComandante,String provinciaSalida,String aeropuertoSalida){}
 /** estado: PENDIENTE (sin aeropuerto), PROPUESTO (falta que el comandante lo confirme) o CONFIRMADO. */
 public record AirportSlotView(Long aeropuertoId,String aeropuerto,String codigoOaci,Long provinciaId,String provincia,String estado){}
 /** Planificación aeronáutica del vuelo (distinta de la necesidad sanitaria): aeropuertos de salida y llegada y lo que falta definir. */
 public record AirportPlanView(AirportSlotView salida,AirportSlotView llegada,String fijadoPor,LocalDateTime fijadoEn,boolean elegibilidadPreliminar,String advertenciaElegibilidad,List<String> pendientes){}
 public record NegotiationEventView(Long id,Long respondeA,String tipo,LocalDateTime fechaHoraPropuesta,LocalDateTime fechaHoraLlegadaPropuesta,String motivo,String actor,LocalDateTime fechaOcurrencia){}
 public record ResourceAssignment(Long aircraftId,String aircraftMatricula,String aircraftModelo,String aircraftTipo,String aircraftUbicacion,Short aircraftCapacidadTripulacion,Long commanderId,String commanderUsername,String commanderNombre,String commanderApellido,String commanderLicencia,String commanderProvinciaActual,LocalDateTime commanderUbicacionActualizadaEn,GeographicExceptionView excepcionGeografica){}
 public record FlightDetailView(FlightView vuelo,PatientDetail paciente,Medical medical,ResourceAssignment recursos,AirportPlanView aeropuertos,List<NegotiationEventView> negociacion,FinalReportDtos.ClosureView cierre){}
}
