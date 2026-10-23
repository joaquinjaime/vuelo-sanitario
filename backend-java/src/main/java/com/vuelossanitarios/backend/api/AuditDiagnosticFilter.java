package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.service.AuditDiagnostics;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Adds a random correlation id to audit requests; detailed timings are opt-in. */
@Component
public class AuditDiagnosticFilter extends OncePerRequestFilter {
 private static final Logger log=LoggerFactory.getLogger(AuditDiagnosticFilter.class);
 @Value("${app.audit-diagnostics.enabled:false}") private boolean enabled;
 @Override protected boolean shouldNotFilter(HttpServletRequest request){String path=request.getContextPath()+"/api/audit",uri=request.getRequestURI();return !uri.equals(path)&&!uri.startsWith(path+"/");}
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
  AuditDiagnostics.Context c=AuditDiagnostics.begin(enabled);response.setHeader("X-Diagnostic-Id",c.id());long start=System.nanoTime();
  try{chain.doFilter(request,response);}finally{long total=System.nanoTime()-start;if(enabled)log.info("audit_request diagnostic_id={} method={} status={} http_total_ms={} {}",c.id(),request.getMethod(),response.getStatus(),String.format(java.util.Locale.ROOT,"%.3f",total/1_000_000d),c.measurements());else log.debug("audit_request diagnostic_id={} method={} status={}",c.id(),request.getMethod(),response.getStatus());AuditDiagnostics.clear();}
 }
}
