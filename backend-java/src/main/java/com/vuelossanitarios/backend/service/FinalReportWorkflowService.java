package com.vuelossanitarios.backend.service;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FinalReportDtos.*;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Cierre administrativo de un vuelo finalizado: obligación de informe final del comandante,
 * presentación versionada (texto, PDF o ambos), revisión (aprobación o devolución) y paso a COMPLETADO.
 * El plazo y el bloqueo se calculan siempre con el reloj del servidor.
 */
@Service public class FinalReportWorkflowService {
 public static final long DEADLINE_HOURS=48;
 public record Download(String filename,byte[] data){}
 private final FinalReportObligationRepository obligations; private final FlightFinalReportRepository reports; private final SanitaryFlightRepository sanitaryFlights; private final FlightStatusRepository statuses; private final UserRepository users; private final NotificationService notifications; private final AuditService audit; private final CommanderReportAccessService access; private final ReportAttachmentService attachments; private final ObjectMapper json; private final Clock clock;
 public FinalReportWorkflowService(FinalReportObligationRepository o,FlightFinalReportRepository r,SanitaryFlightRepository sf,FlightStatusRepository s,UserRepository u,NotificationService n,AuditService a,CommanderReportAccessService ac,ReportAttachmentService att,ObjectMapper j,Clock c){obligations=o;reports=r;sanitaryFlights=sf;statuses=s;users=u;notifications=n;audit=a;access=ac;attachments=att;json=j;clock=c;}

 /** Se invoca dentro de la transición de finalización (vuelo ya bloqueado); es idempotente por vuelo. */
 @Transactional public void createObligationAfterFinish(Flight flight,User actor){
  if(flight.getComandante()==null)throw bad("El vuelo finalizado debe tener comandante asignado");
  if(obligations.findByFlightIdAndCurrentTrue(flight.getId()).isPresent())return;
  OffsetDateTime due=now().plusHours(DEADLINE_HOURS);
  FinalReportObligation o=new FinalReportObligation();o.setFlight(flight);o.setCommander(flight.getComandante());o.setFinisher(actor);o.setObligationNumber(1);o.setStatus(FinalReportStatus.PENDIENTE);o.setOriginalDueAt(due);o.setDueAt(due);obligations.save(o);
  audit.record(flight,actor,"FINAL_REPORT_OBLIGATION",o.getId(),"CREATE",null,toJson(mapOf("estado","PENDIENTE","vencimiento",due.toString())));
  notifications.createOnce(o.getCommander(),flight,"FINAL_REPORT_PENDING","El vuelo "+flight.getCodigo()+" finalizó. Debe presentar el informe final antes de "+due,"FINAL_REPORT_PENDING:"+o.getId());
  notifications.createOnce(o.getCommander(),flight,"FLIGHT_FINISHED","El Centro de Operaciones finalizó el vuelo "+flight.getCodigo()+".","FLIGHT_FINISHED:"+flight.getId());
  SanitaryFlight sanitary=sanitaryFlights.findByFlightId(flight.getId()).orElse(null);
  if(sanitary!=null&&!sanitary.getSolicitadoPor().getId().equals(o.getCommander().getId()))notifications.createOnce(sanitary.getSolicitadoPor(),flight,"FLIGHT_FINISHED","El vuelo sanitario "+flight.getCodigo()+" fue finalizado.","FLIGHT_FINISHED:"+flight.getId());
 }

 /** Presentación JSON (sólo texto) o multipart (texto, PDF o ambos); la validación y el guardado del adjunto ocurren antes de tocar la base. */
 @Transactional public ObligationView submit(Long obligationId,Submit req,MultipartFile file,Long actorId){
  FinalReportObligation o=locked(obligationId);requireCommander(o,actorId);Flight flight=o.getFlight();
  if(!Boolean.TRUE.equals(o.getCurrent()))throw bad("La obligación ya no está vigente");
  if(flight.getEstadoVuelo()==null||!"FINALIZADO".equals(flight.getEstadoVuelo().getCodigo()))throw bad("El informe sólo puede presentarse con el vuelo finalizado");
  if(o.getStatus()==FinalReportStatus.APROBADO)throw bad("El informe aprobado no admite versiones nuevas");
  if(o.getStatus()==FinalReportStatus.PRESENTADO)throw bad("El informe ya fue presentado y está pendiente de revisión");
  String text=req.texto()==null||req.texto().isBlank()?null:req.texto().trim();
  boolean hasFile=file!=null&&!file.isEmpty();
  if(text==null&&!hasFile)throw bad("Debe ingresar el texto del informe o adjuntar un PDF");
  ReportAttachmentService.Stored stored=hasFile?attachments.store(file):null;
  try{
   boolean resubmission=o.getStatus()==FinalReportStatus.DEVUELTO,wasBlocked=access.isBlocked(o.getCommander().getId());
   FinalReportStatus before=o.getStatus();
   Optional<FlightFinalReport> previous=reports.findByFlightIdAndEsVersionActualTrue(flight.getId());
   previous.ifPresent(x->{x.setEsVersionActual(false);reports.saveAndFlush(x);});
   FlightFinalReport r=new FlightFinalReport();r.setFlight(flight);r.setVersion(reports.countByFlightId(flight.getId())+1);r.setEsVersionActual(true);r.setEstadoRevision(ReportReviewStatus.PRESENTADO);r.setOrigenDecision(ReportDecisionOrigin.FLUJO_ACTUAL);r.setHorasVuelo(req.horasVuelo());r.setCombustibleConsumidoLitros(req.combustibleConsumidoLitros());r.setIncidentes(blank(req.incidentes()));r.setResumen(text);r.setCreadoPor(user(actorId));
   if(stored!=null){r.setAdjuntoNombreOriginal(stored.originalName());r.setAdjuntoUbicacion(stored.key());r.setAdjuntoTamanioBytes(stored.size());r.setAdjuntoSha256(stored.sha256());}
   reports.saveAndFlush(r);
   o.setReport(r);o.setStatus(FinalReportStatus.PRESENTADO);o.setPresentedAt(now());
   audit.record(flight,user(actorId),"FINAL_REPORT",r.getId(),resubmission?"RESUBMIT":"SUBMIT",toJson(mapOf("estadoObligacion",before.name(),"version",previous.map(FlightFinalReport::getVersion).orElse(null))),toJson(mapOf("estadoObligacion","PRESENTADO","version",r.getVersion(),"formato",format(r),"adjuntoBytes",stored==null?null:stored.size(),"adjuntoSha256",stored==null?null:stored.sha256())));
   String msg=(resubmission?"Nueva presentación del informe final":"Informe final presentado")+" para el vuelo "+flight.getCodigo()+" (versión "+r.getVersion()+")";
   notifications.createOncePreferred(flight,resubmission?"FINAL_REPORT_RESUBMITTED":"FINAL_REPORT_SUBMITTED",msg,"FINAL_REPORT_SUBMITTED:"+r.getId(),managers(o),"OPERACIONES","CENTRO_OPERACIONES");
   if(wasBlocked&&!access.isBlocked(o.getCommander().getId())){
    audit.record(flight,user(actorId),"FINAL_REPORT_OBLIGATION",o.getId(),"UNBLOCK_COMMANDER",toJson(mapOf("comandanteBloqueado",true)),toJson(mapOf("comandanteBloqueado",false)));
    notifications.createOnce(o.getCommander(),flight,"COMMANDER_UNBLOCKED","Cumplió sus informes finales vencidos; las funciones operativas fueron restablecidas.","COMMANDER_UNBLOCKED:"+r.getId());
   }
   return view(o);
  }catch(RuntimeException e){attachments.discardQuietly(stored);throw e;}
 }

 @Transactional public ObligationView extend(Long obligationId,Long actorId){
  FinalReportObligation o=locked(obligationId);requireCommander(o,actorId);
  if(o.getExtensionUsed())throw bad("La prórroga ya fue utilizada para esta obligación");
  if(o.getStatus()!=FinalReportStatus.PENDIENTE&&o.getStatus()!=FinalReportStatus.DEVUELTO)throw bad("La prórroga sólo está disponible para un informe pendiente de presentación");
  OffsetDateTime before=o.getDueAt(),now=now();o.setDueAt(now.isAfter(before)?now.plusHours(24):before.plusHours(24));o.setExtensionUsed(true);o.setExtendedAt(now);
  audit.record(o.getFlight(),user(actorId),"FINAL_REPORT_OBLIGATION",o.getId(),"EXTEND",toJson(mapOf("vencimiento",before.toString())),toJson(mapOf("vencimiento",o.getDueAt().toString())));
  notifications.createOnce(o.getCommander(),o.getFlight(),"FINAL_REPORT_EXTENSION","Prórroga concedida hasta "+o.getDueAt()+" para el vuelo "+o.getFlight().getCodigo(),"FINAL_REPORT_EXTENSION:"+o.getId()+":"+o.getDueAt().toEpochSecond());
  return view(o);
 }

 /** La revisión funciona igual para texto, PDF o ambos: se decide sobre la versión vigente presentada. */
 @Transactional public ObligationView review(Long obligationId,Review req,Long actorId){
  FinalReportObligation o=locked(obligationId);Flight flight=o.getFlight();FlightFinalReport report=o.getReport();
  if(o.getStatus()!=FinalReportStatus.PRESENTADO||report==null||!Boolean.TRUE.equals(report.getEsVersionActual())||report.getEstadoRevision()!=ReportReviewStatus.PRESENTADO)throw bad("Sólo se puede revisar la versión actual presentada");
  if(flight.getEstadoVuelo()==null||!"FINALIZADO".equals(flight.getEstadoVuelo().getCodigo()))throw bad("Sólo se revisa el informe de un vuelo finalizado");
  User reviewer=user(actorId);OffsetDateTime now=now();
  if(Boolean.TRUE.equals(req.aprobar())){
   report.setEstadoRevision(ReportReviewStatus.APROBADO);report.setFechaRevision(now);report.setRevisor(reviewer);reports.saveAndFlush(report);
   o.setStatus(FinalReportStatus.APROBADO);o.setApprovedAt(now);o.setApprovedBy(reviewer);obligations.saveAndFlush(o);
   // El trigger de SQL Server exige que versión y obligación ya consten aprobadas cuando el vuelo pasa a COMPLETADO.
   flight.setEstadoVuelo(status("COMPLETADO"));
   audit.record(flight,reviewer,"FINAL_REPORT",report.getId(),"APPROVE",toJson(mapOf("estadoObligacion","PRESENTADO","estadoInforme","PRESENTADO")),toJson(mapOf("estadoObligacion","APROBADO","estadoInforme","APROBADO","version",report.getVersion())));
   audit.record(flight,reviewer,"FLIGHT",flight.getId(),"COMPLETE",toJson(mapOf("estado","FINALIZADO")),toJson(mapOf("estado","COMPLETADO")));
   String key=o.getId().toString();
   notifications.createOnce(o.getCommander(),flight,"FINAL_REPORT_APPROVED","Informe final aprobado para el vuelo "+flight.getCodigo()+".","FINAL_REPORT_APPROVED:"+report.getId());
   notifications.createOnce(o.getCommander(),flight,"FLIGHT_COMPLETED","El vuelo "+flight.getCodigo()+" fue completado.","FLIGHT_COMPLETED:"+key);
   sanitaryFlights.findByFlightId(flight.getId()).ifPresent(s->notifications.createOnce(s.getSolicitadoPor(),flight,"FLIGHT_COMPLETED","El vuelo sanitario "+flight.getCodigo()+" fue completado.","FLIGHT_COMPLETED:"+key));
  }else{
   if(req.motivoDevolucion()==null||req.motivoDevolucion().trim().isEmpty())throw bad("La devolución requiere un motivo");
   OffsetDateTime due=now.plusHours(DEADLINE_HOURS);String reason=req.motivoDevolucion().trim();
   OffsetDateTime previousDue=o.getDueAt();
   o.setStatus(FinalReportStatus.DEVUELTO);o.setReturnReason(reason);o.setReturnedAt(now);o.setReturnedBy(reviewer);o.setOriginalDueAt(due);o.setDueAt(due);o.setExtensionUsed(false);o.setExtendedAt(null);
   report.setEstadoRevision(ReportReviewStatus.DEVUELTO);report.setMotivoDevolucion(reason);report.setFechaRevision(now);report.setRevisor(reviewer);
   audit.record(flight,reviewer,"FINAL_REPORT",report.getId(),"RETURN",toJson(mapOf("estadoObligacion","PRESENTADO","vencimiento",previousDue.toString())),toJson(mapOf("estadoObligacion","DEVUELTO","vencimiento",due.toString(),"motivo",reason,"version",report.getVersion())));
   notifications.createOnce(o.getCommander(),flight,"FINAL_REPORT_RETURNED","Informe devuelto para corrección (vuelo "+flight.getCodigo()+"): "+reason+". Nuevo vencimiento: "+due,"FINAL_REPORT_RETURNED:"+report.getId());
  }
  return view(o);
 }

 @Transactional(readOnly=true) public List<ObligationView> mine(Long commander){return obligations.findByCommanderIdAndCurrentTrueOrderByDueAtAsc(commander).stream().map(this::view).toList();}
 @Transactional(readOnly=true) public List<ObligationView> pendingReview(){return obligations.findByStatusAndCurrentTrueOrderByPresentedAtAsc(FinalReportStatus.PRESENTADO).stream().map(this::view).toList();}
 /** Obligaciones que esperan una presentación (pendientes o devueltas), las vencidas primero por su vencimiento. */
 @Transactional(readOnly=true) public List<ObligationView> awaitingCommander(){return obligations.findByStatusInAndCurrentTrueOrderByDueAtAsc(List.of(FinalReportStatus.PENDIENTE,FinalReportStatus.DEVUELTO)).stream().map(this::view).toList();}

 @Transactional(readOnly=true) public ObligationDetail detail(Long obligationId,Long actorId){
  FinalReportObligation o=obligations.findById(obligationId).orElseThrow(()->notFound());requireReader(o,actorId);return detailOf(o);
 }
 @Transactional(readOnly=true) public ObligationDetail byFlight(Long flightId,Long actorId){
  FinalReportObligation o=obligations.findByFlightIdAndCurrentTrue(flightId).orElseThrow(()->notFound());requireReader(o,actorId);return detailOf(o);
 }
 /** Descarga autenticada del PDF de una versión: mismo control de acceso que la consulta del informe. */
 @Transactional(readOnly=true) public Download download(Long obligationId,int version,Long actorId){
  FinalReportObligation o=obligations.findById(obligationId).orElseThrow(()->notFound());requireReader(o,actorId);
  FlightFinalReport r=reports.findByFlightIdOrderByVersionDesc(o.getFlight().getId()).stream().filter(x->x.getVersion()==version).findFirst().orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Versión de informe inexistente"));
  if(!r.hasAttachment())throw new ApiException(HttpStatus.NOT_FOUND,"La versión no tiene un PDF adjunto");
  return new Download("informe-final-"+o.getFlight().getCodigo()+"-v"+r.getVersion()+".pdf",attachments.read(r.getAdjuntoUbicacion()));
 }
 /** Estado administrativo del vuelo para su ficha; null si el vuelo no generó obligación de informe. */
 @Transactional(readOnly=true) public ClosureView closure(Flight f){
  return obligations.findByFlightIdAndCurrentTrue(f.getId()).map(o->{
   boolean overdue=overdue(o);
   String admin=switch(o.getStatus()){case PENDIENTE->overdue?"INFORME_VENCIDO":"INFORME_PENDIENTE";case DEVUELTO->overdue?"INFORME_VENCIDO":"INFORME_DEVUELTO";case PRESENTADO->"EN_REVISION";case APROBADO->"CERRADO";};
   return new ClosureView(o.getId(),admin,o.getStatus().name(),o.getDueAt(),overdue,access.isBlocked(o.getCommander().getId()),reports.countByFlightId(f.getId()),o.getApprovedAt(),f.getFechaSalidaReal(),f.getFechaLlegadaReal());
  }).orElse(null);
 }

 public boolean overdue(FinalReportObligation o){return (o.getStatus()==FinalReportStatus.PENDIENTE||o.getStatus()==FinalReportStatus.DEVUELTO)&&!o.getDueAt().isAfter(now());}

 /** Responsables concretos de la gestión del cierre: quien finalizó el vuelo y quien devolvió el informe. */
 static List<User> managers(FinalReportObligation o){List<User> l=new ArrayList<>();if(o.getFinisher()!=null)l.add(o.getFinisher());if(o.getReturnedBy()!=null)l.add(o.getReturnedBy());return l;}
 static String format(FlightFinalReport r){boolean text=r.getResumen()!=null&&!r.getResumen().isBlank();return r.hasAttachment()?(text?"TEXTO_Y_PDF":"PDF"):"TEXTO";}

 private ObligationDetail detailOf(FinalReportObligation o){
  List<ReportVersionView> versions=reports.findByFlightIdOrderByVersionDesc(o.getFlight().getId()).stream().map(r->new ReportVersionView(r.getId(),r.getVersion(),Boolean.TRUE.equals(r.getEsVersionActual()),r.getEstadoRevision().name(),r.getOrigenDecision().name(),format(r),r.getHorasVuelo(),r.getCombustibleConsumidoLitros(),r.getIncidentes(),r.getResumen(),
    r.hasAttachment()?new AttachmentView(r.getAdjuntoNombreOriginal(),r.getAdjuntoTamanioBytes(),r.getAdjuntoSha256(),"/api/final-reports/"+o.getId()+"/versions/"+r.getVersion()+"/file"):null,
    r.getCreadoPor().getUsername(),r.getCreatedAt(),r.getMotivoDevolucion(),r.getFechaRevision(),r.getRevisor()==null?null:r.getRevisor().getUsername())).toList();
  return new ObligationDetail(view(o),versions);
 }
 private void requireReader(FinalReportObligation o,Long actorId){
  if(o.getCommander().getId().equals(actorId))return;
  User u=users.findById(actorId).flatMap(x->users.findWithRolesByUsername(x.getUsername())).orElseThrow(()->new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este informe"));
  if(u.getUserRoles().stream().noneMatch(x->Set.of("OPERACIONES","CENTRO_OPERACIONES","ADMINISTRADOR").contains(x.getRole().getCodigo())))throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este informe");
 }
 private FinalReportObligation locked(Long id){return obligations.lockById(id).orElseThrow(()->notFound());}
 private ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"Obligación de informe inexistente");}
 private void requireCommander(FinalReportObligation o,Long id){if(!o.getCommander().getId().equals(id))throw new ApiException(HttpStatus.FORBIDDEN,"Sólo el comandante responsable puede presentar este informe");}
 private User user(Long id){return users.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));}
 private FlightStatus status(String code){return statuses.findByCodigo(code).orElseThrow(()->new IllegalStateException("Catálogo de estados incompleto"));}
 private OffsetDateTime now(){return OffsetDateTime.ofInstant(Instant.now(clock),ZoneOffset.UTC);}
 private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}
 private String blank(String s){return s==null||s.isBlank()?null:s.trim();}
 private static Map<String,Object> mapOf(Object... kv){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<kv.length;i+=2)m.put((String)kv[i],kv[i+1]);return m;}
 private String toJson(Object v){try{return json.writeValueAsString(v);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 ObligationView view(FinalReportObligation o){
  Flight f=o.getFlight();User c=o.getCommander();boolean open=o.getStatus()==FinalReportStatus.PENDIENTE||o.getStatus()==FinalReportStatus.DEVUELTO;
  return new ObligationView(o.getId(),f.getId(),f.getCodigo(),o.getStatus().name(),o.getDueAt(),o.getOriginalDueAt(),Boolean.TRUE.equals(o.getExtensionUsed()),o.getPresentedAt(),o.getReturnReason(),access.isBlocked(c.getId()),
   f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo(),f.getTipoVuelo().getCodigo(),c.getId(),c.getPerson().getNombre()+" "+c.getPerson().getApellido(),overdue(o),open?Duration.between(now(),o.getDueAt()).getSeconds():null,reports.countByFlightId(f.getId()),o.getApprovedAt());
 }
}
