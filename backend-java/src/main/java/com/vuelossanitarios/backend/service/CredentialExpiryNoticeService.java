package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.domain.person.ProfessionalCredential;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Avisos preventivos de vencimiento de habilitaciones verificadas (por defecto 60, 30 y 7 días antes y el día del vencimiento).
 * <p>
 * Idempotencia: cada aviso lleva la clave {@code CRED_EXPIRY:<habilitación>:<vencimiento>:<umbral>} y la restricción única (usuario, clave) de
 * {@code notificaciones} impide duplicados aunque el proceso se ejecute varias veces o en dos instancias a la vez; un cambio de fecha de
 * vencimiento genera una clave nueva. Reinicios o caídas: la siguiente pasada recalcula desde la base y emite sólo el umbral más urgente ya
 * alcanzado que todavía no se avisó (no reproduce los intermedios que se perdieron). Un vencimiento ocurrido hace más de {@code catch-up-days}
 * no se avisa retroactivamente. Cada habilitación se procesa en su propia transacción: una falla se registra, no detiene al resto y se reintenta
 * en la pasada siguiente. Las fechas se calculan con el reloj de negocio y la zona horaria de negocio.
 */
@Service
public class CredentialExpiryNoticeService {
 private static final Logger log=LoggerFactory.getLogger(CredentialExpiryNoticeService.class);
 private final ProfessionalCredentialRepository credentials; private final UserRepository users; private final FlightRepository flights; private final FlightCrewRepository crews; private final NotificationService notifications; private final AuditService audit;
 private final Clock clock; private final ZoneId zone; private final TransactionTemplate tx; private final List<Integer> thresholds; private final boolean enabled; private final int catchUpDays;
 private final AtomicBoolean running=new AtomicBoolean();
 public CredentialExpiryNoticeService(ProfessionalCredentialRepository c,UserRepository u,FlightRepository f,FlightCrewRepository fc,NotificationService n,AuditService a,Clock clock,PlatformTransactionManager manager,
   @Value("${app.business-time-zone:America/Argentina/Tucuman}") String zone,@Value("${app.credential-expiry.notice-days:60,30,7,0}") String days,@Value("${app.credential-expiry.enabled:true}") boolean enabled,@Value("${app.credential-expiry.catch-up-days:30}") int catchUpDays){
  credentials=c;users=u;flights=f;crews=fc;notifications=n;audit=a;this.clock=clock;this.zone=ZoneId.of(zone);tx=new TransactionTemplate(manager);this.enabled=enabled;this.catchUpDays=catchUpDays;
  thresholds=Arrays.stream(days.split(",")).map(String::trim).filter(s->!s.isEmpty()).map(Integer::parseInt).filter(d->d>=0).distinct().sorted().toList();
 }
 public record Summary(int examined,int notices,int failures){}
 @Scheduled(fixedDelayString="${app.credential-expiry.sweep-ms:3600000}",initialDelayString="${app.credential-expiry.sweep-initial-ms:90000}")
 public void scheduled(){if(enabled)run();}
 public Summary run(){return runFor(LocalDate.now(clock.withZone(zone)));}
 /** Una sola pasada a la vez en este proceso; entre procesos la unicidad de la clave del aviso impide duplicados. */
 public Summary runFor(LocalDate today){
  if(thresholds.isEmpty()||!running.compareAndSet(false,true))return new Summary(0,0,0);
  try{
   LocalDate limit=today.plusDays(thresholds.get(thresholds.size()-1)),from=today.minusDays(catchUpDays);
   List<Long> ids=tx.execute(s->credentials.findExpiringVerified(from,limit).stream().filter(c->!renewedByCurrent(c,today)).map(ProfessionalCredential::getId).toList());
   int notices=0,failures=0;
   for(Long id:ids)try{Integer created=tx.execute(s->notify(id,today));notices+=created==null?0:created;}catch(RuntimeException e){failures++;log.warn("No se pudo emitir el aviso de vencimiento de la habilitación {}: {}",id,e.getClass().getSimpleName());}
   return new Summary(ids.size(),notices,failures);
  }finally{running.set(false);}
 }
 private boolean renewedByCurrent(ProfessionalCredential c,LocalDate today){return credentials.existsCurrentRenewal(c.getId(),today);}
 private int notify(Long id,LocalDate today){
  ProfessionalCredential c=credentials.findById(id).orElse(null);
  if(c==null||!"VERIFICADA".equals(c.status)||c.expires==null)return 0;
  long left=ChronoUnit.DAYS.between(today,c.expires);
  Integer threshold=thresholds.stream().filter(t->left<=t).findFirst().orElse(null);if(threshold==null)return 0;
  Long ownerId=credentials.findOwnerUserId(id);User owner=ownerId==null?null:users.findById(ownerId).orElse(null);if(owner==null)return 0;
  String when=left<0?"venció el "+c.expires:left==0?"vence hoy ("+c.expires+")":"vence en "+left+" "+(left==1?"día":"días")+" ("+c.expires+")";
  String key="CRED_EXPIRY:"+id+":"+c.expires+":"+threshold;
  String ownMessage="Su habilitación profesional como "+c.role.getNombre()+" ("+c.type+") "+when+". Gestione su renovación con Administración.";
  String teamMessage="La habilitación #"+id+" ("+c.role.getCodigo()+", usuario "+owner.getUsername()+") "+when+".";
  int created=0;Set<Long> done=new HashSet<>();
  if(Boolean.TRUE.equals(owner.getActivo())&&notifications.createOnce(owner,null,"CREDENTIAL_EXPIRY",ownMessage,key)){created++;}done.add(owner.getId());
  for(User admin:users.findActiveByRoleCode("ADMINISTRADOR"))if(done.add(admin.getId())&&notifications.createOnce(admin,null,"CREDENTIAL_EXPIRY",teamMessage,key))created++;
  if(hasOpenAssignments(owner))for(String role:List.of("OPERACIONES","CENTRO_OPERACIONES"))for(User ops:users.findActiveByRoleCode(role))if(done.add(ops.getId())&&notifications.createOnce(ops,null,"CREDENTIAL_EXPIRY",teamMessage,key))created++;
  if(created>0)audit.record(null,null,"PROFESSIONAL_CREDENTIAL",id,"EXPIRY_NOTICE",null,"{\"threshold\":"+threshold+",\"expires\":\""+c.expires+"\",\"recipients\":"+created+"}");
  return created;
 }
 private boolean hasOpenAssignments(User u){
  return flights.findByComandanteId(u.getId()).stream().anyMatch(f->f.getEstadoVuelo()!=null&&!FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo()))
   ||crews.findByUserIdAndFechaBajaIsNull(u.getId()).stream().anyMatch(c->c.getFlight().getEstadoVuelo()!=null&&!FlightStates.TERMINAL.contains(c.getFlight().getEstadoVuelo().getCodigo()));
 }
}
