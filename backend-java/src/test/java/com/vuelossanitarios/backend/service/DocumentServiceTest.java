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
  service=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,java.time.Clock.systemUTC(),mock(CommanderReportAccessService.class),300);
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
  DocumentService expiringService=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,advancingClock,mock(CommanderReportAccessService.class),300);
  DocumentLock lease=new DocumentLock(); lease.setOwner(actor); lease.setExpiresAt(LocalDateTime.ofInstant(start.plusSeconds(1),ZoneOffset.UTC));
  when(items.lockById(itemId)).thenReturn(Optional.of(item)); when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lease));
  when(storage.storePdf(any())).thenAnswer(invocation->{ instant.set(start.plusSeconds(2)); return "late.pdf"; });

  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->expiringService.replacePdf(itemId,pdf("late.pdf"),actorId));

  verify(storage).deleteQuietly("late.pdf"); verify(versions,never()).save(any());
 }

 @Test void closedFlightsAreReadOnlyForCreationVersionsAndLeaseAcquisitionButStillReadable() {
  for (String code : java.util.List.of("FINALIZADO","COMPLETADO","CANCELADO")) {
   FlightStatus closed=new FlightStatus(); closed.setCodigo(code); flight.setEstadoVuelo(closed);
   FlightDocumentItem item=item(); Long itemId=item.getId();
   when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight)); when(items.lockById(itemId)).thenReturn(Optional.of(item));
   var create=assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.createPdf(flight.getId(),"AUTORIZACION","Nuevo",pdf("a.pdf"),actorId));
   assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,create.status(),code);
   assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.replacePdf(itemId,pdf("b.pdf"),actorId),code);
   assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.acquireLock(itemId,actorId),code);
  }
  verify(storage,never()).storePdf(any()); verify(locks,never()).saveAndFlush(any()); verify(versions,never()).save(any());
 }

 @Test void leaseOwnerCanReleaseEvenWhenTheFlightIsAlreadyReadOnlyAndAnotherUserCannot() {
  FlightStatus closed=new FlightStatus(); closed.setCodigo("FINALIZADO"); flight.setEstadoVuelo(closed);
  FlightDocumentItem item=item(); Long itemId=item.getId(); User other=new User(); other.setId(actorId+1);
  DocumentLock lease=new DocumentLock(); lease.setDocumentItem(item); lease.setOwner(actor); lease.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).plusMinutes(5));
  when(items.lockById(itemId)).thenReturn(Optional.of(item)); when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lease)); when(users.findById(actorId+1)).thenReturn(Optional.of(other));
  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.releaseLock(itemId,actorId+1));
  verify(locks,never()).delete(any());
  service.releaseLock(itemId,actorId);
  verify(locks).delete(lease); verify(audit).record(eq(flight),eq(actor),eq("DOCUMENT_LOCK"),eq(itemId),eq("RELEASE"),isNull(),isNull());
 }

 @Test void aCommanderBlockedByAnOverdueReportCannotReleaseOrChangeEvenThoughReleaseNeedsNoEditableFlight() {
  CommanderReportAccessService blockedAccess=mock(CommanderReportAccessService.class);
  doThrow(new com.vuelossanitarios.backend.api.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"COMANDANTE_BLOQUEADO","Comandante bloqueado",null)).when(blockedAccess).requireOperationalAccess(actorId);
  DocumentService guarded=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,Clock.systemUTC(),blockedAccess,300);
  flight.setComandante(actor);
  FlightDocumentItem item=item(); Long itemId=item.getId();
  DocumentLock lease=new DocumentLock(); lease.setDocumentItem(item); lease.setOwner(actor); lease.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).plusMinutes(5));
  when(items.lockById(itemId)).thenReturn(Optional.of(item)); when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lease));
  var error=assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->guarded.releaseLock(itemId,actorId));
  assertEquals("COMANDANTE_BLOQUEADO",error.code()); verify(locks,never()).delete(any());
 }

 @Test void rejectsASecondActiveDocumentWithTheSameNameInTheFlight() {
  when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight)); when(types.findByCodigo("AUTORIZACION")).thenReturn(Optional.of(type));
  when(items.existsByFlightIdAndActivoTrueAndNombreDocumentoIgnoreCase(flight.getId(),"Autorización médica")).thenReturn(true);
  when(storage.storePdf(any())).thenReturn("dup.pdf");
  var error=assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.createPdf(flight.getId(),"AUTORIZACION","  Autorización médica ",pdf("a.pdf"),actorId));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,error.status());
  verify(items,never()).save(any()); verify(versions,never()).save(any()); verify(storage).deleteQuietly("dup.pdf");
 }

 @Test void rejectsUnknownDocumentTypeWithoutPersistingAnything() {
  when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight)); when(types.findByCodigo("INVENTADO")).thenReturn(Optional.empty()); when(storage.storePdf(any())).thenReturn("x.pdf");
  var error=assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.createPdf(flight.getId(),"INVENTADO","Doc",pdf("a.pdf"),actorId));
  assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,error.status());
  verify(items,never()).save(any()); verify(storage).deleteQuietly("x.pdf");
 }

 @Test void storesOnlyTheBaseNameOfTheUploadedFileAndRejectsControlCharacters() {
  when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight)); when(types.findByCodigo("AUTORIZACION")).thenReturn(Optional.of(type));
  when(versions.maxNumeroVersion(any())).thenReturn(null); when(storage.storePdf(any())).thenReturn("p.pdf");
  assertEquals("parte.pdf",service.createPdf(flight.getId(),"AUTORIZACION","Con ruta",pdf("..\\..\\windows/system32\\parte.pdf"),actorId).versionActual().nombreArchivoOriginal());
  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.createPdf(flight.getId(),"AUTORIZACION","Otro",pdf("..\\.."),actorId));
  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.createPdf(flight.getId(),"AUTORIZACION","Otro",pdf("a\tb.pdf"),actorId));
 }

 @Test void downloadIsAuditedWithoutContentAndHistoryExposesTheAuthor() {
  FlightDocumentItem item=item(); FlightDocument v2=version(item,2,"v2.pdf","v2.pdf"); v2.setCreadoPor(actor); actor.setUsername("ops1");
  when(versions.findById(v2.getId())).thenReturn(Optional.of(v2)); when(storage.read("v2.pdf")).thenReturn(new DocumentStorage.ResourceData("PDF".getBytes()));
  service.download(v2.getId(),actorId);
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class);
  verify(audit).record(eq(flight),eq(actor),eq("DOCUMENT"),eq(v2.getId()),eq("DOWNLOAD"),isNull(),after.capture());
  assertEquals("{\"numeroVersion\":2}",after.getValue());
  when(items.findById(item.getId())).thenReturn(Optional.of(item)); when(versions.findByDocumentItemIdOrderByNumeroVersionDesc(item.getId())).thenReturn(java.util.List.of(v2));
  assertEquals("ops1",service.history(item.getId(),actorId).versiones().get(0).creadoPor());
 }

 @Test void unreadableStoredFileDoesNotLeaveADownloadAuditEvent() {
  FlightDocumentItem item=item(); FlightDocument v1=version(item,1,"v1.pdf","gone.pdf");
  when(versions.findById(v1.getId())).thenReturn(Optional.of(v1)); when(storage.read("gone.pdf")).thenThrow(new com.vuelossanitarios.backend.api.ApiException(org.springframework.http.HttpStatus.NOT_FOUND,"Archivo inexistente"));
  assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->service.download(v1.getId(),actorId));
  verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }

 @Test void leaseTimesAreReturnedAsBusinessCivilTimeWithTheRemainingSeconds() {
  Instant start=Instant.parse("2026-10-13T12:00:00Z");
  Clock tucuman=Clock.fixed(start,ZoneId.of("America/Argentina/Tucuman"));
  DocumentService zoned=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,tucuman,mock(CommanderReportAccessService.class),300);
  FlightDocumentItem item=item(); Long itemId=item.getId();
  DocumentLock lease=new DocumentLock(); lease.setDocumentItem(item); lease.setOwner(actor); lease.setAcquiredAt(LocalDateTime.of(2026,10,13,11,58)); lease.setExpiresAt(LocalDateTime.of(2026,10,13,12,3));
  when(items.findById(itemId)).thenReturn(Optional.of(item)); when(locks.findByDocumentItemId(itemId)).thenReturn(Optional.of(lease));
  var view=zoned.lockView(itemId,actorId);
  assertEquals(LocalDateTime.of(2026,10,13,8,58),view.acquiredAt()); assertEquals(LocalDateTime.of(2026,10,13,9,3),view.expiresAt());
  assertTrue(view.active()); assertTrue(view.mine()); assertEquals(180L,view.remainingSeconds());
  lease.setExpiresAt(LocalDateTime.of(2026,10,13,11,59));
  var expired=zoned.lockView(itemId,actorId); assertFalse(expired.active()); assertEquals(0L,expired.remainingSeconds());
 }

 // ---- baja lógica ----
 private com.vuelossanitarios.backend.api.ApiException failure(org.junit.jupiter.api.function.Executable call) { return assertThrows(com.vuelossanitarios.backend.api.ApiException.class,call); }
 private FlightDocumentItem retirable() {
  FlightDocumentItem item=item(); when(items.lockById(item.getId())).thenReturn(Optional.of(item)); when(access.operationsStaff(actorId)).thenReturn(true); actor.setUsername("ops1"); return item;
 }
 private void authorAs(FlightDocumentItem item,User author) {
  FlightDocument first=version(item,1,"v1.pdf","v1.pdf"); first.setCreadoPor(author); when(versions.findFirstByDocumentItemIdOrderByNumeroVersionAsc(item.getId())).thenReturn(Optional.of(first));
 }

 @Test void operationsRetireADocumentKeepingRowVersionsFilesAndRecordingWhoWhenAndWhy() {
  FlightDocumentItem item=retirable(); when(versions.countByDocumentItemId(item.getId())).thenReturn(3L);
  service.deactivate(flight.getId(),item.getId(),"  Cargado en el vuelo equivocado  ",actorId);
  assertFalse(item.getActivo()); assertEquals("Cargado en el vuelo equivocado",item.getMotivoBaja()); assertSame(actor,item.getBajaPor()); assertNotNull(item.getFechaBaja());
  verify(items).saveAndFlush(item); verify(versions,never()).delete(any()); verify(versions,never()).deleteAll(any()); verify(items,never()).delete(any()); verify(storage,never()).deleteQuietly(any());
  ArgumentCaptor<String> before=ArgumentCaptor.forClass(String.class), after=ArgumentCaptor.forClass(String.class);
  verify(audit).record(eq(flight),eq(actor),eq("DOCUMENT"),eq(item.getId()),eq("DEACTIVATE"),before.capture(),after.capture());
  assertEquals("{\"activo\":true}",before.getValue()); assertEquals("{\"activo\":false,\"motivoBaja\":\"Cargado en el vuelo equivocado\",\"versiones\":3,\"bloqueoLiberado\":false}",after.getValue());
 }

 @Test void theReasonIsEscapedInTheAuditEventAndItsContentIsValidated() {
  FlightDocumentItem item=retirable();
  service.deactivate(flight.getId(),item.getId(),"Dijo \"no\" \\ y\nlinea",actorId);
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class); verify(audit).record(any(),any(),eq("DOCUMENT"),any(),eq("DEACTIVATE"),any(),after.capture());
  assertTrue(after.getValue().contains("\"motivoBaja\":\"Dijo \\\"no\\\" \\\\ y\\nlinea\""),after.getValue());
  FlightDocumentItem other=retirable(); when(items.lockById(other.getId())).thenReturn(Optional.of(other));
  for (String bad : new String[]{null,"","   ","x".repeat(501),"a\u0001b"}) { assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,failure(()->service.deactivate(flight.getId(),other.getId(),bad,actorId)).status(),String.valueOf(bad)); assertTrue(other.getActivo()); }
 }

 @Test void unknownDocumentAndADocumentOfAnotherFlightAreIndistinguishableAndChangeNothing() {
  when(items.lockById(404L)).thenReturn(Optional.empty());
  assertEquals(org.springframework.http.HttpStatus.NOT_FOUND,failure(()->service.deactivate(flight.getId(),404L,"Motivo",actorId)).status());
  FlightDocumentItem item=retirable();
  assertEquals(org.springframework.http.HttpStatus.NOT_FOUND,failure(()->service.deactivate(flight.getId()+1,item.getId(),"Motivo",actorId)).status());
  assertTrue(item.getActivo()); verify(items,never()).saveAndFlush(any()); verify(audit,never()).record(any(),any(),any(),any(),eq("DEACTIVATE"),any(),any());
 }

 @Test void onlyOperationsOrTheCommanderWhoUploadedTheDocumentMayRetireIt() {
  FlightDocumentItem item=item(); when(items.lockById(item.getId())).thenReturn(Optional.of(item)); authorAs(item,actor);
  // ni Operaciones ni comandante del vuelo (p. ej. DTS): 403
  assertEquals(org.springframework.http.HttpStatus.FORBIDDEN,failure(()->service.deactivate(flight.getId(),item.getId(),"Motivo",actorId)).status()); assertTrue(item.getActivo());
  // comandante del vuelo, pero el documento lo cargó otra persona: 403
  User commander=new User(); commander.setId(actorId+7); flight.setComandante(commander); when(users.findById(actorId+7)).thenReturn(Optional.of(commander));
  authorAs(item,actor);
  assertEquals(org.springframework.http.HttpStatus.FORBIDDEN,failure(()->service.deactivate(flight.getId(),item.getId(),"Motivo",actorId+7)).status()); assertTrue(item.getActivo());
  // el comandante que lo cargó sí puede
  authorAs(item,commander); service.deactivate(flight.getId(),item.getId(),"Error propio",actorId+7); assertFalse(item.getActivo());
 }

 @Test void aCommanderBlockedByAnOverdueReportCannotRetireEvenHisOwnDocument() {
  CommanderReportAccessService blocked=mock(CommanderReportAccessService.class);
  doThrow(new com.vuelossanitarios.backend.api.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"COMANDANTE_BLOQUEADO","Bloqueado",null)).when(blocked).requireOperationalAccess(actorId);
  DocumentService guarded=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,Clock.systemUTC(),blocked,300);
  flight.setComandante(actor); FlightDocumentItem item=item(); when(items.lockById(item.getId())).thenReturn(Optional.of(item)); authorAs(item,actor);
  assertEquals("COMANDANTE_BLOQUEADO",assertThrows(com.vuelossanitarios.backend.api.ApiException.class,()->guarded.deactivate(flight.getId(),item.getId(),"Motivo",actorId)).code()); assertTrue(item.getActivo());
 }

 @Test void aSecondRetirementIsAConflictAndKeepsTheFirstResponsibleAndReason() {
  FlightDocumentItem item=retirable(); service.deactivate(flight.getId(),item.getId(),"Primero",actorId);
  LocalDateTime when=item.getFechaBaja();
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,failure(()->service.deactivate(flight.getId(),item.getId(),"Segundo",actorId)).status());
  assertEquals("Primero",item.getMotivoBaja()); assertEquals(when,item.getFechaBaja()); verify(audit,times(1)).record(any(),any(),eq("DOCUMENT"),any(),eq("DEACTIVATE"),any(),any());
 }

 @Test void anActiveLeaseOfAnotherUserBlocksTheRetirementButOwnOrExpiredLeasesAreReleasedWithIt() {
  FlightDocumentItem item=retirable(); User other=new User(); other.setId(actorId+1); other.setUsername("otro");
  DocumentLock theirs=new DocumentLock(); theirs.setDocumentItem(item); theirs.setOwner(other); theirs.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).plusMinutes(5));
  when(locks.findByDocumentItemId(item.getId())).thenReturn(Optional.of(theirs));
  var error=failure(()->service.deactivate(flight.getId(),item.getId(),"Motivo",actorId));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,error.status()); assertTrue(error.getMessage().contains("otro")); assertTrue(item.getActivo()); verify(locks,never()).delete(any());
  theirs.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).minusSeconds(1)); service.deactivate(flight.getId(),item.getId(),"Motivo",actorId);
  verify(locks).delete(theirs); assertFalse(item.getActivo());
  ArgumentCaptor<String> after=ArgumentCaptor.forClass(String.class); verify(audit).record(any(),any(),eq("DOCUMENT"),any(),eq("DEACTIVATE"),any(),after.capture()); assertTrue(after.getValue().endsWith("\"bloqueoLiberado\":true}"));
 }

 @Test void terminalFlightsAndRejectedRequestsCannotRetireDocuments() {
  for (String code : java.util.List.of("FINALIZADO","COMPLETADO","CANCELADO")) {
   FlightStatus closed=new FlightStatus(); closed.setCodigo(code); flight.setEstadoVuelo(closed);
   FlightDocumentItem item=retirable(); assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,failure(()->service.deactivate(flight.getId(),item.getId(),"Motivo",actorId)).status(),code); assertTrue(item.getActivo());
  }
  flight.setEstadoVuelo(null); com.vuelossanitarios.backend.domain.flight.SanitaryFlight request=new com.vuelossanitarios.backend.domain.flight.SanitaryFlight(); com.vuelossanitarios.backend.domain.catalog.SanitaryRequestStatus rejected=new com.vuelossanitarios.backend.domain.catalog.SanitaryRequestStatus(); rejected.setCodigo("RECHAZADO"); request.setEstadoSolicitud(rejected); flight.setSanitario(request);
  FlightDocumentItem item=retirable();
  assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,failure(()->service.deactivate(flight.getId(),item.getId(),"Motivo",actorId)).status());
  assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,failure(()->service.acquireLock(item.getId(),actorId)).status());
  when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight));
  assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,failure(()->service.createPdf(flight.getId(),"AUTORIZACION","Nuevo",pdf("a.pdf"),actorId)).status());
  rejected.setCodigo("APROBADO"); when(types.findByCodigo("AUTORIZACION")).thenReturn(Optional.of(type)); when(storage.storePdf(any())).thenReturn("ok.pdf"); when(versions.maxNumeroVersion(any())).thenReturn(null);
  assertEquals(1,service.createPdf(flight.getId(),"AUTORIZACION","Nuevo",pdf("a.pdf"),actorId).versionActual().numeroVersion(),"una solicitud aprobada sin estado de vuelo sigue siendo editable");
 }

 @Test void aRetiredDocumentAcceptsNeitherLeasesNorVersionsEvenWithAnOldLease() {
  FlightDocumentItem item=retirable(); item.setActivo(false);
  DocumentLock old=new DocumentLock(); old.setOwner(actor); old.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).plusMinutes(5)); when(locks.findByDocumentItemId(item.getId())).thenReturn(Optional.of(old));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,failure(()->service.acquireLock(item.getId(),actorId)).status());
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,failure(()->service.replacePdf(item.getId(),pdf("late.pdf"),actorId)).status());
  verify(storage,never()).storePdf(any()); verify(versions,never()).save(any()); verify(locks,never()).saveAndFlush(any());
  when(items.findById(item.getId())).thenReturn(Optional.of(item));
  assertEquals(org.springframework.http.HttpStatus.CONFLICT,failure(()->service.lockView(item.getId(),actorId)).status());
 }

 @Test void retiredDocumentsAreOnlyVisibleToAuthorizedUsersThroughEveryEntryPoint() {
  FlightDocumentItem item=item(); item.setActivo(false); FlightDocument v=version(item,1,"v1.pdf","v1.pdf");
  when(items.findById(item.getId())).thenReturn(Optional.of(item)); when(versions.findById(v.getId())).thenReturn(Optional.of(v)); when(flights.findById(flight.getId())).thenReturn(Optional.of(flight));
  var denied=new com.vuelossanitarios.backend.api.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"No tiene acceso");
  doThrow(denied).when(access).mayReadRetired(flight,actorId);
  assertEquals(org.springframework.http.HttpStatus.FORBIDDEN,failure(()->service.history(item.getId(),actorId)).status());
  assertEquals(org.springframework.http.HttpStatus.FORBIDDEN,failure(()->service.download(v.getId(),actorId)).status());
  assertEquals(org.springframework.http.HttpStatus.FORBIDDEN,failure(()->service.lockView(item.getId(),actorId)).status());
  assertEquals(org.springframework.http.HttpStatus.FORBIDDEN,failure(()->service.listRetired(flight.getId(),actorId)).status());
  verify(storage,never()).read(any()); verify(audit,never()).record(any(),any(),any(),any(),eq("DOWNLOAD"),any(),any());
  doNothing().when(access).mayReadRetired(flight,actorId); when(versions.findByDocumentItemIdOrderByNumeroVersionDesc(item.getId())).thenReturn(java.util.List.of(v)); when(storage.read("v1.pdf")).thenReturn(new DocumentStorage.ResourceData("PDF".getBytes()));
  assertEquals(1,service.history(item.getId(),actorId).versiones().size()); assertArrayEquals("PDF".getBytes(),service.download(v.getId(),actorId).data());
 }

 @Test void theRetiredListShowsReasonResponsibleAndKeepsEveryVersionCounted() {
  FlightDocumentItem item=item(); item.setActivo(false); item.setMotivoBaja("Error de carga"); item.setBajaPor(actor); item.setFechaBaja(LocalDateTime.of(2026,10,13,12,0)); actor.setUsername("ops1");
  FlightDocument last=version(item,2,"v2.pdf","v2.pdf"); last.setEsVersionActual(true);
  when(flights.findById(flight.getId())).thenReturn(Optional.of(flight)); when(items.findByFlightIdAndActivoFalseOrderByFechaBajaDesc(flight.getId())).thenReturn(java.util.List.of(item));
  when(versions.findByDocumentItemIdAndEsVersionActualTrue(item.getId())).thenReturn(Optional.of(last)); when(versions.countByDocumentItemId(item.getId())).thenReturn(2L);
  var row=service.listRetired(flight.getId(),actorId).get(0);
  assertEquals("Error de carga",row.motivoBaja()); assertEquals("ops1",row.retiradoPor()); assertEquals(2L,row.totalVersiones()); assertEquals(2,row.ultimaVersion().numeroVersion()); assertEquals(LocalDateTime.of(2026,10,13,12,0),row.fechaBaja());
  verify(access).mayReadRetired(flight,actorId);
 }

 @Test void theNameOfARetiredDocumentCanBeReusedBecauseOnlyActiveOnesCount() {
  when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight)); when(types.findByCodigo("AUTORIZACION")).thenReturn(Optional.of(type)); when(storage.storePdf(any())).thenReturn("n.pdf"); when(versions.maxNumeroVersion(any())).thenReturn(null);
  when(items.existsByFlightIdAndActivoTrueAndNombreDocumentoIgnoreCase(flight.getId(),"Autorización médica")).thenReturn(false);
  assertEquals("Autorización médica",service.createPdf(flight.getId(),"AUTORIZACION","Autorización médica",pdf("a.pdf"),actorId).nombreDocumento());
  verify(items).existsByFlightIdAndActivoTrueAndNombreDocumentoIgnoreCase(flight.getId(),"Autorización médica");
 }

 @Test void documentViewsTellEachUserWhetherTheyMayRetire() {
  FlightDocumentItem item=item(); FlightDocument current=version(item,2,"v2.pdf","v2.pdf"); current.setEsVersionActual(true);
  when(flights.findById(flight.getId())).thenReturn(Optional.of(flight)); when(items.findByFlightIdAndActivoTrueOrderByCreatedAtDesc(flight.getId())).thenReturn(java.util.List.of(item)); when(versions.findByDocumentItemIdAndEsVersionActualTrue(item.getId())).thenReturn(Optional.of(current));
  assertFalse(service.list(flight.getId(),actorId).get(0).puedeRetirar(),"DTS o personal sin relación");
  when(access.operationsStaff(actorId)).thenReturn(true); assertTrue(service.list(flight.getId(),actorId).get(0).puedeRetirar());
  FlightStatus closed=new FlightStatus(); closed.setCodigo("FINALIZADO"); flight.setEstadoVuelo(closed); assertFalse(service.list(flight.getId(),actorId).get(0).puedeRetirar(),"vuelo cerrado");
 }

 // ---- compatibilidad de tipos documentales ----
 private DocumentType medical() { DocumentType t=new DocumentType(); t.setCodigo("PARTE_MEDICO"); t.setNombre("Parte médico"); t.setSoloVueloSanitario(true); return t; }
 private void makeSanitary() { flight.setSanitario(new com.vuelossanitarios.backend.domain.flight.SanitaryFlight()); }

 @Test void aMedicalReportIsRejectedInANonSanitaryFlightBeforeAnythingIsPersisted() {
  when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight)); when(types.findByCodigo("PARTE_MEDICO")).thenReturn(Optional.of(medical())); when(storage.storePdf(any())).thenReturn("p.pdf");
  var error=failure(()->service.createPdf(flight.getId(),"PARTE_MEDICO","Parte",pdf("a.pdf"),actorId));
  assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,error.status()); assertTrue(error.getMessage().contains("sólo puede registrarse en vuelos sanitarios"));
  verify(items,never()).save(any()); verify(versions,never()).save(any()); verify(storage).deleteQuietly("p.pdf");
 }

 @Test void typesCompatibleWithTheFlightAreAccepted() {
  when(flights.lockById(flight.getId())).thenReturn(Optional.of(flight)); when(storage.storePdf(any())).thenReturn("p.pdf"); when(versions.maxNumeroVersion(any())).thenReturn(null);
  when(types.findByCodigo("AUTORIZACION")).thenReturn(Optional.of(type)); when(types.findByCodigo("PARTE_MEDICO")).thenReturn(Optional.of(medical()));
  assertEquals("AUTORIZACION",service.createPdf(flight.getId(),"AUTORIZACION","General operativo",pdf("a.pdf"),actorId).tipoDocumento().codigo());
  makeSanitary();
  assertEquals("AUTORIZACION",service.createPdf(flight.getId(),"AUTORIZACION","General sanitario",pdf("b.pdf"),actorId).tipoDocumento().codigo());
  assertEquals("PARTE_MEDICO",service.createPdf(flight.getId(),"PARTE_MEDICO","Parte",pdf("c.pdf"),actorId).tipoDocumento().codigo());
 }

 @Test void aLegacyIncompatibleDocumentKeepsItsHistoryButAcceptsNoNewLeasesOrVersionsAndCanBeRetired() {
  FlightDocumentItem legacy=retirable(); legacy.setDocumentType(medical());
  var lease=failure(()->service.acquireLock(legacy.getId(),actorId)); var version=failure(()->service.replacePdf(legacy.getId(),pdf("v.pdf"),actorId));
  for (var e : java.util.List.of(lease,version)) { assertEquals(org.springframework.http.HttpStatus.CONFLICT,e.status()); assertTrue(e.getMessage().contains("retire este documento")); }
  verify(storage,never()).storePdf(any());
  service.deactivate(flight.getId(),legacy.getId(),"Tipo incompatible con el vuelo",actorId); assertFalse(legacy.getActivo());
 }

 @Test void theSelectorOffersOnlyTheTypesTheFlightAdmitsAndTheRuleIsDrivenByTheCatalogFlag() {
  DocumentType plan=new DocumentType(); plan.setCodigo("PLAN_DE_VUELO"); plan.setNombre("Plan de vuelo");
  when(flights.findById(flight.getId())).thenReturn(Optional.of(flight)); when(types.findAll()).thenReturn(java.util.List.of(medical(),plan,type));
  assertEquals(java.util.List.of("AUTORIZACION","PLAN_DE_VUELO"),service.allowedTypes(flight.getId(),actorId).stream().map(t->t.codigo()).toList());
  makeSanitary();
  assertEquals(java.util.List.of("AUTORIZACION","PARTE_MEDICO","PLAN_DE_VUELO"),service.allowedTypes(flight.getId(),actorId).stream().map(t->t.codigo()).toList());
  verify(access,times(2)).mayRead(flight,actorId);
 }

 private FlightDocumentItem item() {
  FlightDocumentItem item=new FlightDocumentItem(); item.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); item.setFlight(flight); item.setDocumentType(type); item.setNombreDocumento("Autorización médica"); return item;
 }
 private FlightDocument version(FlightDocumentItem item,int number,String filename,String location) {
  FlightDocument version=new FlightDocument(); version.setId(java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)); version.setDocumentItem(item); version.setNumeroVersion(number); version.setEsVersionActual(number==2); version.setNombreArchivoOriginal(filename); version.setUbicacionAlmacenamiento(location); version.setTamanioBytes(2L); return version;
 }
 private MockMultipartFile pdf(String name) { return new MockMultipartFile("file",name,"application/pdf","%PDF-1.7".getBytes()); }
}
