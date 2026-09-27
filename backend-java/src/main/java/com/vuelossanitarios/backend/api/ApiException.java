package com.vuelossanitarios.backend.api;
import org.springframework.http.HttpStatus;
public class ApiException extends RuntimeException { private final HttpStatus status; public ApiException(HttpStatus s, String m) { super(m); status=s; } public HttpStatus status(){return status;} }
