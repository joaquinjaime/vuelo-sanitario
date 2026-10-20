package com.vuelossanitarios.backend.api;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
@RestControllerAdvice public class ApiExceptionHandler {
 private static final Logger log=LoggerFactory.getLogger(ApiExceptionHandler.class);
 @ExceptionHandler(ApiException.class) ResponseEntity<Map<String,Object>> app(ApiException e){Map<String,Object> body=new LinkedHashMap<>();body.put("error",e.getMessage());if(e.code()!=null)body.put("code",e.code());body.putAll(e.details());return ResponseEntity.status(e.status()).body(body);}
 @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<Map<String,String>> validation(MethodArgumentNotValidException e){return ResponseEntity.badRequest().body(Map.of("error","Datos de entrada inválidos"));}
 @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<Map<String,String>> unreadableBody(HttpMessageNotReadableException e){return ResponseEntity.badRequest().body(Map.of("error","Datos de entrada inválidos"));}
 @ExceptionHandler(MethodArgumentTypeMismatchException.class) ResponseEntity<Map<String,String>> invalidParameter(){return ResponseEntity.badRequest().body(Map.of("error","Parámetro inválido"));}
 @ExceptionHandler(NoResourceFoundException.class) ResponseEntity<Map<String,String>> resourceNotFound(){return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error","Recurso inexistente"));}
 @ExceptionHandler(HttpRequestMethodNotSupportedException.class) ResponseEntity<Map<String,String>> methodNotAllowed(){return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(Map.of("error","Método no permitido"));}
 @ExceptionHandler(AccessDeniedException.class) ResponseEntity<Map<String,String>> denied(){return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error","Acceso denegado"));}
 @ExceptionHandler({jakarta.validation.ConstraintViolationException.class,org.springframework.web.bind.MissingServletRequestParameterException.class,org.springframework.web.multipart.support.MissingServletRequestPartException.class,org.springframework.web.multipart.MultipartException.class}) ResponseEntity<Map<String,String>> invalidInput(Exception e){if(e instanceof org.springframework.web.multipart.MaxUploadSizeExceededException)return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error","El archivo supera el tamaño permitido"));return ResponseEntity.badRequest().body(Map.of("error","Datos de entrada inválidos"));}
 @ExceptionHandler(Exception.class) ResponseEntity<Map<String,String>> unexpected(Exception e){log.error("Unhandled API exception",e);return ResponseEntity.status(500).body(Map.of("error","Error interno"));}
}
