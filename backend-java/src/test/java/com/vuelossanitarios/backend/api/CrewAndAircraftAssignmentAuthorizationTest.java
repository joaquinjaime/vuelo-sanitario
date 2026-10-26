package com.vuelossanitarios.backend.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vuelossanitarios.backend.api.dto.FlightDtos.Crew;
import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.security.*;
import com.vuelossanitarios.backend.service.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Matriz de autorización del servidor para tripulación adicional y asignación / cambio de aeronave. */
@WebMvcTest(controllers=FlightController.class)
@Import({SecurityConfig.class,JwtAuthenticationFilter.class})
class CrewAndAircraftAssignmentAuthorizationTest {
 @Autowired MockMvc mvc; @MockBean JwtService jwt; @MockBean UserRepository users; @MockBean FlightService flights; @MockBean CrewManagementService crewManagement; @MockBean com.vuelossanitarios.backend.service.CrewContactService crewContacts; @MockBean SanitaryRequestRegistrationService registration;
 private static final String CREW="{\"userId\":2,\"crewRoleCode\":\"MEDICO\"}",AIRCRAFT="{\"aircraftId\":9,\"motivo\":\"Mantenimiento\"}";
 private RequestPostProcessor as(String role){return SecurityMockMvcRequestPostProcessors.authentication(new UsernamePasswordAuthenticationToken(new CurrentUser(7L,"u"),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));}
 private void allowed(String role,boolean can,org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {mvc.perform(request.with(as(role)).contentType(MediaType.APPLICATION_JSON)).andExpect(can?status().is2xxSuccessful():status().isForbidden());}

 @Test void onlyOperationsManageTheAdditionalCrew() throws Exception {
  for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES")){
   allowed(role,true,post("/api/flights/1/crew").content(CREW));allowed(role,true,put("/api/flights/1/crew/5").content(CREW));allowed(role,true,delete("/api/flights/1/crew/5"));allowed(role,true,get("/api/flights/1/crew/candidates").param("role","MEDICO"));allowed(role,true,get("/api/flights/1/crew/available").param("role","MEDICO"));
  }
  for(String role:List.of("ADMINISTRADOR","COMANDANTE","DTS")){
   allowed(role,false,post("/api/flights/1/crew").content(CREW));allowed(role,false,put("/api/flights/1/crew/5").content(CREW));allowed(role,false,delete("/api/flights/1/crew/5"));allowed(role,false,get("/api/flights/1/crew/candidates").param("role","MEDICO"));allowed(role,false,get("/api/flights/1/crew/available").param("role","MEDICO"));
  }
  verify(crewManagement,times(2)).assign(eq(1L),any(Crew.class),eq(7L));verify(crewManagement,times(2)).replace(eq(1L),eq(5L),any(Crew.class),eq(7L));verify(flights,times(2)).removeCrew(1L,5L,7L);
 }
 @Test void crewCanBeReadByOperationsAndByTheCommanderButNotByDtsOrAdministrator() throws Exception {
  for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES","COMANDANTE")){allowed(role,true,get("/api/flights/1/crew"));allowed(role,true,get("/api/flights/1/crew").param("history","true"));}
  for(String role:List.of("DTS","ADMINISTRADOR")){allowed(role,false,get("/api/flights/1/crew"));allowed(role,false,get("/api/flights/1/crew").param("history","true"));}
  verify(flights,times(3)).crew(eq(1L),eq(7L),eq(true));verify(flights,times(3)).crew(eq(1L),eq(7L),eq(false));
 }
 @Test void onlyOperationsAssignOrChangeTheAircraftOfAFlight() throws Exception {
  for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES")){allowed(role,true,post("/api/flights/1/aircraft").content(AIRCRAFT));allowed(role,true,get("/api/flights/1/aircraft-candidates"));allowed(role,true,get("/api/flights/1/available-aircraft"));allowed(role,true,post("/api/flights/1/resources").content("{\"aircraftId\":9,\"comandanteId\":4}"));}
  for(String role:List.of("ADMINISTRADOR","COMANDANTE","DTS")){allowed(role,false,post("/api/flights/1/aircraft").content(AIRCRAFT));allowed(role,false,get("/api/flights/1/aircraft-candidates"));allowed(role,false,get("/api/flights/1/available-aircraft"));allowed(role,false,post("/api/flights/1/resources").content("{\"aircraftId\":9,\"comandanteId\":4}"));}
  verify(flights,times(2)).changeAircraft(eq(1L),any(),eq(7L));
 }
 @Test void invalidBodiesAreRejectedBeforeReachingTheService() throws Exception {
  mvc.perform(post("/api/flights/1/aircraft").with(as("OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/flights/1/crew").with(as("OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content("{\"userId\":2}")).andExpect(status().isBadRequest());
  verify(flights,never()).changeAircraft(any(),any(),any());verify(crewManagement,never()).assign(any(),any(),any());
 }
 @Test void unauthenticatedRequestsAreRejected() throws Exception {
  mvc.perform(get("/api/flights/1/crew")).andExpect(status().is4xxClientError());
  mvc.perform(post("/api/flights/1/aircraft").contentType(MediaType.APPLICATION_JSON).content(AIRCRAFT)).andExpect(status().is4xxClientError());
 }
}
