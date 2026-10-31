package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
public final class AuthDtos { private AuthDtos(){}
 public record LoginRequest(@NotBlank String username,@NotBlank String password) {}
 public record TokenResponse(String accessToken,String tokenType,String username,Set<String> roles,boolean debeCambiarContrasena) {}
 @StrictJson public record ContactRequest(@NotBlank @Size(max=170) String direccion,@Size(max=30) String tipo) {}
 /** {@code pais}: código ISO 3166-1 alfa-2 con cuyas reglas de numeración se valida el teléfono; es obligatorio (el servidor lo exige aunque la interfaz lo preseleccione). */
 @StrictJson public record PhoneRequest(@NotBlank @Size(max=30) String numero,@Size(max=2) String pais,@Size(max=30) String tipo) {}
 @StrictJson public record ContactUpdateRequest(@NotBlank @Size(max=150) String direccion,@Size(max=30) String tipo,@NotNull Long version) {}
 @StrictJson public record PhoneUpdateRequest(@NotBlank @Size(max=30) String numero,@Size(max=2) String pais,@Size(max=30) String tipo,@NotNull Long version) {}
 /** Código OTP decimal recibido por correo: exactamente seis dígitos, incluidos los ceros iniciales. */
 @StrictJson public record ConfirmEmailRequest(@NotBlank @Pattern(regexp="\\d{6}") String codigo) {}
 /** {@code personaExistenteId} confirma, de forma explícita, que la cuenta se asocia a una persona ya registrada con ese DNI (sin cuenta); nunca se fusionan identidades por coincidencia. */
 public record CreatePendingUserRequest(@NotBlank @Size(max=100) String nombre,@NotBlank @Size(max=100) String apellido,@NotBlank @Size(max=20) String dni, LocalDate fechaNacimiento,@Size(max=50) String licenciaAeronautica,@NotEmpty Set<String> roles,@NotEmpty List<@Valid ContactRequest> correos,@NotEmpty List<@Valid PhoneRequest> telefonos,Long personaExistenteId) {
  public CreatePendingUserRequest(String nombre,String apellido,String dni,LocalDate fechaNacimiento,String licenciaAeronautica,Set<String> roles,List<ContactRequest> correos,List<PhoneRequest> telefonos){this(nombre,apellido,dni,fechaNacimiento,licenciaAeronautica,roles,correos,telefonos,null);}
 }
 /** Impedimento operativo concreto (vuelo, informe o solicitud) para una baja o un cambio de rol. */
 public record Blocker(String tipo,Long vueloId,String vueloCodigo,String detalle) {}
 public record UserSummary(Long id,String nombre,String apellido,String dni,String username,String estado,boolean activo,LocalDateTime fechaBaja,String bajaPor,String motivoBaja,Set<String> roles,String provinciaActual,boolean debeCambiarContrasena) {}
 public record UserPage(List<UserSummary> items,long total,int page,int size,int totalPages) {}
 public record UserCounts(long activos,long pendientes,long inactivos) {}
 public record RoleOption(String codigo,String nombre) {}
 public record UserDetail(Long id,String nombre,String apellido,String dni,LocalDate fechaNacimiento,String username,String estado,boolean activo,boolean debeCambiarContrasena,LocalDateTime fechaCreacion,LocalDateTime fechaBaja,Long bajaPorId,String bajaPor,String motivoBaja,Set<String> roles,List<ContactView> correos,List<ContactView> telefonos,String licenciaAeronautica,String provinciaActual,List<Blocker> impedimentosBaja,boolean ultimoAdministrador,boolean esUsted,Long versionIdentidad,Long pacienteId) {}
 /** La contraseña temporal sólo viaja en esta respuesta; no se guarda en claro ni puede consultarse después. */
 public record CredentialResetResponse(String contrasenaTemporal) {}
 public record UpdateUserRequest(@NotBlank @Size(max=100) String nombre,@NotBlank @Size(max=100) String apellido, LocalDate fechaNacimiento,@Size(max=50) String licenciaAeronautica,@NotEmpty Set<String> roles,@NotNull Boolean activo) {}
 public record ActivateAccountRequest(@NotBlank @Size(max=20) String dni,@NotBlank String codigo,@NotBlank @Size(max=50) String username,@NotBlank @Size(min=12,max=100) String password,@NotBlank String confirmacionPassword) {}
 public record TemporaryPasswordRequest(@NotBlank @Size(min=12,max=100) String password) {}
 public record DeactivateUserRequest(@Size(max=500) String motivo) {}
 public record ReactivateUserRequest(@NotBlank @Size(max=100) String nombre,@NotBlank @Size(max=100) String apellido, LocalDate fechaNacimiento,@Size(max=50) String licenciaAeronautica,@NotEmpty Set<String> roles) {}
 public record ReactivationResponse(UserView usuario,String contrasenaTemporal) {}
 public record ChangePasswordRequest(@NotBlank String passwordActual,@NotBlank @Size(min=12,max=100) String nuevaPassword,@NotBlank String confirmacionPassword) {}
 /** {@code version} es la que debe devolverse al editar: dos ediciones simultáneas del mismo contacto no se pisan en silencio. */
 /**
  * {@code pais}: teléfono validado con las reglas de ese país (nulo = dato anterior a V54, sin validar). {@code verificacion} (sólo correos): VERIFICADO, PENDIENTE,
  * EXPIRADO o SIN_VERIFICAR. {@code envio} (sólo al registrar o solicitar el código): ENVIADO, NO_CONFIGURADO, FALLIDO o LIMITE_ALCANZADO.
  */
 public record ContactView(Long id,String valor,String tipo,boolean principal,Long version,String pais,String verificacion,String envio) {}
 public record UserView(Long id,String nombre,String apellido,String dni,String username,String estado,boolean activo,LocalDateTime fechaBaja,Set<String> roles,List<ContactView> correos,List<ContactView> telefonos,String provinciaActual) {}
 public record CommanderView(Long id,String username,String nombre,String apellido,String licencia,String provinciaActual) {}
 public record ActivationCodeResponse(String codigo, String expiraEn) {}
}
