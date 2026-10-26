package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.PatientDtos.RectifyDni;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** Reglas compartidas de la rectificación del DNI cuando se llega desde una cuenta de usuario (la entrada por ficha de paciente la cubre PatientDniRectificationServiceTest). */
class PersonIdentityServiceTest {
 private final PersonRepository persons=mock(PersonRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final PatientRepository patients=mock(PatientRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final PersonIdentityService service=new PersonIdentityService(persons,users,patients,audit,new ObjectMapper());
 private final Person person=new Person();private final User account=mock(User.class);private final User admin=new User();

 @BeforeEach void setup(){
  ReflectionTestUtils.setField(person,"version",5L);person.setId(900L);person.setNombre("Beto");person.setApellido("Cuenta");person.setDni("40111222");
  when(account.getId()).thenReturn(33L);when(account.getPerson()).thenReturn(person);when(account.getEstadoCuenta()).thenReturn("ACTIVO");
  when(users.findWithPersonById(33L)).thenReturn(Optional.of(account));when(users.findByPersonId(900L)).thenReturn(Optional.of(account));when(users.getReferenceById(1L)).thenReturn(admin);
  when(patients.findByPersonId(900L)).thenReturn(Optional.empty());
 }
 private RectifyDni request(String dni,Boolean cotejo,Boolean cuenta){return new RectifyDni(dni,5L,"Error de digitación al crear la cuenta",cotejo,cuenta);}
 private void assertAccountUntouched(){
  verify(account,never()).setPasswordHash(any());verify(account,never()).invalidateCredentials();verify(account,never()).setActivo(any());verify(account,never()).setEstadoCuenta(any());
  verify(account,never()).setUsername(any());verify(users,never()).save(any());verify(users,never()).saveAndFlush(any());
 }

 @Test void aUserWithoutPatientRecordIsAuditedUnderItsAccountAndTheAccountIsNeverModified(){
  var outcome=service.rectifyUserDni(33L,request("30.222.333",true,true),1L);
  assertEquals("30222333",person.getDni());assertEquals("30222333",outcome.dni());assertEquals("ACTIVO",outcome.accountState());assertEquals(900L,outcome.personId());
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class);
  verify(audit).record(isNull(),eq(admin),eq("USER"),eq(33L),eq("RECTIFY_DNI"),eq("{\"terminacionAnterior\":\"1222\"}"),after.capture());
  assertTrue(after.getValue().contains("\"cuentaEstado\":\"ACTIVO\"")&&after.getValue().contains("\"usuarioId\":33")&&after.getValue().contains("\"terminacionNueva\":\"2333\""));
  assertFalse(after.getValue().contains("30222333"));
  verify(persons).flush();verify(patients,never()).save(any());assertAccountUntouched();
 }

 @Test void aUserWhoIsAlsoAPatientIsAuditedUnderThePatientRecordWithTheSamePolicyAsTheOtherEntryPoint(){
  Patient patient=new Patient();patient.setId(7L);patient.setPerson(person);when(patients.findByPersonId(900L)).thenReturn(Optional.of(patient));
  service.rectifyUserDni(33L,request("30222333",true,true),1L);
  verify(audit).record(isNull(),eq(admin),eq("PATIENT_IDENTITY"),eq(7L),eq("RECTIFY_DNI"),anyString(),anyString());
  verify(audit,never()).record(any(),any(),eq("USER"),any(),any(),any(),any());assertAccountUntouched();
 }

 @Test void inactiveAndPendingAccountsAreRectifiedWithoutChangingTheirState(){
  for(String state:new String[]{"DESACTIVADO","PENDIENTE_ACTIVACION"}){
   when(account.getEstadoCuenta()).thenReturn(state);person.setDni("40111222");
   var outcome=service.rectifyUserDni(33L,request("30222333",true,true),1L);assertEquals(state,outcome.accountState());
  }
  assertAccountUntouched();
 }

 @Test void theAccountDecidesWhichPersonChangesAndMissingOrInconsistentAccountsAreRejected(){
  when(users.findWithPersonById(404L)).thenReturn(Optional.empty());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.rectifyUserDni(404L,request("30222333",true,true),1L)).status());
  User orphan=mock(User.class);when(orphan.getPerson()).thenReturn(null);when(users.findWithPersonById(34L)).thenReturn(Optional.of(orphan));
  var inconsistent=assertThrows(ApiException.class,()->service.rectifyUserDni(34L,request("30222333",true,true),1L));
  assertEquals(HttpStatus.CONFLICT,inconsistent.status());assertEquals("PERSON_MISSING",inconsistent.code());
  verify(persons,never()).flush();verifyNoInteractions(audit);
 }

 @Test void theSharedRulesApplyToTheUserEntryPointToo(){
  assertEquals("DNI_ACCOUNT_CONFIRMATION_REQUIRED",assertThrows(ApiException.class,()->service.rectifyUserDni(33L,request("30222333",true,null),1L)).code());
  assertEquals("DNI_COTEJO_REQUIRED",assertThrows(ApiException.class,()->service.rectifyUserDni(33L,request("30222333",false,true),1L)).code());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.rectifyUserDni(33L,request("40.111.222",true,true),1L)).status());
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.rectifyUserDni(33L,request("12ab",true,true),1L)).status());
  assertEquals("PATIENT_STALE_IDENTITY",assertThrows(ApiException.class,()->service.rectifyUserDni(33L,new RectifyDni("30222333",1L,"Error de digitación",true,true),1L)).code());
  when(persons.existsByDni("30222333")).thenReturn(true);
  assertEquals("DNI_ALREADY_REGISTERED",assertThrows(ApiException.class,()->service.rectifyUserDni(33L,request("30222333",true,true),1L)).code());
  assertEquals("40111222",person.getDni());verify(persons,never()).flush();verifyNoInteractions(audit);assertAccountUntouched();
 }

 @Test void theDniNormalizationIsASingleDefinition(){
  assertEquals("40111222",PersonIdentityService.canonicalDni(" 40.111-222 "));
  assertThrows(ApiException.class,()->PersonIdentityService.canonicalDni("40A111"));assertThrows(ApiException.class,()->PersonIdentityService.canonicalDni(null));
 }
}
