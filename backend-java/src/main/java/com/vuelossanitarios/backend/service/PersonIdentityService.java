package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.PatientDtos.RectifyDni;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.PatientRepository;
import com.vuelossanitarios.backend.repository.PersonRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reglas únicas de la identidad compartida ({@code personas}) que modifica un administrador. Hoy: la rectificación (o primera asignación) del DNI,
 * que se invoca desde la ficha de paciente y desde el detalle de usuario con exactamente las mismas exigencias, el mismo control de versión,
 * la misma unicidad y la misma auditoría. Modifica únicamente {@code personas.dni}: la persona, su ficha, su cuenta, sus vuelos y sus documentos
 * conservan sus claves, y las credenciales, los roles, el estado y las sesiones de la cuenta no se tocan. Nunca fusiona identidades.
 */
@Service
public class PersonIdentityService {
 private final PersonRepository persons;
 private final UserRepository users;
 private final PatientRepository patients;
 private final AuditService audit;
 private final ObjectMapper json;

 public PersonIdentityService(PersonRepository persons,UserRepository users,PatientRepository patients,AuditService audit,ObjectMapper json){
  this.persons=persons;this.users=users;this.patients=patients;this.audit=audit;this.json=json;
 }

 /** Estado de la cuenta (null si la persona no tiene) tras una rectificación. */
 public record Outcome(Long personId,String dni,Long version,String accountState){}

 /** DNI canónico (sólo dígitos): única definición compartida con la búsqueda de pacientes. */
 public static String canonicalDni(String value){
  if(value==null||!value.matches("[0-9.\\s-]+"))throw bad("Formato de DNI inválido");
  return value.replaceAll("[^0-9]","");
 }

 /** Rectificación desde la ficha de paciente: la persona ya fue resuelta por el llamador dentro de su transacción. */
 @Transactional
 public Outcome rectifyDni(Person person,RectifyDni request,Long actorId){
  if(person==null)throw new ApiException(HttpStatus.CONFLICT,"PERSON_MISSING","La cuenta o la ficha no tiene una persona asociada",Map.of());
  if(request.version()==null||!request.version().equals(person.getVersion()))throw stale();
  if(!Boolean.TRUE.equals(request.cotejoDocumental()))throw new ApiException(HttpStatus.BAD_REQUEST,"DNI_COTEJO_REQUIRED","Debe declarar que cotejó la identidad con documentación suficiente",Map.of());
  String reason=text(request.motivo(),"motivo",500);
  if(reason.length()<10)throw bad("El motivo debe tener al menos 10 caracteres");
  String next=canonicalDni(request.dniNuevo());
  if(next.length()<7||next.length()>12)throw bad("El DNI debe tener entre 7 y 12 dígitos");
  String previous=person.getDni();
  if(next.equals(previous))throw bad("El DNI nuevo es igual al actual");
  User account=users.findByPersonId(person.getId()).orElse(null);
  if(account!=null&&!Boolean.TRUE.equals(request.confirmaCuenta()))throw new ApiException(HttpStatus.BAD_REQUEST,"DNI_ACCOUNT_CONFIRMATION_REQUIRED","La persona tiene una cuenta de usuario: confirme que el cambio de DNI no altera sus credenciales ni sus accesos",Map.of());
  if(persons.existsByDni(next))throw duplicate();
  person.setDni(next);
  try{persons.flush();} // la versión detecta cambios simultáneos y el índice único, un DNI tomado entre la consulta y la escritura
  catch(DataIntegrityViolationException e){throw duplicate();}
  catch(OptimisticLockingFailureException e){throw stale();}
  Patient patient=patients.findByPersonId(person.getId()).orElse(null);
  Map<String,Object> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
  before.put("terminacionAnterior",previous==null?null:tail(previous));
  after.put("terminacionNueva",tail(next));after.put("personaId",person.getId());after.put("cotejoDocumental",true);after.put("motivo",reason);
  if(account!=null){after.put("cuentaEstado",account.getEstadoCuenta());after.put("usuarioId",account.getId());}
  // Un solo criterio para ambos puntos de entrada: el evento cuelga de la ficha de paciente si la hay (misma historia que I-1) y, si no, de la cuenta.
  String entityType=patient!=null?"PATIENT_IDENTITY":"USER";
  Long entityId=patient!=null?patient.getId():account!=null?account.getId():person.getId();
  audit.record(null,users.getReferenceById(actorId),entityType,entityId,previous==null?"ASSIGN_DNI":"RECTIFY_DNI",asJson(before),asJson(after));
  return new Outcome(person.getId(),next,person.getVersion(),account==null?null:account.getEstadoCuenta());
 }

 /** Rectificación desde el detalle de usuario: la persona se resuelve siempre desde la cuenta, nunca desde un identificador suministrado. */
 @Transactional
 public Outcome rectifyUserDni(Long userId,RectifyDni request,Long actorId){
  User user=users.findWithPersonById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  return rectifyDni(user.getPerson(),request,actorId);
 }

 private static String tail(String dni){return dni.substring(Math.max(0,dni.length()-4));}
 private String text(String value,String field,int max){
  if(value==null||value.isBlank())throw bad("El "+field+" es obligatorio");
  String result=value.trim().replaceAll("\\s+"," ");
  if(result.length()>max||result.chars().anyMatch(Character::isISOControl))throw bad("El "+field+" es inválido");
  return result;
 }
 private String asJson(Map<String,Object> values){try{return json.writeValueAsString(values);}catch(Exception e){throw new IllegalStateException("No se pudo registrar la auditoría",e);}}
 private static ApiException bad(String message){return new ApiException(HttpStatus.BAD_REQUEST,message);}
 static ApiException stale(){return new ApiException(HttpStatus.CONFLICT,"PATIENT_STALE_IDENTITY","La identidad cambió; vuelva a cargar la ficha",Map.of());}
 /** No identifica a la otra persona: el administrador sabe que el DNI está tomado, no de quién. */
 private static ApiException duplicate(){return new ApiException(HttpStatus.CONFLICT,"DNI_ALREADY_REGISTERED","Ese DNI ya está registrado para otra persona. No se fusionan identidades: si es la misma persona, requiere un procedimiento de fusión aparte",Map.of());}
}
