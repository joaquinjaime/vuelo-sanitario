package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.dto.DocumentDtos.DocumentView;
import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightDocument;
import com.vuelossanitarios.backend.domain.flight.FlightDocumentItem;
import com.vuelossanitarios.backend.domain.flight.DocumentLock;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Optional;
import java.time.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DocumentServiceTest {
 private FlightRepository flights=mock(FlightRepository.class); private DocumentTypeRepository types=mock(DocumentTypeRepository.class);
 private DocumentItemRepository items=mock(DocumentItemRepository.class); private FlightDocumentRepository versions=mock(FlightDocumentRepository.class);
 private UserRepository users=mock(UserRepository.class); private DocumentStorage storage=mock(DocumentStorage.class);
 private AuditService audit=mock(AuditService.class); private FlightAuthorizationService access=mock(FlightAuthorizationService.class);
 private DocumentLockRepository locks=mock(DocumentLockRepository.class);
 private DocumentService service; private Long actorId=java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE); private User actor=new User(); private Flight flight=new Flight();
 private DocumentType type=new DocumentType();

 @BeforeEach void setup() {
  service=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,java.time.Clock.systemUTC(),300);
  flight.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); FlightStatus status=new FlightStatus(); status.setCodigo("PLANIFICADO"); flight.setEstadoVuelo(status);
  actor.setId(actorId); type.setCodigo("AUTORIZACION"); type.setNombre("Autorización de vuelo");
  when(users.findById(actorId)).thenReturn(Optional.of(actor));
  doAnswer(invocation -> { FlightDocumentItem item=invocation.getArgument(0); if(item.getId()==null)item.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); return item; }).when(items).save(any());
  doAnswer(invocation -> { FlightDocument version=invocation.getArgument(0); if(version.getId()==null)version.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); return version; }).when(versions).save(any());
 }

 @Test void listsOnlyActiveDocumentsWithTheirCurrentVersionAfterAuthorizingFlightRead() {
  FlightDocumentItem item=item(); FlightDocument current=version(item,2,"vigente.pdf","current.pdf"); current.setEsVersionActual(true);
  when(flights.findById(flight.getId())).thenReturn(Optional.of(flight));
  when(items.findByFlightIdAndActivoTrueOrderByCreatedAtDesc(flight.getId())).thenReturn(java.util.List.of(item));
  when(versions.findByDocumentItemIdAndEsVersionActualTrue(item.getId())).thenReturn(Optional.of(current));

  var rows=service.list(flight.getId(),actorId);

  assertEquals(1,rows.size()); assertEquals(item.getId().toString(),rows.get(0).id()); assertEquals(2,rows.get(0).versionActual().numeroVersion());
  verify(access).mayRead(flight,actorId);
 }

 @Test void createsLogicalDocumentWithPdfAndFirstVersion() {
  Long flightId=flight.getId();
  when(flights.lockById(flightId)).thenReturn(Optional.of(flight));
  when(types.findByCodigo("AUTORIZACION")).thenReturn(Optional.of(type));
  when(versions.maxNumeroVersion(any())).thenReturn(null);
  when(storage.storePdf(any())).thenReturn("3bc7.pdf");
  MockMultipartFile pdf=pdf("AUTORIZACION_SANATORIO_2026.pdf");

  DocumentView result=service.createPdf(flightId,"AUTORIZACION","Autorización médica",pdf,actorId);

  assertEquals("Autorización médica",result.nombreDocumento());
  assertEquals("AUTORIZACION",result.tipoDocumento().codigo());
  assertEquals(1,result.versionActual().numeroVersion());
  assertTrue(result.versionActual().esVersionActual());
  assertEquals("AUTORIZACION_SANATORIO_2026.pdf",result.versionActual().nombreArchivoOriginal());
  ArgumentCaptor<FlightDocument> saved=ArgumentCaptor.forClass(FlightDocument.class);
  verify(versions).save(saved.capture());
  assertEquals("3bc7.pdf",saved.getValue().getUbicacionAlmacenamiento());
 }

 @Test void secondPdfVersionBecomesCurrentWithoutRemovingTheFirst() {
  FlightDocumentItem item=item(); Long itemId=item.getId();
  FlightDocument v1=new FlightDocument(); v1.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); v1.setDocumentItem(item); v1.setNumeroVersion(1); v1.setEsVersionActual(true);
  when(items.lockById(itemId)).thenReturn(Optional.of(item));
  com.vuelossanitarios.backend.domain.flight.DocumentLock lock=new com.vuelossanitarios.backend.domain.flight.DocumentLock(); lock.setOwner(actor); lock.setExpiresAt(java.time.LocalDateTime.now(java.time.Clock.systemUTC()).plusMinutes(5));
  when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lock));
  when(versions.maxNumeroVersion(itemId)).thenReturn(1);
  when(versions.findByDocumentItemIdAndEsVersionActualTrue(itemId)).thenReturn(Optional.of(v1));
  when(storage.storePdf(any())).thenReturn("v2.pdf");

  DocumentView result=service.replacePdf(itemId,pdf("autorizacion_corregida.pdf"),actorId);

  assertEquals(2,result.versionActual().numeroVersion());
  assertTrue(result.versionActual().esVersionActual());
  assertFalse(v1.getEsVersionActual());
  assertEquals("autorizacion_corregida.pdf",result.versionActual().nombreArchivoOriginal());
  InOrder order=inOrder(versions);
  order.verify(versions).flush();
  order.verify(versions).save(any(FlightDocument.class));
 }

 @Test void eachHistoricalVersionDownloadsItsOwnStoredPdf() {
  FlightDocumentItem item=item();
  FlightDocument v1=version(item,1,"v1-original.pdf","v1.pdf");
  FlightDocument v2=version(item,2,"v2-corregida.pdf","v2.pdf");
  when(versions.findById(v1.getId())).thenReturn(Optional.of(v1));
  when(versions.findById(v2.getId())).thenReturn(Optional.of(v2));
  when(storage.read("v1.pdf")).thenReturn(new DocumentStorage.ResourceData("V1".getBytes()));
  when(storage.read("v2.pdf")).thenReturn(new DocumentStorage.ResourceData("V2".getBytes()));

  assertArrayEquals("V1".getBytes(),service.download(v1.getId(),actorId).data());
  assertArrayEquals("V2".getBytes(),service.download(v2.getId(),actorId).data());
  verify(storage).read("v1.pdf"); verify(storage).read("v2.pdf");
 }

 @Test void activeLeaseRejectsAnotherEditorAndExpiredLeaseCanBeRecovered() {
  FlightDocumentItem item=item(); Long itemId=item.getId(); User other=new User(); Long otherId=actorId+1; other.setId(otherId);
  when(items.lockById(itemId)).thenReturn(Optional.of(item)); when(users.findById(otherId)).thenReturn(Optional.of(other));
  DocumentLock lease=new DocumentLock(); lease.setDocumentItem(item); lease.setOwner(actor); lease.setAcquiredAt(LocalDateTime.now(Clock.systemUTC())); lease.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).plusMinutes(5));
  when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lease));
  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.acquireLock(itemId,otherId));
  lease.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).minusSeconds(1));
  var recovered=service.acquireLock(itemId,otherId);
  assertTrue(recovered.mine()); assertEquals(otherId,recovered.ownerId()); verify(locks,atLeastOnce()).saveAndFlush(lease);
 }

 @Test void versionUploadRequiresTheCallersActiveLease() {
  FlightDocumentItem item=item(); Long itemId=item.getId(); User other=new User(); other.setId(actorId+1);
  DocumentLock lease=new DocumentLock(); lease.setOwner(other); lease.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).plusMinutes(5));
  when(items.lockById(itemId)).thenReturn(Optional.of(item)); when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lease));
  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.replacePdf(itemId,pdf("blocked.pdf"),actorId));
  verify(storage,never()).storePdf(any());
 }

 @Test void versionUploadIsRejectedWhenItsLeaseExpiresDuringStorage() {
  FlightDocumentItem item=item(); Long itemId=item.getId();
  Instant start=Instant.parse("2026-10-13T12:00:00Z"); AtomicReference<Instant> instant=new AtomicReference<>(start);
  Clock advancingClock=new Clock(){ public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId zone){return this;} public Instant instant(){return instant.get();} };
  DocumentService expiringService=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,advancingClock,300);
  DocumentLock lease=new DocumentLock(); lease.setOwner(actor); lease.setExpiresAt(LocalDateTime.ofInstant(start.plusSeconds(1),ZoneOffset.UTC));
  when(items.lockById(itemId)).thenReturn(Optional.of(item)); when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lease));
  when(storage.storePdf(any())).thenAnswer(invocation->{ instant.set(start.plusSeconds(2)); return "late.pdf"; });

  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->expiringService.replacePdf(itemId,pdf("late.pdf"),actorId));

  verify(storage).deleteQuietly("late.pdf"); verify(versions,never()).save(any());
 }

 private FlightDocumentItem item() {
  FlightDocumentItem item=new FlightDocumentItem(); item.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); item.setFlight(flight); item.setDocumentType(type); item.setNombreDocumento("Autorización médica"); return item;
 }
 private FlightDocument version(FlightDocumentItem item,int number,String filename,String location) {
  FlightDocument version=new FlightDocument(); version.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); version.setDocumentItem(item); version.setNumeroVersion(number); version.setEsVersionActual(number==2); version.setNombreArchivoOriginal(filename); version.setUbicacionAlmacenamiento(location); version.setTamanioBytes(2L); return version;
 }
 private MockMultipartFile pdf(String name) { return new MockMultipartFile("file",name,"application/pdf","%PDF-1.7".getBytes()); }
}
