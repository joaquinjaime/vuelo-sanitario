package com.vuelossanitarios.backend.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.person.ProfessionalCredential;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProfessionalCredentialServiceTest {
 @Test void credentialMustBeVerifiedAndValidAtTheEndOfTheFlight(){
  var repo=mock(ProfessionalCredentialRepository.class);var service=new ProfessionalCredentialService(repo,mock(CredentialDocumentRepository.class),mock(UserRepository.class),mock(CrewRoleRepository.class),mock(AuditEventRepository.class),mock(AuditService.class),mock(DocumentStorage.class),new ObjectMapper(),"America/Argentina/Tucuman");
  Person person=new Person();person.setId(7L);User user=new User();user.setPerson(person);
  ProfessionalCredential c=new ProfessionalCredential();c.status="VERIFICADA";c.expires=LocalDate.now().plusDays(1);
  when(repo.findByPersonIdAndRoleCodigoAndStatus(7L,"MEDICO","VERIFICADA")).thenReturn(List.of(c));
  assertTrue(service.sufficient(user,"MEDICO",LocalDate.now()));
  assertFalse(service.sufficient(user,"MEDICO",LocalDate.now().plusDays(2)));
  c.expires=LocalDate.now().minusDays(1);assertFalse(service.sufficient(user,"MEDICO",LocalDate.now()));
  c.expires=null;c.noExpiry=true;c.status="REVOCADA";assertFalse(service.sufficient(user,"MEDICO",LocalDate.now()));
  c.status="VERIFICADA";c.noExpiry=false;assertFalse(service.sufficient(user,"MEDICO",LocalDate.now()));c.noExpiry=true;c.issued=LocalDate.now().plusDays(1);assertFalse(service.sufficient(user,"MEDICO",LocalDate.now().plusDays(2)));
 }
}
