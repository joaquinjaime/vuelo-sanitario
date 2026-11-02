package com.vuelossanitarios.backend.api.dto;

import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

/** Contratos del personal sanitario (médicos y enfermeros) que cada DTS registra y asocia a sus vuelos. No son usuarios de la aplicación. */
public final class HealthStaffDtos {
 private HealthStaffDtos(){}
 private static final String NAME="[\\p{L}][\\p{L} .'’-]*";
 /** Alta. {@code tipoProfesional}: MEDICO o ENFERMERO. {@code matricula}: dato declarado, no verificado. */
 @StrictJson public record StaffInput(@NotBlank @Size(max=100) @Pattern(regexp=NAME,message="El nombre admite sólo letras") String nombre,
  @NotBlank @Size(max=100) @Pattern(regexp=NAME,message="El apellido admite sólo letras") String apellido,
  @NotBlank @Size(max=20) String dni,@NotBlank @Pattern(regexp="MEDICO|ENFERMERO",message="El tipo de profesional debe ser MEDICO o ENFERMERO") String tipoProfesional,
  @NotBlank @Size(max=50) @Pattern(regexp="[A-Za-z0-9./ -]+",message="La matrícula admite letras, números y . / -") String matricula) {}
 /** Modificación con control de versión. Nombre, apellido y DNI sólo cambian si la identidad no pertenece a ningún usuario, paciente ni otro catálogo. */
 @StrictJson public record StaffUpdate(@NotBlank @Size(max=100) @Pattern(regexp=NAME,message="El nombre admite sólo letras") String nombre,
  @NotBlank @Size(max=100) @Pattern(regexp=NAME,message="El apellido admite sólo letras") String apellido,
  @NotBlank @Size(max=20) String dni,@NotBlank @Pattern(regexp="MEDICO|ENFERMERO") String tipoProfesional,
  @NotBlank @Size(max=50) @Pattern(regexp="[A-Za-z0-9./ -]+",message="La matrícula admite letras, números y . / -") String matricula,@NotNull Long version) {}
 @StrictJson public record ActiveRequest(@NotNull Boolean activo,@NotNull Long version) {}
 public record StaffView(Long id,String nombre,String apellido,String dni,String tipoProfesional,String matricula,boolean activo,Long version,LocalDateTime creadoEn,LocalDateTime desactivadoEn,int vuelosVigentes) {}
 /** Integrante asignado a un vuelo. Para Operaciones y el comandante no incluye el DNI. */
 public record FlightStaffView(Long id,Long personalSanitarioId,String nombre,String apellido,String tipoProfesional,String matricula,boolean vigente,LocalDateTime asignadoEn,String asignadoPor,LocalDateTime fechaBaja,String bajaPor,String motivoBaja) {}
 public record StaffCandidateView(Long id,String nombre,String apellido,String tipoProfesional,String matricula,boolean disponible,String motivoNoDisponible) {}
 @StrictJson public record AssignStaff(@NotNull Long personalSanitarioId) {}
}
