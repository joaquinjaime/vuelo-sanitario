package com.vuelossanitarios.backend.api;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestControllerAdvice public class ApiExceptionHandler {
 @ExceptionHandler(ApiException.class) ResponseEntity<Map<String,String>> app(ApiException e){return ResponseEntity.status(e.status()).body(Map.of("error",e.getMessage()));}
 @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<Map<String,String>> validation(MethodArgumentNotValidException e){return ResponseEntity.badRequest().body(Map.of("error","Datos de entrada inválidos"));}
 @ExceptionHandler(AccessDeniedException.class) ResponseEntity<Map<String,String>> denied(){return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error","Acceso denegado"));}
 @ExceptionHandler(Exception.class) ResponseEntity<Map<String,String>> unexpected(Exception e){return ResponseEntity.status(500).body(Map.of("error","Error interno"));}
}
