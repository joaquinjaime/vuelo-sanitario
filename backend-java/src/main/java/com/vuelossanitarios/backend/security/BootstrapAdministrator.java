package com.vuelossanitarios.backend.security;

import com.vuelossanitarios.backend.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration class BootstrapAdministrator {
 @Bean CommandLineRunner bootstrapAdmin(AuthService service,
   @Value("${app.bootstrap-admin.username:}") String username,
   @Value("${app.bootstrap-admin.password:}") String password,
   @Value("${app.bootstrap-admin.email:}") String email) {
  return args -> { if(!username.isBlank()&&!password.isBlank()&&!email.isBlank()) service.createBootstrapAdmin(username,password,email); };
 }
}
