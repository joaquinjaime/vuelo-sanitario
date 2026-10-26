package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.DocumentDtos.*;
import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightDocument;
import com.vuelossanitarios.backend.domain.flight.FlightDocumentItem;
import com.vuelossanitarios.backend.domain.flight.DocumentLock;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.*;
import java.util.List;

@Service
public class DocumentService {
 /** Estados de sólo consulta documental: coinciden con los de hangar y coordinaciones y preservan la historia del vuelo cerrado. */
 private static final java.util.Set<String> READ_ONLY_STATES=java.util.Set.of("FINALIZADO","COMPLETADO","CANCELADO");
 private static final int MAX_REASON=500;
 private final FlightRepository flights; private final DocumentTypeRepository types; private final DocumentItemRepository items;
 private final FlightDocumentRepository versions; private final UserRepository users; private final DocumentStorage storage;
 private final AuditService audit; private final FlightAuthorizationService access;
 private final DocumentLockRepository locks; private final Clock clock; private final long lockSeconds; private final CommanderReportAccessService commanderAccess;

 public DocumentService(FlightRepository flights, DocumentTypeRepository types, DocumentItemRepository items,
                        FlightDocumentRepository versions, UserRepository users, DocumentStorage storage,
                        AuditService audit, FlightAuthorizationService access, DocumentLockRepository locks, Clock clock, CommanderReportAccessService commanderAccess,
                        @org.springframework.beans.factory.annotation.Value("${app.storage.document-lock-seconds:300}") long lockSeconds) {
  this.flights=flights; this.types=types; this.items=items; this.versions=versions; this.users=users;
  this.storage=storage; this.audit=audit; this.access=access;
  this.commanderAccess=commanderAccess; this.locks=locks; this.clock=clock; this.lockSeconds=lockSeconds;
 }

 @Transactional
 public DocumentView createPdf(Long flightId, String documentTypeCode, String nombreDocumento, MultipartFile file, Long actorId) {
  Flight flight=flights.lockById(flightId).orElseThrow(()->notFound("Vuelo"));
  mayChange(flight,actorId);
  String location=storage.storePdf(file);
  try {
   FlightDocumentItem item=newItem(flight,documentTypeCode,nombreDocumento);
   requireCompatible(item.getDocumentType(),flight,true);
   // El vuelo está bloqueado en esta transacción: la comprobación no admite altas simultáneas con el mismo nombre.
   if (items.existsByFlightIdAndActivoTrueAndNombreDocumentoIgnoreCase(flightId,item.getNombreDocumento())) throw conflict("Ya existe un documento con ese nombre en el vuelo; registre una nueva versión del existente");
   items.save(item);
   FlightDocument version=pdfVersion(item,file,location,user(actorId));
   versions.save(version);
   audit.record(flight,user(actorId),"DOCUMENT",version.getId(),"CREATE",null,"{\"numeroVersion\":1}");
   return view(item,version,actorId,()->actorId);
  } catch (RuntimeException e) { storage.deleteQuietly(location); throw e; }
 }

 @Transactional
 public DocumentView replacePdf(Long itemId, MultipartFile file, Long actorId) {
  FlightDocumentItem item=items.lockById(itemId).orElseThrow(()->notFound("Documento"));
  mayChange(item.getFlight(),actorId);
  requireActive(item); requireCompatible(item.getDocumentType(),item.getFlight(),false);
  requireEditableLock(item,actorId);
  String location=storage.storePdf(file);
  try {
   // El almacenamiento puede tardar más que el lease. Revalidarlo dentro de
   // esta misma transacción evita que una escritura iniciada a tiempo quede
   // persistida después de su vencimiento.
   requireEditableLock(item,actorId);
   FlightDocument version=pdfVersion(item,file,location,user(actorId));
   advance(item,version);
   audit.record(item.getFlight(),user(actorId),"DOCUMENT",version.getId(),"CREATE_VERSION",null,
       "{\"numeroVersion\":"+version.getNumeroVersion()+"}");
   return view(item,version,actorId,()->firstAuthor(item));
  } catch (RuntimeException e) { storage.deleteQuietly(location); throw e; }
 }

 @Transactional(readOnly=true)
 public List<DocumentView> list(Long flightId, Long actorId) {
  Flight flight=flights.findById(flightId).orElseThrow(()->notFound("Vuelo"));
  access.mayRead(flight,actorId);
  return items.findByFlightIdAndActivoTrueOrderByCreatedAtDesc(flightId).stream().map(item -> {
   FlightDocument current=versions.findByDocumentItemIdAndEsVersionActualTrue(item.getId())
       .orElseThrow(()->conflict("El documento no tiene una versión vigente"));
   return view(item,current,actorId,()->firstAuthor(item));
  }).toList();
 }

 /** Documentos retirados del uso operativo (baja lógica) con su motivo y responsable; sólo Operaciones y el comandante del vuelo. */
 @Transactional(readOnly=true)
 public List<RetiredDocumentView> listRetired(Long flightId, Long actorId) {
  Flight flight=flights.findById(flightId).orElseThrow(()->notFound("Vuelo"));
  access.mayReadRetired(flight,actorId);
  return items.findByFlightIdAndActivoFalseOrderByFechaBajaDesc(flightId).stream().map(item -> {
   DocumentType type=item.getDocumentType();
   FlightDocument last=versions.findByDocumentItemIdAndEsVersionActualTrue(item.getId()).orElse(null);
   return new RetiredDocumentView(item.getId().toString(),item.getNombreDocumento(),new DocumentTypeView(type.getCodigo(),type.getNombre()),
       last==null?null:versionView(last),versions.countByDocumentItemId(item.getId()),civil(item.getFechaBaja()),
       item.getBajaPor()==null?null:item.getBajaPor().getUsername(),item.getMotivoBaja());
  }).toList();
 }

 /** Tipos que admite el vuelo: el catálogo filtrado por la regla de compatibilidad, que vive sólo en el servidor. */
 @Transactional(readOnly=true)
 public List<DocumentTypeView> allowedTypes(Long flightId, Long actorId) {
  Flight flight=flights.findById(flightId).orElseThrow(()->notFound("Vuelo"));
  access.mayRead(flight,actorId);
  return types.findAll().stream().filter(t->compatible(t,flight)).sorted(java.util.Comparator.comparing(DocumentType::getNombre))
      .map(t->new DocumentTypeView(t.getCodigo(),t.getNombre())).toList();
 }

 /**
  * Baja lógica: el documento sale del uso operativo pero la fila, sus versiones y sus archivos se conservan. El motivo es
  * obligatorio, un bloqueo propio o vencido se libera en la misma transacción y uno vigente de otra persona lo impide.
  */
 @Transactional
 public void deactivate(Long flightId, Long itemId, String motivo, Long actorId) {
  FlightDocumentItem item=items.lockById(itemId).orElseThrow(()->notFound("Documento"));
  Flight flight=item.getFlight();
  if (!flight.getId().equals(flightId)) throw notFound("Documento"); // el documento debe pertenecer al vuelo indicado
  mayChange(flight,actorId);
  if (!canRetire(flight,actorId,()->firstAuthor(item))) throw forbidden("No está autorizado a retirar este documento");
  if (!Boolean.TRUE.equals(item.getActivo())) throw conflict("El documento ya fue retirado");
  String reason=motivo==null ? "" : motivo.trim();
  if (reason.isEmpty()) throw bad("El motivo de la baja es obligatorio");
  if (reason.length()>MAX_REASON || reason.chars().anyMatch(c->c<0x20&&c!='\n'&&c!='\r'&&c!='\t')) throw bad("El motivo no puede superar "+MAX_REASON+" caracteres ni incluir caracteres de control");
  DocumentLock lock=locks.findByDocumentItemId(itemId).orElse(null); boolean released=false;
  if (lock!=null) {
   if (lock.getExpiresAt().isAfter(now()) && !lock.getOwner().getId().equals(actorId)) throw conflict("El documento está bloqueado por "+lock.getOwner().getUsername()+": espere a que lo libere o venza");
   locks.delete(lock); released=true;
  }
  User actor=user(actorId);
  item.setActivo(false); item.setFechaBaja(now()); item.setBajaPor(actor); item.setMotivoBaja(reason);
  items.saveAndFlush(item);
  audit.record(flight,actor,"DOCUMENT",itemId,"DEACTIVATE","{\"activo\":true}",
      "{\"activo\":false,\"motivoBaja\":"+jsonString(reason)+",\"versiones\":"+versions.countByDocumentItemId(itemId)+",\"bloqueoLiberado\":"+released+"}");
 }

 @Transactional(readOnly=true)
 public DocumentLockView lockView(Long itemId,Long actorId){
  FlightDocumentItem item=items.findById(itemId).orElseThrow(()->notFound("Documento")); requireVisible(item,actorId);
  requireActive(item);
  return locks.findByDocumentItemId(itemId).map(x->lockView(item,x,actorId)).orElseGet(()->availableLock(item,actorId));
 }

 @Transactional
 public DocumentLockView acquireLock(Long itemId,Long actorId){
  // La fila documental actúa como cerrojo breve y serializa incluso la primera inserción del lease.
  FlightDocumentItem item=items.lockById(itemId).orElseThrow(()->notFound("Documento")); mayChange(item.getFlight(),actorId);
  requireActive(item); requireCompatible(item.getDocumentType(),item.getFlight(),false);
  User actor=user(actorId); LocalDateTime now=now(); DocumentLock lock=locks.findByDocumentItemId(itemId).orElse(null);
  if(lock!=null && lock.getExpiresAt().isAfter(now) && !lock.getOwner().getId().equals(actorId)) throw conflict("El documento está bloqueado por otro usuario");
  boolean recovered=lock!=null && !lock.getOwner().getId().equals(actorId);
  if(lock==null){lock=new DocumentLock();lock.setDocumentItem(item);} lock.setOwner(actor);lock.setAcquiredAt(now);lock.setExpiresAt(now.plusSeconds(lockSeconds));locks.saveAndFlush(lock);
  audit.record(item.getFlight(),actor,"DOCUMENT_LOCK",itemId,recovered?"RECOVER":"ACQUIRE",null,"{\"expiresAt\":\""+lock.getExpiresAt()+"\"}");
  return lockView(item,lock,actorId);
 }

 @Transactional
 public void releaseLock(Long itemId,Long actorId){
  // Liberar no exige un vuelo editable (debe poder hacerse cuando ya es de sólo consulta), pero sigue sujeto al bloqueo del comandante.
  FlightDocumentItem item=items.lockById(itemId).orElseThrow(()->notFound("Documento")); mayOperate(item.getFlight(),actorId);
  DocumentLock lock=locks.findByDocumentItemId(itemId).orElseThrow(()->notFound("Bloqueo"));
  if(!lock.getOwner().getId().equals(actorId)) throw forbidden("Sólo el propietario puede liberar el bloqueo");
  locks.delete(lock); audit.record(item.getFlight(),user(actorId),"DOCUMENT_LOCK",itemId,"RELEASE",null,null);
 }

 @Transactional(readOnly=true)
 public DocumentHistoryView history(Long itemId, Long actorId) {
  FlightDocumentItem item=items.findById(itemId).orElseThrow(()->notFound("Documento"));
  requireVisible(item,actorId);
  DocumentType type=item.getDocumentType();
  return new DocumentHistoryView(item.getId().toString(), item.getNombreDocumento(),
      new DocumentTypeView(type.getCodigo(),type.getNombre()),
      versions.findByDocumentItemIdOrderByNumeroVersionDesc(itemId).stream().map(this::versionView).toList());
 }

 /** La descarga se audita (sin contenido): los documentos pueden incluir información sanitaria sensible. */
 @Transactional
 public Download download(Long versionId, Long actorId) {
  FlightDocument version=versions.findById(versionId).orElseThrow(()->notFound("Versión"));
  Flight flight=version.getDocumentItem().getFlight();
  requireVisible(version.getDocumentItem(),actorId);
  byte[] data=storage.read(version.getUbicacionAlmacenamiento()).bytes();
  audit.record(flight,user(actorId),"DOCUMENT",version.getId(),"DOWNLOAD",null,"{\"numeroVersion\":"+version.getNumeroVersion()+"}");
  return new Download(version.getNombreArchivoOriginal(), data);
 }

 private FlightDocumentItem newItem(Flight flight, String typeCode, String nombreDocumento) {
  if (nombreDocumento==null || nombreDocumento.trim().isEmpty() || nombreDocumento.trim().length()>255) throw bad("El nombre del documento es obligatorio y no puede superar 255 caracteres");
  DocumentType type=types.findByCodigo(typeCode).orElseThrow(()->bad("Tipo documental inexistente"));
  FlightDocumentItem item=new FlightDocumentItem(); item.setFlight(flight); item.setDocumentType(type); item.setNombreDocumento(nombreDocumento.trim());
  return item;
 }

 private FlightDocument pdfVersion(FlightDocumentItem item, MultipartFile file, String location, User actor) {
  FlightDocument version=new FlightDocument();
  version.setDocumentItem(item); version.setNumeroVersion(nextNumeroVersion(item)); version.setEsVersionActual(true);
  version.setNombreArchivoOriginal(originalFileName(file.getOriginalFilename()));
  version.setUbicacionAlmacenamiento(location); version.setTamanioBytes(file.getSize()); version.setCreadoPor(actor);
  return version;
 }

 private int nextNumeroVersion(FlightDocumentItem item) {
  Integer max=versions.maxNumeroVersion(item.getId()); return max==null ? 1 : max+1;
 }

 private void advance(FlightDocumentItem item, FlightDocument version) {
  versions.findByDocumentItemIdAndEsVersionActualTrue(item.getId()).ifPresent(old -> {
   old.setEsVersionActual(false);
   // SQL Server mantiene un índice único filtrado para la versión vigente.
   // Forzamos primero el UPDATE de la versión anterior; de lo contrario
   // Hibernate puede intentar insertar la nueva y violar ese índice.
   versions.flush();
  });
  versions.save(version);
 }

 /** Acceso al vuelo y, para su comandante, que no esté bloqueado por una obligación de informe vencida. */
 private void mayOperate(Flight flight, Long actorId) {
  access.mayRead(flight,actorId);
  if (flight.getComandante()!=null && flight.getComandante().getId().equals(actorId)) commanderAccess.requireOperationalAccess(actorId);
 }
 private void mayChange(Flight flight, Long actorId) {
  mayOperate(flight,actorId);
  if (readOnly(flight)) throw bad("El vuelo en estado "+stateCode(flight).toLowerCase(java.util.Locale.ROOT)+" es de sólo consulta documental");
 }
 /** Estado que gobierna el vuelo: el del vuelo o, mientras no lo tiene, el de su solicitud sanitaria (misma regla que hangar y coordinaciones). */
 private static String stateCode(Flight f) {
  if (f.getEstadoVuelo()!=null) return f.getEstadoVuelo().getCodigo();
  return f.getSanitario()!=null && f.getSanitario().getEstadoSolicitud()!=null ? f.getSanitario().getEstadoSolicitud().getCodigo() : "";
 }
 private static boolean readOnly(Flight f) { String code=stateCode(f); return READ_ONLY_STATES.contains(code) || "RECHAZADO".equals(code); }
 private static boolean compatible(DocumentType type, Flight flight) { return !type.isSoloVueloSanitario() || flight.getSanitario()!=null; }
 private void requireCompatible(DocumentType type, Flight flight, boolean creating) {
  if (compatible(type,flight)) return;
  String message="El tipo documental «"+type.getNombre()+"» sólo puede registrarse en vuelos sanitarios";
  throw creating ? bad(message) : conflict(message+"; retire este documento y regístrelo con un tipo compatible");
 }
 private void requireActive(FlightDocumentItem item) { if (!Boolean.TRUE.equals(item.getActivo())) throw conflict("El documento fue retirado del uso operativo"); }
 /** Un documento activo lo ve quien accede al vuelo; uno retirado, sólo Operaciones y el comandante del vuelo. */
 private void requireVisible(FlightDocumentItem item, Long actorId) {
  if (Boolean.TRUE.equals(item.getActivo())) access.mayRead(item.getFlight(),actorId); else access.mayReadRetired(item.getFlight(),actorId);
 }
 /** Política de baja: Operaciones retira cualquier documento del vuelo; el comandante, sólo los que él cargó y mientras no esté bloqueado. */
 private boolean canRetire(Flight flight, Long actorId, java.util.function.Supplier<Long> firstAuthor) {
  if (readOnly(flight)) return false;
  if (access.operationsStaff(actorId)) return true;
  boolean commander=flight.getComandante()!=null && flight.getComandante().getId().equals(actorId);
  return commander && actorId.equals(firstAuthor.get()) && !commanderAccess.isBlocked(actorId);
 }
 private Long firstAuthor(FlightDocumentItem item) {
  return versions.findFirstByDocumentItemIdOrderByNumeroVersionAsc(item.getId()).map(v->v.getCreadoPor()==null ? null : v.getCreadoPor().getId()).orElse(null);
 }
 private static String jsonString(String value) {
  StringBuilder b=new StringBuilder("\"");
  for (char c : value.toCharArray()) {
   switch (c) {
    case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\"); case '\n' -> b.append("\\n"); case '\r' -> b.append("\\r"); case '\t' -> b.append("\\t");
    default -> { if (c<0x20) b.append(String.format("\\u%04x",(int)c)); else b.append(c); }
   }
  }
  return b.append('"').toString();
 }
 private void requireEditableLock(FlightDocumentItem item,Long actorId){
  DocumentLock lock=locks.findByDocumentItemId(item.getId()).orElseThrow(()->conflict("Debe adquirir un bloqueo antes de crear una versión"));
  if(!lock.getOwner().getId().equals(actorId) || !lock.getExpiresAt().isAfter(now())) throw conflict("El bloqueo documental no es válido o venció");
 }
 private DocumentLockView availableLock(FlightDocumentItem item,Long actorId){return new DocumentLockView(item.getId().toString(),null,null,null,null,false,false,null);}
 private DocumentLockView lockView(FlightDocumentItem item,DocumentLock lock,Long actorId){
  LocalDateTime now=now(); boolean active=lock.getExpiresAt().isAfter(now);
  // Los instantes se guardan en UTC; la API los entrega como hora civil de la zona de negocio, igual que el resto de las respuestas.
  return new DocumentLockView(item.getId().toString(),lock.getOwner().getId(),lock.getOwner().getUsername(),civil(lock.getAcquiredAt()),civil(lock.getExpiresAt()),lock.getOwner().getId().equals(actorId),active,
      active ? java.time.Duration.between(now,lock.getExpiresAt()).toSeconds() : 0L);
 }
 private LocalDateTime civil(LocalDateTime utc){return AuditService.toLocal(utc,clock.getZone());}
 private LocalDateTime now(){return LocalDateTime.ofInstant(Instant.now(clock),ZoneOffset.UTC);}
 private User user(Long id) { return users.findById(id).orElseThrow(()->notFound("Usuario")); }
 private String originalFileName(String value) {
  if (value==null || value.isBlank() || value.length()>255 || value.chars().anyMatch(c->c<0x20||c==0x7f)) throw bad("El nombre original del archivo es inválido");
  // Sólo se conserva el nombre: un cliente puede enviar rutas que nunca deben formar parte del registro.
  String name=value.substring(Math.max(value.lastIndexOf('/'),value.lastIndexOf('\\'))+1).trim();
  if (name.isEmpty() || ".".equals(name) || "..".equals(name)) throw bad("El nombre original del archivo es inválido");
  return name;
 }
 private DocumentView view(FlightDocumentItem item, FlightDocument version, Long actorId, java.util.function.Supplier<Long> firstAuthor) {
  DocumentType type=item.getDocumentType();
  return new DocumentView(item.getId().toString(), item.getNombreDocumento(), new DocumentTypeView(type.getCodigo(),type.getNombre()), versionView(version),
      Boolean.TRUE.equals(item.getActivo()) && canRetire(item.getFlight(),actorId,firstAuthor));
 }
 private DocumentVersionView versionView(FlightDocument version) {
  LocalDateTime created=civil(version.getCreatedAt());
  return new DocumentVersionView(version.getId().toString(), version.getNumeroVersion(), Boolean.TRUE.equals(version.getEsVersionActual()),
      version.getNombreArchivoOriginal(), version.getTamanioBytes(), created, "/api/document-versions/"+version.getId()+"/download",
      version.getCreadoPor()==null ? null : version.getCreadoPor().getUsername());
 }
 private ApiException bad(String message) { return new ApiException(HttpStatus.BAD_REQUEST,message); }
 private ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT,message); }
 private ApiException forbidden(String message) { return new ApiException(HttpStatus.FORBIDDEN,message); }
 private ApiException notFound(String item) { return new ApiException(HttpStatus.NOT_FOUND,item+" inexistente"); }
 public record Download(String filename, byte[] data) {}
}
