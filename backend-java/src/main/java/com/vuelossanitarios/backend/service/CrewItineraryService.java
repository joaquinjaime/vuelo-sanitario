package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.flight.CommanderGeographicException;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Itinerario de los comandantes: dónde se prevé que estará una persona cuando despegue un vuelo, derivado de los vuelos que ya tiene asignados (como comandante o como
 * copiloto) sin modificar jamás su ubicación actual. La ubicación actual cambia sólo cuando un vuelo termina de verdad. Si la persona tiene un vuelo abierto que llega, según el
 * horario planificado, a más tardar en el momento de la salida, la ubicación prevista es la jurisdicción del aeropuerto de llegada de ese vuelo (el más reciente); si no, es la
 * registrada en su perfil. No hay un campo redundante: la ubicación futura se deduce siempre de los vuelos vigentes, de modo que cancelar o cambiar uno la corrige sola.
 * Cuando algo cambia, {@link #revalidate} revisa los vuelos posteriores de las personas afectadas y avisa a Operaciones de los que dejaron de ser coherentes; nunca los quita en silencio.
 */
@Service
public class CrewItineraryService {
 /** {@code afterFlight}: código del vuelo del que se deriva la ubicación prevista; null si es la ubicación registrada en el perfil. */
 public record Position(Province province,String afterFlight,LocalDateTime arrivalAt){
  public Long provinceId(){return province==null?null:province.getId();}
  public String provinceName(){return province==null?null:province.getNombre();}
  public boolean projected(){return afterFlight!=null;}
 }
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users; private final CommanderGeographicExceptionRepository exceptions;
 private final NotificationService notifications; private final AuditService audit;
 public CrewItineraryService(FlightRepository f,FlightCrewRepository c,UserRepository u,CommanderGeographicExceptionRepository e,NotificationService n,AuditService a){flights=f;crews=c;users=u;exceptions=e;notifications=n;audit=a;}

 private static Province registered(User u){CommanderProfile p=u.getPerson()==null?null:u.getPerson().getCommanderProfile();return p==null?null:p.getProvinciaActual();}
 private static Province arrivalProvince(Flight f){return f.getDestino()==null?null:f.getDestino().getProvinciaReferencial();}
 private static boolean laterArrival(Flight candidate,Flight current){return current==null||candidate.getFechaPlanificadaLlegada().isAfter(current.getFechaPlanificadaLlegada());}

 /** Vuelos abiertos de la persona: como comandante (incluso reservado) o con una asignación vigente de copiloto. */
 @Transactional(readOnly=true) public List<Flight> openFlightsOf(Long userId){
  Map<Long,Flight> out=new LinkedHashMap<>();
  for(Flight f:flights.openOfCommander(userId))out.put(f.getId(),f);
  for(FlightCrew c:crews.findByUserIdAndFechaBajaIsNull(userId)){Flight f=c.getFlight();if(f.getEstadoVuelo()==null||!FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo()))out.putIfAbsent(f.getId(),f);}
  return out.values().stream().sorted(Comparator.comparing(Flight::getFechaPlanificadaSalida,Comparator.nullsLast(Comparator.naturalOrder()))).toList();
 }

 /** Ubicación prevista de la persona al despegar el vuelo {@code excludeFlightId} en {@code when} (el propio vuelo no cuenta). */
 @Transactional(readOnly=true) public Position positionAt(User u,LocalDateTime when,Long excludeFlightId){
  Flight best=null;
  if(when!=null)for(Flight f:openFlightsOf(u.getId())){
   if(Objects.equals(f.getId(),excludeFlightId)||f.getFechaPlanificadaLlegada()==null||f.getFechaPlanificadaLlegada().isAfter(when)||arrivalProvince(f)==null)continue;
   if(laterArrival(f,best))best=f;
  }
  return best==null?new Position(registered(u),null,null):new Position(arrivalProvince(best),best.getCodigo(),best.getFechaPlanificadaLlegada());
 }

 /** Igual que {@link #positionAt} para todos los comandantes que tienen algún vuelo abierto que termina antes de {@code when}, en dos consultas (listado de candidatos). */
 @Transactional(readOnly=true) public Map<Long,Position> projectionsAt(LocalDateTime when,Long excludeFlightId){
  Map<Long,Flight> latest=new HashMap<>();
  if(when==null)return Map.of();
  for(Flight f:flights.openArrivingBy(when)){
   if(Objects.equals(f.getId(),excludeFlightId)||arrivalProvince(f)==null||f.getComandante()==null)continue;
   latest.merge(f.getComandante().getId(),f,(a,b)->laterArrival(b,a)?b:a);
  }
  for(FlightCrew c:crews.openCopilotArrivingBy(when)){
   Flight f=c.getFlight();if(Objects.equals(f.getId(),excludeFlightId)||arrivalProvince(f)==null)continue;
   latest.merge(c.getUser().getId(),f,(a,b)->laterArrival(b,a)?b:a);
  }
  Map<Long,Position> out=new HashMap<>();
  latest.forEach((id,f)->out.put(id,new Position(arrivalProvince(f),f.getCodigo(),f.getFechaPlanificadaLlegada())));
  return out;
 }

 /** Función de la persona en el vuelo: comandante principal o copiloto. */
 static String functionIn(Flight f,Long userId){return f.getComandante()!=null&&f.getComandante().getId().equals(userId)?CommanderGeographicException.FUNCTION_COMMANDER:CommanderGeographicException.FUNCTION_COPILOT;}

 /**
  * Revisa todos los vuelos abiertos de las personas indicadas contra su itinerario: cada vuelo con aeropuerto de salida conocido debe salir de la jurisdicción donde la persona
  * estará según los vuelos anteriores (o su ubicación registrada), salvo que una excepción geográfica vigente del vuelo lo cubra. Si no, avisa a Operaciones una sola vez por
  * situación y lo audita; la asignación no se modifica. Devuelve la cantidad de vuelos señalados.
  */
 @Transactional public int revalidate(Collection<Long> userIds,User actor){
  int flagged=0;
  for(Long id:new TreeSet<>(userIds)){
   User u=users.findById(id).orElse(null);if(u==null)continue;
   for(Flight f:openFlightsOf(id)){
    if(f.getFechaPlanificadaSalida()==null||f.getOrigen()==null||f.getOrigen().getProvinciaReferencial()==null)continue;
    Position pos=positionAt(u,f.getFechaPlanificadaSalida(),f.getId());
    Province from=f.getOrigen().getProvinciaReferencial();
    if(pos.provinceId()!=null&&pos.provinceId().equals(from.getId()))continue;
    String function=functionIn(f,id);
    boolean covered=exceptions.findCurrentByFlightId(f.getId()).stream().anyMatch(e->e.getCommander().getId().equals(id)&&function.equals(e.getFunction())&&e.getDepartureProvince()!=null&&e.getDepartureProvince().getId().equals(from.getId()));
    if(covered)continue;
    String where=pos.province()==null?"no tiene una ubicación operativa registrada":pos.projected()?"estará en "+pos.provinceName()+" al terminar el vuelo "+pos.afterFlight():"se encuentra en "+pos.provinceName();
    String message="Revisar el itinerario de "+u.getPerson().getNombre()+" "+u.getPerson().getApellido()+" ("+function+") en el vuelo "+f.getCodigo()+": "+where+" y el vuelo sale de "+from.getNombre()+". La asignación no se modificó: reemplace a la persona o autorice una excepción geográfica.";
    String key="CREW_ITINERARY:"+f.getId()+":"+id+":"+function+":"+Objects.toString(pos.provinceId(),"-")+":"+Objects.toString(pos.afterFlight(),"-");
    int created=notifications.createOncePreferred(f,"CREW_ITINERARY_REVIEW",message,key,List.of(),"OPERACIONES","CENTRO_OPERACIONES");
    if(created>0){flagged++;audit.record(f,actor,"FLIGHT_CREW",id,"ITINERARY_REVIEW_REQUIRED",null,"{\"userId\":"+id+",\"funcion\":\""+function+"\",\"ubicacionPrevista\":"+(pos.province()==null?"null":"\""+pos.provinceName()+"\"")+",\"provinciaSalida\":\""+from.getNombre()+"\"}");}
   }
  }
  return flagged;
 }
}
