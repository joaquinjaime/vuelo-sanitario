package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import org.junit.jupiter.api.Test;

/** La elegibilidad de un comandante o copiloto depende sólo de datos de la aplicación: cuenta, rol, licencia registrada, informes y disponibilidad. */
class CrewEligibilityTest {
 private final CrewManagementService service=new CrewManagementService(mock(FlightRepository.class),mock(FlightCrewRepository.class),mock(UserRepository.class),mock(CrewRoleRepository.class),mock(AuditService.class),mock(NotificationService.class),Clock.fixed(Instant.parse("2026-10-25T12:00:00Z"),ZoneId.of("UTC")));
 private static User commanderAccount(){
  User u=new User();u.setId(8L);u.setEstadoCuenta("ACTIVO");u.setActivo(true);Person p=new Person();u.setPerson(p);
  CommanderProfile profile=new CommanderProfile();profile.setLicenseNumber("ARG0000");p.setCommanderProfile(profile);
  Role r=new Role();r.setCodigo("COMANDANTE");r.setNombre("Comandante");r.setActivo(true);u.getUserRoles().add(new UserRole(u,r));return u;
 }

 @Test void aRegisteredCommanderIsEligibleWithoutAnyClassificationPolicyOrDocument(){
  Flight flight=new Flight();flight.setFechaPlanificadaSalida(LocalDateTime.of(2026,10,27,9,0));
  User user=commanderAccount();
  assertTrue(service.evaluate(flight,user,"COMANDANTE",false).eligible());
  assertTrue(service.evaluate(flight,user,"COPILOTO",false).eligible());
 }
 @Test void theDecisionChangesWithTheAccountTheRoleAndTheLicenseOnly(){
  Flight flight=new Flight();User user=commanderAccount();
  user.setActivo(false);assertEquals("CUENTA_INACTIVA",service.evaluate(flight,user,"COPILOTO",false).code());
  user.setActivo(true);user.getPerson().getCommanderProfile().setLicenseNumber("");assertEquals("PERFIL_COMANDANTE_INCOMPLETO",service.evaluate(flight,user,"COMANDANTE",false).code());
  user.getPerson().getCommanderProfile().setLicenseNumber("ARG0000");user.getUserRoles().clear();assertEquals("PERFIL_COMANDANTE_INCOMPLETO",service.evaluate(flight,user,"COPILOTO",false).code());
 }
 @Test void theMessagesNeverClaimThatTheLicenseWasVerified(){
  var list=service.requirements(null,commanderAccount(),"COMANDANTE");
  assertTrue(list.stream().noneMatch(r->r.mensaje().toLowerCase().contains("verificada")||r.codigo().equals("CLASIFICACION")||r.codigo().equals("HABILITACION")||r.codigo().equals("POLITICA")));
 }
}
