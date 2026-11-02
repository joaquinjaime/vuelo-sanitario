package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

/** Asignación, cambio y liberación de aeronave y tripulación dentro del ciclo del vuelo (operativo y sanitario). */
class AircraftAssignmentFlightServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class); private final SanitaryFlightRepository sanitary=mock(SanitaryFlightRepository.class);
 private final UserRepository users=mock(UserRepository.class); private final FlightStatusRepository statuses=mock(FlightStatusRepository.class);
 private final AircraftRepository aircraft=mock(AircraftRepository.class); private final AirportRepository airports=mock(AirportRepository.class);
 private final CrewRoleRepository crewRoles=mock(CrewRoleRepository.class); private final FlightCrewRepository crews=mock(FlightCrewRepository.class);
 private final CancellationReasonRepository reasons=mock(CancellationReasonRepository.class);
 private final AuditService audit=mock(AuditService.class); private final NotificationService notifications=mock(NotificationService.class);
 private final CommanderReportAccessService commanderAccess=mock(CommanderReportAccessService.class); private final CrewManagementService crewManagement=mock(CrewManagementService.class);
 private final CommanderGeographicExceptionRepository geoExceptions=mock(CommanderGeographicExceptionRepository.class);
 private FlightService service;
 private User ops,commander,medic; private Locality capital; private Province province,otherProvince; private Airport tuc,tuc2,aep,salta; private Aircraft oldPlane,newPlane; private Flight operational; private AuditEvent auditEvent;

 private static long id(){return java.util.concurrent.ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE);}
 private static Locality locality(String name,Province p){Locality l=new Locality();l.setId(id());l.setNombre(name);l.setProvincia(p);l.setActivo(true);return l;}
 private static Airport airport(String name,Province p){Airport a=new Airport();a.setId(id());a.setNombre(name);a.setActivo(true);a.setProvinciaReferencial(p);return a;}
 private static Aircraft plane(String plate,Airport at,int crewCapacity){Aircraft a=new Aircraft();a.setId(id());a.setMatricula(plate);a.setActivo(true);a.setAeropuertoActual(at);a.setCapacidadTripulacion((short)crewCapacity);return a;}
 private static User user(String username,String role,Province p){User u=new User();u.setId(id());u.setUsername(username);u.setActivo(true);u.setEstadoCuenta("ACTIVO");Person person=new Person();person.setNombre(username);person.setApellido("X");CommanderProfile profile=new CommanderProfile();profile.setLicenseNumber("L");profile.setProvinciaActual(p);person.setCommanderProfile(profile);u.setPerson(person);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;}
 private FlightStatus status(String code){FlightStatus s=new FlightStatus();s.setCodigo(code);when(statuses.findByCodigo(code)).thenReturn(Optional.of(s));return s;}
 private FlightType type(String code){FlightType t=new FlightType();t.setCodigo(code);t.setNombre(code);return t;}
 private FlightCrew crew(long crewId,Flight f,User u,String role){CrewRole r=new CrewRole();r.setCodigo(role);r.setNombre(role);FlightCrew c=new FlightCrew();c.setId(crewId);c.setFlight(f);c.setUser(u);c.setCrewRole(r);return c;}

 @BeforeEach void setUp(){
  service=new FlightService(flights,sanitary,mock(FlightTypeRepository.class),mock(SanitaryRequestStatusRepository.class),mock(PatientRepository.class),users,statuses,mock(FlightPriorityRepository.class),aircraft,airports,mock(LocalityRepository.class),crewRoles,crews,mock(FlightMedicalInfoRepository.class),mock(FlightFinalReportRepository.class),mock(FlightScheduleNegotiationRepository.class),reasons,mock(WeatherSnapshotRepository.class),audit,mock(FlightAuthorizationService.class),notifications,mock(FlightUrgencyPolicy.class),mock(FinalReportWorkflowService.class),commanderAccess,crewManagement,mock(FlightLogService.class),mock(FlightRouteService.class),mock(AirportLocks.class),geoExceptions,Clock.systemDefaultZone());
  province=new Province();province.setId(id());province.setNombre("Tucumán");otherProvince=new Province();otherProvince.setId(id());otherProvince.setNombre("Salta");
  tuc=airport("TUC",province);tuc2=airport("TUC2",province);aep=airport("AEP",province);salta=airport("SLA",otherProvince);
  for(Airport a:List.of(tuc,tuc2,aep,salta))when(airports.findById(a.getId())).thenReturn(Optional.of(a));
  oldPlane=plane("LV-OLD",tuc,4);newPlane=plane("LV-NEW",tuc2,4);
  capital=locality("San Miguel de Tucumán",province);ops=user("ops","OPERACIONES",null);commander=user("cmd","COMANDANTE",province);medic=user("medic","MEDICO",null);
  for(User u:List.of(ops,commander,medic)){when(users.lockById(u.getId())).thenReturn(Optional.of(u));when(users.findById(u.getId())).thenReturn(Optional.of(u));when(users.findWithRolesByUsername(u.getUsername())).thenReturn(Optional.of(u));}
  auditEvent=mock(AuditEvent.class);when(auditEvent.getId()).thenReturn(900L);when(audit.record(any(),any(),any(),any(),any(),any(),any())).thenReturn(auditEvent);
  when(aircraft.lockById(oldPlane.getId())).thenReturn(Optional.of(oldPlane));when(aircraft.lockById(newPlane.getId())).thenReturn(Optional.of(newPlane));
  when(flights.activeAircraftAssignments(any(),any())).thenReturn(List.of());when(flights.aircraftBusyIn(any(),any(),any())).thenReturn(List.of());when(flights.overlappingAircraft(any(),any(),any())).thenReturn(List.of());
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(any())).thenReturn(List.of());
  when(crewManagement.evaluate(any(),any(),eq("COMANDANTE"),anyBoolean())).thenReturn(new CrewManagementService.Eligibility(true,"ELEGIBLE","Vigente",null));
  when(crewManagement.evaluateOn(any(),any(),eq("COMANDANTE"),any(),anyBoolean(),any())).thenReturn(new CrewManagementService.Eligibility(true,"ELEGIBLE","Vigente",null));
  status("PLANIFICADO");status("PENDIENTE_CONFIRMACION_COMANDANTE");
  LocalDateTime from=LocalDateTime.now().plusDays(3);
  operational=new Flight();operational.setId(id());operational.setCodigo("V-OP");operational.setTipoVuelo(type("REGRESO_BASE"));operational.setAircraft(oldPlane);operational.setComandante(commander);operational.setOrigen(tuc);operational.setDestino(aep);
  operational.setFechaPlanificadaSalida(from);operational.setFechaPlanificadaLlegada(from.plusHours(2));operational.setEstadoVuelo(status("PLANIFICADO"));
  when(flights.lockById(operational.getId())).thenReturn(Optional.of(operational));when(flights.findById(operational.getId())).thenReturn(Optional.of(operational));
 }
 private ChangeAircraft change(Aircraft a){return new ChangeAircraft(a.getId(),"Mantenimiento");}

 @Test void changingTheAircraftOfAConfirmedOperationalFlightMovesItsOriginAndAsksTheCommanderToConfirmAgain(){
  FlightView view=service.changeAircraft(operational.getId(),change(newPlane),ops.getId());
  assertSame(newPlane,operational.getAircraft());assertSame(tuc2,operational.getOrigen());assertEquals("PENDIENTE_CONFIRMACION_COMANDANTE",view.estadoVuelo());
  verify(audit).record(eq(operational),eq(ops),eq("FLIGHT"),eq(operational.getId()),eq("CHANGE_AIRCRAFT"),contains("LV-OLD"),argThat((String v)->v.contains("LV-NEW")&&v.contains("\"requiereConfirmacionComandante\":true")));
  verify(notifications).createOnce(eq(commander),eq(operational),eq("AIRCRAFT_CHANGED"),contains("confirmar"),eq("AIRCRAFT_CHANGED:900"));
 }
 @Test void changingToAnAircraftAtTheSameAirportKeepsTheCommanderConfirmation(){
  newPlane.setAeropuertoActual(tuc);
  FlightView view=service.changeAircraft(operational.getId(),change(newPlane),ops.getId());
  assertEquals("PLANIFICADO",view.estadoVuelo());assertSame(newPlane,operational.getAircraft());
  verify(notifications).createOnce(eq(commander),eq(operational),eq("AIRCRAFT_CHANGED"),argThat((String t)->!t.contains("confirmar")),anyString());
 }
 @Test void aBusyAircraftCannotReplaceTheCurrentOneAndNothingChanges(){
  Flight other=new Flight();other.setId(id());other.setCodigo("V-OTRO");when(flights.aircraftBusyIn(eq(newPlane.getId()),any(),any())).thenReturn(List.of(other));
  ApiException e=assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertTrue(e.getMessage().contains("V-OTRO"));assertSame(oldPlane,operational.getAircraft());assertSame(tuc,operational.getOrigen());assertEquals("PLANIFICADO",operational.getEstadoVuelo().getCodigo());
  verify(audit,never()).record(any(),any(),eq("FLIGHT"),any(),eq("CHANGE_AIRCRAFT"),any(),any());
 }
 @Test void anAircraftThatIsFlyingOrInactiveCannotBeAssigned(){
  when(flights.activeAircraftAssignments(eq(newPlane.getId()),any())).thenReturn(List.of(new Flight()));
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),ops.getId())).status());
  when(flights.activeAircraftAssignments(eq(newPlane.getId()),any())).thenReturn(List.of());newPlane.setActivo(false);
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),ops.getId())).status());
  assertSame(oldPlane,operational.getAircraft());
 }
 @Test void theAircraftOfAStartedFinishedOrCancelledFlightCannotBeChanged(){
  for(String state:List.of("EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO","PENDIENTE_REPLANIFICACION","PENDIENTE_RESPUESTA_OPERACIONES")){
   operational.setEstadoVuelo(status(state));
   assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),ops.getId())).status(),state);
  }
  assertSame(oldPlane,operational.getAircraft());
 }
 @Test void onlyOperationsCanChangeTheAircraftAndTheSameAircraftIsRejected(){
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),commander.getId())).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(oldPlane),ops.getId())).status());
 }
 @Test void theNewAircraftMustFitTheCrewAlreadyAssigned(){
  newPlane.setCapacidadTripulacion((short)2);User third=user("copiloto","COPILOTO",null);
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(operational.getId())).thenReturn(List.of(crew(1,operational,commander,"COMANDANTE"),crew(2,operational,medic,"MEDICO"),crew(3,operational,third,"COPILOTO")));
  ApiException e=assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertSame(oldPlane,operational.getAircraft());
 }
 @Test void theOperationalOriginMustStayInTheCommandersProvince(){
  newPlane.setAeropuertoActual(salta);
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),ops.getId())).status());
  newPlane.setAeropuertoActual(aep);
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(operational.getId(),change(newPlane),ops.getId())).status());
 }
 @Test void candidatesExplainWhyAnAircraftIsNotAvailableAndNeverOfferTheCurrentOne(){
  Aircraft busy=plane("LV-BUSY",tuc,4);Flight clash=new Flight();clash.setId(id());clash.setCodigo("V-CLASH");clash.setTipoVuelo(type("REGRESO_BASE"));
  when(aircraft.findActiveLocatedInProvince(province.getId())).thenReturn(List.of(oldPlane,newPlane,busy));when(flights.aircraftBusyIn(eq(busy.getId()),any(),any())).thenReturn(List.of(clash));
  List<AvailableAircraftView> list=service.aircraftCandidates(operational.getId(),ops.getId());
  assertEquals(2,list.size());assertTrue(list.stream().noneMatch(a->a.matricula().equals("LV-OLD")));
  AvailableAircraftView free=list.stream().filter(a->a.matricula().equals("LV-NEW")).findFirst().orElseThrow(),taken=list.stream().filter(a->a.matricula().equals("LV-BUSY")).findFirst().orElseThrow();
  assertTrue(free.disponible());assertFalse(taken.disponible());assertEquals("V-CLASH",taken.conflictos().get(0).codigo());
  assertEquals(1,service.availableAircraft(operational.getId(),ops.getId()).size());
 }

 // ---------- Vuelo sanitario ----------
 private Flight sanitaryFlight(Airport plannedOrigin){
  Locality requested=capital;SanitaryRequestStatus approved=new SanitaryRequestStatus();approved.setCodigo("APROBADO");
  com.vuelossanitarios.backend.domain.patient.Patient patient=new com.vuelossanitarios.backend.domain.patient.Patient();Person patientPerson=new Person();patientPerson.setNombre("Paciente");patientPerson.setApellido("Prueba");patient.setPerson(patientPerson);SanitaryFlight s=new SanitaryFlight();s.setPatient(patient);s.setLocalidadOrigenSolicitada(requested);s.setLocalidadDestinoSolicitada(requested);s.setEstadoSolicitud(approved);
  Flight f=new Flight();f.setId(id());f.setCodigo("V-SAN");f.setTipoVuelo(type("SANITARIO"));f.setAircraft(oldPlane);f.setComandante(commander);f.setOrigen(plannedOrigin);f.setDestino(aep);f.setSanitario(s);
  f.setFechaPlanificadaSalida(LocalDateTime.now().plusDays(3));f.setEstadoVuelo(status("PLANIFICADO"));
  when(flights.lockById(f.getId())).thenReturn(Optional.of(f));when(flights.findById(f.getId())).thenReturn(Optional.of(f));when(sanitary.findByFlightId(f.getId())).thenReturn(Optional.of(s));
  return f;
 }
 @Test void aSanitaryFlightWithPlannedOriginOnlyAcceptsAnAircraftAtThatAirport(){
  Flight f=sanitaryFlight(tuc);
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(f.getId(),change(newPlane),ops.getId())).status());
  newPlane.setAeropuertoActual(salta);assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(f.getId(),change(newPlane),ops.getId())).status());
  newPlane.setAeropuertoActual(tuc);
  FlightView view=service.changeAircraft(f.getId(),change(newPlane),ops.getId());
  assertSame(newPlane,f.getAircraft());assertSame(tuc,f.getOrigen());assertEquals("PLANIFICADO",view.estadoVuelo());
 }
 @Test void aSanitaryFlightBeforeTheCommanderPlansAcceptsAnyAircraftOfTheRequestedProvince(){
  Flight f=sanitaryFlight(null);
  FlightView view=service.changeAircraft(f.getId(),change(newPlane),ops.getId());
  assertSame(newPlane,f.getAircraft());assertNull(f.getOrigen());assertEquals("PLANIFICADO",view.estadoVuelo());
  Aircraft elsewhere=plane("LV-SLA",salta,4);when(aircraft.lockById(elsewhere.getId())).thenReturn(Optional.of(elsewhere));
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(f.getId(),change(elsewhere),ops.getId())).status());
 }
 @Test void aSanitaryFlightRequiresAnApprovedRequestToAssignOrChangeAnAircraft(){
  Flight f=sanitaryFlight(null);f.getSanitario().getEstadoSolicitud().setCodigo("SOLICITADO");
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.changeAircraft(f.getId(),change(newPlane),ops.getId())).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.aircraftCandidates(f.getId(),ops.getId())).status());
 }
 @Test void initialSanitaryAssignmentRejectsAnAircraftWithACommittedFlightInThatWindowAndNotifiesAReplacedCommander(){
  Flight f=sanitaryFlight(null);f.setAircraft(null);f.setComandante(null);f.setEstadoVuelo(null);
  Flight clash=new Flight();clash.setId(id());clash.setCodigo("V-PREV");when(flights.aircraftBusyIn(eq(newPlane.getId()),any(),any())).thenReturn(List.of(clash));
  newPlane.setAeropuertoActual(tuc);
  ApiException e=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId()),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertNull(f.getAircraft());
  when(flights.aircraftBusyIn(eq(newPlane.getId()),any(),any())).thenReturn(List.of());
  CrewRole role=new CrewRole();role.setCodigo("COMANDANTE");when(crewRoles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(role));
  FlightView view=service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId()),ops.getId());
  assertEquals("PLANIFICADO",view.estadoVuelo());assertSame(newPlane,f.getAircraft());
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT"),eq(f.getId()),eq("ASSIGN_RESOURCES"),isNull(),contains(newPlane.getId().toString()));
 }

 @Test void aManipulatedAssignmentOfACommanderWithoutValidEligibilityIsRejectedBeforeAnythingChanges(){
  Flight f=sanitaryFlight(null);f.setAircraft(null);f.setComandante(null);f.setEstadoVuelo(null);newPlane.setAeropuertoActual(tuc);
  CrewRole role=new CrewRole();role.setCodigo("COMANDANTE");when(crewRoles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(role));
  for(String code:List.of("CLASIFICACION_INCOMPATIBLE","HABILITACION_VENCIDA","HABILITACION_REVOCADA","HABILITACION_NO_VERIFICADA")){
   when(crewManagement.evaluateOn(any(),any(),eq("COMANDANTE"),any(),anyBoolean(),any())).thenReturn(new CrewManagementService.Eligibility(false,code,"No elegible",null));
   ApiException e=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId()),ops.getId()));
   assertEquals(HttpStatus.CONFLICT,e.status());assertEquals(code,e.code());assertNull(f.getAircraft());assertNull(f.getComandante());assertNull(f.getEstadoVuelo(),"el vuelo no pasa a PLANIFICADO");
  }
  verify(audit,never()).record(any(),any(),eq("FLIGHT"),any(),eq("ASSIGN_RESOURCES"),any(),any());
 }

 // ---------- Regla geográfica provincial, excepciones, selección de aeropuertos y reserva de recursos (V64) ----------
 private User centro(){User co=user("co","CENTRO_OPERACIONES",null);when(users.lockById(co.getId())).thenReturn(Optional.of(co));when(users.findById(co.getId())).thenReturn(Optional.of(co));when(users.findWithRolesByUsername(co.getUsername())).thenReturn(Optional.of(co));return co;}
 private Flight unassigned(){Flight f=sanitaryFlight(null);f.setAircraft(null);f.setComandante(null);f.setEstadoVuelo(null);f.setDestino(null);newPlane.setAeropuertoActual(tuc);CrewRole role=new CrewRole();role.setCodigo("COMANDANTE");when(crewRoles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(role));return f;}
 private void commanderAt(Province p){commander.getPerson().getCommanderProfile().setProvinciaActual(p);}
 private Flight withDepartureAirport(Flight f,Airport a,String state){f.setOrigen(a);f.setEstadoAeropuertoOrigen(state);return f;}

 @Test void aCommanderInTheProvinceOfThePatientIsOrdinarilyEligibleWithoutAnAirportYetButThePreliminaryWarningAppears(){
  Flight f=unassigned();commanderAt(province);when(users.findActiveCommandersInProvince(province.getId())).thenReturn(List.of(commander));
  CommanderCandidates result=service.commanderCandidates(f.getId(),ops.getId(),"");
  assertTrue(result.salida().preliminar());assertEquals("PROVINCIA_DEL_PACIENTE",result.salida().fuente());assertEquals(province.getId(),result.salida().provinciaId());assertNull(result.salida().aeropuertoId());
  assertEquals(1,result.ordinarios().size());assertEquals("MISMA_JURISDICCION",result.ordinarios().get(0).codigoUbicacion());assertTrue(result.advertencia().contains("preliminares"));
 }
 @Test void anAirportInTheSameProvinceMakesTheCandidatesDefinitiveOnceConfirmedAndPreliminaryWhileOnlyProposed(){
  Flight f=withDepartureAirport(unassigned(),tuc,Flight.PROPOSED);commanderAt(province);when(users.findActiveCommandersInProvince(province.getId())).thenReturn(List.of(commander));
  CommanderCandidates proposed=service.commanderCandidates(f.getId(),ops.getId(),"");
  assertTrue(proposed.salida().preliminar());assertEquals("AEROPUERTO_PROPUESTO",proposed.salida().fuente());assertEquals(tuc.getId(),proposed.salida().aeropuertoId());assertNotNull(proposed.advertencia());
  f.setEstadoAeropuertoOrigen(Flight.CONFIRMED);
  CommanderCandidates confirmed=service.commanderCandidates(f.getId(),ops.getId(),"");
  assertFalse(confirmed.salida().preliminar());assertEquals("AEROPUERTO_CONFIRMADO",confirmed.salida().fuente());assertNull(confirmed.advertencia());
 }
 @Test void theProvinceOfTheDepartureAirportDecidesNotTheLocalityOfThePatient(){
  Flight f=withDepartureAirport(unassigned(),salta,Flight.PROPOSED);Locality other=locality("Salta capital",otherProvince);
  when(users.findActiveCommandersInProvince(otherProvince.getId())).thenReturn(List.of());when(users.findActiveCommandersOutsideProvince(eq(otherProvince.getId()),eq(""),any())).thenReturn(List.of());when(users.countActiveCommandersOutsideProvince(otherProvince.getId())).thenReturn(List.<Object[]>of());
  CommanderCandidates result=service.commanderCandidates(f.getId(),ops.getId(),"");
  assertEquals(otherProvince.getId(),result.salida().provinciaId());assertEquals("Salta",result.salida().provincia());assertNotNull(other);
  verify(users,never()).findActiveCommandersInProvince(province.getId());
 }
 @Test void aCommanderInAnotherProvinceIsNotOrdinarilyEligible(){
  Flight f=unassigned();commanderAt(otherProvince);
  ApiException e=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId()),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION",e.code());assertEquals("OTRA_PROVINCIA",e.details().get("tipo"));
  assertNull(f.getComandante());assertNull(f.getAircraft());assertNull(f.getEstadoVuelo());verify(geoExceptions,never()).saveAndFlush(any());
 }
 @Test void cabaAndTheProvinceOfBuenosAiresAreDifferentJurisdictionsForTheDepartureRule(){
  Province caba=new Province();caba.setId(id());caba.setNombre("Ciudad Autónoma de Buenos Aires");Province pba=new Province();pba.setId(id());pba.setNombre("Buenos Aires");
  Airport aeroparque=airport("AEP",caba),ezeiza=airport("EZE",pba);
  Flight f=withDepartureAirport(unassigned(),aeroparque,Flight.CONFIRMED);commanderAt(pba);
  ApiException e=assertThrows(ApiException.class,()->service.assignCommander(f.getId(),new AssignCommander(commander.getId(),null),ops.getId()));
  assertEquals("COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION",e.code());assertEquals("OTRA_PROVINCIA",e.details().get("tipo"));
  f.setOrigen(ezeiza);f.setEstadoAeropuertoOrigen(Flight.CONFIRMED);
  assertEquals("RESERVADO",reserveState(service.assignCommander(f.getId(),new AssignCommander(commander.getId(),null),ops.getId()),f));
  commanderAt(caba);f.setComandante(null);f.setOrigen(aeroparque);
  assertEquals("RESERVADO",reserveState(service.assignCommander(f.getId(),new AssignCommander(commander.getId(),null),ops.getId()),f));
 }
 private String reserveState(FlightView view,Flight f){return view.estadoVuelo()==null&&f.getComandante()!=null?"RESERVADO":"OTRO";}
 @Test void theDeparturePlaceOfThePatientLocalityIsNotRequiredToHaveAnAirportAndDoesNotChange(){
  Flight f=unassigned();commanderAt(province);Locality before=f.getSanitario().getLocalidadOrigenSolicitada();
  service.assignCommander(f.getId(),new AssignCommander(commander.getId(),null),ops.getId());
  assertNull(f.getOrigen());assertSame(before,f.getSanitario().getLocalidadOrigenSolicitada());assertSame(capital,f.getSanitario().getLocalidadDestinoSolicitada());
 }
 @Test void aCommanderWithoutAnyRegisteredLocationIsNotOrdinarilyEligible(){
  Flight f=unassigned();commanderAt(null);
  ApiException unknown=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId()),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,unknown.status());assertEquals("UBICACION_DESCONOCIDA",unknown.details().get("tipo"));assertNull(f.getComandante());
 }
 @Test void aCommanderInAnotherProvinceNeedsAnAuthorizedJustifiedException(){
  Flight f=unassigned();commanderAt(otherProvince);User co=centro();
  ApiException unauthorized=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId(),new GeographicExceptionRequest("Traslado urgente sin otro comandante")),ops.getId()));
  assertEquals(HttpStatus.FORBIDDEN,unauthorized.status());assertEquals("GEOGRAPHIC_EXCEPTION_NOT_AUTHORIZED",unauthorized.code());assertNull(f.getComandante());
  ApiException short_=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId(),new GeographicExceptionRequest("urgente")),co.getId()));
  assertEquals(HttpStatus.BAD_REQUEST,short_.status());assertEquals("GEOGRAPHIC_EXCEPTION_REASON_REQUIRED",short_.code());assertNull(f.getComandante());
  verify(geoExceptions,never()).saveAndFlush(any());
  FlightView view=service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId(),new GeographicExceptionRequest("  Traslado urgente sin otro comandante habilitado  ")),co.getId());
  assertEquals("PLANIFICADO",view.estadoVuelo());assertSame(commander,f.getComandante());
  ArgumentCaptor<CommanderGeographicException> saved=ArgumentCaptor.forClass(CommanderGeographicException.class);verify(geoExceptions).saveAndFlush(saved.capture());
  CommanderGeographicException e=saved.getValue();assertEquals("OTRA_PROVINCIA",e.getType());assertEquals("Traslado urgente sin otro comandante habilitado",e.getReason());assertSame(co,e.getAuthorizedBy());assertSame(commander,e.getCommander());assertSame(f,e.getFlight());assertSame(province,e.getDepartureProvince());assertSame(otherProvince,e.getCommanderProvince());assertNull(e.getDepartureLocality());assertNotNull(e.getAuthorizedAt());
  verify(audit).record(eq(f),eq(co),eq("COMMANDER_GEOGRAPHIC_EXCEPTION"),any(),eq("CREATE"),isNull(),contains("OTRA_PROVINCIA"));
 }
 @Test void theGeographicExceptionNeverSkipsTheOperationalChecks(){
  Flight f=unassigned();commanderAt(otherProvince);User co=centro();
  when(crewManagement.evaluateOn(any(),any(),eq("COMANDANTE"),any(),anyBoolean(),any())).thenReturn(new CrewManagementService.Eligibility(false,"HABILITACION_VENCIDA","Habilitación vencida",null));
  ApiException e=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId(),new GeographicExceptionRequest("Traslado urgente sin otro comandante")),co.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("HABILITACION_VENCIDA",e.code());assertNull(f.getComandante());verify(geoExceptions,never()).saveAndFlush(any());
 }
 @Test void anExceptionForACommanderInTheDepartureJurisdictionIsRejected(){
  Flight f=unassigned();commanderAt(province);
  ApiException e=assertThrows(ApiException.class,()->service.assign(f.getId(),new AssignResources(newPlane.getId(),commander.getId(),new GeographicExceptionRequest("Justificación innecesaria aquí")),centro().getId()));
  assertEquals(HttpStatus.BAD_REQUEST,e.status());assertEquals("GEOGRAPHIC_EXCEPTION_NOT_NEEDED",e.code());assertNull(f.getComandante());
 }

 // ----- Cambio de aeropuerto (escenario G) y aeropuertos sin jurisdicción conocida -----
 private Flight plannedWithCommander(){
  Flight f=sanitaryFlight(tuc);f.setEstadoAeropuertoOrigen(Flight.CONFIRMED);f.setEstadoAeropuertoDestino(Flight.CONFIRMED);commanderAt(province);
  return f;
 }
 @Test void changingTheDepartureAirportToAnotherProvinceIsRejectedWhileTheAssignedCommanderIsNotCoveredAndNothingChanges(){
  Flight f=plannedWithCommander();User co=centro();
  ApiException e=assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(salta.getId(),null,null,null,"Mejor conexión terrestre y clima"),co.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("AIRPORT_CHANGE_REQUIRES_COMMANDER_REVALIDATION",e.code());assertTrue(e.getMessage().contains("volver a verificar la elegibilidad del comandante"));
  assertSame(tuc,f.getOrigen());assertEquals(Flight.CONFIRMED,f.getEstadoAeropuertoOrigen());assertSame(commander,f.getComandante());verify(audit,never()).record(any(),any(),any(),any(),eq("SET_AIRPORTS"),any(),any());
 }
 @Test void changingTheDepartureAirportToAnotherProvinceWithAJustifiedExceptionKeepsTheCommanderAndProposesTheAirportAgain(){
  Flight f=plannedWithCommander();User co=centro();
  FlightView view=service.setAirports(f.getId(),new SetAirports(salta.getId(),null,null,new GeographicExceptionRequest("No hay comandantes disponibles en Salta"),"Mejor conexión terrestre y clima"),co.getId());
  assertSame(salta,f.getOrigen());assertEquals(Flight.PROPOSED,f.getEstadoAeropuertoOrigen());assertEquals(Flight.CONFIRMED,f.getEstadoAeropuertoDestino());assertSame(commander,f.getComandante());assertEquals("PLANIFICADO",view.estadoVuelo());
  ArgumentCaptor<CommanderGeographicException> saved=ArgumentCaptor.forClass(CommanderGeographicException.class);verify(geoExceptions).saveAndFlush(saved.capture());
  assertSame(otherProvince,saved.getValue().getDepartureProvince());assertSame(salta,saved.getValue().getDepartureAirport());
  verify(audit).record(eq(f),eq(co),eq("FLIGHT"),eq(f.getId()),eq("SET_AIRPORTS"),contains("\"estadoOrigen\":\"CONFIRMADO\""),contains("\"estadoOrigen\":\"PROPUESTO\""));
  verify(notifications).createOnce(eq(commander),eq(f),eq("AIRPORTS_PROPOSED"),contains("SLA"),anyString());
 }
 @Test void changingTheDepartureAirportToAnotherProvinceCanReplaceTheCommanderByOneOfTheNewJurisdiction(){
  Flight f=plannedWithCommander();User co=centro();User local=user("salteno","COMANDANTE",otherProvince);
  when(users.lockById(local.getId())).thenReturn(Optional.of(local));when(users.findById(local.getId())).thenReturn(Optional.of(local));when(users.findWithRolesByUsername(local.getUsername())).thenReturn(Optional.of(local));
  CrewRole role=new CrewRole();role.setCodigo("COMANDANTE");when(crewRoles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(role));
  service.setAirports(f.getId(),new SetAirports(salta.getId(),null,local.getId(),null,"Mejor conexión terrestre y clima"),co.getId());
  assertSame(salta,f.getOrigen());assertSame(local,f.getComandante());verify(notifications).createOnce(eq(commander),eq(f),eq("COMMANDER_UNASSIGNED"),anyString(),anyString());
 }
 @Test void aReplacementCommanderOfTheOldJurisdictionIsNotAcceptedForTheNewAirport(){
  Flight f=plannedWithCommander();User co=centro();User stillThere=user("tucumano","COMANDANTE",province);
  when(users.lockById(stillThere.getId())).thenReturn(Optional.of(stillThere));when(users.findById(stillThere.getId())).thenReturn(Optional.of(stillThere));when(users.findWithRolesByUsername(stillThere.getUsername())).thenReturn(Optional.of(stillThere));
  ApiException e=assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(salta.getId(),null,stillThere.getId(),null,"Mejor conexión terrestre y clima"),co.getId()));
  assertEquals("COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION",e.code());
 }
 @Test void anAirportOutsideTheProvinceOfThePatientRequiresAnOperationalJustification(){
  Flight f=unassigned();
  ApiException e=assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(salta.getId(),null,null,null,"  "),ops.getId()));
  assertEquals("AIRPORT_OUTSIDE_PATIENT_PROVINCE_REASON_REQUIRED",e.code());assertNull(f.getOrigen());
  service.setAirports(f.getId(),new SetAirports(salta.getId(),null,null,null,"Mejor conexión terrestre y clima"),ops.getId());
  assertSame(salta,f.getOrigen());assertEquals(Flight.PROPOSED,f.getEstadoAeropuertoOrigen());assertSame(capital,f.getSanitario().getLocalidadOrigenSolicitada(),"la localidad del paciente no se sobrescribe");
 }
 @Test void aProposedAirportInThePatientProvinceNeedsNoJustificationAndRecordsWhoAndWhen(){
  Flight f=unassigned();
  service.setAirports(f.getId(),new SetAirports(tuc.getId(),aep.getId(),null,null,null),ops.getId());
  assertSame(tuc,f.getOrigen());assertSame(aep,f.getDestino());assertEquals(Flight.PROPOSED,f.getEstadoAeropuertoOrigen());assertEquals(Flight.PROPOSED,f.getEstadoAeropuertoDestino());assertSame(ops,f.getAeropuertosFijadosPor());assertNotNull(f.getAeropuertosFijadosEn());
  assertNull(f.getEstadoVuelo(),"proponer aeropuertos no cambia el estado del vuelo");
 }
 @Test void anAirportWithoutAKnownProvinceBlocksTheDecisionThatDependsOnIt(){
  Airport unknown=airport("SIN-PROVINCIA",null);when(airports.findById(unknown.getId())).thenReturn(Optional.of(unknown));
  Flight f=unassigned();
  ApiException e=assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(unknown.getId(),null,null,null,"Justificación operativa suficiente"),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("AIRPORT_PROVINCE_UNKNOWN",e.code());assertNull(f.getOrigen());
  withDepartureAirport(f,unknown,Flight.CONFIRMED);
  assertEquals("AIRPORT_PROVINCE_UNKNOWN",assertThrows(ApiException.class,()->service.commanderCandidates(f.getId(),ops.getId(),"")).code());
 }
 @Test void onlyOperationsProposeAirportsAndOnlyBeforeTheFlightStarts(){
  Flight f=unassigned();
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(tuc.getId(),null,null,null,null),commander.getId())).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(null,null,null,null,null),ops.getId())).status());
  f.setEstadoVuelo(status("EN_CURSO"));
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(tuc.getId(),null,null,null,null),ops.getId())).status());
  assertNull(f.getOrigen());
 }
 @Test void theDepartureAirportMustBeDifferentFromTheArrivalAirportAndActive(){
  Flight f=unassigned();
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(tuc.getId(),tuc.getId(),null,null,null),ops.getId())).status());
  tuc2.setActivo(false);
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.setAirports(f.getId(),new SetAirports(tuc2.getId(),null,null,null,null),ops.getId())).status());
 }
 @Test void aSanitaryAircraftMustBeInTheJurisdictionOfTheProposedDepartureAirport(){
  Flight f=withDepartureAirport(unassigned(),salta,Flight.PROPOSED);Aircraft inTuc=plane("LV-TUC",tuc,4);when(aircraft.lockById(inTuc.getId())).thenReturn(Optional.of(inTuc));
  ApiException e=assertThrows(ApiException.class,()->service.assignAircraft(f.getId(),new AssignAircraft(inTuc.getId(),null),ops.getId()));
  assertEquals(HttpStatus.BAD_REQUEST,e.status());assertTrue(e.getMessage().contains("jurisdicción del aeropuerto de salida"));assertNull(f.getAircraft());
 }

 @Test void theCommanderChosenFirstIsReservedWithoutChangingTheFlightStateAndTheAircraftCompletesTheAssignment(){
  Flight f=unassigned();
  FlightView reserved=service.assignCommander(f.getId(),new AssignCommander(commander.getId(),null),ops.getId());
  assertSame(commander,f.getComandante());assertNull(f.getEstadoVuelo(),"la reserva no cambia el estado del vuelo");assertNull(reserved.estadoVuelo());assertNull(f.getAircraft());
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT"),eq(f.getId()),eq("ASSIGN_FLIGHT_COMMANDER"),isNull(),contains("\"salidaPreliminar\":true"));
  verify(notifications,never()).create(any(),any(),eq("COMMANDER_ASSIGNED"),anyString());verify(crews,never()).saveAndFlush(any());
  FlightView done=service.assignAircraft(f.getId(),new AssignAircraft(newPlane.getId(),null),ops.getId());
  assertEquals("PLANIFICADO",done.estadoVuelo());assertSame(newPlane,f.getAircraft());assertSame(commander,f.getComandante());
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT"),eq(f.getId()),eq("ASSIGN_RESOURCES"),any(),contains(newPlane.getId().toString()));
  verify(notifications).create(eq(commander),eq(f),eq("COMMANDER_ASSIGNED"),anyString());
 }
 @Test void theAircraftChosenFirstIsReservedAndTheCommanderCompletesTheAssignment(){
  Flight f=unassigned();
  FlightView reserved=service.assignAircraft(f.getId(),new AssignAircraft(newPlane.getId(),null),ops.getId());
  assertSame(newPlane,f.getAircraft());assertNull(f.getEstadoVuelo());assertNull(reserved.estadoVuelo());assertNull(f.getComandante());
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT"),eq(f.getId()),eq("ASSIGN_FLIGHT_AIRCRAFT"),isNull(),contains("RESERVADO"));verify(notifications,never()).create(any(),any(),eq("COMMANDER_ASSIGNED"),anyString());
  FlightView done=service.assignCommander(f.getId(),new AssignCommander(commander.getId(),null),ops.getId());
  assertEquals("PLANIFICADO",done.estadoVuelo());assertSame(commander,f.getComandante());verify(notifications).create(eq(commander),eq(f),eq("COMMANDER_ASSIGNED"),anyString());
 }
 @Test void anAircraftReservedByAnotherApprovedRequestIsNotOfferedForAnIncompatibleSchedule(){
  Flight f=unassigned();Flight other=new Flight();other.setId(id());other.setCodigo("V-RESERVA");
  when(flights.aircraftReservedIn(eq(newPlane.getId()),any(),any())).thenReturn(List.of(other));
  ApiException e=assertThrows(ApiException.class,()->service.assignAircraft(f.getId(),new AssignAircraft(newPlane.getId(),null),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertTrue(e.getMessage().contains("V-RESERVA"));assertNull(f.getAircraft());
 }
 @Test void completingTheReservationFailsIfTheCommanderMovedOutOfTheDepartureJurisdiction(){
  Flight f=unassigned();service.assignCommander(f.getId(),new AssignCommander(commander.getId(),null),ops.getId());
  commanderAt(otherProvince);
  ApiException e=assertThrows(ApiException.class,()->service.assignAircraft(f.getId(),new AssignAircraft(newPlane.getId(),null),ops.getId()));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("COMMANDER_OUTSIDE_DEPARTURE_JURISDICTION",e.code());
 }
 @Test void aFailedAssignmentLeavesTheRequestWithoutResourcesNorExceptions(){
  Flight f=unassigned();commanderAt(otherProvince);
  when(aircraft.lockById(newPlane.getId())).thenReturn(Optional.empty());
  assertThrows(ApiException.class,()->service.assignAircraft(f.getId(),new AssignAircraft(newPlane.getId(),null),ops.getId()));
  assertNull(f.getAircraft());assertNull(f.getComandante());assertNull(f.getEstadoVuelo());verify(geoExceptions,never()).saveAndFlush(any());
 }
 @Test void candidatesSeparateOrdinaryFromExceptionalCommandersAndExplainWhyNoneIsOrdinary(){
  Flight f=unassigned();User far=user("lejos","COMANDANTE",otherProvince);
  when(users.findActiveCommandersInProvince(province.getId())).thenReturn(List.of());
  when(users.findActiveCommandersOutsideProvince(eq(province.getId()),eq(""),any())).thenReturn(List.of(far));
  when(users.countActiveCommandersOutsideProvince(province.getId())).thenReturn(List.<Object[]>of(new Object[]{otherProvince.getId(),1L},new Object[]{null,2L}));
  when(users.findById(far.getId())).thenReturn(Optional.of(far));
  User co=centro();
  CommanderCandidates result=service.commanderCandidates(f.getId(),co.getId(),"");
  assertTrue(result.ordinarios().isEmpty());assertEquals(1,result.excepcionales().size());assertEquals("EXCEPCION",result.excepcionales().get(0).elegibilidad());assertEquals("OTRA_PROVINCIA",result.excepcionales().get(0).codigoUbicacion());
  assertEquals(1L,result.fueraDeJurisdiccion().get("OTRA_PROVINCIA"));assertEquals(2L,result.fueraDeJurisdiccion().get("UBICACION_DESCONOCIDA"));assertTrue(result.puedeAutorizarExcepcion());
  assertTrue(result.mensaje().startsWith("No se encontraron comandantes disponibles en Tucumán"));assertTrue(result.mensaje().contains("2 sin ubicación registrada"));assertTrue(result.mensaje().contains("1 en otra provincia"));
  assertTrue(service.availableCommanders(f.getId(),co.getId()).isEmpty());
 }
 @Test void aCommanderInTheDepartureJurisdictionIsOrdinaryAndOneWithAnOperationalConflictIsExplained(){
  Flight f=unassigned();User busy=user("ocupado","COMANDANTE",province);
  when(users.findActiveCommandersInProvince(province.getId())).thenReturn(List.of(commander,busy));
  when(crewManagement.evaluate(any(),eq(busy),eq("COMANDANTE"),anyBoolean())).thenReturn(new CrewManagementService.Eligibility(false,"CONFLICTO_ASIGNACION","Tiene el vuelo V-1 comprometido en un horario incompatible",null));
  CommanderCandidates result=service.commanderCandidates(f.getId(),ops.getId(),"");
  assertEquals(1,result.ordinarios().size());assertEquals(commander.getId(),result.ordinarios().get(0).id());assertEquals("ORDINARIA",result.ordinarios().get(0).elegibilidad());assertNull(result.mensaje());
  assertEquals(1,result.noElegiblesEnJurisdiccion().size());assertEquals("NO_ELEGIBLE",result.noElegiblesEnJurisdiccion().get(0).elegibilidad());assertEquals("CONFLICTO_ASIGNACION",result.noElegiblesEnJurisdiccion().get(0).codigoOperativo());
  assertFalse(result.puedeAutorizarExcepcion());
 }

 // ---------- Liberación al cancelar ----------
 @Test void cancellingReleasesAircraftCommanderAndCrewWithoutDeletingTheirHistory(){
  FlightCrew commanderRow=crew(1,operational,commander,"COMANDANTE"),medicRow=crew(2,operational,medic,"MEDICO");
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(operational.getId())).thenReturn(List.of(commanderRow,medicRow));
  CancellationReason reason=new CancellationReason();reason.setCodigo("CLIMA");reason.setNombre("Clima");when(reasons.findByIdAndActivoTrue(5L)).thenReturn(Optional.of(reason));status("CANCELADO");
  FlightView view=service.cancel(operational.getId(),new Cancel(5L,null),ops.getId());
  assertEquals("CANCELADO",view.estadoVuelo());
  verify(crews,never()).delete(any());verify(crews,never()).deleteAll(any());
  assertNull(commanderRow.getFechaBaja());assertNull(medicRow.getFechaBaja());
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class);verify(audit).record(eq(operational),eq(ops),eq("FLIGHT"),eq(operational.getId()),eq("CANCEL"),anyString(),after.capture());
  assertTrue(after.getValue().contains("\"tripulantesLiberados\":["+medic.getId()+"]"));assertTrue(after.getValue().contains(oldPlane.getId().toString()));
  verify(notifications).createOnce(eq(medic),eq(operational),eq("FLIGHT_CANCELLED"),anyString(),anyString());verify(notifications).createOnce(eq(commander),eq(operational),eq("FLIGHT_CANCELLED"),anyString(),anyString());
  assertNotNull(operational.getAircraft());
 }
 @Test void aCancelledFlightNoLongerBlocksTheAircraftOrTheCrewMember(){
  // La disponibilidad sólo cuenta estados comprometidos: tras cancelar, la consulta no devuelve el vuelo y la misma aeronave puede asignarse.
  assertFalse(FlightStates.COMMITTED.contains("CANCELADO"));assertTrue(FlightStates.TERMINAL.contains("CANCELADO"));assertFalse(FlightStates.MUTABLE_BEFORE_START.contains("EN_CURSO"));
 }
}
