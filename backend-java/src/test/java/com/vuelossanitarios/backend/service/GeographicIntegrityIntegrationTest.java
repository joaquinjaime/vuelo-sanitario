package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.api.dto.GeographicCatalogDtos.*;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.patient.Patient;
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
 * Integridad de las bajas lógicas geográficas (I-5.3) con los servicios reales y transacciones independientes (H2 en modo SQL Server): las referencias
 * históricas se conservan y no bloquean, las vigentes (incluido el aeropuerto alternativo de una ruta vigente) sí, la reactivación exige jerarquía activa
 * y las operaciones incompatibles (baja contra uso del mismo aeropuerto) tienen un único ganador. H2 no reproduce los bloqueos por rango de SQL Server:
 * la verificación equivalente sobre SQL Server real está en scripts/e2e-geografia-integridad.cjs.
 */
@SpringBootTest(properties = {
  "spring.datasource.url=jdbc:h2:mem:geointegrity;MODE=MSSQLServer;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;LOCK_TIMEOUT=20000",
  "spring.datasource.driver-class-name=org.h2.Driver","app.final-report.sweep-enabled=false",
  "spring.datasource.username=sa","spring.datasource.password=","spring.flyway.enabled=false",
  "spring.jpa.hibernate.ddl-auto=create-drop","spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect","spring.jpa.open-in-view=false",
  "app.jwt.secret=abcdefghijklmnopqrstuvwxyz123456","app.bootstrap-admin.username=","app.bootstrap-admin.password=","app.bootstrap-admin.email="
})
class GeographicIntegrityIntegrationTest {
 @Autowired GeographicCatalogService geography; @Autowired FlightService flightService; @Autowired FlightRouteService routeService; @Autowired AircraftAdminService aircraftAdmin;
 @Autowired FlightRouteRepository routes; @Autowired AuditEventRepository auditEvents; @Autowired AircraftRepository aircraft; @Autowired AirportRepository airports; @Autowired ProvinceRepository provinces; @Autowired LocalityRepository localities; @Autowired UserRepository users; @Autowired PersonRepository persons; @Autowired RoleRepository roleRepository; @Autowired UserRoleRepository userRoles; @Autowired CommanderProfileRepository commanderProfiles;
 @Autowired FlightRepository flights; @Autowired FlightTypeRepository types; @Autowired FlightStatusRepository statuses; @Autowired CrewRoleRepository crewRoles; @Autowired CrewQualificationRepository qualifications; @Autowired CancellationReasonRepository reasons; @Autowired PatientRepository patients; @Autowired SanitaryRequestStatusRepository requestStatuses; @Autowired FlightPriorityRepository priorities;
 @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager; private org.springframework.transaction.support.TransactionTemplate tx;
 @MockBean ProfessionalCredentialService credentials; @MockBean CommanderReportAccessService commanderAccess; @MockBean FlightLogService flightLog;

 private static int seq; private static synchronized int next(){return ++seq;}
 private static Province province; private static User ops,admin,dts; private static Long reasonId; private static String priorityCode;
 private Role role(String code){return roleRepository.findByCodigo(code).orElseGet(()->{Role r=new Role();r.setCodigo(code);r.setNombre(code);r.setActivo(true);return roleRepository.save(r);});}
 private CrewRole crewRole(String code){return crewRoles.findByCodigo(code).orElseGet(()->{CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(code);return crewRoles.save(r);});}
 private FlightStatus status(String code){return statuses.findByCodigo(code).orElseGet(()->{FlightStatus s=new FlightStatus();s.setCodigo(code);s.setNombre(code);s.setOrden((short)1);return statuses.save(s);});}
 private User user(String prefix,String roleCode,boolean commander){
  int n=next();Person p=new Person();p.setNombre(prefix);p.setApellido("T"+n);p.setDni(String.valueOf(60000000+n));persons.save(p);
  if(commander){CommanderProfile profile=new CommanderProfile();profile.setPerson(p);profile.setLicenseNumber("LIC-"+prefix+n);profile.setProvinciaActual(province);commanderProfiles.save(profile);}
  User u=new User();u.setUsername(prefix+n);u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("ACTIVO");users.save(u);
  userRoles.save(new UserRole(u,role(roleCode)));return users.findById(u.getId()).orElseThrow();
 }
 private User qualified(User u,String code){CrewQualification q=new CrewQualification();q.setUser(u);q.setRole(crewRole(code));q.setClassifier(ops);qualifications.save(q);return u;}
 private Airport airport(String name){return airport(name,province,null);}
 private Airport airport(String name,Province p,Locality l){int n=next();Airport a=new Airport();a.setNombre(name+n);a.setActivo(true);a.setProvinciaReferencial(p);a.setLocalidad(l);a.setCodigoOaci(String.format("G%03d",n));a.setCodigoIata(String.format("%03d",n));return airports.save(a);}
 private Aircraft plane(Airport at){int n=next();Aircraft a=new Aircraft();a.setMatricula("LV-G"+n);a.setModelo("M");a.setTipo("T");a.setCapacidadPacientes((short)1);a.setCapacidadTripulacion((short)4);a.setActivo(true);a.setAeropuertoActual(at);return aircraft.save(a);}
 private Province newProvince(String name){int n=next();Province p=new Province();p.setCodigoOficial("G"+n);p.setNombre(name+n);p.setActivo(true);return provinces.save(p);}
 private Locality newLocality(Province p){int n=next();Locality l=new Locality();l.setCodigoOficial("LG"+n);l.setNombre("Localidad"+n);l.setProvincia(p);l.setActivo(true);return localities.save(l);}

 @BeforeEach void setUp(){tx=new org.springframework.transaction.support.TransactionTemplate(transactionManager);bootstrap();when(credentials.assess(any(),any(),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));}
 private synchronized void bootstrap(){
  if(ops!=null)return;
  province=newProvince("Provincia integridad");
  ops=user("ops","CENTRO_OPERACIONES",false);admin=user("adm","ADMINISTRADOR",false);dts=user("dts","DTS",false);
  FlightType sanitary=new FlightType();sanitary.setCodigo("SANITARIO");sanitary.setNombre("Sanitario");types.save(sanitary);
  for(String c:List.of("SOLICITADO","APROBADO","RECHAZADO","CANCELADO","PENDIENTE_RESPUESTA_DTS")){SanitaryRequestStatus st=new SanitaryRequestStatus();st.setCodigo(c);st.setNombre(c);st.setOrden((short)1);requestStatuses.save(st);}
  FlightPriority pr=new FlightPriority();pr.setCodigo("NORMAL");pr.setNombre("Normal");pr.setOrden((short)1);priorities.save(pr);priorityCode="NORMAL";
  FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");t.setNombre("Regreso");types.save(t);
  for(String s:List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PLANIFICADO","CANCELADO","EN_CURSO","FINALIZADO","PENDIENTE_REPLANIFICACION"))status(s);
  crewRole("COMANDANTE");
  CancellationReason r=new CancellationReason();r.setCodigo("CLIMA");r.setNombre("Clima");r.setCategoria("AERONAUTICO");r.setOrden((short)1);reasonId=reasons.save(r).getId();
 }

 private static final class Scenario{Flight flight;User commander;Airport origin,destination;Aircraft plane;Long id(){return flight.getId();}}
 private int day=400;
 private Scenario planned(){
  Scenario s=pendingConfirmation();
  flightService.respondToOperationalAssignment(s.id(),new CommanderResponse(true,null,null,null),s.commander.getId());
  assertEquals("PLANIFICADO",stateOf(s.id()));return s;
 }
 private Scenario pendingConfirmation(){
  Scenario s=new Scenario();s.origin=airport("Origen");s.destination=airport("Destino");s.plane=plane(s.origin);s.commander=qualified(user("cmd","COMANDANTE",true),"COMANDANTE");
  LocalDateTime from=LocalDateTime.now().plusDays(day+=2).withNano(0);
  FlightView created=flightService.createOperational(new CreateOperationalFlight("REGRESO_BASE","Prueba de integridad",s.plane.getId(),s.commander.getId(),s.destination.getId(),from,from.plusHours(3)),ops.getId());
  s.flight=flights.findById(created.id()).orElseThrow();return s;
 }
 private String stateOf(Long id){return tx.execute(st->flights.findById(id).orElseThrow().getEstadoVuelo().getCodigo());}
 private boolean active(Long airportId){return airports.findById(airportId).orElseThrow().getActivo();}
 private FlightRouteService.Input route(int version,Long alternate,String reason){return new FlightRouteService.Input(version,"Punto A, punto B",alternate,null,null,null,"Observación",reason,true);}
 private ApiException conflictOf(org.junit.jupiter.api.function.Executable e){return assertThrows(ApiException.class,e);}
 private AirportAdminView airportView(Long id){return geography.airports("",0,100).items().stream().filter(a->a.id().equals(id)).findFirst().orElse(null);}
 private DependencyView dependencies(Long airportId){return tx.execute(st->geography.airports(airport(airportId).getNombre(),0,100).items().stream().filter(a->a.id().equals(airportId)).findFirst().orElseThrow().dependencias());}
 private Airport airport(Long id){return airports.findById(id).orElseThrow();}
 private ActiveRequest off(){return new ActiveRequest(false,"baja de prueba");} private ActiveRequest on(){return new ActiveRequest(true,"reactivación de prueba");}

 // ---------- Referencias históricas y vigentes ----------
 @Test void historicalReferencesArePreservedAndDoNotBlockTheLogicalDeactivation() {
  Scenario s=planned();
  ApiException open=conflictOf(()->geography.setAirportActive(s.destination.getId(),off(),admin.getId()));
  assertEquals(HttpStatus.CONFLICT,open.status());assertEquals("GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",open.code());assertEquals(1L,((Map<?,?>)open.details().get("vigentes")).get("VUELOS_VIGENTES"));assertTrue(open.details().get("vuelos").toString().contains(s.flight.getCodigo()));assertTrue(active(s.destination.getId()));
  flightService.cancel(s.id(),new Cancel(reasonId,null),ops.getId());
  AirportAdminView done=geography.setAirportActive(s.destination.getId(),off(),admin.getId());
  assertFalse(done.activo());assertEquals(1L,done.dependencias().historicas().get("VUELOS_HISTORICOS"));assertTrue(done.dependencias().vigentes().isEmpty());
  Flight kept=tx.execute(st->{Flight f=flights.findById(s.id()).orElseThrow();assertEquals(s.destination.getId(),f.getDestino().getId());assertFalse(f.getDestino().getActivo(),"el vuelo histórico sigue apuntando al aeropuerto inactivo");return f;});
  assertEquals("CANCELADO",stateOf(kept.getId()));
  AuditEvent event=auditEvents.findAll().stream().filter(e->"GEOGRAPHIC_AIRPORT".equals(e.getEntityType())&&s.destination.getId().equals(e.getEntityId())&&"SET_ACTIVE".equals(e.getOperation())).findFirst().orElseThrow();
  assertTrue(event.getNewValues().contains("VUELOS_HISTORICOS"),event.getNewValues());
  assertTrue(geography.setAirportActive(s.destination.getId(),on(),admin.getId()).activo(),"la reactivación conserva el mismo identificador");
 }
 @Test void anActiveAircraftLocatedAtTheAirportBlocksItUntilItIsDeactivated() {
  Scenario s=planned();flightService.cancel(s.id(),new Cancel(reasonId,null),ops.getId());
  ApiException located=conflictOf(()->geography.setAirportActive(s.origin.getId(),off(),admin.getId()));
  assertEquals("GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",located.code());assertEquals(1L,((Map<?,?>)located.details().get("vigentes")).get("AERONAVES_ACTIVAS"));
  aircraftAdmin.setActive(s.plane.getId(),false,null,ops.getId());
  AirportAdminView done=geography.setAirportActive(s.origin.getId(),off(),admin.getId());
  assertFalse(done.activo());assertEquals(1L,done.dependencias().historicas().get("AERONAVES_INACTIVAS"));assertEquals(1L,done.dependencias().historicas().get("VUELOS_HISTORICOS"));
  assertEquals(s.origin.getId(),aircraft.findById(s.plane.getId()).orElseThrow().getAeropuertoActual().getId());
 }
 @Test void theAlternateAirportOfTheCurrentRouteIsProtectedButHistoricalVersionsAreNot() {
  Scenario s=planned();Airport alternate=airport("Alternativo");
  routeService.save(s.id(),s.commander.getId(),route(0,alternate.getId(),null));
  ApiException blocked=conflictOf(()->geography.setAirportActive(alternate.getId(),off(),admin.getId()));
  assertEquals("GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",blocked.code());assertEquals(1L,((Map<?,?>)blocked.details().get("vigentes")).get("RUTAS_ALTERNATIVAS_VIGENTES"));assertTrue(active(alternate.getId()));
  routeService.save(s.id(),s.commander.getId(),new FlightRouteService.Input(1,"Punto A, punto B",null,null,null,null,"Observación","Se retira el alternativo",true));
  AirportAdminView done=geography.setAirportActive(alternate.getId(),off(),admin.getId());
  assertFalse(done.activo());assertEquals(1L,done.dependencias().historicas().get("VERSIONES_RUTA_HISTORICAS"));
  List<FlightRoute> versions=tx.execute(st->{List<FlightRoute> v=routes.findByFlightIdOrderByVersionDesc(s.id());v.forEach(r->{if(r.getAlternativo()!=null)r.getAlternativo().getId();});return v;});
  assertEquals(2,versions.size());assertEquals(alternate.getId(),versions.get(1).getAlternativo().getId(),"la versión histórica conserva su alternativo");assertNull(versions.get(0).getAlternativo());
  ApiException inactive=conflictOf(()->routeService.save(s.id(),s.commander.getId(),new FlightRouteService.Input(2,"Punto A, punto B",alternate.getId(),null,null,null,"Observación","Alternativo inactivo",true)));
  assertEquals(HttpStatus.BAD_REQUEST,inactive.status());
 }
 @Test void theRouteOfAClosedFlightIsHistoricalForItsAlternate() {
  Scenario s=planned();Airport alternate=airport("Alternativo");routeService.save(s.id(),s.commander.getId(),route(0,alternate.getId(),null));
  assertEquals("GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",conflictOf(()->geography.setAirportActive(alternate.getId(),off(),admin.getId())).code());
  flightService.cancel(s.id(),new Cancel(reasonId,null),ops.getId());
  assertFalse(geography.setAirportActive(alternate.getId(),off(),admin.getId()).activo());
 }
 @Test void reactivationRequiresAnActiveHierarchyAndKeepsIdentifiers() {
  Province p=newProvince("Jerarquía");Locality l=newLocality(p);
  AirportAdminView a=geography.createAirport(new AirportRequest("JER"+next(),null,null,"Aeropuerto jerárquico",null,p.getId(),l.getId(),"AERODROMO","Argentina",null,null),admin.getId());
  geography.setAirportActive(a.id(),off(),admin.getId());geography.setLocalityActive(l.getId(),off(),admin.getId());geography.setProvinceActive(p.getId(),off(),admin.getId());
  assertEquals("GEOGRAPHIC_PARENT_INACTIVE",conflictOf(()->geography.setAirportActive(a.id(),on(),admin.getId())).code());
  assertEquals("GEOGRAPHIC_PARENT_INACTIVE",conflictOf(()->geography.setLocalityActive(l.getId(),on(),admin.getId())).code());
  assertEquals(HttpStatus.BAD_REQUEST,conflictOf(()->geography.createAirport(new AirportRequest("JER"+next(),null,null,"Otro",null,p.getId(),l.getId(),"AERODROMO","Argentina",null,null),admin.getId())).status());
  assertTrue(geography.setProvinceActive(p.getId(),on(),admin.getId()).activo());
  assertEquals("GEOGRAPHIC_PARENT_INACTIVE",conflictOf(()->geography.setAirportActive(a.id(),on(),admin.getId())).code(),"la localidad sigue inactiva");
  assertTrue(geography.setLocalityActive(l.getId(),on(),admin.getId()).activo());assertTrue(geography.setAirportActive(a.id(),on(),admin.getId()).activo());
  assertEquals(1,airports.findAll().stream().filter(x->x.getId().equals(a.id())).count());
 }
 @Test void theHierarchyBlocksDeactivationWithActiveChildrenAndReportsHistoricalOnes() {
  Province p=newProvince("Padre");Locality l=newLocality(p);Airport a=airport("Hijo",p,l);
  ApiException province=conflictOf(()->geography.setProvinceActive(p.getId(),off(),admin.getId()));assertEquals("GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES",province.code());
  ApiException locality=conflictOf(()->geography.setLocalityActive(l.getId(),off(),admin.getId()));assertEquals("GEOGRAPHIC_HAS_ACTIVE_DEPENDENCIES",locality.code());
  geography.setAirportActive(a.getId(),off(),admin.getId());
  LocalityAdminView done=geography.setLocalityActive(l.getId(),off(),admin.getId());assertEquals(1L,done.dependencias().historicas().get("AEROPUERTOS_INACTIVOS"));
  ProvinceAdminView prov=geography.setProvinceActive(p.getId(),off(),admin.getId());assertEquals(1L,prov.dependencias().historicas().get("AEROPUERTOS_INACTIVOS"));assertEquals(1L,prov.dependencias().historicas().get("LOCALIDADES_INACTIVAS"));
 }
 @Test void theProvinceOfAnAirportWithOperationalReferencesCannotBeChanged() {
  Scenario s=planned();Province other=newProvince("Otra");
  AirportRequest move=new AirportRequest(null,s.destination.getCodigoOaci(),s.destination.getCodigoIata(),s.destination.getNombre(),null,other.getId(),null,"AERODROMO","Argentina",null,null);
  ApiException blocked=conflictOf(()->geography.updateAirport(s.destination.getId(),move,admin.getId()));assertEquals("GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",blocked.code());
  assertEquals(province.getId(),airports.findById(s.destination.getId()).orElseThrow().getProvinciaReferencial().getId());
  flightService.cancel(s.id(),new Cancel(reasonId,null),ops.getId());
  assertEquals(other.getId(),geography.updateAirport(s.destination.getId(),move,admin.getId()).provinciaId());
 }

 // ---------- Localidades y solicitudes sanitarias ----------
 private Patient patient(){int n=next();Person p=new Person();p.setNombre("Paciente");p.setApellido("P"+n);p.setDni(String.valueOf(70000000+n));persons.save(p);Patient pt=new Patient();pt.setPerson(p);return patients.save(pt);}
 private CreateFlight request(Patient patient,Locality origin,Locality destination){return new CreateFlight(patient.getId(),origin.getId(),destination.getId(),priorityCode,"Solicitud de integridad",LocalDateTime.now().plusDays(40).withHour(10).withMinute(0).withSecond(0).withNano(0),false,null,null,new Medical("Diagnóstico","ESTABLE",false,null),null);}
 @Test void anOpenSanitaryRequestProtectsItsLocalitiesButAClosedOneIsHistory() {
  Locality origin=newLocality(province),destination=newLocality(province);Patient patient=patient();
  FlightView view=flightService.create(request(patient,origin,destination),dts.getId());
  ApiException blocked=conflictOf(()->geography.setLocalityActive(origin.getId(),off(),admin.getId()));
  assertEquals("GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",blocked.code());assertEquals(1L,((Map<?,?>)blocked.details().get("vigentes")).get("SOLICITUDES_VIGENTES"));
  assertEquals("GEOGRAPHIC_HAS_OPERATIONAL_REFERENCES",conflictOf(()->geography.setLocalityActive(destination.getId(),off(),admin.getId())).code());
  flightService.cancel(view.id(),new Cancel(reasonId,null),dts.getId());
  LocalityAdminView done=geography.setLocalityActive(origin.getId(),off(),admin.getId());
  assertFalse(done.activo());assertEquals(1L,done.dependencias().historicas().get("SOLICITUDES_CERRADAS"));
  assertEquals(origin.getId(),tx.execute(st->flights.findById(view.id()).orElseThrow().getSanitario().getLocalidadOrigenSolicitada().getId()),"la solicitud cancelada conserva su localidad");
  assertEquals(HttpStatus.BAD_REQUEST,conflictOf(()->flightService.create(request(patient,origin,destination),dts.getId())).status(),"una localidad inactiva no se elige para solicitudes nuevas");
 }
 @Test void deactivatingALocalityWhileARequestSelectsItHasOneWinner() throws Exception {
  for(int round=0;round<5;round++){
   Locality origin=newLocality(province),destination=newLocality(province);Patient patient=patient();
   List<Object> results=race(List.of(()->geography.setLocalityActive(origin.getId(),off(),admin.getId()),()->flightService.create(request(patient,origin,destination),dts.getId())));
   assertEquals(1,successes(results),"ronda "+round+": "+results);assertControlled(results);
   long requests=tx.execute(st->flights.findAll().stream().filter(f->f.getSanitario()!=null&&f.getSanitario().getLocalidadOrigenSolicitada().getId().equals(origin.getId())).count());
   boolean active=localities.findById(origin.getId()).orElseThrow().getActivo();
   if(results.get(0) instanceof Throwable){assertTrue(active);assertEquals(1,requests);}else{assertFalse(active);assertEquals(0,requests,"una baja confirmada no deja una solicitud nueva apuntando a la localidad");}
  }
 }

 // ---------- Tipos de vuelo ----------
 @Test void inactiveAndUnknownFlightTypesAreRejectedForNewFlightsButHistoricalFlightsKeepTheirType() {
  Scenario s=planned();
  FlightType inactive=new FlightType();inactive.setCodigo("TIPO_APAGADO"+next());inactive.setNombre("Tipo apagado");inactive.setActivo(false);types.save(inactive);
  LocalDateTime from=LocalDateTime.now().plusDays(day+=2).withNano(0);Airport d=airport("D"),o=airport("O");Aircraft pl=plane(o);User c=qualified(user("cmd","COMANDANTE",true),"COMANDANTE");
  ApiException off=conflictOf(()->flightService.createOperational(new CreateOperationalFlight(inactive.getCodigo(),"x motivo",pl.getId(),c.getId(),d.getId(),from,from.plusHours(2)),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,off.status());assertEquals("TIPO_VUELO_INACTIVO",off.code());
  ApiException unknown=conflictOf(()->flightService.createOperational(new CreateOperationalFlight("NO_EXISTE","x motivo",pl.getId(),c.getId(),d.getId(),from,from.plusHours(2)),ops.getId()));
  assertEquals(HttpStatus.BAD_REQUEST,unknown.status());assertEquals("TIPO_VUELO_INEXISTENTE",unknown.code());
  FlightType regreso=types.findByCodigo("REGRESO_BASE").orElseThrow();regreso.setActivo(false);types.save(regreso);
  try{
   assertEquals("REGRESO_BASE",tx.execute(st->flights.findById(s.id()).orElseThrow().getTipoVuelo().getCodigo()),"el vuelo histórico no depende de que su tipo siga activo");
   assertEquals("REGRESO_BASE",flightService.list(ops.getId()).stream().filter(v->v.id().equals(s.id())).findFirst().orElseThrow().tipo().codigo(),"la consulta del vuelo tampoco");
   assertEquals("TIPO_VUELO_INACTIVO",conflictOf(()->flightService.createOperational(new CreateOperationalFlight("REGRESO_BASE","x motivo",pl.getId(),c.getId(),d.getId(),from,from.plusHours(2)),ops.getId())).code());
  }finally{regreso.setActivo(true);types.save(regreso);}
 }
 @Test void replanningDoesNotChangeTheTypeOfTheFlight() {
  Scenario s=pendingConfirmation();
  flightService.respondToOperationalAssignment(s.id(),new CommanderResponse(false,"No puedo realizar este vuelo",null,null),s.commander.getId());
  assertEquals("PENDIENTE_REPLANIFICACION",stateOf(s.id()));
  Airport d2=airport("D2");LocalDateTime from=LocalDateTime.now().plusDays(day+=2).withNano(0);
  flightService.replanOperational(s.id(),new ReplanOperationalFlight(s.plane.getId(),s.commander.getId(),d2.getId(),from,from.plusHours(2)),ops.getId());
  assertEquals("REGRESO_BASE",tx.execute(st->flights.findById(s.id()).orElseThrow().getTipoVuelo().getCodigo()));
  assertEquals(d2.getId(),tx.execute(st->flights.findById(s.id()).orElseThrow().getDestino().getId()));
 }

 // ---------- Concurrencia: una sola de las operaciones incompatibles confirma ----------
 private List<Object> race(List<Callable<Object>> tasks) throws Exception {
  ExecutorService pool=Executors.newFixedThreadPool(tasks.size());CyclicBarrier barrier=new CyclicBarrier(tasks.size());List<Future<Object>> futures=new ArrayList<>();
  for(Callable<Object> task:tasks)futures.add(pool.submit(()->{barrier.await(10,TimeUnit.SECONDS);try{return task.call();}catch(Throwable e){return e;}}));
  List<Object> results=new ArrayList<>();for(Future<Object> f:futures)results.add(f.get(60,TimeUnit.SECONDS));pool.shutdown();return results;
 }
 private long successes(List<Object> results){return results.stream().filter(r->!(r instanceof Throwable)).count();}
 private void assertControlled(List<Object> results){/* Un fallo de concurrencia (bloqueo mutuo, serialización) es el 409 CONCURRENT_MODIFICATION del manejador de errores; H2 lo produce cuando una transacción SERIALIZABLE (instantánea) ve confirmada la baja. */
  for(Object r:results)if(r instanceof Throwable t){if(t instanceof org.springframework.dao.ConcurrencyFailureException)continue;assertTrue(t instanceof ApiException,"excepción inesperada: "+t);HttpStatus st=((ApiException)t).status();assertTrue(st==HttpStatus.CONFLICT||st==HttpStatus.BAD_REQUEST,"estado inesperado: "+st+" "+t.getMessage());}}

 @Test void deactivatingAnAirportWhileItIsBeingSelectedAsDestinationHasOneWinner() throws Exception {
  int deactivated=0,created=0;
  for(int round=0;round<6;round++){
   Airport o=airport("Origen"),d=airport("Destino");Aircraft pl=plane(o);User c=qualified(user("cmd","COMANDANTE",true),"COMANDANTE");LocalDateTime from=LocalDateTime.now().plusDays(day+=2).withNano(0);
   List<Object> results=race(List.of(()->geography.setAirportActive(d.getId(),off(),admin.getId()),()->flightService.createOperational(new CreateOperationalFlight("REGRESO_BASE","Carrera de baja",pl.getId(),c.getId(),d.getId(),from,from.plusHours(2)),ops.getId())));
   assertEquals(1,successes(results),"ronda "+round+": "+results);assertControlled(results);
   boolean flightExists=flights.findAll().stream().anyMatch(f->f.getDestino()!=null&&f.getDestino().getId().equals(d.getId()));
   if(results.get(0) instanceof Throwable){assertTrue(active(d.getId()));assertTrue(flightExists);created++;}
   else{assertFalse(active(d.getId()));assertFalse(flightExists,"una baja confirmada no puede dejar un vuelo nuevo apuntando al aeropuerto");deactivated++;}
  }
  assertEquals(6,deactivated+created);
 }
 @Test void deactivatingAnAirportWhileItIsBeingSelectedAsAlternateHasOneWinner() throws Exception {
  for(int round=0;round<6;round++){
   Scenario s=planned();Airport alt=airport("Alternativo");
   List<Object> results=race(List.of(()->geography.setAirportActive(alt.getId(),off(),admin.getId()),()->routeService.save(s.id(),s.commander.getId(),route(0,alt.getId(),null))));
   assertEquals(1,successes(results),"ronda "+round+": "+results);assertControlled(results);
   FlightRoute current=tx.execute(st->routes.findByFlightIdAndEsVersionActualTrue(s.id()).orElse(null));
   if(results.get(0) instanceof Throwable){assertTrue(active(alt.getId()));assertNotNull(current);assertEquals(alt.getId(),current.getAlternativo().getId());}
   else{assertFalse(active(alt.getId()));assertNull(current,"la ruta rechazada no deja versiones");}
  }
 }
 @Test void deactivatingAnAirportWhileAnAircraftIsMovedThereHasOneWinner() throws Exception {
  for(int round=0;round<6;round++){
   Airport from=airport("Base"),target=airport("Destino");Aircraft pl=plane(from);
   List<Object> results=race(List.of(()->geography.setAirportActive(target.getId(),off(),admin.getId()),()->aircraftAdmin.move(pl.getId(),target.getId(),"Traslado",ops.getId())));
   assertEquals(1,successes(results),"ronda "+round+": "+results);assertControlled(results);
   Airport at=tx.execute(st->aircraft.findById(pl.getId()).orElseThrow().getAeropuertoActual());
   if(results.get(0) instanceof Throwable){assertTrue(active(target.getId()));assertEquals(target.getId(),at.getId());}
   else{assertFalse(active(target.getId()));assertEquals(from.getId(),at.getId(),"una aeronave activa no puede quedar en un aeropuerto dado de baja");}
  }
 }
 @Test void concurrentDeactivationsOfTheSameAirportConfirmExactlyOne() throws Exception {
  Airport a=airport("Doble baja");
  List<Object> results=race(List.of(()->geography.setAirportActive(a.getId(),off(),admin.getId()),()->geography.setAirportActive(a.getId(),off(),admin.getId())));
  assertEquals(1,successes(results),results.toString());assertControlled(results);assertFalse(active(a.getId()));
  assertEquals(1,auditEvents.findAll().stream().filter(e->"GEOGRAPHIC_AIRPORT".equals(e.getEntityType())&&a.getId().equals(e.getEntityId())&&"SET_ACTIVE".equals(e.getOperation())).count());
 }
 @Test void reactivatingAnAirportWhileItsParentIsDeactivatedHasOneConsistentOutcome() throws Exception {
  for(int round=0;round<4;round++){
   Province p=newProvince("Carrera");Locality l=newLocality(p);Airport a=airport("Hijo",p,l);geography.setAirportActive(a.getId(),off(),admin.getId());geography.setLocalityActive(l.getId(),off(),admin.getId());
   List<Object> results=race(List.of(()->geography.setLocalityActive(l.getId(),on(),admin.getId()),()->geography.setAirportActive(a.getId(),on(),admin.getId())));
   assertControlled(results);boolean localityActive=localities.findById(l.getId()).orElseThrow().getActivo(),airportActive=active(a.getId());
   assertTrue(localityActive,"la reactivación de la localidad siempre prospera");
   if(airportActive)assertTrue(localityActive,"un aeropuerto activo nunca cuelga de una localidad inactiva");
  }
 }
}
