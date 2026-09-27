package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.Set;
public final class AuthDtos { private AuthDtos(){}
 public record LoginRequest(@NotBlank String username,@NotBlank String password) {}
 public record TokenResponse(String accessToken,String tokenType,String username,Set<String> roles) {}
 public record CreateUserRequest(@NotBlank @Size(max=50) String username,@NotBlank @Email @Size(max=150) String email,@NotBlank @Size(min=12,max=100) String password,@NotBlank String nombre,@NotBlank String apellido,@Size(max=20) String dni, LocalDate fechaNacimiento,@Size(max=30) String telefono,@Size(max=50) String licenciaAeronautica,@NotEmpty Set<String> roles) {}
}
