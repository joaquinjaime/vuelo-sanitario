package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
import java.util.List;

/** Ubicación operativa actual del comandante (V63): localidad y provincia, con quién y cuándo la registró. No es el domicilio habitual. */
public final class CommanderLocationDtos {
 private CommanderLocationDtos(){}
 /** estadoUbicacion: CONOCIDA (localidad vigente), LOCALIDAD_DESHABILITADA (la localidad registrada fue dada de baja), SOLO_PROVINCIA (falta la localidad) o DESCONOCIDA. */
 public record CommanderLocationRow(Long comandanteId,String username,String nombre,String apellido,String licencia,boolean activo,String estadoCuenta,
   Long provinciaId,String provincia,Long localidadId,String localidad,String estadoUbicacion,LocalDateTime actualizadaEn,String actualizadaPor){}
 public record CommanderLocationList(List<CommanderLocationRow> comandantes,boolean truncado){}
 @StrictJson public record UpdateCommanderLocation(@NotNull Long provinciaId,@NotNull Long localidadId,@Size(max=300) String motivo){}
}
