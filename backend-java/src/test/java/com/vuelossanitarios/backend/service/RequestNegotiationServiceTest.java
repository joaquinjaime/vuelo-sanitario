package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;

/** Ciclo previo a la planificación: solicitud, evaluación, negociación, rechazo, cancelación y confirmación del comandante. */
class RequestNegotiationServiceTest {
 private final Clock clock=Clock.fixed(Instant.parse("2026-10-20T15:00:00Z"),ZoneId.of("America/Argentina/Tucuman")); // 12:00 del 20/10 en Tucumán
 private final FlightRepository flights=mock(FlightRepository.class); private final SanitaryFlightRepository sanitaryFlights=mock(SanitaryFlightRepository.class); private final UserRepository users=mock(UserRepository.class); private final FlightStatusRepository statuses=mock(FlightStatusRepository.class); private final SanitaryRequestStatusRepository sanitaryStatuses=mock(SanitaryRequestStatusRepository.class); private final CancellationReasonRepository reasons=mock(CancellationReasonRepository.class); private final FlightScheduleNegotiationRepository negotiations=mock(FlightScheduleNegotiationRepository.class);
 private final PatientRepository patients=mock(PatientRepository.class); private final LocalityRepository localities=mock(LocalityRepository.class); private final FlightTypeRepository types=mock(FlightTypeRepository.class); private final FlightPriorityRepository priorities=mock(FlightPriorityRepository.class); private final FlightMedicalInfoRepository medical=mock(FlightMedicalInfoRepository.class);
 private final AuditService audit=mock(AuditService.class); private final NotificationService notifications=mock(NotificationService.class); private final FlightLogService log=mock(FlightLogService.class); private final CommanderReportAccessService commanderAccess=mock(CommanderReportAccessService.class); private final CrewManagementService crew=mock(CrewManagementService.class); private final AircraftRepository aircraft=mock(AircraftRepository.class);
 private final List<FlightScheduleNegotiation> events=new ArrayList<>(); private long ids=500;
 private final Map<String,FlightStatus> flightStates=new HashMap<>(); private final Map<String,SanitaryRequestStatus> requestStates=new HashMap<>();
 private FlightService service; private User dts,otherDts,ops,commander; private Flight flight; private SanitaryFlight request; private CancellationReason reason,other; private Patient patient; private Locality origin,destination;

 @BeforeEach void setUp(){
  service=new FlightService(flights,sanitaryFlights,types,sanitaryStatuses,patients,users,statuses,priorities,aircraft,mock(AirportRepository.class),localities,mock(CrewRoleRepository.class),mock(FlightCrewRepository.class),medical,mock(FlightFinalReportRepository.class),negotiations,reasons,mock(WeatherSnapshotRepository.class),audit,mock(FlightAuthorizationService.class),notifications,new FlightUrgencyPolicy(clock,ZoneId.of("America/Argentina/Tucuman")),mock(FinalReportWorkflowService.class),commanderAccess,crew,log,mock(FlightRouteService.class),mock(AirportLocks.class),clock);
  when(crew.evaluateOn(any(),any(),eq("COMANDANTE"),any(),anyBoolean(),any())).thenReturn(new CrewManagementService.Eligibility(true,"ELEGIBLE","Vigente",null));
  for(String c:List.of("PLANIFICADO","EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO","PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION")){FlightStatus s=new FlightStatus();s.setCodigo(c);flightStates.put(c,s);when(statuses.findByCodigo(c)).thenReturn(Optional.of(s));}
  for(String c:List.of("SOLICITADO","APROBADO","RECHAZADO","PENDIENTE_RESPUESTA_DTS","CANCELADO")){SanitaryRequestStatus s=new SanitaryRequestStatus();s.setCodigo(c);requestStates.put(c,s);when(sanitaryStatuses.findByCodigo(c)).thenReturn(Optional.of(s));}
  dts=user(20L,"dts","DTS");otherDts=user(21L,"dts2","DTS");ops=user(10L,"ops","CENTRO_OPERACIONES");commander=user(11L,"cmd","COMANDANTE");
  for(User u:List.of(dts,otherDts,ops,commander)){when(users.lockById(u.getId())).thenReturn(Optional.of(u));when(users.findById(u.getId())).thenReturn(Optional.of(u));when(users.findWithRolesByUsername(u.getUsername())).thenReturn(Optional.of(u));}
  reason=reason(1L,"SIN_AERONAVE_ASIGNADA","Falta de aeronave asignada");other=reason(2L,"OTRO","Otro motivo");
  when(reasons.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(reason));when(reasons.findByIdAndActivoTrue(2L)).thenReturn(Optional.of(other));
  when(negotiations.saveAndFlush(any())).thenAnswer(x->{FlightScheduleNegotiation n=x.getArgument(0);if(n.getId()==null){n.setId(++ids);events.add(n);}return n;});
  when(negotiations.findByFlightIdOrderByFechaOcurrenciaAscIdAsc(anyLong())).thenAnswer(x->events.stream().sorted(Comparator.comparing(FlightScheduleNegotiation::getId)).toList());
  when(negotiations.existsByRespondidaId(anyLong())).thenAnswer(x->events.stream().anyMatch(n->n.getRespondida()!=null&&n.getRespondida().getId().equals(x.getArgument(0))));
  when(flights.lockById(7L)).thenReturn(Optional.of(flight=newFlight()));when(flights.findById(7L)).thenAnswer(x->Optional.of(flight));when(sanitaryFlights.findByFlightId(7L)).thenAnswer(x->Optional.ofNullable(request));
  origin=locality(1L,"Tafí Viejo");destination=locality(2L,"Rosario");
  request=sanitaryRequest("SOLICITADO",LocalDateTime.of(2026,10,23,9,0));flight.setSanitario(request);
  events.add(event(1L,"DTS_PROPUESTA",LocalDateTime.of(2026,10,23,9,0),dts)); ids=500;
 }

 // ---------- solicitud ----------
 private CreateFlight create(LocalDateTime when,boolean urgent,String justification,LocalDateTime limit,Medical m){return new CreateFlight(30L,1L,2L,"ALTA","Traslado de paciente",when,urgent,justification,limit,m);}
 private void stubCreation(){
  patient=new Patient();patient.setId(30L);Person p=new Person();p.setNombre("Ana");p.setApellido("Paz");patient.setPerson(p);when(patients.findById(30L)).thenReturn(Optional.of(patient));
  when(localities.findByIdAndActivoTrue(1L)).thenReturn(Optional.of(origin));when(localities.findByIdAndActivoTrue(2L)).thenReturn(Optional.of(destination));
  FlightType t=new FlightType();t.setCodigo("SANITARIO");t.setNombre("Sanitario");when(types.findByCodigoAndActivoTrue("SANITARIO")).thenReturn(Optional.of(t));
  FlightPriority pr=new FlightPriority();pr.setCodigo("ALTA");when(priorities.findByCodigoAndActivoTrue("ALTA")).thenReturn(Optional.of(pr));when(flights.save(any())).thenAnswer(x->{Flight f=x.getArgument(0);f.setId(8L);return f;});
 }
 private static Medical medical(){return new Medical("Politraumatismo","ESTABLE",false,null);}
 @Test void aNormalRequestIsRegisteredWithItsOriginalDataAndNotifiesOperationsOnce(){
  stubCreation(); FlightView v=service.create(create(LocalDateTime.of(2026,10,22,10,0),false,null,null,medical()),20L);
  assertEquals("SOLICITADO",v.datosSanitarios().estadoSolicitud()); assertNull(v.estadoVuelo()); assertEquals(LocalDateTime.of(2026,10,22,10,0),v.datosSanitarios().fechaSolicitada()); assertFalse(v.datosSanitarios().extremaUrgencia());
  verify(notifications).createOncePreferred(any(),eq("NEW_SANITARY_REQUEST"),argThat(m->!m.contains("Politraumatismo")&&!m.contains("Ana")),eq("NEW_SANITARY_REQUEST:8"),anyCollection(),eq("OPERACIONES"),eq("CENTRO_OPERACIONES"));
  verify(notifications,never()).createOncePreferred(any(),eq("EXTREME_URGENCY_REQUEST"),anyString(),anyString(),anyCollection(),any(String[].class));
  verify(audit).record(any(),eq(dts),eq("FLIGHT"),any(),eq("CREATE_SANITARY"),isNull(),anyString());
  assertEquals("DTS_PROPUESTA",events.get(events.size()-1).getTipo());
 }
 @Test void todayAndTomorrowRequireExtremeUrgencyAndTheDayAfterTomorrowDoesNot(){
  stubCreation();
  for(LocalDateTime t:List.of(LocalDateTime.of(2026,10,20,18,0),LocalDateTime.of(2026,10,21,0,0),LocalDateTime.of(2026,10,21,23,59)))assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.create(create(t,false,null,null,medical()),20L)).status(),t.toString());
  assertNotNull(service.create(create(LocalDateTime.of(2026,10,22,0,0),false,null,null,medical()),20L));
 }
 @Test void extremeUrgencyNeedsJustificationAndLimitNotifiesWithoutClinicalDataAndIsPrioritized(){
  stubCreation(); LocalDateTime t=LocalDateTime.of(2026,10,21,8,0);
  assertThrows(ApiException.class,()->service.create(create(t,true,null,t.plusHours(4),medical()),20L)); assertThrows(ApiException.class,()->service.create(create(t,true,"  ",t.plusHours(4),medical()),20L)); assertThrows(ApiException.class,()->service.create(create(t,true,"Riesgo vital",null,medical()),20L));
  assertThrows(ApiException.class,()->service.create(create(t,true,"Riesgo vital",t.minusHours(1),medical()),20L),"el límite no puede ser anterior al horario solicitado");
  FlightView v=service.create(create(t,true,"Riesgo vital",t.plusHours(4),medical()),20L); assertTrue(v.datosSanitarios().extremaUrgencia());
  verify(notifications).createOncePreferred(any(),eq("EXTREME_URGENCY_REQUEST"),argThat(m->m.contains("EXTREMA URGENCIA")&&!m.contains("Politraumatismo")&&!m.contains("Riesgo vital")),eq("EXTREME_URGENCY_REQUEST:8"),anyCollection(),any(String[].class));
 }
 @Test void theUrgencyBoundaryFollowsTheBusinessZoneNotUtcNorTheBrowser(){
  // 23:30 del 20/10 en Tucumán = 02:30Z del 21/10: "pasado mañana" sigue siendo el 22/10 en la zona de negocio.
  Clock late=Clock.fixed(Instant.parse("2026-10-21T02:30:00Z"),ZoneId.of("America/Argentina/Tucuman")); FlightUrgencyPolicy policy=new FlightUrgencyPolicy(late,ZoneId.of("America/Argentina/Tucuman"));
  assertThrows(ApiException.class,()->policy.validate(LocalDateTime.of(2026,10,21,12,0),false,null,null)); assertDoesNotThrow(()->policy.validate(LocalDateTime.of(2026,10,22,0,0),false,null,null)); assertThrows(ApiException.class,()->policy.validate(LocalDateTime.of(2026,10,21,23,59),false,null,null));
  Clock afterMidnight=Clock.fixed(Instant.parse("2026-10-21T03:00:00Z"),ZoneId.of("America/Argentina/Tucuman")); // 00:00 del 21/10 local
  FlightUrgencyPolicy next=new FlightUrgencyPolicy(afterMidnight,ZoneId.of("America/Argentina/Tucuman")); assertThrows(ApiException.class,()->next.validate(LocalDateTime.of(2026,10,22,10,0),false,null,null),"al cambiar el día local, el 22 pasa a ser 'mañana'"); assertDoesNotThrow(()->next.validate(LocalDateTime.of(2026,10,23,0,0),false,null,null));
 }
 @Test void sanitaryInformationIsMandatory(){
  stubCreation(); LocalDateTime t=LocalDateTime.of(2026,10,23,10,0);
  assertThrows(ApiException.class,()->service.create(create(t,false,null,null,new Medical(" ","ESTABLE",false,null)),20L)); assertThrows(ApiException.class,()->service.create(create(t,false,null,null,new Medical("Dx",null,false,null)),20L)); assertThrows(ApiException.class,()->service.create(create(t,false,null,null,null),20L));
  verify(sanitaryFlights,never()).save(any());
 }
 @Test void onlyTheDtsRoleCreatesRequestsAndOriginAndDestinationMustDiffer(){
  stubCreation(); assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.create(create(LocalDateTime.of(2026,10,23,10,0),false,null,null,medical()),10L)).status());
  when(localities.findByIdAndActivoTrue(2L)).thenReturn(Optional.of(origin)); assertThrows(ApiException.class,()->service.create(create(LocalDateTime.of(2026,10,23,10,0),false,null,null,medical()),20L));
 }

 // ---------- evaluación ----------
 @Test void operationsApprovesAFeasibleRequestAndTheRequesterIsNotifiedOnce(){
  FlightView v=service.evaluate(7L,new Evaluation(true,null,null,null),10L);
  assertEquals("APROBADO",v.datosSanitarios().estadoSolicitud()); assertEquals(LocalDateTime.of(2026,10,23,9,0),flight.getFechaPlanificadaSalida()); assertNull(flight.getEstadoVuelo(),"el estado operativo no cambia hasta asignar recursos");
  assertSame(ops,request.getEvaluadoPor()); assertEquals("CO_ACEPTA_PROPUESTA",events.get(events.size()-1).getTipo()); assertEquals(1L,events.get(events.size()-1).getRespondida().getId());
  verify(notifications).createOnce(eq(dts),eq(flight),eq("SCHEDULE_ACCEPTED"),anyString(),eq("SCHEDULE_ACCEPTED:7")); verify(audit).record(eq(flight),eq(ops),eq("SANITARY_REQUEST"),any(),eq("APPROVE"),contains("SOLICITADO"),contains("APROBADO"));
  assertThrows(ApiException.class,()->service.evaluate(7L,new Evaluation(true,null,null,null),10L),"no se aprueba dos veces");
 }
 @Test void aRequestWhoseRequestedTimeAlreadyPassedCannotBeApproved(){
  request.setFechaSolicitada(LocalDateTime.of(2026,10,20,11,59)); assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.acceptRequestedSchedule(7L,10L)).status()); assertEquals("SOLICITADO",request.getEstadoSolicitud().getCodigo());
 }
 @Test void onlyOperationsEvaluates(){
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.evaluate(7L,new Evaluation(true,null,null,null),20L)).status()); assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.counterproposal(7L,new CounterProposal(LocalDateTime.of(2026,10,24,9,0),"x"),11L)).status());
 }
 @Test void rejectionRequiresACatalogReasonOtherNeedsDescriptionAndIsDistinctFromCancellation(){
  assertThrows(ApiException.class,()->service.rejectDirectly(7L,new Cancel(99L,null),10L)); assertThrows(ApiException.class,()->service.rejectDirectly(7L,new Cancel(2L,"  "),10L)); assertThrows(ApiException.class,()->service.rejectDirectly(7L,new Cancel(1L,"descripción no permitida"),10L));
  FlightView v=service.rejectDirectly(7L,new Cancel(2L,"Sin cobertura de la obra social"),10L);
  assertEquals("RECHAZADO",v.datosSanitarios().estadoSolicitud()); assertEquals("Sin cobertura de la obra social",v.datosSanitarios().motivoRechazo()); assertNull(flight.getEstadoVuelo()); assertNull(flight.getFechaCancelacion()); assertNull(v.cancelacion(),"un rechazo no es una cancelación");
  verify(notifications).createOnce(eq(dts),eq(flight),eq("REQUEST_REJECTED"),contains("Sin cobertura"),eq("REQUEST_REJECTED:7")); verify(audit).record(eq(flight),eq(ops),eq("SANITARY_REQUEST"),any(),eq("REJECT"),any(),contains("RECHAZADO"));
  assertEquals("CO_RECHAZO_DIRECTO",events.get(events.size()-1).getTipo()); assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),10L),"un rechazo no se cancela");
 }

 // ---------- negociación ----------
 private long propose(LocalDateTime when){service.counterproposal(7L,new CounterProposal(when,"No hay aeronave ese día"),10L);return events.get(events.size()-1).getId();}
 @Test void operationsProposesAnotherTimeKeepingTheOriginalRequestAndNotifyingTheRequester(){
  long id=propose(LocalDateTime.of(2026,10,24,9,0));
  assertEquals("PENDIENTE_RESPUESTA_DTS",request.getEstadoSolicitud().getCodigo()); assertEquals(LocalDateTime.of(2026,10,23,9,0),request.getFechaSolicitada(),"se conserva la fecha original"); assertNull(flight.getFechaPlanificadaSalida());
  FlightScheduleNegotiation n=events.get(events.size()-1); assertEquals("CO_CONTRAPROPUESTA",n.getTipo()); assertEquals("No hay aeronave ese día",n.getMotivo()); assertEquals(1L,n.getRespondida().getId());
  verify(notifications).createOnce(eq(dts),eq(flight),eq("SCHEDULE_COUNTERPROPOSAL"),argThat(m->m.contains("2026-10-24")),eq("SCHEDULE_COUNTERPROPOSAL:"+id)); verify(audit).record(eq(flight),eq(ops),eq("SANITARY_REQUEST"),any(),eq("COUNTERPROPOSE"),any(),contains("PENDIENTE_RESPUESTA_DTS"));
 }
 @Test void aProposalNeedsAReasonAFutureDifferentTimeAndRespectsTheUrgencyLimit(){
  assertThrows(ApiException.class,()->service.counterproposal(7L,new CounterProposal(LocalDateTime.of(2026,10,24,9,0)," "),10L)); assertThrows(ApiException.class,()->service.counterproposal(7L,new CounterProposal(LocalDateTime.of(2026,10,20,11,0),"x"),10L)); assertThrows(ApiException.class,()->service.counterproposal(7L,new CounterProposal(LocalDateTime.of(2026,10,23,9,0),"x"),10L));
  request.setExtremaUrgencia(true);request.setFechaLimiteTraslado(LocalDateTime.of(2026,10,23,18,0));assertThrows(ApiException.class,()->service.counterproposal(7L,new CounterProposal(LocalDateTime.of(2026,10,23,18,1),"x"),10L)); assertDoesNotThrow(()->service.counterproposal(7L,new CounterProposal(LocalDateTime.of(2026,10,23,18,0),"x"),10L));
 }
 @Test void theDtsAcceptsAndThePlannedDepartureBecomesTheProposedTimeWithHistory(){
  long id=propose(LocalDateTime.of(2026,10,24,9,0)); FlightView v=service.respondToCounterproposal(7L,new NegotiationResponse(true,id,null,null,null),20L);
  assertEquals("APROBADO",v.datosSanitarios().estadoSolicitud()); assertEquals(LocalDateTime.of(2026,10,24,9,0),flight.getFechaPlanificadaSalida()); assertEquals(LocalDateTime.of(2026,10,23,9,0),request.getFechaSolicitada()); assertSame(ops,request.getEvaluadoPor(),"la aceptación del DTS no reemplaza al evaluador");
  FlightScheduleNegotiation a=events.get(events.size()-1); assertEquals("DTS_ACEPTA_CONTRAPROPUESTA",a.getTipo()); assertEquals(id,a.getRespondida().getId()); assertEquals(LocalDateTime.now(clock),a.getFechaOcurrencia(),"la fecha del evento usa el reloj de negocio");
  verify(notifications).createOncePreferred(eq(flight),eq("SCHEDULE_PROPOSAL_ACCEPTED"),anyString(),eq("SCHEDULE_PROPOSAL_ACCEPTED:"+id),anyCollection(),eq("OPERACIONES"),eq("CENTRO_OPERACIONES")); verify(audit).record(eq(flight),eq(dts),eq("SANITARY_REQUEST"),any(),eq("ACCEPT_COUNTERPROPOSAL"),any(),contains("APROBADO"));
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(false,id,1L,null,null),20L)).status(),"ya respondida: la segunda respuesta contradictoria no procede");
 }
 @Test void theDtsRejectionCancelsTheRequestKeepsHistoryAndRecordsTheReason(){
  long id=propose(LocalDateTime.of(2026,10,24,9,0)); int before=events.size();
  assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(false,id,null,null,null),20L),"el rechazo exige motivo del catálogo"); assertEquals("PENDIENTE_RESPUESTA_DTS",request.getEstadoSolicitud().getCodigo()); assertEquals(before,events.size());
  FlightView v=service.respondToCounterproposal(7L,new NegotiationResponse(false,id,2L,"No podemos postergar el traslado",null),20L);
  assertEquals("CANCELADO",v.datosSanitarios().estadoSolicitud()); assertEquals("CANCELADO",v.estadoVuelo()); assertEquals("No podemos postergar el traslado",v.cancelacion().motivo()); assertEquals("dts",v.cancelacion().canceladoPor()); assertNotNull(flight.getFechaCancelacion());
  assertEquals("DTS_RECHAZA_CONTRAPROPUESTA",events.get(events.size()-1).getTipo()); assertTrue(events.stream().anyMatch(e->"CO_CONTRAPROPUESTA".equals(e.getTipo())),"el historial se conserva");
  verify(audit).record(eq(flight),eq(dts),eq("FLIGHT"),any(),eq("CANCEL"),contains("PENDIENTE_RESPUESTA_DTS"),contains("recursosLiberados")); verify(log).automatic(eq(flight),eq(dts),eq("CANCELACION"),anyString()); verify(notifications).createOncePreferred(eq(flight),eq("SCHEDULE_PROPOSAL_REJECTED"),contains("cancelada"),eq("SCHEDULE_PROPOSAL_REJECTED:"+id),anyCollection(),any(String[].class));
 }
 @Test void aReplacedProposalIsObsoleteAndTheCurrentOneStillWorks(){
  long first=propose(LocalDateTime.of(2026,10,24,9,0)); long second=propose(LocalDateTime.of(2026,10,25,9,0)); assertNotEquals(first,second); assertEquals("PENDIENTE_RESPUESTA_DTS",request.getEstadoSolicitud().getCodigo());
  ApiException e=assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,first,null,null,null),20L)); assertEquals(HttpStatus.CONFLICT,e.status()); assertEquals("PENDIENTE_RESPUESTA_DTS",request.getEstadoSolicitud().getCodigo());
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,999L,null,null,null),20L)).status()); assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,null,null,null,null),20L));
  verify(audit).record(eq(flight),eq(ops),eq("SANITARY_REQUEST"),any(),eq("REPLACE_COUNTERPROPOSAL"),any(),anyString()); service.respondToCounterproposal(7L,new NegotiationResponse(true,second,null,null,null),20L); assertEquals(LocalDateTime.of(2026,10,25,9,0),flight.getFechaPlanificadaSalida());
 }
 @Test void anExpiredProposalCannotBeAcceptedButCanStillBeRejected(){
  long id=propose(LocalDateTime.of(2026,10,20,12,30)); events.get(events.size()-1).setFechaHoraPropuesta(LocalDateTime.of(2026,10,20,11,0)); // el horario propuesto ya pasó
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,id,null,null,null),20L)).status()); assertEquals("PENDIENTE_RESPUESTA_DTS",request.getEstadoSolicitud().getCodigo());
  service.counterproposal(7L,new CounterProposal(LocalDateTime.of(2026,10,26,9,0),"Nueva propuesta"),10L); assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,id,null,null,null),20L)).status());
 }
 @Test void onlyTheRequestingDtsRespondsAndOnlyWhileThereIsAPendingProposal(){
  long id=propose(LocalDateTime.of(2026,10,24,9,0)); assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,id,null,null,null),21L)).status()); assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,id,null,null,null),10L)).status());
  request.setEstadoSolicitud(requestStates.get("SOLICITADO")); assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.respondToCounterproposal(7L,new NegotiationResponse(true,id,null,null,null),20L)).status());
 }

 // ---------- cancelación ----------
 @Test void operationsCancelsAnApprovedRequestWithACatalogReasonAndEveryoneInvolvedIsNotifiedWithoutDuplicates(){
  request.setEstadoSolicitud(requestStates.get("APROBADO")); flight.setEstadoVuelo(flightStates.get("PLANIFICADO")); flight.setComandante(commander); flight.setFechaPlanificadaSalida(LocalDateTime.of(2026,10,23,9,0));
  FlightView v=service.cancel(7L,new Cancel(1L,null),10L);
  assertEquals("CANCELADO",v.estadoVuelo()); assertEquals("CANCELADO",v.datosSanitarios().estadoSolicitud()); assertEquals("Falta de aeronave asignada",v.cancelacion().motivo()); assertEquals("SIN_AERONAVE_ASIGNADA",v.cancelacion().codigoMotivo()); assertSame(ops,flight.getCanceladoPor());
  verify(notifications).createOnce(eq(dts),eq(flight),eq("FLIGHT_CANCELLED"),contains("Falta de aeronave"),eq("FLIGHT_CANCELLED:7")); verify(notifications).createOnce(eq(commander),eq(flight),eq("FLIGHT_CANCELLED"),anyString(),eq("FLIGHT_CANCELLED:7"));
  verify(audit).record(eq(flight),eq(ops),eq("FLIGHT"),any(),eq("CANCEL"),contains("PLANIFICADO"),contains("\"comandanteId\":11")); verify(log).automatic(eq(flight),eq(ops),eq("CANCELACION"),anyString());
  assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),10L),"no se cancela dos veces");
 }
 @Test void theOtherReasonRequiresADescriptionAndNoOtherReasonAllowsOne(){
  assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(2L,null),10L)); assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(2L,"   "),10L)); assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,"texto de más"),10L)); assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(null,null),10L));
  assertEquals("SOLICITADO",request.getEstadoSolicitud().getCodigo()); assertNull(flight.getEstadoVuelo());
  assertEquals("Cambio de planes del paciente",service.cancel(7L,new Cancel(2L," Cambio de planes del paciente "),10L).cancelacion().motivo());
 }
 @Test void theRequestingDtsCancelsOnlyItsOwnPreExecutionRequestAndOperationsIsNotifiedNotTheDts(){
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),21L)).status()); assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),11L)).status(),"el comandante rechaza asignaciones pero no cancela vuelos");
  service.cancel(7L,new Cancel(1L,null),20L); assertEquals("CANCELADO",request.getEstadoSolicitud().getCodigo());
  verify(notifications,never()).createOnce(eq(dts),any(),eq("FLIGHT_CANCELLED"),anyString(),anyString()); verify(notifications).createOncePreferred(eq(flight),eq("FLIGHT_CANCELLED"),contains("DTS canceló"),eq("FLIGHT_CANCELLED:7"),anyCollection(),any(String[].class));
 }
 @Test void startedFinishedCompletedCancelledAndRejectedFlightsCannotBeCancelled(){
  for(String state:List.of("EN_CURSO","FINALIZADO","COMPLETADO","CANCELADO")){request.setEstadoSolicitud(requestStates.get("APROBADO"));flight.setEstadoVuelo(flightStates.get(state));flight.setFechaCancelacion(null);assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),10L),state).status());}
  request.setEstadoSolicitud(requestStates.get("RECHAZADO"));flight.setEstadoVuelo(null);assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),10L)); assertNull(flight.getFechaCancelacion());
 }
 @Test void operationalFlightsCancelOnlyBeforeExecutionAndOnlyByOperations(){
  request=null;flight.setSanitario(null);flight.setEstadoVuelo(flightStates.get("PENDIENTE_CONFIRMACION_COMANDANTE"));flight.setComandante(commander);
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),20L)).status()); assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),11L)).status());
  FlightView v=service.cancel(7L,new Cancel(1L,null),10L); assertEquals("CANCELADO",v.estadoVuelo()); assertNull(v.datosSanitarios()); verify(notifications).createOnce(eq(commander),eq(flight),eq("FLIGHT_CANCELLED"),anyString(),eq("FLIGHT_CANCELLED:7"));
  flight.setEstadoVuelo(flightStates.get("EN_CURSO"));flight.setFechaCancelacion(null);assertThrows(ApiException.class,()->service.cancel(7L,new Cancel(1L,null),10L));
 }
 @Test void aFailureWhileCancellingLeavesNoPartialStateInTheServiceLayerBecauseItRunsInOneTransaction()throws Exception{
  var m=FlightService.class.getMethod("cancel",Long.class,Cancel.class,Long.class); assertNotNull(m.getAnnotation(org.springframework.transaction.annotation.Transactional.class),"cancelar es transaccional: auditoría, bitácora, notificaciones y estados se confirman o revierten juntos");
  for(String name:List.of("respondToCounterproposal","counterproposal","rejectDirectly","acceptRequestedSchedule","respondToOperationalAssignment","respondToCommanderProposal"))assertTrue(Arrays.stream(FlightService.class.getMethods()).filter(x->x.getName().equals(name)).allMatch(x->x.isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class)),name);
 }

 // ---------- vuelos operativos ----------
 private void operational(String state){request=null;flight.setSanitario(null);flight.setEstadoVuelo(flightStates.get(state));flight.setComandante(commander);flight.setCreadoPor(ops);flight.setFechaPlanificadaSalida(LocalDateTime.of(2026,10,23,9,0));flight.setFechaPlanificadaLlegada(LocalDateTime.of(2026,10,23,11,0));}
 @Test void aCommanderWhoStoppedBeingEligibleCannotAcceptAndTheAssignmentStaysPending(){
  operational("PENDIENTE_CONFIRMACION_COMANDANTE");
  when(crew.evaluateOn(any(),any(),eq("COMANDANTE"),any(),anyBoolean(),any())).thenReturn(new CrewManagementService.Eligibility(false,"CLASIFICACION_INCOMPATIBLE","Falta la clasificación administrativa para esta función",null));
  ApiException e=assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(true,null,null,null),11L));
  assertEquals(409,e.status().value());assertEquals("CLASIFICACION_INCOMPATIBLE",e.code());assertEquals("PENDIENTE_CONFIRMACION_COMANDANTE",flight.getEstadoVuelo().getCodigo(),"la asignación no se confirma ni cambia en silencio");
  FlightView rejected=service.respondToOperationalAssignment(7L,new CommanderResponse(false,"No estoy habilitado para este vuelo",null,null),11L);assertEquals("PENDIENTE_REPLANIFICACION",rejected.estadoVuelo(),"rechazar sigue siendo posible");
 }
 @Test void theCommanderConfirmsRejectsOrProposesAndRejectionIsNotCancellation(){
  operational("PENDIENTE_CONFIRMACION_COMANDANTE");
  FlightView accepted=service.respondToOperationalAssignment(7L,new CommanderResponse(true,null,null,null),11L); assertEquals("PLANIFICADO",accepted.estadoVuelo()); assertEquals("COMANDANTE_ACEPTA_ASIGNACION",events.get(events.size()-1).getTipo());
  verify(notifications).createOncePreferred(eq(flight),eq("COMMANDER_ASSIGNMENT_ACCEPTED"),anyString(),startsWith("COMMANDER_ASSIGNMENT_ACCEPTED:"),eq(List.of(ops)),eq("OPERACIONES"),eq("CENTRO_OPERACIONES"));
  operational("PENDIENTE_CONFIRMACION_COMANDANTE"); assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(false," ",null,null),11L));
  FlightView rejected=service.respondToOperationalAssignment(7L,new CommanderResponse(false,"Fuera de mi licencia",null,null),11L); assertEquals("PENDIENTE_REPLANIFICACION",rejected.estadoVuelo()); assertNull(flight.getFechaCancelacion()); assertNull(rejected.cancelacion());
  operational("PENDIENTE_CONFIRMACION_COMANDANTE"); FlightView proposed=service.respondToOperationalAssignment(7L,new CommanderResponse(false,"Llego tarde",LocalDateTime.of(2026,10,23,14,0),LocalDateTime.of(2026,10,23,16,0)),11L); assertEquals("PENDIENTE_RESPUESTA_OPERACIONES",proposed.estadoVuelo()); assertEquals("COMANDANTE_PROPONE_HORARIO",events.get(events.size()-1).getTipo());
  verify(audit,times(3)).record(eq(flight),eq(commander),eq("FLIGHT"),any(),eq("COMMANDER_ASSIGNMENT_RESPONSE"),isNull(),anyString());
 }
 @Test void aCommanderProposalNeedsMotiveValidTimesInTheFutureAndAnUnstartedAssignment(){
  operational("PENDIENTE_CONFIRMACION_COMANDANTE");
  assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(false,"m",LocalDateTime.of(2026,10,23,14,0),null),11L)); assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(false,"m",LocalDateTime.of(2026,10,23,14,0),LocalDateTime.of(2026,10,23,13,0)),11L));
  assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(false,"m",LocalDateTime.of(2026,10,19,14,0),LocalDateTime.of(2026,10,19,16,0)),11L)); assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(false,null,LocalDateTime.of(2026,10,23,14,0),LocalDateTime.of(2026,10,23,16,0)),11L));
  flight.setFechaPlanificadaSalida(LocalDateTime.of(2026,10,20,8,0)); assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(true,null,null,null),11L),"no se confirma una salida que ya pasó");
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(true,null,null,null),20L)).status()); flight.setEstadoVuelo(flightStates.get("PLANIFICADO")); assertThrows(ApiException.class,()->service.respondToOperationalAssignment(7L,new CommanderResponse(true,null,null,null),11L));
 }
 private long commanderProposal(){operational("PENDIENTE_CONFIRMACION_COMANDANTE");service.respondToOperationalAssignment(7L,new CommanderResponse(false,"Llego tarde",LocalDateTime.of(2026,10,23,14,0),LocalDateTime.of(2026,10,23,16,0)),11L);return events.get(events.size()-1).getId();}
 @Test void operationsNotTheDtsRespondsToTheCommanderProposalAcceptingAppliesTheNewScheduleAndNotifiesTheCommander(){
  long id=commanderProposal(); when(flights.overlappingAircraft(any(),any(),any())).thenReturn(List.of());when(flights.overlappingCommander(any(),any(),any())).thenReturn(List.of());when(crew.evaluate(any(),any(),any(),anyBoolean())).thenReturn(new CrewManagementService.Eligibility(true,"ELEGIBLE","Vigente",null));
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.respondToCommanderProposal(7L,new NegotiationResponse(true,id,null,null,null),20L)).status(),"el DTS no interviene en vuelos operativos"); assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.respondToCommanderProposal(7L,new NegotiationResponse(true,id,null,null,null),11L)).status());
  FlightView v=service.respondToCommanderProposal(7L,new NegotiationResponse(true,id,null,null,null),10L);
  assertEquals("PLANIFICADO",v.estadoVuelo()); assertEquals(LocalDateTime.of(2026,10,23,14,0),flight.getFechaPlanificadaSalida()); assertEquals(LocalDateTime.of(2026,10,23,16,0),flight.getFechaPlanificadaLlegada()); assertEquals(id,events.get(events.size()-1).getRespondida().getId());
  verify(notifications).createOnce(eq(commander),eq(flight),eq("COMMANDER_SCHEDULE_ACCEPTED"),anyString(),startsWith("COMMANDER_SCHEDULE_ACCEPTED:")); verify(audit).record(eq(flight),eq(ops),eq("FLIGHT"),any(),eq("COMMANDER_SCHEDULE_RESPONSE"),contains("propuestaId"),contains("PLANIFICADO"));
 }
 @Test void acceptingAProposalThatClashesWithAnotherAssignmentIsRefusedWithoutChangingTheFlight(){
  long id=commanderProposal(); Aircraft plane=new Aircraft();plane.setId(5L);flight.setAircraft(plane);when(aircraft.lockById(5L)).thenReturn(Optional.of(plane));
  Flight clash=new Flight();clash.setId(99L);when(flights.overlappingAircraft(eq(5L),any(),any())).thenReturn(List.of(clash));when(flights.overlappingCommander(any(),any(),any())).thenReturn(List.of());
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.respondToCommanderProposal(7L,new NegotiationResponse(true,id,null,null,null),10L)).status());
  verify(aircraft).lockById(5L); // el recurso se bloquea antes de validar la superposición
 }
 @Test void rejectingAProposalNeedsAMotiveReturnsToTheCommanderAndObsoleteResponsesAreRefused(){
  long id=commanderProposal(); assertThrows(ApiException.class,()->service.respondToCommanderProposal(7L,new NegotiationResponse(false,id,null,null,"  "),10L));
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.respondToCommanderProposal(7L,new NegotiationResponse(false,id+50,null,null,"x"),10L)).status());
  FlightView v=service.respondToCommanderProposal(7L,new NegotiationResponse(false,id,null,null,"Hay otro vuelo ese horario"),10L); assertEquals("PENDIENTE_CONFIRMACION_COMANDANTE",v.estadoVuelo()); assertEquals("CO_RECHAZA_PROPUESTA_COMANDANTE",events.get(events.size()-1).getTipo()); assertEquals(LocalDateTime.of(2026,10,23,9,0),flight.getFechaPlanificadaSalida(),"se conserva la planificación original");
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.respondToCommanderProposal(7L,new NegotiationResponse(true,id,null,null,null),10L)).status(),"la propuesta ya fue respondida");
 }
 @Test void aProposalWhoseTimeAlreadyPassedCannotBeAccepted(){
  long id=commanderProposal(); events.get(events.size()-1).setFechaHoraPropuesta(LocalDateTime.of(2026,10,20,9,0)); assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.respondToCommanderProposal(7L,new NegotiationResponse(true,id,null,null,null),10L)).status()); assertEquals("PENDIENTE_RESPUESTA_OPERACIONES",flight.getEstadoVuelo().getCodigo());
 }

 // ---------- orden de atención ----------
 @Test void urgentOpenRequestsComeFirstOrderedByTheirLimitThenTheRest(){
  Flight normal=newFlight();normal.setId(1L);normal.setSanitario(sanitaryRequest("SOLICITADO",LocalDateTime.of(2026,10,25,9,0)));
  Flight late=newFlight();late.setId(2L);SanitaryFlight sl=sanitaryRequest("SOLICITADO",LocalDateTime.of(2026,10,21,9,0));sl.setExtremaUrgencia(true);sl.setFechaLimiteTraslado(LocalDateTime.of(2026,10,21,20,0));late.setSanitario(sl);
  Flight soon=newFlight();soon.setId(3L);SanitaryFlight ss=sanitaryRequest("PENDIENTE_RESPUESTA_DTS",LocalDateTime.of(2026,10,21,8,0));ss.setExtremaUrgencia(true);ss.setFechaLimiteTraslado(LocalDateTime.of(2026,10,21,12,0));soon.setSanitario(ss);
  Flight doneUrgent=newFlight();doneUrgent.setId(4L);SanitaryFlight sd=sanitaryRequest("CANCELADO",LocalDateTime.of(2026,10,21,8,0));sd.setExtremaUrgencia(true);sd.setFechaLimiteTraslado(LocalDateTime.of(2026,10,21,9,0));doneUrgent.setSanitario(sd);
  for(Flight f:List.of(normal,late,soon,doneUrgent))when(sanitaryFlights.findByFlightId(f.getId())).thenReturn(Optional.of(f.getSanitario()));
  when(flights.findAll()).thenReturn(List.of(normal,late,soon,doneUrgent));
  assertEquals(List.of(3L,2L,4L,1L),service.list(10L).stream().map(FlightView::id).toList(),"urgentes abiertas por horario límite; luego el resto por antigüedad inversa de id");
 }

 // ---------- fixtures ----------
 private Flight newFlight(){Flight f=new Flight();f.setId(7L);f.setCodigo("V-7");FlightType t=new FlightType();t.setCodigo("SANITARIO");t.setNombre("Sanitario");f.setTipoVuelo(t);f.setCreadoPor(dts);return f;}
 private SanitaryFlight sanitaryRequest(String state,LocalDateTime when){SanitaryFlight s=new SanitaryFlight();s.setFlight(flight!=null?flight:newFlight());Patient p=new Patient();p.setId(30L);Person pe=new Person();pe.setNombre("Ana");pe.setApellido("Paz");p.setPerson(pe);s.setPatient(p);s.setSolicitadoPor(dts);s.setFechaSolicitada(when);s.setExtremaUrgencia(false);s.setLocalidadOrigenSolicitada(origin);s.setLocalidadDestinoSolicitada(destination);s.setEstadoSolicitud(requestStates.get(state));return s;}
 private FlightScheduleNegotiation event(Long id,String type,LocalDateTime t,User actor){FlightScheduleNegotiation n=new FlightScheduleNegotiation();n.setId(id);n.setFlight(flight);n.setTipo(type);n.setFechaHoraPropuesta(t);n.setActor(actor);n.setFechaOcurrencia(LocalDateTime.of(2026,10,20,10,0));return n;}
 private Locality locality(Long id,String name){Locality l=new Locality();l.setId(id);l.setNombre(name);Province p=new Province();p.setId(id);p.setNombre("Prov"+id);l.setProvincia(p);return l;}
 private CancellationReason reason(Long id,String code,String name){CancellationReason r=new CancellationReason();r.setId(id);r.setCodigo(code);r.setNombre(name);r.setActivo(true);return r;}
 private User user(Long id,String name,String role){User u=new User();u.setId(id);u.setUsername(name);u.setActivo(true);u.setEstadoCuenta("ACTIVO");Person p=new Person();p.setNombre("N"+id);p.setApellido("A");p.setCommanderProfile(new CommanderProfile());u.setPerson(p);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;}
}
