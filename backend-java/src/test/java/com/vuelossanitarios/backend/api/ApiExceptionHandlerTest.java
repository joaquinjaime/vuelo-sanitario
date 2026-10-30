package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** Errores del cliente por tipo de contenido son 415/406 con mensaje genérico, nunca un 500 "Error interno". */
class ApiExceptionHandlerTest {
 private final ApiExceptionHandler handler=new ApiExceptionHandler();

 @Test void aWrongContentTypeIsA415WithoutInternalDetails(){
  var response=handler.unsupportedMediaType();
  assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE,response.getStatusCode());
  assertEquals("Tipo de contenido no admitido",response.getBody().get("error"));
 }
 @Test void anUnavailableResponseFormatIsA406(){
  assertEquals(HttpStatus.NOT_ACCEPTABLE,handler.notAcceptable().getStatusCode());
 }
}
