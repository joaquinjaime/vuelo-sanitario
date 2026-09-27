package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.UUID;
public final class PatientDtos {private PatientDtos(){} public record CreatePatient(UUID personId,@Size(max=100) String nombre,@Size(max=100) String apellido,@Size(max=20) String dni,LocalDate fechaNacimiento,@Size(max=30) String telefono){} public record PatientView(UUID id,UUID personId,String nombre,String apellido){} }
