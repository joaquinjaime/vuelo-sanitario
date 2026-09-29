package com.vuelossanitarios.backend.api;
import org.springframework.http.HttpStatus;
import java.util.Map;
public class ApiException extends RuntimeException {
 private final HttpStatus status; private final String code; private final Map<String,Object> details;
 public ApiException(HttpStatus s, String m) { this(s,null,m,Map.of()); }
 public ApiException(HttpStatus s,String code,String m,Map<String,Object> details) { super(m); status=s;this.code=code;this.details=details==null?Map.of():Map.copyOf(details); }
 public HttpStatus status(){return status;} public String code(){return code;} public Map<String,Object> details(){return details;}
}
