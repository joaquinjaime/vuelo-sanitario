package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AircraftDtos.AircraftRequest;
import com.vuelossanitarios.backend.api.dto.AircraftDtos.AircraftUpdateRequest;
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
 * Concurrencia real sobre transacciones independientes (H2 en modo SQL Server): los conflictos de aeronave y tripulante
 * producen un único resultado válido. La verificación equivalente sobre SQL Server real está en scripts/e2e-aeronaves-tripulacion.cjs.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:aircraftcrewconcurrency;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=20000",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
class AircraftCrewConcurrencyIntegrationTest {
 @Autowired FlightService flightService; @Autowired CrewManagementService crewService; @Autowired AircraftAdminService aircraftAdmin;
 @Autowired AircraftRepository aircraft; @Autowired AirportRepository airports; @Autowired ProvinceRepository provinces; @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roleRepository; @Autowired UserRoleRepository userRoles; @Autowired CommanderProfileRepository commanderProfiles;
 @Autowired FlightRepository flights; @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses; @Autowired CrewRoleRepository crewRoles; @Autowired CrewQualificationRepository qualifications; @Autowired FlightCrewRepository crews; @Autowired CancellationReasonRepository reasons;
 @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager; private org.springframework.transaction.support.TransactionTemplate tx; private String stateOf(Long flightId){return tx.execute(st->flights.findById(flightId).orElseThrow().getEstadoVuelo().getCodigo());}
 @MockBean ProfessionalCredentialService credentials; @MockBean CommanderReportAccessService commanderAccess; @MockBean FlightLogService flightLog;

 private static final AtomicSeq SEQ=new AtomicSeq();
 static final class AtomicSeq{private int n;synchronized int next(){return ++n;}}
 private static Province province; private static User ops;
 private Role role(String code){return roleRepository.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roleRepository.save(r);});}
 private CrewRole crewRole(String code){return crewRoles.findByCodigo(code).orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(code);return crewRoles.save(r);});}
 private FlightStatus status(String code){return statuses.findByCodigo(code).orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo(code);s.setNombre(code);s.setOrden((short)1);return statuses.save(s);});}
 private User user(String prefix,String roleCode,boolean commander){
  int n=SEQ.next();Person p=new Person();p.setNombre(prefix);p.setApellido("T"+n);p.setDni(String.valueOf(40000000+n));
  persons.save(p);
  if(commander){CommanderProfile profile=new CommanderProfile();profile.setPerson(p);profile.setLicenseNumber("LIC-"+prefix+n);profile.setProvinciaActual(province);commanderProfiles.save(profile);}
  User u=new User();u.setUsername(prefix+n);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");users.save(u);
  userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }
 private User qualified(User u,String code){CrewQualification q=new CrewQualification();q.setUser(u);q.setRole(crewRole(code));q.setClassifier(ops);qualifications.save(q);return u;}
 private Airport airport(String name){int n=SEQ.next();Airport a=new Airport();a.setNombre(name+n);a.setActivo(true);a.setProvinciaReferencial(province);a.setCodigoOaci(String.format("C%03d",n));a.setCodigoIata(String.format("%03d",n));return airports.save(a);}
 private Aircraft plane(Airport at){int n=SEQ.next();Aircraft a=new Aircraft();a.setMatricula("LV-C"+n);a.setModelo("M");a.setTipo("T");a.setCapacidadPacientes((short)1);a.setCapacidadTripulacion((short)4);a.setActivo(true);a.setAeropuertoActual(at);return aircraft.save(a);}
 private User commander(){return qualified(user("cmd","COMANDANTE",true),"COMANDANTE");}
 private CreateOperationalFlight create(Aircraft plane,User cmd,Airport destination,LocalDateTime from,LocalDateTime to){return new CreateOperationalFlight("REGRESO_BASE","Prueba concurrente",plane.getId(),cmd.getId(),destination.getId(),from,to);}

 @BeforeEach void stubCredentials(){tx=new org.springframework.transaction.support.TransactionTemplate(transactionManager);bootstrap();when(credentials.sufficient(any(),any(),any())).thenReturn(true);}
 private synchronized void bootstrap(){
  if(ops!=null)return;
  Province p=new Province();p.setCodigoOficial("C1");p.setNombre("Provincia concurrencia");p.setActivo(true);province=provinces.save(p);
  ops=user("ops","CENTRO_OPERACIONES",false);
  FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");t.setNombre("Regreso");types.save(t);
  for(String s:List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PLANIFICADO","CANCELADO","EN_CURSO","FINALIZADO"))status(s);
  crewRole("COMANDANTE");crewRole("MEDICO");
  CancellationReason r=new CancellationReason();r.setCodigo("CLIMA");r.setNombre("Clima");r.setCategoria("AERONAUTICO");r.setOrden((short)1);reasons.save(r);

 }

 /** Ejecuta las tareas a la vez (barrera común) y devuelve su resultado o la excepción lanzada. */
 private List<Object> race(List<Callable<Object>> tasks) throws Exception {
  ExecutorService pool=Executors.newFixedThreadPool(tasks.size());CyclicBarrier barrier=new CyclicBarrier(tasks.size());List<Future<Object>> futures=new ArrayList<>();
  for(Callable<Object> task:tasks)futures.add(pool.submit(()->{barrier.await(10,TimeUnit.SECONDS);try{return task.call();}catch(Throwable e){return e;}}));
  List<Object> results=new ArrayList<>();for(Future<Object> f:futures)results.add(f.get(60,TimeUnit.SECONDS));pool.shutdown();return results;
 }
 private long successes(List<Object> results){return results.stream().filter(r->!(r instanceof Throwable)).count();}
 private void assertConflicts(List<Object> results,HttpStatus... allowed){
  for(Object r:results)if(r instanceof Throwable t){assertTrue(t instanceof ApiException,"excepción inesperada: "+t);assertTrue(Arrays.asList(allowed).contains(((ApiException)t).status()),"estado inesperado: "+((ApiException)t).status()+" "+t.getMessage());}
 }

 /*
  * Las carreras por la misma aeronave entre creaciones de vuelos operativos (aislamiento SERIALIZABLE) y entre una baja y una asignación
  * se verifican contra SQL Server real en scripts/e2e-aeronaves-tripulacion.cjs: H2 implementa SERIALIZABLE como aislamiento por instantánea
  * y no reproduce el bloqueo por rangos de SQL Server, por lo que aquí se prueba el resultado secuencial equivalente.
  */
 @Test void asecondFlightInAnIncompatibleWindowIsRejectedAndTheFirstOneStaysIntact() throws Exception {
  Airport origin=airport("Origen"),destination=airport("Destino");Aircraft shared=plane(origin);User c1=commander(),c2=commander();
  LocalDateTime from=LocalDateTime.now().plusDays(10).withNano(0);
  FlightView first=flightService.createOperational(create(shared,c1,destination,from,from.plusHours(3)),ops.getId());
  ApiException overlap=assertThrows(ApiException.class,()->flightService.createOperational(create(shared,c2,destination,from.plusHours(1),from.plusHours(4)),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,overlap.status());
  ApiException contained=assertThrows(ApiException.class,()->flightService.createOperational(create(shared,c2,destination,from.minusHours(1),from.plusHours(5)),ops.getId()));assertEquals(HttpStatus.CONFLICT,contained.status());
  FlightView adjacent=flightService.createOperational(create(shared,c2,destination,from.plusHours(3),from.plusHours(5)),ops.getId());assertNotNull(adjacent.id());
  assertEquals(2,flights.findAll().stream().filter(f->f.getAircraft()!=null&&f.getAircraft().getId().equals(shared.getId())).count());assertEquals("PENDIENTE_CONFIRMACION_COMANDANTE",stateOf(first.id()));
 }
 @Test void anAircraftWithACommittedFlightCannotBeDeactivatedUntilItIsCancelled() throws Exception {
  Airport origin=airport("Origen"),destination=airport("Destino");Aircraft shared=plane(origin);User c1=commander();LocalDateTime from=LocalDateTime.now().plusDays(120).withNano(0);
  FlightView flight=flightService.createOperational(create(shared,c1,destination,from,from.plusHours(2)),ops.getId());
  ApiException blocked=assertThrows(ApiException.class,()->aircraftAdmin.setActive(shared.getId(),false,null,ops.getId()));assertEquals("AIRCRAFT_HAS_ASSIGNMENTS",blocked.code());assertTrue(aircraft.findById(shared.getId()).orElseThrow().getActivo());
  flightService.cancel(flight.id(),new Cancel(reasons.findAll().get(0).getId(),null),ops.getId());
  aircraftAdmin.setActive(shared.getId(),false,null,ops.getId());assertFalse(aircraft.findById(shared.getId()).orElseThrow().getActivo());
  ApiException inactive=assertThrows(ApiException.class,()->flightService.createOperational(create(shared,c1,destination,from.plusDays(3),from.plusDays(3).plusHours(2)),ops.getId()));assertEquals(HttpStatus.BAD_REQUEST,inactive.status());
 }
 @Test void flightsInNonOverlappingWindowsBothSucceedOnTheSameAircraft() throws Exception {
  Airport origin=airport("Origen"),destination=airport("Destino");Aircraft shared=plane(origin);User c1=commander(),c2=commander();
  LocalDateTime from=LocalDateTime.now().plusDays(40).withNano(0);
  List<Object> results=race(List.of(()->flightService.createOperational(create(shared,c1,destination,from,from.plusHours(2)),ops.getId()),()->flightService.createOperational(create(shared,c2,destination,from.plusHours(5),from.plusHours(7)),ops.getId())));
  assertEquals(2,successes(results),results.toString());
 }
 @Test void theSameCrewMemberCannotBeAssignedToTwoIncompatibleFlightsSimultaneously() throws Exception {

  for(int round=0;round<4;round++){
   User member=qualified(user("med","MEDICO",false),"MEDICO");LocalDateTime from=LocalDateTime.now().plusDays(60+round*3).withNano(0);
   Flight f1=plannedFlight(from,from.plusHours(3)),f2=plannedFlight(from.plusHours(1),from.plusHours(4));
   List<Object> results=race(List.of(()->{crewService.assign(f1.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());return "f1";},()->{crewService.assign(f2.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());return "f2";}));
   assertEquals(1,successes(results),"ronda "+round+": "+results);assertConflicts(results,HttpStatus.CONFLICT);
   assertEquals(1,crews.findByUserIdAndFechaBajaIsNull(member.getId()).size());
  }
 }
 @Test void doubleSubmissionOfTheSameAssignmentCreatesOneActiveRow() throws Exception {
  User member=qualified(user("med","MEDICO",false),"MEDICO");LocalDateTime from=LocalDateTime.now().plusDays(90).withNano(0);Flight f=plannedFlight(from,from.plusHours(2));
  List<Object> results=race(List.of(()->{crewService.assign(f.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());return 1;},()->{crewService.assign(f.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());return 2;},()->{crewService.assign(f.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());return 3;}));
  assertEquals(1,successes(results),results.toString());assertConflicts(results,HttpStatus.CONFLICT);
  assertEquals(1,crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()).size());
 }
 @Test void editAndDeactivationRunningTogetherLeaveAConsistentAircraft() throws Exception {
  Airport origin=airport("Origen");Aircraft target=plane(origin);
  List<Object> results=race(List.of(()->aircraftAdmin.update(target.getId(),new AircraftUpdateRequest(target.getMatricula(),"Modelo editado","T",(short)1,(short)5,null,null,null),ops.getId()),()->aircraftAdmin.setActive(target.getId(),false,null,ops.getId())));
  assertEquals(2,successes(results),results.toString());Aircraft reloaded=aircraft.findById(target.getId()).orElseThrow();
  assertFalse(reloaded.getActivo());assertEquals("Modelo editado",reloaded.getModelo());
 }
 @Test void twoCreationsOfTheSamePlateYieldOneAircraft() throws Exception {
  Airport origin=airport("Origen");String plate="LV-DUP"+SEQ.next();
  List<Object> results=race(List.of(()->aircraftAdmin.create(new AircraftRequest(plate,"M","T",(short)1,(short)2,null,origin.getId(),true),ops.getId()),()->aircraftAdmin.create(new AircraftRequest(plate.toLowerCase(),"M","T",(short)1,(short)2,null,origin.getId(),true),ops.getId())));
  assertEquals(1,successes(results),results.toString());assertConflicts(results,HttpStatus.CONFLICT);
  assertEquals(1,aircraft.findAll().stream().filter(a->a.getMatricula().equalsIgnoreCase(plate)).count());
 }
 @Test void cancellingAFlightReleasesTheAircraftTheCommanderAndTheCrewForReuseKeepingTheirHistory() throws Exception {
  Airport origin=airport("Origen"),destination=airport("Destino");Aircraft shared=plane(origin);User cmd=commander();User member=qualified(user("med","MEDICO",false),"MEDICO");
  LocalDateTime from=LocalDateTime.now().plusDays(150).withNano(0);
  FlightView first=flightService.createOperational(create(shared,cmd,destination,from,from.plusHours(3)),ops.getId());
  crewService.assign(first.id(),new Crew(member.getId(),"MEDICO"),ops.getId());
  ApiException busy=assertThrows(ApiException.class,()->flightService.createOperational(create(shared,cmd,destination,from.plusHours(1),from.plusHours(2)),ops.getId()));assertEquals(HttpStatus.CONFLICT,busy.status());
  Long reason=reasons.findAll().get(0).getId();
  flightService.cancel(first.id(),new Cancel(reason,null),ops.getId());
  FlightView second=flightService.createOperational(create(shared,cmd,destination,from.plusHours(1),from.plusHours(2)),ops.getId());
  crewService.assign(second.id(),new Crew(member.getId(),"MEDICO"),ops.getId());
  assertEquals("CANCELADO",stateOf(first.id()));
  List<FlightCrew> history=crews.findByFlightIdOrderByIdAsc(first.id());
  assertTrue(history.stream().anyMatch(c->c.getUser().getId().equals(member.getId())),"la participación histórica se conserva");
  assertEquals(1L,(long)tx.execute(st->crews.findByUserIdAndFechaBajaIsNull(member.getId()).stream().filter(c->c.getFlight().getEstadoVuelo().getCodigo().equals("PENDIENTE_CONFIRMACION_COMANDANTE")).count()));
 }
 @Test void aRemovedCrewMemberKeepsTheHistoryAndCanBeAssignedAgainOrToAnotherFlight() throws Exception {
  User member=qualified(user("med","MEDICO",false),"MEDICO");LocalDateTime from=LocalDateTime.now().plusDays(200).withNano(0);
  Flight f1=plannedFlight(from,from.plusHours(3)),f2=plannedFlight(from.plusHours(1),from.plusHours(2));
  crewService.assign(f1.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());
  ApiException clash=assertThrows(ApiException.class,()->crewService.assign(f2.getId(),new Crew(member.getId(),"MEDICO"),ops.getId()));assertEquals(HttpStatus.CONFLICT,clash.status());
  Long rowId=crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f1.getId()).get(0).getId();
  crewService.remove(f1.getId(),rowId,ops.getId());
  assertEquals(1,crews.findByFlightIdOrderByIdAsc(f1.getId()).size());assertEquals(0,crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f1.getId()).size());
  FlightCrew removed=crews.findById(rowId).orElseThrow();assertEquals("RETIRO",removed.getMotivoBaja());assertNotNull(removed.getFechaBaja());
  crewService.assign(f2.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());
  crewService.remove(f2.getId(),crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f2.getId()).get(0).getId(),ops.getId());
  crewService.assign(f1.getId(),new Crew(member.getId(),"MEDICO"),ops.getId());
  assertEquals(2,crews.findByFlightIdOrderByIdAsc(f1.getId()).size());
 }

 private Flight plannedFlight(LocalDateTime from,LocalDateTime to){
  FlightType type=types.findByCodigoAndActivoTrue("REGRESO_BASE").orElseThrow();Flight f=new Flight();f.setCodigo("V-CC"+SEQ.next()+"-"+System.nanoTime()%100000);f.setTipoVuelo(type);f.setMotivoVuelo("Prueba");f.setCreadoPor(ops);
  f.setFechaPlanificadaSalida(from);f.setFechaPlanificadaLlegada(to);f.setEstadoVuelo(status("PLANIFICADO"));return flights.save(f);
 }
}
