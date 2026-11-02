package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.service.DocumentScheduleGate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Bloqueo documental hasta acordar el horario, de punta a punta sobre HTTP con JWT, seguridad, reglas de negociación y persistencia reales (H2):
 * solicitud del DTS, bandeja de Operaciones, contrapropuesta pendiente, aceptación del DTS, permisos y reapertura de la negociación.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:sanitarydocumentgate;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false","app.storage.documents-directory=target/test-sanitary-document-gate",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class SanitaryDocumentGateIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles;
 @Autowired ProvinceRepository provinces; @Autowired LocalityRepository localities; @Autowired FlightPriorityRepository priorities; @Autowired FlightTypeRepository types;
 @Autowired SanitaryRequestStatusRepository requestStatuses; @Autowired FlightRepository flights; @Autowired SanitaryFlightRepository sanitaryFlights;
 @Autowired DocumentTypeRepository documentTypes; @Autowired DocumentItemRepository items; @Autowired FlightDocumentRepository versions;
 @Autowired FlightScheduleNegotiationRepository negotiations;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";
 private static Long originId,destinationId;
 private record Account(long userId,String token){}
 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private Account account(String name,String roleCode) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Puerta");p.setDni(String.valueOf(64000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);userRoles.save(new UserRole(u,role(roleCode)));
  String token=JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+u.getUsername()+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
  return new Account(u.getId(),token);
 }
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON);
  if(token!=null)b=b.header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private ResultActions upload(String path,String token,String... fields) throws Exception {
  var b=MockMvcRequestBuilders.multipart(path).file(new MockMultipartFile("file","parte.pdf","application/pdf","%PDF-1.7".getBytes())).header("Authorization","Bearer "+token);
  for(int i=0;i<fields.length;i+=2)b.param(fields[i],fields[i+1]);
  return mvc.perform(b);
 }
 private String requestJson(){
  return "{\"patient\":{\"nombre\":\"Pablo\",\"apellido\":\"Paciente\",\"dni\":\""+(42000000+(++seq))+"\"},\"identidadConfirmada\":true,\"localidadOrigenId\":"+originId+",\"localidadDestinoId\":"+destinationId+",\"priorityCode\":\"ALTA\",\"motivoVuelo\":\"Traslado de prueba\","
   +"\"fechaSolicitada\":\""+LocalDateTime.now().plusDays(10).withNano(0)+"\",\"extremaUrgencia\":false,\"medical\":{\"diagnostico\":\"Control\",\"condicionMedica\":\"ESTABLE\",\"requiereEquipamientoEspecial\":false}}";
 }
 private long newRequest(Account dts) throws Exception {
  return ((Number)JsonPath.read(call("POST","/api/flights/with-patient",dts.token(),requestJson()).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
 }
 private void state(long flightId,String code){tx(()->{SanitaryFlight s=sanitaryFlights.findByFlightId(flightId).orElseThrow();s.setEstadoSolicitud(requestStatuses.findByCodigo(code).orElseThrow());return sanitaryFlights.saveAndFlush(s);});}
 private String stateOf(long flightId){return tx(()->sanitaryFlights.findByFlightId(flightId).orElseThrow().getEstadoSolicitud().getCodigo());}
 /** Documento cargado antes de existir la regla (o en otro momento): se inserta directo para comprobar que el bloqueo no lo altera. */
 private long legacyDocument(long flightId,long authorId){return tx(()->{
  FlightDocumentItem item=new FlightDocumentItem();item.setFlight(flights.findById(flightId).orElseThrow());item.setDocumentType(documentTypes.findByCodigo("AUTORIZACION").orElseThrow());item.setNombreDocumento("Documento previo");items.saveAndFlush(item);
  FlightDocument v=new FlightDocument();v.setDocumentItem(item);v.setNumeroVersion(1);v.setEsVersionActual(true);v.setNombreArchivoOriginal("previo.pdf");v.setUbicacionAlmacenamiento("inexistente.pdf");v.setTamanioBytes(8L);v.setCreadoPor(users.findById(authorId).orElseThrow());versions.saveAndFlush(v);
  return item.getId();});}
 private void assertLocked(ResultActions r,String pendingParty) throws Exception {
  r.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(DocumentScheduleGate.LOCKED_CODE)).andExpect(jsonPath("$.error").value(DocumentScheduleGate.MESSAGE)).andExpect(jsonPath("$.pendientePor").value(pendingParty));
 }
 private void assertEveryDocumentOperationLocked(long flight,long item,long version,Account ops,String pendingParty) throws Exception {
  String f="/api/flights/"+flight;
  assertLocked(call("GET",f+"/documents",ops.token(),null),pendingParty);
  assertLocked(call("GET",f+"/documents/types",ops.token(),null),pendingParty);
  assertLocked(call("GET",f+"/documents/retired",ops.token(),null),pendingParty);
  assertLocked(upload(f+"/documents/pdf",ops.token(),"documentTypeCode","AUTORIZACION","nombreDocumento","Nuevo"),pendingParty);
  assertLocked(upload("/api/documents/"+item+"/versions/pdf",ops.token()),pendingParty);
  assertLocked(call("GET","/api/documents/"+item+"/versions",ops.token(),null),pendingParty);
  assertLocked(call("GET","/api/documents/"+item+"/lock",ops.token(),null),pendingParty);
  assertLocked(call("POST","/api/documents/"+item+"/lock",ops.token(),null),pendingParty);
  assertLocked(call("GET","/api/document-versions/"+version+"/download",ops.token(),null),pendingParty);
  assertLocked(call("POST",f+"/documents/"+item+"/deactivate",ops.token(),"{\"motivo\":\"Prueba\"}"),pendingParty);
 }


 /** Las gestiones de etapas posteriores (hangar, coordinaciones, bitácora manual) se rechazan con 409 mientras la negociación sigue abierta y no dejan registros. */
 private void assertPreparationLocked(long flight,Account ops,String pendingParty) throws Exception {
  String hangar="{\"version\":0,\"requiereHangar\":true,\"preparacionCompleta\":false,\"observaciones\":\"Prueba\"}";
  String coordination="{\"version\":0,\"aeropuertoId\":1,\"finalidad\":\"Despegue\",\"descripcion\":\"Prueba\",\"estado\":\"PENDIENTE\"}";
  String log="{\"tipo\":\"PREPARACION\",\"descripcion\":\"Prueba\",\"ocurrido\":\""+java.time.OffsetDateTime.now().minusMinutes(1)+"\",\"importancia\":\"NORMAL\"}";
  for(ResultActions r:List.of(call("PUT","/api/flights/"+flight+"/hangar",ops.token(),hangar),call("POST","/api/flights/"+flight+"/airport-coordinations",ops.token(),coordination),call("POST","/api/flights/"+flight+"/log",ops.token(),log)))
   r.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SCHEDULE_NOT_AGREED")).andExpect(jsonPath("$.pendientePor").value(pendingParty)).andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("horario de salida esté acordado")));
 }

 @BeforeEach void seed(){
  for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);
  if(originId==null){
   Province pr=new Province();pr.setCodigoOficial("G1");pr.setNombre("Provincia de prueba");pr.setActivo(true);provinces.save(pr);
   Locality a=new Locality();a.setCodigoOficial("GL1");a.setNombre("Origen");a.setProvincia(pr);a.setActivo(true);localities.save(a);
   Locality b=new Locality();b.setCodigoOficial("GL2");b.setNombre("Destino");b.setProvincia(pr);b.setActivo(true);localities.save(b);
   originId=a.getId();destinationId=b.getId();
   FlightPriority p=new FlightPriority();p.setCodigo("ALTA");p.setNombre("Alta");p.setActivo(true);p.setOrden((short)1);priorities.save(p);
   FlightType t=new FlightType();t.setCodigo("SANITARIO");t.setNombre("Sanitario");types.save(t);
   short order=1;for(String code:List.of("SOLICITADO","PENDIENTE_RESPUESTA_DTS","APROBADO","RECHAZADO","CANCELADO")){SanitaryRequestStatus s=new SanitaryRequestStatus();s.setCodigo(code);s.setNombre(code);s.setOrden(order++);requestStatuses.save(s);}
   DocumentType d=new DocumentType();d.setCodigo("AUTORIZACION");d.setNombre("Autorización de vuelo");documentTypes.save(d);
  }
 }

 @Test void theDocumentsOfASanitaryFlightStayLockedUntilBothPartiesAgreeTheScheduleAndThenFollowTheNormalPermissions() throws Exception {
  Account dts=account("Dora","DTS"),otherDts=account("Otra","DTS"),ops=account("Omar","CENTRO_OPERACIONES"),cmd=account("Carlos","COMANDANTE"),admin=account("Admin","ADMINISTRADOR");

  // A. Nueva solicitud: persistida, localizable por Operaciones en su bandeja y con la fecha de recepción real.
  long flight=newRequest(dts);
  assertEquals("SOLICITADO",stateOf(flight));
  call("GET","/api/flights",ops.token(),null).andExpect(status().isOk())
   .andExpect(jsonPath("$[?(@.id=="+flight+")].datosSanitarios.estadoSolicitud").value("SOLICITADO"))
   .andExpect(jsonPath("$[?(@.id=="+flight+")].datosSanitarios.extremaUrgencia").value(false))
   .andExpect(jsonPath("$[?(@.id=="+flight+")].datosSanitarios.fechaRecepcion").isNotEmpty())
   .andExpect(jsonPath("$[?(@.id=="+flight+")].datosSanitarios.fechaSolicitada").isNotEmpty());

  // B. Sin acuerdo: ninguna operación documental, ni siquiera sobre un documento anterior, y no se altera nada.
  long item=legacyDocument(flight,ops.userId()),version=tx(()->versions.findByDocumentItemIdAndEsVersionActualTrue(item).orElseThrow().getId());
  call("GET","/api/flights/"+flight+"/documents/access",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.disponible").value(false)).andExpect(jsonPath("$.estadoSolicitud").value("SOLICITADO")).andExpect(jsonPath("$.pendientePor").value("OPERACIONES"));
  assertEveryDocumentOperationLocked(flight,item,version,ops,"OPERACIONES");
  assertLocked(call("GET","/api/flights/"+flight+"/documents",dts.token(),null),"OPERACIONES"); // el solicitante tampoco ve documentos antes del acuerdo
  assertPreparationLocked(flight,ops,"OPERACIONES");
  call("GET","/api/flights/"+flight+"/hangar",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.puedeGestionar").value(false));
  assertEquals(1,items.findByFlightIdAndActivoTrueOrderByCreatedAtDesc(flight).size(),"el documento previo se conserva"); assertEquals(1L,versions.countByDocumentItemId(item));

  // C. Propuesta pendiente: Operaciones propuso otro horario y el DTS todavía no respondió.
  String proposed=LocalDateTime.now().plusDays(12).withNano(0).toString();
  call("POST","/api/flights/"+flight+"/schedule/counterproposal",ops.token(),"{\"salida\":\""+proposed+"\",\"motivo\":\"Aeronave disponible ese día\"}").andExpect(status().isOk());
  assertEquals("PENDIENTE_RESPUESTA_DTS",stateOf(flight));
  call("GET","/api/flights/"+flight+"/documents/access",ops.token(),null).andExpect(jsonPath("$.disponible").value(false)).andExpect(jsonPath("$.pendientePor").value("DTS"));
  assertEveryDocumentOperationLocked(flight,item,version,ops,"DTS");
  assertPreparationLocked(flight,ops,"DTS");
  // Lo propuesto no es un acuerdo aunque ya haya fecha: el DTS tampoco puede saltarse la espera ni cargar documentos (rol).
  upload("/api/flights/"+flight+"/documents/pdf",dts.token(),"documentTypeCode","AUTORIZACION","nombreDocumento","Del DTS").andExpect(status().isForbidden());

  // D. El DTS acepta: queda registrado el acuerdo y la gestión documental se habilita con las validaciones de siempre.
  long proposalId=tx(()->negotiations.findByFlightIdOrderByFechaOcurrenciaAscIdAsc(flight).stream().filter(n->"CO_CONTRAPROPUESTA".equals(n.getTipo())).reduce((x,y)->y).orElseThrow().getId());
  call("POST","/api/flights/"+flight+"/schedule/response",dts.token(),"{\"propuestaId\":"+proposalId+",\"aceptar\":true}").andExpect(status().isOk());
  assertEquals("APROBADO",stateOf(flight));
  call("GET","/api/flights/"+flight+"/documents/access",ops.token(),null).andExpect(jsonPath("$.disponible").value(true)).andExpect(jsonPath("$.codigo").doesNotExist());
  call("GET","/api/flights/"+flight+"/documents",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
  call("GET","/api/flights/"+flight+"/documents/types",ops.token(),null).andExpect(status().isOk());
  upload("/api/flights/"+flight+"/documents/pdf",ops.token(),"documentTypeCode","AUTORIZACION","nombreDocumento","Autorización firmada").andExpect(status().isOk()).andExpect(jsonPath("$.versionActual.numeroVersion").value(1));
  upload("/api/flights/"+flight+"/documents/pdf",ops.token(),"documentTypeCode","AUTORIZACION","nombreDocumento","autorización FIRMADA").andExpect(status().isConflict()).andExpect(jsonPath("$.code").doesNotExist()); // validación documental existente: nombre duplicado
  upload("/api/flights/"+flight+"/documents/pdf",ops.token(),"documentTypeCode","INEXISTENTE","nombreDocumento","Otro").andExpect(status().isBadRequest());
  call("POST","/api/documents/"+item+"/lock",ops.token(),null).andExpect(status().isOk());
  upload("/api/documents/"+item+"/versions/pdf",ops.token()).andExpect(status().isOk()).andExpect(jsonPath("$.versionActual.numeroVersion").value(2));

  call("PUT","/api/flights/"+flight+"/hangar",ops.token(),"{\"version\":0,\"requiereHangar\":true,\"preparacionCompleta\":false,\"observaciones\":\"Con acuerdo\"}").andExpect(status().isOk());

  // F. El acuerdo no concede permisos: DTS no escribe, otro DTS / comandante ajeno / administrador no acceden al vuelo.
  call("POST","/api/documents/"+item+"/lock",dts.token(),null).andExpect(status().isForbidden());
  upload("/api/flights/"+flight+"/documents/pdf",dts.token(),"documentTypeCode","AUTORIZACION","nombreDocumento","Del DTS").andExpect(status().isForbidden());
  for(Account outsider:List.of(otherDts,cmd)){
   call("GET","/api/flights/"+flight+"/documents",outsider.token(),null).andExpect(status().isForbidden());
   call("GET","/api/flights/"+flight+"/documents/access",outsider.token(),null).andExpect(status().isForbidden());
   upload("/api/documents/"+item+"/versions/pdf",outsider.token()).andExpect(status().isForbidden());
  }
  call("GET","/api/flights/"+flight+"/documents",admin.token(),null).andExpect(status().isForbidden());
  call("GET","/api/flights/"+flight+"/documents",null,null).andExpect(status().isUnauthorized());

  // E. Sin vía para reabrir: con el acuerdo vigente Operaciones no puede volver a contraproponer (el modelo no lo permite).
  call("POST","/api/flights/"+flight+"/schedule/counterproposal",ops.token(),"{\"salida\":\""+LocalDateTime.now().plusDays(14).withNano(0)+"\",\"motivo\":\"Otro\"}").andExpect(status().isBadRequest());
  assertEquals("APROBADO",stateOf(flight));
 }

 /** Si una negociación se reabriera, la documentación se bloquea sola y recupera todo al volver el acuerdo: nada se borra. */
 @Test void reopeningTheNegotiationLocksTheDocumentsAgainWithoutLosingAnything() throws Exception {
  Account dts=account("Reabre","DTS"),ops=account("Opera","CENTRO_OPERACIONES");
  long flight=newRequest(dts); long item=legacyDocument(flight,ops.userId()),version=tx(()->versions.findByDocumentItemIdAndEsVersionActualTrue(item).orElseThrow().getId());
  state(flight,"APROBADO");
  call("GET","/api/flights/"+flight+"/documents",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
  state(flight,"SOLICITADO");
  assertEveryDocumentOperationLocked(flight,item,version,ops,"OPERACIONES");
  assertEquals(1,items.findByFlightIdAndActivoTrueOrderByCreatedAtDesc(flight).size()); assertEquals(1L,versions.countByDocumentItemId(item));
  state(flight,"APROBADO");
  call("GET","/api/flights/"+flight+"/documents",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
  call("GET","/api/documents/"+item+"/versions",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.versiones.length()").value(1));
 }

 /** Cerrada sin horario acordado: sólo consulta del historial, nunca escritura; un 409 por horario no aparece. */
 @Test void closedRequestsKeepTheirHistoryReadableButNeverWritable() throws Exception {
  Account dts=account("Cierra","DTS"),ops=account("Cierre","CENTRO_OPERACIONES");
  long flight=newRequest(dts); long item=legacyDocument(flight,ops.userId());
  state(flight,"RECHAZADO");
  call("GET","/api/flights/"+flight+"/documents",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
  call("GET","/api/flights/"+flight+"/documents/access",ops.token(),null).andExpect(jsonPath("$.disponible").value(true));
  upload("/api/flights/"+flight+"/documents/pdf",ops.token(),"documentTypeCode","AUTORIZACION","nombreDocumento","Tarde").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").doesNotExist());
  call("POST","/api/documents/"+item+"/lock",ops.token(),null).andExpect(status().isBadRequest());
 }

 /** Un vuelo no sanitario no está sujeto a la regla del horario acordado. */
 @Test void operationalFlightsAreNotAffected() throws Exception {
  Account ops=account("Operativo","CENTRO_OPERACIONES");
  long flight=tx(()->{FlightType t=types.findByCodigo("OPERATIVO").orElseGet(()->{FlightType x=new FlightType();x.setCodigo("OPERATIVO");x.setNombre("Operativo");return types.save(x);});Flight f=new Flight();f.setCodigo("V-OPE"+(++seq));f.setTipoVuelo(t);f.setMotivoVuelo("Traslado de insumos");f.setCreadoPor(users.findById(ops.userId()).orElseThrow());return flights.saveAndFlush(f).getId();});
  call("GET","/api/flights/"+flight+"/documents/access",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.disponible").value(true));
  upload("/api/flights/"+flight+"/documents/pdf",ops.token(),"documentTypeCode","AUTORIZACION","nombreDocumento","Orden de carga").andExpect(status().isOk());
  call("GET","/api/flights/"+flight+"/documents",ops.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
 }
}
