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
 private final FlightRepository flights; private final DocumentTypeRepository types; private final DocumentItemRepository items;
 private final FlightDocumentRepository versions; private final UserRepository users; private final DocumentStorage storage;
 private final AuditService audit; private final FlightAuthorizationService access;
 private final DocumentLockRepository locks; private final Clock clock; private final long lockSeconds;

 public DocumentService(FlightRepository flights, DocumentTypeRepository types, DocumentItemRepository items,
                        FlightDocumentRepository versions, UserRepository users, DocumentStorage storage,
                        AuditService audit, FlightAuthorizationService access, DocumentLockRepository locks, Clock clock,
                        @org.springframework.beans.factory.annotation.Value("${app.storage.document-lock-seconds:300}") long lockSeconds) {
  this.flights=flights; this.types=types; this.items=items; this.versions=versions; this.users=users;
  this.storage=storage; this.audit=audit; this.access=access;
  this.locks=locks; this.clock=clock; this.lockSeconds=lockSeconds;
 }

 @Transactional
 public DocumentView createPdf(Long flightId, String documentTypeCode, String nombreDocumento, MultipartFile file, Long actorId) {
  Flight flight=flights.lockById(flightId).orElseThrow(()->notFound("Vuelo"));
  mayChange(flight,actorId);
  String location=storage.storePdf(file);
  try {
   FlightDocumentItem item=newItem(flight,documentTypeCode,nombreDocumento);
   items.save(item);
   FlightDocument version=pdfVersion(item,file,location,user(actorId));
   versions.save(version);
   audit.record(flight,user(actorId),"DOCUMENT",version.getId(),"CREATE",null,"{\"numeroVersion\":1}");
   return view(item,version);
  } catch (RuntimeException e) { storage.deleteQuietly(location); throw e; }
 }

 @Transactional
 public DocumentView replacePdf(Long itemId, MultipartFile file, Long actorId) {
  FlightDocumentItem item=items.lockById(itemId).orElseThrow(()->notFound("Documento"));
  mayChange(item.getFlight(),actorId);
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
   return view(item,version);
  } catch (RuntimeException e) { storage.deleteQuietly(location); throw e; }
 }

 @Transactional(readOnly=true)
 public List<DocumentView> list(Long flightId, Long actorId) {
  Flight flight=flights.findById(flightId).orElseThrow(()->notFound("Vuelo"));
  access.mayRead(flight,actorId);
  return items.findByFlightIdAndActivoTrueOrderByCreatedAtDesc(flightId).stream().map(item -> {
   FlightDocument current=versions.findByDocumentItemIdAndEsVersionActualTrue(item.getId())
       .orElseThrow(()->conflict("El documento no tiene una versión vigente"));
   return view(item,current);
  }).toList();
 }

 @Transactional(readOnly=true)
 public DocumentLockView lockView(Long itemId,Long actorId){
  FlightDocumentItem item=items.findById(itemId).orElseThrow(()->notFound("Documento")); access.mayRead(item.getFlight(),actorId);
  return locks.findByDocumentItemId(itemId).map(x->lockView(item,x,actorId)).orElseGet(()->availableLock(item,actorId));
 }

 @Transactional
 public DocumentLockView acquireLock(Long itemId,Long actorId){
  // La fila documental actúa como cerrojo breve y serializa incluso la primera inserción del lease.
  FlightDocumentItem item=items.lockById(itemId).orElseThrow(()->notFound("Documento")); mayChange(item.getFlight(),actorId);
  User actor=user(actorId); LocalDateTime now=now(); DocumentLock lock=locks.findByDocumentItemId(itemId).orElse(null);
  if(lock!=null && lock.getExpiresAt().isAfter(now) && !lock.getOwner().getId().equals(actorId)) throw conflict("El documento está bloqueado por otro usuario");
  boolean recovered=lock!=null && !lock.getOwner().getId().equals(actorId);
  if(lock==null){lock=new DocumentLock();lock.setDocumentItem(item);} lock.setOwner(actor);lock.setAcquiredAt(now);lock.setExpiresAt(now.plusSeconds(lockSeconds));locks.saveAndFlush(lock);
  audit.record(item.getFlight(),actor,"DOCUMENT_LOCK",itemId,recovered?"RECOVER":"ACQUIRE",null,"{\"expiresAt\":\""+lock.getExpiresAt()+"\"}");
  return lockView(item,lock,actorId);
 }

 @Transactional
 public void releaseLock(Long itemId,Long actorId){
  FlightDocumentItem item=items.lockById(itemId).orElseThrow(()->notFound("Documento")); mayChange(item.getFlight(),actorId);
  DocumentLock lock=locks.findByDocumentItemId(itemId).orElseThrow(()->notFound("Bloqueo"));
  if(!lock.getOwner().getId().equals(actorId)) throw forbidden("Sólo el propietario puede liberar el bloqueo");
  locks.delete(lock); audit.record(item.getFlight(),user(actorId),"DOCUMENT_LOCK",itemId,"RELEASE",null,null);
 }

 @Transactional(readOnly=true)
 public DocumentHistoryView history(Long itemId, Long actorId) {
  FlightDocumentItem item=items.findById(itemId).orElseThrow(()->notFound("Documento"));
  access.mayRead(item.getFlight(),actorId);
  DocumentType type=item.getDocumentType();
  return new DocumentHistoryView(item.getId().toString(), item.getNombreDocumento(),
      new DocumentTypeView(type.getCodigo(),type.getNombre()),
      versions.findByDocumentItemIdOrderByNumeroVersionDesc(itemId).stream().map(this::versionView).toList());
 }

 @Transactional(readOnly=true)
 public Download download(Long versionId, Long actorId) {
  FlightDocument version=versions.findById(versionId).orElseThrow(()->notFound("Versión"));
  access.mayRead(version.getDocumentItem().getFlight(),actorId);
  return new Download(version.getNombreArchivoOriginal(), storage.read(version.getUbicacionAlmacenamiento()).bytes());
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

 private void mayChange(Flight flight, Long actorId) {
  access.mayRead(flight,actorId);
  if (flight.getEstadoVuelo()!=null && "FINALIZADO".equals(flight.getEstadoVuelo().getCodigo())) throw bad("El vuelo finalizado no admite documentos");
 }
 private void requireEditableLock(FlightDocumentItem item,Long actorId){
  DocumentLock lock=locks.findByDocumentItemId(item.getId()).orElseThrow(()->conflict("Debe adquirir un bloqueo antes de crear una versión"));
  if(!lock.getOwner().getId().equals(actorId) || !lock.getExpiresAt().isAfter(now())) throw conflict("El bloqueo documental no es válido o venció");
 }
 private DocumentLockView availableLock(FlightDocumentItem item,Long actorId){return new DocumentLockView(item.getId().toString(),null,null,null,null,false,false);}
 private DocumentLockView lockView(FlightDocumentItem item,DocumentLock lock,Long actorId){boolean active=lock.getExpiresAt().isAfter(now());return new DocumentLockView(item.getId().toString(),lock.getOwner().getId(),lock.getOwner().getUsername(),lock.getAcquiredAt(),lock.getExpiresAt(),lock.getOwner().getId().equals(actorId),active);}
 private LocalDateTime now(){return LocalDateTime.ofInstant(Instant.now(clock),ZoneOffset.UTC);}
 private User user(Long id) { return users.findById(id).orElseThrow(()->notFound("Usuario")); }
 private String originalFileName(String value) {
  if (value==null || value.isBlank() || value.length()>255 || value.indexOf('\u0000')>=0 || value.contains("\r") || value.contains("\n")) throw bad("El nombre original del archivo es inválido");
  return value;
 }
 private DocumentView view(FlightDocumentItem item, FlightDocument version) {
  DocumentType type=item.getDocumentType();
  return new DocumentView(item.getId().toString(), item.getNombreDocumento(), new DocumentTypeView(type.getCodigo(),type.getNombre()), versionView(version));
 }
 private DocumentVersionView versionView(FlightDocument version) {
  LocalDateTime created=version.getCreatedAt();
  return new DocumentVersionView(version.getId().toString(), version.getNumeroVersion(), Boolean.TRUE.equals(version.getEsVersionActual()),
      version.getNombreArchivoOriginal(), version.getTamanioBytes(), created, "/api/document-versions/"+version.getId()+"/download");
 }
 private ApiException bad(String message) { return new ApiException(HttpStatus.BAD_REQUEST,message); }
 private ApiException conflict(String message) { return new ApiException(HttpStatus.CONFLICT,message); }
 private ApiException forbidden(String message) { return new ApiException(HttpStatus.FORBIDDEN,message); }
 private ApiException notFound(String item) { return new ApiException(HttpStatus.NOT_FOUND,item+" inexistente"); }
 public record Download(String filename, byte[] data) {}
}
