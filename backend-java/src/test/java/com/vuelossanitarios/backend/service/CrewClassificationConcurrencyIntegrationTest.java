package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
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
 * Clasificación administrativa de tripulación bajo concurrencia real (H2 en modo SQL Server): retirar la clasificación contra asignar a esa función,
 * clasificar y retirar dos veces a la vez, y reclasificar conservando el historial. La verificación equivalente en SQL Server real, con su restricción
 * única filtrada de V58, está en scripts/e2e-roles-clasificaciones.cjs.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:crewclassification;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=20000",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
class CrewClassificationConcurrencyIntegrationTest {
 @Autowired CrewManagementService crewService; @Autowired FlightService flightService;
 @Autowired CrewQualificationRepository qualifications; @Autowired AircraftRepository aircraft; @Autowired AirportRepository airports; @Autowired ProvinceRepository provinces; @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roleRepository; @Autowired UserRoleRepository userRoles; @Autowired CommanderProfileRepository commanderProfiles;
 @Autowired FlightRepository flights; @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses; @Autowired CrewRoleRepository crewRoles; @Autowired FlightCrewRepository crews;
 @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager; private org.springframework.transaction.support.TransactionTemplate tx;
 @MockBean ProfessionalCredentialService credentials; @MockBean CommanderReportAccessService commanderAccess; @MockBean FlightLogService flightLog;

 private static int seq; private static synchronized int next(){return ++seq;}
 private static Province province; private static User ops;
 private Role role(String code){return roleRepository.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roleRepository.save(r);});}
 private CrewRole crewRole(String code){return crewRoles.findByCodigo(code).orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(code);return crewRoles.save(r);});}
 private FlightStatus status(String code){return statuses.findByCodigo(code).orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo(code);s.setNombre(code);s.setOrden((short)1);return statuses.save(s);});}
 private User user(String prefix,String roleCode,boolean commander){
  int n=next();Person p=new Person();p.setNombre(prefix);p.setApellido("T"+n);p.setDni(String.valueOf(80000000+n));persons.save(p);
  if(commander){CommanderProfile profile=new CommanderProfile();profile.setPerson(p);profile.setLicenseNumber("LIC-"+prefix+n);profile.setProvinciaActual(province);commanderProfiles.save(profile);}
  User u=new User();u.setUsername(prefix+n);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");users.save(u);
  userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }
 private User classified(User u,String code){crewService.classify(u.getId(),code,ops.getId());return u;}
 private Flight plannedFlight(LocalDateTime from,LocalDateTime to){
  FlightType type=types.findByCodigoAndActivoTrue("REGRESO_BASE").orElseThrow();Flight f=new Flight();f.setCodigo("V-CL"+next()+"-"+System.nanoTime()%100000);f.setTipoVuelo(type);f.setMotivoVuelo("Prueba");f.setCreadoPor(ops);
  f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);f.setEstadoVuelo(status("PLANIFICADO"));return flights.save(f);
 }
 private long rows(Long userId,String code){return tx.execute(st->qualifications.findAllByUserId(userId).stream().filter(q->q.getRole().getCodigo().equals(code)).count());}
 private long vigentes(Long userId,String code){return tx.execute(st->qualifications.findAllByUserId(userId).stream().filter(q->q.getRole().getCodigo().equals(code)&&q.isVigente()).count());}

 @BeforeEach void setUp(){tx=new org.springframework.transaction.support.TransactionTemplate(transactionManager);bootstrap();when(credentials.assess(any(),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));}
 private synchronized void bootstrap(){
  if(ops!=null)return;
  Province p=new Province();p.setCodigoOficial("CL1");p.setNombre("Provincia clasificación");p.setActivo(true);province=provinces.save(p);
  ops=user("ops","CENTRO_OPERACIONES",false);
  FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");t.setNombre("Regreso");types.save(t);
  for(String s:List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PLANIFICADO","CANCELADO","EN_CURSO","FINALIZADO"))status(s);
  for(String c:CrewManagementService.RULES.keySet())crewRole(c);
 }
 private List<Object> race(List<Callable<Object>> tasks) throws Exception {
  ExecutorService pool=Executors.newFixedThreadPool(tasks.size());CyclicBarrier barrier=new CyclicBarrier(tasks.size());List<Future<Object>> futures=new ArrayList<>();
  for(Callable<Object> task:tasks)futures.add(pool.submit(()->{barrier.await(10,TimeUnit.SECONDS);try{return task.call();}catch(Throwable e){return e;}}));
  List<Object> results=new ArrayList<>();for(Future<Object> f:futures)results.add(f.get(60,TimeUnit.SECONDS));pool.shutdown();return results;
 }
 private long successes(List<Object> results){return results.stream().filter(r->!(r instanceof Throwable)).count();}
 /** Un fallo de concurrencia (p. ej. la instantánea de H2) equivale al 409 CONCURRENT_MODIFICATION del manejador de errores. */
 private void assertControlled(List<Object> results){for(Object r:results)if(r instanceof Throwable t){if(t instanceof org.springframework.dao.ConcurrencyFailureException)continue;assertTrue(t instanceof ApiException,"excepción inesperada: "+t);assertEquals(HttpStatus.CONFLICT,((ApiException)t).status(),t.getMessage());}}

 @Test void retiringTheClassificationWhileAnAssignmentToThatFunctionIsProcessedHasOneWinner() throws Exception {
  int retired=0,assigned=0;
  for(int round=0;round<6;round++){
   User member=classified(user("med","MEDICO",false),"MEDICO");LocalDateTime from=LocalDateTime.now().plusDays(200+round*3).withNano(0);Flight f=plannedFlight(from,from.plusHours(2));
   List<Object> results=race(List.of(()->{crewService.assign(f.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());return "asignado";},()->{crewService.unclassify(member.getId(),"MEDICO","Prueba de carrera",ops.getId());return "retirado";}));
   assertEquals(1,successes(results),"ronda "+round+": "+results);assertControlled(results);
   int active=crews.findByUserIdAndFechaBajaIsNull(member.getId()).size();long vigente=vigentes(member.getId(),"MEDICO");
   if(results.get(0) instanceof Throwable){assertEquals(0,active,"retirada la clasificación, no queda una asignación apoyada en ella");assertEquals(0,vigente);retired++;}
   else{assertEquals(1,active);assertEquals(1,vigente,"con una asignación vigente la clasificación no se retira");assigned++;}
   assertEquals(1,rows(member.getId(),"MEDICO"),"nunca se borra la fila");
  }
  assertEquals(6,retired+assigned);
 }
 /*
  * La carrera «retirar la clasificación de COMANDANTE contra asignar al comandante» usa transacciones SERIALIZABLE (createOperational/assign): H2 las implementa
  * como instantánea y el asignador leería la clasificación anterior al bloqueo; SQL Server, con bloqueos por rango, lee lo confirmado. Se verifica en
  * scripts/e2e-roles-clasificaciones.cjs contra SQL Server real.
  */
 @Test void twoSimultaneousClassificationsOfTheSamePersonLeaveOneCurrentRow() throws Exception {
  User member=user("med","MEDICO",false);
  List<Object> results=race(List.of(()->{crewService.classify(member.getId(),"MEDICO",ops.getId());return 1;},()->{crewService.classify(member.getId(),"MEDICO",ops.getId());return 2;},()->{crewService.classify(member.getId(),"MEDICO",ops.getId());return 3;}));
  assertControlled(results);assertTrue(successes(results)>=1);assertEquals(1,vigentes(member.getId(),"MEDICO"));assertEquals(1,rows(member.getId(),"MEDICO"),"sin duplicados");
 }
 @Test void twoSimultaneousRetirementsConfirmExactlyOneAndKeepASingleHistoricalRow() throws Exception {
  User member=classified(user("med","MEDICO",false),"MEDICO");
  List<Object> results=race(List.of(()->{crewService.unclassify(member.getId(),"MEDICO","Uno",ops.getId());return 1;},()->{crewService.unclassify(member.getId(),"MEDICO","Dos",ops.getId());return 2;}));
  assertEquals(1,successes(results),results.toString());assertControlled(results);assertEquals(0,vigentes(member.getId(),"MEDICO"));assertEquals(1,rows(member.getId(),"MEDICO"));
 }
 @Test void reclassifyingAfterARetirementCreatesANewRowAndKeepsTheHistoryInterpretable() {
  User member=classified(user("med","MEDICO",false),"MEDICO");
  crewService.unclassify(member.getId(),"MEDICO","Cambio de función",ops.getId());
  crewService.classify(member.getId(),"MEDICO",ops.getId());
  List<QualificationView> all=crewService.qualifications(member.getId(),true);
  assertEquals(2,all.size());assertTrue(all.get(0).vigente());assertFalse(all.get(1).vigente());assertEquals("Cambio de función",all.get(1).motivoBaja());assertNotNull(all.get(1).fechaBaja());assertNotNull(all.get(1).fechaClasificacion());assertEquals(ops.getUsername(),all.get(1).retiradoPor());assertEquals(1,crewService.qualifications(member.getId(),false).size());
  Flight f=plannedFlight(LocalDateTime.now().plusDays(500).withNano(0),LocalDateTime.now().plusDays(500).plusHours(2).withNano(0));
  crewService.assign(f.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());
  ApiException inUse=assertThrows(ApiException.class,()->crewService.unclassify(member.getId(),"MEDICO","Otro",ops.getId()));assertEquals("CLASIFICACION_EN_USO",inUse.code());
 }
 @Test void aPersonWithoutTheClassificationCannotBeAssignedEvenWithDirectCalls() {
  User member=user("med","MEDICO",false);Flight f=plannedFlight(LocalDateTime.now().plusDays(520).withNano(0),LocalDateTime.now().plusDays(520).plusHours(2).withNano(0));
  ApiException e=assertThrows(ApiException.class,()->crewService.assign(f.getId(),new Crew(member.getId(),"MEDICO"),ops.getId()));assertEquals("CLASIFICACION_INCOMPATIBLE",e.code());
  assertEquals(0,crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()).size());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->crewService.assign(f.getId(),new Crew(member.getId(),"PILOTO_INEXISTENTE"),ops.getId())).status());
 }
}
