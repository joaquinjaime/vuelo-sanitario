package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AircraftDtos.*;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Administración del catálogo de aeronaves: alta, edición de datos administrativos, baja lógica / reactivación y ubicación.
 * Toda modificación toma el bloqueo de fila de la aeronave (el mismo que usa FlightService al asignarla), por lo que
 * una asignación y una baja simultáneas se serializan y sólo una gana. La disponibilidad por intervalo usa la misma consulta
 * de FlightRepository que las asignaciones de vuelos (aircraftBusyIn); aquí no existe un segundo mecanismo.
 */
@Service
public class AircraftAdminService {
 private static final ObjectMapper JSON=new ObjectMapper();
 private final AircraftRepository aircraft; private final AirportRepository airports; private final FlightRepository flights; private final FlightCrewRepository crews; private final FlightMedicalInfoRepository medical; private final UserRepository users; private final AuditEventRepository events; private final AuditService audit; private final Clock clock;
 public AircraftAdminService(AircraftRepository a,AirportRepository ap,FlightRepository f,FlightCrewRepository c,FlightMedicalInfoRepository m,UserRepository u,AuditEventRepository e,AuditService au,Clock clock){aircraft=a;airports=ap;flights=f;crews=c;medical=m;users=u;events=e;audit=au;this.clock=clock;}

 private ApiException bad(String message){return new ApiException(HttpStatus.BAD_REQUEST,message);}
 private ApiException conflict(String code,String message,Map<String,Object> details){return new ApiException(HttpStatus.CONFLICT,code,message,details);}
 private ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"Aeronave inexistente");}
 private User actor(Long id){return users.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));}
 private String plate(String raw){return raw.trim().toUpperCase(Locale.ROOT);}
 private String blank(String v){return v==null||v.isBlank()?null:v.trim();}
 private String json(Map<String,Object> values){try{return JSON.writeValueAsString(values);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 private Map<String,Object> snapshot(Aircraft x){Map<String,Object> m=new LinkedHashMap<>();m.put("matricula",x.getMatricula());m.put("modelo",x.getModelo());m.put("tipo",x.getTipo());m.put("capacidadPacientes",x.getCapacidadPacientes());m.put("capacidadTripulacion",x.getCapacidadTripulacion());m.put("equipamientoMedico",x.getEquipamientoMedico());m.put("activo",Boolean.TRUE.equals(x.getActivo()));m.put("aeropuertoActualId",x.getAeropuertoActual()==null?null:x.getAeropuertoActual().getId());return m;}
 private Aircraft locked(Long id){return aircraft.lockById(id).orElseThrow(this::notFound);}
 private Airport activeAirport(Long id){return id==null?null:airports.findById(id).filter(a->Boolean.TRUE.equals(a.getActivo())).orElse(null);}

 // ---------- Consultas ----------
 @Transactional(readOnly=true) public List<AircraftView> activeList(){return aircraft.findAllWithCurrentAirportOrderByMatricula().stream().filter(x->Boolean.TRUE.equals(x.getActivo())).map(this::view).toList();}
 @Transactional(readOnly=true) public List<AircraftAdminView> adminList(){
  Map<Long,List<Flight>> committed=flights.committedWithAircraft(FlightStates.COMMITTED).stream().collect(Collectors.groupingBy(f->f.getAircraft().getId()));
  return aircraft.findAllWithCurrentAirportOrderByMatricula().stream().map(x->adminView(x,committed.getOrDefault(x.getId(),List.of()))).toList();
 }
 @Transactional(readOnly=true) public AircraftAdminView get(Long id){Aircraft x=aircraft.findById(id).orElseThrow(this::notFound);return adminView(x,flights.activeAircraftAssignments(id,FlightStates.COMMITTED));}
 /** Vuelos que usan o usaron la aeronave, vigentes primero (por salida) y luego el historial. No incluye datos de pacientes. */
 @Transactional(readOnly=true) public List<FlightSummary> flights(Long id){aircraft.findById(id).orElseThrow(this::notFound);return flights.findByAircraftIdOrderByFechaPlanificadaSalidaDescIdDesc(id).stream().map(this::summary).toList();}
 @Transactional(readOnly=true) public List<AircraftHistoryEntry> history(Long id){aircraft.findById(id).orElseThrow(this::notFound);return events.findByEntityTypeAndEntityIdOrderByOccurredAtDesc("AIRCRAFT",id).stream().map(e->new AircraftHistoryEntry(e.getId(),e.getOperation(),e.getActor()==null?"Sistema":e.getActor().getUsername(),AuditService.toLocal(e.getOccurredAt(),clock.getZone()),e.getFlight()==null?null:e.getFlight().getId(),e.getOldValues(),e.getNewValues())).toList();}
 /** Aeronaves activas con su disponibilidad en [from, to): activa, fuera de vuelo y sin vuelos comprometidos superpuestos. */
 @Transactional(readOnly=true) public List<AircraftAvailabilityView> availability(LocalDateTime from,LocalDateTime to){
  if(from==null||to==null||!to.isAfter(from))throw bad("Indique un intervalo válido: la llegada debe ser posterior a la salida");
  List<AircraftAvailabilityView> out=new ArrayList<>();
  for(Aircraft x:aircraft.findAllWithCurrentAirportOrderByMatricula()){
   if(!Boolean.TRUE.equals(x.getActivo()))continue;
   List<Flight> inFlight=flights.activeAircraftAssignments(x.getId(),List.of("EN_CURSO"));List<Flight> busy=flights.aircraftBusyIn(x.getId(),from,to);
   Map<Long,Flight> conflicts=new LinkedHashMap<>();for(Flight f:inFlight)conflicts.put(f.getId(),f);for(Flight f:busy)conflicts.put(f.getId(),f);
   String reason=x.getAeropuertoActual()==null?"Sin ubicación registrada":!inFlight.isEmpty()?"Actualmente en vuelo":!busy.isEmpty()?"Tiene un vuelo comprometido en ese intervalo":null;
   Airport at=x.getAeropuertoActual();
   out.add(new AircraftAvailabilityView(x.getId(),x.getMatricula(),x.getModelo(),x.getTipo(),at==null?null:at.getId(),at==null?null:at.getNombre(),reason==null,reason,conflicts.values().stream().map(this::summary).toList()));
  }
  return out;
 }

 // ---------- Alta ----------
 @Transactional public AircraftAdminView create(AircraftRequest r,Long actorId){
  User by=actor(actorId);String plate=plate(r.matricula());Airport airport=activeAirport(r.aeropuertoActualId());
  if(airport==null)throw bad("Seleccione un aeropuerto actual válido");
  if(aircraft.existsByMatriculaIgnoreCase(plate))throw conflict("DUPLICATE_PLATE","Ya existe una aeronave con la matrícula "+plate,Map.of());
  Aircraft x=new Aircraft();x.setMatricula(plate);x.setModelo(r.modelo().trim());x.setTipo(r.tipo().trim());x.setCapacidadPacientes(r.capacidadPacientes());x.setCapacidadTripulacion(r.capacidadTripulacion());x.setEquipamientoMedico(blank(r.equipamientoMedico()));x.setActivo(r.activo()==null||r.activo());x.setAeropuertoActual(airport);
  try{aircraft.saveAndFlush(x);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_PLATE","Ya existe una aeronave con la matrícula "+plate,Map.of());}
  audit.record(null,by,"AIRCRAFT",x.getId(),"CREATE",null,json(snapshot(x)));
  return adminView(x,List.of());
 }

 // ---------- Edición de datos administrativos ----------
 @Transactional public AircraftAdminView update(Long id,AircraftUpdateRequest r,Long actorId){
  User by=actor(actorId);Aircraft x=locked(id);
  if(r.activo()!=null&&r.activo()!=Boolean.TRUE.equals(x.getActivo()))throw bad("El estado activo/inactivo se modifica con su propia operación");
  if(r.aeropuertoActualId()!=null&&(x.getAeropuertoActual()==null||!x.getAeropuertoActual().getId().equals(r.aeropuertoActualId())))throw bad("La ubicación se modifica con su propia operación");
  List<Flight> committed=flights.activeAircraftAssignments(id,FlightStates.COMMITTED);
  if(committed.stream().anyMatch(f->"EN_CURSO".equals(f.getEstadoVuelo().getCodigo())))throw conflict("AIRCRAFT_IN_FLIGHT","La aeronave está en vuelo: sus datos no pueden modificarse hasta que finalice",Map.of("vuelos",codes(committed)));
  String plate=plate(r.matricula());
  if(!plate.equalsIgnoreCase(x.getMatricula())&&aircraft.existsByMatriculaIgnoreCaseAndIdNot(plate,id))throw conflict("DUPLICATE_PLATE","Ya existe una aeronave con la matrícula "+plate,Map.of());
  String equipment=blank(r.equipamientoMedico());
  assertCapacityConsistent(x,r.capacidadTripulacion(),equipment,committed);
  Map<String,Object> before=snapshot(x);
  x.setMatricula(plate);x.setModelo(r.modelo().trim());x.setTipo(r.tipo().trim());x.setCapacidadPacientes(r.capacidadPacientes());x.setCapacidadTripulacion(r.capacidadTripulacion());x.setEquipamientoMedico(equipment);
  Map<String,Object> after=snapshot(x);
  if(before.equals(after))return adminView(x,committed);
  try{aircraft.saveAndFlush(x);}catch(DataIntegrityViolationException e){throw conflict("DUPLICATE_PLATE","Ya existe una aeronave con la matrícula "+plate,Map.of());}
  audit.record(null,by,"AIRCRAFT",x.getId(),"UPDATE",json(before),json(after));
  return adminView(x,committed);
 }
 /** La capacidad y el equipamiento no pueden contradecir los vuelos que ya usan la aeronave. */
 private void assertCapacityConsistent(Aircraft x,short newCrewCapacity,String newEquipment,List<Flight> committed){
  if(committed.isEmpty())return;
  Map<Long,Long> crewByFlight=crews.activeCrewOfAircraftFlights(x.getId(),FlightStates.COMMITTED).stream().collect(Collectors.groupingBy(c->c.getFlight().getId(),Collectors.counting()));
  List<String> tooBig=committed.stream().filter(f->crewByFlight.getOrDefault(f.getId(),0L)>newCrewCapacity).map(Flight::getCodigo).toList();
  if(!tooBig.isEmpty())throw conflict("AIRCRAFT_CAPACITY_CONFLICT","La capacidad de tripulación indicada es menor que la tripulación ya asignada en: "+String.join(", ",tooBig),Map.of("vuelos",tooBig));
  if(newEquipment==null&&x.getEquipamientoMedico()!=null&&!x.getEquipamientoMedico().isBlank()){
   List<String> needing=committed.stream().filter(f->f.getSanitario()!=null&&medical.findByFlightId(f.getId()).map(m->Boolean.TRUE.equals(m.getRequiereEquipamientoEspecial())).orElse(false)).map(Flight::getCodigo).toList();
   if(!needing.isEmpty())throw conflict("AIRCRAFT_EQUIPMENT_CONFLICT","No puede quitarse el equipamiento médico: hay vuelos asignados que requieren equipamiento especial: "+String.join(", ",needing),Map.of("vuelos",needing));
  }
 }

 // ---------- Baja lógica / reactivación ----------
 @Transactional public AircraftAdminView setActive(Long id,boolean active,String reason,Long actorId){
  User by=actor(actorId);Aircraft x=locked(id);boolean current=Boolean.TRUE.equals(x.getActivo());
  if(active==current)throw conflict(active?"AIRCRAFT_ALREADY_ACTIVE":"AIRCRAFT_ALREADY_INACTIVE",active?"La aeronave ya está activa":"La aeronave ya está desactivada",Map.of());
  List<Flight> committed=flights.activeAircraftAssignments(id,FlightStates.COMMITTED);
  if(!active){
   if(committed.stream().anyMatch(f->"EN_CURSO".equals(f.getEstadoVuelo().getCodigo())))throw conflict("AIRCRAFT_IN_FLIGHT","La aeronave participa en un vuelo en curso y no puede desactivarse",Map.of("vuelos",codes(committed)));
   if(!committed.isEmpty())throw conflict("AIRCRAFT_HAS_ASSIGNMENTS","La aeronave tiene vuelos asignados ("+String.join(", ",codes(committed))+"). Operaciones debe cambiar la aeronave o cancelar esos vuelos antes de desactivarla",Map.of("vuelos",codes(committed)));
  }else{
   if(x.getAeropuertoActual()==null||!Boolean.TRUE.equals(x.getAeropuertoActual().getActivo()))throw conflict("AIRCRAFT_WITHOUT_LOCATION","Asigne una ubicación en un aeropuerto activo antes de reactivar la aeronave",Map.of());
  }
  x.setActivo(active);
  Map<String,Object> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();before.put("activo",current);after.put("activo",active);after.put("motivo",blank(reason));
  audit.record(null,by,"AIRCRAFT",x.getId(),"SET_ACTIVE",json(before),json(after));
  return adminView(x,committed);
 }

 // ---------- Ubicación (cambio administrativo; el automático al finalizar un vuelo lo realiza FlightService.finish) ----------
 @Transactional public AircraftAdminView move(Long id,Long airportId,String reason,Long actorId){
  User by=actor(actorId);Aircraft x=locked(id);Airport target=activeAirport(airportId);
  if(target==null)throw bad("Seleccione un aeropuerto válido");
  Airport old=x.getAeropuertoActual();
  if(old!=null&&old.getId().equals(target.getId()))throw bad("La aeronave ya se encuentra en ese aeropuerto");
  List<Flight> committed=flights.activeAircraftAssignments(id,FlightStates.COMMITTED);
  if(committed.stream().anyMatch(f->"EN_CURSO".equals(f.getEstadoVuelo().getCodigo())))throw conflict("AIRCRAFT_IN_FLIGHT","La aeronave está en vuelo: su ubicación se actualiza al finalizar el vuelo",Map.of("vuelos",codes(committed)));
  List<String> contradicted=new ArrayList<>();for(Flight f:committed)if(contradicts(f,target))contradicted.add(f.getCodigo());
  if(!contradicted.isEmpty())throw conflict("AIRCRAFT_LOCATION_CONFLICT","El cambio contradice vuelos ya asignados a la aeronave ("+String.join(", ",contradicted)+"). Cambie la aeronave de esos vuelos o cancélelos primero",Map.of("vuelos",contradicted));
  x.setAeropuertoActual(target);
  Map<String,Object> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
  before.put("aeropuertoActualId",old==null?null:old.getId());before.put("aeropuertoActual",old==null?null:old.getNombre());
  after.put("aeropuertoActualId",target.getId());after.put("aeropuertoActual",target.getNombre());after.put("motivo",blank(reason));after.put("fecha",LocalDateTime.now(clock).toString());
  audit.record(null,by,"AIRCRAFT",x.getId(),"MANUAL_LOCATION_CHANGE",json(before),json(after));
  return adminView(x,committed);
 }
 /** Un vuelo comprometido exige que la aeronave siga en su origen planificado (o, sin origen, en la provincia solicitada). */
 private boolean contradicts(Flight f,Airport target){
  if(f.getOrigen()!=null)return !f.getOrigen().getId().equals(target.getId());
  SanitaryFlight s=f.getSanitario();
  if(s!=null&&s.getLocalidadOrigenSolicitada()!=null&&s.getLocalidadOrigenSolicitada().getProvincia()!=null)return target.getProvinciaReferencial()==null||!target.getProvinciaReferencial().getId().equals(s.getLocalidadOrigenSolicitada().getProvincia().getId());
  return false;
 }

 // ---------- Vistas ----------
 private List<String> codes(List<Flight> list){return list.stream().map(Flight::getCodigo).toList();}
 private AircraftView view(Aircraft x){Airport a=x.getAeropuertoActual();return new AircraftView(x.getId(),x.getMatricula(),x.getModelo(),x.getTipo(),x.getCapacidadPacientes(),x.getCapacidadTripulacion(),x.getEquipamientoMedico(),Boolean.TRUE.equals(x.getActivo()),a==null?null:a.getId(),a==null?null:a.getNombre());}
 private AircraftAdminView adminView(Aircraft x,List<Flight> committed){
  Airport a=x.getAeropuertoActual();boolean active=Boolean.TRUE.equals(x.getActivo());boolean inFlight=committed.stream().anyMatch(f->"EN_CURSO".equals(f.getEstadoVuelo().getCodigo()));
  String state=!active?"DESACTIVADA":inFlight?"EN_VUELO":!committed.isEmpty()?"ASIGNADA":"SIN_ASIGNACIONES";
  FlightSummary next=committed.stream().sorted(Comparator.comparing(Flight::getFechaPlanificadaSalida,Comparator.nullsLast(Comparator.naturalOrder()))).findFirst().map(this::summary).orElse(null);
  return new AircraftAdminView(x.getId(),x.getMatricula(),x.getModelo(),x.getTipo(),x.getCapacidadPacientes(),x.getCapacidadTripulacion(),x.getEquipamientoMedico(),active,a==null?null:a.getId(),a==null?null:a.getNombre(),x.getCreatedAt(),state,inFlight,committed.size(),next);
 }
 private FlightSummary summary(Flight f){return new FlightSummary(f.getId(),f.getCodigo(),f.getTipoVuelo().getCodigo(),f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo(),f.getFechaPlanificadaSalida(),f.getFechaPlanificadaLlegada(),f.getOrigen()==null?null:f.getOrigen().getNombre(),f.getDestino()==null?null:f.getDestino().getNombre());}
}
