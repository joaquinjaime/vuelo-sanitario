package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.*;
import com.vuelossanitarios.backend.repository.*;
import com.vuelossanitarios.backend.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AuthServiceTest {
 @Mock UserRepository users; @Mock PersonRepository persons; @Mock RoleRepository roles; @Mock UserRoleRepository userRoles; @Mock EmailContactRepository emails; @Mock PhoneContactRepository phones; @Mock AccountActivationRepository activations; @Mock PasswordEncoder encoder; @Mock JwtService jwt;
 AuthService service;
 @BeforeEach void init(){MockitoAnnotations.openMocks(this);service=new AuthService(users,persons,roles,userRoles,emails,phones,activations,encoder,jwt);when(roles.findByCodigo(anyString())).thenReturn(Optional.of(new Role()));when(encoder.encode(anyString())).thenAnswer(x->"hash:"+x.getArgument(0));}
 CreatePendingUserRequest request(Set<String> role,List<ContactRequest> es,List<PhoneRequest> ps){return new CreatePendingUserRequest("Ana","Pérez","123",null,role.contains("COMANDANTE")?"LIC-1":null,role,es,ps);}
 List<ContactRequest> email(){return List.of(new ContactRequest("ana@example.test","PERSONAL"));} List<PhoneRequest> phone(){return List.of(new PhoneRequest("3815555555","PERSONAL"));}
 @Test void createPendingRequiresEmail(){ApiException e=assertThrows(ApiException.class,()->service.createPending(request(Set.of("DTS"),List.of(),phone()),null));assertEquals(HttpStatus.BAD_REQUEST,e.status());}
 @Test void createPendingRequiresPhone(){assertThrows(ApiException.class,()->service.createPending(request(Set.of("DTS"),email(),List.of()),null));}
 @Test void createPendingRejectsDuplicateDni(){when(persons.existsByDni("123")).thenReturn(true);ApiException e=assertThrows(ApiException.class,()->service.createPending(request(Set.of("DTS"),email(),phone()),null));assertEquals(HttpStatus.CONFLICT,e.status());}
 @Test void administratorCannotCombineOperationalRoles(){assertThrows(ApiException.class,()->service.createPending(request(Set.of("ADMINISTRADOR","COMANDANTE"),email(),phone()),null));}
 @Test void operationalRolesCanCombine(){when(persons.save(any())).thenAnswer(x->{((Person)x.getArgument(0)).setId(UUID.randomUUID());return x.getArgument(0);});when(users.save(any())).thenAnswer(x->{((User)x.getArgument(0)).setId(UUID.randomUUID());return x.getArgument(0);});ActivationCodeResponse response=service.createPending(request(Set.of("COMANDANTE","OPERACIONES"),email(),phone()),null);assertNotNull(response.codigo());verify(userRoles,times(2)).save(any());}
 @Test void generatedActivationIsNeverStoredPlain(){when(persons.save(any())).thenAnswer(x->{((Person)x.getArgument(0)).setId(UUID.randomUUID());return x.getArgument(0);});when(users.save(any())).thenAnswer(x->{((User)x.getArgument(0)).setId(UUID.randomUUID());return x.getArgument(0);});ActivationCodeResponse response=service.createPending(request(Set.of("DTS"),email(),phone()),null);ArgumentCaptor<AccountActivation> captor=ArgumentCaptor.forClass(AccountActivation.class);verify(activations).save(captor.capture());assertNotEquals(response.codigo(),captor.getValue().getTokenHash());assertEquals(24,Duration.between(captor.getValue().getCreatedAt(),captor.getValue().getExpiresAt()).toHours());}
 private AccountActivation pending(String hash, LocalDateTime expires){Person p=new Person();p.setDni("123");p.setId(UUID.randomUUID());User u=new User();u.setId(UUID.randomUUID());u.setPerson(p);u.setActivo(true);u.setEstadoCuenta("PENDIENTE_ACTIVACION");AccountActivation a=new AccountActivation();a.setUser(u);a.setTokenHash(hash);a.setCreatedAt(LocalDateTime.now().minusHours(1));a.setExpiresAt(expires);return a;}
 @Test void correctActivationSetsUsernameAndHashedPassword(){AccountActivation a=pending("stored",LocalDateTime.now().plusHours(1));when(activations.findOpenByDni("123")).thenReturn(List.of(a));when(encoder.matches("code","stored")).thenReturn(true);service.activate(new ActivateAccountRequest("123","code","ana","NewPassword123","NewPassword123"));assertEquals("ACTIVO",a.getUser().getEstadoCuenta());assertEquals("ana",a.getUser().getUsername());assertEquals("hash:NewPassword123",a.getUser().getPasswordHash());assertNotNull(a.getUsedAt());}
 @Test void invalidCodeIsRejected(){AccountActivation a=pending("stored",LocalDateTime.now().plusHours(1));when(activations.findOpenByDni("123")).thenReturn(List.of(a));when(encoder.matches("bad","stored")).thenReturn(false);assertThrows(ApiException.class,()->service.activate(new ActivateAccountRequest("123","bad","ana","NewPassword123","NewPassword123")));}
 @Test void expiredCodeIsRejectedWithoutWaiting(){AccountActivation a=pending("stored",LocalDateTime.now().minusNanos(1));when(activations.findOpenByDni("123")).thenReturn(List.of(a));when(encoder.matches(anyString(),anyString())).thenReturn(true);assertThrows(ApiException.class,()->service.activate(new ActivateAccountRequest("123","code","ana","NewPassword123","NewPassword123")));}
 @Test void reusedCodeIsRejected(){when(activations.findOpenByDni("123")).thenReturn(List.of());assertThrows(ApiException.class,()->service.activate(new ActivateAccountRequest("123","code","ana","NewPassword123","NewPassword123")));}
 @Test void duplicateUsernameIsRejected(){AccountActivation a=pending("stored",LocalDateTime.now().plusHours(1));when(activations.findOpenByDni("123")).thenReturn(List.of(a));when(encoder.matches(anyString(),anyString())).thenReturn(true);when(users.existsByUsername("ana")).thenReturn(true);ApiException e=assertThrows(ApiException.class,()->service.activate(new ActivateAccountRequest("123","code","ana","NewPassword123","NewPassword123")));assertEquals(HttpStatus.CONFLICT,e.status());}
 @Test void regenerationInvalidatesOldCode(){User u=pending("x",LocalDateTime.now().plusHours(1)).getUser();when(users.findWithPersonById(u.getId())).thenReturn(Optional.of(u));AccountActivation old=pending("old",LocalDateTime.now().plusHours(1));old.setUser(u);when(activations.findOpenByUserId(u.getId())).thenReturn(List.of(old));service.regenerate(u.getId(),null);assertNotNull(old.getUsedAt());verify(activations).save(any(AccountActivation.class));}
 @Test void temporaryPasswordRequiresChangeAndOwnChangeClearsIt(){User u=pending("x",LocalDateTime.now().plusHours(1)).getUser();u.setUsername("ana");u.setPasswordHash("old");when(users.findWithPersonById(u.getId())).thenReturn(Optional.of(u));service.setTemporaryPassword(u.getId(),new TemporaryPasswordRequest("Temporary123"));assertTrue(u.getDebeCambiarContrasena());when(encoder.matches("Temporary123","hash:Temporary123")).thenReturn(true);service.changePassword(u.getId(),new ChangePasswordRequest("Temporary123","Permanent123","Permanent123"));assertFalse(u.getDebeCambiarContrasena());assertEquals("hash:Permanent123",u.getPasswordHash());}
}
