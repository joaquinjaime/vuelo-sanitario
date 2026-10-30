package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.PatientDtos.CreatePatient;
import com.vuelossanitarios.backend.api.dto.PatientDtos.PatientView;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.repository.PatientRepository;
import com.vuelossanitarios.backend.repository.PersonRepository;
import java.text.Normalizer;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PatientService {
 private final PatientRepository patients;
 private final PersonRepository persons;

 public PatientService(PatientRepository patients,PersonRepository persons){this.patients=patients;this.persons=persons;}

 /** The standalone route may only create a truly new identity; IDs supplied by callers are never trusted. */
 @Transactional
 public PatientView create(CreatePatient request){return register(request,false,false).patient();}

 /** Called inside the sanitary request transaction. Confirmation is the DTS actor's declaration, not an automated proof. */
 @Transactional
 public Registration registerForSanitaryRequest(CreatePatient request,boolean identityAttested){
  return register(request,true,identityAttested);
 }

 private Registration register(CreatePatient request,boolean allowExisting,boolean identityAttested){
  if(request.personId()!=null)throw new ApiException(HttpStatus.BAD_REQUEST,"No se admite seleccionar una persona por identificador");
  if(blank(request.nombre())||blank(request.apellido()))throw new ApiException(HttpStatus.BAD_REQUEST,"Nombre y apellido son obligatorios");
  String dni=canonicalDni(request.dni());
  if(allowExisting&&dni!=null&&!identityAttested)throw identityConflict();
  Person person=dni==null?null:persons.findByDniForUpdate(dni).orElse(null);
  boolean linkedExisting=person!=null;
  if(linkedExisting){
   if(!allowExisting||!identityAttested||!sameIdentity(person,request))throw identityConflict();
   if(patients.findByPersonId(person.getId()).isPresent())throw identityConflict();
  }else{
   person=new Person();
   person.setNombre(request.nombre().trim());
   person.setApellido(request.apellido().trim());
   person.setDni(dni);
   person.setFechaNacimiento(request.fechaNacimiento());
   persons.saveAndFlush(person);
  }
  Patient patient=new Patient();patient.setPerson(person);patients.saveAndFlush(patient);
  return new Registration(new PatientView(patient.getId(),person.getId(),person.getNombre(),person.getApellido()),linkedExisting);
 }

 private boolean sameIdentity(Person person,CreatePatient request){
  return normalizedName(person.getNombre()).equals(normalizedName(request.nombre()))
   && normalizedName(person.getApellido()).equals(normalizedName(request.apellido()))
   && (person.getFechaNacimiento()==null||person.getFechaNacimiento().equals(request.fechaNacimiento()));
 }

 private String normalizedName(String value){
  String plain=Normalizer.normalize(value.trim(),Normalizer.Form.NFD).replaceAll("\\p{M}+","");
  return plain.replaceAll("\\s+"," ").toUpperCase(Locale.ROOT);
 }

 private ApiException identityConflict(){
  return new ApiException(HttpStatus.CONFLICT,"PATIENT_IDENTITY_CONFLICT","No se pudo confirmar la identidad con los datos proporcionados; consulte a un responsable autorizado",java.util.Map.of());
 }

 private boolean blank(String value){return value==null||value.isBlank();}
 private String canonicalDni(String value){
  if(blank(value))return null;
  if(!value.matches("[0-9.\\s-]+"))throw new ApiException(HttpStatus.BAD_REQUEST,"Formato de DNI inválido");
  String digits=value.replaceAll("[^0-9]","");
  if(digits.isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"El DNI debe contener dígitos");
  return digits;
 }

 public record Registration(PatientView patient,boolean linkedExistingPerson){}
}
