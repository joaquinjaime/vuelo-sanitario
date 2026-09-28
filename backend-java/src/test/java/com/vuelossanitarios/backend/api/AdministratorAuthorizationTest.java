package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.security.*;
import com.vuelossanitarios.backend.service.*;
import com.vuelossanitarios.backend.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;

@WebMvcTest(controllers={FlightController.class,PatientController.class,NotificationController.class,FinalReportController.class,DocumentController.class,CatalogController.class,AuthController.class})
@Import({SecurityConfig.class,JwtAuthenticationFilter.class})
class AdministratorAuthorizationTest {
 @Autowired MockMvc mvc; @MockBean JwtService jwt;
 @MockBean FlightService flights; @MockBean PatientService patients; @MockBean PatientRepository patientRepository; @MockBean NotificationService notifications; @MockBean FinalReportWorkflowService reports; @MockBean DocumentService documents; @MockBean AircraftRepository aircraft; @MockBean AirportRepository airports; @MockBean FlightPriorityRepository priorities; @MockBean AuthService auth;
 @Test @WithMockUser(roles="ADMINISTRADOR") void administratorIsForbiddenFromAllOperationalResources() throws Exception {
  mvc.perform(get("/api/flights")).andExpect(status().isForbidden());
  mvc.perform(get("/api/patients")).andExpect(status().isForbidden());
  mvc.perform(get("/api/notifications")).andExpect(status().isForbidden());
  mvc.perform(get("/api/final-reports/mine")).andExpect(status().isForbidden());
  mvc.perform(get("/api/documents/00000000-0000-0000-0000-000000000001/versions")).andExpect(status().isForbidden());
  mvc.perform(get("/api/catalogs/aircraft")).andExpect(status().isForbidden());
 }
 @Test @WithMockUser(roles="ADMINISTRADOR") void administratorCanReachUserManagementEndpoint() throws Exception { mvc.perform(get("/api/auth/users")).andExpect(status().isOk()); }
 @Test @WithMockUser(roles={"COMANDANTE","OPERACIONES"}) void validOperationalMultiRoleKeepsOperationalAccess() throws Exception { mvc.perform(get("/api/final-reports/pending-review")).andExpect(status().isOk()); }
 @Test @WithMockUser(roles={"ADMINISTRADOR","CENTRO_OPERACIONES"}) void administratorWithOperationsKeepsOperationsAccess() throws Exception { mvc.perform(get("/api/final-reports/pending-review")).andExpect(status().isOk()); mvc.perform(get("/api/catalogs/aircraft")).andExpect(status().isOk()); }
 @Test @WithMockUser(roles={"ADMINISTRADOR","COMANDANTE"}) void administratorWithCommanderKeepsCommanderAccess() throws Exception { mvc.perform(get("/api/catalogs/aircraft")).andExpect(status().isOk()); }
 @Test void activationEndpointReturnsNoContentForTheFrontendClient() throws Exception {
  mvc.perform(post("/api/auth/activar-cuenta").contentType("application/json").content("{\"dni\":\"30111222\",\"codigo\":\"codigo\",\"username\":\"ana\",\"password\":\"NuevaClave123\",\"confirmacionPassword\":\"NuevaClave123\"}"))
   .andExpect(status().isNoContent()).andExpect(content().string(""));
 }
}
