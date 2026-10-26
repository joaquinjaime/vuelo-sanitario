package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.vuelossanitarios.backend.api.dto.StrictJson;
import com.vuelossanitarios.backend.api.dto.WholeNumber;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Ruta de vuelo y su revisión operativa (I-4). Una ruta es una secuencia de versiones (rutas_vuelo): cada modificación crea una versión
 * nueva y la decisión de Operaciones (aprobar o devolver) pertenece a UNA versión y al contexto operativo con que se planificó
 * (origen, destino, horarios, aeronave y comandante del vuelo). La aprobación es interna de Operaciones: no es una autorización aeronáutica.
 * <p>
 * Estados de una versión: BORRADOR → PENDIENTE_REVISION → APROBADA | DEVUELTA; REQUIERE_REVISION la deja un cambio material del vuelo sobre
 * una versión presentada o aprobada; SIN_REVISION marca las versiones que nunca recibieron decisión. Toda operación bloquea primero la fila del
 * vuelo (la misma que bloquean replanificar, cambiar la aeronave o iniciar), de modo que presentar, decidir, modificar el vuelo e iniciar se
 * serializan; la versión esperada que envía el cliente descarta decisiones sobre una versión que ya no es la vigente.
 * <p>
 * {@link #assess} es la única evaluación del estado efectivo y de la aptitud para iniciar: la usan la ficha, los listados, la aprobación y el inicio.
 * {@link #reassess} es el único punto que invalida decisiones cuando cambia el vuelo; aunque un camino lo omitiera, {@code assess} compara el
 * contexto actual con el de la versión y nunca considera vigente una aprobación obsoleta.
 */
@Service
public class FlightRouteService {
 @StrictJson public record Input(@NotNull @Min(0) @JsonDeserialize(using=WholeNumber.class) Integer version, @NotBlank @Size(max=4000) String recorrido,
   Long alternativoId, @DecimalMin("0.00") @Digits(integer=6,fraction=2) BigDecimal altitudPies,
   @DecimalMin("0.01") @Digits(integer=6,fraction=2) BigDecimal distanciaNm,
   @Min(1) @JsonDeserialize(using=WholeNumber.class) Integer tiempoEstimadoMinutos, @Size(max=4000) String observaciones,
   @Size(max=500) String motivoModificacion, Boolean presentar) {}
 @StrictJson public record Submit(@NotNull @Min(1) @JsonDeserialize(using=WholeNumber.class) Integer version) {}
 @StrictJson public record Approve(@NotNull @Min(1) @JsonDeserialize(using=WholeNumber.class) Integer version, @Size(max=1000) String comentario) {}
 @StrictJson public record Return(@NotNull @Min(1) @JsonDeserialize(using=WholeNumber.class) Integer version, @Size(max=1000) String motivo) {}
 public record Condiciones(String origen,String destino,LocalDateTime salida,LocalDateTime llegada) {}
 public record Version(Integer version,String estado,String recorrido,Long alternativoId,String alternativo,BigDecimal altitudPies,BigDecimal distanciaNm,Integer tiempoEstimadoMinutos,String observaciones,String creadoPor,LocalDateTime fechaCreacion,boolean vigente,boolean actual,
   String motivoModificacion,String presentadoPor,LocalDateTime fechaPresentacion,String revisadoPor,LocalDateTime fechaRevision,String observacionesRevision,LocalDateTime fechaInvalidacion,String causaInvalidacion,Condiciones condiciones) {}
 /** {@code aplica}: el vuelo todavía puede iniciar (está PLANIFICADO); en otros estados la condición de ruta no es relevante. */
 public record Inicio(boolean aplica,boolean permitido,String codigo,String mensaje) {}
 public record View(String estado,boolean editable,String motivo,String origen,String destino,LocalDateTime salida,LocalDateTime llegada,List<Version> versiones,
   Integer versionVigente,List<String> causas,boolean requiereMotivo,boolean puedePresentar,boolean puedeRevisar,Inicio inicio) {}
 public record Status(Long flightId,String estado,Integer version,boolean bloqueaInicio) {}
 /** Estado efectivo de la versión vigente frente al vuelo tal como está ahora; {@code codigo} es null cuando la ruta permite iniciar. */
 public record Assessment(String estado,List<String> causas,String codigo,String mensaje) { public boolean permiteIniciar(){return codigo==null;} }

 static final String SIN_PLANIFICAR="SIN_PLANIFICAR";
 private static final Set<String> PRESENTED=Set.of(FlightRoute.PENDIENTE_REVISION,FlightRoute.APROBADA,FlightRoute.DEVUELTA,FlightRoute.REQUIERE_REVISION);
 private static final Set<String> UNDECIDED=Set.of(FlightRoute.BORRADOR,FlightRoute.PENDIENTE_REVISION);
 private static final String[] CONTEXT_LABELS={"el aeropuerto de origen","el aeropuerto de destino","el horario de salida","el horario de llegada","la aeronave","el comandante asignado"};

 private final FlightRepository flights; private final FlightRouteRepository routes; private final AirportRepository airports; private final UserRepository users; private final FlightAuthorizationService access; private final AuditService audit; private final NotificationService notifications; private final ObjectMapper json; private final CommanderReportAccessService commanderAccess; private final Clock clock;
 public FlightRouteService(FlightRepository f,FlightRouteRepository r,AirportRepository a,UserRepository u,FlightAuthorizationService x,AuditService au,NotificationService n,ObjectMapper j,CommanderReportAccessService ca,Clock c){commanderAccess=ca;flights=f;routes=r;airports=a;users=u;access=x;audit=au;notifications=n;json=j;clock=c;}

 @Transactional(readOnly=true) public View get(Long id,Long actor){Flight f=flights.findById(id).orElseThrow(()->missing("Vuelo"));access.mayRead(f,actor);return view(f,actor);}
 @Transactional(readOnly=true) public List<Status> statuses(){
  Map<Long,FlightRoute> current=new HashMap<>();for(FlightRoute r:routes.findByEsVersionActualTrue())current.put(r.getFlight().getId(),r);
  return flights.findAll().stream().map(f->{FlightRoute c=current.get(f.getId());Assessment a=assess(f,c);return new Status(f.getId(),a.estado(),c==null?null:c.getVersion(),!a.permiteIniciar());}).toList();
 }

 /** El comandante asignado crea una versión nueva (BORRADOR) o, con {@code presentar}, la crea y la presenta en la misma transacción. */
 @Transactional public View save(Long id,Long actor,Input input){
  Flight f=lock(id);requireAssignedCommander(f,actor);commanderAccess.requireOperationalAccess(actor);
  requirePlanned(f,"La ruta sólo puede modificarse en un vuelo PLANIFICADO");
  if(!ready(f))throw new ApiException(HttpStatus.BAD_REQUEST,"Complete primero los aeropuertos y horarios del vuelo");
  FlightRoute old=current(id);int version=old==null?0:old.getVersion();
  if(input.version()!=version)throw stale("La ruta cambió; vuelva a cargarla antes de guardar");
  Airport alternate=null;if(input.alternativoId()!=null){alternate=airports.findById(input.alternativoId()).filter(a->Boolean.TRUE.equals(a.getActivo())).orElseThrow(()->new ApiException(HttpStatus.BAD_REQUEST,"Aeropuerto alternativo inexistente o inactivo"));if(alternate.getId().equals(f.getDestino().getId()))throw new ApiException(HttpStatus.BAD_REQUEST,"El alternativo debe ser distinto del destino");}
  String route=input.recorrido().trim(),notes=clean(input.observaciones()),state=old==null?null:old.getEstadoRevision();
  boolean unchanged=old!=null&&sameContent(old,route,alternate,input,notes)&&Objects.equals(old.getContexto(),context(f));
  if(unchanged&&Set.of(FlightRoute.BORRADOR,FlightRoute.PENDIENTE_REVISION,FlightRoute.APROBADA).contains(state))throw new ApiException(HttpStatus.BAD_REQUEST,"RUTA_SIN_CAMBIOS","La ruta no tiene cambios respecto de la versión vigente",Map.of());
  String reason=clean(input.motivoModificacion());
  if(state!=null&&PRESENTED.contains(state)&&!meaningful(reason,8))throw new ApiException(HttpStatus.BAD_REQUEST,"MOTIVO_MODIFICACION_REQUERIDO","Indique el motivo de la modificación (al menos 8 caracteres con sentido): la versión anterior ya fue presentada a Operaciones",Map.of());
  User author=user(actor);String before=old==null?null:serialize(auditView(old));
  if(old!=null){old.setEsVersionActual(false);if(UNDECIDED.contains(state))old.setEstadoRevision(FlightRoute.SIN_REVISION);routes.saveAndFlush(old);}
  FlightRoute r=new FlightRoute();r.setFlight(f);r.setVersion(version+1);r.setRecorrido(route);r.setAlternativo(alternate);r.setAltitudPies(input.altitudPies());r.setDistanciaNm(input.distanciaNm());r.setTiempoEstimadoMinutos(input.tiempoEstimadoMinutos());r.setObservaciones(notes);r.setContexto(context(f));r.setCreadoPor(author);r.setEstadoRevision(FlightRoute.BORRADOR);r.setMotivoModificacion(reason);routes.saveAndFlush(r);
  audit.record(f,author,"FLIGHT_ROUTE",r.getId(),old==null?"CREATE":"UPDATE",before,serialize(auditView(r)));
  if(Boolean.TRUE.equals(input.presentar()))present(f,r,author);
  return view(f,actor);
 }

 /** El comandante presenta a Operaciones la versión vigente (BORRADOR) sin modificarla. */
 @Transactional public View submit(Long id,Long actor,Submit input){
  Flight f=lock(id);requireAssignedCommander(f,actor);commanderAccess.requireOperationalAccess(actor);
  requirePlanned(f,"La ruta sólo puede presentarse en un vuelo PLANIFICADO");
  FlightRoute r=requireVersion(f,input.version());
  if(!FlightRoute.BORRADOR.equals(r.getEstadoRevision()))throw transition(r,"presentar");
  List<String> causes=causes(f,r);
  if(!causes.isEmpty())throw new ApiException(HttpStatus.CONFLICT,"RUTA_REQUIERE_REVISION","La ruta quedó desactualizada ("+String.join("; ",causes)+"). Guárdela nuevamente para presentarla.",details(r,FlightRoute.REQUIERE_REVISION));
  present(f,r,user(actor));return view(f,actor);
 }

 /** Operaciones aprueba la versión vigente; la aprobación queda atada a esa versión y a su contexto. */
 @Transactional public View approve(Long id,Long actor,Approve input){
  Flight f=lock(id);User reviewer=requireReviewer(f,actor);requirePlanned(f,"La ruta sólo puede revisarse en un vuelo PLANIFICADO");
  FlightRoute r=requireVersion(f,input.version());
  if(!FlightRoute.PENDIENTE_REVISION.equals(r.getEstadoRevision()))throw transition(r,"aprobar");
  requireNoSelfReview(r,reviewer);
  Assessment a=assess(f,r);if(!FlightRoute.PENDIENTE_REVISION.equals(a.estado()))throw new ApiException(HttpStatus.CONFLICT,"RUTA_REQUIERE_REVISION","La ruta ya no es consistente con el vuelo ("+String.join("; ",a.causas())+"); el comandante debe presentarla nuevamente",details(r,a.estado()));
  Airport alternate=r.getAlternativo();if(alternate!=null&&!Boolean.TRUE.equals(airports.findById(alternate.getId()).map(Airport::getActivo).orElse(false)))throw new ApiException(HttpStatus.CONFLICT,"RUTA_REQUIERE_REVISION","El aeropuerto alternativo ya no está activo; el comandante debe corregir la ruta",details(r,FlightRoute.REQUIERE_REVISION));
  decide(f,r,reviewer,FlightRoute.APROBADA,clean(input.comentario()),"APPROVE");return view(f,actor);
 }

 /** Operaciones devuelve la versión pendiente con observaciones obligatorias; el comandante la corrige creando una versión nueva. */
 @Transactional public View sendBack(Long id,Long actor,Return input){
  Flight f=lock(id);User reviewer=requireReviewer(f,actor);requirePlanned(f,"La ruta sólo puede revisarse en un vuelo PLANIFICADO");
  String reason=clean(input.motivo());
  if(!meaningful(reason,10))throw new ApiException(HttpStatus.BAD_REQUEST,"MOTIVO_DEVOLUCION_INVALIDO","El motivo de la devolución es obligatorio: describa qué debe corregirse (al menos 10 caracteres con sentido)",Map.of());
  FlightRoute r=requireVersion(f,input.version());
  if(!FlightRoute.PENDIENTE_REVISION.equals(r.getEstadoRevision()))throw transition(r,"devolver");
  requireNoSelfReview(r,reviewer);
  decide(f,r,reviewer,FlightRoute.DEVUELTA,reason,"RETURN");return view(f,actor);
 }

 /**
  * Punto único de invalidación: se invoca desde cada operación que modifica el contexto del vuelo (horarios, aeropuertos, aeronave, comandante)
  * dentro de su misma transacción. Una versión presentada o aprobada cuyo contexto ya no coincide pasa a REQUIERE_REVISION conservando
  * revisor y fecha de su decisión; los cambios administrativos (tripulación, documentos, hangar, clima, contactos) no la afectan.
  */
 @Transactional(propagation=Propagation.MANDATORY) public void reassess(Flight f,User actor){
  FlightRoute r=f.getId()==null?null:current(f.getId());
  if(r==null||!Set.of(FlightRoute.PENDIENTE_REVISION,FlightRoute.APROBADA).contains(r.getEstadoRevision()))return;
  List<String> causes=causes(f,r);if(causes.isEmpty())return;
  String before=serialize(auditView(r));
  r.setEstadoRevision(FlightRoute.REQUIERE_REVISION);r.setFechaInvalidacion(LocalDateTime.now(clock));r.setCausaInvalidacion(limit(String.join("; ",causes),500));routes.saveAndFlush(r);
  audit.record(f,actor,"FLIGHT_ROUTE",r.getId(),"INVALIDATE",before,serialize(auditView(r)));
  notifyCommander(f,r,"ROUTE_REVIEW_REQUIRED","La ruta del vuelo "+f.getCodigo()+" requiere una nueva revisión: "+r.getCausaInvalidacion(),"ROUTE_INVALIDATED:");
  notifyOperations(f,r,"ROUTE_REVIEW_REQUIRED","La ruta del vuelo "+f.getCodigo()+" dejó de ser vigente y requiere una nueva revisión.","ROUTE_INVALIDATED:");
 }

 /** Condición de inicio: la versión vigente debe estar aprobada y ser coherente con el vuelo. El vuelo ya está bloqueado por quien inicia. */
 @Transactional(propagation=Propagation.MANDATORY) public void requireApprovedForStart(Flight f){
  FlightRoute r=current(f.getId());Assessment a=assess(f,r);
  if(!a.permiteIniciar())throw new ApiException(HttpStatus.CONFLICT,a.codigo(),a.mensaje(),r==null?Map.of("rutaEstado",a.estado()):details(r,a.estado()));
 }

 /** El inicio rechazado revirtió su transacción: el rechazo se registra en una propia, sin ocultar el error original. */
 @Transactional public void auditRejectedStart(Long id,Long actor,String code,String message){
  Flight f=flights.findById(id).orElseThrow(()->missing("Vuelo"));if(!access.operationsStaff(actor))return;FlightRoute r=current(id);
  Map<String,Object> after=new LinkedHashMap<>();after.put("codigo",code);after.put("mensaje",message);after.put("version",r==null?null:r.getVersion());after.put("estado",r==null?SIN_PLANIFICAR:r.getEstadoRevision());
  audit.record(f,user(actor),"FLIGHT_ROUTE",r==null?null:r.getId(),"START_REJECTED",null,serialize(after));
 }

 /** Evaluación única del estado efectivo de la versión vigente {@code r} (null si no hay ruta) frente al vuelo {@code f}. */
 Assessment assess(Flight f,FlightRoute r){
  if(r==null)return new Assessment(SIN_PLANIFICAR,List.of(),"RUTA_NO_DEFINIDA","El vuelo no tiene una ruta definida: el comandante debe planificarla y Operaciones aprobarla antes del inicio");
  String state=r.getEstadoRevision();
  switch(state){
   case FlightRoute.BORRADOR,FlightRoute.SIN_REVISION:return new Assessment(state,List.of(),"RUTA_NO_PRESENTADA","La ruta no fue presentada a Operaciones: el comandante debe presentar la versión "+r.getVersion()+" para su revisión");
   case FlightRoute.DEVUELTA:return new Assessment(state,List.of(),"RUTA_DEVUELTA","Operaciones devolvió la ruta con observaciones: "+r.getObservacionesRevision()+". El comandante debe corregirla y presentarla nuevamente");
   case FlightRoute.REQUIERE_REVISION:{List<String> c=new ArrayList<>();if(r.getCausaInvalidacion()!=null)c.add(r.getCausaInvalidacion());return new Assessment(state,c,"RUTA_REQUIERE_REVISION","La ruta requiere una nueva revisión: "+(r.getCausaInvalidacion()==null?"cambiaron las condiciones del vuelo":r.getCausaInvalidacion()));}
   default:{
    List<String> c=causes(f,r);
    if(!c.isEmpty())return new Assessment(FlightRoute.REQUIERE_REVISION,c,"RUTA_REQUIERE_REVISION","La ruta requiere una nueva revisión: "+String.join("; ",c));
    if(FlightRoute.PENDIENTE_REVISION.equals(state))return new Assessment(state,c,"RUTA_PENDIENTE_REVISION","La ruta está pendiente de revisión de Operaciones (versión "+r.getVersion()+")");
    return new Assessment(state,c,null,null);
   }
  }
 }

 /** Qué dejó de coincidir entre el vuelo actual y las condiciones con que se planificó la versión; vacío si sigue siendo coherente. */
 List<String> causes(Flight f,FlightRoute r){
  List<String> out=new ArrayList<>();
  if(!ready(f))out.add("faltan aeropuertos u horarios válidos en el vuelo");
  else if(f.getOrigen().getId().equals(f.getDestino().getId()))out.add("el origen y el destino del vuelo coinciden");
  if(r.getAlternativo()!=null&&f.getDestino()!=null&&r.getAlternativo().getId().equals(f.getDestino().getId()))out.add("el aeropuerto alternativo coincide con el destino");
  String stored=r.getContexto(),now=context(f);
  if(stored==null)out.add("la ruta no registró las condiciones del vuelo con que se planificó");
  else if(!stored.equals(now)){
   String[] a=stored.split("\\|",-1),b=now.split("\\|",-1);
   if(a.length!=b.length)out.add("cambiaron las condiciones del vuelo");
   else for(int i=0;i<a.length;i++)if(!a[i].equals(b[i]))out.add("cambió "+CONTEXT_LABELS[i]);
  }
  return out;
 }

 private void present(Flight f,FlightRoute r,User actor){
  String before=serialize(auditView(r));
  r.setEstadoRevision(FlightRoute.PENDIENTE_REVISION);r.setPresentadoPor(actor);r.setFechaPresentacion(LocalDateTime.now(clock));routes.saveAndFlush(r);
  audit.record(f,actor,"FLIGHT_ROUTE",r.getId(),"SUBMIT",before,serialize(auditView(r)));
  notifyOperations(f,r,"ROUTE_PENDING_REVIEW","La ruta versión "+r.getVersion()+" del vuelo "+f.getCodigo()+" está pendiente de revisión.","ROUTE_SUBMITTED:");
 }
 private void decide(Flight f,FlightRoute r,User reviewer,String state,String note,String op){
  String before=serialize(auditView(r));
  r.setEstadoRevision(state);r.setRevisadoPor(reviewer);r.setFechaRevision(LocalDateTime.now(clock));r.setObservacionesRevision(note);routes.saveAndFlush(r);
  audit.record(f,reviewer,"FLIGHT_ROUTE",r.getId(),op,before,serialize(auditView(r)));
  if(FlightRoute.APROBADA.equals(state))notifyCommander(f,r,"ROUTE_APPROVED","Operaciones aprobó la ruta versión "+r.getVersion()+" del vuelo "+f.getCodigo()+".","ROUTE_APPROVED:");
  else notifyCommander(f,r,"ROUTE_RETURNED","Operaciones devolvió la ruta versión "+r.getVersion()+" del vuelo "+f.getCodigo()+": "+note,"ROUTE_RETURNED:");
 }

 /** Las rutas se notifican dentro de la misma transacción que su transición. La clave por versión evita redelivery ante reintentos. */
 private void notifyCommander(Flight f,FlightRoute r,String type,String message,String keyPrefix){
  if(f.getComandante()!=null)notifications.createOnce(f.getComandante(),f,type,message,keyPrefix+r.getId());
 }
 private void notifyOperations(Flight f,FlightRoute r,String type,String message,String keyPrefix){
  notifications.createOncePreferred(f,type,message,keyPrefix+r.getId(),List.of(),"OPERACIONES","CENTRO_OPERACIONES");
 }

 private View view(Flight f,Long actor){
  List<FlightRoute> rows=routes.findByFlightIdOrderByVersionDesc(f.getId());
  FlightRoute current=rows.stream().filter(r->Boolean.TRUE.equals(r.getEsVersionActual())).findFirst().orElse(null);
  Assessment a=assess(f,current);boolean planned=mutable(f),assigned=f.getComandante()!=null&&f.getComandante().getId().equals(actor),ops=access.operationsStaff(actor);
  boolean editable=planned&&ready(f)&&assigned;
  boolean canReview=ops&&planned&&current!=null&&FlightRoute.PENDIENTE_REVISION.equals(a.estado())&&!selfReview(f,current,actor);
  String reason=!planned?"La ruta sólo puede modificarse en estado PLANIFICADO":!ready(f)?"Complete primero los aeropuertos y horarios del vuelo":null;
  Map<Long,String> names=airportNames(rows);
  return new View(a.estado(),editable,reason,f.getOrigen()==null?null:f.getOrigen().getNombre(),f.getDestino()==null?null:f.getDestino().getNombre(),f.getFechaPlanificadaSalida(),f.getFechaPlanificadaLlegada(),
   rows.stream().map(r->snapshot(r,f,names,r==current?a:null)).toList(),current==null?null:current.getVersion(),a.causas(),
   current!=null&&PRESENTED.contains(current.getEstadoRevision()),editable&&current!=null&&FlightRoute.BORRADOR.equals(current.getEstadoRevision())&&causes(f,current).isEmpty(),canReview,
   new Inicio(planned,a.permiteIniciar(),a.codigo(),a.mensaje()));
 }
 private Version snapshot(FlightRoute r,Flight f,Map<Long,String> names,Assessment a){
  boolean actual=Boolean.TRUE.equals(r.getEsVersionActual());
  return new Version(r.getVersion(),a==null?r.getEstadoRevision():a.estado(),r.getRecorrido(),r.getAlternativo()==null?null:r.getAlternativo().getId(),r.getAlternativo()==null?null:r.getAlternativo().getNombre(),r.getAltitudPies(),r.getDistanciaNm(),r.getTiempoEstimadoMinutos(),r.getObservaciones(),r.getCreadoPor().getUsername(),r.getCreatedAt(),actual&&Objects.equals(context(f),r.getContexto()),actual,
   r.getMotivoModificacion(),r.getPresentadoPor()==null?null:r.getPresentadoPor().getUsername(),r.getFechaPresentacion(),r.getRevisadoPor()==null?null:r.getRevisadoPor().getUsername(),r.getFechaRevision(),r.getObservacionesRevision(),r.getFechaInvalidacion(),r.getCausaInvalidacion(),conditions(r.getContexto(),names));
 }
 /** Lo que se audita de una versión: contenido y estado de revisión, sin las relaciones perezosas del historial. */
 private Map<String,Object> auditView(FlightRoute r){
  Map<String,Object> m=new LinkedHashMap<>();m.put("version",r.getVersion());m.put("estado",r.getEstadoRevision());m.put("recorrido",r.getRecorrido());m.put("alternativoId",r.getAlternativo()==null?null:r.getAlternativo().getId());
  m.put("altitudPies",r.getAltitudPies());m.put("distanciaNm",r.getDistanciaNm());m.put("tiempoEstimadoMinutos",r.getTiempoEstimadoMinutos());m.put("observaciones",r.getObservaciones());
  if(r.getMotivoModificacion()!=null)m.put("motivoModificacion",r.getMotivoModificacion());
  if(r.getObservacionesRevision()!=null)m.put("observacionesRevision",r.getObservacionesRevision());
  if(r.getCausaInvalidacion()!=null)m.put("causaInvalidacion",r.getCausaInvalidacion());
  return m;
 }
 private Condiciones conditions(String context,Map<Long,String> names){
  if(context==null)return null;String[] p=context.split("\\|",-1);if(p.length!=6)return null;
  Long origin=parseId(p[0]),destination=parseId(p[1]);return new Condiciones(origin==null?null:names.get(origin),destination==null?null:names.get(destination),parseTime(p[2]),parseTime(p[3]));
 }
 private Map<Long,String> airportNames(List<FlightRoute> rows){
  Set<Long> ids=new HashSet<>();for(FlightRoute r:rows)if(r.getContexto()!=null){String[] p=r.getContexto().split("\\|",-1);if(p.length==6){Long o=parseId(p[0]),d=parseId(p[1]);if(o!=null)ids.add(o);if(d!=null)ids.add(d);}}
  return ids.isEmpty()?Map.of():airports.findAllById(ids).stream().collect(Collectors.toMap(Airport::getId,Airport::getNombre,(x,y)->x));
 }
 private Long parseId(String s){try{return s.isEmpty()?null:Long.valueOf(s);}catch(NumberFormatException e){return null;}}
 private LocalDateTime parseTime(String s){try{return LocalDateTime.parse(s);}catch(Exception e){return null;}}

 private boolean sameContent(FlightRoute old,String route,Airport alternate,Input in,String notes){
  return Objects.equals(old.getRecorrido(),route)&&Objects.equals(old.getAlternativo()==null?null:old.getAlternativo().getId(),alternate==null?null:alternate.getId())
   &&same(old.getAltitudPies(),in.altitudPies())&&same(old.getDistanciaNm(),in.distanciaNm())&&Objects.equals(old.getTiempoEstimadoMinutos(),in.tiempoEstimadoMinutos())&&Objects.equals(old.getObservaciones(),notes);
 }
 private boolean same(BigDecimal a,BigDecimal b){return a==null||b==null?a==b:a.compareTo(b)==0;}
 private FlightRoute requireVersion(Flight f,Integer expected){
  FlightRoute r=current(f.getId());if(r==null)throw new ApiException(HttpStatus.CONFLICT,"RUTA_NO_DEFINIDA","El vuelo no tiene una ruta definida",Map.of());
  if(!r.getVersion().equals(expected))throw stale("La ruta cambió: se está revisando la versión "+expected+" y la vigente es la "+r.getVersion()+". Actualice la ficha");
  return r;
 }
 private ApiException stale(String message){return new ApiException(HttpStatus.CONFLICT,"VERSION_RUTA_DESACTUALIZADA",message,Map.of());}
 private ApiException transition(FlightRoute r,String action){return new ApiException(HttpStatus.CONFLICT,"TRANSICION_RUTA_NO_PERMITIDA","No se puede "+action+" la versión "+r.getVersion()+" de la ruta en estado "+r.getEstadoRevision().replace('_',' '),details(r,r.getEstadoRevision()));}
 private Map<String,Object> details(FlightRoute r,String state){Map<String,Object> m=new LinkedHashMap<>();m.put("rutaVersion",r.getVersion());m.put("rutaEstado",state);return m;}
 /** Operaciones (no el administrador) y nunca el comandante del propio vuelo, aunque reúna ambos roles. */
 private User requireReviewer(Flight f,Long actor){
  if(!access.operationsStaff(actor))throw new ApiException(HttpStatus.FORBIDDEN,"Sólo Operaciones puede revisar rutas");
  if(f.getComandante()!=null&&f.getComandante().getId().equals(actor))throw selfReviewError();
  return user(actor);
 }
 private void requireNoSelfReview(FlightRoute r,User reviewer){
  if(r.getCreadoPor().getId().equals(reviewer.getId())||r.getPresentadoPor()!=null&&r.getPresentadoPor().getId().equals(reviewer.getId()))throw selfReviewError();
 }
 private boolean selfReview(Flight f,FlightRoute r,Long actor){return f.getComandante()!=null&&f.getComandante().getId().equals(actor)||r.getCreadoPor().getId().equals(actor)||r.getPresentadoPor()!=null&&r.getPresentadoPor().getId().equals(actor);}
 private ApiException selfReviewError(){return new ApiException(HttpStatus.FORBIDDEN,"AUTOREVISION_RUTA_NO_PERMITIDA","Quien planificó o presentó la ruta no puede revisarla",Map.of());}
 private void requireAssignedCommander(Flight f,Long actor){if(f.getComandante()==null||!f.getComandante().getId().equals(actor))throw new ApiException(HttpStatus.FORBIDDEN,"Sólo el comandante asignado puede modificar la ruta");}
 private void requirePlanned(Flight f,String message){if(!mutable(f))throw new ApiException(HttpStatus.BAD_REQUEST,message);}
 private Flight lock(Long id){return flights.lockById(id).orElseThrow(()->missing("Vuelo"));}
 private FlightRoute current(Long flightId){return routes.findByFlightIdAndEsVersionActualTrue(flightId).orElse(null);}
 private User user(Long id){return users.findById(id).orElseThrow(()->missing("Usuario"));}
 private boolean mutable(Flight f){return f.getEstadoVuelo()!=null&&"PLANIFICADO".equals(f.getEstadoVuelo().getCodigo());}
 private boolean ready(Flight f){return f.getOrigen()!=null&&f.getDestino()!=null&&f.getFechaPlanificadaSalida()!=null&&f.getFechaPlanificadaLlegada()!=null&&f.getFechaPlanificadaLlegada().isAfter(f.getFechaPlanificadaSalida());}
 /** Condiciones del vuelo que cambian el sentido de la ruta (cambios materiales); todo lo demás es administrativo y no invalida. */
 private String context(Flight f){return String.join("|",f.getOrigen()==null?"":f.getOrigen().getId().toString(),f.getDestino()==null?"":f.getDestino().getId().toString(),String.valueOf(f.getFechaPlanificadaSalida()),String.valueOf(f.getFechaPlanificadaLlegada()),f.getAircraft()==null?"":f.getAircraft().getId().toString(),f.getComandante()==null?"":f.getComandante().getId().toString());}
 /** Texto con contenido: largo mínimo, letras suficientes y no una repetición de pocos caracteres. */
 static boolean meaningful(String text,int min){
  if(text==null||text.length()<min)return false;
  long letters=text.chars().filter(Character::isLetter).count(),distinct=text.chars().filter(c->!Character.isWhitespace(c)).distinct().count();
  return letters>=Math.min(5,min)&&distinct>=4;
 }
 private String clean(String s){return s==null||s.isBlank()?null:s.trim();}
 private String limit(String s,int max){return s.length()<=max?s:s.substring(0,max-1)+"…";}
 private String serialize(Object o){try{return json.writeValueAsString(o);}catch(JsonProcessingException e){throw new IllegalStateException(e);}}
 private ApiException missing(String name){return new ApiException(HttpStatus.NOT_FOUND,name+" inexistente");}
}
