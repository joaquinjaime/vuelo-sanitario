package com.vuelossanitarios.backend.api.dto;

import java.lang.annotation.*;

/**
 * Marca un cuerpo de petición que rechaza los campos desconocidos. Por omisión la API los ignora; en los contratos que registran
 * datos personales o de contacto un campo no reconocido sería información que el usuario cree haber enviado y se pierde en silencio.
 */
@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.TYPE)
public @interface StrictJson {}
