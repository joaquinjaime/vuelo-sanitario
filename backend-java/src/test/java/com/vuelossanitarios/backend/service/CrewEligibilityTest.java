package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import org.junit.jupiter.api.Test;

class CrewEligibilityTest {
 @Test void sameDecisionChangesAfterCredentialRevocationAndAccountDeactivation(){
  var qualifications=mock(CrewQualificationRepository.class);var credentials=mock(ProfessionalCredentialService.class);
  var service=new CrewManagementService(mock(FlightRepository.class),mock(FlightCrewRepository.class),mock(UserRepository.class),mock(CrewRoleRepository.class),qualifications,mock(AuditService.class),credentials,mock(NotificationService.class),Clock.fixed(Instant.parse("2026-10-25T12:00:00Z"),ZoneId.of("America/Argentina/Tucuman")));
  Flight flight=new Flight();flight.setFechaPlanificadaSalida(LocalDateTime.of(2026,10,27,9,0));
  User user=new User();user.setId(8L);user.setEstadoCuenta("ACTIVO");user.setActivo(true);user.setPerson(new Person());
  when(qualifications.existsByUserIdAndRoleCodigo(8L,"COPILOTO")).thenReturn(true);
  when(credentials.assess(user,"COPILOTO",LocalDate.of(2026,10,27))).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));
  assertTrue(service.evaluate(flight,user,"COPILOTO",false).eligible());
  when(credentials.assess(user,"COPILOTO",LocalDate.of(2026,10,27))).thenReturn(new ProfessionalCredentialService.Assessment(false,"HABILITACION_REVOCADA","Revocada",null));
  assertEquals("HABILITACION_REVOCADA",service.evaluate(flight,user,"COPILOTO",false).code());
  user.setActivo(false);assertEquals("CUENTA_INACTIVA",service.evaluate(flight,user,"COPILOTO",false).code());
  user.setActivo(true);when(qualifications.existsByUserIdAndRoleCodigo(8L,"COPILOTO")).thenReturn(false);
  assertEquals("CLASIFICACION_INCOMPATIBLE",service.evaluate(flight,user,"COPILOTO",false).code());
 }
}
