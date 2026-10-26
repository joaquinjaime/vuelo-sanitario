package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.PatientDtos.RectifyDni;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;

/** Reglas de la rectificación del DNI sobre la identidad compartida (la unicidad real y la concurrencia con SQL Server se prueban en el E2E). */
class PatientDniRectificationServiceTest {
 private final PatientRepository patients=mock(PatientRepository.class);
 private final PersonRepository persons=mock(PersonRepository.class);
 private final UserRepository users=mock(UserRepository.class);
 private final AuditEventRepository events=mock(AuditEventRepository.class);
 private final AuditService audit=mock(AuditService.class);
 private final PersonIdentityService identity=new PersonIdentityService(persons,users,patients,audit,new ObjectMapper());
 private final PatientDirectoryService service=new PatientDirectoryService(patients,persons,users,events,audit,identity,new ObjectMapper(),Clock.systemUTC());
 private final Person person=new Person();private final Patient patient=new Patient();
 private final User admin=new User();

 @BeforeEach void setup(){
  org.springframework.test.util.ReflectionTestUtils.setField(person,"version",3L);person.setId(500L);person.setNombre("Ana");person.setApellido("Paz");person.setDni("40111222");
  patient.setId(7L);patient.setPerson(person);
  admin.setId(1L);
  when(patients.findById(7L)).thenReturn(Optional.of(patient));when(patients.findByPersonId(500L)).thenReturn(Optional.of(patient));when(users.getReferenceById(1L)).thenReturn(admin);
  when(users.findByPersonId(500L)).thenReturn(Optional.empty());
 }
 private RectifyDni request(String dni,String reason,Boolean cotejo,Boolean account){return new RectifyDni(dni,versionOf(person),reason,cotejo,account);}
 private Long versionOf(Person p){return p.getVersion()==null?0L:p.getVersion();}
 private ApiException failure(String dni,String reason,Boolean cotejo,Boolean account){return assertThrows(ApiException.class,()->service.rectifyDni(7L,request(dni,reason,cotejo,account),1L));}
 private void assertUntouched(){assertEquals("40111222",person.getDni());verify(persons,never()).flush();verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());}

 @Test void rectifiesWithoutAccountKeepingTheIdentityAndAuditingOnlyTheLastFourDigits(){
  var detail=service.rectifyDni(7L,request("30.222.333","Error de digitación al cargar la solicitud",true,null),1L);
  assertEquals("30222333",person.getDni());assertEquals("30222333",detail.dni());assertEquals(500L,person.getId());assertEquals(7L,detail.id());assertNull(detail.cuentaEstado());
  verify(persons).flush();verify(persons,never()).save(any());verify(patients,never()).save(any());verify(patients,never()).delete(any());
  ArgumentCaptor<String> before=ArgumentCaptor.forClass(String.class),after=ArgumentCaptor.forClass(String.class);
  verify(audit).record(isNull(),eq(admin),eq("PATIENT_IDENTITY"),eq(7L),eq("RECTIFY_DNI"),before.capture(),after.capture());
  assertEquals("{\"terminacionAnterior\":\"1222\"}",before.getValue());
  assertEquals("{\"terminacionNueva\":\"2333\",\"personaId\":500,\"cotejoDocumental\":true,\"motivo\":\"Error de digitación al cargar la solicitud\"}",after.getValue());
  for(String value:new String[]{before.getValue(),after.getValue()}){assertFalse(value.contains("40111222"));assertFalse(value.contains("30222333"));}
 }

 @Test void assigningAMissingDniIsRecordedAsAnAssignmentNotACorrection(){
  person.setDni(null);
  service.rectifyDni(7L,request("30222333","Se obtuvo el documento del paciente",true,null),1L);
  assertEquals("30222333",person.getDni());
  ArgumentCaptor<String> before=ArgumentCaptor.forClass(String.class);
  verify(audit).record(isNull(),eq(admin),eq("PATIENT_IDENTITY"),eq(7L),eq("ASSIGN_DNI"),before.capture(),anyString());
  assertEquals("{\"terminacionAnterior\":null}",before.getValue());
  verify(patients,never()).save(any());
 }

 @Test void equivalentFormatsAreNormalizedAndAnEquivalentToTheCurrentOneIsRejected(){
  assertEquals(HttpStatus.BAD_REQUEST,failure("40.111.222","Motivo suficiente",true,null).status());
  assertEquals(HttpStatus.BAD_REQUEST,failure(" 40-111-222 ","Motivo suficiente",true,null).status());
  assertUntouched();
  service.rectifyDni(7L,request(" 30 222-333 ","Motivo suficiente",true,null),1L);assertEquals("30222333",person.getDni());
  verify(persons).existsByDni("30222333");
 }

 @Test void invalidFormatsAreRejectedBeforeTouchingAnything(){
  for(String bad:new String[]{"abc","30A222333","123456","1234567890123","", "   ", "--"}){assertEquals(HttpStatus.BAD_REQUEST,failure(bad,"Motivo suficiente",true,null).status(),bad);}
  assertUntouched();verify(persons,never()).existsByDni(any());
 }

 @Test void reasonAndDocumentCheckAreMandatory(){
  assertEquals("DNI_COTEJO_REQUIRED",failure("30222333","Motivo suficiente",false,null).code());
  assertEquals("DNI_COTEJO_REQUIRED",failure("30222333","Motivo suficiente",null,null).code());
  for(String reason:new String[]{null,"","   ","corto","x".repeat(501),"con\u0001control"})assertEquals(HttpStatus.BAD_REQUEST,failure("30222333",reason,true,null).status(),String.valueOf(reason));
  assertUntouched();
 }

 @Test void anOccupiedDniIsRejectedWithoutMergingAndWithoutNamingTheOtherPerson(){
  when(persons.existsByDni("30222333")).thenReturn(true);
  var error=failure("30222333","Motivo suficiente",true,null);
  assertEquals(HttpStatus.CONFLICT,error.status());assertEquals("DNI_ALREADY_REGISTERED",error.code());assertFalse(error.getMessage().contains("30222333"));
  assertUntouched();verify(persons,never()).delete(any());verify(patients,never()).delete(any());verify(patients,never()).save(any());
 }

 @Test void aDniTakenBetweenTheCheckAndTheWriteIsStillAConflictBecauseTheUniqueIndexDecides(){
  doThrow(new DataIntegrityViolationException("uq_personas_dni")).when(persons).flush();
  var error=failure("30222333","Motivo suficiente",true,null);
  assertEquals("DNI_ALREADY_REGISTERED",error.code());verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }

 @Test void staleVersionsAreRejectedBothUpFrontAndWhenTheWriteLosesTheRace(){
  var upFront=assertThrows(ApiException.class,()->service.rectifyDni(7L,new RectifyDni("30222333",99L,"Motivo suficiente",true,null),1L));
  assertEquals("PATIENT_STALE_IDENTITY",upFront.code());assertUntouched();
  doThrow(new OptimisticLockingFailureException("version")).when(persons).flush();
  assertEquals("PATIENT_STALE_IDENTITY",failure("30222333","Motivo suficiente",true,null).code());
  verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }

 @Test void aPersonWithAnAccountNeedsExplicitAcknowledgementAndTheAccountIsNeverModified(){
  User account=mock(User.class);when(account.getEstadoCuenta()).thenReturn("PENDIENTE_ACTIVACION");when(users.findByPersonId(500L)).thenReturn(Optional.of(account));
  var error=failure("30222333","Motivo suficiente",true,false);
  assertEquals("DNI_ACCOUNT_CONFIRMATION_REQUIRED",error.code());assertUntouched();
  var detail=service.rectifyDni(7L,request("30222333","Motivo suficiente",true,true),1L);
  assertEquals("PENDIENTE_ACTIVACION",detail.cuentaEstado());
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class);
  verify(audit).record(isNull(),eq(admin),eq("PATIENT_IDENTITY"),eq(7L),eq("RECTIFY_DNI"),anyString(),after.capture());
  assertTrue(after.getValue().contains("\"cuentaEstado\":\"PENDIENTE_ACTIVACION\""));
  verify(account,never()).invalidateCredentials();verify(account,never()).setPasswordHash(any());verify(account,never()).setActivo(any());verify(account,never()).setEstadoCuenta(any());verify(users,never()).save(any());
 }

 @Test void anUnknownPatientIsNotFound(){
  var error=assertThrows(ApiException.class,()->service.rectifyDni(404L,request("30222333","Motivo suficiente",true,null),1L));
  assertEquals(HttpStatus.NOT_FOUND,error.status());verifyNoInteractions(audit);
 }

 @Test void anAuditFailurePropagatesSoTheTransactionRollsBackTheWholeChange(){
  doThrow(new IllegalStateException("auditoría caída")).when(audit).record(any(),any(),any(),any(),any(),any(),any());
  assertThrows(IllegalStateException.class,()->service.rectifyDni(7L,request("30222333","Motivo suficiente",true,null),1L));
 }

 @Test void theCorrectionHistoryShowsDniRectificationsMaskedAndKeepsTheOperationKind(){
  AuditEvent e=new AuditEvent();e.setOperation("RECTIFY_DNI");e.setOccurredAt(LocalDateTime.of(2026,10,24,12,0));e.setActor(admin);admin.setUsername("admin1");
  e.setOldValues("{\"terminacionAnterior\":\"1222\"}");e.setNewValues("{\"terminacionNueva\":\"2333\",\"personaId\":500,\"cotejoDocumental\":true,\"motivo\":\"Error de digitación\"}");
  AuditEvent assign=new AuditEvent();assign.setOperation("ASSIGN_DNI");assign.setOccurredAt(LocalDateTime.of(2026,10,23,12,0));assign.setActor(admin);
  assign.setOldValues("{\"terminacionAnterior\":null}");assign.setNewValues("{\"terminacionNueva\":\"2333\",\"motivo\":\"Documento obtenido\"}");
  when(events.findByEntityTypeAndEntityIdAndOperationInOrderByIdDesc(eq("PATIENT_IDENTITY"),eq(7L),any(),any())).thenReturn(new org.springframework.data.domain.SliceImpl<>(java.util.List.of(e,assign)));
  var history=service.history(7L,0,10);
  assertEquals("RECTIFY_DNI",history.items().get(0).operacion());
  var change=history.items().get(0).cambios().get(0);assertEquals("dni",change.campo());assertEquals("••••1222",change.anterior());assertEquals("••••2333",change.nuevo());
  assertEquals("Sin DNI",history.items().get(1).cambios().get(0).anterior());
 }
}
