package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.repository.AccountActivationRepository;
import com.vuelossanitarios.backend.repository.ProvinceRepository;
import com.vuelossanitarios.backend.repository.RoleRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.service.AuthService;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 @Autowired ProvinceRepository provinces;
 @Autowired UserRepository users;
 @Autowired AccountActivationRepository activations;
 @Autowired PasswordEncoder encoder;
 @Autowired ObjectMapper json;

 @BeforeEach void seedRole(){
  if(roles.findByCodigo("OPERACIONES").isEmpty()){
   Role role=new Role(); role.setCodigo("OPERACIONES"); role.setNombre("Centro de Operaciones"); roles.save(role);
  }
  if(roles.findByCodigo("ADMINISTRADOR").isEmpty()){
   Role role=new Role(); role.setCodigo("ADMINISTRADOR"); role.setNombre("Administrador"); roles.save(role);
  }
  if(roles.findByCodigo("DTS").isEmpty()){
   Role role=new Role(); role.setCodigo("DTS"); role.setNombre("DTS"); roles.save(role);
  }
 }

 @Test void administratorCreationEndpointReturnsOneTimeCodeAndOnlyItsHashIsPersisted() throws Exception {
  auth.createBootstrapAdmin("admin.http","ClaveAdmin123","admin.http@example.test");
  String token=auth.login(new LoginRequest("admin.http","ClaveAdmin123")).accessToken();
  String dni="47355303";
  String payload=json.writeValueAsString(new CreatePendingUserRequest("Ana","Pérez",dni,null,null,Set.of("OPERACIONES"),List.of(new ContactRequest("ana.http@example.test","PERSONAL")),List.of(new PhoneRequest("3815555555","PERSONAL"))));
  var result=mvc.perform(post("/api/auth/users").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(payload))
   .andExpect(status().isOk()).andExpect(jsonPath("$.codigo").isNotEmpty()).andExpect(jsonPath("$.expiraEn").value("24 horas")).andReturn();
  String code=json.readTree(result.getResponse().getContentAsString()).get("codigo").asText();
  var activation=activations.findOpenByDni(dni).getFirst();
  assertNotEquals(code,activation.getTokenHash());
  assertTrue(encoder.matches(code,activation.getTokenHash()));

  var user=users.findWithPersonByDni(dni).orElseThrow();
  var regenerated=mvc.perform(post("/api/auth/users/"+user.getId()+"/activation-code").header("Authorization","Bearer "+token))
   .andExpect(status().isOk()).andExpect(jsonPath("$.codigo").isNotEmpty()).andReturn();
  String nextCode=json.readTree(regenerated.getResponse().getContentAsString()).get("codigo").asText();
  var nextActivation=activations.findOpenByDni(dni).getFirst();
  assertNotEquals(code,nextCode);
  assertNotEquals(nextCode,nextActivation.getTokenHash());
  assertTrue(encoder.matches(nextCode,nextActivation.getTokenHash()));
  String activationPayload=json.writeValueAsString(new ActivateAccountRequest(dni,nextCode,"ana.http","NuevaClave123","NuevaClave123"));
  mvc.perform(post("/api/auth/activar-cuenta").contentType(MediaType.APPLICATION_JSON).content(activationPayload)).andExpect(status().isNoContent());
 }

 @Test void administratorCanCreateTwoPendingAccountsWithoutUsernamesOverHttp() throws Exception {
  auth.createBootstrapAdmin("admin.http","ClaveAdmin123","admin.http@example.test");
  String token=auth.login(new LoginRequest("admin.http","ClaveAdmin123")).accessToken();
  for(String dni:List.of("47355304","47355305")){
   String payload=json.writeValueAsString(new CreatePendingUserRequest("Prueba","Pendiente",dni,null,null,Set.of("OPERACIONES"),List.of(new ContactRequest("pending."+dni+"@example.test","PERSONAL")),List.of(new PhoneRequest("3815555555","PERSONAL"))));
   mvc.perform(post("/api/auth/users").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(payload))
    .andExpect(status().isOk()).andExpect(jsonPath("$.codigo").isNotEmpty());
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

 @Test void loginTokenAuthenticatesTheAuthenticatedUserAtMeEndpoint() throws Exception {
  String dni = "30" + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
  ActivationCodeResponse activation = auth.createPending(new CreatePendingUserRequest(
   "Usuario", "JWT", dni, null, null, Set.of("OPERACIONES"),
   List.of(new ContactRequest("jwt." + dni + "@example.test", "PERSONAL")),
   List.of(new PhoneRequest("3815555555", "PERSONAL"))), null);
  String username = "jwt." + dni;
  mvc.perform(post("/api/auth/activar-cuenta")
    .contentType(MediaType.APPLICATION_JSON)
    .content(json.writeValueAsString(new ActivateAccountRequest(dni, activation.codigo(), username, "ClaveJWT1234", "ClaveJWT1234"))))
   .andExpect(status().isNoContent());
  var login = mvc.perform(post("/api/auth/login")
    .contentType(MediaType.APPLICATION_JSON)
    .content(json.writeValueAsString(new LoginRequest(username, "ClaveJWT1234"))))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.accessToken").isNotEmpty())
   .andReturn();
  String accessToken = json.readTree(login.getResponse().getContentAsString()).get("accessToken").asText();

  mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + accessToken))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.username").value(username))
   .andExpect(jsonPath("$.roles[0]").value("OPERACIONES"));
 }

 @Test void temporaryPasswordTokenStillAuthenticatesAtMeEndpoint() throws Exception {
  String dni = "31" + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
  ActivationCodeResponse activation = auth.createPending(new CreatePendingUserRequest(
   "Usuario", "Temporal", dni, null, null, Set.of("OPERACIONES"),
   List.of(new ContactRequest("temporary." + dni + "@example.test", "PERSONAL")),
   List.of(new PhoneRequest("3815555555", "PERSONAL"))), null);
  String username = "temporary." + dni;
  mvc.perform(post("/api/auth/activar-cuenta")
    .contentType(MediaType.APPLICATION_JSON)
    .content(json.writeValueAsString(new ActivateAccountRequest(dni, activation.codigo(), username, "ClaveJWT1234", "ClaveJWT1234"))))
   .andExpect(status().isNoContent());
  auth.setTemporaryPassword(users.findWithRolesByUsername(username).orElseThrow().getId(), new TemporaryPasswordRequest("TemporalJWT12"));
  var login = mvc.perform(post("/api/auth/login")
    .contentType(MediaType.APPLICATION_JSON)
    .content(json.writeValueAsString(new LoginRequest(username, "TemporalJWT12"))))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.debeCambiarContrasena").value(true))
   .andReturn();
  String accessToken = json.readTree(login.getResponse().getContentAsString()).get("accessToken").asText();

  mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + accessToken))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.username").value(username));
 }

 @Test void dtsLoginTokenCanLoadAllTwentyFourProvinces() throws Exception {
  for(int i=1;i<=24;i++){ Province province=new Province(); province.setCodigoOficial("T"+i); province.setNombre("Provincia "+i); provinces.save(province); }
  String dni = "32" + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
  ActivationCodeResponse activation = auth.createPending(new CreatePendingUserRequest(
   "Usuario", "DTS", dni, null, null, Set.of("DTS"),
   List.of(new ContactRequest("dts." + dni + "@example.test", "PERSONAL")),
   List.of(new PhoneRequest("3815555555", "PERSONAL"))), null);
  String username = "dts." + dni;
  mvc.perform(post("/api/auth/activar-cuenta").contentType(MediaType.APPLICATION_JSON)
    .content(json.writeValueAsString(new ActivateAccountRequest(dni, activation.codigo(), username, "ClaveJWT1234", "ClaveJWT1234"))))
   .andExpect(status().isNoContent());
  var login = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
    .content(json.writeValueAsString(new LoginRequest(username, "ClaveJWT1234"))))
   .andExpect(status().isOk()).andReturn();
  String accessToken = json.readTree(login.getResponse().getContentAsString()).get("accessToken").asText();

  mvc.perform(get("/api/catalogs/provinces").header("Authorization", "Bearer " + accessToken))
   .andExpect(status().isOk())
   .andExpect(jsonPath("$.length()").value(24));
 }
}
