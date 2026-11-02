package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.CommanderLocationDtos.CommanderLocationRow;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

/** Ubicación operativa del comandante (V64): sólo provincia o CABA, con quién y cuándo, validaciones de catálogo y auditoría. */
class CommanderLocationServiceTest {
 private final UserRepository users=mock(UserRepository.class); private final ProvinceRepository provinces=mock(ProvinceRepository.class);
 private final AuditService audit=mock(AuditService.class); private final Clock clock=Clock.fixed(Instant.parse("2026-11-02T15:00:00Z"),ZoneId.of("America/Argentina/Tucuman"));
 private CommanderLocationService service; private User admin,commander; private Province tucuman,caba,buenosAires,cordoba;
 private static long next=100;
 private static Province province(String name){Province p=new Province();p.setId(++next);p.setNombre(name);p.setActivo(true);return p;}
 private static User user(String username,String role,boolean withProfile){User u=new User();u.setId(++next);u.setUsername(username);u.setActivo(true);u.setEstadoCuenta("ACTIVO");Person p=new Person();p.setId(++next);p.setNombre(username);p.setApellido("Apellido");if(withProfile){CommanderProfile cp=new CommanderProfile();cp.setLicenseNumber("L-"+username);p.setCommanderProfile(cp);}u.setPerson(p);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;}

 @BeforeEach void setUp(){
  service=new CommanderLocationService(users,provinces,audit,clock);
  tucuman=province("Tucumán");caba=province("Ciudad Autónoma de Buenos Aires");buenosAires=province("Buenos Aires");cordoba=province("Córdoba");
  admin=user("admin","ADMINISTRADOR",false);commander=user("cmd","COMANDANTE",true);
  when(users.findById(admin.getId())).thenReturn(Optional.of(admin));when(users.lockWithPersonAndRolesById(commander.getId())).thenReturn(Optional.of(commander));
  for(Province p:List.of(tucuman,caba,buenosAires,cordoba))when(provinces.findById(p.getId())).thenReturn(Optional.of(p));
 }

 @Test void theProvinceIsSavedWithWhoAndWhenAndAuditedWithTheirPreviousValue(){
  CommanderLocationRow row=service.update(commander.getId(),tucuman.getId()," Cambio de base ",admin.getId());
  CommanderProfile profile=commander.getPerson().getCommanderProfile();
  assertSame(tucuman,profile.getProvinciaActual());assertSame(admin,profile.getUbicacionActualizadaPor());assertEquals(LocalDateTime.of(2026,11,2,12,0),profile.getUbicacionActualizadaEn());
  assertEquals("CONOCIDA",row.estadoUbicacion());assertEquals("Tucumán",row.provincia());
  ArgumentCaptor<String> before=ArgumentCaptor.forClass(String.class),after=ArgumentCaptor.forClass(String.class);
  verify(audit).record(isNull(),eq(admin),eq("COMMANDER_PROFILE"),eq(commander.getPerson().getId()),eq("COMMANDER_LOCATION_UPDATE"),before.capture(),after.capture());
  assertTrue(before.getValue().contains("\"provinciaActualId\":null"));assertTrue(after.getValue().contains("\"provinciaActual\":\"Tucumán\""));assertTrue(after.getValue().contains("\"motivo\":\"Cambio de base\""));
  assertFalse(after.getValue().contains("localidad"),"la ubicación operativa no registra una localidad");
 }
 @Test void aReasonWithQuotesAndLineBreaksStillProducesValidAuditJson() throws Exception {
  String reason="Cambio de base\n\"segundo turno\"\ty más";
  service.update(commander.getId(),tucuman.getId(),reason,admin.getId());
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class);verify(audit).record(isNull(),eq(admin),eq("COMMANDER_PROFILE"),any(),eq("COMMANDER_LOCATION_UPDATE"),anyString(),after.capture());
  var tree=new com.fasterxml.jackson.databind.ObjectMapper().readTree(after.getValue());
  assertEquals(reason,tree.get("motivo").asText());assertEquals("Tucumán",tree.get("provinciaActual").asText());
 }
 @Test void aSecondChangeRecordsThePreviousProvinceInTheAudit(){
  service.update(commander.getId(),cordoba.getId(),null,admin.getId());
  service.update(commander.getId(),tucuman.getId(),null,admin.getId());
  ArgumentCaptor<String> before=ArgumentCaptor.forClass(String.class);verify(audit,times(2)).record(isNull(),eq(admin),eq("COMMANDER_PROFILE"),any(),eq("COMMANDER_LOCATION_UPDATE"),before.capture(),anyString());
  assertTrue(before.getAllValues().get(1).contains("\"provinciaActual\":\"Córdoba\""));assertSame(tucuman,commander.getPerson().getCommanderProfile().getProvinciaActual());
 }
 @Test void cabaAndTheProvinceOfBuenosAiresAreDifferentJurisdictions(){
  service.update(commander.getId(),caba.getId(),null,admin.getId());
  assertSame(caba,commander.getPerson().getCommanderProfile().getProvinciaActual());
  service.update(commander.getId(),buenosAires.getId(),null,admin.getId());
  assertSame(buenosAires,commander.getPerson().getCommanderProfile().getProvinciaActual());assertNotEquals(caba.getId(),commander.getPerson().getCommanderProfile().getProvinciaActual().getId());
 }
 @Test void aNullProvinceMarksTheLocationAsUnknownAndKeepsWhoAndWhen(){
  service.update(commander.getId(),tucuman.getId(),null,admin.getId());
  CommanderLocationRow row=service.update(commander.getId(),null,"Sin información de la base",admin.getId());
  CommanderProfile profile=commander.getPerson().getCommanderProfile();
  assertNull(profile.getProvinciaActual());assertEquals("DESCONOCIDA",row.estadoUbicacion());assertSame(admin,profile.getUbicacionActualizadaPor());assertNotNull(profile.getUbicacionActualizadaEn());
 }
 @Test void aMissingOrDisabledProvinceIsRejectedAndNothingChanges(){
  ApiException missing=assertThrows(ApiException.class,()->service.update(commander.getId(),999999L,null,admin.getId()));assertEquals(HttpStatus.BAD_REQUEST,missing.status());
  tucuman.setActivo(false);
  ApiException closed=assertThrows(ApiException.class,()->service.update(commander.getId(),tucuman.getId(),null,admin.getId()));assertEquals(HttpStatus.BAD_REQUEST,closed.status());assertTrue(closed.getMessage().contains("deshabilitada"));
  assertNull(commander.getPerson().getCommanderProfile().getProvinciaActual());verifyNoInteractions(audit);
 }
 @Test void onlyACommanderWithAnActiveAccountHasALocation(){
  User plain=user("plain","DTS",false);when(users.lockWithPersonAndRolesById(plain.getId())).thenReturn(Optional.of(plain));
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.update(plain.getId(),tucuman.getId(),null,admin.getId())).status());
  commander.setActivo(false);
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.update(commander.getId(),tucuman.getId(),null,admin.getId())).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.update(555555L,tucuman.getId(),null,admin.getId())).status());
 }
 @Test void aCommanderWithoutLocationIsReportedAsUnknownAndOneWithAProvinceAsKnown(){
  assertEquals("DESCONOCIDA",CommanderLocationService.row(commander).estadoUbicacion());
  commander.getPerson().getCommanderProfile().setProvinciaActual(tucuman);
  assertEquals("CONOCIDA",CommanderLocationService.row(commander).estadoUbicacion());
 }
}
