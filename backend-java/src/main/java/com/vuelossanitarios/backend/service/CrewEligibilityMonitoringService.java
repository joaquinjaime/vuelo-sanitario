package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.repository.FlightCrewRepository;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import java.util.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reevalúa periódicamente los vuelos abiertos: que el comandante y el copiloto asignados sigan siendo elegibles (cuenta activa, perfil, informes, disponibilidad) y que su
 * itinerario siga siendo coherente con la jurisdicción de salida (por ejemplo, tras cambios de horario o de un vuelo anterior). Cada situación se avisa a Operaciones una sola vez
 * y se audita; las asignaciones nunca se modifican en silencio. Las consultas no escriben eventos.
 */
@Service
public class CrewEligibilityMonitoringService {
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users;
 private final CrewManagementService eligibility; private final CrewItineraryService itinerary; private final NotificationService notifications; private final AuditService audit;
 public CrewEligibilityMonitoringService(FlightRepository f,FlightCrewRepository c,UserRepository u,CrewManagementService e,CrewItineraryService i,NotificationService n,AuditService a){flights=f;crews=c;users=u;eligibility=e;itinerary=i;notifications=n;audit=a;}
 @Scheduled(fixedDelayString="${app.crew-eligibility.sweep-ms:3600000}",initialDelayString="${app.crew-eligibility.sweep-initial-ms:60000}")
 @Transactional
 public void sweep(){reviewOpenFlights();}
 private void reviewOpenFlights(){for(Flight f:flights.findByEstadoVueloCodigoIn(List.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PENDIENTE_REPLANIFICACION","PLANIFICADO","EN_CURSO")))review(f);}
 @Transactional public void reviewFlight(Long id){flights.findById(id).ifPresent(this::review);}
 private void review(Flight f){
  if(f.getEstadoVuelo()==null||FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo()))return;
  Map<Long,String> current=new TreeMap<>();if(f.getComandante()!=null)current.put(f.getComandante().getId(),"COMANDANTE");
  for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()))if(!"COMANDANTE".equals(c.getCrewRole().getCodigo()))current.put(c.getUser().getId(),c.getCrewRole().getCodigo());
  for(var entry:current.entrySet()){
   Long id=entry.getKey();
   users.findById(id).ifPresent(u->{var result=eligibility.evaluate(f,u,entry.getValue(),false);if(result.eligible())return;
    String key="CREW_ELIGIBILITY:"+f.getId()+":"+id+":"+entry.getValue()+":"+result.code();
    String message="Revisar tripulación de "+f.getCodigo()+": "+u.getPerson().getNombre()+" "+u.getPerson().getApellido()+" ("+entry.getValue()+"). "+result.message();
    int created=notifications.createOncePreferred(f,"CREW_ELIGIBILITY_REVIEW",message,key,List.of(),"OPERACIONES","CENTRO_OPERACIONES");
    if(created>0)audit.record(f,null,"FLIGHT_CREW",id,"ELIGIBILITY_REVIEW_REQUIRED",null,"{\"code\":\""+result.code()+"\",\"role\":\""+entry.getValue()+"\"}");
   });
  }
  itinerary.revalidate(current.keySet(),null);
 }
}
