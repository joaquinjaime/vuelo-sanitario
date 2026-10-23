package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FinalReportDtos.*;
import com.vuelossanitarios.backend.config.AdjustableClock;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.notification.Notification;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Línea de tiempo del plazo de 48 h con un reloj controlable y persistencia en memoria (sin SQL ni sleeps):
 * servicios reales de obligaciones, bloqueo, avisos y notificaciones; sólo los repositorios son simulados con estado.
 */
class ClosureTimelineTest {
 private static final ZoneId MADRID=ZoneId.of("Europe/Madrid"),TUCUMAN=ZoneId.of("America/Argentina/Tucuman");
 private final List<FinalReportObligation> obligations=new ArrayList<>(); private final List<FlightFinalReport> reports=new ArrayList<>(); private final List<Notification> sent=new ArrayList<>();
 private long ids=100; private AdjustableClock clock; private User ops,ops2,commander,commander2;
 private FinalReportWorkflowService workflow; private FinalReportDeadlineService deadlines; private CommanderReportAccessService access;
 private final FlightStatus finalizado=status("FINALIZADO"),completado=status("COMPLETADO");

 private void world(Clock base){
  clock=new AdjustableClock(base);
  FinalReportObligationRepository or=mock(FinalReportObligationRepository.class); FlightFinalReportRepository rr=mock(FlightFinalReportRepository.class); NotificationRepository nr=mock(NotificationRepository.class); UserRepository ur=mock(UserRepository.class); FlightStatusRepository sr=mock(FlightStatusRepository.class); SanitaryFlightRepository sf=mock(SanitaryFlightRepository.class);
  ops=user(1L,"ops");commander=user(2L,"cmd");commander2=user(3L,"cmd2");ops2=user(4L,"ops2");
  when(ur.findById(anyLong())).thenAnswer(x->Stream.of(ops,commander,commander2,ops2).filter(u->u.getId().equals(x.getArgument(0))).findFirst()); when(ur.findActiveByRoleCode(anyString())).thenAnswer(x->"CENTRO_OPERACIONES".equals(x.getArgument(0))?List.of(ops):"OPERACIONES".equals(x.getArgument(0))?List.of(ops2):List.of());
  when(sr.findByCodigo("COMPLETADO")).thenReturn(Optional.of(completado)); when(sf.findByFlightId(anyLong())).thenReturn(Optional.empty());
  when(or.lockById(anyLong())).thenAnswer(x->obligations.stream().filter(o->o.getId().equals(x.getArgument(0))).findFirst()); when(or.findById(anyLong())).thenAnswer(x->obligations.stream().filter(o->o.getId().equals(x.getArgument(0))).findFirst());
  when(or.save(any())).thenAnswer(x->{FinalReportObligation o=x.getArgument(0);if(o.getId()==null){o.setId(++ids);obligations.add(o);}return o;}); when(or.saveAndFlush(any())).thenAnswer(x->x.getArgument(0));
  when(or.findByFlightIdAndCurrentTrue(anyLong())).thenAnswer(x->obligations.stream().filter(o->o.getFlight().getId().equals(x.getArgument(0))&&o.getCurrent()).findFirst());
  when(or.findByCommanderIdAndCurrentTrueOrderByDueAtAsc(anyLong())).thenAnswer(x->obligations.stream().filter(o->o.getCommander().getId().equals(x.getArgument(0))).sorted(Comparator.comparing(FinalReportObligation::getDueAt)).toList());
  when(or.findByStatusInAndCurrentTrueOrderByDueAtAsc(any())).thenAnswer(x->{Collection<FinalReportStatus> st=x.getArgument(0);return obligations.stream().filter(o->st.contains(o.getStatus())).sorted(Comparator.comparing(FinalReportObligation::getDueAt)).toList();});
  when(or.existsByCommanderIdAndCurrentTrueAndStatusInAndDueAtLessThanEqual(anyLong(),any(),any())).thenAnswer(x->{Collection<FinalReportStatus> st=x.getArgument(1);OffsetDateTime at=x.getArgument(2);return obligations.stream().anyMatch(o->o.getCommander().getId().equals(x.getArgument(0))&&o.getCurrent()&&st.contains(o.getStatus())&&!o.getDueAt().isAfter(at));});
  when(rr.saveAndFlush(any())).thenAnswer(x->{FlightFinalReport r=x.getArgument(0);if(r.getId()==null){r.setId(++ids);reports.add(r);}return r;}); when(rr.findByFlightIdAndEsVersionActualTrue(anyLong())).thenAnswer(x->reports.stream().filter(r->r.getFlight().getId().equals(x.getArgument(0))&&r.getEsVersionActual()).findFirst());
  when(rr.countByFlightId(anyLong())).thenAnswer(x->(int)reports.stream().filter(r->r.getFlight().getId().equals(x.getArgument(0))).count()); when(rr.findByFlightIdOrderByVersionDesc(anyLong())).thenAnswer(x->reports.stream().filter(r->r.getFlight().getId().equals(x.getArgument(0))).sorted(Comparator.comparing(FlightFinalReport::getVersion).reversed()).toList());
  when(nr.existsByUserIdAndClaveEvento(anyLong(),anyString())).thenAnswer(x->sent.stream().anyMatch(n->n.getUser().getId().equals(x.getArgument(0))&&x.getArgument(1).equals(n.getClaveEvento())));
  when(nr.save(any())).thenAnswer(x->{Notification n=x.getArgument(0);sent.add(n);return n;});
  NotificationService notifications=new NotificationService(nr,ur); AuditService audit=mock(AuditService.class);
  access=new CommanderReportAccessService(or,clock);
  workflow=new FinalReportWorkflowService(or,rr,sf,sr,ur,notifications,audit,access,mock(ReportAttachmentService.class),new ObjectMapper().findAndRegisterModules(),clock);
  deadlines=new FinalReportDeadlineService(or,notifications,audit,clock,mock(PlatformTransactionManager.class),12);
 }

 @Test void deadlineIsExactlyFortyEightHoursEvenAcrossDstAndMidnightAndIsPersistedInTheObligation(){
  world(Clock.fixed(Instant.parse("2026-03-28T22:30:00Z"),MADRID)); // 23:30 hora de Madrid, la noche previa al cambio de hora
  Instant finish=clock.instant(); FinalReportObligation o=finishFlight(10L,commander);
  assertEquals(Duration.ofHours(48),Duration.between(finish,o.getDueAt().toInstant()),"48 h exactas, no 'dos días civiles'");
  assertEquals(LocalDateTime.of(2026,3,31,0,30),o.getDueAt().atZoneSameInstant(MADRID).toLocalDateTime(),"el reloj local avanzó una hora por el horario de verano");
  assertEquals(OffsetDateTime.parse("2026-03-30T22:30:00Z"),o.getDueAt(),"se conserva como instante UTC con zona explícita");
  assertEquals(finalizado,o.getFlight().getEstadoVuelo());
 }
 @Test void deadlineCrossesTwoLocalMidnightsInTheBusinessZoneAndTheDisplayDayChanges(){
  world(Clock.fixed(Instant.parse("2026-10-21T02:30:00Z"),TUCUMAN)); // 23:30 del 20/10 en Tucumán (UTC-3)
  FinalReportObligation o=finishFlight(11L,commander);
  assertEquals(OffsetDateTime.parse("2026-10-23T02:30:00Z"),o.getDueAt()); assertEquals(LocalDateTime.of(2026,10,22,23,30),o.getDueAt().atZoneSameInstant(TUCUMAN).toLocalDateTime());
  assertEquals(LocalDate.of(2026,10,20),clock.instant().atZone(TUCUMAN).toLocalDate()); assertEquals(LocalDate.of(2026,10,21),clock.instant().atZone(ZoneOffset.UTC).toLocalDate());
 }

 @Test void blockStartsExactlyAtTheDeadlineWithoutAnySweepAndEndsWithTheSubmission(){
  world(Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),TUCUMAN)); FinalReportObligation o=finishFlight(12L,commander); OffsetDateTime due=o.getDueAt();
  clock.setNow(due.toInstant().minusMillis(1)); assertFalse(access.isBlocked(2L)); assertDoesNotThrow(()->access.requireOperationalAccess(2L));
  clock.setNow(due.toInstant()); assertTrue(access.isBlocked(2L)); assertThrows(ApiException.class,()->access.requireOperationalAccess(2L));
  assertTrue(sent.stream().noneMatch(n->n.getTipo().equals("FINAL_REPORT_OVERDUE")),"ningún proceso periódico corrió: el bloqueo es independiente");
  assertTrue(workflow.mine(2L).get(0).bloqueado()); assertTrue(workflow.mine(2L).get(0).vencida());
  workflow.submit(o.getId(),new Submit("Tardío",null,null,null),null,2L); assertFalse(access.isBlocked(2L)); assertEquals(FinalReportStatus.PRESENTADO,o.getStatus());
 }

 @Test void dueSoonAndOverdueNoticesAreIdempotentAndTargetTheResponsibleOperator(){
  world(Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),TUCUMAN)); FinalReportObligation o=finishFlight(13L,commander); OffsetDateTime due=o.getDueAt();
  clock.setNow(due.toInstant().minus(Duration.ofHours(12)).minusSeconds(1)); assertEquals(0,deadlines.sweep());
  clock.setNow(due.toInstant().minus(Duration.ofHours(12))); assertEquals(1,deadlines.sweep()); assertEquals(0,deadlines.sweep()); assertEquals(0,deadlines.sweep()); assertEquals(1,count("FINAL_REPORT_DUE_SOON",commander));
  clock.setNow(due.toInstant().minusSeconds(1)); assertEquals(0,deadlines.sweep()); assertFalse(access.isBlocked(2L));
  clock.setNow(due.toInstant()); int first=deadlines.sweep(); assertEquals(3,first,"vencida + bloqueo al comandante y alerta al responsable de cierre"); assertEquals(0,deadlines.sweep());
  assertEquals(1,count("FINAL_REPORT_OVERDUE",commander)); assertEquals(1,count("COMMANDER_BLOCKED",commander)); assertEquals(1,count("FINAL_REPORT_OVERDUE",ops)); assertEquals(0,count("FINAL_REPORT_OVERDUE",ops2)); assertEquals(1,count("FINAL_REPORT_PENDING",commander));
  assertTrue(sent.stream().allMatch(n->n.getMensaje()!=null&&!n.getMensaje().toLowerCase().contains("diagn")),"sin información clínica");
 }

 @Test void returnRestartsTheFullFortyEightHoursAndTheRestartedDeadlineCanExpireAgain(){
  world(Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),TUCUMAN)); FinalReportObligation o=finishFlight(14L,commander);
  clock.setNow(o.getDueAt().toInstant().minus(Duration.ofHours(1))); workflow.submit(o.getId(),new Submit("v1",null,null,null),null,2L); assertFalse(access.isBlocked(2L));
  Instant returnedAt=o.getDueAt().toInstant().plus(Duration.ofHours(5)); clock.setNow(returnedAt); // la revisión llega después del vencimiento original
  workflow.review(o.getId(),new Review(false,"Corregir"),1L);
  assertEquals(returnedAt.plus(Duration.ofHours(48)),o.getDueAt().toInstant()); assertFalse(access.isBlocked(2L),"el comandante no queda bloqueado por la demora del revisor");
  clock.setNow(returnedAt.plus(Duration.ofHours(47)).plusSeconds(59)); assertFalse(access.isBlocked(2L)); clock.setNow(returnedAt.plus(Duration.ofHours(48))); assertTrue(access.isBlocked(2L));
  clock.setNow(returnedAt.plus(Duration.ofHours(47)).plusSeconds(59)); workflow.submit(o.getId(),new Submit("v2 en plazo",null,null,null),null,2L); assertEquals(2,reports.size()); assertFalse(access.isBlocked(2L));
  workflow.review(o.getId(),new Review(false,"Otra vuelta"),1L); assertEquals(clock.instant().plus(Duration.ofHours(48)),o.getDueAt().toInstant()); assertFalse(o.getExtensionUsed());
  clock.setNow(clock.instant().plus(Duration.ofHours(49))); assertTrue(access.isBlocked(2L)); deadlines.sweep(); assertEquals(1,sent.stream().filter(n->n.getTipo().equals("COMMANDER_BLOCKED")).count());
  workflow.submit(o.getId(),new Submit("v3 tardía",null,null,null),null,2L); assertFalse(access.isBlocked(2L)); assertEquals(1,count("COMMANDER_UNBLOCKED",commander)); assertEquals(3,reports.size());
 }

 @Test void commanderStaysBlockedUntilEveryOverdueObligationIsRegularized(){
  world(Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),TUCUMAN)); FinalReportObligation a=finishFlight(15L,commander),b=finishFlight(16L,commander),other=finishFlight(17L,commander2);
  clock.setNow(a.getDueAt().toInstant().plus(Duration.ofHours(1))); assertTrue(access.isBlocked(2L)); assertTrue(access.isBlocked(3L));
  workflow.submit(a.getId(),new Submit("A",null,null,null),null,2L); assertTrue(access.isBlocked(2L),"B sigue vencida"); assertEquals(0,count("COMMANDER_UNBLOCKED",commander));
  workflow.submit(other.getId(),new Submit("O",null,null,null),null,3L); assertFalse(access.isBlocked(3L)); assertTrue(access.isBlocked(2L));
  workflow.submit(b.getId(),new Submit("B",null,null,null),null,2L); assertFalse(access.isBlocked(2L)); assertEquals(1,count("COMMANDER_UNBLOCKED",commander));
 }

 @Test void aDeadlineExtensionMovesTheBlockAndReplacesTheNoticeCycle(){
  world(Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),TUCUMAN)); FinalReportObligation o=finishFlight(18L,commander);
  clock.setNow(o.getDueAt().toInstant().minus(Duration.ofHours(2))); workflow.extend(o.getId(),2L); assertEquals(o.getOriginalDueAt().plusHours(24),o.getDueAt());
  clock.setNow(o.getOriginalDueAt().toInstant().plusSeconds(1)); assertFalse(access.isBlocked(2L)); clock.setNow(o.getDueAt().toInstant()); assertTrue(access.isBlocked(2L));
 }

 @Test void operationsNoticesGoToTheResponsibleUsersAndFallBackToTheSharedQueue(){
  world(Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),TUCUMAN)); FinalReportObligation o=finishFlight(19L,commander); // finalizó "ops"
  workflow.submit(o.getId(),new Submit("v1",null,null,null),null,2L); assertEquals(1,count("FINAL_REPORT_SUBMITTED",ops)); assertEquals(0,count("FINAL_REPORT_SUBMITTED",ops2),"sólo el responsable de cierre, no toda la cola");
  o.setFinisher(null); workflow.review(o.getId(),new Review(false,"Corregir"),1L); o.setReturnedBy(null); // histórico sin responsable ni revisor registrados
  workflow.submit(o.getId(),new Submit("v2",null,null,null),null,2L); assertEquals(1,count("FINAL_REPORT_RESUBMITTED",ops),"sin responsables elegibles se notifica a la cola compartida de Operaciones"); assertEquals(1,count("FINAL_REPORT_RESUBMITTED",ops2));
 }

 private FinalReportObligation finishFlight(Long id,User cmd){
  Flight f=new Flight();f.setId(id);f.setCodigo("V-"+id);f.setEstadoVuelo(finalizado);f.setComandante(cmd);FlightType t=new FlightType();t.setCodigo("REGRESO_BASE");f.setTipoVuelo(t);
  workflow.createObligationAfterFinish(f,ops);return obligations.stream().filter(o->o.getFlight()==f).findFirst().orElseThrow();
 }
 private long count(String type,User u){return sent.stream().filter(n->n.getTipo().equals(type)&&n.getUser().getId().equals(u.getId())).count();}
 private static FlightStatus status(String c){FlightStatus s=new FlightStatus();s.setCodigo(c);return s;}
 private static User user(Long id,String name){User u=new User();u.setId(id);u.setUsername(name);Person p=new Person();p.setNombre("N"+id);p.setApellido("A");u.setPerson(p);return u;}
}
