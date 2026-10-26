package com.vuelossanitarios.backend.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.person.ProfessionalCredential;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ProfessionalCredentialServiceTest {
 @Test void credentialUsesControlledClockAndPlannedDepartureDay(){
  var repo=mock(ProfessionalCredentialRepository.class);var service=new ProfessionalCredentialService(repo,mock(CredentialDocumentRepository.class),mock(UserRepository.class),mock(CrewRoleRepository.class),mock(AuditEventRepository.class),mock(AuditService.class),mock(DocumentStorage.class),new ObjectMapper(),"America/Argentina/Tucuman");
  ZoneId zone=ZoneId.of("America/Argentina/Tucuman");ReflectionTestUtils.setField(service,"clock",Clock.fixed(LocalDate.of(2026,10,25).atStartOfDay(zone).toInstant(),zone));
  Person person=new Person();person.setId(7L);User user=new User();user.setPerson(person);
  CrewRole role=new CrewRole();role.setCodigo("MEDICO");ProfessionalCredential c=new ProfessionalCredential();c.role=role;c.status="VERIFICADA";c.expires=LocalDate.of(2026,10,27);
  when(repo.findByPersonIdOrderByIdDesc(7L)).thenReturn(List.of(c));
  assertEquals("HABILITACION_POR_VENCER",service.assess(user,"MEDICO",LocalDate.of(2026,10,27)).code());
  assertEquals("HABILITACION_VENCIDA",service.assess(user,"MEDICO",LocalDate.of(2026,10,28)).code());
  c.expires=LocalDate.of(2026,10,24);assertEquals("HABILITACION_VENCIDA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.expires=null;c.noExpiry=true;c.status="REVOCADA";assertEquals("HABILITACION_REVOCADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.status="RECHAZADA";assertEquals("HABILITACION_RECHAZADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.status="PENDIENTE";assertEquals("HABILITACION_NO_VERIFICADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.status="VERIFICADA";c.issued=LocalDate.of(2026,10,26);assertFalse(service.assess(user,"MEDICO",LocalDate.of(2026,10,27)).eligible());
  c.issued=null;assertTrue(service.assess(user,"MEDICO",LocalDate.of(2026,10,27)).eligible());
 }
}
