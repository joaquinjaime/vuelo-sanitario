package com.vuelossanitarios.backend.api.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

/** Contratos del catálogo geográfico administrado. Los códigos son identificadores externos estables, no texto libre. */
public final class GeographicCatalogDtos {
 private GeographicCatalogDtos(){}
 public record ProvinceRequest(@NotBlank @Size(max=10) @Pattern(regexp="^[A-Za-z0-9._-]+$") String codigoOficial,@NotBlank @Size(max=100) String nombre){}
 public record LocalityRequest(@NotBlank @Size(max=20) @Pattern(regexp="^[A-Za-z0-9._-]+$") String codigoOficial,@NotBlank @Size(max=200) String nombre,@NotNull Long provinciaId){}
 public record AirportRequest(@Size(max=20) @Pattern(regexp="^[A-Za-z0-9._-]*$") String codigoOficial,@Size(max=4) @Pattern(regexp="^[A-Za-z0-9]*$") String codigoOaci,@Size(max=3) @Pattern(regexp="^[A-Za-z0-9]*$") String codigoIata,@NotBlank @Size(max=150) String nombre,@Size(max=100) String ciudad,@NotNull Long provinciaId,Long localidadId,@Size(max=30) String tipo,@NotBlank @Size(max=100) String pais,@DecimalMin("-90.000000") @DecimalMax("90.000000") BigDecimal latitud,@DecimalMin("-180.000000") @DecimalMax("180.000000") BigDecimal longitud){}
 public record ActiveRequest(@NotNull Boolean activo,@Size(max=500) String motivo){}
 public record ProvinceAdminView(Long id,String codigoOficial,String nombre,boolean activo){}
 public record LocalityAdminView(Long id,String codigoOficial,String nombre,Long provinciaId,String provincia,boolean activo){}
 public record AirportAdminView(Long id,String codigoOficial,String codigoOaci,String codigoIata,String nombre,String ciudad,Long provinciaId,String provincia,Long localidadId,String localidad,String tipo,String pais,BigDecimal latitud,BigDecimal longitud,boolean activo){}
 public record PageView<T>(List<T> items,int page,int size,long totalElements,int totalPages){}
}
