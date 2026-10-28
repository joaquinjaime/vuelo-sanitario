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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ciclo de vida de las habilitaciones profesionales y su evaluación de suficiencia.
 * <p>
 * Estados administrativos: PENDIENTE → VERIFICADA | RECHAZADA | CORRECCION_SOLICITADA; VERIFICADA → REVOCADA; la modificación de una habilitación
 * no revocada la devuelve a PENDIENTE (revisión por cambios relevantes). El vencimiento no es un estado almacenado: se deriva de la fecha y del
 * reloj de negocio. La verificación es una revisión interna manual; una consulta a un organismo se registra aparte y nunca equivale a una
 * validación emitida por él. Toda operación toma el bloqueo del usuario titular, el mismo que usan la clasificación y la asignación de tripulación.
 */
@Service
public class ProfessionalCredentialService {
 public static final Set<String> ROLES=Set.of("COMANDANTE","COPILOTO","MEDICO","ENFERMERO");
 private final ProfessionalCredentialRepository credentials; private final CredentialDocumentRepository documents; private final UserRepository users;
 private final CrewRoleRepository roles; private final ProvinceRepository provinces; private final CredentialPolicyRepository policies; private final CredentialDecisionRepository decisions;
 private final ExternalCredentialCheckRepository checks; private final AuditEventRepository events; private final AuditService audit; private final ObjectMapper json; private final ZoneId zone; private final Clock clock;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private org.springframework.context.ApplicationEventPublisher publisher;
 public record CredentialChanged(Long userId){}
 public ProfessionalCredentialService(ProfessionalCredentialRepository c,CredentialDocumentRepository d,UserRepository u,CrewRoleRepository r,ProvinceRepository pr,CredentialPolicyRepository po,CredentialDecisionRepository de,
   ExternalCredentialCheckRepository ch,AuditEventRepository e,AuditService a,ObjectMapper j,Clock clock,@Value("${app.business-time-zone:America/Argentina/Tucuman}") String z){
  credentials=c;documents=d;users=u;roles=r;provinces=pr;policies=po;decisions=de;checks=ch;events=e;audit=a;json=j;this.clock=clock;zone=ZoneId.of(z);}
 public record Input(@NotBlank @Size(max=30) String roleCode,@NotBlank @Size(max=100) String type,@NotBlank @Size(max=100) String number,@NotBlank @Size(max=200) String issuer,LocalDate issued,LocalDate expires,Boolean noExpiry,@Size(max=4000) String notes,
   @Size(max=50) String aircraftCategory,Long jurisdictionId,@Size(max=1000) String restrictions){}
 public record Decision(@NotBlank @Size(max=4000) String notes,Boolean confirmsSufficiency,Boolean acceptsRestrictions){}
 public record ExternalCheckInput(@NotBlank @Size(max=20) String authority,LocalDateTime consultedAt,@NotBlank @Size(max=1000) String comparedData,@NotBlank @Size(max=20) String result,@Size(max=2000) String notes,Long evidenceDocumentId){}
 public record DocumentView(Long id,String name,String uploader,LocalDateTime uploadedAt,String purpose,int version,String sha256,Long sizeBytes,String scanStatus,String scanDetail,LocalDateTime scannedAt,boolean retired,LocalDateTime retiredAt,String retireReason,boolean retentionHold,String holdReason,Long replacesId){}
 public record ExternalCheckView(Long id,String authority,String authorityUrl,LocalDateTime consultedAt,String responsible,String numberChecked,String comparedData,String result,String notes,Long evidenceDocumentId){}
 public record EligibilityView(boolean eligible,String code,String message){}
 public record View(Long id,Long personId,String roleCode,String type,String number,String issuer,LocalDate issued,LocalDate expires,boolean noExpiry,String status,LocalDateTime verifiedAt,String verifier,String notes,boolean current,List<DocumentView> documents,
   String aircraftCategory,Long jurisdictionId,String jurisdiction,String restrictions,Long renewsId,String lifecycle,String documentStatus,ExternalCheckView externalCheck,String validationKind,EligibilityView eligibility,String lastDecisionReason){}
 public record History(Long id,String operation,String actor,LocalDateTime at,String before,String after){}
 public record DecisionView(Long id,String type,String resultingStatus,String actor,LocalDateTime at,String reason,Long documentId){}
 private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}
 private ApiException conflict(String code,String s){return new ApiException(HttpStatus.CONFLICT,code,s,Map.of());}
 private User user(Long id){return users.findById(id).orElseThrow(()->bad("Usuario inexistente"));}
 private User lock(Long id){return users.lockById(id).orElseThrow(()->bad("Usuario inexistente"));}
 private ProfessionalCredential get(Long id){return credentials.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Habilitación inexistente"));}
 /** Bloquea al titular y devuelve la habilitación ya releída. */
 ProfessionalCredential lockCredential(Long id){Long ownerId=credentials.findOwnerUserId(id);if(ownerId==null)throw new ApiException(HttpStatus.NOT_FOUND,"Habilitación inexistente");lock(ownerId);return get(id);}
 void forbidSelfReview(Long credentialId,Long actor){Long ownerId=credentials.findOwnerUserId(credentialId);if(Objects.equals(ownerId,actor))throw new ApiException(HttpStatus.FORBIDDEN,"AUTO_VERIFICACION_HABILITACION_NO_PERMITIDA","La persona titular de una habilitación no puede verificarla, rechazarla, revocarla ni gestionar su documentación y consultas por sí misma",Map.of());}
 String snap(ProfessionalCredential c){
  Map<String,Object> m=new LinkedHashMap<>();m.put("role",c.role.getCodigo());m.put("type",c.type);m.put("number",c.number);m.put("issuer",c.issuer);m.put("issued",Objects.toString(c.issued,""));m.put("expires",Objects.toString(c.expires,""));
  m.put("noExpiry",Boolean.TRUE.equals(c.noExpiry));m.put("status",c.status);m.put("notes",Objects.toString(c.notes,""));m.put("aircraftCategory",Objects.toString(c.aircraftCategory,""));m.put("jurisdictionId",c.jurisdiction==null?"":c.jurisdiction.getId());m.put("restrictions",Objects.toString(c.restrictions,""));
  try{return json.writeValueAsString(m);}catch(JsonProcessingException e){throw new IllegalStateException(e);}
 }
 void record(ProfessionalCredential c,Long actor,String op,String before){audit.record(null,user(actor),"PROFESSIONAL_CREDENTIAL",c.getId(),op,before,snap(c));changed(c);}
 void changed(ProfessionalCredential c){if(publisher!=null)publisher.publishEvent(new CredentialChanged(credentials.findOwnerUserId(c.getId())));}
 CredentialDecision decision(ProfessionalCredential c,Long actor,String type,String reason,CredentialDocument document){
  CredentialDecision d=new CredentialDecision();d.credential=c;d.type=type;d.resultingStatus=c.status;d.actor=user(actor);d.at=LocalDateTime.ofInstant(clock.instant(),zone);d.reason=reason;d.document=document;return decisions.saveAndFlush(d);
 }
 void reset(ProfessionalCredential c){c.status="PENDIENTE";c.verifiedAt=null;c.verifier=null;}
 private void fill(ProfessionalCredential c,Input i){
  if(!ROLES.contains(i.roleCode()))throw bad("Función de tripulación inválida");
  if(i.issued()!=null&&i.expires()!=null&&i.expires().isBefore(i.issued()))throw bad("El vencimiento no puede preceder a la emisión");
  if(Boolean.TRUE.equals(i.noExpiry())&&i.expires()!=null)throw bad("Indique vencimiento o declare que no aplica, no ambos");
  c.role=roles.findByCodigo(i.roleCode()).orElseThrow(()->bad("Función inexistente"));c.type=i.type().trim();c.number=i.number().trim();c.issuer=i.issuer().trim();c.issued=i.issued();c.expires=i.expires();c.noExpiry=Boolean.TRUE.equals(i.noExpiry());
  c.notes=blank(i.notes());c.aircraftCategory=blank(i.aircraftCategory());c.restrictions=blank(i.restrictions());
  c.jurisdiction=i.jurisdictionId()==null?null:provinces.findById(i.jurisdictionId()).orElseThrow(()->bad("Jurisdicción inexistente"));
 }
 private static String blank(String s){return s==null||s.isBlank()?null:s.trim();}
 private LocalDate today(){return LocalDate.now(clock.withZone(zone));}
 private LocalDateTime now(){return LocalDateTime.ofInstant(clock.instant(),zone);}
 private boolean current(ProfessionalCredential c,LocalDate on){LocalDate today=today();return "VERIFICADA".equals(c.status)&&(c.issued==null||(!c.issued.isAfter(today)&&!c.issued.isAfter(on)))&&(c.expires!=null?(!c.expires.isBefore(today)&&!c.expires.isBefore(on)):Boolean.TRUE.equals(c.noExpiry));}
 private boolean externalCheckPassed(ProfessionalCredential c){return checks.findFirstByCredentialIdOrderByIdDesc(c.getId()).filter(k->ExternalCredentialCheck.MATCH.equals(k.result)&&Objects.equals(k.numberChecked,c.number)).isPresent();}
 /** La fecha de vencimiento incluye todo el día local. La salida es el hito exigido por la regla operativa existente. */
 public record Assessment(boolean eligible,String code,String message,LocalDate expires){}
 public Assessment assess(User u,String role,LocalDate on){return assess(u,role,on,CredentialSufficiency.Context.ANY);}
 public Assessment assess(User u,String role,LocalDate on,CredentialSufficiency.Context context){
  if(u.getPerson()==null)return new Assessment(false,"HABILITACION_AUSENTE","No tiene habilitación profesional para esta función",null);
  LocalDate date=on==null?today():on;
  List<ProfessionalCredential> all=credentials.findByPersonIdOrderByIdDesc(u.getPerson().getId()).stream().filter(c->role.equals(c.role.getCodigo())).toList();
  List<ProfessionalCredential> currents=all.stream().filter(c->current(c,date)).toList();
  if(!currents.isEmpty()){
   var outcome=CredentialSufficiency.evaluate(policies.findActiveByRole(role),currents,context,this::externalCheckPassed);
   if(!outcome.sufficient())return new Assessment(false,outcome.code(),outcome.message(),null);
   ProfessionalCredential c=outcome.credential();String restriction=c.restrictions==null?"":" Restricciones registradas: "+c.restrictions;
   if(c.expires!=null&&!c.expires.isAfter(today().plusDays(30)))return new Assessment(true,"HABILITACION_POR_VENCER","La habilitación vence el "+c.expires+"."+restriction,c.expires);
   return new Assessment(true,"ELEGIBLE",outcome.message()+"."+restriction,c.expires);
  }
  if(!all.isEmpty()){
   ProfessionalCredential latest=all.get(0);
   if("REVOCADA".equals(latest.status))return new Assessment(false,"HABILITACION_REVOCADA","La verificación de la habilitación fue revocada",latest.expires);
   if("RECHAZADA".equals(latest.status))return new Assessment(false,"HABILITACION_RECHAZADA","La verificación de la habilitación fue rechazada",latest.expires);
   if("CORRECCION_SOLICITADA".equals(latest.status))return new Assessment(false,"HABILITACION_CORRECCION_PENDIENTE","La habilitación tiene una corrección solicitada pendiente",latest.expires);
   // Una habilitación verificada que vence antes de la fecha evaluada explica mejor la negativa que una renovación todavía pendiente.
   var expired=all.stream().filter(c->"VERIFICADA".equals(c.status)&&c.expires!=null&&(c.expires.isBefore(today())||c.expires.isBefore(date))).findFirst();
   if(expired.isPresent()){boolean renewing=all.stream().anyMatch(c->"PENDIENTE".equals(c.status)||"CORRECCION_SOLICITADA".equals(c.status));return new Assessment(false,"HABILITACION_VENCIDA","La habilitación vence antes de la salida o ya venció"+(renewing?"; hay una renovación pendiente de revisión":""),expired.get().expires);}
   return new Assessment(false,"HABILITACION_NO_VERIFICADA","La habilitación requiere verificación vigente",null);
  }
  return new Assessment(false,"HABILITACION_AUSENTE","No tiene habilitación profesional para esta función",null);
 }
 static DocumentView documentView(CredentialDocument d){return new DocumentView(d.getId(),d.name,d.uploader.getUsername(),d.uploadedAt,d.purpose,d.version,d.sha256,d.sizeBytes,d.scanStatus,d.scanDetail,d.scannedAt,d.retiredAt!=null,d.retiredAt,d.retireReason,Boolean.TRUE.equals(d.retentionHold),d.holdReason,d.replacesId);}
 /** Estado documental de la habilitación: lo pendiente o fallido bloquea; un documento rechazado no oculta que exista documentación limpia (el rechazado sigue visible en la lista). */
 private String documentStatus(List<CredentialDocument> active){
  if(active.isEmpty())return "SIN_DOCUMENTOS";
  if(active.stream().anyMatch(d->CredentialDocument.SCAN_ERROR.equals(d.scanStatus)))return "ERROR_ANALISIS";
  if(active.stream().anyMatch(d->CredentialDocument.QUARANTINE.equals(d.scanStatus)))return "EN_ANALISIS";
  if(active.stream().anyMatch(d->CredentialDocument.CLEAN.equals(d.scanStatus)))return "LIMPIO";
  if(active.stream().anyMatch(d->CredentialDocument.REJECTED.equals(d.scanStatus)))return "RECHAZADO";
  return "LEGADO_SIN_ANALISIS";
 }
 private String lifecycle(ProfessionalCredential c){
  if(!"VERIFICADA".equals(c.status))return c.status;
  if(c.expires==null)return Boolean.TRUE.equals(c.noExpiry)?"VIGENTE":"SIN_VIGENCIA_DEFINIDA";
  if(c.expires.isBefore(today()))return "VENCIDA";
  return c.expires.isAfter(today().plusDays(30))?"VIGENTE":"POR_VENCER";
 }
 private View view(ProfessionalCredential c){
  List<CredentialDocument> all=documents.findByCredentialIdOrderByIdDesc(c.getId());List<CredentialDocument> active=all.stream().filter(CredentialDocument::isActive).toList();
  var check=checks.findFirstByCredentialIdOrderByIdDesc(c.getId()).map(this::checkView).orElse(null);
  User owner=users.findById(credentials.findOwnerUserId(c.getId())).orElse(null);Assessment a=owner==null?null:assess(owner,c.role.getCodigo(),null);
  String lastReason=decisions.findByCredentialIdOrderByIdDesc(c.getId()).stream().filter(d->Set.of("VERIFICADA","RECHAZADA","CORRECCION_SOLICITADA","REVOCADA").contains(d.type)).map(d->d.reason).findFirst().orElse(null);
  return new View(c.getId(),c.person.getId(),c.role.getCodigo(),c.type,c.number,c.issuer,c.issued,c.expires,Boolean.TRUE.equals(c.noExpiry),c.status,c.verifiedAt,c.verifier==null?null:c.verifier.getUsername(),c.notes,current(c,today()),
   all.stream().map(ProfessionalCredentialService::documentView).toList(),c.aircraftCategory,c.jurisdiction==null?null:c.jurisdiction.getId(),c.jurisdiction==null?null:c.jurisdiction.getNombre(),c.restrictions,c.renewsId,
   lifecycle(c),documentStatus(active),check,check==null?"REVISION_INTERNA_SIN_CONSULTA_EXTERNA":("COINCIDE".equals(check.result())?"REVISION_INTERNA_CON_CONSULTA_EXTERNA_MANUAL":"REVISION_INTERNA_CON_CONSULTA_EXTERNA_NO_COINCIDENTE"),
   a==null?null:new EligibilityView(a.eligible(),a.code(),a.message()),lastReason);
 }
 private ExternalCheckView checkView(ExternalCredentialCheck k){return new ExternalCheckView(k.getId(),k.authority,authorityUrl(k.authority),k.consultedAt,k.responsible.getUsername(),k.numberChecked,k.comparedData,k.result,k.notes,k.evidence==null?null:k.evidence.getId());}
 static String authorityUrl(String authority){return switch(authority){case "ANAC"->"https://www.argentina.gob.ar/anac/personal-aeronautico";case "REFEPS_SISA"->"https://www.argentina.gob.ar/salud/buscador-nacional-de-profesionales-de-la-salud";default->null;};}
 @Transactional(readOnly=true) public List<View> list(Long userId){User u=user(userId);return credentials.findByPersonIdOrderByIdDesc(u.getPerson().getId()).stream().map(this::view).toList();}
 @Transactional(readOnly=true) public View find(Long id){return view(get(id));}
 @Transactional public View create(Long userId,Input input,Long actor){
  User owner=lock(userId);ProfessionalCredential c=new ProfessionalCredential();c.person=owner.getPerson();fill(c,input);credentials.saveAndFlush(c);
  record(c,actor,"CREATE",null);decision(c,actor,"REGISTRO",c.notes,null);return view(c);
 }
 @Transactional public View update(Long id,Input input,Long actor){
  ProfessionalCredential c=lockCredential(id);
  if("REVOCADA".equals(c.status))throw conflict("HABILITACION_REVOCADA_NO_EDITABLE","Una habilitación revocada no se modifica: registre una nueva habilitación o una renovación");
  String before=snap(c);ProfessionalCredential probe=new ProfessionalCredential();probe.status=c.status;fill(probe,input);
  if(sameContent(c,probe))return view(c);
  boolean hadStatus=!"PENDIENTE".equals(c.status);fill(c,input);reset(c);record(c,actor,"UPDATE",before);decision(c,actor,"MODIFICACION",hadStatus?"Modificación que reinicia la revisión":"Modificación",null);return view(c);
 }
 private boolean sameContent(ProfessionalCredential a,ProfessionalCredential b){
  return a.role.getCodigo().equals(b.role.getCodigo())&&a.type.equals(b.type)&&a.number.equals(b.number)&&a.issuer.equals(b.issuer)&&Objects.equals(a.issued,b.issued)&&Objects.equals(a.expires,b.expires)&&Boolean.TRUE.equals(a.noExpiry)==Boolean.TRUE.equals(b.noExpiry)
   &&Objects.equals(a.notes,b.notes)&&Objects.equals(a.aircraftCategory,b.aircraftCategory)&&Objects.equals(a.restrictions,b.restrictions)&&Objects.equals(a.jurisdiction==null?null:a.jurisdiction.getId(),b.jurisdiction==null?null:b.jurisdiction.getId());
 }
 /** Renovación: una habilitación nueva y pendiente que apunta a la anterior; la anterior se conserva y sigue valiendo hasta que se verifique su sucesora o venza. */
 @Transactional public View renew(Long id,Input input,Long actor){
  ProfessionalCredential old=lockCredential(id);
  if("REVOCADA".equals(old.status)||"RECHAZADA".equals(old.status))throw conflict("HABILITACION_NO_RENOVABLE","Sólo puede renovarse una habilitación verificada o vencida");
  if(!input.roleCode().equals(old.role.getCodigo()))throw bad("La renovación debe mantener la función de la habilitación");
  if(credentials.existsByRenewsIdAndStatusIn(id,List.of("PENDIENTE","CORRECCION_SOLICITADA")))throw conflict("RENOVACION_EN_CURSO","Ya existe una renovación pendiente de revisión para esta habilitación");
  ProfessionalCredential next=new ProfessionalCredential();next.person=old.person;fill(next,input);next.renewsId=old.getId();credentials.saveAndFlush(next);
  record(next,actor,"RENEW",snap(old));decision(next,actor,"RENOVACION","Renovación de la habilitación "+old.getId(),null);return view(next);
 }
 /** Decisión de revisión. Estados de origen: PENDIENTE para verificar, rechazar o pedir corrección; VERIFICADA para revocar. */
 @Transactional public View decide(Long id,String action,Decision decision,Long actor){
  forbidSelfReview(id,actor);
  ProfessionalCredential c=lockCredential(id);String before=snap(c);
  if(!Set.of("VERIFICADA","RECHAZADA","REVOCADA","CORRECCION_SOLICITADA").contains(action))throw bad("Acción inválida");
  if("REVOCADA".equals(action)){if(!"VERIFICADA".equals(c.status))throw conflict("ESTADO_HABILITACION_INCOMPATIBLE","Sólo puede revocarse una verificación vigente");}
  else if(!"PENDIENTE".equals(c.status))throw conflict("ESTADO_HABILITACION_INCOMPATIBLE","La habilitación no está pendiente de revisión; actualice la pantalla");
  if("VERIFICADA".equals(action))requireVerifiable(c,decision);
  c.status=action;c.verifiedAt=now();c.verifier=user(actor);
  record(c,actor,action,before);decision(c,actor,action,decision.notes().trim(),null);return view(c);
 }
 private void requireVerifiable(ProfessionalCredential c,Decision decision){
  if(!Boolean.TRUE.equals(decision.confirmsSufficiency()))throw bad("Confirme la revisión manual y suficiencia para la función indicada");
  List<CredentialDocument> active=documents.findActiveByCredentialId(c.getId());
  if(active.isEmpty())throw conflict("DOCUMENTACION_AUSENTE","Adjunte documentación antes de verificar");
  if(active.stream().anyMatch(d->CredentialDocument.QUARANTINE.equals(d.scanStatus)||CredentialDocument.SCAN_ERROR.equals(d.scanStatus)))throw conflict("DOCUMENTACION_SIN_ANALISIS_COMPLETO","Hay documentos sin análisis antimalware completo; reintente el análisis o retírelos antes de verificar");
  if(active.stream().noneMatch(d->CredentialDocument.CLEAN.equals(d.scanStatus)))throw conflict("DOCUMENTACION_NO_LIMPIA","Ningún documento activo superó el análisis antimalware");
  if(c.expires==null&&!Boolean.TRUE.equals(c.noExpiry))throw bad("Indique el vencimiento o confirme expresamente que no aplica");
  if(c.expires!=null&&c.expires.isBefore(today()))throw conflict("HABILITACION_VENCIDA","La habilitación ya venció y no puede verificarse");
  if(c.issued!=null&&c.issued.isAfter(today()))throw bad("La credencial aún no fue emitida");
  if(c.restrictions!=null&&!Boolean.TRUE.equals(decision.acceptsRestrictions()))throw conflict("RESTRICCIONES_SIN_CONFIRMAR","La habilitación registra restricciones; confirme expresamente que no impiden la función");
 }
 /** Consulta manual a la fuente oficial: se conserva lo que el administrador declara haber visto; no cambia el estado administrativo. */
 @Transactional public View recordExternalCheck(Long id,ExternalCheckInput input,Long actor){
  forbidSelfReview(id,actor);ProfessionalCredential c=lockCredential(id);
  if(!Set.of("ANAC","REFEPS_SISA","OTRO").contains(input.authority()))throw bad("Fuente de consulta inválida");
  if(!Set.of("COINCIDE","NO_COINCIDE","NO_ENCONTRADO","NO_CONCLUYENTE").contains(input.result()))throw bad("Resultado de consulta inválido");
  if("REFEPS_SISA".equals(input.authority())&&!Set.of("MEDICO","ENFERMERO").contains(c.role.getCodigo()))throw bad("La consulta a REFEPS/SISA sólo corresponde a personal sanitario");
  if("ANAC".equals(input.authority())&&!Set.of("COMANDANTE","COPILOTO").contains(c.role.getCodigo()))throw bad("La consulta a ANAC sólo corresponde a personal aeronáutico");
  LocalDateTime when=input.consultedAt()==null?now():input.consultedAt();if(when.isAfter(now().plusMinutes(1)))throw bad("La fecha de la consulta no puede ser futura");
  ExternalCredentialCheck k=new ExternalCredentialCheck();k.credential=c;k.authority=input.authority();k.consultedAt=when;k.responsible=user(actor);k.numberChecked=c.number;k.comparedData=input.comparedData().trim();k.result=input.result();k.notes=blank(input.notes());
  if(input.evidenceDocumentId()!=null){CredentialDocument d=documents.findById(input.evidenceDocumentId()).filter(x->x.credential.getId().equals(id)).orElseThrow(()->bad("La evidencia no pertenece a esta habilitación"));k.evidence=d;}
  checks.saveAndFlush(k);audit.record(null,k.responsible,"PROFESSIONAL_CREDENTIAL",c.getId(),"EXTERNAL_CHECK",null,"{\"authority\":\""+k.authority+"\",\"result\":\""+k.result+"\"}");
  decision(c,actor,"CONSULTA_EXTERNA",k.authority+": "+k.result+(k.notes==null?"":" — "+k.notes),k.evidence);changed(c);return view(c);
 }
 @Transactional(readOnly=true) public List<ExternalCheckView> externalChecks(Long id){get(id);return checks.findByCredentialIdOrderByIdDesc(id).stream().map(this::checkView).toList();}
 @Transactional(readOnly=true) public List<DecisionView> decisions(Long id){get(id);return decisions.findByCredentialIdOrderByIdDesc(id).stream().map(d->new DecisionView(d.getId(),d.type,d.resultingStatus,d.actor.getUsername(),d.at,d.reason,d.document==null?null:d.document.getId())).toList();}
 @Transactional(readOnly=true) public List<History> history(Long id){get(id);return events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("PROFESSIONAL_CREDENTIAL",id).stream().map(e->new History(e.getId(),e.getOperation(),e.getActor()==null?null:e.getActor().getUsername(),AuditService.toLocal(e.getOccurredAt(),zone),e.getOldValues(),e.getNewValues())).toList();}
}
