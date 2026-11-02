package com.vuelossanitarios.backend.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vuelossanitarios.backend.api.dto.CommanderLocationDtos.CommanderLocationList;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.security.*;
import com.vuelossanitarios.backend.service.*;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Autorización del servidor para la asignación de comandante y aeronave, las excepciones geográficas y la ubicación operativa del comandante:
 * peticiones HTTP directas de cada rol, y cuerpos inválidos rechazados antes de llegar al servicio.
 */
@WebMvcTest(controllers={FlightController.class,CommanderLocationController.class})
@Import({SecurityConfig.class,JwtAuthenticationFilter.class,com.vuelossanitarios.backend.config.StrictJsonConfiguration.class})
class ResourceAssignmentAuthorizationTest {
 @Autowired MockMvc mvc; @MockBean JwtService jwt; @MockBean UserRepository users; @MockBean FlightService flights; @MockBean CrewManagementService crewManagement; @MockBean CrewContactService crewContacts; @MockBean SanitaryRequestRegistrationService registration; @MockBean CommanderLocationService locations;
 private static final String COMMANDER="{\"comandanteId\":4,\"excepcionGeografica\":{\"motivo\":\"No hay otro comandante habilitado en la provincia\"}}",AIRCRAFT="{\"aircraftId\":9}",LOCATION="{\"provinciaId\":1,\"localidadId\":2,\"motivo\":\"Reubicación\"}",LEGACY="{\"locationId\":1}";
 private RequestPostProcessor as(String role){return SecurityMockMvcRequestPostProcessors.authentication(new UsernamePasswordAuthenticationToken(new CurrentUser(7L,"u"),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));}
 private void allowed(String role,boolean can,MockHttpServletRequestBuilder request) throws Exception {mvc.perform(request.with(as(role)).contentType(MediaType.APPLICATION_JSON)).andExpect(can?status().is2xxSuccessful():status().isForbidden());}
 private void stubUser(String role){User u=new User();u.setId(7L);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));when(users.findWithRolesById(7L)).thenReturn(Optional.of(u));}

 @Test void onlyOperationsSelectTheCommanderAndTheAircraftOfARequest() throws Exception {
  for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES")){
   allowed(role,true,put("/api/flights/1/commander").content(COMMANDER));allowed(role,true,put("/api/flights/1/assigned-aircraft").content(AIRCRAFT));allowed(role,true,get("/api/flights/1/commander-candidates"));
  }
  for(String role:List.of("ADMINISTRADOR","COMANDANTE","DTS")){
   allowed(role,false,put("/api/flights/1/commander").content(COMMANDER));allowed(role,false,put("/api/flights/1/assigned-aircraft").content(AIRCRAFT));allowed(role,false,get("/api/flights/1/commander-candidates"));
  }
  verify(flights,times(2)).assignCommander(eq(1L),any(AssignCommander.class),eq(7L));verify(flights,times(2)).assignAircraft(eq(1L),any(AssignAircraft.class),eq(7L));verify(flights,times(2)).commanderCandidates(eq(1L),eq(7L),eq(""));
 }
 @Test void theGeographicExceptionTravelsOnlyInsideTheAssignmentRequestAndKeepsItsJustification() throws Exception {
  mvc.perform(put("/api/flights/1/commander").with(as("CENTRO_OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content(COMMANDER)).andExpect(status().isOk());
  var body=org.mockito.ArgumentCaptor.forClass(AssignCommander.class);verify(flights).assignCommander(eq(1L),body.capture(),eq(7L));
  org.junit.jupiter.api.Assertions.assertEquals(4L,body.getValue().comandanteId());org.junit.jupiter.api.Assertions.assertEquals("No hay otro comandante habilitado en la provincia",body.getValue().excepcionGeografica().motivo());
 }
 @Test void invalidAssignmentBodiesAreRejectedBeforeReachingTheService() throws Exception {
  for(String body:List.of("{}","{\"comandanteId\":4,\"excepcionGeografica\":{\"motivo\":\"corto\"}}","{\"comandanteId\":4,\"excepcionGeografica\":{\"motivo\":\"   \"}}"))
   mvc.perform(put("/api/flights/1/commander").with(as("CENTRO_OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
  mvc.perform(put("/api/flights/1/assigned-aircraft").with(as("CENTRO_OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/flights/1/resources").with(as("CENTRO_OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content("{\"aircraftId\":9,\"comandanteId\":4,\"excepcionGeografica\":{\"motivo\":\"corto\"}}")).andExpect(status().isBadRequest());
  verify(flights,never()).assignCommander(any(),any(),any());verify(flights,never()).assignAircraft(any(),any(),any());verify(flights,never()).assign(any(),any(),any());
 }
 @Test void theCombinedAssignmentKeepsItsAuthorizationAndAcceptsTheOldContract() throws Exception {
  allowed("CENTRO_OPERACIONES",true,post("/api/flights/1/resources").content("{\"aircraftId\":9,\"comandanteId\":4}"));
  for(String role:List.of("ADMINISTRADOR","COMANDANTE","DTS"))allowed(role,false,post("/api/flights/1/resources").content("{\"aircraftId\":9,\"comandanteId\":4}"));
  verify(flights).assign(eq(1L),any(AssignResources.class),eq(7L));
 }
 @Test void onlyAdministratorAndOperationsListAndSetTheOperationalLocationOfCommanders() throws Exception {
  when(locations.list(any(),any(),any(),any())).thenReturn(new CommanderLocationList(List.of(),false));when(locations.updateProvinceOnly(any(),any(),any())).thenReturn(new com.vuelossanitarios.backend.api.dto.CommanderLocationDtos.CommanderLocationRow(4L,"u","N","A","L",true,"ACTIVO",1L,"Tucumán",null,null,"SOLO_PROVINCIA",null,null));
  for(String role:List.of("ADMINISTRADOR","OPERACIONES","CENTRO_OPERACIONES")){
   allowed(role,true,get("/api/commanders/locations"));allowed(role,true,put("/api/commanders/4/location").content(LOCATION));allowed(role,true,post("/api/catalogs/commanders/4/location").content(LEGACY));
  }
  for(String role:List.of("COMANDANTE","DTS")){
   allowed(role,false,get("/api/commanders/locations"));allowed(role,false,put("/api/commanders/4/location").content(LOCATION));allowed(role,false,post("/api/catalogs/commanders/4/location").content(LEGACY));
  }
  verify(locations,times(3)).update(eq(4L),eq(1L),eq(2L),eq("Reubicación"),eq(7L));verify(locations,times(3)).updateProvinceOnly(4L,1L,7L);
 }
 @Test void aCommanderConsultsOnlyItsOwnLocationAndCannotChangeIt() throws Exception {
  stubUser("COMANDANTE");
  allowed("COMANDANTE",true,get("/api/commanders/7/location"));
  allowed("COMANDANTE",false,get("/api/commanders/8/location"));
  allowed("COMANDANTE",false,put("/api/commanders/7/location").content(LOCATION));
  verify(locations,never()).update(any(),any(),any(),any(),any());verify(locations).get(7L);verify(locations,never()).get(8L);
 }
 @Test void invalidLocationBodiesAreRejectedBeforeReachingTheService() throws Exception {
  for(String body:List.of("{}","{\"provinciaId\":1}","{\"localidadId\":2}","{\"provinciaId\":1,\"localidadId\":2,\"extra\":true}"))
   mvc.perform(put("/api/commanders/4/location").with(as("ADMINISTRADOR")).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
  verify(locations,never()).update(any(),any(),any(),any(),any());
 }
 @Test void unauthenticatedRequestsAreRejected() throws Exception {
  mvc.perform(put("/api/flights/1/commander").contentType(MediaType.APPLICATION_JSON).content(COMMANDER)).andExpect(status().is4xxClientError());
  mvc.perform(put("/api/commanders/4/location").contentType(MediaType.APPLICATION_JSON).content(LOCATION)).andExpect(status().is4xxClientError());
  mvc.perform(get("/api/commanders/locations")).andExpect(status().is4xxClientError());
 }
}
