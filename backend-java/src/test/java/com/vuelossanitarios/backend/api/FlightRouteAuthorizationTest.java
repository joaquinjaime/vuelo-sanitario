package com.vuelossanitarios.backend.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.security.*;
import com.vuelossanitarios.backend.service.FlightRouteService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Matriz de autorización del servidor para la ruta del vuelo: quién planifica, quién presenta, quién decide y quién sólo consulta. */
@WebMvcTest(controllers={FlightRouteController.class,FlightRouteStatusController.class})
@Import({SecurityConfig.class,JwtAuthenticationFilter.class,com.vuelossanitarios.backend.config.StrictJsonConfiguration.class})
class FlightRouteAuthorizationTest {
 @Autowired MockMvc mvc; @MockBean JwtService jwt; @MockBean UserRepository users; @MockBean FlightRouteService service;
 static final String SAVE="{\"version\":0,\"recorrido\":\"Directo\"}",SUBMIT="{\"version\":1}",APPROVE="{\"version\":1,\"comentario\":\"Conforme\"}",RETURN="{\"version\":1,\"motivo\":\"Falta el alternativo\"}";
 private RequestPostProcessor as(String role){return SecurityMockMvcRequestPostProcessors.authentication(new UsernamePasswordAuthenticationToken(new CurrentUser(7L,"u"),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));}
 private void check(String role,boolean can,MockHttpServletRequestBuilder request) throws Exception {mvc.perform(request.with(as(role)).contentType(MediaType.APPLICATION_JSON)).andExpect(can?status().is2xxSuccessful():status().isForbidden());}

 @Test void onlyTheCommanderPlansAndSubmitsTheRoute() throws Exception {
  check("COMANDANTE",true,put("/api/flights/1/route").content(SAVE));check("COMANDANTE",true,post("/api/flights/1/route/submit").content(SUBMIT));
  for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES","DTS","ADMINISTRADOR")){check(role,false,put("/api/flights/1/route").content(SAVE));check(role,false,post("/api/flights/1/route/submit").content(SUBMIT));}
  verify(service).save(eq(1L),eq(7L),any());verify(service).submit(eq(1L),eq(7L),any());
 }
 @Test void onlyOperationsApproveOrReturnTheRouteNeverTheCommanderTheDtsOrTheAdministrator() throws Exception {
  for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES")){check(role,true,post("/api/flights/1/route/approve").content(APPROVE));check(role,true,post("/api/flights/1/route/return").content(RETURN));}
  for(String role:List.of("COMANDANTE","DTS","ADMINISTRADOR")){check(role,false,post("/api/flights/1/route/approve").content(APPROVE));check(role,false,post("/api/flights/1/route/return").content(RETURN));}
  verify(service,times(2)).approve(eq(1L),eq(7L),any());verify(service,times(2)).sendBack(eq(1L),eq(7L),any());
 }
 @Test void everyAuthenticatedProfileMayReadButTheServiceDecidesWhatItSeesAndAnonymousIsRejected() throws Exception {
  for(String role:List.of("DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE","ADMINISTRADOR"))check(role,true,get("/api/flights/1/route"));
  verify(service,times(5)).get(1L,7L);
  mvc.perform(get("/api/flights/1/route")).andExpect(status().is4xxClientError());
  mvc.perform(post("/api/flights/1/route/approve").contentType(MediaType.APPLICATION_JSON).content(APPROVE)).andExpect(status().is4xxClientError());
 }
 @Test void theReviewQueueIsForOperationsAndTheAdministratorOnly() throws Exception {
  for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES","ADMINISTRADOR"))check(role,true,get("/api/flights/route-statuses"));
  for(String role:List.of("COMANDANTE","DTS"))check(role,false,get("/api/flights/route-statuses"));
 }
 @Test void unknownOrMalformedFieldsAreRejectedBeforeTheService() throws Exception {
  mvc.perform(post("/api/flights/1/route/approve").with(as("OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content("{\"version\":1,\"estado\":\"APROBADA\"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Campo no admitido: estado"));
  mvc.perform(post("/api/flights/1/route/approve").with(as("OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
  mvc.perform(put("/api/flights/1/route").with(as("COMANDANTE")).contentType(MediaType.APPLICATION_JSON).content("{\"version\":0,\"recorrido\":\"Directo\",\"estadoRevision\":\"APROBADA\"}")).andExpect(status().isBadRequest());
  mvc.perform(put("/api/flights/1/route").with(as("COMANDANTE")).contentType(MediaType.APPLICATION_JSON).content("{\"version\":0,\"recorrido\":\"Directo\",\"altitudPies\":-1}")).andExpect(status().isBadRequest());
  verify(service,never()).approve(any(),any(),any());verify(service,never()).save(any(),any(),any());
 }
 @Test void businessErrorsReachTheClientWithTheirCodeAndDetails() throws Exception {
  when(service.approve(eq(1L),eq(7L),any())).thenThrow(new ApiException(HttpStatus.CONFLICT,"VERSION_RUTA_DESACTUALIZADA","La ruta cambió",Map.of("rutaVersion",3)));
  mvc.perform(post("/api/flights/1/route/approve").with(as("OPERACIONES")).contentType(MediaType.APPLICATION_JSON).content(APPROVE)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERSION_RUTA_DESACTUALIZADA")).andExpect(jsonPath("$.rutaVersion").value(3)).andExpect(jsonPath("$.error").value("La ruta cambió"));
 }
}
