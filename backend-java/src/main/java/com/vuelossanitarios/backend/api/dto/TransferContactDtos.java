package com.vuelossanitarios.backend.api.dto;

import jakarta.validation.constraints.*;
import java.util.List;

/** Contactos de coordinación de un traslado sanitario. Un campo desconocido se rechaza (nunca se descarta en silencio). */
public final class TransferContactDtos {
 private TransferContactDtos(){}
 /**
  * {@code relacion}: PACIENTE, FAMILIAR_RESPONSABLE, ESTABLECIMIENTO_ORIGEN, ESTABLECIMIENTO_DESTINO u OTRO. El nombre es obligatorio salvo
  * para el propio paciente. En una lista, el primero es el contacto principal.
  */
 @StrictJson
 public record Input(@NotBlank @Size(max=30) String relacion,@Size(max=150) String nombre,@NotBlank @Size(max=40) String telefono,@Size(max=2) String pais,@Size(max=200) String observaciones){}
 @StrictJson
 public record Update(@NotBlank @Size(max=30) String relacion,@Size(max=150) String nombre,@NotBlank @Size(max=40) String telefono,@Size(max=2) String pais,@Size(max=200) String observaciones,@NotNull Long version){}
 /** {@code pais}: país con cuyas reglas se validó el número; nulo en contactos anteriores a V54 (sin validar). */
 public record View(Long id,String relacion,String nombre,String telefono,String pais,String observaciones,boolean principal,Long version){}
 /** {@code disponible=false}: la coordinación ya terminó (vuelo cerrado o cancelado, solicitud rechazada) y los números dejan de mostrarse. */
 public record Listing(boolean disponible,String motivoNoDisponible,boolean puedeEditar,int maximo,List<View> items){}
}
