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
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;

/** Ciclo terminal del vuelo: inicio, finalización, cancelación y restricciones del comandante bloqueado. */
class FlightClosureServiceTest {
 private final FlightRepository flights=mock(FlightRepository.class); private final SanitaryFlightRepository sanitary=mock(SanitaryFlightRepository.class); private final UserRepository users=mock(UserRepository.class); private final FlightStatusRepository statuses=mock(FlightStatusRepository.class); private final AircraftRepository aircraft=mock(AircraftRepository.class); private final AirportRepository airports=mock(AirportRepository.class); private final CancellationReasonRepository reasons=mock(CancellationReasonRepository.class); private final WeatherSnapshotRepository weather=mock(WeatherSnapshotRepository.class); private final FlightTypeRepository types=mock(FlightTypeRepository.class);
 private final AuditService audit=mock(AuditService.class); private final FlightAuthorizationService access=mock(FlightAuthorizationService.class); private final NotificationService notifications=mock(NotificationService.class); private final FinalReportWorkflowService reportWorkflow=mock(FinalReportWorkflowService.class); private final CommanderReportAccessService commanderAccess=mock(CommanderReportAccessService.class); private final FlightLogService log=mock(FlightLogService.class); private final CrewManagementService crewManagement=mock(CrewManagementService.class); private final FlightCrewRepository crews=mock(FlightCrewRepository.class);
 private final FlightRouteService routeReview=mock(FlightRouteService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2026-10-20T03:30:00Z"),ZoneId.of("America/Argentina/Tucuman"));
 private FlightService service; private User ops,commander; private Flight flight; private Aircraft plane; private Airport origin,destination;
 private final Map<String,FlightStatus> catalog=new HashMap<>();

 @BeforeEach void setUp(){
  service=new FlightService(flights,sanitary,types,mock(SanitaryRequestStatusRepository.class),mock(PatientRepository.class),users,statuses,mock(FlightPriorityRepository.class),aircraft,airports,mock(LocalityRepository.class),mock(CrewRoleRepository.class),crews,mock(FlightMedicalInfoRepository.class),mock(FlightFinalReportRepository.class),mock(FlightScheduleNegotiationRepository.class),reasons,weather,audit,access,notifications,mock(FlightUrgencyPolicy.class),reportWorkflow,commanderAccess,crewManagement,log,routeReview,mock(AirportLocks.class),clock);
  Province province=new Province();province.setId(1L);province.setNombre("Tucumán");
  origin=airport(1L,"TUC",province);destination=airport(2L,"AEP",province);
  ops=user(10L,"ops","CENTRO_OPERACIONES");commander=user(11L,"cmd","COMANDANTE");commander.getPerson().getCommanderProfile().setProvinciaActual(province);
  plane=new Aircraft();plane.setId(5L);plane.setActivo(true);plane.setAeropuertoActual(origin);
  for(String code:List.of("PLANIFICADO","EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO","PENDIENTE_CONFIRMACION_COMANDANTE")){FlightStatus s=new FlightStatus();s.setCodigo(code);catalog.put(code,s);when(statuses.findByCodigo(code)).thenReturn(Optional.of(s));}
  when(users.findById(10L)).thenReturn(Optional.of(ops));when(users.findById(11L)).thenReturn(Optional.of(commander));when(users.lockById(11L)).thenReturn(Optional.of(commander));when(users.findWithRolesByUsername("ops")).thenReturn(Optional.of(ops));when(users.findWithRolesByUsername("cmd")).thenReturn(Optional.of(commander));
  when(crewManagement.evaluateOn(any(),any(),any(),any(),anyBoolean())).thenReturn(new CrewManagementService.Eligibility(true,"ELEGIBLE","Vigente",null));
  flight=flight("EN_CURSO");when(flights.lockById(7L)).thenReturn(Optional.of(flight));when(flights.findById(7L)).thenReturn(Optional.of(flight));
  FlightType type=new FlightType();type.setCodigo("REGRESO_BASE");type.setActivo(true);when(types.findByCodigoAndActivoTrue("REGRESO_BASE")).thenReturn(Optional.of(type));when(airports.findById(2L)).thenReturn(Optional.of(destination));when(aircraft.lockById(5L)).thenReturn(Optional.of(plane));when(flights.activeAircraftAssignments(any(),any())).thenReturn(List.of());
 }

 @Test void finishRecordsRealTimeInBusinessZoneCreatesTheObligationAndMovesResources(){
  FlightView view=service.finish(7L,10L);
  assertEquals("FINALIZADO",view.estadoVuelo()); assertEquals(LocalDateTime.of(2026,10,20,0,30),flight.getFechaLlegadaReal()); assertSame(destination,plane.getAeropuertoActual());
  verify(reportWorkflow).createObligationAfterFinish(flight,ops); verify(log).automatic(eq(flight),eq(ops),eq("FINALIZACION"),anyString());
  verify(audit).record(eq(flight),eq(ops),eq("FLIGHT"),eq(7L),eq("FINISH"),contains("EN_CURSO"),contains("FINALIZADO"));
 }
 @Test void flightViewExposesTheRouteAsStructuredPlacesForOperationalFlightsAndNullWhenThereIsNone(){
  FlightView view=service.finish(7L,10L);
  assertEquals("TUC",view.origen()); assertEquals("TUC",view.origenDetalle().nombre()); assertEquals("Tucumán",view.origenDetalle().provincia()); assertEquals(1L,view.origenDetalle().provinciaId()); assertEquals("AEP",view.destinoDetalle().nombre());
  Flight bare=flight("PLANIFICADO"); bare.setOrigen(null); bare.setDestino(null); when(flights.findById(8L)).thenReturn(Optional.of(bare)); bare.setId(8L);
  FlightDetailView detail=service.get(8L,10L); assertNull(detail.vuelo().origenDetalle()); assertNull(detail.vuelo().destinoDetalle()); assertNull(detail.vuelo().origen());
 }
 @Test void finishIsRefusedFromAnyStateOtherThanInProgress(){
  for(String state:List.of("PLANIFICADO","FINALIZADO","COMPLETADO","CANCELADO","PENDIENTE_CONFIRMACION_COMANDANTE")){
   flight.setEstadoVuelo(catalog.get(state)); assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.finish(7L,10L),state).status());
  }
  flight.setEstadoVuelo(null); assertThrows(ApiException.class,()->service.finish(7L,10L));
  verifyNoInteractions(reportWorkflow); assertNull(flight.getFechaLlegadaReal());
 }
 @Test void commanderCannotFinishAndTheRepeatedRequestDoesNotCreateASecondObligation(){
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.finish(7L,11L)).status()); verifyNoInteractions(reportWorkflow);
  service.finish(7L,10L); assertThrows(ApiException.class,()->service.finish(7L,10L)); verify(reportWorkflow,times(1)).createObligationAfterFinish(any(),any());
 }
 @Test void startUsesBusinessClockAndRefusesABlockedCommander(){
  flight.setEstadoVuelo(catalog.get("PLANIFICADO")); doThrow(new ApiException(HttpStatus.FORBIDDEN,"COMANDANTE_BLOQUEADO","FUNCIONES BLOQUEADAS",Map.of())).when(commanderAccess).requireOperationalAccess(11L);
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.start(7L,10L)).status()); assertEquals("PLANIFICADO",flight.getEstadoVuelo().getCodigo()); assertNull(flight.getFechaSalidaReal());
  doNothing().when(commanderAccess).requireOperationalAccess(11L); service.start(7L,10L);
  assertEquals("EN_CURSO",flight.getEstadoVuelo().getCodigo()); assertEquals(LocalDateTime.of(2026,10,20,0,30),flight.getFechaSalidaReal());
 }
 @Test void startRejectsACommanderWhoseCredentialChangedAfterPlanning(){
  flight.setEstadoVuelo(catalog.get("PLANIFICADO"));
  when(crewManagement.evaluateOn(eq(flight),eq(commander),eq("COMANDANTE"),any(),eq(true))).thenReturn(new CrewManagementService.Eligibility(false,"HABILITACION_REVOCADA","Verificación revocada",null));
  ApiException e=assertThrows(ApiException.class,()->service.start(7L,10L));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("HABILITACION_REVOCADA",e.code());assertEquals("PLANIFICADO",flight.getEstadoVuelo().getCodigo());assertNull(flight.getFechaSalidaReal());
 }
 @Test void startRejectsAnAssignedCrewMemberWhoseCredentialExpired(){
  flight.setEstadoVuelo(catalog.get("PLANIFICADO"));User copiloto=user(12L,"cop","DTS");when(users.lockById(12L)).thenReturn(Optional.of(copiloto));when(users.findById(12L)).thenReturn(Optional.of(copiloto));
  CrewRole role=new CrewRole();role.setCodigo("COPILOTO");FlightCrew assignment=new FlightCrew();assignment.setUser(copiloto);assignment.setCrewRole(role);
  when(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(7L)).thenReturn(List.of(assignment));
  when(crewManagement.evaluateOn(eq(flight),eq(copiloto),eq("COPILOTO"),any(),eq(true))).thenReturn(new CrewManagementService.Eligibility(false,"HABILITACION_VENCIDA","Vencida",null));
  ApiException e=assertThrows(ApiException.class,()->service.start(7L,10L));
  assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("HABILITACION_VENCIDA",e.code());assertEquals("PLANIFICADO",flight.getEstadoVuelo().getCodigo());verify(log,never()).automatic(any(),any(),eq("INICIO"),anyString());
 }
 @Test void startAndFinishCannotRunOutOfOrder(){
  flight.setEstadoVuelo(catalog.get("COMPLETADO")); assertThrows(ApiException.class,()->service.start(7L,10L));
  flight.setEstadoVuelo(catalog.get("FINALIZADO")); assertThrows(ApiException.class,()->service.start(7L,10L));
  flight.setEstadoVuelo(null); assertThrows(ApiException.class,()->service.start(7L,10L));
 }
 @Test void cancellationIsRefusedOnceExecutionStartedOrWhenTheRequestWasRejected(){
  for(String state:List.of("EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO")){flight.setEstadoVuelo(catalog.get(state));assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),10L),state);}
  flight.setEstadoVuelo(null); SanitaryFlight s=new SanitaryFlight(); SanitaryRequestStatus rejected=new SanitaryRequestStatus(); rejected.setCodigo("RECHAZADO"); s.setEstadoSolicitud(rejected); when(sanitary.findByFlightId(7L)).thenReturn(Optional.of(s));
  ApiException e=assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),10L)); assertTrue(e.getMessage().contains("rechazo")); assertNull(flight.getFechaCancelacion());
 }
 @Test void blockedCommanderCannotCancelPlanOrRecordWeatherOrRespondToAnAssignment(){
  doThrow(new ApiException(HttpStatus.FORBIDDEN,"COMANDANTE_BLOQUEADO","FUNCIONES BLOQUEADAS",Map.of())).when(commanderAccess).requireOperationalAccess(11L);
  flight.setEstadoVuelo(catalog.get("PLANIFICADO"));
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.registerWeather(7L,new Weather("Nubes",true,null),11L)).status());
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.configureOperationalPlanning(7L,new OperationalPlan(1L,2L,LocalDateTime.now().plusDays(1)),11L)).status());
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),11L)).status());
  flight.setEstadoVuelo(catalog.get("PENDIENTE_CONFIRMACION_COMANDANTE"));
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(true,null,null,null),11L)).status());
  verify(weather,never()).saveAndFlush(any()); assertEquals("PENDIENTE_CONFIRMACION_COMANDANTE",flight.getEstadoVuelo().getCodigo());
 }
 @Test void aBlockedCommanderCannotBeAssignedToNewFlights(){
  when(commanderAccess.isBlocked(11L)).thenReturn(true);
  ApiException e=assertThrows(ApiException.class,()->service.createOperational(new CreateOperationalFlight("REGRESO_BASE","Retorno",5L,11L,2L,LocalDateTime.now().plusDays(2),LocalDateTime.now().plusDays(2).plusHours(2)),10L));
  assertTrue(e.getMessage().contains("vencidos")); verify(flights,never()).save(any());
 }

 private Flight flight(String state){Flight f=new Flight();f.setId(7L);f.setCodigo("V-7");f.setEstadoVuelo(catalog.get(state)==null?status(state):catalog.get(state));FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");t.setNombre("Regreso");f.setTipoVuelo(t);f.setAircraft(plane);f.setComandante(commander);f.setOrigen(origin);f.setDestino(destination);f.setFechaPlanificadaSalida(LocalDateTime.of(2026,10,20,3,0));f.setFechaPlanificadaLlegada(LocalDateTime.of(2026,10,20,5,0));return f;}
 private FlightStatus status(String code){FlightStatus s=new FlightStatus();s.setCodigo(code);return s;}
 private Airport airport(Long id,String name,Province p){Airport a=new Airport();a.setId(id);a.setNombre(name);a.setActivo(true);a.setProvinciaReferencial(p);return a;}
 private User user(Long id,String name,String role){User u=new User();u.setId(id);u.setUsername(name);u.setActivo(true);u.setEstadoCuenta("ACTIVO");Person p=new Person();CommanderProfile profile=new CommanderProfile();profile.setLicenseNumber("LIC");p.setCommanderProfile(profile);u.setPerson(p);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;}
}
