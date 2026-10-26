package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.PatientDtos.CreatePatient;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.repository.PatientRepository;
import com.vuelossanitarios.backend.repository.PersonRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PatientServiceIdentityTest {
 private final PatientRepository patients=mock(PatientRepository.class);
 private final PersonRepository persons=mock(PersonRepository.class);
 private final PatientService service=new PatientService(patients,persons);

 @Test void legacyEndpointCannotTurnArbitraryPersonIdIntoPatient(){
  ApiException error=assertThrows(ApiException.class,()->service.create(new CreatePatient(42L,null,null,null,null)));
  assertEquals(HttpStatus.BAD_REQUEST,error.status());
  verifyNoInteractions(persons,patients);
 }

 @Test void legacyEndpointDoesNotRevealWhetherExistingDniBelongsToAnAccount(){
  Person existing=new Person();
  existing.setId(99L);existing.setNombre("Ana");existing.setApellido("Paz");existing.setDni("40111222");
  when(persons.findByDniForUpdate("40111222")).thenReturn(Optional.of(existing));
  ApiException error=assertThrows(ApiException.class,()->service.create(new CreatePatient(null,"Ana","Paz","40.111.222",null)));
  assertEquals(HttpStatus.CONFLICT,error.status());
  assertFalse(error.getMessage().toLowerCase().contains("usuario"));
  assertFalse(error.getMessage().contains("40111222"));
  verify(patients,never()).saveAndFlush(any());
 }

 @Test void existingPersonCanBeLinkedOnlyAfterAttestationAndMatchingIdentity(){
  Person existing=person();existing.setFechaNacimiento(LocalDate.of(1980,2,3));
  when(persons.findByDniForUpdate("40111222")).thenReturn(Optional.of(existing));
  when(patients.saveAndFlush(any())).thenAnswer(invocation->{Patient patient=invocation.getArgument(0);patient.setId(77L);return patient;});
  CreatePatient request=new CreatePatient(null," ÁNA "," PÁZ ","40.111.222",LocalDate.of(1980,2,3));
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.registerForSanitaryRequest(request,false)).status());
  var result=service.registerForSanitaryRequest(request,true);
  assertTrue(result.linkedExistingPerson());
  assertEquals(99L,result.patient().personId());
  assertEquals(77L,result.patient().id());
  verify(persons,never()).saveAndFlush(any());
  verify(patients).saveAndFlush(any());
 }

 @Test void contradictoryBirthDateOrNameCannotLinkAndDoesNotCreatePatient(){
  Person existing=person();existing.setFechaNacimiento(LocalDate.of(1980,2,3));
  when(persons.findByDniForUpdate("40111222")).thenReturn(Optional.of(existing));
  for(CreatePatient request:new CreatePatient[]{
   new CreatePatient(null,"Otra","Paz","40111222",LocalDate.of(1980,2,3)),
   new CreatePatient(null,"Ana","Paz","40111222",LocalDate.of(1990,2,3))
  })assertEquals("PATIENT_IDENTITY_CONFLICT",assertThrows(ApiException.class,()->service.registerForSanitaryRequest(request,true)).code());
  verifyNoInteractions(patients);
 }

 @Test void alreadyRegisteredPatientCannotBeDuplicated(){
  Person existing=person();when(persons.findByDniForUpdate("40111222")).thenReturn(Optional.of(existing));
  when(patients.findByPersonId(99L)).thenReturn(Optional.of(new Patient()));
  assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.registerForSanitaryRequest(new CreatePatient(null,"Ana","Paz","40111222",null),true)).status());
  verify(patients,never()).saveAndFlush(any());
 }

 @Test void noDniCreatesNewPersonWithoutLinkingOrAttestation(){
  when(persons.saveAndFlush(any())).thenAnswer(invocation->{Person person=invocation.getArgument(0);person.setId(100L);return person;});
  when(patients.saveAndFlush(any())).thenAnswer(invocation->{Patient patient=invocation.getArgument(0);patient.setId(101L);return patient;});
  var result=service.registerForSanitaryRequest(new CreatePatient(null,"Ana","Paz",null,null),false);
  assertFalse(result.linkedExistingPerson());
  assertEquals(100L,result.patient().personId());
  verify(persons,never()).findByDniForUpdate(any());
 }

 @Test void dniWithLettersCannotResolveAnExistingIdentity(){
  assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.registerForSanitaryRequest(new CreatePatient(null,"Ana","Paz","x40.111.222",null),true)).status());
  verifyNoInteractions(persons,patients);
 }

 @Test void missingAttestationDoesNotRevealWhetherDniExists(){
  ApiException error=assertThrows(ApiException.class,()->service.registerForSanitaryRequest(new CreatePatient(null,"Ana","Paz","40.111.222",null),false));
  assertEquals("PATIENT_IDENTITY_CONFLICT",error.code());
  verifyNoInteractions(persons,patients);
 }

 private Person person(){Person p=new Person();p.setId(99L);p.setNombre("Ana");p.setApellido("Paz");p.setDni("40111222");return p;}
}
