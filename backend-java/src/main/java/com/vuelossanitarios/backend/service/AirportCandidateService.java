package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AirportPlanningDtos.*;
import com.vuelossanitarios.backend.api.dto.FlightDtos.LocalityView;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.domain.catalog.Locality;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Selección asistida de aeropuertos de salida y llegada de un traslado sanitario. La localidad del paciente (origen y destino de la solicitud de DTS) NO es el aeropuerto: este servicio
 * ofrece primero los aeropuertos activos de la misma provincia o CABA que esa localidad, y también (sin impedirlo) los más cercanos de otras jurisdicciones o los que encuentre la búsqueda,
 * porque un aeropuerto de otra provincia puede ser operativamente mejor. El orden es por distancia en línea recta entre el centroide de la localidad y el aeropuerto cuando ambos tienen
 * coordenadas: es una aproximación para comparar alternativas, NO una distancia ni un tiempo de traslado terrestre (no hay datos ni un servicio de ruteo para calcularlos, y no se inventan).
 * Un aeropuerto sin provincia conocida nunca se ofrece. Lo consultan Operaciones y el comandante asignado.
 */
@Service public class AirportCandidateService {
 static final int NEARBY_OTHER=10,SEARCH_LIMIT=25,SAME_PROVINCE_LIMIT=60;
 static final String NOTICE="La distancia es una aproximación en línea recta entre el centro de la localidad y el aeropuerto: no equivale a distancia ni a tiempo de traslado por tierra, que el sistema no calcula. Verifique la factibilidad operativa antes de elegir.";
 private final FlightRepository flights; private final SanitaryFlightRepository sanitary; private final AirportRepository airports; private final UserRepository users;
 public AirportCandidateService(FlightRepository f,SanitaryFlightRepository s,AirportRepository a,UserRepository u){flights=f;sanitary=s;airports=a;users=u;}

 @Transactional(readOnly=true) public AirportCandidates candidates(Long flightId,Long actorId,String type,String q){
  boolean departure=switch(type==null?"":type.trim().toUpperCase(Locale.ROOT)){case "SALIDA"->true;case "LLEGADA"->false;default->throw new ApiException(HttpStatus.BAD_REQUEST,"Indique si busca aeropuertos de SALIDA o de LLEGADA");};
  Flight f=flights.findById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));
  User actor=users.findWithRolesById(actorId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  boolean operations=actor.getUserRoles().stream().anyMatch(r->Set.of("OPERACIONES","CENTRO_OPERACIONES").contains(r.getRole().getCodigo()));
  boolean assignedCommander=f.getComandante()!=null&&f.getComandante().getId().equals(actorId);
  if(!operations&&!assignedCommander)throw new ApiException(HttpStatus.FORBIDDEN,"Sólo Operaciones o el comandante asignado pueden consultar los aeropuertos candidatos");
  SanitaryFlight s=sanitary.findByFlightId(f.getId()).orElseThrow(()->new ApiException(HttpStatus.BAD_REQUEST,"El vuelo no posee solicitud sanitaria"));
  String state=f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo();
  if(!"APROBADO".equals(s.getEstadoSolicitud().getCodigo())||(state!=null&&!"PLANIFICADO".equals(state)))throw new ApiException(HttpStatus.CONFLICT,"El vuelo ya no admite cambios de aeropuertos en su estado actual");
  Locality place=departure?s.getLocalidadOrigenSolicitada():s.getLocalidadDestinoSolicitada();
  Long patientProvince=place.getProvincia().getId();Double[] origin=coordinates(place);
  Airport current=departure?f.getOrigen():f.getDestino();String currentState=departure?f.getEstadoAeropuertoOrigen():f.getEstadoAeropuertoDestino();
  Long aircraftAirport=f.getAircraft()==null||f.getAircraft().getAeropuertoActual()==null?null:f.getAircraft().getAeropuertoActual().getId();
  Long commanderProvince=!departure||f.getComandante()==null||f.getComandante().getPerson().getCommanderProfile()==null||f.getComandante().getPerson().getCommanderProfile().getProvinciaActual()==null?null:f.getComandante().getPerson().getCommanderProfile().getProvinciaActual().getId();
  boolean commanderKnown=departure&&f.getComandante()!=null;
  String text=fold(q);
  List<AirportCandidate> same=new ArrayList<>(),other=new ArrayList<>();
  for(Airport a:airports.findAllDetailedOrderByNombre()){
   if(!Boolean.TRUE.equals(a.getActivo())||a.getProvinciaReferencial()==null)continue;
   if(!text.isEmpty()&&!matches(a,text))continue;
   boolean inPatientProvince=a.getProvinciaReferencial().getId().equals(patientProvince);
   Boolean commanderInJurisdiction=commanderKnown?commanderProvince!=null&&commanderProvince.equals(a.getProvinciaReferencial().getId()):null;
   AirportCandidate c=new AirportCandidate(a.getId(),a.getNombre(),a.getCodigoOaci(),a.getCodigoIata(),a.getTipo(),a.getCiudad(),a.getProvinciaReferencial().getId(),a.getProvinciaReferencial().getNombre(),distance(origin,a),
    inPatientProvince,a.getId().equals(aircraftAirport),commanderInJurisdiction,current!=null&&current.getId().equals(a.getId()),current!=null&&current.getId().equals(a.getId())?currentState:null);
   (inPatientProvince?same:other).add(c);
  }
  Comparator<AirportCandidate> byDistance=Comparator.comparing((AirportCandidate c)->c.distanciaRectaKm()==null?Double.MAX_VALUE:c.distanciaRectaKm()).thenComparing(AirportCandidate::nombre,String.CASE_INSENSITIVE_ORDER);
  same.sort(byDistance);other.sort(byDistance);
  boolean incomplete=false;
  if(text.isEmpty()){
   if(origin==null)other=List.of();else{incomplete=other.size()>NEARBY_OTHER;other=other.stream().filter(c->c.distanciaRectaKm()!=null).limit(NEARBY_OTHER).toList();}
  }else if(other.size()>SEARCH_LIMIT){incomplete=true;other=other.subList(0,SEARCH_LIMIT);}
  if(same.size()>SAME_PROVINCE_LIMIT){incomplete=true;same=same.subList(0,SAME_PROVINCE_LIMIT);}
  String message=null;
  if(same.isEmpty()&&other.isEmpty())message="No existen aeropuertos operativamente adecuados entre los candidatos disponibles"+(text.isEmpty()?"; busque por nombre o código para ver aeropuertos de otras provincias.":" para esa búsqueda.");
  else if(same.isEmpty())message="No hay aeropuertos activos en "+place.getProvincia().getNombre()+" que coincidan; se muestran alternativas de otras jurisdicciones (elegirlas requiere una justificación operativa).";
  return new AirportCandidates(departure?"SALIDA":"LLEGADA",new LocalityView(place.getId(),place.getNombre(),place.getProvincia().getNombre(),place.getProvincia().getId()),origin!=null,same,other,incomplete,NOTICE,message);
 }

 private static Double[] coordinates(Locality l){BigDecimal lat=l.getLatitud(),lon=l.getLongitud();return lat==null||lon==null?null:new Double[]{lat.doubleValue(),lon.doubleValue()};}
 private static Double distance(Double[] origin,Airport a){
  if(origin==null||a.getLatitud()==null||a.getLongitud()==null)return null;
  double r=6371.0088,p1=Math.toRadians(origin[0]),p2=Math.toRadians(a.getLatitud().doubleValue()),dp=p2-p1,dl=Math.toRadians(a.getLongitud().doubleValue()-origin[1]);
  double h=Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)*Math.sin(dl/2);
  return Math.round(2*r*Math.asin(Math.min(1,Math.sqrt(h)))*10)/10.0;
 }
 private static boolean matches(Airport a,String text){return fold(a.getNombre()).contains(text)||fold(a.getCiudad()).contains(text)||fold(a.getCodigoOaci()).contains(text)||fold(a.getCodigoIata()).contains(text)||fold(a.getCodigoOficial()).contains(text)||fold(a.getProvinciaReferencial().getNombre()).contains(text);}
 private static String fold(String v){return v==null?"":Normalizer.normalize(v,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).trim();}
}
