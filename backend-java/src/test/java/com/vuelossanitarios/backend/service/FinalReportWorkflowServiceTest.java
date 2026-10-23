package com.vuelossanitarios.backend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FinalReportDtos;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class FinalReportWorkflowServiceTest {
 private final FinalReportObligationRepository obligations=mock(FinalReportObligationRepository.class);
 private final FlightFinalReportRepository reports=mock(FlightFinalReportRepository.class);
 private final SanitaryFlightRepository sanitaryFlights=mock(SanitaryFlightRepository.class); private final FlightStatusRepository statuses=mock(FlightStatusRepository.class);
 private final UserRepository users=mock(UserRepository.class); private final NotificationService notifications=mock(NotificationService.class);
 private final AuditService audit=mock(AuditService.class); private final CommanderReportAccessService access=mock(CommanderReportAccessService.class); private final ReportAttachmentService attachments=mock(ReportAttachmentService.class);
 private final Clock clock=Clock.fixed(Instant.parse("2026-10-13T12:00:00Z"),ZoneOffset.UTC);
 private final OffsetDateTime now=OffsetDateTime.ofInstant(clock.instant(),ZoneOffset.UTC);
 private final FinalReportWorkflowService service=new FinalReportWorkflowService(obligations,reports,sanitaryFlights,statuses,users,notifications,audit,access,attachments,new ObjectMapper().findAndRegisterModules(),clock);
 private User commander,operator; private Flight flight; private FinalReportObligation obligation; private final List<FlightFinalReport> saved=new ArrayList<>();

 @BeforeEach void setUp(){
  commander=user(11L,"cmd"); operator=user(12L,"ops"); flight=flight("FINALIZADO"); flight.setComandante(commander);
  obligation=obligation(21L,FinalReportStatus.PENDIENTE,now.plusHours(10));
  when(obligations.lockById(21L)).thenReturn(Optional.of(obligation)); when(obligations.findById(21L)).thenReturn(Optional.of(obligation));
  when(users.findById(11L)).thenReturn(Optional.of(commander)); when(users.findById(12L)).thenReturn(Optional.of(operator));
  when(reports.countByFlightId(7L)).thenAnswer(x->saved.size());
  when(reports.saveAndFlush(any())).thenAnswer(x->{FlightFinalReport r=x.getArgument(0);if(r.getId()==null)r.setId(100L+saved.size());if(!saved.contains(r))saved.add(r);return r;});
  when(reports.findByFlightIdAndEsVersionActualTrue(7L)).thenAnswer(x->saved.stream().filter(FlightFinalReport::getEsVersionActual).findFirst());
  when(reports.findByFlightIdOrderByVersionDesc(7L)).thenAnswer(x->saved.stream().sorted(Comparator.comparing(FlightFinalReport::getVersion).reversed()).toList());
  when(statuses.findByCodigo("COMPLETADO")).thenReturn(Optional.of(status("COMPLETADO")));
  when(sanitaryFlights.findByFlightId(7L)).thenReturn(Optional.empty());
 }

 @Test void finishCreatesOneObligationWithFortyEightHoursAndIsIdempotent(){
  when(obligations.findByFlightIdAndCurrentTrue(7L)).thenReturn(Optional.empty());
  service.createObligationAfterFinish(flight,operator);
  var captor=org.mockito.ArgumentCaptor.forClass(FinalReportObligation.class); verify(obligations).save(captor.capture());
  assertEquals(FinalReportStatus.PENDIENTE,captor.getValue().getStatus()); assertEquals(now.plusHours(48),captor.getValue().getDueAt()); assertEquals(now.plusHours(48),captor.getValue().getOriginalDueAt()); assertSame(commander,captor.getValue().getCommander());
  verify(notifications).createOnce(eq(commander),eq(flight),eq("FINAL_REPORT_PENDING"),anyString(),startsWith("FINAL_REPORT_PENDING:"));
  verify(notifications).createOnce(eq(commander),eq(flight),eq("FLIGHT_FINISHED"),anyString(),eq("FLIGHT_FINISHED:7"));
  verify(audit).record(eq(flight),eq(operator),eq("FINAL_REPORT_OBLIGATION"),any(),eq("CREATE"),isNull(),contains("PENDIENTE"));
  clearInvocations(obligations,audit); when(obligations.findByFlightIdAndCurrentTrue(7L)).thenReturn(Optional.of(obligation));
  service.createObligationAfterFinish(flight,operator);
  verify(obligations,never()).save(any()); verifyNoInteractions(audit);
 }
 @Test void finishWithoutCommanderCannotCreateAnObligation(){
  flight.setComandante(null); assertThrows(ApiException.class,()->service.createObligationAfterFinish(flight,operator)); verify(obligations,never()).save(any());
 }
 @Test void sanitaryRequesterIsNotifiedOfTheFinishedFlight(){
  User dts=user(13L,"dts"); SanitaryFlight s=new SanitaryFlight(); s.setSolicitadoPor(dts); when(sanitaryFlights.findByFlightId(7L)).thenReturn(Optional.of(s)); when(obligations.findByFlightIdAndCurrentTrue(7L)).thenReturn(Optional.empty());
  service.createObligationAfterFinish(flight,operator);
  verify(notifications).createOnce(eq(dts),eq(flight),eq("FLIGHT_FINISHED"),anyString(),eq("FLIGHT_FINISHED:7"));
 }

 @Test void overdueCommanderCanStillSubmitAndTheBlockIsLifted(){
  obligation.setDueAt(now.minusHours(1)); when(access.isBlocked(11L)).thenReturn(true,false);
  var result=submit(21L,new FinalReportDtos.Submit(" Informe aún vencido ",BigDecimal.ONE,BigDecimal.TEN,null),11L);
  assertEquals("PRESENTADO",result.status()); assertEquals(1,saved.size()); assertEquals(1,saved.get(0).getVersion()); assertEquals("Informe aún vencido",saved.get(0).getResumen()); assertEquals(ReportReviewStatus.PRESENTADO,saved.get(0).getEstadoRevision()); assertEquals(now,obligation.getPresentedAt());
  verify(notifications).createOnce(eq(commander),eq(flight),eq("COMMANDER_UNBLOCKED"),anyString(),anyString());
  verify(notifications).createOncePreferred(eq(flight),eq("FINAL_REPORT_SUBMITTED"),anyString(),startsWith("FINAL_REPORT_SUBMITTED:"),anyCollection(),eq("OPERACIONES"),eq("CENTRO_OPERACIONES"));
  verify(audit).record(eq(flight),eq(commander),eq("FINAL_REPORT"),any(),eq("SUBMIT"),any(),contains("PRESENTADO"));
 }
 @Test void commanderStaysBlockedWhileAnotherObligationIsOverdue(){
  obligation.setDueAt(now.minusHours(1)); when(access.isBlocked(11L)).thenReturn(true);
  submit(21L,new FinalReportDtos.Submit("Informe",null,null,null),11L);
  verify(notifications,never()).createOnce(any(),any(),eq("COMMANDER_UNBLOCKED"),anyString(),anyString());
  verify(audit,never()).record(any(),any(),any(),any(),eq("UNBLOCK_COMMANDER"),any(),any());
 }
 @Test void foreignCommanderCannotSubmit(){
  User other=user(99L,"other"); when(users.findById(99L)).thenReturn(Optional.of(other));
  ApiException e=assertThrows(ApiException.class,()->submit(21L,new FinalReportDtos.Submit("x",null,null,null),99L)); assertEquals(HttpStatus.FORBIDDEN,e.status()); assertTrue(saved.isEmpty());
 }
 @Test void submitRequiresFinishedFlightTextAndAnOpenObligation(){
  flight.setEstadoVuelo(status("EN_CURSO")); assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->submit(21L,new FinalReportDtos.Submit("x",null,null,null),11L)).status());
  flight.setEstadoVuelo(status("FINALIZADO")); assertThrows(ApiException.class,()->submit(21L,new FinalReportDtos.Submit("  ",null,null,null),11L));
  obligation.setStatus(FinalReportStatus.PRESENTADO); assertThrows(ApiException.class,()->submit(21L,new FinalReportDtos.Submit("x",null,null,null),11L));
  obligation.setStatus(FinalReportStatus.APROBADO); assertThrows(ApiException.class,()->submit(21L,new FinalReportDtos.Submit("x",null,null,null),11L));
  assertTrue(saved.isEmpty());
 }
 @Test void aRepeatedSubmitDoesNotCreateASecondVersion(){
  when(access.isBlocked(anyLong())).thenReturn(false);
  submit(21L,new FinalReportDtos.Submit("Informe",null,null,null),11L);
  assertThrows(ApiException.class,()->submit(21L,new FinalReportDtos.Submit("Informe",null,null,null),11L));
  assertEquals(1,saved.size()); verify(notifications,times(1)).createOncePreferred(any(),anyString(),anyString(),anyString(),anyCollection(),any(String[].class));
 }

 @Test void returnedReportRestartsTheDeadlineAndKeepsTheDecisionOnTheVersion(){
  presentVersionOne();
  service.review(21L,new FinalReportDtos.Review(false,"  Falta detalle  "),12L);
  assertEquals(FinalReportStatus.DEVUELTO,obligation.getStatus()); assertEquals(now.plusHours(48),obligation.getDueAt()); assertEquals(now.plusHours(48),obligation.getOriginalDueAt()); assertFalse(obligation.getExtensionUsed()); assertEquals("Falta detalle",obligation.getReturnReason());
  FlightFinalReport v1=saved.get(0); assertEquals(ReportReviewStatus.DEVUELTO,v1.getEstadoRevision()); assertEquals("Falta detalle",v1.getMotivoDevolucion()); assertSame(operator,v1.getRevisor()); assertEquals(now,v1.getFechaRevision());
  verify(notifications).createOnce(eq(commander),eq(flight),eq("FINAL_REPORT_RETURNED"),contains("Falta detalle"),startsWith("FINAL_REPORT_RETURNED:"));
  verify(audit).record(eq(flight),eq(operator),eq("FINAL_REPORT"),any(),eq("RETURN"),contains("PRESENTADO"),contains("Falta detalle"));
 }
 @Test void returningRequiresAReason(){
  presentVersionOne();
  assertThrows(ApiException.class,()->service.review(21L,new FinalReportDtos.Review(false,"   "),12L)); assertThrows(ApiException.class,()->service.review(21L,new FinalReportDtos.Review(false,null),12L));
  assertEquals(FinalReportStatus.PRESENTADO,obligation.getStatus()); assertEquals(ReportReviewStatus.PRESENTADO,saved.get(0).getEstadoRevision());
 }
 @Test void resubmissionAfterReturnCreatesVersionTwoAndKeepsTheHistory(){
  presentVersionOne(); service.review(21L,new FinalReportDtos.Review(false,"Corregir horas"),12L);
  var result=submit(21L,new FinalReportDtos.Submit("Informe corregido",BigDecimal.valueOf(2),null,"Sin incidentes"),11L);
  assertEquals("PRESENTADO",result.status()); assertEquals(2,saved.size()); FlightFinalReport v1=saved.get(0),v2=saved.get(1);
  assertFalse(v1.getEsVersionActual()); assertEquals(ReportReviewStatus.DEVUELTO,v1.getEstadoRevision()); assertEquals("Corregir horas",v1.getMotivoDevolucion());
  assertTrue(v2.getEsVersionActual()); assertEquals(2,v2.getVersion()); assertEquals(ReportReviewStatus.PRESENTADO,v2.getEstadoRevision()); assertSame(v2,obligation.getReport());
  verify(notifications).createOncePreferred(eq(flight),eq("FINAL_REPORT_RESUBMITTED"),anyString(),eq("FINAL_REPORT_SUBMITTED:"+v2.getId()),anyCollection(),eq("OPERACIONES"),eq("CENTRO_OPERACIONES"));
  var detail=service.detail(21L,11L); assertEquals(2,detail.versiones().size()); assertEquals(2,detail.versiones().get(0).version()); assertEquals("Corregir horas",detail.versiones().get(1).motivoDevolucion());
 }
 @Test void approvalCompletesTheFlightAndNotifiesCommanderAndRequester(){
  User dts=user(13L,"dts"); SanitaryFlight s=new SanitaryFlight(); s.setSolicitadoPor(dts); when(sanitaryFlights.findByFlightId(7L)).thenReturn(Optional.of(s));
  presentVersionOne(); var result=service.review(21L,new FinalReportDtos.Review(true,null),12L);
  assertEquals("APROBADO",result.status()); assertEquals("COMPLETADO",flight.getEstadoVuelo().getCodigo()); assertEquals(ReportReviewStatus.APROBADO,saved.get(0).getEstadoRevision()); assertSame(operator,obligation.getApprovedBy()); assertEquals(now,obligation.getApprovedAt());
  verify(notifications).createOnce(eq(commander),eq(flight),eq("FINAL_REPORT_APPROVED"),anyString(),anyString());
  verify(notifications).createOnce(eq(commander),eq(flight),eq("FLIGHT_COMPLETED"),anyString(),eq("FLIGHT_COMPLETED:21"));
  verify(notifications).createOnce(eq(dts),eq(flight),eq("FLIGHT_COMPLETED"),anyString(),eq("FLIGHT_COMPLETED:21"));
  verify(audit).record(eq(flight),eq(operator),eq("FLIGHT"),eq(7L),eq("COMPLETE"),contains("FINALIZADO"),contains("COMPLETADO"));
 }
 @Test void aReviewedOrNotPresentedReportCannotBeReviewedAgain(){
  assertThrows(ApiException.class,()->service.review(21L,new FinalReportDtos.Review(true,null),12L));
  presentVersionOne(); service.review(21L,new FinalReportDtos.Review(true,null),12L);
  assertThrows(ApiException.class,()->service.review(21L,new FinalReportDtos.Review(true,null),12L)); assertThrows(ApiException.class,()->service.review(21L,new FinalReportDtos.Review(false,"Tarde"),12L));
  assertEquals(ReportReviewStatus.APROBADO,saved.get(0).getEstadoRevision());
 }
 @Test void reviewIsRefusedWhenTheFlightIsNotFinished(){
  presentVersionOne(); flight.setEstadoVuelo(status("CANCELADO"));
  assertThrows(ApiException.class,()->service.review(21L,new FinalReportDtos.Review(true,null),12L)); assertEquals("CANCELADO",flight.getEstadoVuelo().getCodigo());
 }

 @Test void extensionIsGrantedOnceAndNotAfterSubmission(){
  var first=service.extend(21L,11L); assertEquals(now.plusHours(34),first.vencimiento()); assertTrue(first.prorrogaUsada());
  assertThrows(ApiException.class,()->service.extend(21L,11L));
  obligation.setExtensionUsed(false); obligation.setStatus(FinalReportStatus.PRESENTADO); assertThrows(ApiException.class,()->service.extend(21L,11L));
 }
 @Test void overdueExtensionStartsFromNow(){
  obligation.setDueAt(now.minusHours(5)); assertEquals(now.plusHours(24),service.extend(21L,11L).vencimiento());
 }

 @Test void detailIsRestrictedToTheCommanderAndOperationsRoles(){
  User outsider=user(50L,"x"); when(users.findById(50L)).thenReturn(Optional.of(outsider)); when(users.findWithRolesByUsername("x")).thenReturn(Optional.of(outsider));
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.detail(21L,50L)).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.detail(404L,11L)).status());
  assertNotNull(service.detail(21L,11L));
 }
 @Test void closureViewDistinguishesOperationalFinishFromAdministrativeClose(){
  when(obligations.findByFlightIdAndCurrentTrue(7L)).thenReturn(Optional.of(obligation)); when(access.isBlocked(11L)).thenReturn(false);
  assertEquals("INFORME_PENDIENTE",service.closure(flight).estadoAdministrativo());
  obligation.setDueAt(now.minusMinutes(1)); assertEquals("INFORME_VENCIDO",service.closure(flight).estadoAdministrativo()); assertTrue(service.closure(flight).vencida());
  obligation.setStatus(FinalReportStatus.DEVUELTO); obligation.setDueAt(now.plusHours(1)); assertEquals("INFORME_DEVUELTO",service.closure(flight).estadoAdministrativo());
  obligation.setStatus(FinalReportStatus.PRESENTADO); assertEquals("EN_REVISION",service.closure(flight).estadoAdministrativo());
  obligation.setStatus(FinalReportStatus.APROBADO); assertEquals("CERRADO",service.closure(flight).estadoAdministrativo());
  when(obligations.findByFlightIdAndCurrentTrue(7L)).thenReturn(Optional.empty()); assertNull(service.closure(flight));
 }
 @Test void viewReportsRemainingSecondsOnlyForOpenObligationsAndOverdueByTheServerClock(){
  when(access.isBlocked(11L)).thenReturn(false); when(obligations.findByCommanderIdAndCurrentTrueOrderByDueAtAsc(11L)).thenReturn(List.of(obligation));
  var open=service.mine(11L).get(0); assertFalse(open.vencida()); assertEquals(36000L,open.segundosRestantes());
  obligation.setDueAt(now); var due=service.mine(11L).get(0); assertTrue(due.vencida()); assertEquals(0L,due.segundosRestantes());
  obligation.setStatus(FinalReportStatus.PRESENTADO); var closed=service.mine(11L).get(0); assertFalse(closed.vencida()); assertNull(closed.segundosRestantes());
 }

 // ---- Formatos: texto, PDF o ambos; la revisión es independiente del formato ----
 private org.springframework.mock.web.MockMultipartFile pdfFile(){return new org.springframework.mock.web.MockMultipartFile("file","Informe.pdf","application/pdf","%PDF-1.4 contenido".getBytes());}
 private void stub(){when(attachments.store(any())).thenReturn(new ReportAttachmentService.Stored("k-1.pdf","Informe.pdf",1234L,"a".repeat(64)));when(attachments.read("k-1.pdf")).thenReturn("%PDF".getBytes());when(access.isBlocked(anyLong())).thenReturn(false);}
 @Test void aPdfOnlyReportIsAcceptedAndStoresTheAttachmentMetadata(){
  stub(); var result=service.submit(21L,new FinalReportDtos.Submit(null,null,null,null),pdfFile(),11L);
  assertEquals("PRESENTADO",result.status()); FlightFinalReport r=saved.get(0); assertNull(r.getResumen()); assertEquals("k-1.pdf",r.getAdjuntoUbicacion()); assertEquals("Informe.pdf",r.getAdjuntoNombreOriginal()); assertEquals(1234L,r.getAdjuntoTamanioBytes()); assertEquals("a".repeat(64),r.getAdjuntoSha256()); assertEquals(ReportDecisionOrigin.FLUJO_ACTUAL,r.getOrigenDecision());
  assertEquals("PDF",FinalReportWorkflowService.format(r)); verify(audit).record(eq(flight),eq(commander),eq("FINAL_REPORT"),any(),eq("SUBMIT"),any(),contains("\"formato\":\"PDF\""));
 }
 @Test void textPlusPdfIsTheCombinedFormatAndTextOnlyDoesNotCallTheStorage(){
  stub(); service.submit(21L,new FinalReportDtos.Submit("Resumen",null,null,null),pdfFile(),11L); assertEquals("TEXTO_Y_PDF",FinalReportWorkflowService.format(saved.get(0)));
  var other=new FlightFinalReport(); other.setResumen("solo texto"); assertEquals("TEXTO",FinalReportWorkflowService.format(other));
 }
 @Test void neitherTextNorPdfIsRejectedBeforeAnythingIsStored(){
  stub(); assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ApiException.class,()->service.submit(21L,new FinalReportDtos.Submit("  ",null,null,null),null,11L)).status());
  assertThrows(ApiException.class,()->service.submit(21L,new FinalReportDtos.Submit(null,null,null,null),new org.springframework.mock.web.MockMultipartFile("file","a.pdf","application/pdf",new byte[0]),11L));
  verify(attachments,never()).store(any()); assertTrue(saved.isEmpty());
 }
 @Test void anInvalidPdfAbortsTheSubmissionWithoutPersistingAnything(){
  stub(); when(attachments.store(any())).thenThrow(new ApiException(HttpStatus.BAD_REQUEST,"El contenido no es un PDF válido"));
  assertThrows(ApiException.class,()->service.submit(21L,new FinalReportDtos.Submit("x",null,null,null),pdfFile(),11L)); assertTrue(saved.isEmpty()); assertEquals(FinalReportStatus.PENDIENTE,obligation.getStatus()); verify(audit,never()).record(any(),any(),eq("FINAL_REPORT"),any(),any(),any(),any());
 }
 @Test void aFailureAfterStoringTheFileDiscardsIt(){
  stub(); doThrow(new IllegalStateException("fallo de base")).when(reports).saveAndFlush(any());
  assertThrows(IllegalStateException.class,()->service.submit(21L,new FinalReportDtos.Submit("x",null,null,null),pdfFile(),11L)); verify(attachments).discardQuietly(argThat(s->s!=null&&"k-1.pdf".equals(s.key())));
 }
 @Test void aPdfReportIsReviewedReturnedAndResubmittedExactlyLikeATextReport(){
  stub(); service.submit(21L,new FinalReportDtos.Submit(null,null,null,null),pdfFile(),11L);
  service.review(21L,new FinalReportDtos.Review(false,"PDF ilegible"),12L); assertEquals(FinalReportStatus.DEVUELTO,obligation.getStatus()); assertEquals("k-1.pdf",saved.get(0).getAdjuntoUbicacion(),"la versión devuelta conserva su archivo");
  service.submit(21L,new FinalReportDtos.Submit("Texto sustituto",null,null,null),null,11L); assertEquals(2,saved.size()); assertFalse(saved.get(1).hasAttachment()); assertTrue(saved.get(0).hasAttachment());
  service.review(21L,new FinalReportDtos.Review(true,null),12L); assertEquals("COMPLETADO",flight.getEstadoVuelo().getCodigo()); assertEquals(ReportReviewStatus.APROBADO,saved.get(1).getEstadoRevision());
 }
 @Test void theDetailExposesFormatAttachmentWithoutStorageLocationAndOnlyReaderCanDownload(){
  stub(); service.submit(21L,new FinalReportDtos.Submit("t",null,null,null),pdfFile(),11L);
  var v=service.detail(21L,11L).versiones().get(0); assertEquals("TEXTO_Y_PDF",v.formato()); assertEquals("/api/final-reports/21/versions/1/file",v.adjunto().urlDescarga()); assertEquals("Informe.pdf",v.adjunto().nombre()); assertFalse(v.adjunto().toString().contains("k-1"));
  var d=service.download(21L,1,11L); assertEquals("informe-final-V-TEST-v1.pdf",d.filename()); assertArrayEquals("%PDF".getBytes(),d.data());
  User outsider=user(50L,"x"); when(users.findById(50L)).thenReturn(Optional.of(outsider)); when(users.findWithRolesByUsername("x")).thenReturn(Optional.of(outsider));
  assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.download(21L,1,50L)).status());
  assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.download(21L,7,11L)).status());
  saved.get(0).setAdjuntoUbicacion(null); assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.download(21L,1,11L)).status());
 }
 @Test void historicalVersionsKeepTheirProvenanceAndCanNeverBeReviewedAsIfTheyWereDecisions(){
  stub(); FlightFinalReport legacy=new FlightFinalReport(); legacy.setId(77L); legacy.setFlight(flight); legacy.setVersion(1); legacy.setEsVersionActual(true); legacy.setResumen("Informe anterior a V42"); legacy.setCreadoPor(commander);
  legacy.setEstadoRevision(ReportReviewStatus.HISTORICO_SIN_DECISION); legacy.setOrigenDecision(ReportDecisionOrigin.HISTORICA_SIN_EVIDENCIA); saved.add(legacy);
  var v=service.detail(21L,11L).versiones().get(0); assertEquals("HISTORICO_SIN_DECISION",v.estado()); assertEquals("HISTORICA_SIN_EVIDENCIA",v.origenDecision()); assertNull(v.revisadoEn()); assertNull(v.revisor());
  obligation.setStatus(FinalReportStatus.PRESENTADO); obligation.setReport(legacy);
  assertThrows(ApiException.class,()->service.review(21L,new FinalReportDtos.Review(true,null),12L)); assertEquals("FINALIZADO",flight.getEstadoVuelo().getCodigo()); assertEquals(ReportReviewStatus.HISTORICO_SIN_DECISION,legacy.getEstadoRevision());
 }

 private com.vuelossanitarios.backend.api.dto.FinalReportDtos.ObligationView submit(Long id,FinalReportDtos.Submit s,Long actor){return service.submit(id,s,null,actor);}
 private void presentVersionOne(){when(access.isBlocked(anyLong())).thenReturn(false);submit(21L,new FinalReportDtos.Submit("Informe inicial",BigDecimal.ONE,null,null),11L);clearInvocations(notifications,audit);}
 private User user(Long id,String name){User u=new User();u.setId(id);u.setUsername(name);Person p=new Person();p.setNombre("N"+id);p.setApellido("A");u.setPerson(p);return u;}
 private FlightStatus status(String code){FlightStatus s=new FlightStatus();s.setCodigo(code);return s;}
 private Flight flight(String state){Flight f=new Flight();f.setId(7L);f.setCodigo("V-TEST");f.setEstadoVuelo(status(state));FlightType t=new FlightType();t.setCodigo("SANITARIO");f.setTipoVuelo(t);return f;}
 private FinalReportObligation obligation(Long id,FinalReportStatus st,OffsetDateTime due){FinalReportObligation o=new FinalReportObligation();o.setId(id);o.setFlight(flight);o.setCommander(commander);o.setStatus(st);o.setDueAt(due);o.setOriginalDueAt(due);return o;}
}
