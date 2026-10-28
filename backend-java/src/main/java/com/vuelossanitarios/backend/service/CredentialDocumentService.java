package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.repository.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Documentación de habilitaciones. Una subida pasa por: validación estructural del PDF (sin contenido activo) → almacenamiento privado en
 * cuarentena con huella SHA-256 → análisis antimalware fuera de toda transacción → LIMPIO | RECHAZADO | ERROR_ANALISIS. Sólo un documento LIMPIO
 * puede sustentar una verificación ni descargarse. Nada se borra: reemplazar o retirar es una baja lógica que conserva archivo, huella e historial,
 * y no existe ninguna purga física automática mientras no haya una política de retención aprobada.
 */
@Service
public class CredentialDocumentService {
 public static final Set<String> PURPOSES=Set.of("EVIDENCIA","RENOVACION","CORRECCION","CONSULTA_EXTERNA");
 private final ProfessionalCredentialService credentials; private final ProfessionalCredentialRepository credentialRepository; private final CredentialDocumentRepository documents; private final UserRepository users;
 private final DocumentStorage storage; private final PdfInspector inspector; private final MalwareScanner scanner; private final AuditService audit; private final Clock clock; private final ZoneId zone;
 private final TransactionTemplate tx,independentTx; private final boolean scannerEnabled; private final long retrySeconds; private final boolean purgeEnabled;
 public CredentialDocumentService(ProfessionalCredentialService credentials,ProfessionalCredentialRepository credentialRepository,CredentialDocumentRepository documents,UserRepository users,DocumentStorage storage,PdfInspector inspector,
   MalwareScanner scanner,AuditService audit,Clock clock,PlatformTransactionManager manager,@Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone,
   @Value("${app.antimalware.enabled:false}") boolean scannerEnabled,@Value("${app.antimalware.retry-after-seconds:60}") long retrySeconds,@Value("${app.retention.credential-documents.purge-enabled:false}") boolean purgeEnabled){
  this.credentials=credentials;this.credentialRepository=credentialRepository;this.documents=documents;this.users=users;this.storage=storage;this.inspector=inspector;this.scanner=scanner;this.audit=audit;this.clock=clock;this.zone=ZoneId.of(zone);
  tx=new TransactionTemplate(manager);independentTx=new TransactionTemplate(manager);independentTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);this.scannerEnabled=scannerEnabled;this.retrySeconds=retrySeconds;this.purgeEnabled=purgeEnabled;
 }
 public record Retention(boolean purgeEnabled,boolean policyApproved,long activeDocuments,long retiredDocuments,long heldDocuments,long unscannedDocuments,String statement){}
 private ApiException bad(String code,String m){return new ApiException(HttpStatus.BAD_REQUEST,code,m,Map.of());}
 private ApiException conflict(String code,String m){return new ApiException(HttpStatus.CONFLICT,code,m,Map.of());}
 private LocalDateTime now(){return LocalDateTime.ofInstant(clock.instant(),zone);}
 private static String sha256(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private CredentialDocument document(Long id){return documents.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Documento inexistente"));}
 private String json(String... pairs){StringBuilder b=new StringBuilder("{");for(int i=0;i<pairs.length;i+=2){if(i>0)b.append(',');b.append('"').append(pairs[i]).append("\":\"").append(pairs[i+1].replace("\\","\\\\").replace("\"","\\\"")).append('"');}return b.append('}').toString();}

 /** Sube un documento. {@code replacesId} reemplaza (baja lógica) un documento activo de la misma habilitación en la misma transacción. */
 public ProfessionalCredentialService.View upload(Long credentialId,MultipartFile file,String purpose,Long replacesId,Long actor){
  String documentPurpose=purpose==null||purpose.isBlank()?"EVIDENCIA":purpose;if(!PURPOSES.contains(documentPurpose))throw bad("PROPOSITO_INVALIDO","Propósito documental inválido");
  byte[] bytes=storage.validatedPdfBytes(file);inspector.inspect(bytes);
  String name=Objects.toString(file.getOriginalFilename(),"documento.pdf").replace('\\','/');name=name.substring(name.lastIndexOf('/')+1);if(name.length()>255)throw bad("NOMBRE_ARCHIVO_INVALIDO","Nombre de archivo demasiado largo");
  String hash=sha256(bytes),fileName=name;
  Long documentId=tx.execute(status->{
   ProfessionalCredential c=credentials.lockCredential(credentialId);
   if("REVOCADA".equals(c.status))throw conflict("HABILITACION_REVOCADA_NO_EDITABLE","Una habilitación revocada no admite nueva documentación");
   if(documents.existsBySha256AndCredentialIdAndRetiredAtIsNull(hash,credentialId))throw conflict("DOCUMENTO_DUPLICADO","Ese mismo archivo ya está adjunto a la habilitación");
   CredentialDocument replaced=null;
   if(replacesId!=null){replaced=document(replacesId);if(!replaced.credential.getId().equals(credentialId)||!replaced.isActive())throw conflict("DOCUMENTO_NO_REEMPLAZABLE","El documento a reemplazar no está activo en esta habilitación");
    if(Boolean.TRUE.equals(replaced.retentionHold))throw conflict("DOCUMENTO_BAJO_BLOQUEO_CONSERVACION","El documento a reemplazar está bajo bloqueo de conservación");}
   String before=credentials.snap(c);String key=storage.storeValidatedPdfBytes(bytes);
   TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCompletion(int result){if(result!=STATUS_COMMITTED)storage.deleteQuietly(key);}});
   CredentialDocument d=new CredentialDocument();d.credential=c;d.key=key;d.name=fileName;d.uploader=users.findById(actor).orElseThrow();d.uploadedAt=now();d.purpose=documentPurpose;d.sha256=hash;d.sizeBytes=(long)bytes.length;
   d.version=documents.findByCredentialIdOrderByIdDesc(credentialId).stream().mapToInt(x->x.version).max().orElse(0)+1;d.replacesId=replaced==null?null:replaced.getId();d.scanStatus=CredentialDocument.QUARANTINE;documents.saveAndFlush(d);
   if(replaced!=null){replaced.retiredAt=now();replaced.retiredBy=d.uploader;replaced.retireReason="Reemplazado por la versión "+d.version;documents.saveAndFlush(replaced);}
   audit.record(null,d.uploader,"CREDENTIAL_DOCUMENT",d.getId(),"CREATE",null,json("credentialId",String.valueOf(credentialId),"version",String.valueOf(d.version),"purpose",documentPurpose,"sha256",hash));
   credentials.decision(c,actor,"DOCUMENTO","Documento "+fileName+" (v"+d.version+", "+documentPurpose+") en cuarentena"+(replaced==null?"":"; reemplaza la versión "+replaced.version),d);
   if(!"CONSULTA_EXTERNA".equals(documentPurpose)&&!"PENDIENTE".equals(c.status)){credentials.reset(c);credentials.record(c,actor,"UPLOAD_DOCUMENT",before);}else credentials.changed(c);
   return d.getId();
  });
  scan(documentId,actor);
  return credentials.find(credentialId);
 }

 /** Reintenta el análisis de un documento en cuarentena, con error de análisis o anterior a V59. Es idempotente. */
 public ProfessionalCredentialService.View rescan(Long documentId,Long actor){CredentialDocument d=document(documentId);scan(documentId,actor);return credentials.find(d.credential.getId());}

 private void scan(Long documentId,Long actor){
  record Pending(String key,String previous){}
  Pending pending=tx.execute(status->{CredentialDocument d=document(documentId);return new Pending(d.key,d.scanStatus);});
  if(CredentialDocument.CLEAN.equals(pending.previous())||CredentialDocument.REJECTED.equals(pending.previous()))return;
  byte[] bytes;MalwareScanner.Result result;
  try{bytes=storage.read(pending.key()).bytes();result=scanner.scan(bytes);}catch(RuntimeException e){bytes=null;result=MalwareScanner.Result.error("analizador","No se pudo completar el análisis");}
  byte[] content=bytes;MalwareScanner.Result outcome=result;
  tx.executeWithoutResult(status->{
   Long credentialId=documents.findCredentialId(documentId);ProfessionalCredential c=credentials.lockCredential(credentialId);CredentialDocument d=document(documentId);
   Long who=actor!=null?actor:d.uploader.getId();
   if(CredentialDocument.CLEAN.equals(d.scanStatus)||CredentialDocument.REJECTED.equals(d.scanStatus))return;
   String next=switch(outcome.status()){case CLEAN->CredentialDocument.CLEAN;case INFECTED->CredentialDocument.REJECTED;case ERROR->CredentialDocument.SCAN_ERROR;};
   boolean repeatedFailure=next.equals(d.scanStatus)&&CredentialDocument.SCAN_ERROR.equals(next);
   d.scanStatus=next;d.scannedAt=now();d.scanEngine=outcome.engine();d.scanDetail=outcome.detail()==null?null:outcome.detail().length()>500?outcome.detail().substring(0,500):outcome.detail();
   if(content!=null&&d.sha256==null){d.sha256=sha256(content);d.sizeBytes=(long)content.length;}
   documents.saveAndFlush(d);
   if(repeatedFailure)return;
   audit.record(null,users.findById(who).orElseThrow(),"CREDENTIAL_DOCUMENT",d.getId(),"SCAN",null,json("status",next,"engine",Objects.toString(outcome.engine(),""),"automatic",String.valueOf(actor==null)));
   credentials.decision(c,who,"ANALISIS_DOCUMENTO","Documento "+d.name+": "+next+(d.scanDetail==null?"":" ("+d.scanDetail+")"),d);credentials.changed(c);
  });
 }

 /** Reintento periódico de análisis pendientes o fallidos; sólo actúa si hay un analizador configurado y nunca marca limpio un documento sin examinarlo. */
 @Scheduled(fixedDelayString="${app.antimalware.retry-ms:300000}",initialDelayString="${app.antimalware.retry-initial-ms:120000}")
 public void retryPendingScans(){
  if(!scannerEnabled)return;
  LocalDateTime cutoff=now().minusSeconds(retrySeconds);
  List<Long> ids=tx.execute(status->documents.findPendingScans(List.of(CredentialDocument.QUARANTINE,CredentialDocument.SCAN_ERROR),cutoff,PageRequest.of(0,20)).stream().map(CredentialDocument::getId).toList());
  for(Long id:ids)try{scan(id,null);}catch(RuntimeException ignored){}
 }

 /** Descarga autenticada: sólo documentos limpios (o anteriores a V59 aún sin análisis) y con la huella íntegra; cada acceso se audita. */
 @Transactional public Download download(Long documentId,Long actor){
  CredentialDocument d=document(documentId);
  if(!CredentialDocument.CLEAN.equals(d.scanStatus)&&!CredentialDocument.LEGACY.equals(d.scanStatus))throw conflict("DOCUMENTO_NO_DISPONIBLE","El documento no superó el análisis antimalware y no puede descargarse");
  byte[] data=storage.read(d.key).bytes();
  if(d.sha256!=null&&!d.sha256.equals(sha256(data))){independentTx.executeWithoutResult(st->audit.record(null,users.findById(actor).orElseThrow(),"CREDENTIAL_DOCUMENT",d.getId(),"INTEGRITY_FAILURE",null,json("sha256",d.sha256)));throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,"INTEGRIDAD_DOCUMENTO","El documento almacenado no coincide con su huella registrada",Map.of());}
  audit.record(null,users.findById(actor).orElseThrow(),"CREDENTIAL_DOCUMENT",d.getId(),"DOWNLOAD",null,json("credentialId",String.valueOf(d.credential.getId())));
  return new Download(data,d.name);
 }
 public record Download(byte[] data,String name){}

 /** Baja lógica controlada. No se permite sobre un documento bajo bloqueo de conservación ni sobre el único documento limpio que sustenta una verificación vigente. */
 @Transactional public ProfessionalCredentialService.View retire(Long documentId,String reason,Long actor){
  Long credentialId=documents.findCredentialId(documentId);if(credentialId==null)throw new ApiException(HttpStatus.NOT_FOUND,"Documento inexistente");
  credentials.forbidSelfReview(credentialId,actor);ProfessionalCredential c=credentials.lockCredential(credentialId);CredentialDocument d=document(documentId);
  if(reason==null||reason.isBlank())throw bad("MOTIVO_REQUERIDO","Indique el motivo del retiro");if(reason.trim().length()>500)throw bad("MOTIVO_INVALIDO","El motivo admite hasta 500 caracteres");
  if(!d.isActive())throw conflict("DOCUMENTO_YA_RETIRADO","El documento ya fue retirado; actualice la pantalla");
  if(Boolean.TRUE.equals(d.retentionHold))throw conflict("DOCUMENTO_BAJO_BLOQUEO_CONSERVACION","El documento está bajo bloqueo de conservación: "+d.holdReason);
  if("VERIFICADA".equals(c.status)&&CredentialDocument.CLEAN.equals(d.scanStatus)&&documents.findActiveByCredentialId(credentialId).stream().noneMatch(x->!x.getId().equals(documentId)&&CredentialDocument.CLEAN.equals(x.scanStatus)))
   throw conflict("DOCUMENTO_SUSTENTA_VERIFICACION","Es el único documento limpio que sustenta una verificación vigente: cárguelo reemplazado por uno nuevo o revoque la habilitación");
  d.retiredAt=now();d.retiredBy=users.findById(actor).orElseThrow();d.retireReason=reason.trim();documents.saveAndFlush(d);
  audit.record(null,d.retiredBy,"CREDENTIAL_DOCUMENT",d.getId(),"RETIRE",null,json("reason",d.retireReason));
  credentials.decision(c,actor,"RETIRO_DOCUMENTO","Documento "+d.name+": "+d.retireReason,d);credentials.changed(c);return credentials.find(credentialId);
 }

 /** Bloqueo de conservación (legal o de auditoría): impide retirar y reemplazar el documento hasta que se libere con motivo. */
 @Transactional public ProfessionalCredentialService.View hold(Long documentId,boolean hold,String reason,Long actor){
  Long credentialId=documents.findCredentialId(documentId);if(credentialId==null)throw new ApiException(HttpStatus.NOT_FOUND,"Documento inexistente");
  credentials.forbidSelfReview(credentialId,actor);ProfessionalCredential c=credentials.lockCredential(credentialId);CredentialDocument d=document(documentId);
  if(reason==null||reason.isBlank())throw bad("MOTIVO_REQUERIDO","Indique el motivo");if(reason.trim().length()>500)throw bad("MOTIVO_INVALIDO","El motivo admite hasta 500 caracteres");
  if(hold==Boolean.TRUE.equals(d.retentionHold))throw conflict("BLOQUEO_SIN_CAMBIOS",hold?"El documento ya está bajo bloqueo de conservación":"El documento no está bajo bloqueo");
  d.retentionHold=hold;d.holdReason=hold?reason.trim():null;documents.saveAndFlush(d);
  audit.record(null,users.findById(actor).orElseThrow(),"CREDENTIAL_DOCUMENT",d.getId(),hold?"HOLD":"RELEASE_HOLD",null,json("reason",reason.trim()));
  credentials.decision(c,actor,hold?"BLOQUEO_CONSERVACION":"LIBERACION_BLOQUEO","Documento "+d.name+": "+reason.trim(),d);return credentials.find(credentialId);
 }

 /** Solicitud de rectificación o supresión de datos: se registra y protege la evidencia (bloqueo) hasta que se resuelva fuera del sistema. No borra nada. */
 @Transactional public ProfessionalCredentialService.View requestDataAction(Long credentialId,String type,String reason,Long actor){
  if(!Set.of("RECTIFICACION","SUPRESION").contains(type))throw bad("TIPO_SOLICITUD_INVALIDO","Tipo de solicitud inválido");
  if(reason==null||reason.isBlank())throw bad("MOTIVO_REQUERIDO","Indique el motivo de la solicitud");
  ProfessionalCredential c=credentials.lockCredential(credentialId);String why=reason.trim();
  for(CredentialDocument d:documents.findActiveByCredentialId(credentialId))if(!Boolean.TRUE.equals(d.retentionHold)){d.retentionHold=true;d.holdReason="Solicitud de "+type.toLowerCase(Locale.ROOT)+" pendiente de resolución";documents.save(d);}
  audit.record(null,users.findById(actor).orElseThrow(),"PROFESSIONAL_CREDENTIAL",credentialId,"DATA_REQUEST",null,json("type",type));
  credentials.decision(c,actor,"SOLICITUD_"+type,why,null);return credentials.find(credentialId);
 }

 @Transactional(readOnly=true) public Retention retention(){
  List<CredentialDocument> all=documents.findAll();
  return new Retention(purgeEnabled,false,all.stream().filter(CredentialDocument::isActive).count(),all.stream().filter(d->!d.isActive()).count(),all.stream().filter(d->Boolean.TRUE.equals(d.retentionHold)).count(),
   all.stream().filter(d->!CredentialDocument.CLEAN.equals(d.scanStatus)).count(),
   "No hay una política de retención aprobada: el sistema no purga documentos ni siquiera retirados o reemplazados. La decisión de plazos y obligaciones de conservación (incluida la Ley 25.326) debe adoptarse antes de operar con datos reales.");
 }
 public record AntimalwareStatus(boolean configured,String engine,boolean failSafe){}
 public AntimalwareStatus antimalwareStatus(){String engine=scannerEnabled?scanner.describe():null;return new AntimalwareStatus(scannerEnabled&&engine!=null,engine,true);}
}
