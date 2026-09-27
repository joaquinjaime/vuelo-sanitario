package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.repository.FinalReportObligationRepository;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class CommanderReportAccessServiceTest {
 @Test void overdue_pending_obligation_blocks_without_a_scheduler_or_new_login(){
  FinalReportObligationRepository repo=mock(FinalReportObligationRepository.class); UUID commander=UUID.randomUUID();
  when(repo.existsByCommanderIdAndCurrentTrueAndStatusInAndDueAtLessThanEqual(eq(commander),anyCollection(),any())).thenReturn(true);
  CommanderReportAccessService service=new CommanderReportAccessService(repo,Clock.fixed(Instant.parse("2026-09-22T12:00:00Z"),ZoneOffset.UTC));
  assertTrue(service.isBlocked(commander)); assertThrows(ApiException.class,()->service.requireOperationalAccess(commander));
 }
 @Test void commander_with_no_overdue_obligation_remains_operational(){
  FinalReportObligationRepository repo=mock(FinalReportObligationRepository.class); UUID commander=UUID.randomUUID();
  when(repo.existsByCommanderIdAndCurrentTrueAndStatusInAndDueAtLessThanEqual(eq(commander),anyCollection(),any())).thenReturn(false);
  assertDoesNotThrow(()->new CommanderReportAccessService(repo,Clock.systemUTC()).requireOperationalAccess(commander));
 }
}
