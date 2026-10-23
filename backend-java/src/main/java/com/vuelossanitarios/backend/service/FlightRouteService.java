package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class FlightRouteService {
 public record Input(@NotNull @Min(0) Integer version, @NotBlank @Size(max=4000) String recorrido,
   Long alternativoId, @DecimalMin("0.00") @Digits(integer=6,fraction=2) BigDecimal altitudPies,
   @DecimalMin("0.01") @Digits(integer=6,fraction=2) BigDecimal distanciaNm,
   @Min(1) Integer tiempoEstimadoMinutos, @Size(max=4000) String observaciones) {}
 public record Version(Integer version,String recorrido,Long alternativoId,String alternativo,BigDecimal altitudPies,BigDecimal distanciaNm,Integer tiempoEstimadoMinutos,String observaciones,String creadoPor,LocalDateTime fechaCreacion,boolean vigente) {}
 public record View(String estado,boolean editable,String motivo, String origen,String destino,LocalDateTime salida,LocalDateTime llegada,List<Version> versiones) {}
 public record Status(Long flightId,String estado) {}
 private final FlightRepository flights; private final FlightRouteRepository routes; private final AirportRepository airports; private final UserRepository users; private final FlightAuthorizationService access; private final AuditService audit; private final ObjectMapper json; private final CommanderReportAccessService commanderAccess;
 public FlightRouteService(FlightRepository f,FlightRouteRepository r,AirportRepository a,UserRepository u,FlightAuthorizationService x,AuditService au,ObjectMapper j,CommanderReportAccessService ca){commanderAccess=ca;flights=f;routes=r;airports=a;users=u;access=x;audit=au;json=j;}
 @Transactional(readOnly=true) public View get(Long id,Long actor){Flight f=flights.findById(id).orElseThrow(()->missing("Vuelo"));access.mayRead(f,actor);return view(f);}
 @Transactional(readOnly=true) public List<Status> statuses(){Map<Long,FlightRoute> current=new HashMap<>();for(FlightRoute r:routes.findByEsVersionActualTrue())current.put(r.getFlight().getId(),r);return flights.findAll().stream().map(f->new Status(f.getId(),state(f,current.get(f.getId())))).toList();}
 @Transactional public View save(Long id,Long actor,Input input){
  Flight f=flights.lockById(id).orElseThrow(()->missing("Vuelo"));
  if(f.getComandante()==null || !f.getComandante().getId().equals(actor))throw new ApiException(HttpStatus.FORBIDDEN,"Sólo el comandante asignado puede modificar la ruta");
  commanderAccess.requireOperationalAccess(actor);
  if(!mutable(f))throw new ApiException(HttpStatus.BAD_REQUEST,"La ruta sólo puede modificarse en un vuelo PLANIFICADO");
  if(!ready(f))throw new ApiException(HttpStatus.BAD_REQUEST,"Complete primero los aeropuertos y horarios del vuelo");
  FlightRoute old=routes.findByFlightIdAndEsVersionActualTrue(id).orElse(null); int version=old==null?0:old.getVersion();
  if(input.version()!=version)throw new ApiException(HttpStatus.CONFLICT,"La ruta cambió; vuelva a cargarla antes de guardar");
  Airport alternate=null;if(input.alternativoId()!=null){alternate=airports.findById(input.alternativoId()).filter(a->Boolean.TRUE.equals(a.getActivo())).orElseThrow(()->new ApiException(HttpStatus.BAD_REQUEST,"Aeropuerto alternativo inexistente o inactivo"));if(alternate.getId().equals(f.getDestino().getId()))throw new ApiException(HttpStatus.BAD_REQUEST,"El alternativo debe ser distinto del destino");}
  String before=old==null?null:serialize(snapshot(old,f));
  if(old!=null){old.setEsVersionActual(false);routes.saveAndFlush(old);}
  FlightRoute r=new FlightRoute();r.setFlight(f);r.setVersion(version+1);r.setRecorrido(input.recorrido().trim());r.setAlternativo(alternate);r.setAltitudPies(input.altitudPies());r.setDistanciaNm(input.distanciaNm());r.setTiempoEstimadoMinutos(input.tiempoEstimadoMinutos());r.setObservaciones(input.observaciones()==null?null:input.observaciones().trim());r.setContexto(context(f));r.setCreadoPor(users.findById(actor).orElseThrow(()->missing("Usuario")));routes.saveAndFlush(r);
  audit.record(f,r.getCreadoPor(),"FLIGHT_ROUTE",r.getId(),old==null?"CREATE":"UPDATE",before,serialize(snapshot(r,f)));return view(f);
 }
 private View view(Flight f){List<FlightRoute> rows=routes.findByFlightIdOrderByVersionDesc(f.getId());FlightRoute current=rows.stream().filter(r->Boolean.TRUE.equals(r.getEsVersionActual())).findFirst().orElse(null);return new View(state(f,current),mutable(f)&&ready(f),!mutable(f)?"La ruta sólo puede modificarse en estado PLANIFICADO":!ready(f)?"Complete primero los aeropuertos y horarios del vuelo":null,f.getOrigen()==null?null:f.getOrigen().getNombre(),f.getDestino()==null?null:f.getDestino().getNombre(),f.getFechaPlanificadaSalida(),f.getFechaPlanificadaLlegada(),rows.stream().map(r->snapshot(r,f)).toList());}
 private String state(Flight f,FlightRoute current){return current==null?"SIN_PLANIFICAR":!ready(f)||!Objects.equals(context(f),current.getContexto())?"REQUIERE_REVISION":"COMPLETA";}
 private Version snapshot(FlightRoute r,Flight f){return new Version(r.getVersion(),r.getRecorrido(),r.getAlternativo()==null?null:r.getAlternativo().getId(),r.getAlternativo()==null?null:r.getAlternativo().getNombre(),r.getAltitudPies(),r.getDistanciaNm(),r.getTiempoEstimadoMinutos(),r.getObservaciones(),r.getCreadoPor().getUsername(),r.getCreatedAt(),Boolean.TRUE.equals(r.getEsVersionActual())&&Objects.equals(context(f),r.getContexto()));}
 private boolean mutable(Flight f){return f.getEstadoVuelo()!=null&&"PLANIFICADO".equals(f.getEstadoVuelo().getCodigo());}
 private boolean ready(Flight f){return f.getOrigen()!=null&&f.getDestino()!=null&&f.getFechaPlanificadaSalida()!=null&&f.getFechaPlanificadaLlegada()!=null&&f.getFechaPlanificadaLlegada().isAfter(f.getFechaPlanificadaSalida());}
 private String context(Flight f){return String.join("|",f.getOrigen()==null?"":f.getOrigen().getId().toString(),f.getDestino()==null?"":f.getDestino().getId().toString(),String.valueOf(f.getFechaPlanificadaSalida()),String.valueOf(f.getFechaPlanificadaLlegada()),f.getAircraft()==null?"":f.getAircraft().getId().toString(),f.getComandante()==null?"":f.getComandante().getId().toString());}
 private String serialize(Object o){try{return json.writeValueAsString(o);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 private ApiException missing(String name){return new ApiException(HttpStatus.NOT_FOUND,name+" inexistente");}
}
