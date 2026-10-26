package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AuthDtos.*;
import com.vuelossanitarios.backend.domain.person.ContactNormalizer;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import com.vuelossanitarios.backend.domain.person.EmailVerification;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import com.vuelossanitarios.backend.domain.person.PhoneNumbers;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.EmailContactRepository;
import com.vuelossanitarios.backend.repository.PersonRepository;
import com.vuelossanitarios.backend.repository.PhoneContactRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mantenimiento que cada usuario hace de los contactos de <b>su propia persona</b>. Los contactos pertenecen a {@code personas}
 * (la identidad compartida con una eventual ficha de paciente), no a la cuenta: cambiarlos no toca credenciales, roles, vuelos ni
 * la identidad (DNI, nombre, versión de la persona).
 *
 * <ul>
 * <li>Sólo se opera sobre la persona del usuario autenticado; un identificador de otra persona, retirado o inexistente responde igual (404).</li>
 * <li>Cada operación bloquea la fila de la persona: las operaciones sobre sus contactos se serializan (último contacto, principal único).</li>
 * <li>Retirar un contacto es una baja lógica con fecha y responsable; siempre queda al menos un correo y un teléfono vigentes.</li>
 * <li>Un mismo valor no puede estar dos veces vigente en la misma persona (correo en minúsculas; teléfono en E.164); entre personas distintas
 *     se permite (p. ej. un teléfono familiar) y no se informa si otra persona ya lo usa.</li>
 * <li><b>Correos:</b> un correo nuevo nace sin verificar y no puede ser el principal hasta confirmarse ({@link EmailVerificationService}). Una dirección
 *     verificada no se sobrescribe: se agrega la nueva, se confirma y después se retira la anterior. No se retira el único correo verificado.</li>
 * <li><b>Teléfonos:</b> exigen país y se validan con las reglas de numeración de ese país ({@link PhoneNumbers}); se guardan en E.164 y formato
 *     internacional. Los datos anteriores sin país se conservan y se validan cuando su titular los edita con el país. Validar el formato
 *     no es verificar la línea: no hay verificación por SMS.</li>
 * <li>Cada cambio se audita en la misma transacción, con el valor parcialmente oculto.</li>
 * </ul>
 */
@Service public class PersonContactService {
 private static final ObjectMapper JSON=new ObjectMapper();
 private final UserRepository users; private final PersonRepository persons; private final EmailContactRepository emails; private final PhoneContactRepository phones; private final AuditService audit; private final Clock clock; private final EmailVerificationService verification;
 public PersonContactService(UserRepository u,PersonRepository p,EmailContactRepository e,PhoneContactRepository ph,AuditService a,Clock c,EmailVerificationService v){users=u;persons=p;emails=e;phones=ph;audit=a;clock=c;verification=v;}

 // ---- correos ----
 @Transactional public ContactView addEmail(Long userId,ContactRequest r){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();String value=email(r.direccion()),type=type(r.tipo());
  List<EmailContact> current=emails.findActiveByPersonId(pid);
  if(current.stream().anyMatch(x->x.getDireccionNormalizada().equals(ContactNormalizer.email(value))))throw duplicate("correo electrónico");
  EmailContact e=new EmailContact();e.setPerson(u.getPerson());e.setDireccion(value);e.setTipo(type);e.setPrincipal(current.isEmpty());
  e=emails.saveAndFlush(e);audit(u,"PERSON_EMAIL",e.getId(),"CREATE",null,snapshot(ContactNormalizer.maskEmail(value),type,e.getPrincipal(),null,EmailVerificationService.UNVERIFIED));
  return emailView(e,EmailVerificationService.UNVERIFIED,null);
 }
 /** Estado actual de un correo propio (sin modificar nada). */
 @Transactional(readOnly=true) public ContactView emailContact(Long userId,Long id){
  User u=users.findWithPersonById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  EmailContact e=emails.findActiveByIdAndPersonId(id,u.getPerson().getId()).orElseThrow(()->notFound("Correo"));
  return emailView(e,verification.stateOf(e),null);
 }
 @Transactional public ContactView updateEmail(Long userId,Long id,ContactUpdateRequest r){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();EmailContact e=emails.findActiveByIdAndPersonId(id,pid).orElseThrow(()->notFound("Correo"));
  String type=type(r.tipo());
  if(!Objects.equals(e.getVersion(),r.version()))throw versionConflict();
  boolean sameAddress=ContactNormalizer.email(r.direccion()).equals(e.getDireccionNormalizada());
  String value=sameAddress?e.getDireccion():email(r.direccion());   // una dirección anterior que no cambia no se revalida (no se bloquea al titular por reglas nuevas)
  if(!sameAddress){
   if(e.isVerificado())throw new ApiException(HttpStatus.CONFLICT,"EMAIL_VERIFIED_IMMUTABLE","Un correo verificado no se reemplaza en el lugar: agregue el nuevo correo, confírmelo con el código y luego retire el anterior",Map.of());
   if(emails.findActiveByPersonId(pid).stream().anyMatch(x->!x.getId().equals(id)&&x.getDireccionNormalizada().equals(ContactNormalizer.email(value))))throw duplicate("correo electrónico");
  }
  if(sameAddress&&type.equals(e.getTipo()))return emailView(e,verification.stateOf(e),null);
  String before=snapshot(ContactNormalizer.maskEmail(e.getDireccion()),e.getTipo(),e.getPrincipal(),null,verification.stateOf(e));
  if(!sameAddress)e.setDireccion(value);
  e.setTipo(type);   // un solo cambio de versión por edición: ambos campos se modifican antes de cualquier flush
  if(!sameAddress)verification.invalidateOpen(id,EmailVerification.ADDRESS_CHANGED);
  e=emails.saveAndFlush(e);String state=verification.stateOf(e);
  audit(u,"PERSON_EMAIL",e.getId(),"UPDATE",before,snapshot(ContactNormalizer.maskEmail(value),type,e.getPrincipal(),null,state));
  return emailView(e,state,null);
 }
 @Transactional public void removeEmail(Long userId,Long id){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();EmailContact e=emails.findActiveByIdAndPersonId(id,pid).orElseThrow(()->notFound("Correo"));
  List<EmailContact> current=emails.findActiveByPersonId(pid);
  if(current.size()<=1)throw lastContact("correo electrónico");
  if(e.isVerificado()&&current.stream().noneMatch(x->!x.getId().equals(id)&&x.isVerificado()))
   throw new ApiException(HttpStatus.CONFLICT,"LAST_VERIFIED_EMAIL","Es su único correo verificado: confirme otro correo antes de retirar este",Map.of());
  String before=snapshot(ContactNormalizer.maskEmail(e.getDireccion()),e.getTipo(),e.getPrincipal(),null,e.isVerificado()?EmailVerificationService.VERIFIED:EmailVerificationService.UNVERIFIED);boolean wasMain=Boolean.TRUE.equals(e.getPrincipal());
  e.darDeBaja(now(),u,"RETIRO");emails.saveAndFlush(e);verification.invalidateOpen(id,EmailVerification.ADDRESS_REMOVED);
  Long promoted=null;
  if(wasMain){EmailContact next=current.stream().filter(x->!x.getId().equals(id)).min(Comparator.comparing((EmailContact x)->!x.isVerificado()).thenComparing(EmailContact::getId)).orElseThrow();next.setPrincipal(true);emails.saveAndFlush(next);promoted=next.getId();}
  audit(u,"PERSON_EMAIL",id,"REMOVE",before,removal(promoted));
 }
 @Transactional public void makePrimaryEmail(Long userId,Long id){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();EmailContact target=emails.findActiveByIdAndPersonId(id,pid).orElseThrow(()->notFound("Correo"));
  if(Boolean.TRUE.equals(target.getPrincipal()))return;
  if(!target.isVerificado())throw new ApiException(HttpStatus.CONFLICT,"EMAIL_NOT_VERIFIED","Confirme el correo con el código que recibe en esa dirección antes de hacerlo principal",Map.of());
  Long previous=null;
  for(EmailContact x:emails.findActiveByPersonId(pid))if(Boolean.TRUE.equals(x.getPrincipal())){x.setPrincipal(false);emails.saveAndFlush(x);previous=x.getId();}
  target.setPrincipal(true);emails.saveAndFlush(target);
  audit(u,"PERSON_EMAIL",id,"SET_PRIMARY",primary("principalAnteriorId",previous),primary("principalId",id));
 }

 // ---- teléfonos ----
 @Transactional public ContactView addPhone(Long userId,PhoneRequest r){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();PhoneNumbers.Parsed number=phone(r.numero(),r.pais());String type=type(r.tipo());
  List<PhoneContact> current=phones.findActiveByPersonId(pid);
  rejectDuplicate(current,null,number);
  PhoneContact p=new PhoneContact();p.setPerson(u.getPerson());p.setValidated(number);p.setTipo(type);p.setPrincipal(current.isEmpty());
  p=phones.saveAndFlush(p);audit(u,"PERSON_PHONE",p.getId(),"CREATE",null,snapshot(ContactNormalizer.maskPhone(number.e164()),type,p.getPrincipal(),number.region(),null));
  return phoneView(p);
 }
 @Transactional public ContactView updatePhone(Long userId,Long id,PhoneUpdateRequest r){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();PhoneContact p=phones.findActiveByIdAndPersonId(id,pid).orElseThrow(()->notFound("Teléfono"));
  PhoneNumbers.Parsed number=phone(r.numero(),r.pais());String type=type(r.tipo());
  if(!Objects.equals(p.getVersion(),r.version()))throw versionConflict();
  rejectDuplicate(phones.findActiveByPersonId(pid),id,number);
  if(number.e164().equals(p.getNumeroNormalizado())&&number.region().equals(p.getCodigoPais())&&type.equals(p.getTipo()))return phoneView(p);
  String before=snapshot(ContactNormalizer.maskPhone(p.getNumeroNormalizado()),p.getTipo(),p.getPrincipal(),p.getCodigoPais(),null);
  p.setValidated(number);p.setTipo(type);p=phones.saveAndFlush(p);
  audit(u,"PERSON_PHONE",p.getId(),"UPDATE",before,snapshot(ContactNormalizer.maskPhone(number.e164()),type,p.getPrincipal(),number.region(),null));
  return phoneView(p);
 }
 @Transactional public void removePhone(Long userId,Long id){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();PhoneContact p=phones.findActiveByIdAndPersonId(id,pid).orElseThrow(()->notFound("Teléfono"));
  List<PhoneContact> current=phones.findActiveByPersonId(pid);
  if(current.size()<=1)throw lastContact("teléfono");
  String before=snapshot(ContactNormalizer.maskPhone(p.getNumeroNormalizado()),p.getTipo(),p.getPrincipal(),p.getCodigoPais(),null);boolean wasMain=Boolean.TRUE.equals(p.getPrincipal());
  p.darDeBaja(now(),u,"RETIRO");phones.saveAndFlush(p);
  Long promoted=null;
  if(wasMain){PhoneContact next=current.stream().filter(x->!x.getId().equals(id)).min(Comparator.comparing((PhoneContact x)->!x.isValidado()).thenComparing(PhoneContact::getId)).orElseThrow();next.setPrincipal(true);phones.saveAndFlush(next);promoted=next.getId();}
  audit(u,"PERSON_PHONE",id,"REMOVE",before,removal(promoted));
 }
 @Transactional public void makePrimaryPhone(Long userId,Long id){
  User u=lockOwner(userId);Long pid=u.getPerson().getId();PhoneContact target=phones.findActiveByIdAndPersonId(id,pid).orElseThrow(()->notFound("Teléfono"));
  if(Boolean.TRUE.equals(target.getPrincipal()))return;
  Long previous=null;
  for(PhoneContact x:phones.findActiveByPersonId(pid))if(Boolean.TRUE.equals(x.getPrincipal())){x.setPrincipal(false);phones.saveAndFlush(x);previous=x.getId();}
  target.setPrincipal(true);phones.saveAndFlush(target);
  audit(u,"PERSON_PHONE",id,"SET_PRIMARY",primary("principalAnteriorId",previous),primary("principalId",id));
 }

 // ---- apoyo ----
 /** Carga la cuenta autenticada y bloquea la fila de su persona: nunca se opera sobre otra persona. */
 private User lockOwner(Long userId){
  User u=users.findWithPersonById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  persons.lockById(u.getPerson().getId());return u;
 }
 private String email(String raw){String problem=ContactNormalizer.emailProblem(raw);if(problem!=null)throw invalid(problem,"correo",null);return raw.trim();}
 private PhoneNumbers.Parsed phone(String raw,String country){
  try{return PhoneNumbers.parse(raw,country);}catch(PhoneNumbers.Rejected r){throw invalid(r.getMessage(),"telefono",r.reason());}
 }
 /** Duplicado por el valor normalizado (E.164) o por un dato anterior sin país que coincide con el número (con o sin prefijo de país). */
 private void rejectDuplicate(List<PhoneContact> current,Long excludeId,PhoneNumbers.Parsed number){
  for(PhoneContact x:current){
   if(x.getId().equals(excludeId))continue;
   if(x.getNumeroNormalizado().equals(number.e164()))throw duplicate("teléfono");
   if(!x.isValidado()&&legacyMatches(x.getNumeroNormalizado(),number))
    throw new ApiException(HttpStatus.CONFLICT,"CONTACT_DUPLICATE","Ya tiene registrado ese teléfono sin validar: edítelo e indique su país en lugar de agregarlo de nuevo",Map.of());
  }
 }
 private static boolean legacyMatches(String legacy,PhoneNumbers.Parsed number){
  String digits=legacy.startsWith("+")?legacy.substring(1):legacy;
  return digits.equals(number.e164().substring(1))||digits.equals(number.national())||digits.equals("0"+number.national());
 }
 private String type(String raw){String t=ContactNormalizer.type(raw);if(t==null)throw invalid("El tipo de contacto debe ser PERSONAL o LABORAL",null,null);return t;}
 private LocalDateTime now(){return LocalDateTime.now(clock);}
 private void audit(User actor,String entity,Long id,String op,String before,String after){audit.record(null,actor,entity,id,op,before,after);}
 private ContactView emailView(EmailContact e,String state,String sent){return new ContactView(e.getId(),e.getDireccion(),e.getTipo(),Boolean.TRUE.equals(e.getPrincipal()),e.getVersion(),null,state,sent);}
 private ContactView phoneView(PhoneContact p){return new ContactView(p.getId(),p.getNumero(),p.getTipo(),Boolean.TRUE.equals(p.getPrincipal()),p.getVersion(),p.getCodigoPais(),null,null);}
 private String snapshot(String maskedValue,String type,Boolean main,String country,String verificationState){Map<String,Object> m=new LinkedHashMap<>();m.put("valor",maskedValue);m.put("tipo",type);m.put("principal",Boolean.TRUE.equals(main));if(country!=null)m.put("pais",country);if(verificationState!=null)m.put("verificacion",verificationState);return json(m);}
 private String removal(Long promotedId){Map<String,Object> m=new LinkedHashMap<>();m.put("motivo","RETIRO");if(promotedId!=null)m.put("principalPromovidoId",promotedId);return json(m);}
 private String primary(String key,Long id){Map<String,Object> m=new LinkedHashMap<>();m.put(key,id);return json(m);}
 private String json(Map<String,Object> m){try{return JSON.writeValueAsString(m);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 private ApiException invalid(String m,String field,String reason){Map<String,Object> d=new LinkedHashMap<>();if(field!=null)d.put("campo",field);if(reason!=null)d.put("motivo",reason);return new ApiException(HttpStatus.BAD_REQUEST,"CONTACT_INVALID",m,d);}
 private ApiException notFound(String what){return new ApiException(HttpStatus.NOT_FOUND,what+" inexistente");}
 private ApiException duplicate(String what){return new ApiException(HttpStatus.CONFLICT,"CONTACT_DUPLICATE","Ya tiene registrado ese "+what,Map.of());}
 private ApiException lastContact(String what){return new ApiException(HttpStatus.CONFLICT,"LAST_CONTACT_REQUIRED","Debe conservar al menos un "+what+"; agregue otro antes de retirar este",Map.of());}
 private ApiException versionConflict(){return new ApiException(HttpStatus.CONFLICT,"CONTACT_VERSION_CONFLICT","El contacto fue modificado por otra operación. Actualice los datos y reintente.",Map.of());}
}
