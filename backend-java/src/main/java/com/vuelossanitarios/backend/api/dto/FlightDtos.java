package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.List;
public final class FlightDtos { private FlightDtos(){}
 public record Medical(@Size(max=10000) String diagnostico,@Size(max=100) String condicionMedica,boolean requiereEquipamientoEspecial,@Size(max=10000) String observaciones){}
 public record CreateFlight(@NotNull UUID patientId,@NotNull UUID localidadOrigenId,@NotNull UUID localidadDestinoId,@NotBlank String priorityCode,@Size(max=10000) String motivoSolicitud,@NotNull LocalDateTime fechaSolicitada,boolean extremaUrgencia,@Size(max=10000) String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,@NotNull Medical medical){}
 public record Evaluation(@NotNull Boolean aprobar,UUID motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado,String priorityCode){}
 public record CounterProposal(@NotNull LocalDateTime salida,@NotBlank @Size(max=10000) String motivo){}
 public record NegotiationResponse(@NotNull Boolean aceptar,UUID motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado){}
 public record AssignResources(@NotNull UUID aircraftId,@NotNull UUID comandanteId){}
 public record Plan(@NotNull UUID origenId,@NotNull UUID destinoId,@NotNull LocalDateTime salida,@NotNull LocalDateTime llegada){}
 public record OperationalPlan(@NotNull UUID origenId,@NotNull UUID destinoId,@NotNull LocalDateTime llegada){}
 public record Cancel(@NotNull UUID motivoCancelacionId,@Size(max=10000) String motivoCancelacionPersonalizado){}
 public record Weather(@NotBlank @Size(max=10000) String condiciones,@NotNull Boolean favorable,@Size(max=10000) String observaciones){}
 public record WeatherView(UUID id,String condiciones,Boolean favorable,String observaciones,LocalDateTime fechaRegistro,String registradoPor){}
 public record Crew(@NotNull UUID userId,@NotBlank String crewRoleCode){}
 public record FinalReport(@DecimalMin("0.0") BigDecimal horasVuelo,@DecimalMin("0.0") BigDecimal combustibleConsumidoLitros,@Size(max=10000) String incidentes,@Size(max=10000) String resumen){}
 public record LocalityView(UUID id,String nombre,String provincia,UUID provinciaId){}
 public record FlightView(UUID id,String codigo,String estado,UUID patientId,String paciente,String prioridad,LocalityView origen,LocalityView destino,LocalDateTime solicitada,boolean extremaUrgencia,String justificacionExtremaUrgencia,LocalDateTime fechaLimiteTraslado,LocalDateTime salida,LocalDateTime llegada){}
 public record PatientDetail(UUID id,String nombre,String apellido,String dni){}
 public record AvailableAircraftView(UUID id,String matricula,String modelo,String tipo,UUID aeropuertoActualId,String aeropuertoActual){}
 public record AvailableCommanderView(UUID id,String username,String nombre,String apellido,String licencia,String provinciaActual){}
 public record NegotiationEventView(String tipo,LocalDateTime fechaHoraPropuesta,String motivo,String actor,LocalDateTime fechaOcurrencia){}
 public record ResourceAssignment(UUID aircraftId,String aircraftMatricula,UUID commanderId,String commanderUsername,String commanderNombre,String commanderApellido,String commanderLicencia,String commanderProvinciaActual){}
 public record FlightDetailView(FlightView vuelo,PatientDetail paciente,Medical medical,String motivoSolicitud,String motivoRechazo,ResourceAssignment recursos,List<NegotiationEventView> negociacion){}
}
