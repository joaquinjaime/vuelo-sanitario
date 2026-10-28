package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.repository.FlightCrewRepository;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.util.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Reevalúa los vuelos abiertos tras cambios de credenciales y con el paso del tiempo. Las consultas no escriben eventos. */
@Service
public class CrewEligibilityMonitoringService {
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users;
 private final CrewManagementService eligibility; private final NotificationService notifications; private final AuditService audit;
 public CrewEligibilityMonitoringService(FlightRepository f,FlightCrewRepository c,UserRepository u,CrewManagementService e,NotificationService n,AuditService a){flights=f;crews=c;users=u;eligibility=e;notifications=n;audit=a;}
 @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
 @Transactional(propagation=Propagation.REQUIRES_NEW)
 public void credentialChanged(ProfessionalCredentialService.CredentialChanged event){
  if(event.userId()==null)return;
  Set<Long> ids=new TreeSet<>();for(Flight f:flights.findByComandanteId(event.userId()))ids.add(f.getId());
  for(FlightCrew c:crews.findByUserIdAndFechaBajaIsNull(event.userId()))ids.add(c.getFlight().getId());
  for(Long id:ids)flights.findById(id).ifPresent(f->review(f,event.userId()));
 }
 /** Una política creada o dada de baja puede cambiar la suficiencia de cualquier persona: se revisan todos los vuelos abiertos. */
 @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
 @Transactional(propagation=Propagation.REQUIRES_NEW)
 public void policyChanged(CredentialPolicyService.PolicyChanged event){sweep();}
 @Scheduled(fixedDelayString="${app.crew-eligibility.sweep-ms:3600000}",initialDelayString="${app.crew-eligibility.sweep-initial-ms:60000}")
 @Transactional
 public void sweep(){for(Flight f:flights.findByEstadoVueloCodigoIn(List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION","PLANIFICADO","EN_CURSO")))review(f,null);}
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
