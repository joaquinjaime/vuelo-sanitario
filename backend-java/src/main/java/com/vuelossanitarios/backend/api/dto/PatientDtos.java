package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
public final class PatientDtos {private PatientDtos(){} public record CreatePatient(Long personId,@Size(max=100) String nombre,@Size(max=100) String apellido,@Size(max=20) String dni,LocalDate fechaNacimiento,@Size(max=30) String telefono){} public record PatientView(Long id,Long personId,String nombre,String apellido){} }
