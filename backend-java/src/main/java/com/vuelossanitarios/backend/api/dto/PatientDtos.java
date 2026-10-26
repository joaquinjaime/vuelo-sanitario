package com.vuelossanitarios.backend.api.dto;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class PatientDtos {
 private PatientDtos(){}
 /** Identidad del paciente. No lleva teléfono: los contactos para coordinar el traslado se informan en la solicitud (TransferContactDtos.Input) y un campo desconocido se rechaza. */
 @StrictJson
 public record CreatePatient(Long personId,@Size(max=100) String nombre,@Size(max=100) String apellido,@Size(max=20) String dni,LocalDate fechaNacimiento){}
 public record PatientView(Long id,Long personId,String nombre,String apellido){}
 /** Minimal patient identifiers. The account relationship and full DNI are never exposed by search. */
 public record PatientSearchItem(Long id,String nombre,String apellido,String dniTerminacion,Integer anioNacimiento){}
 public record PatientSearchPage(List<PatientSearchItem> items,int page,int size,boolean hasNext){}
 /** {@code cuentaEstado} es el estado de la cuenta de usuario de la persona (null si no tiene); nunca se exponen credenciales. */
 public record PatientIdentityDetail(Long id,String nombre,String apellido,String dni,LocalDate fechaNacimiento,Long version,String cuentaEstado){}
 /**
  * Rectificación (o primera asignación) del DNI de una identidad compartida. {@code cotejoDocumental} es la declaración expresa del
  * administrador de que cotejó la identidad con documentación suficiente; {@code confirmaCuenta} reconoce que la persona tiene una cuenta.
  */
 @StrictJson
 public record RectifyDni(@NotBlank @Size(max=20) String dniNuevo,@NotNull Long version,@NotBlank @Size(min=10,max=500) String motivo,@NotNull Boolean cotejoDocumental,Boolean confirmaCuenta){}
 /** DNI correction is forbidden here; a supplied DNI fails validation instead of being silently ignored. */
 public record CorrectIdentity(@NotBlank @Size(max=100) String nombre,@NotBlank @Size(max=100) String apellido,LocalDate fechaNacimiento,@NotNull Long version,@NotBlank @Size(min=10,max=500) String motivo,@Null String dni){}
 public record PatientCorrectionChange(String campo,String anterior,String nuevo){}
 public record PatientCorrectionEvent(Long id,Instant fecha,String operacion,String responsable,String motivo,List<PatientCorrectionChange> cambios){}
 public record PatientCorrectionHistory(List<PatientCorrectionEvent> items,int page,int size,boolean hasNext){}
}
