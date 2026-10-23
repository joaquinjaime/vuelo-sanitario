package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.*;

/** Covers the new operational creation path without relying on a sanitary extension. */
class OperationalFlightServiceTest {
 private FlightRepository flights=mock(FlightRepository.class); private SanitaryFlightRepository sanitary=mock(SanitaryFlightRepository.class); private FlightTypeRepository types=mock(FlightTypeRepository.class); private SanitaryRequestStatusRepository sanitaryStatuses=mock(SanitaryRequestStatusRepository.class); private PatientRepository patients=mock(PatientRepository.class); private UserRepository users=mock(UserRepository.class); private FlightStatusRepository statuses=mock(FlightStatusRepository.class); private FlightPriorityRepository priorities=mock(FlightPriorityRepository.class); private AircraftRepository aircraft=mock(AircraftRepository.class); private AirportRepository airports=mock(AirportRepository.class); private LocalityRepository localities=mock(LocalityRepository.class); private CrewRoleRepository crewRoles=mock(CrewRoleRepository.class); private FlightCrewRepository crews=mock(FlightCrewRepository.class); private FlightMedicalInfoRepository medical=mock(FlightMedicalInfoRepository.class); private FlightFinalReportRepository reports=mock(FlightFinalReportRepository.class); private FlightScheduleNegotiationRepository negotiations=mock(FlightScheduleNegotiationRepository.class); private CancellationReasonRepository cancellationReasons=mock(CancellationReasonRepository.class); private WeatherSnapshotRepository weather=mock(WeatherSnapshotRepository.class); private AuditService audit=mock(AuditService.class); private FlightAuthorizationService access=mock(FlightAuthorizationService.class); private NotificationService notifications=mock(NotificationService.class); private FlightUrgencyPolicy urgency=mock(FlightUrgencyPolicy.class); private FinalReportWorkflowService reportWorkflow=mock(FinalReportWorkflowService.class); private CommanderReportAccessService commanderAccess=mock(CommanderReportAccessService.class);
 private CrewManagementService crewManagement=mock(CrewManagementService.class);
 private FlightService service;
 private User admin, commander; private Aircraft plane; private Airport origin,destination;

 @BeforeEach void setUp(){
  when(crewManagement.qualified(any(),eq("COMANDANTE"),nullable(java.time.LocalDate.class))).thenReturn(true);
  service=new FlightService(flights,sanitary,types,sanitaryStatuses,patients,users,statuses,priorities,aircraft,airports,localities,crewRoles,crews,medical,reports,negotiations,cancellationReasons,weather,audit,access,notifications,urgency,reportWorkflow,commanderAccess,crewManagement,mock(FlightLogService.class),java.time.Clock.systemDefaultZone());
  Province province=new Province();province.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); province.setNombre("Tucumán");
  origin=airport("TUC",province); destination=airport("AEP",province);
  plane=new Aircraft();plane.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));plane.setActivo(true);plane.setAeropuertoActual(origin);
  admin=user("admin","ADMINISTRADOR",null); commander=user("cmd","COMANDANTE",province);
  when(users.findById(admin.getId())).thenReturn(Optional.of(admin)); when(users.findById(commander.getId())).thenReturn(Optional.of(commander)); when(users.lockById(commander.getId())).thenReturn(Optional.of(commander));
  when(users.findWithRolesByUsername("admin")).thenReturn(Optional.of(admin)); when(users.findWithRolesByUsername("cmd")).thenReturn(Optional.of(commander));
  FlightType type=new FlightType();type.setCodigo("REGRESO_BASE");type.setNombre("Regreso a base");type.setActivo(true); when(types.findByCodigoAndActivoTrue("REGRESO_BASE")).thenReturn(Optional.of(type));
  FlightStatus pending=new FlightStatus();pending.setCodigo("PENDIENTE_CONFIRMACION_COMANDANTE"); when(statuses.findByCodigo("PENDIENTE_CONFIRMACION_COMANDANTE")).thenReturn(Optional.of(pending));
  CrewRole commanderRole=new CrewRole();commanderRole.setCodigo("COMANDANTE"); when(crewRoles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(commanderRole));
  when(aircraft.lockById(plane.getId())).thenReturn(Optional.of(plane)); when(airports.findById(destination.getId())).thenReturn(Optional.of(destination));
  when(flights.activeAircraftAssignments(any(),any())).thenReturn(List.of()); when(flights.overlappingAircraft(any(),any(),any())).thenReturn(List.of()); when(flights.overlappingCommander(any(),any(),any())).thenReturn(List.of());
 }
 @Test void adminCreatesOperationalFlightWithoutSanitaryExtension(){
  FlightView result=service.createOperational(new CreateOperationalFlight("REGRESO_BASE","Retorno a base",plane.getId(),commander.getId(),destination.getId(),LocalDateTime.now().plusDays(2),LocalDateTime.now().plusDays(2).plusHours(2)),admin.getId());
  assertEquals("REGRESO_BASE",result.tipo().codigo());assertEquals("PENDIENTE_CONFIRMACION_COMANDANTE",result.estadoVuelo());assertNull(result.datosSanitarios());assertEquals("TUC",result.origen());assertEquals("AEP",result.destino());
  verify(sanitary,never()).save(any()); verify(notifications).create(eq(commander),any(Flight.class),eq("COMMANDER_ASSIGNMENT_PENDING"),anyString());
 }
 @Test void operationalFlightRejectsSanitaryType(){
  FlightType sanitaryType=new FlightType();sanitaryType.setCodigo("SANITARIO");sanitaryType.setActivo(true);when(types.findByCodigoAndActivoTrue("SANITARIO")).thenReturn(Optional.of(sanitaryType));
  assertThrows(ApiException.class,()->service.createOperational(new CreateOperationalFlight("SANITARIO","No permitido",plane.getId(),commander.getId(),destination.getId(),LocalDateTime.now().plusDays(2),LocalDateTime.now().plusDays(2).plusHours(2)),admin.getId()));
 }
 @Test void operationalFlightRejectsInactiveCommander(){
  commander.setActivo(false);commander.setEstadoCuenta("DESACTIVADO");
  assertThrows(ApiException.class,()->service.createOperational(new CreateOperationalFlight("REGRESO_BASE","Retorno",plane.getId(),commander.getId(),destination.getId(),LocalDateTime.now().plusDays(2),LocalDateTime.now().plusDays(2).plusHours(2)),admin.getId()));
  verify(flights,never()).save(any());
 }
 @Test void operationalFlightRejectsPendingCommander(){
  commander.setEstadoCuenta("PENDIENTE_ACTIVACION");
  assertThrows(ApiException.class,()->service.createOperational(new CreateOperationalFlight("REGRESO_BASE","Retorno",plane.getId(),commander.getId(),destination.getId(),LocalDateTime.now().plusDays(2),LocalDateTime.now().plusDays(2).plusHours(2)),admin.getId()));
  verify(flights,never()).save(any());
 }
 @Test void commanderRecordsWeatherAndAuthorizedReaderRetrievesHistory(){
  Flight f=new Flight(); f.setId(21L); f.setComandante(commander); FlightStatus planned=new FlightStatus(); planned.setCodigo("PLANIFICADO"); f.setEstadoVuelo(planned);
  when(flights.lockById(21L)).thenReturn(Optional.of(f)); when(flights.findById(21L)).thenReturn(Optional.of(f));
  when(weather.saveAndFlush(any())).thenAnswer(inv->{WeatherSnapshot w=inv.getArgument(0);w.setId(31L);w.setFechaRegistro(LocalDateTime.of(2026,10,18,12,0));return w;});
  WeatherView saved=service.registerWeather(21L,new Weather("  Nubes  ",false," Viento "),commander.getId());
  assertEquals("Nubes",saved.condiciones()); assertFalse(saved.favorable()); assertEquals("Viento",saved.observaciones());
  var captor=org.mockito.ArgumentCaptor.forClass(WeatherSnapshot.class); verify(weather).saveAndFlush(captor.capture()); when(weather.findByFlightIdOrderByFechaRegistroDescIdDesc(21L)).thenReturn(List.of(captor.getValue()));
  assertEquals(saved,service.weatherHistory(21L,admin.getId()).get(0)); verify(access).mayRead(f,admin.getId()); verify(audit).record(eq(f),eq(commander),eq("WEATHER"),eq(31L),eq("CREATE"),isNull(),isNull());
 }
 @Test void weatherRejectsOtherCommanderAndUnauthorizedHistory(){
  Flight f=new Flight(); f.setId(22L);f.setComandante(commander);FlightStatus planned=new FlightStatus();planned.setCodigo("PLANIFICADO");f.setEstadoVuelo(planned);
  when(flights.lockById(22L)).thenReturn(Optional.of(f));when(flights.findById(22L)).thenReturn(Optional.of(f));
  assertThrows(ApiException.class,()->service.registerWeather(22L,new Weather("Nubes",true,null),admin.getId()));verify(weather,never()).saveAndFlush(any());
  doThrow(new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"denegado")).when(access).mayRead(f,admin.getId());
  assertThrows(ApiException.class,()->service.weatherHistory(22L,admin.getId()));verify(weather,never()).findByFlightIdOrderByFechaRegistroDescIdDesc(any());
 }
 @Test void weatherCannotBeRecordedOutsidePlanning(){
  Flight f=new Flight();f.setComandante(commander);FlightStatus status=new FlightStatus();status.setCodigo("FINALIZADO");f.setEstadoVuelo(status);when(flights.lockById(23L)).thenReturn(Optional.of(f));
  assertThrows(ApiException.class,()->service.registerWeather(23L,new Weather("Nubes",true,null),commander.getId()));verify(weather,never()).saveAndFlush(any());
 }
 @Test void crewReadIsRestrictedAndShowsCommander(){
  Flight f=new Flight();f.setId(40L);f.setComandante(commander);when(flights.findById(40L)).thenReturn(Optional.of(f));
  CrewRole role=new CrewRole();role.setCodigo("COMANDANTE");role.setNombre("Comandante");FlightCrew c=new FlightCrew();c.setId(41L);c.setFlight(f);c.setUser(commander);c.setCrewRole(role);when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(40L)).thenReturn(List.of(c));
  assertTrue(service.crew(40L,commander.getId()).get(0).comandante());
  assertThrows(ApiException.class,()->service.crew(40L,admin.getId()));
 }
 @Test void crewRemovalRequiresOperationsAndIsDelegatedToTheCrewService(){
  User ops=user("ops","OPERACIONES",null);when(users.findById(ops.getId())).thenReturn(Optional.of(ops));when(users.findWithRolesByUsername("ops")).thenReturn(Optional.of(ops));
  service.removeCrew(40L,41L,ops.getId());verify(crewManagement).remove(40L,41L,ops.getId());
  assertThrows(ApiException.class,()->service.removeCrew(40L,41L,admin.getId()));verify(crewManagement,times(1)).remove(any(),any(),any());verify(crews,never()).delete(any());
 }
 @Test void crewHistoryKeepsRemovedMembersAndMarksThemAsNotCurrent(){
  Flight f=new Flight();f.setId(40L);f.setComandante(commander);when(flights.findById(40L)).thenReturn(Optional.of(f));
  CrewRole role=new CrewRole();role.setCodigo("MEDICO");role.setNombre("Médico");User medic=user("medic","MEDICO",null);medic.setId(77L);
  FlightCrew removed=new FlightCrew();removed.setId(42L);removed.setFlight(f);removed.setUser(medic);removed.setCrewRole(role);removed.darDeBaja(LocalDateTime.of(2030,1,1,10,0),commander,"RETIRO");
  when(crews.findByFlightIdOrderByIdAsc(40L)).thenReturn(List.of(removed));when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(40L)).thenReturn(List.of());
  assertTrue(service.crew(40L,commander.getId()).isEmpty());
  var history=service.crew(40L,commander.getId(),true);
  assertEquals(1,history.size());assertFalse(history.get(0).vigente());assertEquals("RETIRO",history.get(0).motivoBaja());assertEquals("cmd",history.get(0).bajaPor());assertFalse(history.get(0).comandante());
 }
 private Airport airport(String name,Province province){Airport a=new Airport();a.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));a.setNombre(name);a.setActivo(true);a.setProvinciaReferencial(province);return a;}
 private User user(String username,String role,Province province){User u=new User();u.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));u.setUsername(username);u.setEstadoCuenta("ACTIVO");Person p=new Person();CommanderProfile profile=new CommanderProfile();profile.setLicenseNumber("LIC-1");profile.setProvinciaActual(province);p.setCommanderProfile(profile);u.setPerson(p);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;}
}
