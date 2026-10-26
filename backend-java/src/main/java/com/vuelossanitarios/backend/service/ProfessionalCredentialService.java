package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProfessionalCredentialService {
 private final ProfessionalCredentialRepository credentials; private final CredentialDocumentRepository documents; private final UserRepository users;
 private final CrewRoleRepository roles; private final AuditEventRepository events; private final AuditService audit; private final DocumentStorage storage; private final ObjectMapper json; private final ZoneId zone;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private Clock clock;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private org.springframework.context.ApplicationEventPublisher publisher;
 public record CredentialChanged(Long userId){}
 public ProfessionalCredentialService(ProfessionalCredentialRepository c,CredentialDocumentRepository d,UserRepository u,CrewRoleRepository r,AuditEventRepository e,AuditService a,DocumentStorage s,ObjectMapper j,@Value("${app.business-time-zone:America/Argentina/Tucuman}") String z){credentials=c;documents=d;users=u;roles=r;events=e;audit=a;storage=s;json=j;zone=ZoneId.of(z);}
 public record Input(@NotBlank @Size(max=30) String roleCode,@NotBlank @Size(max=100) String type,@NotBlank @Size(max=100) String number,@NotBlank @Size(max=200) String issuer,LocalDate issued,LocalDate expires,Boolean noExpiry,@Size(max=4000) String notes){}
 public record Decision(@NotBlank @Size(max=4000) String notes,Boolean confirmsSufficiency){}
 public record DocumentView(Long id,String name,String uploader,LocalDateTime uploadedAt){}
 public record View(Long id,Long personId,String roleCode,String type,String number,String issuer,LocalDate issued,LocalDate expires,boolean noExpiry,String status,LocalDateTime verifiedAt,String verifier,String notes,boolean current,List<DocumentView> documents){}
 public record History(Long id,String operation,String actor,LocalDateTime at,String before,String after){}
 public record Download(byte[] data,String name){}
 private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}
 private User user(Long id){return users.findById(id).orElseThrow(()->bad("Usuario inexistente"));}
 private User lock(Long id){return users.lockById(id).orElseThrow(()->bad("Usuario inexistente"));}
 private ProfessionalCredential get(Long id){return credentials.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Habilitación inexistente"));}
 private ProfessionalCredential lockCredential(Long id){Long ownerId=credentials.findOwnerUserId(id);if(ownerId==null)throw new ApiException(HttpStatus.NOT_FOUND,"Habilitación inexistente");lock(ownerId);return get(id);}
 private String snap(ProfessionalCredential c){try{return json.writeValueAsString(Map.of("role",c.role.getCodigo(),"type",c.type,"number",c.number,"issuer",c.issuer,"issued",Objects.toString(c.issued,""),"expires",Objects.toString(c.expires,""),"noExpiry",Boolean.TRUE.equals(c.noExpiry),"status",c.status,"notes",Objects.toString(c.notes,"")));}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 private void record(ProfessionalCredential c,Long actor,String op,String before){audit.record(null,user(actor),"PROFESSIONAL_CREDENTIAL",c.getId(),op,before,snap(c));if(publisher!=null)publisher.publishEvent(new CredentialChanged(credentials.findOwnerUserId(c.getId())));}
 private void reset(ProfessionalCredential c){c.status="PENDIENTE";c.verifiedAt=null;c.verifier=null;}
 private void validatePdfTail(MultipartFile file){try{byte[] bytes=file.getBytes();int offset=Math.max(0,bytes.length-2048);String tail=new String(bytes,offset,bytes.length-offset,StandardCharsets.ISO_8859_1);var matcher=Pattern.compile("startxref\\s+(\\d+)\\s+%%EOF\\s*$").matcher(tail);if(!matcher.find())throw bad("El PDF no tiene un cierre estructural válido");long xref=Long.parseLong(matcher.group(1));if(xref<0||xref>=bytes.length)throw bad("El PDF contiene una referencia estructural inválida");}catch(IOException|NumberFormatException e){throw bad("No se pudo validar el PDF");}}
 private void fill(ProfessionalCredential c,Input i){if(!Set.of("COMANDANTE","COPILOTO","MEDICO","ENFERMERO").contains(i.roleCode()))throw bad("Función de tripulación inválida");if(i.issued()!=null&&i.expires()!=null&&i.expires().isBefore(i.issued()))throw bad("El vencimiento no puede preceder a la emisión");if(Boolean.TRUE.equals(i.noExpiry())&&i.expires()!=null)throw bad("Indique vencimiento o declare que no aplica, no ambos");c.role=roles.findByCodigo(i.roleCode()).orElseThrow(()->bad("Función inexistente"));c.type=i.type().trim();c.number=i.number().trim();c.issuer=i.issuer().trim();c.issued=i.issued();c.expires=i.expires();c.noExpiry=Boolean.TRUE.equals(i.noExpiry());c.notes=i.notes()==null?null:i.notes().trim();}
 private LocalDate today(){return LocalDate.now(clock==null?Clock.system(zone):clock.withZone(zone));}
 private boolean current(ProfessionalCredential c,LocalDate on){LocalDate today=today();return "VERIFICADA".equals(c.status)&&(c.issued==null||(!c.issued.isAfter(today)&&!c.issued.isAfter(on)))&&(c.expires!=null?(!c.expires.isBefore(today)&&!c.expires.isBefore(on)):Boolean.TRUE.equals(c.noExpiry));}
 /** La fecha de vencimiento incluye todo el día local. La salida es el hito exigido por la regla operativa existente. */
 public record Assessment(boolean eligible,String code,String message,LocalDate expires){}
 public Assessment assess(User u,String role,LocalDate on){
  if(u.getPerson()==null)return new Assessment(false,"HABILITACION_AUSENTE","No tiene habilitación profesional para esta función",null);
  LocalDate date=on==null?today():on;
  List<ProfessionalCredential> all=credentials.findByPersonIdOrderByIdDesc(u.getPerson().getId()).stream().filter(c->role.equals(c.role.getCodigo())).toList();
  for(ProfessionalCredential c:all)if(current(c,date)){
   if(c.expires!=null&&!c.expires.isAfter(today().plusDays(30)))return new Assessment(true,"HABILITACION_POR_VENCER","La habilitación vence el "+c.expires,c.expires);
   return new Assessment(true,"ELEGIBLE","Habilitación verificada y vigente",c.expires);
  }
  if(!all.isEmpty()){
   ProfessionalCredential latest=all.get(0);
   if("REVOCADA".equals(latest.status))return new Assessment(false,"HABILITACION_REVOCADA","La verificación de la habilitación fue revocada",latest.expires);
   if("RECHAZADA".equals(latest.status))return new Assessment(false,"HABILITACION_RECHAZADA","La verificación de la habilitación fue rechazada",latest.expires);
   if("VERIFICADA".equals(latest.status)&&latest.expires!=null&&(latest.expires.isBefore(today())||latest.expires.isBefore(date)))return new Assessment(false,"HABILITACION_VENCIDA","La habilitación vence antes de la salida o ya venció",latest.expires);
   return new Assessment(false,"HABILITACION_NO_VERIFICADA","La habilitación requiere verificación vigente",null);
  }
  return new Assessment(false,"HABILITACION_AUSENTE","No tiene habilitación profesional para esta función",null);
 }
 private View view(ProfessionalCredential c){return new View(c.getId(),c.person.getId(),c.role.getCodigo(),c.type,c.number,c.issuer,c.issued,c.expires,Boolean.TRUE.equals(c.noExpiry),c.status,c.verifiedAt,c.verifier==null?null:c.verifier.getUsername(),c.notes,current(c,today()),documents.findByCredentialIdOrderByIdDesc(c.getId()).stream().map(d->new DocumentView(d.getId(),d.name,d.uploader.getUsername(),d.uploadedAt)).toList());}
 @Transactional(readOnly=true) public List<View> list(Long userId){User u=user(userId);return credentials.findByPersonIdOrderByIdDesc(u.getPerson().getId()).stream().map(this::view).toList();}
 @Transactional public View create(Long userId,Input input,Long actor){User owner=lock(userId);ProfessionalCredential c=new ProfessionalCredential();c.person=owner.getPerson();fill(c,input);credentials.saveAndFlush(c);record(c,actor,"CREATE",null);return view(c);}
 @Transactional public View update(Long id,Input input,Long actor){ProfessionalCredential c=lockCredential(id);String before=snap(c);fill(c,input);reset(c);record(c,actor,"UPDATE",before);return view(c);}
 @Transactional public View upload(Long id,MultipartFile file,Long actor){ProfessionalCredential c=lockCredential(id);String before=snap(c);String key=storage.storePdf(file);TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED)storage.deleteQuietly(key);}});validatePdfTail(file);String name=Objects.toString(file.getOriginalFilename(),"documento.pdf").replace('\\','/');name=name.substring(name.lastIndexOf('/')+1);if(name.length()>255)throw bad("Nombre de archivo demasiado largo");CredentialDocument d=new CredentialDocument();d.credential=c;d.key=key;d.name=name;d.uploader=user(actor);documents.saveAndFlush(d);reset(c);record(c,actor,"UPLOAD_DOCUMENT",before);return view(c);}
 @Transactional public View decide(Long id,String action,Decision decision,Long actor){ProfessionalCredential c=lockCredential(id);String before=snap(c);if(!Set.of("VERIFICADA","RECHAZADA","REVOCADA").contains(action))throw bad("Acción inválida");if("VERIFICADA".equals(action)){if(!Boolean.TRUE.equals(decision.confirmsSufficiency()))throw bad("Confirme la revisión manual y suficiencia para la función indicada");if(!documents.existsByCredentialId(id))throw bad("Adjunte documentación antes de verificar");if(c.expires==null&&!Boolean.TRUE.equals(c.noExpiry))throw bad("Indique el vencimiento o confirme expresamente que no aplica");if(c.issued!=null&&c.issued.isAfter(today()))throw bad("La credencial aún no fue emitida");}if("REVOCADA".equals(action)&&!"VERIFICADA".equals(c.status))throw bad("Sólo puede revocarse una verificación vigente");c.status=action;c.verifiedAt=LocalDateTime.now(clock==null?Clock.system(zone):clock.withZone(zone));c.verifier=user(actor);c.notes=decision.notes().trim();record(c,actor,action,before);return view(c);}
 @Transactional(readOnly=true) public Download download(Long documentId){CredentialDocument d=documents.findById(documentId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Documento inexistente"));return new Download(storage.read(d.key).bytes(),d.name);}
 @Transactional(readOnly=true) public List<History> history(Long id){get(id);return events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("PROFESSIONAL_CREDENTIAL",id).stream().map(e->new History(e.getId(),e.getOperation(),e.getActor()==null?null:e.getActor().getUsername(),AuditService.toLocal(e.getOccurredAt(),zone),e.getOldValues(),e.getNewValues())).toList();}
}
