package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
import java.util.List;

/** Ubicación operativa actual del comandante (V64): sólo la provincia o la Ciudad Autónoma de Buenos Aires, con quién y cuándo la registró. No es el domicilio habitual ni una localidad. */
public final class CommanderLocationDtos {
 private CommanderLocationDtos(){}
 /** estadoUbicacion: CONOCIDA (hay una jurisdicción registrada) o DESCONOCIDA. */
 public record CommanderLocationRow(Long comandanteId,String username,String nombre,String apellido,String licencia,boolean activo,String estadoCuenta,
   Long provinciaId,String provincia,String estadoUbicacion,LocalDateTime actualizadaEn,String actualizadaPor){}
 public record CommanderLocationList(List<CommanderLocationRow> comandantes,boolean truncado){}
 /** provinciaId null = ubicación desconocida. */
 @StrictJson public record UpdateCommanderLocation(Long provinciaId,@Size(max=300) String motivo){}
}
