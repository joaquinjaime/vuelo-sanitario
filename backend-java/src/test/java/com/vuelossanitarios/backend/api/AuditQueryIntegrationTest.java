package com.vuelossanitarios.backend.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.security.CurrentUser;
import com.vuelossanitarios.backend.service.AuditService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Consulta de auditoría por perfil sobre HTTP con seguridad y persistencia reales (H2 en modo SQL Server). La inmutabilidad en SQL Server se prueba en el E2E. */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:auditquery;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
@AutoConfigureMockMvc
class AuditQueryIntegrationTest {
 @Autowired MockMvc mvc; @Autowired AuditEventRepository events; @Autowired AuditService audit; @Autowired PlatformTransactionManager txm;
 @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roles; @Autowired UserRoleRepository userRoles;
 @Autowired FlightRepository flights; @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses; @Autowired PatientRepository patients;
 @Autowired SanitaryFlightRepository sanitaryFlights; @Autowired SanitaryRequestStatusRepository requestStatuses;
 private static int seq=0;
 private User admin,ops,center,dts,otherDts,commander,otherCommander,formerCommander,disabled;
 private Flight sanitary,operational,otherSanitary;

 private User user(String name,String role,boolean active){
  Person p=new Person();p.setNombre(name);p.setApellido("Prueba");p.setDni(String.valueOf(40000000+(++seq)));persons.save(p);
  User u=new User();u.setUsername(name+seq);u.setPerson(p);u.setActivo(active);u.setEstadoCuenta(active?"ACTIVO":"DESACTIVADO");users.save(u);
  Role r=roles.findByCodigo(role).orElseGet(()->{Role x=new Role();x.setCodigo(role);x.setNombre(role);x.setActivo(true);return roles.save(x);});
  userRoles.save(new UserRole(u,r));return users.findById(u.getId()).orElseThrow();
 }
 private RequestPostProcessor as(User u,String... r){
  return SecurityMockMvcRequestPostProcessors.authentication(new UsernamePasswordAuthenticationToken(new CurrentUser(u.getId(),u.getUsername()),null,
   java.util.Arrays.stream(r).map(x->new SimpleGrantedAuthority("ROLE_"+x)).toList()));
 }
 private Flight flight(String type,User requester,User cmd){
  FlightType t=types.findByCodigoAndActivoTrue(type).orElseGet(()->{FlightType x=new FlightType();x.setCodigo(type);x.setNombre(type);return types.save(x);});
  FlightStatus st=statuses.findByCodigo("PLANIFICADO").orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo("PLANIFICADO");s.setNombre("Planificado");s.setOrden((short)1);return statuses.save(s);});
  Flight f=new Flight();f.setCodigo("A-"+(++seq)+"-"+System.nanoTime()%100000);f.setTipoVuelo(t);f.setMotivoVuelo("Prueba");f.setCreadoPor(ops);f.setComandante(cmd);f.setEstadoVuelo(st);
  f.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,1,10,0));f.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,1,12,0));flights.save(f);
  if(requester!=null){
   Person pp=new Person();pp.setNombre("Pac");pp.setApellido("Ficticio");pp.setDni(String.valueOf(50000000+(++seq)));persons.save(pp);Patient pa=new Patient();pa.setPerson(pp);patients.save(pa);
   SanitaryRequestStatus rs=requestStatuses.findByCodigo("SOLICITADO").orElseGet(()->{SanitaryRequestStatus x=new SanitaryRequestStatus();x.setCodigo("SOLICITADO");x.setNombre("Solicitado");x.setOrden((short)1);return requestStatuses.save(x);});
   SanitaryFlight s=new SanitaryFlight();s.setFlight(f);s.setPatient(pa);s.setSolicitadoPor(requester);s.setFechaSolicitada(LocalDateTime.of(2030,1,1,9,0));s.setEstadoSolicitud(rs);sanitaryFlights.save(s);
   f.setSanitario(s);
  }
  return f;
 }
 /** Inserta un evento con fecha UTC explícita (para fijar medianoches y orden). */
 private AuditEvent event(Flight f,User actor,String type,String op,String before,String after,LocalDateTime utc){
  AuditEvent e=new AuditEvent();e.setFlight(f);e.setActor(actor);e.setEntityType(type);e.setEntityId(1L);e.setOperation(op);e.setOldValues(before);e.setNewValues(after);e.setOccurredAt(utc);return events.save(e);
 }
 private static final LocalDateTime T0=LocalDateTime.of(2031,5,10,12,0);

 @BeforeEach void seed(){
  admin=user("admin","ADMINISTRADOR",true);ops=user("ops","OPERACIONES",true);center=user("centro","CENTRO_OPERACIONES",true);dts=user("dts","DTS",true);otherDts=user("dts2","DTS",true);
  commander=user("cmd","COMANDANTE",true);otherCommander=user("cmd2","COMANDANTE",true);formerCommander=user("cmdold","COMANDANTE",true);disabled=user("baja","OPERACIONES",false);
  sanitary=flight("SANITARIO",dts,commander);operational=flight("TRASLADO_OPERATIVO",null,otherCommander);otherSanitary=flight("SANITARIO",otherDts,null);
 }

 private String json(String path,RequestPostProcessor auth,int status) throws Exception {
  return mvc.perform(get(path).with(auth)).andExpect(status().is(status)).andReturn().getResponse().getContentAsString();
 }

 @Test void onlyAdministratorReadsTheGlobalAuditAndItsFilterOptions() throws Exception {
  event(sanitary,ops,"FLIGHT","START",null,"{\"estado\":\"EN_CURSO\"}",T0);
  json("/api/audit",as(admin,"ADMINISTRADOR"),200);json("/api/audit/filters",as(admin,"ADMINISTRADOR"),200);
  mvc.perform(get("/api/audit").with(as(admin,"ADMINISTRADOR"))).andExpect(status().isOk()).andExpect(header().exists("X-Diagnostic-Id"));
  for(User u:List.of(ops,center,dts,commander)){
   String role=u==ops?"OPERACIONES":u==center?"CENTRO_OPERACIONES":u==dts?"DTS":"COMANDANTE";
   json("/api/audit",as(u,role),403);json("/api/audit/filters",as(u,role),403);json("/api/audit/actors",as(u,role),403);
  }
  mvc.perform(get("/api/audit")).andExpect(result->assertTrue(result.getResponse().getStatus()==401||result.getResponse().getStatus()==403));
 }

 @Test void actorSearchFindsHistoricalAndDisabledUsersBeyondTheFirstFiveHundredWithStablePages() throws Exception {
  String targetUsername=null;Long targetId=null;
  for(int i=0;i<510;i++){User candidate=user("zzActor"+i,"OPERACIONES",i%2==0);if(i==509){targetUsername=candidate.getUsername();targetId=candidate.getId();Person p=persons.findById(candidate.getPerson().getId()).orElseThrow();p.setApellido("Zzz fuera de los primeros 500");persons.save(p);}event(sanitary,candidate,"FLIGHT","START",null,"{}",T0.plusSeconds(i));}
  String result=json("/api/audit/actors?q="+targetUsername+"&page=0&size=10",as(admin,"ADMINISTRADOR"),200);
  assertEquals(1,((List<?>)JsonPath.read(result,"$.items")).size());
  assertEquals(targetUsername,JsonPath.read(result,"$.items[0].username"));
  assertFalse((Boolean)JsonPath.read(result,"$.items[0].active"));
  List<Integer> legacyIds=JsonPath.read(json("/api/audit/filters",as(admin,"ADMINISTRADOR"),200),"$.actors[*].id");
  assertFalse(legacyIds.contains(targetId.intValue()),"el actor buscado no está en los primeros 500 del contrato anterior");
  assertEquals(1,total("/api/audit?actorId="+targetId,as(admin,"ADMINISTRADOR")),"filtrar eventos por el actor encontrado devuelve el evento esperado");
  String first=json("/api/audit/actors?q=zzActor&page=0&size=25",as(admin,"ADMINISTRADOR"),200);
  String second=json("/api/audit/actors?q=zzActor&page=1&size=25",as(admin,"ADMINISTRADOR"),200);
  assertEquals(25,((List<?>)JsonPath.read(first,"$.items")).size());assertTrue((Boolean)JsonPath.read(first,"$.hasNext"));
  assertFalse(JsonPath.read(first,"$.items[0].id").equals(JsonPath.read(second,"$.items[0].id")));
  assertEquals(0,((List<?>)JsonPath.read(json("/api/audit/actors?q=does-not-exist",as(admin,"ADMINISTRADOR"),200),"$.items")).size());
 }

 @Test void globalListIsPagedStablyOrderedAndBounded() throws Exception {
  LocalDateTime base=LocalDateTime.of(2032,1,1,12,0);
  for(int i=0;i<7;i++)event(sanitary,ops,"FLIGHT","START",null,"{\"estado\":\"EN_CURSO\"}",base);   // misma fecha: el desempate es el id
  event(sanitary,ops,"FLIGHT","FINISH",null,"{\"estado\":\"FINALIZADO\"}",base.plusMinutes(5));
  String q="/api/audit?from=2032-01-01&to=2032-01-01&size=3";
  String p0=json(q+"&page=0",as(admin,"ADMINISTRADOR"),200),p1=json(q+"&page=1",as(admin,"ADMINISTRADOR"),200),p2=json(q+"&page=2",as(admin,"ADMINISTRADOR"),200);
  assertEquals(8,((Number)JsonPath.read(p0,"$.total")).intValue());assertEquals(3,((Number)JsonPath.read(p0,"$.totalPages")).intValue());
  assertEquals("FINISH",JsonPath.read(p0,"$.items[0].operation"),"el más reciente primero");
  List<Integer> ids=new java.util.ArrayList<>();for(String p:List.of(p0,p1,p2))ids.addAll(JsonPath.<List<Integer>>read(p,"$.items[*].id"));
  assertEquals(8,ids.size());assertEquals(8,ids.stream().distinct().count(),"sin repetidos ni saltos entre páginas");
  List<Integer> sameInstant=ids.subList(1,8);for(int i=1;i<sameInstant.size();i++)assertTrue(sameInstant.get(i-1)>sameInstant.get(i),"a igual fecha, id descendente");
  String asc=json(q+"&order=asc&page=0",as(admin,"ADMINISTRADOR"),200);assertEquals("START",JsonPath.read(asc,"$.items[0].operation"));
  assertEquals("America/Argentina/Tucuman",JsonPath.read(p0,"$.timeZone"));
  for(String bad:List.of("size=101","size=0","page=-1","order=sideways","page=1000&size=100","from=2032-02-01&to=2032-01-01","entityType=A%20B","operation=%27%3B--","from=no-es-fecha","actorId=abc"))
   json("/api/audit?"+bad,as(admin,"ADMINISTRADOR"),400);
  assertEquals(0,((List<?>)JsonPath.read(json(q+"&page=50",as(admin,"ADMINISTRADOR"),200),"$.items")).size());
 }

 @Test void filtersCombineAndTheLocalDayRespectsMidnightInTheBusinessZone() throws Exception {
  // 23:30 locales del 9/3 (UTC-3) son las 02:30 UTC del 10/3: pertenecen al día 9, no al 10.
  event(sanitary,ops,"FLIGHT","CANCEL","{\"estado\":\"PLANIFICADO\"}","{\"motivo\":\"Meteorología\"}",LocalDateTime.of(2033,3,10,2,30));
  event(sanitary,ops,"FLIGHT","START",null,"{\"estado\":\"EN_CURSO\"}",LocalDateTime.of(2033,3,10,3,0));   // 00:00 local del 10/3
  event(operational,center,"AIRCRAFT","UPDATE","{\"activo\":true}","{\"activo\":false}",LocalDateTime.of(2033,3,9,15,0));
  RequestPostProcessor a=as(admin,"ADMINISTRADOR");
  assertEquals(1,total("/api/audit?from=2033-03-09&to=2033-03-09&flightId="+sanitary.getId(),a),"23:30 local va al día 9");
  assertEquals(1,total("/api/audit?from=2033-03-10&to=2033-03-10&flightId="+sanitary.getId(),a),"00:00 local va al día 10");
  assertEquals(3,total("/api/audit?from=2033-03-09&to=2033-03-10",a));
  assertEquals(1,total("/api/audit?from=2033-03-09&to=2033-03-10&entityType=aircraft",a));
  assertEquals(2,total("/api/audit?from=2033-03-09&to=2033-03-10&actorId="+ops.getId(),a));
  assertEquals(1,total("/api/audit?from=2033-03-09&to=2033-03-10&actorId="+ops.getId()+"&operation=CANCEL",a));
  assertEquals(0,total("/api/audit?from=2033-03-09&to=2033-03-10&actorId="+center.getId()+"&entityType=FLIGHT",a));
  assertEquals(1,total("/api/audit?from=2033-03-09&to=2033-03-10&flightId="+operational.getId(),a));
  assertEquals(2,total("/api/audit?from=2033-03-09&to=2033-03-10&entityId=1&flightId="+sanitary.getId(),a));
  String detail=json("/api/audit?from=2033-03-09&to=2033-03-09&flightId="+sanitary.getId(),a,200);
  assertEquals("2033-03-10T02:30:00Z",JsonPath.read(detail,"$.items[0].occurredAt"),"el instante se entrega en UTC con 'Z'; la conversión a hora civil es del cliente con timeZone");
 }
 private int total(String path,RequestPostProcessor a) throws Exception {return ((Number)JsonPath.read(json(path,a,200),"$.total")).intValue();}

 @Test void aDtsOnlySeesItsOwnRequestWithTheAllowedEventsAndFieldsAndWithoutStaffIdentity() throws Exception {
  event(sanitary,dts,"FLIGHT","CREATE_SANITARY",null,"{\"tipo\":\"SANITARIO\"}",T0);
  event(sanitary,ops,"SANITARY_REQUEST","COUNTERPROPOSE","{\"estado\":\"SOLICITADO\"}","{\"estado\":\"PENDIENTE_RESPUESTA_DTS\",\"propuestaId\":9,\"salida\":\"2031-06-01T10:00\"}",T0.plusMinutes(1));
  event(sanitary,dts,"SANITARY_REQUEST","ACCEPT_COUNTERPROPOSAL","{\"estado\":\"PENDIENTE_RESPUESTA_DTS\"}","{\"estado\":\"APROBADO\",\"salida\":\"2031-06-01T10:00\"}",T0.plusMinutes(2));
  event(sanitary,ops,"FLIGHT","ASSIGN_RESOURCES",null,"{\"aeronaveId\":5,\"comandanteId\":"+commander.getId()+"}",T0.plusMinutes(3));          // interno
  event(sanitary,ops,"FLIGHT_CREW","CREATE",null,"{\"userId\":"+commander.getId()+",\"crewRoleCode\":\"MEDICO\"}",T0.plusMinutes(4));                  // interno
  event(sanitary,ops,"FLIGHT","CANCEL","{\"estado\":\"APROBADO\"}","{\"motivo\":\"Sin aeronave\",\"recursosLiberados\":{\"aeronaveId\":5}}",T0.plusMinutes(5));
  event(sanitary,ops,"FLIGHT_LOG","CREATE",null,"{\"descripcion\":\"interna\"}",T0.plusMinutes(6));                                                     // interno
  event(otherSanitary,otherDts,"SANITARY_REQUEST","APPROVE",null,"{\"estado\":\"APROBADO\"}",T0);                                                       // ajeno
  RequestPostProcessor me=as(dts,"DTS");
  String body=json("/api/audit/flights/"+sanitary.getId(),me,200);
  assertEquals(4,((Number)JsonPath.read(body,"$.total")).intValue(),"el total sólo cuenta lo que su perfil puede ver");
  assertEquals(List.of("CANCEL","ACCEPT_COUNTERPROPOSAL","COUNTERPROPOSE","CREATE_SANITARY"),JsonPath.<List<String>>read(body,"$.items[*].operation"));
  assertFalse(body.contains(ops.getUsername()),"no se identifica al personal ante el DTS");
  assertTrue(JsonPath.<List<String>>read(body,"$.items[*].actor.label").containsAll(List.of("Usted","Centro de Operaciones")));
  assertFalse(body.contains("propuestaId")||body.contains("aeronaveId")||body.contains("recursosLiberados"),"campos internos fuera de la lista blanca del DTS");
  String id=String.valueOf(((List<Integer>)JsonPath.read(body,"$.items[*].id")).get(3));
  String detail=json("/api/audit/events/"+id,me,200);assertTrue(detail.contains("SANITARIO"));
  // otro DTS, vuelo inexistente y sin credenciales
  json("/api/audit/flights/"+sanitary.getId(),as(otherDts,"DTS"),403);json("/api/audit/flights/"+otherSanitary.getId(),me,403);json("/api/audit/flights/987654",me,404);
  json("/api/audit/flights/"+operational.getId(),me,403);
  // detalle de eventos que no puede ver: siempre 404, sin distinguir inexistente de protegido
  List<AuditEvent> all=events.findAll();
  for(AuditEvent e:all.stream().filter(e->e.getFlight()!=null&&!e.getFlight().getId().equals(sanitary.getId())).limit(3).toList())json("/api/audit/events/"+e.getId(),me,404);
  AuditEvent internal=all.stream().filter(e->"FLIGHT_CREW".equals(e.getEntityType())&&e.getFlight().getId().equals(sanitary.getId())).findFirst().orElseThrow();
  json("/api/audit/events/"+internal.getId(),me,404);json("/api/audit/events/99999999",me,404);
  json("/api/audit/events/"+internal.getId(),as(admin,"ADMINISTRADOR"),200);
 }

 @Test void theCommanderSeesOnlyTheCurrentFlightAndLosesAccessWhenReplaced() throws Exception {
  event(sanitary,ops,"FLIGHT","ASSIGN_RESOURCES",null,"{\"aeronaveId\":5,\"comandanteId\":"+commander.getId()+"}",T0);
  event(sanitary,ops,"SANITARY_REQUEST","REJECT","{\"estado\":\"SOLICITADO\"}","{\"estado\":\"RECHAZADO\",\"motivo\":\"x\"}",T0.plusMinutes(1));            // evaluación: no es del comandante
  event(sanitary,ops,"SANITARY_REQUEST","APPROVE","{\"estado\":\"SOLICITADO\"}","{\"estado\":\"APROBADO\",\"salida\":\"2031-06-01T10:00\",\"detalleInterno\":\"x\"}",T0.plusMinutes(2));
  event(sanitary,ops,"DOCUMENT_LOCK","ACQUIRE",null,"{\"expiresAt\":\"x\"}",T0.plusMinutes(3));
  event(sanitary,commander,"FINAL_REPORT","SUBMIT",null,"{\"formato\":\"TEXTO\",\"version\":1}",T0.plusMinutes(4));
  event(sanitary,admin,"USER","USUARIO_DESACTIVADO",null,"{\"motivo\":\"baja\"}",T0.plusMinutes(5));                                                   // tipo no permitido
  RequestPostProcessor me=as(commander,"COMANDANTE");
  String body=json("/api/audit/flights/"+sanitary.getId(),me,200);
  assertEquals(List.of("SUBMIT","APPROVE","ASSIGN_RESOURCES"),JsonPath.<List<String>>read(body,"$.items[*].operation"));
  assertFalse(body.contains("detalleInterno"));
  json("/api/audit/flights/"+operational.getId(),me,403);json("/api/audit",me,403);
  for(AuditEvent e:events.findAll().stream().filter(e->"DOCUMENT_LOCK".equals(e.getEntityType())||"USER".equals(e.getEntityType())).toList())json("/api/audit/events/"+e.getId(),me,404);
  // reemplazo: el comandante anterior pierde el acceso (misma regla que el resto de las lecturas del vuelo) y el nuevo lo gana
  TransactionTemplate tx=new TransactionTemplate(txm);
  tx.executeWithoutResult(s->{Flight f=flights.findById(sanitary.getId()).orElseThrow();f.setComandante(formerCommander);flights.save(f);});
  json("/api/audit/flights/"+sanitary.getId(),me,403);
  json("/api/audit/flights/"+sanitary.getId(),as(formerCommander,"COMANDANTE"),200);
 }

 @Test void operationsSeeTheWholeFlightHistoryButNotEventsWithoutFlight() throws Exception {
  event(sanitary,ops,"FLIGHT","START",null,"{\"estado\":\"EN_CURSO\"}",T0);
  event(sanitary,ops,"FLIGHT_CREW","CREATE",null,"{\"userId\":"+commander.getId()+",\"crewRoleCode\":\"COMANDANTE\"}",T0.plusMinutes(1));
  AuditEvent flightless=event(null,admin,"AIRCRAFT","CREATE",null,"{\"matricula\":\"LV-X\"}",T0.plusMinutes(2));
  for(String r:List.of("OPERACIONES","CENTRO_OPERACIONES")){
   User u=r.equals("OPERACIONES")?ops:center;
   String body=json("/api/audit/flights/"+sanitary.getId(),as(u,r),200);
   assertEquals(2,((Number)JsonPath.read(body,"$.total")).intValue());
   assertTrue(body.contains("cmd Prueba"),"las referencias a personas se resuelven por lote ("+body+")");
  }
  json("/api/audit/events/"+flightless.getId(),as(ops,"OPERACIONES"),404);
  json("/api/audit/events/"+flightless.getId(),as(admin,"ADMINISTRADOR"),200);
 }

 @Test void sensitiveValuesAreMaskedForEveryProfileAndPartialDataIsExplained() throws Exception {
  AuditEvent secret=event(sanitary,ops,"FLIGHT","START","{\"passwordHash\":\"$2a$10$abc\",\"token\":\"eyJ\"}","{\"estado\":\"EN_CURSO\",\"clave\":\"s3cr3t\",\"diagnostico\":\"Politraumatismo\",\"temporaryPasswordIssued\":true}",T0);
  AuditEvent credential=event(null,admin,"PROFESSIONAL_CREDENTIAL","UPDATE","{\"number\":\"AB-123456\",\"status\":\"PENDIENTE\"}","{\"number\":\"AB-123456\",\"status\":\"VERIFICADA\"}",T0.plusMinutes(1));
  AuditEvent none=event(sanitary,ops,"FLIGHT","FINISH",null,null,T0.plusMinutes(2));
  AuditEvent noPrevious=event(null,admin,"AIRCRAFT","MANUAL_LOCATION_CHANGE",null,"{\"aeropuertoActualId\":2}",T0.plusMinutes(3));
  AuditEvent broken=event(sanitary,ops,"FLIGHT","COMPLETE","esto no es json","{\"estado\":\"COMPLETADO\"}",T0.plusMinutes(4));
  for(RequestPostProcessor viewer:List.of(as(admin,"ADMINISTRADOR"),as(ops,"OPERACIONES"))){
   String body=json("/api/audit/events/"+secret.getId(),viewer,200);
   for(String leak:List.of("$2a$10$abc","eyJ","s3cr3t","Politraumatismo"))assertFalse(body.contains(leak),"no debe filtrarse "+leak);
   assertTrue(body.contains("[oculto]"));List<String> flag=JsonPath.read(body,"$.changes[?(@.field=='temporaryPasswordIssued')].after");assertEquals(List.of("Sí"),flag);
  }
  String cred=json("/api/audit/events/"+credential.getId(),as(admin,"ADMINISTRADOR"),200);
  assertFalse(cred.contains("AB-123456"));assertTrue(cred.contains("••••3456"));
  assertTrue(JsonPath.<List<String>>read(json("/api/audit/events/"+none.getId(),as(ops,"OPERACIONES"),200),"$.notes[*]").get(0).contains("no registró valores"));
  assertTrue(JsonPath.<List<String>>read(json("/api/audit/events/"+noPrevious.getId(),as(admin,"ADMINISTRADOR"),200),"$.notes[*]").stream().anyMatch(n->n.contains("valor anterior")));
  String b=json("/api/audit/events/"+broken.getId(),as(ops,"OPERACIONES"),200);assertTrue(JsonPath.<List<String>>read(b,"$.notes[*]").get(0).contains("formato legible"));
  assertFalse(b.contains("esto no es json"));
 }

 @Test void historicalEventsKeepTheirResponsibleEvenWhenTheUserWasDeactivated() throws Exception {
  event(sanitary,disabled,"FLIGHT","START",null,"{\"estado\":\"EN_CURSO\"}",T0);
  event(sanitary,null,"FINAL_REPORT_OBLIGATION","OVERDUE","{\"estado\":\"PENDIENTE\"}","{\"comandanteBloqueado\":true}",T0.plusMinutes(1));
  String body=json("/api/audit/flights/"+sanitary.getId(),as(ops,"OPERACIONES"),200);
  assertEquals(Boolean.FALSE,JsonPath.read(body,"$.items[1].actor.active"));assertEquals(disabled.getUsername(),JsonPath.read(body,"$.items[1].actor.username"));
  assertTrue(((String)JsonPath.read(body,"$.items[1].actor.label")).contains("usuario desactivado"));
  assertEquals("Sistema (proceso automático)",JsonPath.read(body,"$.items[0].actor.label"));
  String filters=json("/api/audit/filters",as(admin,"ADMINISTRADOR"),200);
  assertTrue(JsonPath.<List<String>>read(filters,"$.actors[?(@.active==false)].username").contains(disabled.getUsername()),"el filtro de usuarios incluye a los desactivados");
  assertEquals(100,((Number)JsonPath.read(filters,"$.maxPageSize")).intValue());
 }

 @Test void eventsAreRecordedWithTheOperationAndNeverWithoutOne() {
  // sin transacción de negocio el registro se rechaza: nunca queda un evento huérfano
  assertThrows(org.springframework.transaction.IllegalTransactionStateException.class,()->audit.record(sanitary,ops,"FLIGHT",sanitary.getId(),"START",null,"{}"));
  long before=events.count();TransactionTemplate tx=new TransactionTemplate(txm);
  // una operación que falla después de auditar revierte también su evento
  assertThrows(IllegalStateException.class,()->tx.executeWithoutResult(s->{audit.record(sanitary,ops,"FLIGHT",sanitary.getId(),"START",null,"{\"estado\":\"EN_CURSO\"}");throw new IllegalStateException("falla posterior");}));
  assertEquals(before,events.count());
  // una operación exitosa confirma el evento junto con el cambio, con el responsable indicado y la hora del reloj de negocio en UTC
  Long id=tx.execute(s->audit.record(sanitary,ops,"FLIGHT",sanitary.getId(),"START",null,"{\"estado\":\"EN_CURSO\"}").getId());
  assertEquals(before+1,events.count());AuditEvent saved=events.findById(id).orElseThrow();
  assertTrue(Math.abs(java.time.Duration.between(saved.getOccurredAt(),LocalDateTime.now(java.time.ZoneOffset.UTC)).toMinutes())<=1);
 }

 @Test void persistedEventsCannotBeModifiedThroughThePersistenceLayer() {
  AuditEvent e=event(sanitary,ops,"FLIGHT","START",null,"{\"estado\":\"EN_CURSO\"}",T0);
  TransactionTemplate tx=new TransactionTemplate(txm);
  tx.executeWithoutResult(s->{AuditEvent managed=events.findById(e.getId()).orElseThrow();managed.setOperation("ALTERADO");managed.setNewValues("{\"estado\":\"X\"}");managed.setOccurredAt(T0.plusYears(1));events.saveAndFlush(managed);});
  AuditEvent reloaded=tx.execute(s->events.findById(e.getId()).orElseThrow());
  assertEquals("START",reloaded.getOperation());assertEquals("{\"estado\":\"EN_CURSO\"}",reloaded.getNewValues());assertEquals(T0,reloaded.getOccurredAt());
 }
}
