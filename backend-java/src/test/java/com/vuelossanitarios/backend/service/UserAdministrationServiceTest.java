package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.security.JwtService;
import java.time.*;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Reglas del ciclo administrativo de usuarios: identidad única, roles, bajas, restablecimientos y auditoría sin secretos. */
class UserAdministrationServiceTest {
 @Mock UserRepository users; @Mock PersonRepository persons; @Mock RoleRepository roles; @Mock UserRoleRepository userRoles; @Mock EmailContactRepository emails; @Mock PhoneContactRepository phones; @Mock AccountActivationRepository activations; @Mock CommanderProfileRepository commanderProfiles;
 @Mock AuditService audit; @Mock PasswordEncoder encoder; @Mock JwtService jwt; @Mock UserResponsibilityService responsibilities; @Mock UserDirectoryRepository directory;
 final Clock clock=Clock.fixed(Instant.parse("2026-10-22T15:00:00Z"),ZoneId.of("America/Argentina/Tucuman")); // 12:00 locales
 AuthService service;
 @BeforeEach void init(){MockitoAnnotations.openMocks(this);service=new AuthService(users,persons,roles,userRoles,emails,phones,activations,commanderProfiles,audit,encoder,jwt,clock,responsibilities,directory);
  when(roles.findByCodigo(anyString())).thenAnswer(x->Optional.of(role(x.getArgument(0))));when(encoder.encode(anyString())).thenAnswer(x->"hash:"+x.getArgument(0));
  when(persons.save(any())).thenAnswer(x->{((Person)x.getArgument(0)).setId(ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE));return x.getArgument(0);});when(users.save(any())).thenAnswer(x->{((User)x.getArgument(0)).setId(ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE));return x.getArgument(0);});
  when(responsibilities.deactivationBlockers(anyLong())).thenReturn(List.of());when(responsibilities.roleRemovalBlockers(anyLong(),anyString())).thenReturn(List.of());}
 private Role role(String code){Role r=new Role();r.setCodigo(code);r.setActivo(true);return r;}
 private User account(String... codes){Person p=new Person();p.setId(ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE));p.setNombre("Ana");p.setApellido("Pérez");p.setDni("30111222");User u=new User();u.setId(ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE));u.setPerson(p);u.setUsername("ana"+u.getId());u.setActivo(true);u.setEstadoCuenta("ACTIVO");u.setPasswordHash("hash:old");
  Set<UserRole> rs=new HashSet<>();for(String c:codes)rs.add(new UserRole(u,role(c)));u.setUserRoles(rs);return u;}
 private CreatePendingUserRequest create(String name,String lastName,String dni,Long personId){return new CreatePendingUserRequest(name,lastName,dni,null,null,Set.of("DTS"),List.of(new ContactRequest("a@example.test","PERSONAL")),List.of(new PhoneRequest("3815555555","AR","PERSONAL")),personId);}
 private ApiException thrown(org.junit.jupiter.api.function.Executable e){return assertThrows(ApiException.class,e);}

 // ---------- identidad única ----------
 @Test void aKnownPersonWithoutAnAccountRequiresExplicitConfirmationAndDoesNotRevealNames(){
  Person known=new Person();known.setId(7L);known.setNombre("Ana");known.setApellido("Pérez");known.setDni("30111222");when(persons.existsByDni("30111222")).thenReturn(true);when(persons.findByDni("30111222")).thenReturn(Optional.of(known));
  ApiException e=thrown(()->service.createPending(create("Ana","Pérez","30.111.222",null),1L));assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("PERSON_EXISTS_WITHOUT_ACCOUNT",e.code());assertEquals(true,e.details().get("coincideNombre"));assertEquals(7L,e.details().get("personaId"));
  assertFalse(e.details().containsKey("nombre")||e.details().containsKey("apellido"));verify(persons,never()).save(any());
 }
 @Test void confirmedLinkReusesTheSamePersonAndKeepsItsMainContacts(){
  Person known=new Person();known.setId(7L);known.setNombre("Ana");known.setApellido("Pérez");known.setDni("30111222");when(persons.existsByDni("30111222")).thenReturn(true);when(persons.findByDni("30111222")).thenReturn(Optional.of(known));
  EmailContact mainEmail=new EmailContact();mainEmail.setDireccion("principal@example.test");mainEmail.setPrincipal(true);when(emails.findActiveByPersonId(7L)).thenReturn(List.of(mainEmail));when(phones.findActiveByPersonId(7L)).thenReturn(List.of());
  service.createPending(create(" ana ","PEREZ","30111222",7L),null);   // mayúsculas y acentos no cambian la identidad
  verify(persons,never()).save(any());ArgumentCaptor<User> created=ArgumentCaptor.forClass(User.class);verify(users).save(created.capture());assertSame(known,created.getValue().getPerson());
  ArgumentCaptor<EmailContact> email=ArgumentCaptor.forClass(EmailContact.class);verify(emails).save(email.capture());assertFalse(email.getValue().getPrincipal(),"no se disputa el contacto principal existente");
  ArgumentCaptor<PhoneContact> phone=ArgumentCaptor.forClass(PhoneContact.class);verify(phones).save(phone.capture());assertTrue(phone.getValue().getPrincipal());
  verify(audit).record(isNull(),isNull(),eq("USER"),any(),eq("USUARIO_CREADO"),isNull(),contains("\"personaExistente\":true"));
 }
 @Test void aDifferentNameOrIdentifierIsNeverMergedAutomatically(){
  Person known=new Person();known.setId(7L);known.setNombre("Ana");known.setApellido("Pérez");known.setDni("30111222");when(persons.existsByDni("30111222")).thenReturn(true);when(persons.findByDni("30111222")).thenReturn(Optional.of(known));
  assertEquals("PERSON_IDENTITY_MISMATCH",thrown(()->service.createPending(create("Beto","López","30111222",7L),1L)).code());
  assertEquals("PERSON_IDENTITY_MISMATCH",thrown(()->service.createPending(create("Ana","Pérez","30111222",8L),1L)).code());
  assertEquals("PERSON_IDENTITY_MISMATCH",thrown(()->service.createPending(create("Ana","Pérez","40999888",7L),1L)).code(),"el identificador no corresponde a ninguna persona con ese DNI");
  verify(users,never()).save(any());
 }
 @Test void aSimultaneousCreationLosingTheUniqueIndexRaceIsAConflictNotAServerError(){
  doThrow(new DataIntegrityViolationException("uq_personas_dni")).when(persons).flush();
  ApiException e=thrown(()->service.createPending(create("Ana","Pérez","30111222",null),1L));assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("USER_DNI_ALREADY_EXISTS",e.code());
  reset(persons);when(persons.save(any())).thenAnswer(x->x.getArgument(0));doThrow(new DataIntegrityViolationException("uq_usuarios_nombre_usuario")).when(users).flush();
  AccountActivation a=new AccountActivation();User pending=account("DTS");pending.setUsername(null);pending.setEstadoCuenta("PENDIENTE_ACTIVACION");a.setUser(pending);a.setTokenHash("h");a.setExpiresAt(LocalDateTime.now(clock).plusHours(1));when(activations.findOpenByDni("30111222")).thenReturn(List.of(a));when(encoder.matches("codigo","h")).thenReturn(true);
  ApiException dup=thrown(()->service.activate(new ActivateAccountRequest("30111222","codigo","ana","ClaveSegura-1234","ClaveSegura-1234")));assertEquals(HttpStatus.CONFLICT,dup.status());assertEquals("USERNAME_ALREADY_EXISTS",dup.code());
 }
 @Test void activationUsesTheBusinessClockAndRecordsTheAccountOwnerAsResponsible(){
  User pending=account("DTS");pending.setUsername(null);pending.setEstadoCuenta("PENDIENTE_ACTIVACION");AccountActivation a=new AccountActivation();a.setUser(pending);a.setTokenHash("h");
  a.setExpiresAt(LocalDateTime.of(2026,10,22,12,0,1));when(activations.findOpenByDni("30111222")).thenReturn(List.of(a));when(encoder.matches("codigo","h")).thenReturn(true);   // vence un segundo después de las 12:00 locales
  service.activate(new ActivateAccountRequest("30111222","codigo","ana.nueva","ClaveSegura-1234","ClaveSegura-1234"));assertEquals("ACTIVO",pending.getEstadoCuenta());assertEquals(LocalDateTime.of(2026,10,22,12,0),a.getUsedAt());
  verify(audit).record(isNull(),same(pending),eq("USER"),eq(pending.getId()),eq("USUARIO_ACTIVADO"),isNull(),isNull());
 }

 // ---------- roles ----------
 @Test void changingRolesInvalidatesCredentialsAndRecordsBeforeAndAfter(){
  User target=account("DTS");target.setVersionCredenciales(3L);when(users.findWithPersonById(target.getId())).thenReturn(Optional.of(target));
  service.updateUser(target.getId(),new UpdateUserRequest("Ana","Pérez",null,null,Set.of("CENTRO_OPERACIONES","DTS"),true),ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE));
  assertEquals(4L,target.getVersionCredenciales());verify(users).lockById(target.getId());
  verify(audit).record(isNull(),isNull(),eq("USER_ROLE"),eq(target.getId()),eq("UPDATE"),eq("{\"roles\":[\"DTS\"]}"),eq("{\"roles\":[\"CENTRO_OPERACIONES\",\"DTS\"]}"));
 }
 @Test void editingOnlyPersonalDataKeepsTheSessionsAndAuditsTheChange(){
  User target=account("DTS");target.setVersionCredenciales(3L);when(users.findWithPersonById(target.getId())).thenReturn(Optional.of(target));
  service.updateUser(target.getId(),new UpdateUserRequest("Ana María","Pérez",LocalDate.of(1990,1,2),null,Set.of("DTS"),true),ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE));
  assertEquals(3L,target.getVersionCredenciales(),"sin cambio de roles no se cierran las sesiones");assertEquals("Ana María",target.getPerson().getNombre());assertEquals("30111222",target.getPerson().getDni(),"el DNI no se modifica desde la administración");
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class);verify(audit).record(isNull(),isNull(),eq("USER"),eq(target.getId()),eq("USUARIO_ACTUALIZADO"),contains("\"nombre\":\"Ana\""),after.capture());assertTrue(after.getValue().contains("Ana María")&&after.getValue().contains("1990-01-02"));assertFalse(after.getValue().contains("30111222"));
  verify(audit,never()).record(any(),any(),eq("USER_ROLE"),any(),any(),any(),any());
 }
 @Test void removingARoleWithOperationalResponsibilitiesIsRejectedBeforeAnyChange(){
  User target=account("COMANDANTE");target.setVersionCredenciales(3L);when(users.findWithPersonById(target.getId())).thenReturn(Optional.of(target));
  Blocker blocker=new Blocker("COMANDANTE_ASIGNADO",9L,"V-9","Comandante asignado al vuelo V-9 (PLANIFICADO)");when(responsibilities.roleRemovalBlockers(target.getId(),"COMANDANTE")).thenReturn(List.of(blocker));
  doCallRealMethod().when(responsibilities).requireNone(anyList(),anyString(),anyString());
  ApiException e=thrown(()->service.updateUser(target.getId(),new UpdateUserRequest("Ana","Pérez",null,null,Set.of("DTS"),true),ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE)));assertEquals(HttpStatus.CONFLICT,e.status());assertEquals("USER_ROLE_HAS_OPERATIONAL_ASSIGNMENTS",e.code());assertEquals(List.of(blocker),e.details().get("impedimentos"));
  assertEquals(3L,target.getVersionCredenciales());assertTrue(target.getUserRoles().stream().anyMatch(r->"COMANDANTE".equals(r.getRole().getCodigo())));verify(userRoles,never()).deleteAll(any());verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void rolesOfADeactivatedAccountAreDefinedAtReactivationAndUnknownRolesAreRejected(){
  User target=account("DTS");target.setActivo(false);target.setEstadoCuenta("DESACTIVADO");when(users.findWithPersonById(target.getId())).thenReturn(Optional.of(target));
  assertEquals("USER_INACTIVE_ROLES",thrown(()->service.updateUser(target.getId(),new UpdateUserRequest("Ana","Pérez",null,null,Set.of("COMANDANTE"),false),1L)).code());
  when(roles.findByCodigo("INEXISTENTE")).thenReturn(Optional.empty());User ok=account("DTS");when(users.findWithPersonById(ok.getId())).thenReturn(Optional.of(ok));
  assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.updateUser(ok.getId(),new UpdateUserRequest("Ana","Pérez",null,null,Set.of("INEXISTENTE"),true),1L)).status());
 }

 // ---------- baja y reactivación ----------
 @Test void deactivationRecordsWhoWhenAndWhyReleasesLocksAndClosesSessions(){
  User target=account("DTS");target.setVersionCredenciales(4L);User actor=account("ADMINISTRADOR");when(users.lockWithPersonAndRolesById(target.getId())).thenReturn(Optional.of(target));when(users.findById(actor.getId())).thenReturn(Optional.of(actor));when(responsibilities.releaseDocumentLocks(target.getId())).thenReturn(2);
  service.deactivateUser(target.getId(),actor.getId(),"  fin de contrato ");
  assertFalse(target.getActivo());assertEquals(LocalDateTime.of(2026,10,22,12,0),target.getFechaBaja(),"hora civil de negocio");assertSame(actor,target.getBajaPor());assertEquals("fin de contrato",target.getMotivoBaja());assertEquals(5L,target.getVersionCredenciales());
  verify(audit).record(isNull(),same(actor),eq("USER"),eq(target.getId()),eq("USUARIO_DESACTIVADO"),isNull(),eq("{\"motivo\":\"fin de contrato\",\"bloqueosDocumentalesLiberados\":2}"));
 }
 @Test void deactivationWithBlockersChangesNothingAndListsTheFlights(){
  User target=account("COMANDANTE");target.setVersionCredenciales(4L);when(users.lockWithPersonAndRolesById(target.getId())).thenReturn(Optional.of(target));
  Blocker b1=new Blocker("COMANDANTE_ASIGNADO",1L,"V-1","a"),b2=new Blocker("INFORME_FINAL_PENDIENTE",2L,"V-2","b");when(responsibilities.deactivationBlockers(target.getId())).thenReturn(List.of(b1,b2));doCallRealMethod().when(responsibilities).requireNone(anyList(),anyString(),anyString());
  ApiException e=thrown(()->service.deactivateUser(target.getId(),ThreadLocalRandom.current().nextLong(1,Long.MAX_VALUE),"x"));assertEquals("USER_HAS_OPERATIONAL_ASSIGNMENTS",e.code());assertEquals(List.of(b1,b2),e.details().get("impedimentos"));
  assertTrue(target.getActivo());assertEquals(4L,target.getVersionCredenciales());assertNull(target.getFechaBaja());verify(responsibilities,never()).releaseDocumentLocks(anyLong());verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }
 @Test void reactivationClearsTheBajaDataKeepsTheSameAccountAndNeverAuditsTheTemporaryPassword(){
  User target=account("DTS");target.setActivo(false);target.setEstadoCuenta("DESACTIVADO");target.setFechaBaja(LocalDateTime.of(2026,1,1,0,0));target.setMotivoBaja("x");target.setBajaPor(account("ADMINISTRADOR"));target.setVersionCredenciales(8L);when(users.lockWithPersonAndRolesById(target.getId())).thenReturn(Optional.of(target));
  ReactivationResponse r=service.reactivateUser(target.getId(),new ReactivateUserRequest("Ana","Pérez",null,null,Set.of("DTS")),5L);
  assertNull(target.getFechaBaja());assertNull(target.getMotivoBaja());assertNull(target.getBajaPor());assertTrue(target.getDebeCambiarContrasena());assertEquals(9L,target.getVersionCredenciales());assertEquals("hash:"+r.contrasenaTemporal(),target.getPasswordHash());
  ArgumentCaptor<String> values=ArgumentCaptor.forClass(String.class);verify(audit,atLeastOnce()).record(any(),any(),any(),any(),any(),any(),values.capture());for(String v:values.getAllValues())assertTrue(v==null||(!v.contains(r.contrasenaTemporal())&&!v.contains("hash:")),"auditoría sin secretos: "+v);
 }

 // ---------- credenciales ----------
 @Test void generatedResetReturnsTheSecretOnceStoresOnlyTheHashAndRejectsSelfAndInactiveTargets(){
  User target=account("DTS");target.setVersionCredenciales(2L);when(users.lockWithPersonAndRolesById(target.getId())).thenReturn(Optional.of(target));
  CredentialResetResponse r=service.resetCredentials(target.getId(),99L);assertTrue(r.contrasenaTemporal().length()>=12);assertEquals("hash:"+r.contrasenaTemporal(),target.getPasswordHash());assertTrue(target.getDebeCambiarContrasena());assertEquals(3L,target.getVersionCredenciales());
  ArgumentCaptor<String> values=ArgumentCaptor.forClass(String.class);verify(audit).record(any(),any(),eq("USER"),eq(target.getId()),eq("CONTRASENA_RESTABLECIDA"),isNull(),values.capture());assertFalse(values.getValue().contains(r.contrasenaTemporal()));
  assertEquals("CANNOT_RESET_SELF",thrown(()->service.resetCredentials(target.getId(),target.getId())).code());
  User off=account("DTS");off.setActivo(false);when(users.lockWithPersonAndRolesById(off.getId())).thenReturn(Optional.of(off));assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.resetCredentials(off.getId(),99L)).status());
  assertEquals("CANNOT_RESET_SELF",thrown(()->service.setTemporaryPassword(target.getId(),new TemporaryPasswordRequest("ClaveSegura-1234"),target.getId())).code());
 }
 @Test void ownPasswordChangeRequiresADifferentPasswordAuditsWithoutSecretsAndClosesOlderSessions(){
  User u=account("DTS");u.setDebeCambiarContrasena(true);u.setVersionCredenciales(5L);when(users.findWithPersonById(u.getId())).thenReturn(Optional.of(u));when(encoder.matches("Temporal-12345","hash:old")).thenReturn(true);
  assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.changePassword(u.getId(),new ChangePasswordRequest("Temporal-12345","Temporal-12345","Temporal-12345"))).status());assertEquals(5L,u.getVersionCredenciales());
  service.changePassword(u.getId(),new ChangePasswordRequest("Temporal-12345","Definitiva-1234","Definitiva-1234"));assertFalse(u.getDebeCambiarContrasena());assertEquals(6L,u.getVersionCredenciales());
  verify(audit).record(isNull(),same(u),eq("USER"),eq(u.getId()),eq("CONTRASENA_CAMBIADA"),isNull(),eq("{\"origen\":\"obligatorio\"}"));
 }

 // ---------- consulta ----------
 @Test void searchValidatesItsParametersAndNeverRunsAnUnboundedQuery(){
  for(Integer size:new Integer[]{0,101,-1})assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.search(null,null,null,0,size)).status());
  assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.search(null,null,null,-1,10)).status());assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.search(null,null,"ROTO",0,10)).status());assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.search(null,"a b",null,0,10)).status());
  assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.search("x".repeat(101),null,null,0,10)).status());assertEquals(HttpStatus.BAD_REQUEST,thrown(()->service.search(null,null,null,1000,100)).status());verify(directory,never()).count(any());
  when(directory.count(any())).thenReturn(0L);UserPage empty=service.search(" ana ","comandante","inactivos",0,20);assertEquals(0,empty.total());assertEquals(0,empty.totalPages());
  ArgumentCaptor<UserDirectoryRepository.Filter> filter=ArgumentCaptor.forClass(UserDirectoryRepository.Filter.class);verify(directory).count(filter.capture());assertEquals("ana",filter.getValue().text());assertEquals("COMANDANTE",filter.getValue().role());assertEquals("INACTIVOS",filter.getValue().status());
 }
}
