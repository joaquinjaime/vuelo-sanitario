package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.repository.AccountActivationRepository;
import com.vuelossanitarios.backend.repository.RoleRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:activation;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver",
  "spring.datasource.username=sa",
  "spring.datasource.password=",
  "spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop",
  "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456",
  "app.bootstrap-admin.username=",
  "app.bootstrap-admin.password=",
  "app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class AccountActivationIntegrationTest {
 @Autowired MockMvc mvc;
 @Autowired AuthService auth;
 @Autowired RoleRepository roles;
 @Autowired UserRepository users;
 @Autowired AccountActivationRepository activations;
 @Autowired PasswordEncoder encoder;

 @BeforeEach void seedRole(){
  if(roles.findByCodigo("OPERACIONES").isEmpty()){
   Role role=new Role(); role.setCodigo("OPERACIONES"); role.setNombre("Centro de Operaciones"); roles.save(role);
  }
 }

 @Test void createdPendingAccountActivatesOverHttpAndCanThenLogIn() throws Exception {
  ActivationCodeResponse activation=auth.createPending(new CreatePendingUserRequest(
   "Ana","Pérez","30111222",null,null,Set.of("OPERACIONES"),
   List.of(new ContactRequest("ana@example.test","PERSONAL")),
   List.of(new PhoneRequest("3815555555","PERSONAL"))), null);

  String body="{\"dni\":\"30111222\",\"codigo\":\""+activation.codigo()+"\",\"username\":\"ana.operaciones\",\"password\":\"NuevaClave123\",\"confirmacionPassword\":\"NuevaClave123\"}";
  mvc.perform(post("/api/auth/activar-cuenta").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNoContent());

  var user=users.findWithRolesByUsername("ana.operaciones").orElseThrow();
  assertEquals("ACTIVO",user.getEstadoCuenta());
  assertTrue(encoder.matches("NuevaClave123",user.getPasswordHash()));
  assertTrue(activations.findOpenByDni("30111222").isEmpty());
  mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"ana.operaciones\",\"password\":\"NuevaClave123\"}"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isNotEmpty());
  mvc.perform(post("/api/auth/activar-cuenta").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("La cuenta ya está activada"));
 }
}
