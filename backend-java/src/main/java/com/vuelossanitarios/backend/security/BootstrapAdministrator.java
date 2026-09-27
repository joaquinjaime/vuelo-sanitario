package com.vuelossanitarios.backend.security;

import com.vuelossanitarios.backend.api.dto.AuthDtos.CreateUserRequest;
import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.Set;

@Configuration class BootstrapAdministrator {
 @Bean CommandLineRunner bootstrapAdmin(AuthService service, UserRepository users,
   @Value("${app.bootstrap-admin.username:}") String username,
   @Value("${app.bootstrap-admin.password:}") String password,
   @Value("${app.bootstrap-admin.email:}") String email) {
  return args -> { if(!username.isBlank()&&!password.isBlank()&&!email.isBlank()&&!users.existsByUsername(username))
   service.createUser(new CreateUserRequest(username,email,password,"Administrador","Inicial",null,null,null,null,Set.of("ADMINISTRADOR"))); };
 }
}
