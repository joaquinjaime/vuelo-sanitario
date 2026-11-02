package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.catalog.SanitaryRequestStatus;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

/**
 * Bloqueo documental hasta acordar el horario: el servidor rechaza con 409 toda operación (lectura y escritura) sobre los
 * documentos de un vuelo sanitario cuya solicitud no está APROBADA, distingue la falta de permisos (403) y no altera nada.
 */
class DocumentScheduleGateTest {
 private final FlightRepository flights=mock(FlightRepository.class); private final DocumentTypeRepository types=mock(DocumentTypeRepository.class);
 private final DocumentItemRepository items=mock(DocumentItemRepository.class); private final FlightDocumentRepository versions=mock(FlightDocumentRepository.class);
 private final UserRepository users=mock(UserRepository.class); private final DocumentStorage storage=mock(DocumentStorage.class);
 private final AuditService audit=mock(AuditService.class); private final FlightAuthorizationService access=mock(FlightAuthorizationService.class);
 private final DocumentLockRepository locks=mock(DocumentLockRepository.class);
 private DocumentService service; private final Long actorId=7L; private final User actor=new User(); private final Flight flight=new Flight();
 private final SanitaryFlight request=new SanitaryFlight(); private final DocumentType type=new DocumentType(); private FlightDocumentItem item; private FlightDocument version;

 @BeforeEach void setup() {
  service=new DocumentService(flights,types,items,versions,users,storage,audit,access,locks,Clock.systemUTC(),mock(CommanderReportAccessService.class),300);
  flight.setId(100L); actor.setId(actorId); type.setCodigo("AUTORIZACION"); type.setNombre("Autorización de vuelo");
  flight.setSanitario(request); state("SOLICITADO");
  item=new FlightDocumentItem(); item.setId(55L); item.setFlight(flight); item.setDocumentType(type); item.setNombreDocumento("Autorización médica");
  version=new FlightDocument(); version.setId(66L); version.setDocumentItem(item); version.setNumeroVersion(1); version.setEsVersionActual(true); version.setNombreArchivoOriginal("a.pdf"); version.setUbicacionAlmacenamiento("a.pdf"); version.setTamanioBytes(8L);
  when(users.findById(actorId)).thenReturn(Optional.of(actor));
  when(flights.findById(100L)).thenReturn(Optional.of(flight)); when(flights.lockById(100L)).thenReturn(Optional.of(flight));
  when(items.findById(55L)).thenReturn(Optional.of(item)); when(items.lockById(55L)).thenReturn(Optional.of(item));
  when(versions.findById(66L)).thenReturn(Optional.of(version));
  when(types.findByCodigo("AUTORIZACION")).thenReturn(Optional.of(type)); when(types.findAll()).thenReturn(List.of(type));
  when(storage.storePdf(any())).thenReturn("new.pdf");
  when(items.save(any())).thenAnswer(x->{FlightDocumentItem saved=x.getArgument(0); if(saved.getId()==null)saved.setId(56L); return saved;});
  when(versions.save(any())).thenAnswer(x->{FlightDocument saved=x.getArgument(0); if(saved.getId()==null)saved.setId(67L); return saved;});
  when(versions.findByDocumentItemIdAndEsVersionActualTrue(55L)).thenReturn(Optional.of(version));
  when(items.findByFlightIdAndActivoTrueOrderByCreatedAtDesc(100L)).thenReturn(List.of(item));
 }

 private void state(String code) { SanitaryRequestStatus status=new SanitaryRequestStatus(); status.setCodigo(code); request.setEstadoSolicitud(status); }
 private void flightState(String code) { FlightStatus status=new FlightStatus(); status.setCodigo(code); flight.setEstadoVuelo(status); }
 private MockMultipartFile pdf() { return new MockMultipartFile("file","a.pdf","application/pdf","%PDF-1.7".getBytes()); }
 private ApiException failure(Executable call) { return assertThrows(ApiException.class,call); }
 private void assertLocked(Executable call,String label) {
  ApiException error=failure(call);
  assertEquals(HttpStatus.CONFLICT,error.status(),label); assertEquals(DocumentScheduleGate.LOCKED_CODE,error.code(),label);
  assertTrue(error.getMessage().contains("primero debe acordarse el horario de salida"),label);
 }
 private void assertEveryOperationLocked() {
  assertLocked(()->service.list(100L,actorId),"listar"); assertLocked(()->service.listRetired(100L,actorId),"retirados"); assertLocked(()->service.allowedTypes(100L,actorId),"tipos");
  assertLocked(()->service.history(55L,actorId),"historial"); assertLocked(()->service.download(66L,actorId),"descarga"); assertLocked(()->service.lockView(55L,actorId),"consultar bloqueo");
  assertLocked(()->service.createPdf(100L,"AUTORIZACION","Nuevo",pdf(),actorId),"alta"); assertLocked(()->service.replacePdf(55L,pdf(),actorId),"nueva versión");
  assertLocked(()->service.acquireLock(55L,actorId),"adquirir bloqueo"); assertLocked(()->service.deactivate(100L,55L,"Motivo",actorId),"baja");
  // Nada se escribió, almacenó, descargó ni auditó como operación documental.
  verify(storage,never()).storePdf(any()); verify(storage,never()).read(any()); verify(items,never()).save(any()); verify(items,never()).saveAndFlush(any());
  verify(versions,never()).save(any()); verify(locks,never()).saveAndFlush(any()); verify(audit,never()).record(any(),any(),any(),any(),any(),any(),any());
 }

 // Escenario B: solicitud recién creada, sin horario acordado.
 @Test void aNewRequestKeepsEveryDocumentOperationLockedAndTouchesNothing() { state("SOLICITADO"); assertEveryOperationLocked(); }

 // Escenario C: Operaciones propuso otro horario y el DTS todavía no respondió; una fecha propuesta o planificada no es un acuerdo.
 @Test void aPendingCounterproposalDoesNotUnlockDocumentsEvenWithAPlannedDeparture() {
  state("PENDIENTE_RESPUESTA_DTS"); flight.setFechaPlanificadaSalida(LocalDateTime.of(2026,11,5,10,0)); assertEveryOperationLocked();
  DocumentScheduleGate.Access gate=DocumentScheduleGate.of(flight);
  assertFalse(gate.available()); assertEquals("DTS",gate.pendingParty()); assertEquals("PENDIENTE_RESPUESTA_DTS",gate.requestState());
 }

 @Test void theRouteOrFlightStateOfAnUnagreedRequestIsNotAnAgreement() {
  // La planificación del comandante y su ruta no sustituyen la aceptación del horario.
  state("SOLICITADO"); flightState("PLANIFICADO"); assertLocked(()->service.createPdf(100L,"AUTORIZACION","Nuevo",pdf(),actorId),"vuelo planificado sin acuerdo");
 }

 @Test void theGateReportsWhoMustAnswerTheNegotiation() {
  state("SOLICITADO"); assertEquals("OPERACIONES",DocumentScheduleGate.of(flight).pendingParty());
  state("PENDIENTE_RESPUESTA_DTS"); assertEquals("DTS",DocumentScheduleGate.of(flight).pendingParty());
  var denied=service.accessStatus(100L,actorId); assertFalse(denied.disponible()); assertEquals(DocumentScheduleGate.LOCKED_CODE,denied.codigo()); assertEquals("DTS",denied.pendientePor());
  verify(access,atLeastOnce()).mayRead(flight,actorId);
 }

 // Escenario D: el acuerdo habilita las operaciones y se conservan las validaciones documentales existentes.
 @Test void anAgreedScheduleEnablesDocumentOperationsAndKeepsTheExistingValidations() {
  state("APROBADO");
  assertTrue(service.accessStatus(100L,actorId).disponible());
  assertEquals(1,service.list(100L,actorId).size());
  var created=service.createPdf(100L,"AUTORIZACION","Nuevo",pdf(),actorId);
  assertEquals(1,created.versionActual().numeroVersion());
  when(types.findByCodigo("INVENTADO")).thenReturn(Optional.empty());
  assertEquals(HttpStatus.BAD_REQUEST,failure(()->service.createPdf(100L,"INVENTADO","Otro",pdf(),actorId)).status()); // tipo inexistente
  when(items.existsByFlightIdAndActivoTrueAndNombreDocumentoIgnoreCase(100L,"Nuevo")).thenReturn(true);
  assertEquals(HttpStatus.CONFLICT,failure(()->service.createPdf(100L,"AUTORIZACION","Nuevo",pdf(),actorId)).status()); // nombre duplicado
  // Aun con acuerdo, una nueva versión exige el bloqueo de edición del documento.
  assertNotEquals(DocumentScheduleGate.LOCKED_CODE,failure(()->service.replacePdf(55L,pdf(),actorId)).code());
 }

 // Escenario E: el acuerdo deja de ser vigente (negociación reabierta): se bloquea otra vez sin perder documentos.
 @Test void reopeningTheNegotiationLocksAgainWithoutLosingTheDocuments() {
  state("APROBADO"); assertEquals(1,service.list(100L,actorId).size());
  state("PENDIENTE_RESPUESTA_DTS");
  assertLocked(()->service.replacePdf(55L,pdf(),actorId),"nueva versión tras reabrir"); assertLocked(()->service.deactivate(100L,55L,"Motivo",actorId),"baja tras reabrir");
  assertLocked(()->service.list(100L,actorId),"consulta tras reabrir");
  assertTrue(item.getActivo(),"el documento sigue activo"); verify(items,never()).delete(any()); verify(versions,never()).delete(any()); verify(storage,never()).deleteQuietly(any());
  state("APROBADO"); assertEquals(1,service.list(100L,actorId).size(),"al recuperar el acuerdo reaparecen intactos");
 }

 // Escenario F: el acuerdo no concede permisos; sin acceso al vuelo la respuesta es 403 y no revela el estado.
 @Test void agreementDoesNotBypassFlightPermissionsAndForbiddenIsDistinctFromLocked() {
  ApiException forbidden=new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este vuelo");
  doThrow(forbidden).when(access).mayRead(flight,actorId); doThrow(forbidden).when(access).mayReadRetired(flight,actorId);
  for(String code:List.of("APROBADO","SOLICITADO")){
   state(code);
   assertEquals(HttpStatus.FORBIDDEN,failure(()->service.createPdf(100L,"AUTORIZACION","Nuevo",pdf(),actorId)).status(),code);
   assertEquals(HttpStatus.FORBIDDEN,failure(()->service.replacePdf(55L,pdf(),actorId)).status(),code);
   assertEquals(HttpStatus.FORBIDDEN,failure(()->service.acquireLock(55L,actorId)).status(),code);
   assertEquals(HttpStatus.FORBIDDEN,failure(()->service.deactivate(100L,55L,"Motivo",actorId)).status(),code);
   assertEquals(HttpStatus.FORBIDDEN,failure(()->service.list(100L,actorId)).status(),code);
   assertEquals(HttpStatus.FORBIDDEN,failure(()->service.accessStatus(100L,actorId)).status(),code);
  }
  verify(storage,never()).storePdf(any());
 }

 @Test void closedRequestsKeepTheirDocumentsReadableAndStayReadOnly() {
  for(String code:List.of("RECHAZADO","CANCELADO")){
   state(code); if("CANCELADO".equals(code))flightState("CANCELADO");
   assertEquals(1,service.list(100L,actorId).size(),code); assertTrue(service.accessStatus(100L,actorId).disponible(),code);
   assertEquals(HttpStatus.BAD_REQUEST,failure(()->service.createPdf(100L,"AUTORIZACION","Nuevo",pdf(),actorId)).status(),code); // sólo consulta: regla existente
  }
 }

 @Test void releasingAnOwnLeaseIsStillAllowedBecauseItOnlyReducesAccess() {
  state("PENDIENTE_RESPUESTA_DTS"); DocumentLock lease=new DocumentLock(); lease.setOwner(actor); lease.setExpiresAt(LocalDateTime.now(Clock.systemUTC()).plusMinutes(5));
  when(locks.findByDocumentItemId(55L)).thenReturn(Optional.of(lease));
  service.releaseLock(55L,actorId); verify(locks).delete(lease);
 }

 @Test void nonSanitaryFlightsAreNotSubjectToTheRule() {
  Flight operational=new Flight(); operational.setId(200L);
  assertTrue(DocumentScheduleGate.of(operational).available()); assertDoesNotThrow(()->DocumentScheduleGate.require(operational));
  assertTrue(DocumentScheduleGate.of(null).available());
 }

 @Test void aSanitaryRequestWithoutAStateFailsClosed() {
  request.setEstadoSolicitud(null); assertFalse(DocumentScheduleGate.of(flight).available());
 }
}
