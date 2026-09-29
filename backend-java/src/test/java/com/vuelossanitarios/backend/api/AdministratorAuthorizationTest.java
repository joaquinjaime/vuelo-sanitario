package com.vuelossanitarios.backend.api;

import com.vuelossanitarios.backend.security.*;
import com.vuelossanitarios.backend.service.*;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.domain.catalog.Locality;
import com.vuelossanitarios.backend.domain.catalog.Province;
import java.util.List;
import java.util.UUID;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@WebMvcTest(controllers={FlightController.class,PatientController.class,NotificationController.class,FinalReportController.class,DocumentController.class,CatalogController.class,AuthController.class})
@Import({SecurityConfig.class,JwtAuthenticationFilter.class})
class AdministratorAuthorizationTest {
 @Autowired MockMvc mvc; @MockBean JwtService jwt;
 @MockBean UserRepository users; @MockBean AuditService audit;
 @MockBean FlightService flights; @MockBean PatientService patients; @MockBean PatientRepository patientRepository; @MockBean NotificationService notifications; @MockBean FinalReportWorkflowService reports; @MockBean DocumentService documents; @MockBean AircraftRepository aircraft; @MockBean AirportRepository airports; @MockBean FlightPriorityRepository priorities; @MockBean ProvinceRepository provinces; @MockBean LocalityRepository localities; @MockBean CommanderProfileRepository commanderProfiles; @MockBean CancellationReasonRepository cancellationReasons; @MockBean AuthService auth;
 @Test @WithMockUser(roles="ADMINISTRADOR") void administratorIsForbiddenFromAllOperationalResources() throws Exception {
  mvc.perform(get("/api/flights")).andExpect(status().isForbidden());
  mvc.perform(get("/api/patients")).andExpect(status().isForbidden());
  mvc.perform(get("/api/notifications")).andExpect(status().isForbidden());
  mvc.perform(get("/api/final-reports/mine")).andExpect(status().isForbidden());
  mvc.perform(get("/api/auth/users/commanders")).andExpect(status().isForbidden());
  mvc.perform(get("/api/documents/00000000-0000-0000-0000-000000000001/versions")).andExpect(status().isForbidden());
  mvc.perform(get("/api/catalogs/aircraft")).andExpect(status().isForbidden());
 }
 @Test @WithMockUser(roles="ADMINISTRADOR") void administratorCanReachUserManagementEndpoint() throws Exception { mvc.perform(get("/api/auth/users")).andExpect(status().isOk()); }
 @Test @WithMockUser(roles={"COMANDANTE","OPERACIONES"}) void validOperationalMultiRoleKeepsOperationalAccess() throws Exception { mvc.perform(get("/api/final-reports/pending-review")).andExpect(status().isOk()); }
 @Test @WithMockUser(roles="CENTRO_OPERACIONES") void operationsCenterCanLoadCommandersForResourceAssignment() throws Exception { mvc.perform(get("/api/auth/users/commanders")).andExpect(status().isOk()); }
 @Test @WithMockUser(roles={"ADMINISTRADOR","CENTRO_OPERACIONES"}) void administratorWithOperationsKeepsOperationsAccess() throws Exception { mvc.perform(get("/api/final-reports/pending-review")).andExpect(status().isOk()); mvc.perform(get("/api/catalogs/aircraft")).andExpect(status().isOk()); }
 @Test @WithMockUser(roles={"ADMINISTRADOR","COMANDANTE"}) void administratorWithCommanderKeepsCommanderAccess() throws Exception { mvc.perform(get("/api/catalogs/aircraft")).andExpect(status().isOk()); }
 @Test void activationEndpointReturnsNoContentForTheFrontendClient() throws Exception {
  mvc.perform(post("/api/auth/activar-cuenta").contentType("application/json").content("{\"dni\":\"30111222\",\"codigo\":\"codigo\",\"username\":\"ana\",\"password\":\"NuevaClave123\",\"confirmacionPassword\":\"NuevaClave123\"}"))
   .andExpect(status().isNoContent()).andExpect(content().string(""));
 }
 @Test @WithMockUser(roles="DTS") void localitySearchReturnsActiveLocalitiesForTheRequestedProvince() throws Exception {
  UUID rioNegro=UUID.fromString("de23ca75-f451-4620-a4c8-e0a6b2b6b5d2"); Locality viedma=locality("Viedma","62007090","Río Negro");
  when(localities.findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(rioNegro,"Vie")).thenReturn(List.of(viedma));
  mvc.perform(get("/api/catalogs/localities").param("provinceId",rioNegro.toString()).param("q","Vie"))
   .andExpect(status().isOk()).andExpect(jsonPath("$[0].nombre").value("Viedma")).andExpect(jsonPath("$[0].provincia").value("Río Negro"));
  verify(localities).findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(eq(rioNegro),eq("Vie"));
 }
 @Test @WithMockUser(roles="DTS") void localitySearchPassesEmptyQueryAndRejectsAnInvalidProvinceUuid() throws Exception {
  UUID tucuman=UUID.randomUUID(); when(localities.findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(tucuman,"")).thenReturn(List.of());
  mvc.perform(get("/api/catalogs/localities").param("provinceId",tucuman.toString())).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
  verify(localities).findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(tucuman,"");
  mvc.perform(get("/api/catalogs/localities").param("provinceId","no-es-un-uuid").param("q","Vie")).andExpect(status().isBadRequest());
 }
 private Locality locality(String nombre,String codigo,String provinciaNombre){Province provincia=new Province();provincia.setId(UUID.randomUUID());provincia.setNombre(provinciaNombre);Locality localidad=new Locality();localidad.setId(UUID.randomUUID());localidad.setNombre(nombre);localidad.setCodigoOficial(codigo);localidad.setActivo(true);localidad.setProvincia(provincia);return localidad;}
}
