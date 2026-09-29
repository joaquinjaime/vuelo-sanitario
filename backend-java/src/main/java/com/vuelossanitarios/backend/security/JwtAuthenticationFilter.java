package com.vuelossanitarios.backend.security;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.UserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.*;
@Component public class JwtAuthenticationFilter extends OncePerRequestFilter {
 private static final Logger log=LoggerFactory.getLogger(JwtAuthenticationFilter.class);
 private final JwtService jwt; private final UserRepository users;
 public JwtAuthenticationFilter(JwtService j,UserRepository u){jwt=j;users=u;}
 @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws ServletException,IOException {
  String header=req.getHeader("Authorization");
  if(header!=null&&header.startsWith("Bearer ")&&SecurityContextHolder.getContext().getAuthentication()==null) try {
   Claims c=jwt.parse(header.substring(7)); String username=c.get("username",String.class); UUID id=UUID.fromString(c.getSubject());
   if(username==null||username.isBlank())throw new IllegalArgumentException("JWT sin username");
   User user=users.findWithRolesByUsername(username).orElseThrow(()->new IllegalArgumentException("Usuario JWT inexistente"));
   Long tokenVersion=c.get("credentialVersion",Long.class);
   if(!id.equals(user.getId())||!Boolean.TRUE.equals(user.getActivo())||!"ACTIVO".equals(user.getEstadoCuenta())||tokenVersion==null||!tokenVersion.equals(user.getVersionCredenciales()))throw new IllegalArgumentException("Usuario JWT no habilitado o credenciales invalidadas");
   boolean passwordChangeRequired=Boolean.TRUE.equals(user.getDebeCambiarContrasena());
   var authorities=user.getUserRoles().stream().filter(r->Boolean.TRUE.equals(r.getRole().getActivo())).map(r->new SimpleGrantedAuthority("ROLE_"+r.getRole().getCodigo())).toList();
   SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new CurrentUser(id,user.getUsername(),passwordChangeRequired),null,authorities));
   if(passwordChangeRequired&&!allowsPasswordChangeOnlyAccess(req)) { res.sendError(HttpServletResponse.SC_FORBIDDEN,"Debe cambiar la contraseña temporal"); return; }
  } catch (Exception e) { SecurityContextHolder.clearContext(); log.debug("JWT rechazado para {}: {}",req.getRequestURI(),e.getClass().getSimpleName()); }
  chain.doFilter(req,res);
 }
 private boolean allowsPasswordChangeOnlyAccess(HttpServletRequest req){return ("GET".equals(req.getMethod())&&"/api/auth/me".equals(req.getRequestURI()))||"/api/auth/me/password".equals(req.getRequestURI());}
}
