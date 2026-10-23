package com.vuelossanitarios.backend.api.dto;

import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
import java.util.List;

/** Contratos de administración de aeronaves. */
public final class AircraftDtos { private AircraftDtos(){}
 public static final String PLATE_PATTERN="^[A-Za-z0-9][A-Za-z0-9-]*$";
 /** Alta: la ubicación inicial y el estado operativo inicial forman parte del registro. */
 public record AircraftRequest(@NotBlank @Size(max=20) @Pattern(regexp=PLATE_PATTERN) String matricula,@NotBlank @Size(max=100) String modelo,@NotBlank @Size(max=50) String tipo,@NotNull @Min(1) @Max(200) Short capacidadPacientes,@NotNull @Min(1) @Max(200) Short capacidadTripulacion,@Size(max=10000) String equipamientoMedico,@NotNull Long aeropuertoActualId,Boolean activo){}
 /** Edición de datos administrativos. activo y aeropuertoActualId se aceptan sólo por compatibilidad: si difieren del valor vigente se rechazan (tienen operaciones propias con sus controles). */
 public record AircraftUpdateRequest(@NotBlank @Size(max=20) @Pattern(regexp=PLATE_PATTERN) String matricula,@NotBlank @Size(max=100) String modelo,@NotBlank @Size(max=50) String tipo,@NotNull @Min(1) @Max(200) Short capacidadPacientes,@NotNull @Min(1) @Max(200) Short capacidadTripulacion,@Size(max=10000) String equipamientoMedico,Long aeropuertoActualId,Boolean activo){}
 public record ActiveRequest(@NotNull Boolean activo,@Size(max=500) String motivo){}
 public record AircraftLocationRequest(@NotNull Long locationId,@Size(max=500) String motivo){}
 /** Vista operativa liviana (todos los roles autorizados a consultar el catálogo). */
 public record AircraftView(Long id,String matricula,String modelo,String tipo,Short capacidadPacientes,Short capacidadTripulacion,String equipamientoMedico,boolean activo,Long aeropuertoActualId,String aeropuertoActual){}
 public record FlightSummary(Long id,String codigo,String tipo,String estado,LocalDateTime salida,LocalDateTime llegada,String origen,String destino){}
 /**
  * Vista administrativa. estadoOperativo distingue: DESACTIVADA, EN_VUELO, ASIGNADA (activa con vuelos comprometidos) y SIN_ASIGNACIONES
  * (activa y sin vuelos comprometidos). No indica disponibilidad: ésta depende del intervalo consultado (/aircraft/availability).
  */
 public record AircraftAdminView(Long id,String matricula,String modelo,String tipo,Short capacidadPacientes,Short capacidadTripulacion,String equipamientoMedico,boolean activo,Long aeropuertoActualId,String aeropuertoActual,LocalDateTime fechaCreacion,String estadoOperativo,boolean enVuelo,int vuelosComprometidos,FlightSummary proximoVuelo){}
 public record AircraftAvailabilityView(Long id,String matricula,String modelo,String tipo,Long aeropuertoActualId,String aeropuertoActual,boolean disponible,String motivoNoDisponible,List<FlightSummary> conflictos){}
 public record AircraftHistoryEntry(Long id,String operacion,String usuario,LocalDateTime fecha,Long vueloId,String valoresAnteriores,String valoresNuevos){}
}
