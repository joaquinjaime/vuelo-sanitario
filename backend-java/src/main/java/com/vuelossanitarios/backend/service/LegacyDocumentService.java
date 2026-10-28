package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.person.*;
import com.vuelossanitarios.backend.repository.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Regularización de los documentos anteriores a V59, que la migración dejó sin huella ni análisis antimalware.
 * <p>
 * Principios: el archivo original y su historial no se tocan; un documento heredado nunca se presume limpio por haberse cargado antes, y su condición
 * ({@code origen_registro = ANTERIOR_V59}) se conserva aunque después se analice. La huella calculada aquí lleva {@code hash_momento = REGULARIZACION}:
 * prueba que el archivo no cambió desde ese instante, no desde la carga original. Si el archivo falta, no es un PDF válido o el analizador no está
 * disponible, el documento permanece restringido (LEGADO_SIN_ANALISIS, sin descarga ni sustento de verificaciones) con la explicación del último intento.
 * Un documento rechazado que era el único sustento de una verificación devuelve esa habilitación a revisión.
 */
@Service
public class LegacyDocumentService {
 public static final String ENGINE_STRUCTURE="validacion-estructural-pdf";
 private final CredentialDocumentRepository documents; private final ProfessionalCredentialRepository credentialRepository; private final ProfessionalCredentialService credentials; private final UserRepository users;
 private final FlightRepository flights; private final FlightCrewRepository crews; private final DocumentStorage storage; private final PdfInspector inspector; private final MalwareScanner scanner; private final AuditService audit;
 private final Clock clock; private final ZoneId zone; private final TransactionTemplate tx; private final boolean scannerEnabled; private final AtomicBoolean running=new AtomicBoolean();
 public LegacyDocumentService(CredentialDocumentRepository d,ProfessionalCredentialRepository cr,ProfessionalCredentialService c,UserRepository u,FlightRepository f,FlightCrewRepository fc,DocumentStorage s,PdfInspector i,MalwareScanner m,AuditService a,Clock clock,
   PlatformTransactionManager manager,@Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone,@Value("${app.antimalware.enabled:false}") boolean scannerEnabled){
  documents=d;credentialRepository=cr;credentials=c;users=u;flights=f;crews=fc;storage=s;inspector=i;scanner=m;audit=a;this.clock=clock;this.zone=ZoneId.of(zone);tx=new TransactionTemplate(manager);this.scannerEnabled=scannerEnabled;
 }
 public record Outcome(Long documentId,String result,String status,String detail){}
 public record BatchSummary(int examined,int regularized,int rejected,int restricted,int alreadyResolved){}
 public record AffectedCredential(Long credentialId,Long userId,String username,String roleCode,String type,String documentStatus){}
 public record AffectedFlight(Long flightId,String flightCode,String flightState,Long userId,String roleCode){}
 public record Report(long legacyDocuments,Map<String,Long> byStatus,long withoutFingerprint,long pendingActive,long missingFiles,boolean analyzerConfigured,long verifiedCredentialsSupportedOnlyByLegacy,List<AffectedCredential> credentials,
   long openFlightsWithAffectedCrew,List<AffectedFlight> flights,boolean truncated,String statement){}
 private static final int DETAIL_LIMIT=100,EXAMINED_LIMIT=1000;
 private ApiException conflict(String code,String m){return new ApiException(HttpStatus.CONFLICT,code,m,Map.of());}
 private LocalDateTime now(){return LocalDateTime.ofInstant(clock.instant(),zone);}
 private static String sha256(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private static String cut(String s,int max){return s==null||s.length()<=max?s:s.substring(0,max);}
 private String json(String... pairs){StringBuilder b=new StringBuilder("{");for(int i=0;i<pairs.length;i+=2){if(i>0)b.append(',');b.append('"').append(pairs[i]).append("\":\"").append(pairs[i+1].replace("\\","\\\\").replace("\"","\\\"")).append('"');}return b.append('}').toString();}

 /** Qué hay pendiente y a quién afecta. Sólo lee. */
 @Transactional(readOnly=true) public Report report(){
  Map<String,Long> byStatus=new TreeMap<>();for(Object[] row:documents.countLegacyByStatus())byStatus.put((String)row[0],(Long)row[1]);
  long total=byStatus.values().stream().mapToLong(Long::longValue).sum();
  List<String> pendingKeys=documents.findLegacyPendingKeys();
  long missing=pendingKeys.stream().filter(k->!storage.exists(k)).count();
  List<ProfessionalCredential> supported=credentialRepository.findVerifiedSupportedOnlyByUnscannedLegacy();
  List<AffectedCredential> affected=new ArrayList<>();List<AffectedFlight> affectedFlights=new ArrayList<>();Set<String> flightKeys=new HashSet<>();int examined=0;boolean truncated=false;long flightCount=0;
  for(ProfessionalCredential c:supported){
   if(examined++>=EXAMINED_LIMIT){truncated=true;break;}
   Long ownerId=credentialRepository.findOwnerUserId(c.getId());var owner=ownerId==null?null:users.findById(ownerId).orElse(null);if(owner==null)continue;
   String statusSummary=documents.findActiveByCredentialId(c.getId()).stream().map(d->d.scanStatus).distinct().sorted().reduce((a,b)->a+","+b).orElse("");
   if(affected.size()<DETAIL_LIMIT)affected.add(new AffectedCredential(c.getId(),owner.getId(),owner.getUsername(),c.role.getCodigo(),c.type,statusSummary));
   String role=c.role.getCodigo();
   for(var f:flights.findByComandanteId(ownerId))if("COMANDANTE".equals(role)&&open(f)&&flightKeys.add(f.getId()+":"+ownerId)){flightCount++;if(affectedFlights.size()<DETAIL_LIMIT)affectedFlights.add(new AffectedFlight(f.getId(),f.getCodigo(),f.getEstadoVuelo().getCodigo(),ownerId,role));}
   for(var fc:crews.findByUserIdAndFechaBajaIsNull(ownerId))if(role.equals(fc.getCrewRole().getCodigo())&&open(fc.getFlight())&&flightKeys.add(fc.getFlight().getId()+":"+ownerId)){flightCount++;if(affectedFlights.size()<DETAIL_LIMIT)affectedFlights.add(new AffectedFlight(fc.getFlight().getId(),fc.getFlight().getCodigo(),fc.getFlight().getEstadoVuelo().getCodigo(),ownerId,role));}
  }
  String statement="Los documentos anteriores a V59 no se consideran limpios: permanecen restringidos hasta regularizarlos. Las verificaciones que sustentan siguen vigentes porque fueron revisiones humanas anteriores, pero el sustento documental figura como pendiente y se muestra en cada habilitación; si el análisis rechaza el único documento de una verificación, la habilitación vuelve a revisión.";
  return new Report(total,byStatus,documents.countLegacyWithoutHash(),pendingKeys.size(),missing,scannerEnabled&&scanner.describe()!=null,supported.size(),affected,flightCount,affectedFlights,truncated,statement);
 }
 private boolean open(com.vuelossanitarios.backend.domain.flight.Flight f){return f.getEstadoVuelo()!=null&&!FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo());}

 /** Regulariza hasta {@code limit} documentos pendientes, uno por vez (cada uno en su propia transacción). Una sola ejecución a la vez en este proceso. */
 public BatchSummary regularizePending(int limit,Long actor){
  if(limit<1||limit>500)throw new ApiException(HttpStatus.BAD_REQUEST,"LIMITE_INVALIDO","El lote admite entre 1 y 500 documentos",Map.of());
  if(!running.compareAndSet(false,true))throw conflict("REGULARIZACION_EN_CURSO","Ya hay una regularización en curso");
  try{
   List<Long> ids=tx.execute(s->documents.findLegacyPending(PageRequest.of(0,limit)).stream().map(CredentialDocument::getId).toList());
   int regularized=0,rejected=0,restricted=0,resolved=0;
   for(Long id:ids){
    Outcome o;try{o=regularize(id,actor);}catch(ApiException e){restricted++;continue;}
    switch(o.result()){case "REGULARIZADO"->regularized++;case "RECHAZADO"->rejected++;case "YA_RESUELTO"->resolved++;default->restricted++;}
   }
   return new BatchSummary(ids.size(),regularized,rejected,restricted,resolved);
  }finally{running.set(false);}
 }

 /** Regulariza un documento. Idempotente: uno ya resuelto (limpio o rechazado) no se vuelve a analizar. */
 public Outcome regularize(Long documentId,Long actor){
  record Snapshot(String key,String status,String origin,boolean active,String hash){}
  Snapshot snap=tx.execute(s->{CredentialDocument d=documents.findById(documentId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Documento inexistente"));return new Snapshot(d.key,d.scanStatus,d.origin,d.isActive(),d.sha256);});
  Long ownerCredential=tx.execute(s->documents.findCredentialId(documentId));credentials.forbidSelfReview(ownerCredential,actor);
  if(!CredentialDocument.BEFORE_V59.equals(snap.origin()))throw conflict("DOCUMENTO_NO_HEREDADO","Sólo se regularizan los documentos anteriores a V59; los demás se reanalizan con 'Reintentar análisis'");
  if(CredentialDocument.CLEAN.equals(snap.status())||CredentialDocument.REJECTED.equals(snap.status()))return new Outcome(documentId,"YA_RESUELTO",snap.status(),null);
  byte[] bytes=null;String failure=null;
  try{bytes=storage.read(snap.key()).bytes();}catch(RuntimeException e){failure="El archivo no está disponible en el almacenamiento";}
  String hash=bytes==null?null:sha256(bytes);
  MalwareScanner.Result verdict=null;
  if(bytes!=null){
   try{inspector.inspect(bytes);}catch(ApiException e){verdict=new MalwareScanner.Result(MalwareScanner.Status.INFECTED,ENGINE_STRUCTURE,"Estructura PDF no válida: "+cut(e.getMessage(),300));}
   if(verdict==null){
    if(!scannerEnabled)failure="No hay un analizador antimalware configurado";
    else{MalwareScanner.Result scanned;try{scanned=scanner.scan(bytes);}catch(RuntimeException e){scanned=MalwareScanner.Result.error("analizador","No se pudo completar el análisis");}
     if(scanned.status()==MalwareScanner.Status.ERROR)failure=Objects.toString(scanned.detail(),"El analizador no respondió");else verdict=scanned;}
   }
  }
  String finalHash=hash;byte[] content=bytes;String reason=failure;MalwareScanner.Result result=verdict;
  return tx.execute(s->{
   Long credentialId=documents.findCredentialId(documentId);ProfessionalCredential c=credentials.lockCredential(credentialId);CredentialDocument d=documents.findById(documentId).orElseThrow();
   if(CredentialDocument.CLEAN.equals(d.scanStatus)||CredentialDocument.REJECTED.equals(d.scanStatus))return new Outcome(documentId,"YA_RESUELTO",d.scanStatus,null);
   var by=users.findById(actor).orElseThrow();LocalDateTime now=now();String before=credentials.snap(c);
   if(finalHash!=null&&d.sha256!=null&&!d.sha256.equals(finalHash)){
    d.scanDetail=cut("La huella registrada no coincide con el archivo almacenado: integridad no demostrada",500);d.scannedAt=now;d.regularizedAt=now;d.regularizedBy=by;documents.saveAndFlush(d);
    audit.record(null,by,"CREDENTIAL_DOCUMENT",d.getId(),"INTEGRITY_FAILURE",null,json("sha256",d.sha256));
    credentials.decision(c,actor,"ANALISIS_DOCUMENTO","Documento "+d.name+" (anterior a V59): la huella registrada no coincide con el archivo; permanece restringido",d);return new Outcome(documentId,"INTEGRIDAD_NO_DEMOSTRADA",d.scanStatus,d.scanDetail);
   }
   if(finalHash!=null&&d.sha256==null){d.sha256=finalHash;d.sizeBytes=(long)content.length;d.hashMoment=CredentialDocument.HASH_AT_REGULARIZATION;}
   d.regularizedAt=now;d.regularizedBy=by;
   if(result==null){
    // Sin resultado de análisis: sigue restringido y se explica por qué; no se inventa ningún estado nuevo.
    d.scanDetail=cut("Anterior a V59 sin análisis. Intento de regularización del "+now+": "+reason,500);documents.saveAndFlush(d);
    audit.record(null,by,"CREDENTIAL_DOCUMENT",d.getId(),"REGULARIZE_PENDING",null,json("reason",Objects.toString(reason,""),"hash",finalHash==null?"":finalHash));
    credentials.decision(c,actor,"ANALISIS_DOCUMENTO","Documento "+d.name+" (anterior a V59): regularización pendiente — "+reason+(finalHash==null?"":". Huella calculada ahora (no prueba integridad desde la carga original)"),d);credentials.changed(c);
    return new Outcome(documentId,"RESTRINGIDO",d.scanStatus,reason);
   }
   boolean infected=result.status()==MalwareScanner.Status.INFECTED;
   d.scanStatus=infected?CredentialDocument.REJECTED:CredentialDocument.CLEAN;d.scannedAt=now;d.scanEngine=result.engine();
   d.scanDetail=cut(infected?Objects.toString(result.detail(),"Rechazado")+" (documento anterior a V59)":"Documento anterior a V59 regularizado el "+now+"; la huella se calculó en la regularización y no prueba integridad desde la carga original",500);
   documents.saveAndFlush(d);
   audit.record(null,by,"CREDENTIAL_DOCUMENT",d.getId(),"REGULARIZE",null,json("status",d.scanStatus,"engine",Objects.toString(result.engine(),""),"hashMoment",Objects.toString(d.hashMoment,"")));
   credentials.decision(c,actor,"ANALISIS_DOCUMENTO","Documento "+d.name+" (anterior a V59) regularizado: "+d.scanStatus+(infected?" ("+d.scanDetail+")":"")+(d.hashMoment==null?"; sin huella registrada":"; huella calculada en la regularización, que no prueba integridad desde la carga original"),d);
   if(infected&&"VERIFICADA".equals(c.status)&&documents.findActiveByCredentialId(c.getId()).stream().noneMatch(x->CredentialDocument.CLEAN.equals(x.scanStatus))){
    credentials.reset(c);credentialRepository.saveAndFlush(c);credentials.record(c,actor,"DOCUMENT_REJECTED_REVIEW",before);
    credentials.decision(c,actor,"MODIFICACION","Revisión requerida: el único documento que sustentaba la verificación fue rechazado al regularizarlo",d);
   }else credentials.changed(c);
   return new Outcome(documentId,infected?"RECHAZADO":"REGULARIZADO",d.scanStatus,d.scanDetail);
  });
 }
}
