package com.vuelossanitarios.backend.service;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ProfessionalCredentialServiceTest {
 static final ZoneId ZONE=ZoneId.of("America/Argentina/Tucuman");
 ProfessionalCredentialRepository repo; CredentialDocumentRepository documents; CredentialPolicyRepository policies; ExternalCredentialCheckRepository checks; CredentialDecisionRepository decisions;
 ProfessionalCredentialService service; User user; CrewRole medic;

 @BeforeEach void setUp(){
  repo=mock(ProfessionalCredentialRepository.class);documents=mock(CredentialDocumentRepository.class);policies=mock(CredentialPolicyRepository.class);checks=mock(ExternalCredentialCheckRepository.class);decisions=mock(CredentialDecisionRepository.class);
  service=new ProfessionalCredentialService(repo,documents,mock(UserRepository.class),mock(CrewRoleRepository.class),mock(ProvinceRepository.class),policies,decisions,checks,mock(AuditEventRepository.class),mock(AuditService.class),new ObjectMapper(),
   Clock.fixed(LocalDate.of(2026,10,25).atStartOfDay(ZONE).toInstant(),ZONE),"America/Argentina/Tucuman");
  Person person=new Person();person.setId(7L);user=new User();user.setPerson(person);
  medic=new CrewRole();medic.setCodigo("MEDICO");
 }
 ProfessionalCredential credential(String status,LocalDate expires){
  ProfessionalCredential c=new ProfessionalCredential();c.role=medic;c.type="Médico";c.number="MP-1";c.status=status;c.expires=expires;return c;
 }
 CredentialPolicy policy(String type){CredentialPolicy p=new CredentialPolicy();p.role=medic;p.credentialType=type;return p;}
 void givenCredentials(ProfessionalCredential... all){when(repo.findByPersonIdOrderByIdDesc(7L)).thenReturn(List.of(all));}
 void givenPolicies(CredentialPolicy... all){when(policies.findActiveByRole("MEDICO")).thenReturn(List.of(all));}

 @Test void holderCannotDecideTheirOwnCredentialEvenWithAdministrativeAccess(){
  when(repo.findOwnerUserId(44L)).thenReturn(9L);
  ApiException error=assertThrows(ApiException.class,()->service.decide(44L,"VERIFICADA",new ProfessionalCredentialService.Decision("Revisión propia indebida",true,false),9L));
  assertEquals(403,error.status().value());assertEquals("AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA",error.code());
  verify(repo,never()).findById(anyLong());
 }
 @Test void holderCannotRecordAnExternalCheckOnTheirOwnCredential(){
  when(repo.findOwnerUserId(44L)).thenReturn(9L);
  ApiException error=assertThrows(ApiException.class,()->service.recordExternalCheck(44L,new ProfessionalCredentialService.ExternalCheckInput("REFEPS_SISA",null,"datos","COINCIDE",null,null),9L));
  assertEquals("AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA",error.code());
 }
 @Test void credentialUsesControlledClockAndPlannedDepartureDay(){
  givenPolicies(policy("Médico"));ProfessionalCredential c=credential("VERIFICADA",LocalDate.of(2026,10,27));givenCredentials(c);
  assertEquals("HABILITACION_POR_VENCER",service.assess(user,"MEDICO",LocalDate.of(2026,10,27)).code());
  assertEquals("HABILITACION_VENCIDA",service.assess(user,"MEDICO",LocalDate.of(2026,10,28)).code());
  c.expires=LocalDate.of(2026,10,24);assertEquals("HABILITACION_VENCIDA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.expires=null;c.noExpiry=true;c.status="REVOCADA";assertEquals("HABILITACION_REVOCADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.status="RECHAZADA";assertEquals("HABILITACION_RECHAZADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.status="CORRECCION_SOLICITADA";assertEquals("HABILITACION_CORRECCION_PENDIENTE",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.status="PENDIENTE";assertEquals("HABILITACION_NO_VERIFICADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,25)).code());
  c.status="VERIFICADA";c.issued=LocalDate.of(2026,10,26);assertFalse(service.assess(user,"MEDICO",LocalDate.of(2026,10,27)).eligible());
  c.issued=null;assertTrue(service.assess(user,"MEDICO",LocalDate.of(2026,10,27)).eligible());
 }
 @Test void aVerifiedCurrentCredentialIsNotEnoughWithoutAConfiguredPolicy(){
  givenPolicies();givenCredentials(credential("VERIFICADA",LocalDate.of(2027,10,1)));
  var result=service.assess(user,"MEDICO",LocalDate.of(2026,10,26));
  assertFalse(result.eligible());assertEquals("POLITICA_HABILITACION_NO_CONFIGURADA",result.code());
 }
 @Test void aCredentialOfAnotherTypeDoesNotSatisfyThePolicy(){
  givenPolicies(policy("Enfermero"));givenCredentials(credential("VERIFICADA",LocalDate.of(2027,10,1)));
  assertEquals("HABILITACION_NO_SUFICIENTE",service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).code());
 }
 @Test void aNoRestrictionCredentialMatchingThePolicyIsEligibleAndRestrictionsAreReported(){
  givenPolicies(policy("médico"));ProfessionalCredential c=credential("VERIFICADA",LocalDate.of(2027,10,1));c.restrictions="Sólo traslados diurnos";givenCredentials(c);
  var result=service.assess(user,"MEDICO",LocalDate.of(2026,10,26));
  assertTrue(result.eligible());assertEquals("ELEGIBLE",result.code());assertTrue(result.message().contains("Sólo traslados diurnos"));
 }
 @Test void policyScopedToAircraftCategoryNeedsAMatchingCredentialAndAKnownAircraft(){
  CredentialPolicy p=policy("Médico");p.aircraftCategory="Turbohélice";givenPolicies(p);ProfessionalCredential c=credential("VERIFICADA",LocalDate.of(2027,10,1));givenCredentials(c);
  var strictUnknown=service.assess(user,"MEDICO",LocalDate.of(2026,10,26),CredentialSufficiency.Context.of("SANITARIO",null));
  assertEquals("CONTEXTO_OPERATIVO_INCOMPLETO",strictUnknown.code());
  assertEquals("HABILITACION_NO_SUFICIENTE",service.assess(user,"MEDICO",LocalDate.of(2026,10,26),CredentialSufficiency.Context.of("SANITARIO","Turbohélice")).code());
  c.aircraftCategory="TURBOHELICE";
  assertTrue(service.assess(user,"MEDICO",LocalDate.of(2026,10,26),CredentialSufficiency.Context.of("SANITARIO","Turbohélice")).eligible());
  assertEquals("POLITICA_HABILITACION_NO_CONFIGURADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,26),CredentialSufficiency.Context.of("SANITARIO","Avión")).code());
 }
 @Test void policyScopedToFlightTypeIgnoresOtherTypes(){
  CredentialPolicy p=policy("Médico");FlightType type=new FlightType();type.setCodigo("SANITARIO");p.flightType=type;givenPolicies(p);givenCredentials(credential("VERIFICADA",LocalDate.of(2027,10,1)));
  assertTrue(service.assess(user,"MEDICO",LocalDate.of(2026,10,26),CredentialSufficiency.Context.of("SANITARIO","Avión")).eligible());
  assertEquals("POLITICA_HABILITACION_NO_CONFIGURADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,26),CredentialSufficiency.Context.of("ENTRENAMIENTO","Avión")).code());
 }
 @Test void jurisdictionRequirementNeedsARegisteredJurisdiction(){
  CredentialPolicy p=policy("Médico");p.requiresJurisdiction=true;givenPolicies(p);ProfessionalCredential c=credential("VERIFICADA",LocalDate.of(2027,10,1));givenCredentials(c);
  assertEquals("JURISDICCION_NO_REGISTRADA",service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).code());
  c.jurisdiction=new Province();assertTrue(service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).eligible());
 }
 @Test void externalCheckRequirementNeedsAMatchingConsultationOfTheCurrentNumber(){
  CredentialPolicy p=policy("Médico");p.requiresExternalCheck=true;givenPolicies(p);ProfessionalCredential c=credential("VERIFICADA",LocalDate.of(2027,10,1));c.setId(5L);givenCredentials(c);
  when(checks.findFirstByCredentialIdOrderByIdDesc(5L)).thenReturn(Optional.empty());
  assertEquals("CONSULTA_EXTERNA_REQUERIDA",service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).code());
  ExternalCredentialCheck k=new ExternalCredentialCheck();k.result="NO_COINCIDE";k.numberChecked="MP-1";when(checks.findFirstByCredentialIdOrderByIdDesc(5L)).thenReturn(Optional.of(k));
  assertEquals("CONSULTA_EXTERNA_REQUERIDA",service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).code());
  k.result="COINCIDE";assertTrue(service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).eligible());
  k.numberChecked="MP-OTRO";assertEquals("CONSULTA_EXTERNA_REQUERIDA",service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).code());
 }
 @Test void personWithoutCredentialsIsAbsentRegardlessOfPolicy(){
  givenPolicies(policy("Médico"));givenCredentials();
  assertEquals("HABILITACION_AUSENTE",service.assess(user,"MEDICO",LocalDate.of(2026,10,26)).code());
 }
}
