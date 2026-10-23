package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.FinalReportObligationRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.transaction.PlatformTransactionManager;

class FinalReportDeadlineServiceTest {
 private final FinalReportObligationRepository obligations=mock(FinalReportObligationRepository.class); private final NotificationService notifications=mock(NotificationService.class); private final AuditService audit=mock(AuditService.class);
 private final Instant start=Instant.parse("2026-10-13T12:00:00Z"); private final OffsetDateTime now=OffsetDateTime.ofInstant(start,ZoneOffset.UTC);
 private FinalReportDeadlineService service; private FinalReportObligation obligation; private Flight flight; private User commander;

 @BeforeEach void setUp(){
  commander=new User();commander.setId(11L);commander.setUsername("cmd");commander.setPerson(new Person());
  flight=new Flight();flight.setId(7L);flight.setCodigo("V-7");
  obligation=new FinalReportObligation();obligation.setId(21L);obligation.setFlight(flight);obligation.setCommander(commander);obligation.setStatus(FinalReportStatus.PENDIENTE);obligation.setCurrent(true);
  when(obligations.findByStatusInAndCurrentTrueOrderByDueAtAsc(any())).thenReturn(List.of(obligation)); when(obligations.lockById(21L)).thenReturn(Optional.of(obligation));
  service=new FinalReportDeadlineService(obligations,notifications,audit,Clock.fixed(start,ZoneOffset.UTC),mock(PlatformTransactionManager.class),12);
 }
 private void due(OffsetDateTime when){obligation.setDueAt(when);obligation.setOriginalDueAt(when);}

 @Test void nothingIsEmittedBeforeTheWarningWindow(){due(now.plusHours(13));assertEquals(0,service.sweep());verifyNoInteractions(notifications,audit);}
 @Test void dueSoonWarningIsEmittedOnceWithinTheWindow(){
  due(now.plusHours(11)); when(notifications.createOnce(eq(commander),eq(flight),eq("FINAL_REPORT_DUE_SOON"),anyString(),eq("FINAL_REPORT_DUE_SOON:21:"+now.plusHours(11).toEpochSecond()))).thenReturn(true,false);
  assertEquals(1,service.sweep()); assertEquals(0,service.sweep()); verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void overdueEmitsOverdueBlockAndOperationsAlertsAndAuditsOnlyTheFirstTime(){
  due(now.minusMinutes(1)); String cycle="21:"+now.minusMinutes(1).toEpochSecond();
  when(notifications.createOnce(eq(commander),eq(flight),eq("FINAL_REPORT_OVERDUE"),anyString(),eq("FINAL_REPORT_OVERDUE:"+cycle))).thenReturn(true,false);
  when(notifications.createOnce(eq(commander),eq(flight),eq("COMMANDER_BLOCKED"),anyString(),eq("COMMANDER_BLOCKED:"+cycle))).thenReturn(true);
  when(notifications.createOncePreferred(eq(flight),eq("FINAL_REPORT_OVERDUE"),anyString(),eq("FINAL_REPORT_OVERDUE:"+cycle),anyCollection(),any(String[].class))).thenReturn(2);
  assertEquals(4,service.sweep()); assertEquals(0,service.sweep());
  verify(audit,times(1)).record(eq(flight),isNull(),eq("FINAL_REPORT_OBLIGATION"),eq(21L),eq("OVERDUE"),anyString(),contains("comandanteBloqueado"));
 }
 @Test void aDeadlineRestartedByAReturnGeneratesNewNotificationKeys(){
  due(now.minusHours(1)); service.sweep(); due(now.plusHours(2)); service.sweep();
  verify(notifications).createOnce(any(),any(),eq("FINAL_REPORT_OVERDUE"),anyString(),eq("FINAL_REPORT_OVERDUE:21:"+now.minusHours(1).toEpochSecond()));
  verify(notifications).createOnce(any(),any(),eq("FINAL_REPORT_DUE_SOON"),anyString(),eq("FINAL_REPORT_DUE_SOON:21:"+now.plusHours(2).toEpochSecond()));
 }
 @Test void obligationsThatLeftTheOpenStatesBetweenQueryAndLockAreIgnored(){
  due(now.minusHours(1)); obligation.setStatus(FinalReportStatus.PRESENTADO); assertEquals(0,service.sweep()); verifyNoInteractions(notifications,audit);
 }
}
