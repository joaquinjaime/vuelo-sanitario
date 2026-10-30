package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.PatientDtos.*;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.AuditEventRepository;
import com.vuelossanitarios.backend.repository.PatientRepository;
import com.vuelossanitarios.backend.repository.PersonRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Patient identification for DTS and controlled identity correction for administrators. */
@Service
public class PatientDirectoryService {
 private static final int SEARCH_MAX_SIZE=20,SEARCH_MAX_OFFSET=1000;
 private final PatientRepository patients;
 private final PersonRepository persons;
 private final UserRepository users;
 private final AuditEventRepository events;
 private final AuditService audit;
 private final PersonIdentityService identity;
 private final ObjectMapper json;
 private final Clock clock;

 public PatientDirectoryService(PatientRepository patients,PersonRepository persons,UserRepository users,AuditEventRepository events,AuditService audit,PersonIdentityService identity,ObjectMapper json,Clock clock){
  this.patients=patients;this.persons=persons;this.users=users;this.events=events;this.audit=audit;this.identity=identity;this.json=json;this.clock=clock;
 }

 @Transactional(readOnly=true)
 public PatientSearchPage search(String dni,String nombre,String apellido,int page,int size){
  validatePage(page,size,SEARCH_MAX_SIZE,SEARCH_MAX_OFFSET);
  boolean byDni=present(dni),byName=present(nombre)||present(apellido);
  if(byDni==byName)throw bad("Indique un DNI exacto o nombre y apellido");
  if(byDni){
   String key=canonicalDni(dni);
   if(key.length()<7||key.length()>12)throw bad("El DNI debe tener entre 7 y 12 dígitos");
   List<PatientSearchItem> found=page==0?patients.findWithPersonByDni(key).map(this::item).map(List::of).orElseGet(List::of):List.of();
   return new PatientSearchPage(found,page,size,false);
  }
  String first=prefix(nombre,"nombre"),last=prefix(apellido,"apellido");
  Slice<Patient> found=patients.searchByName(first+"%",last+"%",PageRequest.of(page,size));
  return new PatientSearchPage(found.getContent().stream().map(this::item).toList(),page,size,found.hasNext());
 }

 @Transactional(readOnly=true)
 public PatientIdentityDetail detail(Long patientId){return detailOf(patient(patientId));}

 @Transactional
 public PatientIdentityDetail correct(Long patientId,CorrectIdentity request,Long actorId){
  Patient patient=patient(patientId);Person person=patient.getPerson();
  if(request.version()==null||!request.version().equals(person.getVersion()))throw stale();
  String first=requiredText(request.nombre(),"nombre",100),last=requiredText(request.apellido(),"apellido",100);
  String reason=requiredText(request.motivo(),"motivo",500);
  if(reason.length()<10)throw bad("El motivo debe tener al menos 10 caracteres");
  LocalDate birth=request.fechaNacimiento();
  if(birth!=null&&birth.isAfter(LocalDate.now(clock)))throw bad("La fecha de nacimiento no puede ser futura");
  Map<String,Object> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
  changed(before,after,"nombre",person.getNombre(),first);
  changed(before,after,"apellido",person.getApellido(),last);
  changed(before,after,"fechaNacimiento",person.getFechaNacimiento(),birth);
  if(before.isEmpty())throw bad("No hay cambios de identidad para guardar");
  person.setNombre(first);person.setApellido(last);person.setFechaNacimiento(birth);
  persons.flush(); // @Version detects concurrent changes, including those from AuthService.
  after.put("motivo",reason);
  audit.record(null,users.getReferenceById(actorId),"PATIENT_IDENTITY",patientId,"CORRECT",asJson(before),asJson(after));
  return detailOf(patient);
 }

 /** Rectifica (o asigna) el DNI de la identidad de la ficha; las reglas viven en {@link PersonIdentityService} y son las mismas que usa el detalle de usuario. */
 @Transactional
 public PatientIdentityDetail rectifyDni(Long patientId,RectifyDni request,Long actorId){
  Patient patient=patient(patientId);
  identity.rectifyDni(patient.getPerson(),request,actorId);
  return detailOf(patient);
 }

 @Transactional(readOnly=true)
 public PatientCorrectionHistory history(Long patientId,int page,int size){
  patient(patientId);
  validatePage(page,size,20,1000);
  Slice<AuditEvent> found=events.findByEntityTypeAndEntityIdAndOperationInOrderByIdDesc("PATIENT_IDENTITY",patientId,List.of("CORRECT","RECTIFY_DNI","ASSIGN_DNI"),PageRequest.of(page,size));
  return new PatientCorrectionHistory(found.getContent().stream().map(this::event).toList(),page,size,found.hasNext());
 }

 private PatientCorrectionEvent event(AuditEvent e){
  Map<String,String> old=readJson(e.getOldValues()),newValues=readJson(e.getNewValues());
  List<PatientCorrectionChange> changes=new ArrayList<>();
  for(String field:List.of("nombre","apellido","fechaNacimiento"))if(old.containsKey(field))changes.add(new PatientCorrectionChange(field,old.get(field),newValues.get(field)));
  if(old.containsKey("terminacionAnterior"))changes.add(new PatientCorrectionChange("dni",maskedTail(old.get("terminacionAnterior")),maskedTail(newValues.get("terminacionNueva"))));
  return new PatientCorrectionEvent(e.getId(),e.getOccurredAt().toInstant(ZoneOffset.UTC),e.getOperation(),e.getActor()==null?"Sistema":e.getActor().getUsername(),newValues.get("motivo"),changes);
 }

 private PatientSearchItem item(Patient patient){
  Person person=patient.getPerson();String dni=person.getDni();
  return new PatientSearchItem(patient.getId(),person.getNombre(),person.getApellido(),dni==null?null:"••••"+dni.substring(Math.max(0,dni.length()-4)),person.getFechaNacimiento()==null?null:person.getFechaNacimiento().getYear());
 }
 private PatientIdentityDetail detailOf(Patient patient){Person p=patient.getPerson();return new PatientIdentityDetail(patient.getId(),p.getNombre(),p.getApellido(),p.getDni(),p.getFechaNacimiento(),p.getVersion(),users.findByPersonId(p.getId()).map(User::getEstadoCuenta).orElse(null));}
 private static String maskedTail(String tail){return tail==null?"Sin DNI":"••••"+tail;}
 private ApiException stale(){return PersonIdentityService.stale();}
 private Patient patient(Long id){return patients.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Paciente inexistente"));}
 private void changed(Map<String,Object> before,Map<String,Object> after,String field,Object old,Object now){if(!Objects.equals(old,now)){before.put(field,old);after.put(field,now);}}
 private String asJson(Map<String,Object> values){try{return json.writeValueAsString(values);}catch(Exception e){throw new IllegalStateException("No se pudo registrar la auditoría",e);}}
 private Map<String,String> readJson(String source){try{return json.readValue(source,new TypeReference<Map<String,String>>(){});}catch(Exception e){throw new IllegalStateException("Auditoría ilegible",e);}}
 private String requiredText(String value,String field,int max){
  if(value==null||value.isBlank())throw bad("El "+field+" es obligatorio");
  String result=value.trim().replaceAll("\\s+"," ");
  if(result.length()>max||result.chars().anyMatch(Character::isISOControl))throw bad("El "+field+" es inválido");
  return result;
 }
 private String prefix(String input,String field){
  String value=requiredText(input,field,100).toLowerCase(Locale.ROOT);
  if(!value.matches("[\\p{L} .'-]+")||value.codePoints().filter(Character::isLetter).count()<2)throw bad("Indique al menos dos letras válidas para "+field);
  return value;
 }
 private String canonicalDni(String value){return PersonIdentityService.canonicalDni(value);}
 private void validatePage(int page,int size,int maxSize,int maxOffset){if(page<0||size<1||size>maxSize||(long)page*size>maxOffset)throw bad("Paginación inválida");}
 private boolean present(String value){return value!=null&&!value.isBlank();}
 private ApiException bad(String message){return new ApiException(HttpStatus.BAD_REQUEST,message);}
}
