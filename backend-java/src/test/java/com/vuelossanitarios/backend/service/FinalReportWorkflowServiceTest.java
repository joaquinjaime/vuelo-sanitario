package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.dto.FinalReportDtos;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class FinalReportWorkflowServiceTest {
 private final FinalReportObligationRepository obligations=mock(FinalReportObligationRepository.class);
 private final FlightFinalReportRepository reports=mock(FlightFinalReportRepository.class);
 private final FlightRepository flights=mock(FlightRepository.class); private final FlightStatusRepository statuses=mock(FlightStatusRepository.class);
 private final UserRepository users=mock(UserRepository.class); private final NotificationService notifications=mock(NotificationService.class);
 private final AuditService audit=mock(AuditService.class); private final CommanderReportAccessService access=mock(CommanderReportAccessService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2026-10-13T12:00:00Z"),ZoneOffset.UTC);
 private final FinalReportWorkflowService service=new FinalReportWorkflowService(obligations,reports,flights,statuses,users,notifications,audit,access,clock);

 @Test void overdueCommanderCanStillSubmitAndThePendingBlockIsLifted() {
  Long commanderId=11L, obligationId=21L; User commander=user(commanderId); Flight flight=finalizedFlight();
  FinalReportObligation obligation=new FinalReportObligation(); obligation.setId(obligationId); obligation.setFlight(flight); obligation.setCommander(commander); obligation.setStatus(FinalReportStatus.PENDIENTE); obligation.setDueAt(OffsetDateTime.parse("2026-10-12T12:00:00Z")); obligation.setOriginalDueAt(obligation.getDueAt());
  when(obligations.lockById(obligationId)).thenReturn(Optional.of(obligation)); when(users.findById(commanderId)).thenReturn(Optional.of(commander)); when(reports.countByFlightId(flight.getId())).thenReturn(0); when(access.isBlocked(commanderId)).thenReturn(false);
  doAnswer(x->{FlightFinalReport report=x.getArgument(0);report.setId(31L);return report;}).when(reports).save(any());
  var result=service.submit(obligationId,new FinalReportDtos.Submit("Informe aún vencido",BigDecimal.ONE,BigDecimal.ONE,null),commanderId);
  assertEquals("PRESENTADO",result.status()); assertEquals(FinalReportStatus.PRESENTADO,obligation.getStatus()); verify(reports).save(any());
 }

 @Test void returnedReportRestartsTheFortyEightHourDeadline() {
  Long operatorId=12L, obligationId=22L; User operator=user(operatorId); Flight flight=finalizedFlight(); FlightFinalReport report=new FlightFinalReport(); report.setId(32L); report.setEsVersionActual(true);
  FinalReportObligation obligation=new FinalReportObligation(); obligation.setId(obligationId); obligation.setFlight(flight); obligation.setCommander(user(13L)); obligation.setStatus(FinalReportStatus.PRESENTADO); obligation.setReport(report);
  when(obligations.lockById(obligationId)).thenReturn(Optional.of(obligation)); when(users.findById(operatorId)).thenReturn(Optional.of(operator)); when(access.isBlocked(anyLong())).thenReturn(false);
  service.review(obligationId,new FinalReportDtos.Review(false,"Falta detalle"),operatorId);
  assertEquals(FinalReportStatus.DEVUELTO,obligation.getStatus()); assertEquals(OffsetDateTime.ofInstant(clock.instant(),ZoneOffset.UTC).plusHours(48),obligation.getDueAt()); assertFalse(obligation.getExtensionUsed());
 }

 private User user(Long id){User u=new User();u.setId(id);return u;}
 private Flight finalizedFlight(){Flight f=new Flight();f.setId(7L);FlightStatus s=new FlightStatus();s.setCodigo("FINALIZADO");f.setEstadoVuelo(s);return f;}
}
