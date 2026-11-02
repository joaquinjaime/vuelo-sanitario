package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.CommanderLocationDtos.CommanderLocationRow;
import com.vuelossanitarios.backend.domain.catalog.Locality;
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

/** Ubicación operativa del comandante: validaciones de catálogo, persistencia de quién y cuándo, y auditoría. */
class CommanderLocationServiceTest {
 private final UserRepository users=mock(UserRepository.class); private final LocalityRepository localities=mock(LocalityRepository.class); private final ProvinceRepository provinces=mock(ProvinceRepository.class);
 private final AuditService audit=mock(AuditService.class); private final Clock clock=Clock.fixed(Instant.parse("2026-11-02T15:00:00Z"),ZoneId.of("America/Argentina/Tucuman"));
 private CommanderLocationService service; private User admin,commander; private Province tucuman,buenosAires; private Locality capital,matanza;
 private static long next=100;
 private static Province province(String name){Province p=new Province();p.setId(++next);p.setNombre(name);p.setActivo(true);return p;}
 private static Locality locality(String name,Province p){Locality l=new Locality();l.setId(++next);l.setNombre(name);l.setProvincia(p);l.setActivo(true);return l;}
 private static User user(String username,String role,boolean withProfile){User u=new User();u.setId(++next);u.setUsername(username);u.setActivo(true);u.setEstadoCuenta("ACTIVO");Person p=new Person();p.setId(++next);p.setNombre(username);p.setApellido("Apellido");if(withProfile){CommanderProfile cp=new CommanderProfile();cp.setLicenseNumber("L-"+username);p.setCommanderProfile(cp);}u.setPerson(p);Role r=new Role();r.setCodigo(role);UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;}

 @BeforeEach void setUp(){
  service=new CommanderLocationService(users,localities,provinces,audit,clock);
  tucuman=province("Tucumán");buenosAires=province("Buenos Aires");capital=locality("San Miguel de Tucumán",tucuman);matanza=locality("La Matanza",buenosAires);
  admin=user("admin","ADMINISTRADOR",false);commander=user("cmd","COMANDANTE",true);
  when(users.findById(admin.getId())).thenReturn(Optional.of(admin));when(users.lockWithPersonAndRolesById(commander.getId())).thenReturn(Optional.of(commander));
  when(localities.lockById(capital.getId())).thenReturn(Optional.of(capital));when(localities.lockById(matanza.getId())).thenReturn(Optional.of(matanza));
 }

 @Test void theLocationIsSavedWithWhoAndWhenAndAuditedWithTheirPreviousValue(){
  CommanderLocationRow row=service.update(commander.getId(),tucuman.getId(),capital.getId()," Cambio de base ",admin.getId());
  CommanderProfile profile=commander.getPerson().getCommanderProfile();
  assertSame(capital,profile.getLocalidadActual());assertSame(tucuman,profile.getProvinciaActual());assertSame(admin,profile.getUbicacionActualizadaPor());assertEquals(LocalDateTime.of(2026,11,2,12,0),profile.getUbicacionActualizadaEn());
  assertEquals("CONOCIDA",row.estadoUbicacion());assertEquals("San Miguel de Tucumán",row.localidad());assertEquals("Tucumán",row.provincia());
  ArgumentCaptor<String> before=ArgumentCaptor.forClass(String.class),after=ArgumentCaptor.forClass(String.class);
  verify(audit).record(isNull(),eq(admin),eq("COMMANDER_PROFILE"),eq(commander.getPerson().getId()),eq("COMMANDER_LOCATION_UPDATE"),before.capture(),after.capture());
  assertTrue(before.getValue().contains("\"localidadActualId\":null"));assertTrue(after.getValue().contains("\"localidadActual\":\"San Miguel de Tucumán\""));assertTrue(after.getValue().contains("\"motivo\":\"Cambio de base\""));
 }
 @Test void aReasonWithQuotesAndLineBreaksStillProducesValidAuditJson() throws Exception {
  String reason="Cambio de base\n\"segundo turno\"\ty más";
  service.update(commander.getId(),tucuman.getId(),capital.getId(),reason,admin.getId());
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class);verify(audit).record(isNull(),eq(admin),eq("COMMANDER_PROFILE"),any(),eq("COMMANDER_LOCATION_UPDATE"),anyString(),after.capture());
  var tree=new com.fasterxml.jackson.databind.ObjectMapper().readTree(after.getValue());
  assertEquals(reason,tree.get("motivo").asText());assertEquals("San Miguel de Tucumán",tree.get("localidadActual").asText());
 }
 @Test void aSecondChangeRecordsThePreviousLocationInTheAudit(){
  service.update(commander.getId(),tucuman.getId(),capital.getId(),null,admin.getId());
  service.update(commander.getId(),buenosAires.getId(),matanza.getId(),null,admin.getId());
  ArgumentCaptor<String> before=ArgumentCaptor.forClass(String.class);verify(audit,times(2)).record(isNull(),eq(admin),eq("COMMANDER_PROFILE"),any(),eq("COMMANDER_LOCATION_UPDATE"),before.capture(),anyString());
  assertTrue(before.getAllValues().get(1).contains("\"localidadActual\":\"San Miguel de Tucumán\""));assertSame(matanza,commander.getPerson().getCommanderProfile().getLocalidadActual());
 }
 @Test void aLocalityThatDoesNotBelongToTheIndicatedProvinceIsRejectedAndNothingChanges(){
  ApiException e=assertThrows(ApiException.class,()->service.update(commander.getId(),tucuman.getId(),matanza.getId(),null,admin.getId()));
  assertEquals(HttpStatus.BAD_REQUEST,e.status());assertTrue(e.getMessage().contains("no pertenece a la provincia"));
  assertNull(commander.getPerson().getCommanderProfile().getLocalidadActual());verifyNoInteractions(audit);
 }
 @Test void aMissingOrDeactivatedLocalityIsRejected(){
  ApiException missing=assertThrows(ApiException.class,()->service.update(commander.getId(),tucuman.getId(),999999L,null,admin.getId()));assertEquals(HttpStatus.BAD_REQUEST,missing.status());
  capital.setActivo(false);
  ApiException closed=assertThrows(ApiException.class,()->service.update(commander.getId(),tucuman.getId(),capital.getId(),null,admin.getId()));assertEquals(HttpStatus.BAD_REQUEST,closed.status());assertTrue(closed.getMessage().contains("deshabilitada"));
  assertNull(commander.getPerson().getCommanderProfile().getLocalidadActual());verifyNoInteractions(audit);
 }
 @Test void aDisabledProvinceIsRejected(){
  tucuman.setActivo(false);
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.update(commander.getId(),tucuman.getId(),capital.getId(),null,admin.getId())).status());
 }
 @Test void onlyACommanderWithAnActiveAccountHasALocation(){
  User plain=user("plain","DTS",false);when(users.lockWithPersonAndRolesById(plain.getId())).thenReturn(Optional.of(plain));
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.update(plain.getId(),tucuman.getId(),capital.getId(),null,admin.getId())).status());
  commander.setActivo(false);
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.update(commander.getId(),tucuman.getId(),capital.getId(),null,admin.getId())).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.update(555555L,tucuman.getId(),capital.getId(),null,admin.getId())).status());
 }
 @Test void theLegacyProvinceOnlyContractLeavesTheLocalityUnknown(){
  service.update(commander.getId(),tucuman.getId(),capital.getId(),null,admin.getId());
  when(provinces.findById(buenosAires.getId())).thenReturn(Optional.of(buenosAires));
  CommanderLocationRow row=service.updateProvinceOnly(commander.getId(),buenosAires.getId(),admin.getId());
  CommanderProfile profile=commander.getPerson().getCommanderProfile();
  assertNull(profile.getLocalidadActual());assertSame(buenosAires,profile.getProvinciaActual());assertNull(profile.getUbicacionActualizadaEn());assertEquals("SOLO_PROVINCIA",row.estadoUbicacion());
 }
 @Test void aCommanderWithoutLocationIsReportedAsUnknownAndADeactivatedLocalityAsSuch(){
  assertEquals("DESCONOCIDA",CommanderLocationService.row(commander).estadoUbicacion());
  CommanderProfile profile=commander.getPerson().getCommanderProfile();profile.setProvinciaActual(tucuman);profile.setLocalidadActual(capital);capital.setActivo(false);
  assertEquals("LOCALIDAD_DESHABILITADA",CommanderLocationService.row(commander).estadoUbicacion());
 }
}
