package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
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
 * Aislamiento de las solicitudes sanitarias por usuario DTS, sobre HTTP con JWT, seguridad, reglas de negociación y persistencia reales (H2).
 * Cada DTS ve y opera únicamente las solicitudes que creó (la identidad sale del token, nunca de un parámetro), incluidos listados, detalle, modificaciones,
 * documentos, auditoría y notificaciones; Operaciones y Comandante conservan el acceso que les corresponde. Incluye la cuenta que reúne DTS y ADMINISTRADOR,
 * causa de la visibilidad cruzada: el rol administrativo no concede lectura de las solicitudes de otros DTS.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:requestisolation;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false","app.storage.documents-directory=target/test-request-isolation",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class RequestIsolationIntegrationTest {
 @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles;
 @Autowired ProvinceRepository provinces; @Autowired LocalityRepository localities; @Autowired FlightPriorityRepository priorities; @Autowired FlightTypeRepository types;
 @Autowired SanitaryRequestStatusRepository requestStatuses; @Autowired FlightStatusRepository flightStatuses; @Autowired FlightRepository flights; @Autowired SanitaryFlightRepository sanitaryFlights;
 @Autowired DocumentTypeRepository documentTypes; @Autowired DocumentItemRepository items; @Autowired FlightDocumentRepository versions; @Autowired CancellationReasonRepository reasons;
 @Autowired FlightScheduleNegotiationRepository negotiations; @Autowired AuditEventRepository events; @Autowired com.vuelossanitarios.backend.service.FlightAuthorizationService access;
 private static int seq=0; private static final String PASSWORD="ClaveSegura-12345";
 private static Long originId,destinationId,reasonId;
 private record Account(long userId,String token){}
 private <T> T tx(Supplier<T> work){return new TransactionTemplate(txm).execute(s->work.get());}
 private Role role(String code){return roles.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roles.save(r);});}
 private Account account(String name,String... roleCodes) throws Exception {
  Person p=new Person();p.setNombre(name);p.setApellido("Aislamiento");p.setDni(String.valueOf(65000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name.toLowerCase()+seq);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash(encoder.encode(PASSWORD));users.save(u);
  for(String code:roleCodes)userRoles.save(new UserRole(u,role(code)));
  String token=JsonPath.read(mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\""+u.getUsername()+"\",\"password\":\""+PASSWORD+"\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.accessToken");
  return new Account(u.getId(),token);
 }
 private ResultActions call(String method,String path,String token,String body) throws Exception {
  var b=MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(method),path).contentType(MediaType.APPLICATION_JSON);
  if(token!=null)b=b.header("Authorization","Bearer "+token);
  return mvc.perform(body==null?b:b.content(body));
 }
 private ResultActions upload(String path,String token) throws Exception {
  return mvc.perform(MockMvcRequestBuilders.multipart(path).file(new MockMultipartFile("file","parte.pdf","application/pdf","%PDF-1.7".getBytes())).header("Authorization","Bearer "+token));
 }
 private String requestJson(){
  return "{\"patient\":{\"nombre\":\"Pablo\",\"apellido\":\"Paciente\",\"dni\":\""+(43000000+(++seq))+"\"},\"identidadConfirmada\":true,\"localidadOrigenId\":"+originId+",\"localidadDestinoId\":"+destinationId+",\"priorityCode\":\"ALTA\",\"motivoVuelo\":\"Traslado de prueba\","
   +"\"fechaSolicitada\":\""+LocalDateTime.now().plusDays(10).withNano(0)+"\",\"extremaUrgencia\":false,\"medical\":{\"diagnostico\":\"Control\",\"condicionMedica\":\"ESTABLE\",\"requiereEquipamientoEspecial\":false}}";
 }
 private long newRequest(Account dts) throws Exception {
  return ((Number)JsonPath.read(call("POST","/api/flights/with-patient",dts.token(),requestJson()).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$.id")).longValue();
 }
 private List<Long> listed(Account who,String query) throws Exception {
  List<Number> ids=JsonPath.read(call("GET","/api/flights"+query,who.token(),null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$[*].id");
  return ids.stream().map(Number::longValue).sorted().toList();
 }
 private void setRequestState(long flightId,String code){tx(()->{SanitaryFlight s=sanitaryFlights.findByFlightId(flightId).orElseThrow();s.setEstadoSolicitud(requestStatuses.findByCodigo(code).orElseThrow());return sanitaryFlights.saveAndFlush(s);});}
 private void setFlight(long flightId,String status,Long commanderId){tx(()->{Flight f=flights.findById(flightId).orElseThrow();f.setEstadoVuelo(status==null?null:flightStatuses.findByCodigo(status).orElseThrow());if(commanderId!=null)f.setComandante(users.findById(commanderId).orElseThrow());return flights.saveAndFlush(f);});}
 private String requestStateOf(long flightId){return tx(()->sanitaryFlights.findByFlightId(flightId).orElseThrow().getEstadoSolicitud().getCodigo());}
 private long document(long flightId,long authorId){return tx(()->{
  FlightDocumentItem item=new FlightDocumentItem();item.setFlight(flights.findById(flightId).orElseThrow());item.setDocumentType(documentTypes.findByCodigo("AUTORIZACION").orElseThrow());item.setNombreDocumento("Documento de la solicitud");items.saveAndFlush(item);
  FlightDocument v=new FlightDocument();v.setDocumentItem(item);v.setNumeroVersion(1);v.setEsVersionActual(true);v.setNombreArchivoOriginal("doc.pdf");v.setUbicacionAlmacenamiento("inexistente.pdf");v.setTamanioBytes(8L);v.setCreadoPor(users.findById(authorId).orElseThrow());versions.saveAndFlush(v);
  return item.getId();});}
 private long versionOf(long itemId){return tx(()->versions.findByDocumentItemIdAndEsVersionActualTrue(itemId).orElseThrow().getId());}
 private long proposalId(long flight){return tx(()->negotiations.findByFlightIdOrderByFechaOcurrenciaAscIdAsc(flight).stream().filter(n->"CO_CONTRAPROPUESTA".equals(n.getTipo())).reduce((x,y)->y).orElseThrow().getId());}

 /** El detalle completo (`GET /api/flights/{id}`) necesita tablas que el esquema H2 no crea (informes finales, bitácora): su autorización se verifica con la regla real que usa el servicio; el rechazo HTTP (403) sí se prueba de punta a punta. */
 private void assertMayRead(long flight,Account who){assertDoesNotThrow(()->tx(()->{access.mayRead(flights.findById(flight).orElseThrow(),who.userId());return null;}));}
 private String stateInList(Account who,long flight) throws Exception {return JsonPath.read(call("GET","/api/flights",who.token(),null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),"$[?(@.id=="+flight+")].datosSanitarios.estadoSolicitud").toString();}
 private long negotiationEvents(long flight){return tx(()->negotiations.findByFlightIdOrderByFechaOcurrenciaAscIdAsc(flight).size());}

 @BeforeEach void seed(){
  for(String r:List.of("ADMINISTRADOR","DTS","OPERACIONES","CENTRO_OPERACIONES","COMANDANTE"))role(r);
  if(originId==null){
   Province pr=new Province();pr.setCodigoOficial("I1");pr.setNombre("Provincia de prueba");pr.setActivo(true);provinces.save(pr);
   Locality a=new Locality();a.setCodigoOficial("IL1");a.setNombre("Origen");a.setProvincia(pr);a.setActivo(true);localities.save(a);
   Locality b=new Locality();b.setCodigoOficial("IL2");b.setNombre("Destino");b.setProvincia(pr);b.setActivo(true);localities.save(b);
   originId=a.getId();destinationId=b.getId();
   FlightPriority p=new FlightPriority();p.setCodigo("ALTA");p.setNombre("Alta");p.setActivo(true);p.setOrden((short)1);priorities.save(p);
   FlightType t=new FlightType();t.setCodigo("SANITARIO");t.setNombre("Sanitario");types.save(t);
   short order=1;for(String code:List.of("SOLICITADO","PENDIENTE_RESPUESTA_DTS","APROBADO","RECHAZADO","CANCELADO")){SanitaryRequestStatus s=new SanitaryRequestStatus();s.setCodigo(code);s.setNombre(code);s.setOrden(order++);requestStatuses.save(s);}
   order=1;for(String code:List.of("PLANIFICADO","EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO")){FlightStatus s=new FlightStatus();s.setCodigo(code);s.setNombre(code);s.setOrden(order++);flightStatuses.save(s);}
   DocumentType d=new DocumentType();d.setCodigo("AUTORIZACION");d.setNombre("Autorización de vuelo");documentTypes.save(d);
   CancellationReason r=new CancellationReason();r.setCodigo("SIN_AERONAVE_ASIGNADA");r.setNombre("Falta de aeronave asignada");r.setCategoria("OPERATIVA");r.setOrden((short)1);reasons.save(r);reasonId=r.getId();
  }
 }

 // ---------------------------------------------------------------- 1. propiedad, filtros y alcance
 @Test void eachDtsListsOnlyTheRequestsItCreatedAndTheScopeNeverWidensTheResult() throws Exception {
  Account a=account("Alicia","DTS"),b=account("Bruno","DTS"),ops=account("Omar","CENTRO_OPERACIONES");
  long a1=newRequest(a),a2=newRequest(a),b1=newRequest(b);
  assertEquals(List.of(a1,a2),listed(a,""),"DTS A: sólo sus dos solicitudes");
  assertEquals(List.of(b1),listed(b,""),"DTS B: sólo la suya");
  assertEquals(List.of(a1,a2),listed(a,"?scope=mine"));assertEquals(List.of(b1),listed(b,"?scope=mine"));
  assertEquals(List.of(a1,a2),listed(a,"?scope=all"),"el alcance «all» no amplía lo que corresponde a un DTS");
  call("GET","/api/flights?scope=otro",a.token(),null).andExpect(status().isBadRequest());
  // el propietario sale del token: ni un parámetro ni un cuerpo enviado por el cliente lo cambian
  assertEquals(List.of(b1),listed(b,"?usuarioId="+a.userId()+"&creadorId="+a.userId()+"&solicitadoPor="+a.userId()));
  assertEquals(a.userId(),tx(()->sanitaryFlights.findByFlightId(a1).orElseThrow().getSolicitadoPor().getId()));
  assertEquals(a.userId(),tx(()->flights.findById(a1).orElseThrow().getCreadoPor().getId()));
  // Operaciones ve todas las solicitudes; con «mine» (su área DTS, si la tuviera) sólo las suyas, que aquí no hay
  assertTrue(listed(ops,"").containsAll(List.of(a1,a2,b1)));
  assertEquals(List.of(),listed(ops,"?scope=mine"));
  call("GET","/api/flights",null,null).andExpect(status().isUnauthorized());
 }

 // ---------------------------------------------------------------- 2. acceso directo por identificador
 @Test void anotherDtsCannotReachAForeignRequestByIdThroughAnyFlightResource() throws Exception {
  Account a=account("Ana","DTS"),b=account("Beto","DTS"),ops=account("Opera","CENTRO_OPERACIONES");
  long flight=newRequest(a);setRequestState(flight,"APROBADO");long item=document(flight,ops.userId()),version=versionOf(item);
  String f="/api/flights/"+flight;
  assertMayRead(flight,a);
  for(String path:List.of(f,f+"/weather",f+"/route",f+"/health-staff",f+"/transfer-contacts",f+"/documents",f+"/documents/access","/api/audit/flights/"+flight,"/api/documents/"+item+"/versions","/api/documents/"+item+"/lock")){
   call("GET",path,b.token(),null).andExpect(status().isForbidden());
   if(!path.equals(f))call("GET",path,a.token(),null).andExpect(status().isOk());
  }
  call("GET","/api/document-versions/"+version+"/download",b.token(),null).andExpect(status().isForbidden());
  call("GET",f+"/health-staff/candidates",b.token(),null).andExpect(status().isForbidden());
  // el comandante y los recursos de Operaciones tampoco se abren al DTS ajeno ni al propio por rol
  for(String path:List.of(f+"/crew",f+"/hangar",f+"/log",f+"/airport-coordinations",f+"/available-aircraft",f+"/commander-candidates"))call("GET",path,b.token(),null).andExpect(status().isForbidden());
  // auditoría global: sólo administrador
  call("GET","/api/audit",b.token(),null).andExpect(status().isForbidden());
  long eventId=tx(()->events.findAll().stream().filter(e->e.getFlight()!=null&&e.getFlight().getId().equals(flight)).findFirst().orElseThrow().getId());
  call("GET","/api/audit/events/"+eventId,b.token(),null).andExpect(status().isNotFound());
  call("GET","/api/audit/events/"+eventId,a.token(),null).andExpect(status().isOk());
  // la respuesta es la misma para cualquier identificador ajeno: no cambia con el estado de la solicitud
  setRequestState(flight,"SOLICITADO");
  call("GET",f,b.token(),null).andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("No tiene acceso a este vuelo"));
 }

 // ---------------------------------------------------------------- 3. modificaciones no autorizadas
 @Test void anotherDtsCannotChangeAForeignRequestAndNothingIsModified() throws Exception {
  Account a=account("Arturo","DTS"),b=account("Bianca","DTS"),ops=account("Orlando","CENTRO_OPERACIONES");
  long flight=newRequest(a);String f="/api/flights/"+flight;
  call("POST",f+"/schedule/counterproposal",ops.token(),"{\"salida\":\""+LocalDateTime.now().plusDays(12).withNano(0)+"\",\"motivo\":\"Otro día\"}").andExpect(status().isOk());
  assertEquals("PENDIENTE_RESPUESTA_DTS",requestStateOf(flight));long proposal=proposalId(flight),eventsBefore=negotiationEvents(flight);
  // B intenta aceptar, rechazar (cancelar), cancelar y gestionar contactos y personal sanitario de la solicitud de A
  call("POST",f+"/schedule/response",b.token(),"{\"propuestaId\":"+proposal+",\"aceptar\":true}").andExpect(status().isForbidden());
  call("POST",f+"/schedule/response",b.token(),"{\"propuestaId\":"+proposal+",\"aceptar\":false,\"motivoCancelacionId\":"+reasonId+"}").andExpect(status().isForbidden());
  call("POST",f+"/cancel",b.token(),"{\"motivoCancelacionId\":"+reasonId+"}").andExpect(status().isForbidden());
  call("POST",f+"/transfer-contacts",b.token(),"{\"relacion\":\"PACIENTE\",\"pais\":\"AR\",\"telefono\":\"3815550101\"}").andExpect(status().isForbidden());
  call("POST",f+"/health-staff",b.token(),"{\"personalSanitarioId\":1}").andExpect(status().isForbidden());
  call("POST",f+"/evaluation",b.token(),"{\"aprobar\":true}").andExpect(status().isForbidden()); // acciones de Operaciones
  assertEquals("PENDIENTE_RESPUESTA_DTS",requestStateOf(flight),"el estado de la solicitud no cambió");
  assertEquals(eventsBefore,negotiationEvents(flight),"no se registró ninguna respuesta en la negociación");
  assertNull(tx(()->flights.findById(flight).orElseThrow().getEstadoVuelo()));assertNull(tx(()->flights.findById(flight).orElseThrow().getFechaCancelacion()));
  // lo mismo con una solicitud todavía sin contrapropuesta: B no averigua la etapa (siempre 403, no 400)
  long other=newRequest(a);
  call("POST","/api/flights/"+other+"/schedule/response",b.token(),"{\"propuestaId\":1,\"aceptar\":true}").andExpect(status().isForbidden());
  // el solicitante sí puede responder (la cancelación propia exitosa usa bitácora, ausente en H2: la cubre RequestNegotiationServiceTest con la misma regla de propiedad)
  call("POST",f+"/schedule/response",a.token(),"{\"propuestaId\":"+proposal+",\"aceptar\":true}").andExpect(status().isOk());
  assertEquals("APROBADO",requestStateOf(flight));
 }

 // ---------------------------------------------------------------- 4. documentación
 @Test void documentsOfAForeignRequestCannotBeListedOpenedOrDownloaded() throws Exception {
  Account a=account("Diana","DTS"),b=account("Dario","DTS"),ops=account("Dolores","CENTRO_OPERACIONES"),cmd=account("Dante","COMANDANTE");
  long flight=newRequest(a);setRequestState(flight,"APROBADO");long item=document(flight,ops.userId()),version=versionOf(item);
  call("GET","/api/flights/"+flight+"/documents",a.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
  call("GET","/api/documents/"+item+"/versions",a.token(),null).andExpect(status().isOk());
  for(String path:List.of("/api/flights/"+flight+"/documents","/api/flights/"+flight+"/documents/access","/api/documents/"+item+"/versions","/api/documents/"+item+"/lock","/api/document-versions/"+version+"/download"))
   call("GET",path,b.token(),null).andExpect(status().isForbidden());
  upload("/api/documents/"+item+"/versions/pdf",b.token()).andExpect(status().isForbidden());
  call("GET","/api/flights/"+flight+"/documents",cmd.token(),null).andExpect(status().isForbidden()); // un comandante no asignado tampoco
  assertEquals(1L,versions.countByDocumentItemId(item));
  assertEquals(0L,tx(()->events.findAll().stream().filter(e->"DOWNLOAD".equals(e.getOperation())).count()),"las descargas denegadas no se registran como accesos");
 }

 // ---------------------------------------------------------------- 5. ciclo de vida
 @Test void theRequesterKeepsVisibilityThroughTheWholeLifecycleAndNobodyElseGainsIt() throws Exception {
  Account a=account("Elena","DTS"),b=account("Esteban","DTS"),ops=account("Ofelia","CENTRO_OPERACIONES"),cmd=account("Cristian","COMANDANTE");
  long flight=newRequest(a);String f="/api/flights/"+flight;
  // negociación
  call("POST",f+"/schedule/counterproposal",ops.token(),"{\"salida\":\""+LocalDateTime.now().plusDays(12).withNano(0)+"\",\"motivo\":\"Aeronave disponible\"}").andExpect(status().isOk());
  assertMayRead(flight,a);assertEquals("[\"PENDIENTE_RESPUESTA_DTS\"]",stateInList(a,flight));
  call("GET",f,b.token(),null).andExpect(status().isForbidden());
  // notificaciones: la contrapropuesta avisa sólo al solicitante
  call("GET","/api/notifications",a.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.items[?(@.flightId=="+flight+" && @.tipo=='SCHEDULE_COUNTERPROPOSAL')]").isNotEmpty());
  call("GET","/api/notifications",b.token(),null).andExpect(status().isOk()).andExpect(jsonPath("$.items[?(@.flightId=="+flight+")]").isEmpty());
  long notificationOfA=((Number)JsonPath.read(call("GET","/api/notifications",a.token(),null).andReturn().getResponse().getContentAsString(),"$.items[0].id")).longValue();
  call("POST","/api/notifications/"+notificationOfA+"/read",b.token(),null).andExpect(status().isForbidden());
  // aceptación y preparación
  call("POST",f+"/schedule/response",a.token(),"{\"propuestaId\":"+proposalId(flight)+",\"aceptar\":true}").andExpect(status().isOk());
  assertTrue(listed(a,"").contains(flight));assertFalse(listed(b,"").contains(flight));
  setFlight(flight,"PLANIFICADO",cmd.userId());
  assertTrue(listed(a,"?scope=mine").contains(flight));assertFalse(listed(b,"").contains(flight));
  assertMayRead(flight,a);call("GET",f,b.token(),null).andExpect(status().isForbidden());
  // ejecución, finalización y cierre
  for(String state:List.of("EN_CURSO","FINALIZADO","COMPLETADO")){
   setFlight(flight,state,null);
   assertTrue(listed(a,"").contains(flight),"el solicitante conserva la solicitud en "+state);
   assertMayRead(flight,a);call("GET","/api/flights",a.token(),null).andExpect(jsonPath("$[?(@.id=="+flight+")].estadoVuelo").value(state));
   assertFalse(listed(b,"").contains(flight));call("GET",f,b.token(),null).andExpect(status().isForbidden());
  }
  // cancelada y rechazada: siguen en el historial del solicitante
  long cancelled=newRequest(a),rejected=newRequest(a);
  setRequestState(cancelled,"CANCELADO");setFlight(cancelled,"CANCELADO",null);
  setRequestState(rejected,"RECHAZADO");
  assertTrue(listed(a,"").containsAll(List.of(flight,cancelled,rejected)));assertTrue(listed(b,"").isEmpty());
 }

 // ---------------------------------------------------------------- 6. otros roles
 @Test void operationsAndCommanderKeepTheirAuthorizedAccessWithoutRegressions() throws Exception {
  Account a=account("Fabiana","DTS"),b=account("Fausto","DTS"),ops=account("Facundo","CENTRO_OPERACIONES"),cmd=account("Fernando","COMANDANTE"),otherCmd=account("Flavio","COMANDANTE"),admin=account("Fidel","ADMINISTRADOR");
  long a1=newRequest(a),b1=newRequest(b);
  // Operaciones: bandeja completa, detalle y gestión de ambas (no está limitada a lo que creó)
  assertTrue(listed(ops,"").containsAll(List.of(a1,b1)));
  for(long id:List.of(a1,b1)){
   assertMayRead(id,ops);
   call("GET","/api/flights/"+id+"/hangar",ops.token(),null).andExpect(status().isOk());
   call("GET","/api/audit/flights/"+id,ops.token(),null).andExpect(status().isOk());
  }
  call("POST","/api/flights/"+a1+"/schedule/accept",ops.token(),null).andExpect(status().isOk());
  call("POST","/api/flights/"+b1+"/schedule/counterproposal",ops.token(),"{\"salida\":\""+LocalDateTime.now().plusDays(12).withNano(0)+"\",\"motivo\":\"Otro día\"}").andExpect(status().isOk());
  assertEquals("APROBADO",requestStateOf(a1));assertEquals("PENDIENTE_RESPUESTA_DTS",requestStateOf(b1));
  // Comandante: sólo el vuelo asignado
  setFlight(a1,"PLANIFICADO",cmd.userId());
  assertEquals(List.of(a1),listed(cmd,""));assertEquals(List.of(),listed(otherCmd,""));
  assertMayRead(a1,cmd);
  call("GET","/api/flights/"+b1,cmd.token(),null).andExpect(status().isForbidden());
  call("GET","/api/flights/"+a1,otherCmd.token(),null).andExpect(status().isForbidden());
  call("GET","/api/flights/"+a1+"/hangar",cmd.token(),null).andExpect(status().isOk());
  call("GET","/api/flights/"+b1+"/hangar",cmd.token(),null).andExpect(status().isForbidden());
  // Administrador (sin DTS): conserva su lectura administrativa de vuelos, sin permisos nuevos de operación
  assertTrue(listed(admin,"").containsAll(List.of(a1,b1)));
  assertMayRead(a1,admin);
  call("POST","/api/flights/"+b1+"/cancel",admin.token(),"{\"motivoCancelacionId\":"+reasonId+"}").andExpect(status().isForbidden());
 }

 // ---------------------------------------------------------------- 7. cuentas con varios roles (causa de la visibilidad cruzada)
 @Test void anAccountThatIsDtsAndAdministratorSeesOnlyItsOwnRequests() throws Exception {
  Account owner=account("Gabriela","DTS"),both=account("Gonzalo","DTS","ADMINISTRADOR"),ops=account("Graciela","CENTRO_OPERACIONES");
  long foreign=newRequest(owner),own=newRequest(both);setRequestState(foreign,"APROBADO");long item=document(foreign,ops.userId());
  assertEquals(List.of(own),listed(both,""),"el rol administrativo no concede las solicitudes de otro DTS");
  assertEquals(List.of(own),listed(both,"?scope=mine"));
  String f="/api/flights/"+foreign;
  for(String path:List.of(f,f+"/weather",f+"/route",f+"/health-staff",f+"/hangar",f+"/log",f+"/airport-coordinations",f+"/documents",f+"/documents/access","/api/documents/"+item+"/versions","/api/audit/flights/"+foreign))
   call("GET",path,both.token(),null).andExpect(status().isForbidden());
  assertMayRead(own,both);
  call("GET","/api/flights/"+own+"/documents",both.token(),null).andExpect(status().isConflict()); // propia: sólo la regla de horario acordado
  // su función administrativa no se pierde: el módulo de auditoría sigue siendo suyo
  call("GET","/api/audit",both.token(),null).andExpect(status().isOk());
 }

 @Test void anAccountThatIsDtsAndOperationsKeepsTheOperationsInboxButMyRequestsIsLimitedToItsOwn() throws Exception {
  Account owner=account("Hilda","DTS"),both=account("Hugo","DTS","CENTRO_OPERACIONES");
  long foreign=newRequest(owner),own=newRequest(both);
  assertTrue(listed(both,"").containsAll(List.of(foreign,own)),"como Centro de Operaciones gestiona todas las solicitudes");
  assertEquals(List.of(own),listed(both,"?scope=mine"),"«Mis solicitudes» sólo muestra las que creó");
  assertMayRead(foreign,both);
 }

 @Test void aCommanderWhoIsAlsoDtsSeesItsAssignmentsAndItsOwnRequests() throws Exception {
  Account owner=account("Irene","DTS"),both=account("Ivan","DTS","COMANDANTE");
  long foreign=newRequest(owner),own=newRequest(both),assigned=newRequest(owner);
  setFlight(assigned,"PLANIFICADO",both.userId());
  assertEquals(List.of(own,assigned),listed(both,""));
  assertFalse(listed(both,"").contains(foreign));
  assertEquals(List.of(own),listed(both,"?scope=mine"));
  call("GET","/api/flights/"+foreign,both.token(),null).andExpect(status().isForbidden());
 }

 @Test void theLegacyHelperRolesAreComputedFromTheAuthenticatedUser() {
  assertTrue(com.vuelossanitarios.backend.service.FlightAuthorizationService.readsAllFlights(Set.of("ADMINISTRADOR")));
  assertTrue(com.vuelossanitarios.backend.service.FlightAuthorizationService.readsAllFlights(Set.of("CENTRO_OPERACIONES","DTS")));
  assertTrue(com.vuelossanitarios.backend.service.FlightAuthorizationService.readsAllFlights(Set.of("OPERACIONES")));
  assertFalse(com.vuelossanitarios.backend.service.FlightAuthorizationService.readsAllFlights(Set.of("ADMINISTRADOR","DTS")));
  assertFalse(com.vuelossanitarios.backend.service.FlightAuthorizationService.readsAllFlights(Set.of("DTS")));
  assertFalse(com.vuelossanitarios.backend.service.FlightAuthorizationService.readsAllFlights(Set.of("COMANDANTE")));
 }
}
