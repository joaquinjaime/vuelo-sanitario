package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.*;
public final class AuthDtos { private AuthDtos(){}
 public record LoginRequest(@NotBlank String username,@NotBlank String password) {}
 public record TokenResponse(String accessToken,String tokenType,String username,Set<String> roles,boolean debeCambiarContrasena) {}
 public record ContactRequest(@NotBlank @Email @Size(max=150) String direccion,@Size(max=30) String tipo) {}
 public record PhoneRequest(@NotBlank @Size(min=3,max=30) String numero,@Size(max=30) String tipo) {}
 public record CreatePendingUserRequest(@NotBlank @Size(max=100) String nombre,@NotBlank @Size(max=100) String apellido,@NotBlank @Size(max=20) String dni, LocalDate fechaNacimiento,@Size(max=50) String licenciaAeronautica,@NotEmpty Set<String> roles,@NotEmpty List<@Valid ContactRequest> correos,@NotEmpty List<@Valid PhoneRequest> telefonos) {}
 public record UpdateUserRequest(@NotBlank @Size(max=100) String nombre,@NotBlank @Size(max=100) String apellido, LocalDate fechaNacimiento,@Size(max=50) String licenciaAeronautica,@NotEmpty Set<String> roles,@NotNull Boolean activo) {}
 public record ActivateAccountRequest(@NotBlank @Size(max=20) String dni,@NotBlank String codigo,@NotBlank @Size(max=50) String username,@NotBlank @Size(min=12,max=100) String password,@NotBlank String confirmacionPassword) {}
 public record TemporaryPasswordRequest(@NotBlank @Size(min=12,max=100) String password) {}
 public record ChangePasswordRequest(@NotBlank String passwordActual,@NotBlank @Size(min=12,max=100) String nuevaPassword,@NotBlank String confirmacionPassword) {}
 public record ContactView(UUID id,String valor,String tipo,boolean principal) {}
 public record UserView(UUID id,String nombre,String apellido,String dni,String username,String estado,boolean activo,Set<String> roles,List<ContactView> correos,List<ContactView> telefonos) {}
 public record CommanderView(UUID id,String username) {}
 public record ActivationCodeResponse(String codigo, String expiraEn) {}
}
