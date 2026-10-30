package com.vuelossanitarios.backend.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.security.*;
import com.vuelossanitarios.backend.service.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Matriz de autorización del servidor para el módulo de documentos de vuelo (la pertenencia al vuelo se valida en el servicio). */
@WebMvcTest(controllers=DocumentController.class)
@Import({SecurityConfig.class,JwtAuthenticationFilter.class,com.vuelossanitarios.backend.config.StrictJsonConfiguration.class})
class DocumentAuthorizationTest {
 @Autowired MockMvc mvc; @MockBean JwtService jwt; @MockBean UserRepository users; @MockBean DocumentService documents;
 private static final List<String> READERS=List.of("DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE");
 private static final List<String> WRITERS=List.of("OPERACIONES","CENTRO_OPERACIONES","COMANDANTE");
 @org.junit.jupiter.api.BeforeEach void stubDownload(){when(documents.download(anyLong(),anyLong())).thenReturn(new DocumentService.Download("a.pdf","%PDF-1.7".getBytes()));}
 private RequestPostProcessor as(String role){return SecurityMockMvcRequestPostProcessors.authentication(new UsernamePasswordAuthenticationToken(new CurrentUser(7L,"u"),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));}
 private void expect(String role,boolean can,MockHttpServletRequestBuilder request) throws Exception {mvc.perform(request.with(as(role))).andExpect(can?status().is2xxSuccessful():status().isForbidden());}
 private MockHttpServletRequestBuilder create(){return multipart("/api/flights/1/documents/pdf").file(new MockMultipartFile("file","a.pdf","application/pdf","%PDF-1.7".getBytes())).param("documentTypeCode","AUTORIZACION").param("nombreDocumento","Doc");}
 private MockHttpServletRequestBuilder newVersion(){return multipart("/api/documents/3/versions/pdf").file(new MockMultipartFile("file","a.pdf","application/pdf","%PDF-1.7".getBytes()));}

 @Test void everyOperationalRoleButAdministratorCanConsultDocumentsAndDtsCannotChangeThem() throws Exception {
  for(String role:READERS){
   expect(role,true,get("/api/flights/1/documents"));expect(role,true,get("/api/documents/3/versions"));expect(role,true,get("/api/documents/3/lock"));expect(role,true,get("/api/document-versions/9/download"));
  }
  for(String role:WRITERS){
   expect(role,true,create());expect(role,true,newVersion());expect(role,true,post("/api/documents/3/lock"));expect(role,true,delete("/api/documents/3/lock"));
  }
  expect("DTS",false,create());expect("DTS",false,newVersion());expect("DTS",false,post("/api/documents/3/lock"));expect("DTS",false,delete("/api/documents/3/lock"));
 }

 private MockHttpServletRequestBuilder retire(String body){return post("/api/flights/1/documents/3/deactivate").contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body);}

 @Test void retirementRetiredListAndAllowedTypesAreForOperationsAndCommandersOnly() throws Exception {
  for(String role:WRITERS){
   expect(role,true,retire("{\"motivo\":\"Cargado por error\"}"));expect(role,true,get("/api/flights/1/documents/retired"));expect(role,true,get("/api/flights/1/documents/types"));
  }
  for(String role:List.of("DTS","ADMINISTRADOR")){
   expect(role,false,retire("{\"motivo\":\"Cargado por error\"}"));expect(role,false,get("/api/flights/1/documents/retired"));expect(role,false,get("/api/flights/1/documents/types"));
  }
  verify(documents,times(3)).deactivate(eq(1L),eq(3L),eq("Cargado por error"),eq(7L));
  mvc.perform(post("/api/flights/1/documents/3/deactivate")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/flights/1/documents/retired")).andExpect(status().isUnauthorized());
 }

 @Test void theRetirementBodyIsStrictAndRequired() throws Exception {
  mvc.perform(retire("{\"motivo\":\"x\",\"activo\":true}").with(as("OPERACIONES"))).andExpect(status().isBadRequest());
  mvc.perform(post("/api/flights/1/documents/3/deactivate").with(as("OPERACIONES")).contentType(org.springframework.http.MediaType.APPLICATION_JSON)).andExpect(status().isBadRequest());
  verify(documents,never()).deactivate(any(),any(),any(),any());
 }

 @Test void administratorHasNoAccessToFlightDocumentsAndAnonymousCallsAreRejected() throws Exception {
  expect("ADMINISTRADOR",false,get("/api/flights/1/documents"));expect("ADMINISTRADOR",false,get("/api/documents/3/versions"));expect("ADMINISTRADOR",false,get("/api/documents/3/lock"));
  expect("ADMINISTRADOR",false,get("/api/document-versions/9/download"));expect("ADMINISTRADOR",false,create());expect("ADMINISTRADOR",false,newVersion());expect("ADMINISTRADOR",false,post("/api/documents/3/lock"));
  mvc.perform(get("/api/flights/1/documents")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/document-versions/9/download")).andExpect(status().isUnauthorized());
  verifyNoInteractions(documents);
 }
}
