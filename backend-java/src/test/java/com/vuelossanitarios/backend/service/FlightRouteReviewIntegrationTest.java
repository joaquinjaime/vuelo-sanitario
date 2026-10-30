package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;

/**
 * Revisión operativa de rutas con los servicios reales, transacciones independientes y persistencia (H2 en modo SQL Server): el ciclo completo,
 * la invalidación por los caminos reales que cambian el vuelo y las carreras entre decidir, modificar e iniciar. La verificación equivalente
 * sobre SQL Server real (bloqueo de fila, restricciones de V55, auditoría y reinicio) está en scripts/e2e-rutas-revision.cjs.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:routereview;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=20000",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
class FlightRouteReviewIntegrationTest {
 @Autowired FlightService flightService; @Autowired FlightRouteService routeService; @Autowired CrewManagementService crewService;
 @Autowired FlightRouteRepository routes; @Autowired AuditEventRepository auditEvents; @Autowired AircraftRepository aircraft; @Autowired AirportRepository airports; @Autowired ProvinceRepository provinces; @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roleRepository; @Autowired UserRoleRepository userRoles; @Autowired CommanderProfileRepository commanderProfiles;
 @Autowired FlightRepository flights; @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses; @Autowired CrewRoleRepository crewRoles; @Autowired CrewQualificationRepository qualifications;
 @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager; private org.springframework.transaction.support.TransactionTemplate tx;
 @MockBean ProfessionalCredentialService credentials; @MockBean CommanderReportAccessService commanderAccess; @MockBean FlightLogService flightLog;

 private static int seq; private static synchronized int next(){return ++seq;}
 private static Province province; private static User ops,ops2;
 private Role role(String code){return roleRepository.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roleRepository.save(r);});}
 private CrewRole crewRole(String code){return crewRoles.findByCodigo(code).orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(code);return crewRoles.save(r);});}
 private FlightStatus status(String code){return statuses.findByCodigo(code).orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo(code);s.setNombre(code);s.setOrden((short)1);return statuses.save(s);});}
 private User user(String prefix,String roleCode,boolean commander){
  int n=next();Person p=new Person();p.setNombre(prefix);p.setApellido("T"+n);p.setDni(String.valueOf(50000000+n));persons.save(p);
  if(commander){CommanderProfile profile=new CommanderProfile();profile.setPerson(p);profile.setLicenseNumber("LIC-"+prefix+n);profile.setProvinciaActual(province);commanderProfiles.save(profile);}
  User u=new User();u.setUsername(prefix+n);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");users.save(u);
  userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }
 private User qualified(User u,String code){CrewQualification q=new CrewQualification();q.setUser(u);q.setRole(crewRole(code));q.setClassifier(ops);qualifications.save(q);return u;}
 private Airport airport(String name){int n=next();Airport a=new Airport();a.setNombre(name+n);a.setActivo(true);a.setProvinciaReferencial(province);a.setCodigoOaci(String.format("R%03d",n));a.setCodigoIata(String.format("%03d",n));return airports.save(a);}
 private Aircraft plane(Airport at){int n=next();Aircraft a=new Aircraft();a.setMatricula("LV-R"+n);a.setModelo("M");a.setTipo("T");a.setCapacidadPacientes((short)1);a.setCapacidadTripulacion((short)4);a.setActivo(true);a.setAeropuertoActual(at);return aircraft.save(a);}

 @BeforeEach void setUp(){tx=new org.springframework.transaction.support.TransactionTemplate(transactionManager);bootstrap();when(credentials.assess(any(),any(),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));}
 private synchronized void bootstrap(){
  if(ops!=null)return;
  Province p=new Province();p.setCodigoOficial("R1");p.setNombre("Provincia rutas");p.setActivo(true);province=provinces.save(p);
  ops=user("ops","CENTRO_OPERACIONES",false);ops2=user("ops","OPERACIONES",false);
  FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");t.setNombre("Regreso");types.save(t);
  for(String s:List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PLANIFICADO","CANCELADO","EN_CURSO","FINALIZADO"))status(s);
  crewRole("COMANDANTE");crewRole("MEDICO");
 }

 /** Vuelo operativo en PLANIFICADO con su comandante, aeronave y aeropuerto de origen. */
 private static final class Scenario{Flight flight;User commander;Airport origin,destination;Aircraft plane;Long id(){return flight.getId();}}
 private int day=300;
 private Scenario planned(){
  Scenario s=new Scenario();s.origin=airport("Origen");s.destination=airport("Destino");s.plane=plane(s.origin);s.commander=qualified(user("cmd","COMANDANTE",true),"COMANDANTE");
  LocalDateTime from=LocalDateTime.now().plusDays(day+=2).withNano(0);
  FlightView created=flightService.createOperational(new CreateOperationalFlight("REGRESO_BASE","Prueba de ruta",s.plane.getId(),s.commander.getId(),s.destination.getId(),from,from.plusHours(3)),ops.getId());
  flightService.respondToOperationalAssignment(created.id(),new CommanderResponse(true,null,null,null),s.commander.getId());
  s.flight=flights.findById(created.id()).orElseThrow();assertEquals("PLANIFICADO",stateOf(s.id()));return s;
 }
 private String stateOf(Long id){return tx.execute(st->flights.findById(id).orElseThrow().getEstadoVuelo().getCodigo());}
 private FlightRouteService.Input input(int version,String route,String reason,boolean present){return new FlightRouteService.Input(version,route,null,null,null,null,null,reason,present);}
 private int currentVersion(Scenario s){return tx.execute(st->routes.findByFlightIdAndEsVersionActualTrue(s.id()).map(FlightRoute::getVersion).orElse(0));}
 private FlightRoute current(Scenario s){return routes.findByFlightIdAndEsVersionActualTrue(s.id()).orElseThrow();}
 private void approved(Scenario s){routeService.save(s.id(),s.commander.getId(),input(currentVersion(s),"TUC - AEP directo",currentVersion(s)==0?null:"Reconfirmo la ruta vigente",true));routeService.approve(s.id(),ops.getId(),new FlightRouteService.Approve(currentVersion(s),null));}
 private ApiException startRejected(Scenario s){return assertThrows(ApiException.class,()->flightService.start(s.id(),ops.getId()));}
 private List<String> auditOf(Long routeId){return auditEvents.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("FLIGHT_ROUTE",routeId).stream().map(AuditEvent::getOperation).toList();}

 @Test void theCompleteCycleIsPersistedWithVersionsDecisionsActorsDatesAndAudit(){
  Scenario s=planned();Long cmd=s.commander.getId();
  assertEquals("RUTA_NO_DEFINIDA",startRejected(s).code());assertEquals("PLANIFICADO",stateOf(s.id()));
  routeService.save(s.id(),cmd,input(0,"TUC - AEP directo",null,false));assertEquals("RUTA_NO_PRESENTADA",startRejected(s).code());
  routeService.submit(s.id(),cmd,new FlightRouteService.Submit(1));assertEquals("RUTA_PENDIENTE_REVISION",startRejected(s).code());
  routeService.sendBack(s.id(),ops.getId(),new FlightRouteService.Return(1,"Indique el aeropuerto alternativo"));
  ApiException returned=startRejected(s);assertEquals("RUTA_DEVUELTA",returned.code());assertEquals(HttpStatus.CONFLICT,returned.status());assertEquals("PLANIFICADO",stateOf(s.id()));
  routeService.save(s.id(),cmd,new FlightRouteService.Input(1,"TUC - AEP directo",null,new java.math.BigDecimal("9000"),new java.math.BigDecimal("620.5"),95,"Corregida",
   "Respondo a la devolución con altitud y distancia",true));
  assertEquals("RUTA_PENDIENTE_REVISION",startRejected(s).code());
  routeService.approve(s.id(),ops.getId(),new FlightRouteService.Approve(2,"Conforme"));
  flightService.start(s.id(),ops.getId());assertEquals("EN_CURSO",stateOf(s.id()));
  tx.executeWithoutResult(st->{
   List<FlightRoute> all=routes.findByFlightIdOrderByVersionDesc(s.id());assertEquals(2,all.size());FlightRoute v2=all.get(0),v1=all.get(1);
   assertTrue(v2.getEsVersionActual());assertEquals(FlightRoute.APROBADA,v2.getEstadoRevision());assertEquals(ops.getId(),v2.getRevisadoPor().getId());assertEquals(cmd,v2.getPresentadoPor().getId());assertEquals(cmd,v2.getCreadoPor().getId());
   assertNotNull(v2.getFechaRevision());assertNotNull(v2.getFechaPresentacion());assertEquals("Conforme",v2.getObservacionesRevision());assertEquals("Respondo a la devolución con altitud y distancia",v2.getMotivoModificacion());assertEquals(95,v2.getTiempoEstimadoMinutos());
   assertFalse(v1.getEsVersionActual());assertEquals(FlightRoute.DEVUELTA,v1.getEstadoRevision());assertEquals("Indique el aeropuerto alternativo",v1.getObservacionesRevision());assertEquals(ops.getId(),v1.getRevisadoPor().getId());assertNull(v1.getTiempoEstimadoMinutos());
   assertEquals(3,auditOf(v1.getId()).size());assertEquals(3,auditOf(v2.getId()).size());
   assertTrue(auditOf(v1.getId()).containsAll(List.of("CREATE","SUBMIT","RETURN")),auditOf(v1.getId()).toString());assertTrue(auditOf(v2.getId()).containsAll(List.of("UPDATE","SUBMIT","APPROVE")),auditOf(v2.getId()).toString());
  });
 }

 @Test void aRejectedStartIsAuditedInItsOwnTransaction(){
  Scenario s=planned();ApiException e=startRejected(s);flightService.auditRejectedRouteStart(s.id(),ops.getId(),e.code(),e.getMessage());
  List<AuditEvent> events=tx.execute(st->auditEvents.findAll().stream().filter(x->"START_REJECTED".equals(x.getOperation())&&x.getFlight().getId().equals(s.id())).toList());
  assertEquals(1,events.size());assertTrue(events.get(0).getNewValues().contains("RUTA_NO_DEFINIDA"));assertEquals("FLIGHT_ROUTE",events.get(0).getEntityType());
 }

 @Test void changesMadeThroughTheRealServicesInvalidateWhenMaterialAndNotWhenAdministrative(){
  Scenario s=planned();approved(s);
  User medic=qualified(user("med","MEDICO",false),"MEDICO");
  crewService.assign(s.id(),new Crew(medic.getId(),"MEDICO"),ops.getId());                 // administrativo: tripulación
  assertEquals(FlightRoute.APROBADA,tx.execute(st->current(s).getEstadoRevision()));
  Aircraft other=plane(s.origin);flightService.changeAircraft(s.id(),new ChangeAircraft(other.getId(),"Mantenimiento de la aeronave original"),ops.getId());  // material: aeronave
  FlightRoute r=tx.execute(st->current(s));assertEquals(FlightRoute.REQUIERE_REVISION,r.getEstadoRevision());assertTrue(r.getCausaInvalidacion().contains("aeronave"),r.getCausaInvalidacion());
  assertTrue(tx.execute(st->auditOf(current(s).getId())).contains("INVALIDATE"));
  assertEquals("PLANIFICADO",stateOf(s.id()));assertEquals("RUTA_REQUIERE_REVISION",startRejected(s).code());
  ApiException noMotive=assertThrows(ApiException.class,()->routeService.save(s.id(),s.commander.getId(),input(1,"TUC - AEP directo",null,true)));assertEquals("MOTIVO_MODIFICACION_REQUERIDO",noMotive.code());
  routeService.save(s.id(),s.commander.getId(),input(1,"TUC - AEP directo","Reconfirmo la ruta con la nueva aeronave",true));assertEquals("RUTA_PENDIENTE_REVISION",startRejected(s).code());
  routeService.approve(s.id(),ops2.getId(),new FlightRouteService.Approve(2,null));
  flightService.start(s.id(),ops.getId());assertEquals("EN_CURSO",stateOf(s.id()));
  assertEquals(FlightRoute.REQUIERE_REVISION,tx.execute(st->routes.findByFlightIdOrderByVersionDesc(s.id()).get(1).getEstadoRevision())); // la versión 1 conserva su aprobación invalidada
  assertEquals(ops.getId(),tx.execute(st->routes.findByFlightIdOrderByVersionDesc(s.id()).get(1).getRevisadoPor().getId()));
 }

 @Test void movingTheAircraftToAnotherAirportChangesTheOriginSoTheApprovalIsInvalidatedAndTheCommanderMustConfirmAgain(){
  Scenario s=planned();approved(s);
  Aircraft elsewhere=plane(airport("Otro"));flightService.changeAircraft(s.id(),new ChangeAircraft(elsewhere.getId(),"La aeronave original quedó fuera de servicio"),ops.getId());
  FlightRoute r=tx.execute(st->current(s));assertEquals(FlightRoute.REQUIERE_REVISION,r.getEstadoRevision());assertTrue(r.getCausaInvalidacion().contains("origen"),r.getCausaInvalidacion());
  assertEquals("PENDIENTE_CONFIRMACION_COMANDANTE",stateOf(s.id()));
  FlightRouteService.View view=routeService.get(s.id(),ops.getId());assertEquals("REQUIERE_REVISION",view.estado());assertFalse(view.inicio().permitido());assertTrue(view.causas().stream().anyMatch(c->c.contains("origen")));
 }

 @Test void twoOperatorsApprovingTheSameVersionAtTheSameTimeProduceOneApproval() throws Exception {
  for(int round=0;round<3;round++){
   Scenario s=planned();routeService.save(s.id(),s.commander.getId(),input(0,"TUC - AEP directo",null,true));
   List<Object> results=race(List.of(()->routeService.approve(s.id(),ops.getId(),new FlightRouteService.Approve(1,null)),()->routeService.approve(s.id(),ops2.getId(),new FlightRouteService.Approve(1,null))));
   assertEquals(1,successes(results),"ronda "+round+": "+results);
   for(Object r:results)if(r instanceof Throwable t){assertEquals("TRANSICION_RUTA_NO_PERMITIDA",((ApiException)t).code());}
   assertEquals(FlightRoute.APROBADA,tx.execute(st->current(s).getEstadoRevision()));assertEquals(1,currentVersion(s));
  }
 }

 @Test void approvalRacingWithTheCommanderCreatingTheNextVersionNeverApprovesTheObsoleteOne() throws Exception {
  for(int round=0;round<4;round++){
   Scenario s=planned();routeService.save(s.id(),s.commander.getId(),input(0,"TUC - AEP directo",null,true));
   List<Object> results=race(List.of(()->routeService.approve(s.id(),ops.getId(),new FlightRouteService.Approve(1,null)),()->routeService.save(s.id(),s.commander.getId(),input(1,"Recorrido nuevo por otra aerovía","Cambio de aerovía por tránsito",false))));
   for(Object r:results)if(r instanceof Throwable t){if(t instanceof org.springframework.dao.ConcurrencyFailureException)continue;ApiException e=assertInstanceOf(ApiException.class,t,String.valueOf(t));assertEquals(HttpStatus.CONFLICT,e.status(),"ronda "+round+": "+e.getMessage());}
   FlightRoute head=tx.execute(st->current(s));
   if(head.getVersion()==2){ // la nueva versión es la vigente y nunca hereda la aprobación de la anterior
    assertEquals(FlightRoute.BORRADOR,head.getEstadoRevision());assertNull(head.getRevisadoPor());
    assertEquals("RUTA_NO_PRESENTADA",startRejected(s).code());
    assertTrue(Set.of(FlightRoute.APROBADA,FlightRoute.SIN_REVISION).contains(tx.execute(st->routes.findByFlightIdOrderByVersionDesc(s.id()).get(1).getEstadoRevision())));
   }else{assertEquals(FlightRoute.APROBADA,head.getEstadoRevision());}
  }
 }

 @Test void startRacingWithAMaterialChangeNeverStartsOnAnObsoleteApproval() throws Exception {
  for(int round=0;round<4;round++){
   Scenario s=planned();approved(s);Aircraft other=plane(s.origin);
   List<Object> results=race(List.of(()->flightService.start(s.id(),ops.getId()),()->flightService.changeAircraft(s.id(),new ChangeAircraft(other.getId(),"Cambio de aeronave por mantenimiento"),ops2.getId())));
   for(Object r:results)if(r instanceof Throwable t)assertTrue(t instanceof ApiException||t instanceof org.springframework.dao.ConcurrencyFailureException,String.valueOf(t));
   String state=stateOf(s.id());Long aircraftId=tx.execute(st->flights.findById(s.id()).orElseThrow().getAircraft().getId());FlightRoute r=tx.execute(st->current(s));
   if("EN_CURSO".equals(state)){assertEquals(s.plane.getId(),aircraftId,"ronda "+round);assertEquals(FlightRoute.APROBADA,r.getEstadoRevision());}
   else{assertEquals("PLANIFICADO",state);assertEquals(other.getId(),aircraftId,"ronda "+round);assertEquals(FlightRoute.REQUIERE_REVISION,r.getEstadoRevision());assertEquals("RUTA_REQUIERE_REVISION",startRejected(s).code());}
  }
 }

 @Test void thePendingQueueReflectsTheSameEvaluationAsTheView(){
  Scenario s=planned();routeService.save(s.id(),s.commander.getId(),input(0,"TUC - AEP directo",null,true));
  FlightRouteService.Status status=routeService.statuses().stream().filter(x->x.flightId().equals(s.id())).findFirst().orElseThrow();
  assertEquals("PENDIENTE_REVISION",status.estado());assertTrue(status.bloqueaInicio());assertEquals(1,status.version());
  assertEquals(status.estado(),routeService.get(s.id(),ops.getId()).estado());
 }

 private List<Object> race(List<Callable<Object>> tasks) throws Exception {
  ExecutorService pool=Executors.newFixedThreadPool(tasks.size());CyclicBarrier barrier=new CyclicBarrier(tasks.size());List<Future<Object>> futures=new ArrayList<>();
  for(Callable<Object> task:tasks)futures.add(pool.submit(()->{barrier.await(10,TimeUnit.SECONDS);try{return task.call();}catch(Throwable e){return e;}}));
  List<Object> results=new ArrayList<>();for(Future<Object> f:futures)results.add(f.get(60,TimeUnit.SECONDS));pool.shutdown();return results;
 }
 private long successes(List<Object> results){return results.stream().filter(r->!(r instanceof Throwable)).count();}
}
