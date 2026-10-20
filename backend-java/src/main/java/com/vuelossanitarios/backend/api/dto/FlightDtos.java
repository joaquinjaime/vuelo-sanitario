package com.vuelossanitarios.backend.api.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import com.vuelossanitarios.backend.api.dto.FinalReportDtos;

public final class FlightDtos { private FlightDtos(){}
 public record Medical(@Size(max=10000) String diagnostico,@Size(max=100) String condicionMedica,boolean requiereEquipamientoEspecial,@Size(max=10000) String observaciones){}
 /** DTS-only request. Type is deliberately absent: it is always SANITARIO. */
 public record CreateFlight(@NotNull Long patientId,@NotNull Long localidadOrigenId,@NotNull Long localidadDestinoId,@NotBlank String priorityCode,@NotBlank @Size(max=10000) String motivoVuelo,@NotNull LocalDateTime fechaSolicitada,boolean extremaUrgencia,@Size(max=10000) String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,@NotNull Medical medical){}
 public record CreateOperationalFlight(@NotBlank @Size(max=40) String tipoVueloCode,@NotBlank @Size(max=10000) String motivoVuelo,@NotNull Long aircraftId,@NotNull Long comandanteId,@NotNull Long destinoId,@NotNull LocalDateTime salida,@NotNull LocalDateTime llegada){}
 public record ReplanOperationalFlight(@NotNull Long aircraftId,@NotNull Long comandanteId,@NotNull Long destinoId,@NotNull LocalDateTime salida,@NotNull LocalDateTime llegada){}
 public record Evaluation(@NotNull Boolean aprobar,Long motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado,String priorityCode){}
 public record CounterProposal(@NotNull LocalDateTime salida,@NotBlank @Size(max=10000) String motivo){}
 public record NegotiationResponse(@NotNull Boolean aceptar,Long motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado){}
 public record CommanderResponse(@NotNull Boolean aceptar,@Size(max=10000) String motivo,LocalDateTime salidaPropuesta,LocalDateTime llegadaPropuesta){}
 public record AssignResources(@NotNull Long aircraftId,@NotNull Long comandanteId){}
 public record Plan(@NotNull Long origenId,@NotNull Long destinoId,@NotNull LocalDateTime salida,@NotNull LocalDateTime llegada){}
 public record OperationalPlan(@NotNull Long origenId,@NotNull Long destinoId,@NotNull LocalDateTime llegada){}
 public record Cancel(@NotNull Long motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado){}
 public record Weather(@NotBlank @Size(max=10000) String condiciones,@NotNull Boolean favorable,@Size(max=10000) String observaciones){}
 public record WeatherView(Long id,String condiciones,Boolean favorable,String observaciones,LocalDateTime fechaRegistro,String registradoPor){}
 public record Crew(@NotNull Long userId,@NotBlank String crewRoleCode){}
 public record CrewView(Long id,Long userId,String username,String nombre,String apellido,String crewRoleCode,String crewRoleName,boolean comandante){}
 public record AvailableCrewView(Long userId,String username,String nombre,String apellido,String crewRoleCode,String crewRoleName){}
 public record QualificationView(Long userId,String crewRoleCode,String crewRoleName){}
 public record FinalReport(@DecimalMin("0.0") BigDecimal horasVuelo,@DecimalMin("0.0") BigDecimal combustibleConsumidoLitros,@Size(max=10000) String incidentes,@Size(max=10000) String resumen){}
 public record LocalityView(Long id,String nombre,String provincia,Long provinciaId){}
 public record FlightTypeView(String codigo,String nombre){}
 public record SanitaryDataView(Long patientId,String paciente,String prioridad,LocalityView localidadOrigenSolicitada,LocalityView localidadDestinoSolicitada,LocalDateTime fechaSolicitada,boolean extremaUrgencia,String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,String estadoSolicitud){}
 /** Lugar estructurado de un aeropuerto planificado (mismo formato que las localidades solicitadas: nombre y provincia). */
 public record PlaceView(Long id,String nombre,String provincia,Long provinciaId){}
 /** origen/destino conservan el nombre del aeropuerto; origenDetalle/destinoDetalle lo entregan estructurado (null mientras no hay aeropuerto planificado). */
 public record FlightView(Long id,String codigo,FlightTypeView tipo,String motivoVuelo,String estadoVuelo,SanitaryDataView datosSanitarios,LocalDateTime salida,LocalDateTime llegada,String origen,String destino,PlaceView origenDetalle,PlaceView destinoDetalle){}
 public record PatientDetail(Long id,String nombre,String apellido,String dni){}
 public record AvailableAircraftView(Long id,String matricula,String modelo,String tipo,Long aeropuertoActualId,String aeropuertoActual){}
 public record AvailableCommanderView(Long id,String username,String nombre,String apellido,String licencia,String provinciaActual){}
 public record NegotiationEventView(String tipo,LocalDateTime fechaHoraPropuesta,LocalDateTime fechaHoraLlegadaPropuesta,String motivo,String actor,LocalDateTime fechaOcurrencia){}
 public record ResourceAssignment(Long aircraftId,String aircraftMatricula,Long commanderId,String commanderUsername,String commanderNombre,String commanderApellido,String commanderLicencia,String commanderProvinciaActual){}
 public record FlightDetailView(FlightView vuelo,PatientDetail paciente,Medical medical,ResourceAssignment recursos,List<NegotiationEventView> negociacion,FinalReportDtos.ClosureView cierre){}
}
