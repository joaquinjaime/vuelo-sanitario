package com.vuelossanitarios.backend.security;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.authorization.AuthorizationDecision;
@Configuration @EnableWebSecurity @EnableMethodSecurity public class SecurityConfig {
 @Bean PasswordEncoder passwordEncoder(){return new BCryptPasswordEncoder();}
 @Bean SecurityFilterChain security(HttpSecurity http, JwtAuthenticationFilter jwt) throws Exception { return http.csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).authorizeHttpRequests(a->a.requestMatchers("/api/auth/login","/api/auth/activar-cuenta","/actuator/health").permitAll().requestMatchers(HttpMethod.OPTIONS,"/**").permitAll().requestMatchers("/api/flights/**","/api/patients/**","/api/notifications/**","/api/documents/**","/api/document-versions/**","/api/final-reports/**","/api/catalogs/**","/api/audit/**").access((authentication, context) -> new AuthorizationDecision(authentication.get().getAuthorities().stream().noneMatch(x -> x.getAuthority().equals("ROLE_ADMINISTRADOR")))).anyRequest().authenticated()).addFilterBefore(jwt, UsernamePasswordAuthenticationFilter.class).build(); }
}
