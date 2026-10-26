package com.vuelossanitarios.backend.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;

/** Ciclo de revisión de rutas (I-4) sobre repositorios simulados; la serialización real contra bloqueos está en las pruebas de integración y en el E2E de SQL Server. */
class FlightRouteServiceTest {
 FlightRepository flights=mock(FlightRepository.class); FlightRouteRepository routes=mock(FlightRouteRepository.class); AirportRepository airports=mock(AirportRepository.class); UserRepository users=mock(UserRepository.class); FlightAuthorizationService access=mock(FlightAuthorizationService.class); AuditService audit=mock(AuditService.class); NotificationService notifications=mock(NotificationService.class); CommanderReportAccessService commanderAccess=mock(CommanderReportAccessService.class);
 Clock clock=Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"),ZoneId.of("UTC"));
 FlightRouteService service=new FlightRouteService(flights,routes,airports,users,access,audit,notifications,new ObjectMapper().findAndRegisterModules(),commanderAccess,clock);
 Flight f; User commander,ops,otherOps; Airport origin,destination,alternate; final List<FlightRoute> store=new ArrayList<>();
 FlightRouteService.Input input(int version,Long alternate){return new FlightRouteService.Input(version,"Punto A, punto B",alternate,null,null,null,"Observación",null,null);}
 FlightRouteService.Input input(int version,String route,String reason,Boolean present){return new FlightRouteService.Input(version,route,null,null,null,null,null,reason,present);}
 User user(long id,String name){User u=new User();u.setId(id);u.setUsername(name);when(users.findById(id)).thenReturn(Optional.of(u));return u;}
 final Map<Long,Airport> known=new HashMap<>();
 Airport airport(long id,boolean active){Airport a=new Airport();a.setId(id);a.setNombre("APT"+id);a.setActivo(active);known.put(id,a);when(airports.findById(id)).thenReturn(Optional.of(a));return a;}
 FlightRoute current(){return store.stream().filter(r->Boolean.TRUE.equals(r.getEsVersionActual())).findFirst().orElse(null);}
 void present(long actor){service.submit(1L,actor,new FlightRouteService.Submit(current().getVersion()));}
 ApiException thrown(org.junit.jupiter.api.function.Executable e){return assertThrows(ApiException.class,e);}
 @BeforeEach void setup(){
  commander=user(2L,"comandante");ops=user(3L,"operador");otherOps=user(4L,"operador2");user(5L,"otro");
  f=new Flight();f.setId(1L);f.setComandante(commander);FlightStatus status=new FlightStatus();status.setCodigo("PLANIFICADO");f.setEstadoVuelo(status);
  origin=airport(10L,true);destination=airport(11L,true);alternate=airport(12L,true);f.setOrigen(origin);f.setDestino(destination);
  f.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,1,10,0));f.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,1,12,0));
  Aircraft plane=new Aircraft();plane.setId(7L);f.setAircraft(plane);
  when(flights.lockById(1L)).thenReturn(Optional.of(f));when(flights.findById(1L)).thenReturn(Optional.of(f));
  when(routes.findByFlightIdAndEsVersionActualTrue(1L)).thenAnswer(i->Optional.ofNullable(current()));
  when(routes.findByFlightIdOrderByVersionDesc(1L)).thenAnswer(i->store.stream().sorted(Comparator.comparing(FlightRoute::getVersion).reversed()).toList());
  when(routes.saveAndFlush(any())).thenAnswer(i->{FlightRoute r=i.getArgument(0);if(r.getId()==null){r.setId(100L+store.size());store.add(r);}return r;});
  when(airports.findAllById(any())).thenAnswer(i->{List<Airport> out=new ArrayList<>();for(Object id:(Iterable<?>)i.getArgument(0))if(known.containsKey(id))out.add(known.get(id));return out;});
  when(access.operationsStaff(3L)).thenReturn(true);when(access.operationsStaff(4L)).thenReturn(true);
 }

 // 1-3. creación y validación
 @Test void commanderCreatesTheFirstVersionAsADraftAndItIsAudited(){
  service.save(1L,2L,input(0,null));
  assertEquals(1,store.size());assertEquals(1,current().getVersion());assertEquals(FlightRoute.BORRADOR,current().getEstadoRevision());assertSame(commander,current().getCreadoPor());
  verify(audit).record(eq(f),eq(commander),eq("FLIGHT_ROUTE"),any(),eq("CREATE"),isNull(),contains("Punto A"));
 }
 @Test void aCommanderWhoIsNotAssignedAndAnInvalidFlightStateAreRejected(){
  assertEquals(403,thrown(()->service.save(1L,5L,input(0,null))).status().value());
  f.getEstadoVuelo().setCodigo("EN_CURSO");assertEquals(400,thrown(()->service.save(1L,2L,input(0,null))).status().value());
  f.getEstadoVuelo().setCodigo("FINALIZADO");assertEquals(400,thrown(()->service.save(1L,2L,input(0,null))).status().value());
  assertTrue(store.isEmpty());verify(routes,never()).saveAndFlush(any());
 }
 @Test void inconsistentDataIsRejected(){
  assertThrows(ApiException.class,()->service.save(1L,2L,input(0,99L)));
  airport(13L,false);assertThrows(ApiException.class,()->service.save(1L,2L,input(0,13L)));
  assertEquals(400,thrown(()->service.save(1L,2L,input(0,11L))).status().value()); // alternativo igual al destino
  f.setFechaPlanificadaLlegada(f.getFechaPlanificadaSalida());assertThrows(ApiException.class,()->service.save(1L,2L,input(0,null)));
  assertTrue(store.isEmpty());
 }
 @Test void aStaleExpectedVersionIsRejectedWithAStructuredConflict(){
  service.save(1L,2L,input(0,null));
  ApiException e=thrown(()->service.save(1L,2L,input(0,12L)));assertEquals(409,e.status().value());assertEquals("VERSION_RUTA_DESACTUALIZADA",e.code());assertEquals(1,store.size());
 }
 @Test void savingAnIdenticalDraftIsRejectedAsNoChange(){
  service.save(1L,2L,input(0,null));
  ApiException e=thrown(()->service.save(1L,2L,input(1,null)));assertEquals("RUTA_SIN_CAMBIOS",e.code());assertEquals(1,store.size());
 }

 // 4-5. presentación y aprobación
 @Test void commanderSubmitsTheCurrentVersionAndItBecomesPendingForOperations(){
  service.save(1L,2L,input(0,null));present(2L);
  assertEquals(FlightRoute.PENDIENTE_REVISION,current().getEstadoRevision());assertSame(commander,current().getPresentadoPor());assertNotNull(current().getFechaPresentacion());
  verify(audit).record(eq(f),eq(commander),eq("FLIGHT_ROUTE"),any(),eq("SUBMIT"),contains("BORRADOR"),contains("PENDIENTE_REVISION"));
  verify(notifications).createOncePreferred(eq(f),eq("ROUTE_PENDING_REVIEW"),contains("versión 1"),eq("ROUTE_SUBMITTED:100"),eq(List.of()),eq("OPERACIONES"),eq("CENTRO_OPERACIONES"));
  ApiException again=thrown(()->present(2L));assertEquals("TRANSICION_RUTA_NO_PERMITIDA",again.code());
 }
 @Test void operationsApprovesTheVersionRecordingWhoAndWhen(){
  service.save(1L,2L,input(0,null));present(2L);
  FlightRouteService.View view=service.approve(1L,3L,new FlightRouteService.Approve(1,"Conforme"));
  FlightRoute r=current();assertEquals(FlightRoute.APROBADA,r.getEstadoRevision());assertSame(ops,r.getRevisadoPor());assertEquals(LocalDateTime.of(2030,1,1,0,0),r.getFechaRevision());assertEquals("Conforme",r.getObservacionesRevision());
  assertEquals("APROBADA",view.estado());assertTrue(view.inicio().permitido());
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT_ROUTE"),any(),eq("APPROVE"),contains("PENDIENTE_REVISION"),contains("APROBADA"));
  verify(notifications).createOnce(eq(commander),eq(f),eq("ROUTE_APPROVED"),contains("versión 1"),eq("ROUTE_APPROVED:100"));
 }
 @Test void theCommanderCannotApproveHisOwnRouteAndOtherRolesAreRejected(){
  service.save(1L,2L,input(0,null));present(2L);
  when(access.operationsStaff(2L)).thenReturn(true); // aunque reúna el rol de Operaciones
  ApiException self=thrown(()->service.approve(1L,2L,new FlightRouteService.Approve(1,null)));assertEquals(403,self.status().value());assertEquals("AUTOREVISION_RUTA_NO_PERMITIDA",self.code());
  assertEquals(403,thrown(()->service.approve(1L,5L,new FlightRouteService.Approve(1,null))).status().value()); // sin rol de Operaciones
  assertEquals(FlightRoute.PENDIENTE_REVISION,current().getEstadoRevision());
 }
 @Test void aReviewerWhoPresentedOrAuthoredTheVersionCannotReviewIt(){
  service.save(1L,2L,input(0,null));
  FlightRoute r=current();r.setCreadoPor(ops); // Operaciones sin ser el comandante del vuelo
  r.setEstadoRevision(FlightRoute.PENDIENTE_REVISION);r.setPresentadoPor(otherOps);r.setFechaPresentacion(LocalDateTime.now(clock));
  assertEquals("AUTOREVISION_RUTA_NO_PERMITIDA",thrown(()->service.approve(1L,3L,new FlightRouteService.Approve(1,null))).code());
  assertEquals("AUTOREVISION_RUTA_NO_PERMITIDA",thrown(()->service.approve(1L,4L,new FlightRouteService.Approve(1,null))).code());
 }
 @Test void aDraftCannotBeApprovedOrReturned(){
  service.save(1L,2L,input(0,null));
  assertEquals("TRANSICION_RUTA_NO_PERMITIDA",thrown(()->service.approve(1L,3L,new FlightRouteService.Approve(1,null))).code());
  assertEquals("TRANSICION_RUTA_NO_PERMITIDA",thrown(()->service.sendBack(1L,3L,new FlightRouteService.Return(1,"Falta indicar el alternativo"))).code());
 }
 @Test void approvingAnObsoleteVersionIsRejectedAndTheNewVersionIsNotApproved(){
  service.save(1L,2L,input(0,null));present(2L);
  service.save(1L,2L,input(1,"Otro recorrido distinto","Corrijo el recorrido antes de la revisión",null)); // el comandante crea la versión 2
  ApiException e=thrown(()->service.approve(1L,3L,new FlightRouteService.Approve(1,null)));
  assertEquals(409,e.status().value());assertEquals("VERSION_RUTA_DESACTUALIZADA",e.code());
  assertEquals(FlightRoute.BORRADOR,current().getEstadoRevision());assertEquals(2,current().getVersion());
 }

 // 6-8. devolución y corrección
 @Test void returnRequiresAMeaningfulReasonAndLeavesTheFlightAndHistoryIntact(){
  service.save(1L,2L,input(0,null));present(2L);
  for(String bad:new String[]{null,"","   ","corto","aaaaaaaaaaaa","!!!!!!!!!!!!!"}){ApiException e=thrown(()->service.sendBack(1L,3L,new FlightRouteService.Return(1,bad)));assertEquals("MOTIVO_DEVOLUCION_INVALIDO",e.code());}
  assertEquals(FlightRoute.PENDIENTE_REVISION,current().getEstadoRevision());
  service.sendBack(1L,3L,new FlightRouteService.Return(1,"Falta indicar el aeropuerto alternativo"));
  assertEquals(FlightRoute.DEVUELTA,current().getEstadoRevision());assertEquals("Falta indicar el aeropuerto alternativo",current().getObservacionesRevision());assertSame(ops,current().getRevisadoPor());
  assertEquals("PLANIFICADO",f.getEstadoVuelo().getCodigo());
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT_ROUTE"),any(),eq("RETURN"),any(),contains("Falta indicar"));
  verify(notifications).createOnce(eq(commander),eq(f),eq("ROUTE_RETURNED"),contains("Falta indicar el aeropuerto alternativo"),eq("ROUTE_RETURNED:100"));
  FlightRouteService.View view=service.get(1L,2L);assertEquals("DEVUELTA",view.estado());assertFalse(view.inicio().permitido());assertEquals("RUTA_DEVUELTA",view.inicio().codigo());
 }
 @Test void theCommanderCorrectsAReturnedRouteCreatingAnHistoricalVersionAndMustExplainTheChange(){
  service.save(1L,2L,input(0,null));present(2L);service.sendBack(1L,3L,new FlightRouteService.Return(1,"Falta indicar el aeropuerto alternativo"));
  ApiException noReason=thrown(()->service.save(1L,2L,input(1,12L)));assertEquals("MOTIVO_MODIFICACION_REQUERIDO",noReason.code());
  service.save(1L,2L,new FlightRouteService.Input(1,"Punto A, punto B",12L,null,null,null,null,"Agrego el alternativo observado",null));
  assertEquals(2,store.size());FlightRoute v1=store.get(0),v2=current();
  assertEquals(2,v2.getVersion());assertEquals(FlightRoute.BORRADOR,v2.getEstadoRevision());assertEquals("Agrego el alternativo observado",v2.getMotivoModificacion());assertEquals(12L,v2.getAlternativo().getId());
  assertFalse(v1.getEsVersionActual());assertEquals(FlightRoute.DEVUELTA,v1.getEstadoRevision());assertEquals("Falta indicar el aeropuerto alternativo",v1.getObservacionesRevision());assertSame(ops,v1.getRevisadoPor());
 }
 @Test void aReturnedRouteMayBeSavedAgainWithoutDataChangesBecauseTheCommanderAnswersTheObservation(){
  service.save(1L,2L,input(0,null));present(2L);service.sendBack(1L,3L,new FlightRouteService.Return(1,"Confirme el recorrido con el piloto"));
  service.save(1L,2L,new FlightRouteService.Input(1,"Punto A, punto B",null,null,null,null,"Observación","Recorrido confirmado, se mantiene",null));
  assertEquals(2,current().getVersion());
 }
 @Test void savingWhilePendingRetiresTheUndecidedVersionWithoutRewritingItsHistory(){
  service.save(1L,2L,input(0,null));present(2L);
  service.save(1L,2L,input(1,"Recorrido modificado","Cambio de última hora",null));
  assertEquals(FlightRoute.SIN_REVISION,store.get(0).getEstadoRevision());assertNotNull(store.get(0).getPresentadoPor());
 }
 @Test void saveAndSubmitInOneStep(){
  service.save(1L,2L,input(0,"Directo",null,true));
  assertEquals(FlightRoute.PENDIENTE_REVISION,current().getEstadoRevision());
  verify(audit).record(any(),any(),eq("FLIGHT_ROUTE"),any(),eq("CREATE"),any(),any());verify(audit).record(any(),any(),eq("FLIGHT_ROUTE"),any(),eq("SUBMIT"),any(),any());
 }

 // 9-12. aprobación antigua y cambios del vuelo
 @Test void anOldApprovalDoesNotAuthorizeTheNewVersion(){
  service.save(1L,2L,input(0,null));present(2L);service.approve(1L,3L,new FlightRouteService.Approve(1,null));
  service.save(1L,2L,input(1,"Recorrido corregido","Ajuste del recorrido",null));
  assertEquals(FlightRoute.APROBADA,store.get(0).getEstadoRevision());assertSame(ops,store.get(0).getRevisadoPor()); // la aprobación histórica se conserva
  ApiException e=thrown(()->service.requireApprovedForStart(f));assertEquals("RUTA_NO_PRESENTADA",e.code());
  present(2L);assertEquals("RUTA_PENDIENTE_REVISION",thrown(()->service.requireApprovedForStart(f)).code());
 }
 void approved(){service.save(1L,2L,input(0,null));present(2L);service.approve(1L,3L,new FlightRouteService.Approve(1,null));clearInvocations(audit);}
 @Test void changingTheOriginInvalidatesTheApprovalKeepingTheDecisionAndAuditing(){
  approved();f.setOrigen(airport(20L,true));service.reassess(f,ops);
  FlightRoute r=current();assertEquals(FlightRoute.REQUIERE_REVISION,r.getEstadoRevision());assertSame(ops,r.getRevisadoPor());assertNotNull(r.getFechaInvalidacion());assertTrue(r.getCausaInvalidacion().contains("aeropuerto de origen"));
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT_ROUTE"),any(),eq("INVALIDATE"),contains("APROBADA"),contains("REQUIERE_REVISION"));
  verify(notifications).createOnce(eq(commander),eq(f),eq("ROUTE_REVIEW_REQUIRED"),contains("aeropuerto de origen"),eq("ROUTE_INVALIDATED:100"));
  verify(notifications).createOncePreferred(eq(f),eq("ROUTE_REVIEW_REQUIRED"),contains("dejó de ser vigente"),eq("ROUTE_INVALIDATED:100"),eq(List.of()),eq("OPERACIONES"),eq("CENTRO_OPERACIONES"));
  assertEquals("RUTA_REQUIERE_REVISION",thrown(()->service.requireApprovedForStart(f)).code());
 }
 @Test void changingTheDestinationTheScheduleOrTheResourcesInvalidatesTheApproval(){
  Map<String,Runnable> changes=new LinkedHashMap<>();
  changes.put("aeropuerto de destino",()->f.setDestino(airport(21L,true)));
  changes.put("horario de salida",()->f.setFechaPlanificadaSalida(f.getFechaPlanificadaSalida().plusHours(1)));
  changes.put("horario de llegada",()->f.setFechaPlanificadaLlegada(f.getFechaPlanificadaLlegada().plusHours(1)));
  changes.put("aeronave",()->{Aircraft p=new Aircraft();p.setId(8L);f.setAircraft(p);});
  changes.put("comandante asignado",()->f.setComandante(user(9L,"nuevo")));
  for(var change:changes.entrySet()){
   store.clear();f.setOrigen(origin);f.setDestino(destination);f.setFechaPlanificadaSalida(LocalDateTime.of(2030,1,1,10,0));f.setFechaPlanificadaLlegada(LocalDateTime.of(2030,1,1,12,0));Aircraft p=new Aircraft();p.setId(7L);f.setAircraft(p);f.setComandante(commander);
   approved();change.getValue().run();service.reassess(f,ops);
   assertEquals(FlightRoute.REQUIERE_REVISION,current().getEstadoRevision(),change.getKey());assertTrue(current().getCausaInvalidacion().contains(change.getKey()),current().getCausaInvalidacion());
  }
 }
 @Test void evenWithoutTheCentralHookAStaleApprovalNeverAllowsStartOrApproval(){
  approved();f.setFechaPlanificadaSalida(f.getFechaPlanificadaSalida().plusHours(1)); // nadie llamó a reassess
  assertEquals("RUTA_REQUIERE_REVISION",thrown(()->service.requireApprovedForStart(f)).code());
  assertEquals("REQUIERE_REVISION",service.get(1L,2L).estado());
 }
 @Test void aPendingVersionIsInvalidatedAndCannotBeApprovedAfterAMaterialChange(){
  service.save(1L,2L,input(0,null));present(2L);f.setDestino(airport(21L,true));service.reassess(f,ops);
  assertEquals(FlightRoute.REQUIERE_REVISION,current().getEstadoRevision());
  assertEquals("TRANSICION_RUTA_NO_PERMITIDA",thrown(()->service.approve(1L,3L,new FlightRouteService.Approve(1,null))).code());
 }
 @Test void administrativeChangesDoNotInvalidateAndDraftsOrReturnedRoutesAreLeftAlone(){
  approved();f.setMotivoVuelo("Nuevo motivo administrativo");service.reassess(f,ops);
  assertEquals(FlightRoute.APROBADA,current().getEstadoRevision());verify(audit,never()).record(any(),any(),any(),any(),eq("INVALIDATE"),any(),any());assertDoesNotThrow(()->service.requireApprovedForStart(f));
  store.clear();service.save(1L,2L,input(0,null));f.setOrigen(airport(20L,true));service.reassess(f,ops);assertEquals(FlightRoute.BORRADOR,current().getEstadoRevision());
  store.clear();f.setOrigen(origin);service.save(1L,2L,input(0,null));present(2L);service.sendBack(1L,3L,new FlightRouteService.Return(1,"Corrija el recorrido indicado"));f.setOrigen(airport(20L,true));service.reassess(f,ops);assertEquals(FlightRoute.DEVUELTA,current().getEstadoRevision());
  verify(audit,never()).record(any(),any(),any(),any(),eq("INVALIDATE"),any(),any());
 }
 @Test void afterAnInvalidationTheCommanderRegularizesAndOperationsApprovesAgain(){
  approved();f.setFechaPlanificadaSalida(f.getFechaPlanificadaSalida().plusHours(2));f.setFechaPlanificadaLlegada(f.getFechaPlanificadaLlegada().plusHours(2));service.reassess(f,ops);
  assertEquals("RUTA_REQUIERE_REVISION",thrown(()->service.requireApprovedForStart(f)).code());
  ApiException noReason=thrown(()->service.save(1L,2L,input(1,null)));assertEquals("MOTIVO_MODIFICACION_REQUERIDO",noReason.code());
  service.save(1L,2L,new FlightRouteService.Input(1,"Punto A, punto B",null,null,null,null,"Observación","Reconfirmo la ruta con el nuevo horario",true));
  assertEquals(2,current().getVersion());service.approve(1L,3L,new FlightRouteService.Approve(2,null));
  assertDoesNotThrow(()->service.requireApprovedForStart(f));
  assertEquals(FlightRoute.REQUIERE_REVISION,store.get(0).getEstadoRevision());
 }

 // 16-18. condición de inicio
 @Test void startIsBlockedWithTheSpecificCodeForEachRouteSituation(){
  ApiException none=thrown(()->service.requireApprovedForStart(f));assertEquals("RUTA_NO_DEFINIDA",none.code());assertEquals(409,none.status().value());
  service.save(1L,2L,input(0,null));assertEquals("RUTA_NO_PRESENTADA",thrown(()->service.requireApprovedForStart(f)).code());
  present(2L);assertEquals("RUTA_PENDIENTE_REVISION",thrown(()->service.requireApprovedForStart(f)).code());
  service.sendBack(1L,3L,new FlightRouteService.Return(1,"Complete el alternativo solicitado"));assertEquals("RUTA_DEVUELTA",thrown(()->service.requireApprovedForStart(f)).code());
  service.save(1L,2L,new FlightRouteService.Input(1,"Punto A, punto B",12L,null,null,null,null,"Agrego el alternativo pedido",true));service.approve(1L,3L,new FlightRouteService.Approve(2,null));
  assertDoesNotThrow(()->service.requireApprovedForStart(f));
 }
 @Test void aRejectedStartIsAuditedByOperationsOnly(){
  service.auditRejectedStart(1L,3L,"RUTA_NO_DEFINIDA","sin ruta");
  verify(audit).record(eq(f),eq(ops),eq("FLIGHT_ROUTE"),isNull(),eq("START_REJECTED"),isNull(),contains("RUTA_NO_DEFINIDA"));
  clearInvocations(audit);service.auditRejectedStart(1L,5L,"RUTA_NO_DEFINIDA","sin ruta");verifyNoInteractions(audit);
 }

 // lectura, estados y permisos de la ficha
 @Test void theViewTellsEachRoleWhatItMayDo(){
  assertEquals("SIN_PLANIFICAR",service.get(1L,2L).estado());verify(access).mayRead(f,2L);
  assertTrue(service.get(1L,2L).editable());assertFalse(service.get(1L,3L).editable());
  service.save(1L,2L,input(0,null));
  FlightRouteService.View draft=service.get(1L,2L);assertTrue(draft.puedePresentar());assertFalse(draft.puedeRevisar());
  present(2L);
  FlightRouteService.View forCommander=service.get(1L,2L),forOps=service.get(1L,3L);
  assertFalse(forCommander.puedePresentar());assertFalse(forCommander.puedeRevisar());assertTrue(forOps.puedeRevisar());assertEquals(1,forOps.versionVigente());
  assertEquals("APT10",forOps.versiones().get(0).condiciones().origen());assertEquals("APT11",forOps.versiones().get(0).condiciones().destino());
 }
 @Test void statusesUseTheSameEvaluationAsTheView(){
  service.save(1L,2L,input(0,null));present(2L);
  when(routes.findByEsVersionActualTrue()).thenReturn(List.of(current()));when(flights.findAll()).thenReturn(List.of(f));
  var s=service.statuses().get(0);assertEquals("PENDIENTE_REVISION",s.estado());assertEquals(1,s.version());assertTrue(s.bloqueaInicio());
  service.approve(1L,3L,new FlightRouteService.Approve(1,null));s=service.statuses().get(0);assertEquals("APROBADA",s.estado());assertFalse(s.bloqueaInicio());
 }
 @Test void meaningfulTextNeedsLengthLettersAndVariety(){
  assertTrue(FlightRouteService.meaningful("Falta el alternativo",10));assertFalse(FlightRouteService.meaningful("aaaaaaaaaaaa",10));assertFalse(FlightRouteService.meaningful("1234567890123",10));assertFalse(FlightRouteService.meaningful("corto",10));assertFalse(FlightRouteService.meaningful(null,10));
 }
 @Test void blockedCommanderCannotSaveOrSubmit(){
  doThrow(new ApiException(HttpStatus.FORBIDDEN,"COMANDANTE_BLOQUEADO","FUNCIONES BLOQUEADAS",Map.of())).when(commanderAccess).requireOperationalAccess(2L);
  assertEquals("COMANDANTE_BLOQUEADO",thrown(()->service.save(1L,2L,input(0,null))).code());assertEquals("COMANDANTE_BLOQUEADO",thrown(()->service.submit(1L,2L,new FlightRouteService.Submit(1))).code());
 }
 // rutas históricas (anteriores a V37 o a V55): sin recorrido planificado ni contexto operativo
 FlightRoute legacy(String reviewState){FlightRoute r=new FlightRoute();r.setId(900L);r.setFlight(f);r.setVersion(1);r.setEsVersionActual(true);r.setCreadoPor(commander);r.setEstadoRevision(reviewState);r.setCreatedAt(LocalDateTime.of(2026,1,1,8,0));store.add(r);return r;}
 @Test void aHistoricalRouteWithoutContextOrPathIsReadWithoutErrorsAndNeverLooksApproved(){
  FlightRoute r=legacy(FlightRoute.BORRADOR);
  FlightRouteService.View view=service.get(1L,2L);assertEquals("BORRADOR",view.estado());assertNull(view.versiones().get(0).recorrido());assertNull(view.versiones().get(0).condiciones());assertFalse(view.puedePresentar(),"sin contexto no puede presentarse tal cual");assertFalse(view.inicio().permitido());assertEquals("RUTA_NO_PRESENTADA",view.inicio().codigo());
  when(routes.findByEsVersionActualTrue()).thenReturn(List.of(r));when(flights.findAll()).thenReturn(List.of(f));assertEquals("BORRADOR",service.statuses().get(0).estado());
  assertEquals("RUTA_REQUIERE_REVISION",thrown(()->service.submit(1L,2L,new FlightRouteService.Submit(1))).code());
  assertEquals("TRANSICION_RUTA_NO_PERMITIDA",thrown(()->service.approve(1L,3L,new FlightRouteService.Approve(1,null))).code());
  assertEquals("RUTA_NO_PRESENTADA",thrown(()->service.requireApprovedForStart(f)).code());
 }
 @Test void aHistoricalDraftIsReplacedByANewVersionWithoutLosingItsData(){
  FlightRoute r=legacy(FlightRoute.BORRADOR);
  service.save(1L,2L,input(1,"Ruta actual",null,true));
  assertEquals(2,store.size());assertFalse(r.getEsVersionActual());assertEquals(FlightRoute.SIN_REVISION,r.getEstadoRevision());assertNull(r.getRecorrido());assertNull(r.getContexto());assertEquals(LocalDateTime.of(2026,1,1,8,0),r.getCreatedAt());
  assertEquals(FlightRoute.PENDIENTE_REVISION,current().getEstadoRevision());
 }
 @Test void aHistoricalRouteOfAStartedOrFinishedFlightStaysReadableAndDoesNotBlockAnything(){
  legacy(FlightRoute.SIN_REVISION);f.getEstadoVuelo().setCodigo("EN_CURSO");
  FlightRouteService.View view=service.get(1L,3L);assertEquals("SIN_REVISION",view.estado());assertFalse(view.inicio().aplica());assertFalse(view.editable());assertFalse(view.puedeRevisar());
  f.getEstadoVuelo().setCodigo("FINALIZADO");assertEquals("SIN_REVISION",service.get(1L,2L).estado());
  assertDoesNotThrow(()->service.reassess(f,ops),"cambios del vuelo sobre una ruta sin decisión no fallan");
  assertEquals(400,thrown(()->service.save(1L,2L,input(1,null))).status().value());
 }
 @Test void aPresentedRouteWithAnUnreadableContextIsTreatedAsRequiringReviewNotAsAnError(){
  FlightRoute r=legacy(FlightRoute.PENDIENTE_REVISION);r.setPresentadoPor(commander);r.setFechaPresentacion(LocalDateTime.now(clock));r.setRecorrido("Ruta");
  for(String context:new String[]{null,"","10|11","x|y|z|w|v|u"}){
   r.setContexto(context);FlightRouteService.View view=service.get(1L,3L);assertEquals("REQUIERE_REVISION",view.estado(),String.valueOf(context));assertFalse(view.puedeRevisar());assertEquals("RUTA_REQUIERE_REVISION",thrown(()->service.requireApprovedForStart(f)).code());
   assertEquals("RUTA_REQUIERE_REVISION",thrown(()->service.approve(1L,3L,new FlightRouteService.Approve(1,null))).code(),"no se aprueba una versión cuyo contexto no es legible");
  }
  r.setContexto(null);service.reassess(f,ops);assertEquals(FlightRoute.REQUIERE_REVISION,r.getEstadoRevision());assertNotNull(r.getCausaInvalidacion());
 }
}
