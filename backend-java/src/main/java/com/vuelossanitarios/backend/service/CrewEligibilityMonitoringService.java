package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.repository.FlightCrewRepository;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Reevalúa los vuelos abiertos tras cambios de credenciales y con el paso del tiempo. Las consultas no escriben eventos. */
@Service
public class CrewEligibilityMonitoringService {
 private static final Logger log=LoggerFactory.getLogger(CrewEligibilityMonitoringService.class);
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users;
 private final CrewManagementService eligibility; private final NotificationService notifications; private final AuditService audit;
 private final boolean policyReviewEnabled; private final TransactionTemplate tx; private final AtomicBoolean policyReviewQueued=new AtomicBoolean();
 private final ExecutorService policyReviewer=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"crew-eligibility-policy-review");t.setDaemon(true);return t;});
 public CrewEligibilityMonitoringService(FlightRepository f,FlightCrewRepository c,UserRepository u,CrewManagementService e,NotificationService n,AuditService a,PlatformTransactionManager manager,@org.springframework.beans.factory.annotation.Value("${app.crew-eligibility.policy-review-enabled:true}") boolean policyReviewEnabled){this.policyReviewEnabled=policyReviewEnabled;flights=f;crews=c;users=u;eligibility=e;notifications=n;audit=a;tx=new TransactionTemplate(manager);}
 @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
 @Transactional(propagation=Propagation.REQUIRES_NEW)
 public void credentialChanged(ProfessionalCredentialService.CredentialChanged event){
  if(event.userId()==null)return;
  Set<Long> ids=new TreeSet<>();for(Flight f:flights.findByComandanteId(event.userId()))ids.add(f.getId());
  for(FlightCrew c:crews.findByUserIdAndFechaBajaIsNull(event.userId()))ids.add(c.getFlight().getId());
  for(Long id:ids)flights.findById(id).ifPresent(f->review(f,event.userId()));
 }
 /**
  * Una política creada o dada de baja puede cambiar la suficiencia de cualquier persona: se revisan todos los vuelos abiertos. La revisión es costosa y no
  * debe demorar al administrador, por lo que corre en un hilo aparte y se coalesce: varios cambios seguidos provocan una sola revisión pendiente.
  * La eligibilidad ya es inmediata (se calcula en cada consulta); esto sólo emite las alertas.
  */
 @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
 public void policyChanged(CredentialPolicyService.PolicyChanged event){
  if(!policyReviewEnabled||!policyReviewQueued.compareAndSet(false,true))return;
  policyReviewer.execute(()->{policyReviewQueued.set(false);try{tx.executeWithoutResult(s->reviewOpenFlights());}catch(RuntimeException e){log.warn("La revisión de tripulaciones tras el cambio de política falló: {}",e.getClass().getSimpleName());}});
 }
 @Scheduled(fixedDelayString="${app.crew-eligibility.sweep-ms:3600000}",initialDelayString="${app.crew-eligibility.sweep-initial-ms:60000}")
 @Transactional
 public void sweep(){reviewOpenFlights();}
 private void reviewOpenFlights(){for(Flight f:flights.findByEstadoVueloCodigoIn(List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION","PLANIFICADO","EN_CURSO")))review(f,null);}
 @Transactional public void reviewFlight(Long id){flights.findById(id).ifPresent(f->review(f,null));}
 private void review(Flight f,Long onlyUser){
  if(f.getEstadoVuelo()==null||FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo()))return;
  Map<Long,String> current=new TreeMap<>();if(f.getComandante()!=null)current.put(f.getComandante().getId(),"COMANDANTE");
  for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))if(!"COMANDANTE".equals(c.getCrewRole().getCodigo()))current.put(c.getUser().getId(),c.getCrewRole().getCodigo());
  for(var entry:current.entrySet()){
   Long id=entry.getKey();if(onlyUser!=null&&!id.equals(onlyUser))continue;
   users.findById(id).ifPresent(u->{var result=eligibility.evaluate(f,u,entry.getValue(),false);if(result.eligible())return;
    String key="CREW_ELIGIBILITY:"+f.getId()+":"+id+":"+entry.getValue()+":"+result.code()+":"+Objects.toString(result.expires(),"");
    String message="Revisar tripulación de "+f.getCodigo()+": "+u.getPerson().getNombre()+" "+u.getPerson().getApellido()+" ("+entry.getValue()+"). "+result.message();
    int created=notifications.createOncePreferred(f,"CREW_ELIGIBILITY_REVIEW",message,key,List.of(),"OPERACIONES","CENTRO_OPERACIONES");
    if(created>0)audit.record(f,null,"FLIGHT_CREW",id,"ELIGIBILITY_REVIEW_REQUIRED",null,"{\"code\":\""+result.code()+"\",\"role\":\""+entry.getValue()+"\"}");
   });
  }
 }
}
