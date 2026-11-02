package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.dto.CrewRequirementDtos.RequirementView;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.flight.CrewQualification;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.Role;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

/**
 * El motivo que ve Centro de Operaciones y el informe de requisitos que ve el administrador salen de la misma evaluación que decide la asignación:
 * lista cada requisito (sin cortar en el primero que falta) y coincide siempre con {@link CrewManagementService#evaluateOn}.
 */
class CrewRequirementsTest {
 private final CrewQualificationRepository qualifications=mock(CrewQualificationRepository.class);
 private final ProfessionalCredentialService credentials=mock(ProfessionalCredentialService.class);
 private final UserRepository users=mock(UserRepository.class);
 private final CrewRoleRepository roles=mock(CrewRoleRepository.class);
 private CrewManagementService service;
 private final LocalDate on=LocalDate.of(2026,11,5);

 @BeforeEach void setUp(){
  service=new CrewManagementService(mock(FlightRepository.class),mock(FlightCrewRepository.class),users,roles,qualifications,mock(AuditService.class),credentials,mock(NotificationService.class),Clock.fixed(Instant.parse("2026-11-02T12:00:00Z"),ZoneOffset.UTC));
  CrewRole commander=role("COMANDANTE","Comandante");when(roles.findByCodigo("COMANDANTE")).thenReturn(Optional.of(commander));
  when(credentials.hasActivePolicy("COMANDANTE")).thenReturn(true);
  when(credentials.assess(any(),eq("COMANDANTE"),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(true,"ELEGIBLE","Vigente",null));
 }
 private static CrewRole role(String code,String name){CrewRole r=new CrewRole();r.setCodigo(code);r.setNombre(name);return r;}
 private static User commander(boolean license,boolean accessRole){
  User u=new User();u.setId(7L);u.setUsername("maria123");u.setActivo(true);u.setEstadoCuenta("ACTIVO");
  Person p=new Person();p.setNombre("Maria");p.setApellido("Lopez");CommanderProfile profile=new CommanderProfile();profile.setLicenseNumber(license?"ARG0000":null);Province tuc=new Province();tuc.setNombre("Tucumán");profile.setProvinciaActual(tuc);p.setCommanderProfile(profile);u.setPerson(p);
  Role r=new Role();r.setCodigo(accessRole?"COMANDANTE":"DTS");UserRole link=new UserRole();link.setRole(r);u.setUserRoles(Set.of(link));return u;
 }
 private CrewQualification qualification(User u,String code,String name,boolean retired){
  CrewQualification q=new CrewQualification();q.setUser(u);q.setRole(role(code,name));if(retired)q.retire(LocalDateTime.of(2026,10,30,10,0),u,"Licencia suspendida por el organismo");return q;
 }
 private static RequirementView find(List<RequirementView> list,String code){return list.stream().filter(r->r.codigo().equals(code)).findFirst().orElseThrow();}
 private void consistent(User u){
  var list=service.requirements(null,u,"COMANDANTE",on,null);var decision=service.evaluateOn(null,u,"COMANDANTE",on,false);
  assertEquals(decision.eligible(),list.stream().allMatch(RequirementView::cumplido),"la lista de requisitos y la decisión de asignar coinciden");
 }

 @Test void commanderWithEveryRequirementIsEligibleAndNothingIsMissing(){
  User u=commander(true,true);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(true);
  when(qualifications.findAllByUserId(7L)).thenReturn(List.of(qualification(u,"COMANDANTE","Comandante",false)));
  var list=service.requirements(null,u,"COMANDANTE",on,null);
  assertTrue(list.stream().allMatch(RequirementView::cumplido));assertTrue(list.stream().noneMatch(r->r.resuelve()!=null||r.procedimiento()!=null));
  assertEquals(List.of("CUENTA_ACTIVA","ROL_ACCESO","LICENCIA","CLASIFICACION","POLITICA","HABILITACION"),list.stream().map(RequirementView::codigo).toList());consistent(u);
 }

 @Test void neverClassifiedCommanderIsBlockedWithAPreciseReasonAndTheOtherMissingRequirementsAreListedToo(){
  User u=commander(true,true);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(false);when(qualifications.findAllByUserId(7L)).thenReturn(List.of());
  when(credentials.assess(any(),eq("COMANDANTE"),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(false,"HABILITACION_AUSENTE","No tiene habilitación profesional para esta función",null));
  var decision=service.evaluateOn(null,u,"COMANDANTE",on,false);assertFalse(decision.eligible());assertEquals("CLASIFICACION_INCOMPATIBLE",decision.code());assertTrue(decision.message().contains("No tiene registrada la clasificación administrativa"));
  var list=service.requirements(null,u,"COMANDANTE",on,null);
  var classification=find(list,"CLASIFICACION");assertFalse(classification.cumplido());assertEquals("NO_REGISTRADA",classification.estado());assertEquals("ADMINISTRADOR",classification.resuelve());assertTrue(classification.procedimiento().contains("Clasificación administrativa de tripulación"));
  var credential=find(list,"HABILITACION");assertFalse(credential.cumplido());assertEquals("HABILITACION_AUSENTE",credential.estado());assertTrue(credential.procedimiento().contains("Habilitaciones"));
  assertTrue(find(list,"LICENCIA").cumplido()&&find(list,"ROL_ACCESO").cumplido()&&find(list,"CUENTA_ACTIVA").cumplido(),"lo que sí cumple se informa como cumplido");consistent(u);
 }

 @Test void missingPolicyIsReportedOnItsOwnEvenBeforeAnyCredentialExistsAndIsNotDuplicated(){
  User u=commander(true,true);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(true);when(qualifications.findAllByUserId(7L)).thenReturn(List.of(qualification(u,"COMANDANTE","Comandante",false)));
  when(credentials.hasActivePolicy("COMANDANTE")).thenReturn(false);
  when(credentials.assess(any(),eq("COMANDANTE"),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(false,"HABILITACION_AUSENTE","No tiene habilitación profesional para esta función",null));
  var list=service.requirements(null,u,"COMANDANTE",on,null);var policy=find(list,"POLITICA");
  assertFalse(policy.cumplido());assertEquals("POLITICA_HABILITACION_NO_CONFIGURADA",policy.estado());assertEquals("ADMINISTRADOR",policy.resuelve());assertTrue(policy.procedimiento().contains("decisión de la organización"));
  assertEquals("HABILITACION_AUSENTE",find(list,"HABILITACION").estado(),"sin habilitación se informa también ese faltante");
  when(credentials.assess(any(),eq("COMANDANTE"),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(false,"POLITICA_HABILITACION_NO_CONFIGURADA","No hay política",null));
  var again=service.requirements(null,u,"COMANDANTE",on,null);assertEquals(1,again.stream().filter(r->!r.cumplido()).count(),"la misma causa no se repite en dos requisitos");assertTrue(again.stream().noneMatch(r->r.codigo().equals("HABILITACION")));
 }

 @Test void retiredClassificationIsDistinguishedFromNeverRegistered(){
  User u=commander(true,true);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(false);
  when(qualifications.findAllByUserId(7L)).thenReturn(List.of(qualification(u,"COMANDANTE","Comandante",true)));
  var c=find(service.requirements(null,u,"COMANDANTE",on,null),"CLASIFICACION");
  assertEquals("RETIRADA",c.estado());assertTrue(c.mensaje().contains("2026-10-30")&&c.mensaje().contains("Licencia suspendida por el organismo"));consistent(u);
 }

 @Test void classificationForAnotherFunctionDoesNotQualifyForCommander(){
  User u=commander(true,true);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(false);
  when(qualifications.findAllByUserId(7L)).thenReturn(List.of(qualification(u,"COPILOTO","Copiloto",false)));
  var c=find(service.requirements(null,u,"COMANDANTE",on,null),"CLASIFICACION");
  assertEquals("OTRA_FUNCION",c.estado());assertTrue(c.mensaje().contains("Copiloto"));consistent(u);
 }

 @Test void credentialStatesKeepTheirOwnReasonAndProcedure(){
  User u=commander(true,true);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(true);when(qualifications.findAllByUserId(7L)).thenReturn(List.of(qualification(u,"COMANDANTE","Comandante",false)));
  for(String state:List.of("HABILITACION_NO_VERIFICADA","HABILITACION_VENCIDA","HABILITACION_REVOCADA","HABILITACION_CORRECCION_PENDIENTE")){
   when(credentials.assess(any(),eq("COMANDANTE"),any(),any())).thenReturn(new ProfessionalCredentialService.Assessment(false,state,"motivo "+state,null));
   var c=find(service.requirements(null,u,"COMANDANTE",on,null),"HABILITACION");
   assertEquals(state,c.estado());assertEquals("motivo "+state,c.mensaje());assertFalse(c.procedimiento().isBlank());consistent(u);
  }
 }

 @Test void missingLicenseAccessRoleAndInactiveAccountAreReportedSeparately(){
  User u=commander(false,false);u.setActivo(false);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(true);when(qualifications.findAllByUserId(7L)).thenReturn(List.of());
  var list=service.requirements(null,u,"COMANDANTE",on,null);
  assertEquals("CUENTA_INACTIVA",find(list,"CUENTA_ACTIVA").estado());assertEquals("ROL_AUSENTE",find(list,"ROL_ACCESO").estado());assertEquals("LICENCIA_AUSENTE",find(list,"LICENCIA").estado());consistent(u);
 }

 @Test void adminReportShowsLocationAsInformationAndCountsMissingRequirements(){
  User u=commander(true,true);when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(false);when(qualifications.findAllByUserId(7L)).thenReturn(List.of());
  when(users.findById(7L)).thenReturn(Optional.of(u));
  var view=service.requirementsFor(7L,"COMANDANTE");
  assertFalse(view.elegible());assertEquals(1,view.faltantes());assertEquals("Tucumán",view.provinciaOperativa());assertEquals("maria123",view.username());assertEquals("Comandante",view.crewRoleName());
  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.requirementsFor(7L,"PILOTO_INEXISTENTE"));
 }

 @Test void commanderListFiltersByPendingRequirements(){
  User pending=commander(true,true);User ok=commander(true,true);ok.setId(8L);ok.setUsername("ok123");
  when(qualifications.existsByUserIdAndRoleCodigo(7L,"COMANDANTE")).thenReturn(false);when(qualifications.findAllByUserId(7L)).thenReturn(List.of());
  when(qualifications.existsByUserIdAndRoleCodigo(8L,"COMANDANTE")).thenReturn(true);when(qualifications.findAllByUserId(8L)).thenReturn(List.of(qualification(ok,"COMANDANTE","Comandante",false)));
  when(users.findActiveCommanderAccounts(eq(""),any(Pageable.class))).thenReturn(List.of(pending,ok));
  assertEquals(List.of("maria123"),service.commanderRequirements("",true,100).stream().map(v->v.username()).toList());
  assertEquals(2,service.commanderRequirements("",false,100).size());
 }
}
