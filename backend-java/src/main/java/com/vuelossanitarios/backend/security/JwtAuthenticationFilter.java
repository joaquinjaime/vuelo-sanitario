package com.vuelossanitarios.backend.security;
import io.jsonwebtoken.Claims;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.*;
@Component public class JwtAuthenticationFilter extends OncePerRequestFilter {
 private final JwtService jwt; public JwtAuthenticationFilter(JwtService j){jwt=j;}
 @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws ServletException,IOException {
  String header=req.getHeader("Authorization");
  if(header!=null&&header.startsWith("Bearer ")&&SecurityContextHolder.getContext().getAuthentication()==null) try {
   Claims c=jwt.parse(header.substring(7)); String username=c.get("username",String.class); UUID id=UUID.fromString(c.getSubject()); boolean passwordChangeRequired=Boolean.TRUE.equals(c.get("passwordChangeRequired",Boolean.class));
   List<?> roles=c.get("roles",List.class); var authorities=roles==null?List.<SimpleGrantedAuthority>of():roles.stream().map(Object::toString).map(r->new SimpleGrantedAuthority("ROLE_"+r)).toList();
   if(passwordChangeRequired && !"/api/auth/me/password".equals(req.getRequestURI())) { res.sendError(HttpServletResponse.SC_FORBIDDEN,"Debe cambiar la contraseña temporal"); return; }
   SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new CurrentUser(id,username,passwordChangeRequired),null,authorities));
  } catch (Exception ignored) { SecurityContextHolder.clearContext(); }
  chain.doFilter(req,res);
 }
}
