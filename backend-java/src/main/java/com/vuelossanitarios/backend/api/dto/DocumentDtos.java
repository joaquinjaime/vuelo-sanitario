package com.vuelossanitarios.backend.api.dto;
import jakarta.validation.constraints.*;
public final class DocumentDtos { private DocumentDtos(){} public record CreateText(@NotBlank String documentTypeCode,@NotBlank @Size(max=255) String titulo,@NotBlank @Size(max=100000) String contenido){} public record ReplaceText(@NotBlank @Size(max=100000) String contenido){} public record DocumentView(String itemId,int version,boolean actual,String modalidad,String titulo){} }
