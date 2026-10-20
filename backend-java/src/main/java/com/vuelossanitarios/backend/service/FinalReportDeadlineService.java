package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.repository.FinalReportObligationRepository;
import java.time.*;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Emite los avisos de vencimiento próximo, obligación vencida y bloqueo operativo.
 * El bloqueo en sí no depende de este proceso (se evalúa en cada operación protegida con el reloj del servidor);
 * este barrido sólo notifica y audita, una vez por vencimiento, y cada obligación se procesa en su propia transacción.
 */
@Service public class FinalReportDeadlineService {
 private static final Logger log=LoggerFactory.getLogger(FinalReportDeadlineService.class);
 private final FinalReportObligationRepository obligations; private final NotificationService notifications; private final AuditService audit; private final Clock clock; private final TransactionTemplate tx; private final long dueSoonHours;
 public FinalReportDeadlineService(FinalReportObligationRepository o,NotificationService n,AuditService a,Clock c,PlatformTransactionManager tm,@Value("${app.final-report.due-soon-hours:12}") long dueSoonHours){obligations=o;notifications=n;audit=a;clock=c;tx=new TransactionTemplate(tm);this.dueSoonHours=dueSoonHours;}

 @Scheduled(fixedDelayString="${app.final-report.sweep-ms:60000}",initialDelayString="${app.final-report.sweep-initial-ms:30000}")
 public void scheduledSweep(){try{sweep();}catch(RuntimeException e){log.warn("Barrido de plazos de informes finales fallido: {}",e.getClass().getSimpleName());}}

 /** @return cantidad de notificaciones nuevas emitidas. */
 public int sweep(){
  List<Long> ids=tx.execute(s->obligations.findByStatusInAndCurrentTrueOrderByDueAtAsc(List.of(FinalReportStatus.PENDIENTE,FinalReportStatus.DEVUELTO)).stream().map(FinalReportObligation::getId).toList());
  int created=0;
  for(Long id:ids){Integer n=tx.execute(s->sweepOne(id));created+=n==null?0:n;}
  return created;
 }

 private int sweepOne(Long id){
  FinalReportObligation o=obligations.lockById(id).orElse(null);
  if(o==null||!Boolean.TRUE.equals(o.getCurrent())||(o.getStatus()!=FinalReportStatus.PENDIENTE&&o.getStatus()!=FinalReportStatus.DEVUELTO))return 0;
  OffsetDateTime now=OffsetDateTime.ofInstant(Instant.now(clock),ZoneOffset.UTC);Flight f=o.getFlight();String cycle=o.getId()+":"+o.getDueAt().toEpochSecond();int created=0;
  if(!o.getDueAt().isAfter(now)){
   if(notifications.createOnce(o.getCommander(),f,"FINAL_REPORT_OVERDUE","El informe final del vuelo "+f.getCodigo()+" venció el "+o.getDueAt()+".","FINAL_REPORT_OVERDUE:"+cycle)){
    created++;
    audit.record(f,null,"FINAL_REPORT_OBLIGATION",o.getId(),"OVERDUE","{\"estado\":\""+o.getStatus()+"\"}","{\"vencimiento\":\""+o.getDueAt()+"\",\"comandanteBloqueado\":true}");
    if(notifications.createOnce(o.getCommander(),f,"COMMANDER_BLOCKED","Funciones operativas bloqueadas por informe final vencido (vuelo "+f.getCodigo()+"). Sólo puede presentar los informes pendientes.","COMMANDER_BLOCKED:"+cycle))created++;
    created+=notifications.createOncePreferred(f,"FINAL_REPORT_OVERDUE","Informe final vencido del vuelo "+f.getCodigo()+": comandante "+o.getCommander().getUsername()+" bloqueado.","FINAL_REPORT_OVERDUE:"+cycle,FinalReportWorkflowService.managers(o),"OPERACIONES","CENTRO_OPERACIONES");
   }
  }else if(Duration.between(now,o.getDueAt()).compareTo(Duration.ofHours(dueSoonHours))<=0){
   if(notifications.createOnce(o.getCommander(),f,"FINAL_REPORT_DUE_SOON","El informe final del vuelo "+f.getCodigo()+" vence el "+o.getDueAt()+".","FINAL_REPORT_DUE_SOON:"+cycle))created++;
  }
  return created;
 }
}
