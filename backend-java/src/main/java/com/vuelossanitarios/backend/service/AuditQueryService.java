package com.vuelossanitarios.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AuditDtos.*;
import com.vuelossanitarios.backend.domain.flight.Flight;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.AuditQueryRepository;
import com.vuelossanitarios.backend.repository.AuditQueryRepository.Row;
import com.vuelossanitarios.backend.repository.AuditQueryRepository.Visibility;
import com.vuelossanitarios.backend.repository.FlightRepository;
import com.vuelossanitarios.backend.repository.UserRepository;
import com.vuelossanitarios.backend.service.AuditAccessPolicy.Audience;
import com.vuelossanitarios.backend.service.AuditSanitizer.Result;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consulta de auditoría por perfil. Los filtros, el orden y la paginación se ejecutan en SQL; la visibilidad del perfil es una
 * condición de la misma consulta (el total sólo cuenta lo visible) y los valores pasan por {@link AuditSanitizer} antes de salir.
 * Los eventos son de sólo lectura: este servicio no tiene operaciones de escritura.
 */
@Service
public class AuditQueryService {
 public static final int MAX_PAGE_SIZE=100, DEFAULT_PAGE_SIZE=20, MAX_OFFSET=10_000, MAX_ACTOR_OPTIONS=500;
 private static final Pattern CODE=Pattern.compile("[A-Za-z0-9_]{1,80}");
 private static final Pattern FRACTION=Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]+");
 private static final Set<String> USER_KEYS=Set.of("userId","comandanteId","comandanteContextoId");
 private static final Set<String> AIRCRAFT_KEYS=Set.of("aeronaveId","aeronaveContextoId");
 private static final Set<String> AIRPORT_KEYS=Set.of("origenId","destinoId","origenContextoId","aeropuertoId","aeropuertoActualId","alternativoId");
 private static final Set<String> NEEDS_PREVIOUS=Set.of("UPDATE","SET_ACTIVE","MANUAL_LOCATION_CHANGE","CHANGE_AIRCRAFT","REMOVE","DELETE");

 /** Parámetros de búsqueda ya recibidos del cliente; {@link #search} los valida. */
 public record Search(LocalDate from,LocalDate to,Long actorId,String entityType,String operation,Long flightId,Long entityId,String order,Integer page,Integer size){}

 private final AuditQueryRepository repo; private final FlightRepository flights; private final FlightAuthorizationService access; private final UserRepository users;
 private final ObjectMapper json; private final Clock clock;
 public AuditQueryService(AuditQueryRepository repo,FlightRepository flights,FlightAuthorizationService access,UserRepository users,ObjectMapper json,Clock clock){
  this.repo=repo;this.flights=flights;this.access=access;this.users=users;this.json=json;this.clock=clock;
 }

 // ---------------------------------------------------------------- consultas
 /** Auditoría global: sólo ADMINISTRADOR. */
 @Transactional(readOnly=true)
 public AuditPage global(Long viewerId,Search s){
  AuditDiagnostics.measure("authorization_and_filtering",()->requireAdministrator(viewerId));
  return page(s,viewerId,null,List.of(Audience.ADMIN));
 }

 /** Historial de un vuelo según el vínculo del usuario con él (administración, operaciones, comandante actual o DTS solicitante). */
 @Transactional(readOnly=true)
 public AuditPage byFlight(Long flightId,Long viewerId,Search s){
  Flight flight=flights.findById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));
  List<Audience> audiences=audiences(flight,viewerId);
  Search scoped=new Search(s.from(),s.to(),s.actorId(),s.entityType(),s.operation(),flightId,s.entityId(),s.order(),s.page(),s.size());
  return page(scoped,viewerId,flightId,audiences);
 }

 /** Detalle de un evento. Para quien no pueda verlo (ajeno, fuera de su perfil o inexistente) la respuesta es la misma: 404. */
 @Transactional(readOnly=true)
 public AuditEventDetail detail(Long eventId,Long viewerId){
  Row row=repo.find(eventId).orElseThrow(AuditQueryService::missingEvent);
  Audience audience;
  if(isAdministrator(viewerId))audience=Audience.ADMIN;
  else{
   if(row.flightId()==null)throw missingEvent();
   Flight flight=flights.findById(row.flightId()).orElseThrow(AuditQueryService::missingEvent);
   List<Audience> audiences;
   try{audiences=audiences(flight,viewerId);}catch(ApiException e){throw missingEvent();}
   audience=audiences.stream().filter(a->AuditAccessPolicy.allows(a,row.entityType(),row.operation())).findFirst().orElseThrow(AuditQueryService::missingEvent);
  }
  Rendered r=render(List.of(row),viewerId,audience::equals,List.of(audience)).get(0);
  return new AuditEventDetail(r.view,r.changes,r.hasPrevious,r.hasNew,r.notes,AuditSanitizer.asMap(r.before),AuditSanitizer.asMap(r.after),clock.getZone().getId());
 }

 @Transactional(readOnly=true)
 public AuditFilterOptions filterOptions(Long viewerId){
  AuditDiagnostics.measure("authorization_and_filtering",()->requireAdministrator(viewerId));
  Set<String> types=new TreeSet<>(AuditCatalog.ENTITY_TYPES.keySet());types.addAll(repo.entityTypes());
  Set<String> ops=new TreeSet<>(repo.operations());
  return new AuditFilterOptions(types.stream().map(t->new AuditOption(t,AuditCatalog.entityType(t))).sorted(Comparator.comparing(AuditOption::label)).toList(),
   ops.stream().map(o->new AuditOption(o,AuditCatalog.operation(o))).sorted(Comparator.comparing(AuditOption::label)).toList(),
   repo.actors(null,0,MAX_ACTOR_OPTIONS).stream().map(a->new AuditActorOption(a.id(),a.username(),(nz(a.firstName())+" "+nz(a.lastName())).trim(),a.active())).toList(),
   clock.getZone().getId(),MAX_PAGE_SIZE);
 }

 @Transactional(readOnly=true)
 public AuditActorPage actorOptions(Long viewerId,String query,int page,int size){
  AuditDiagnostics.measure("authorization_and_filtering",()->requireAdministrator(viewerId));
  if(page<0||size<1||size>100||(long)page*size>MAX_OFFSET)throw bad("La paginación de actores no es válida");
  String term=query==null?null:query.trim();if(term!=null&&term.length()>100)throw bad("La búsqueda supera los 100 caracteres");
  List<AuditQueryRepository.ActorRow> found=repo.actors(term,page*size,size+1);
  List<AuditActorOption> rows=found.stream().limit(size).map(a->new AuditActorOption(a.id(),a.username(),(nz(a.firstName())+" "+nz(a.lastName())).trim(),a.active())).toList();
  return new AuditActorPage(rows,page,size,found.size()>size);
 }

 // ---------------------------------------------------------------- acceso
 private static ApiException missingEvent(){return new ApiException(HttpStatus.NOT_FOUND,"Evento inexistente");}
 private User viewer(Long id){return users.findWithRolesById(id).orElseThrow(()->new ApiException(HttpStatus.FORBIDDEN,"Acceso denegado"));}
 private static Set<String> roles(User u){Set<String> r=new HashSet<>();u.getUserRoles().forEach(x->r.add(x.getRole().getCodigo()));return r;}
 private boolean isAdministrator(Long id){return roles(viewer(id)).contains("ADMINISTRADOR");}
 private void requireAdministrator(Long id){if(!isAdministrator(id))throw new ApiException(HttpStatus.FORBIDDEN,"Acceso denegado");}

 /** Perfiles con los que el usuario se vincula al vuelo. Reutiliza la regla de lectura de vuelos: sin vínculo, 403. */
 private List<Audience> audiences(Flight f,Long viewerId){
  access.mayRead(f,viewerId);
  Set<String> roles=roles(viewer(viewerId));
  boolean commander=f.getComandante()!=null&&f.getComandante().getId().equals(viewerId);
  boolean requester=f.getSanitario()!=null&&f.getSanitario().getSolicitadoPor()!=null&&f.getSanitario().getSolicitadoPor().getId().equals(viewerId);
  List<Audience> list=AuditAccessPolicy.ordered(roles.contains("ADMINISTRADOR"),roles.contains("OPERACIONES")||roles.contains("CENTRO_OPERACIONES"),commander,requester);
  if(list.isEmpty())throw new ApiException(HttpStatus.FORBIDDEN,"No tiene acceso a este vuelo");
  return list;
 }

 // ---------------------------------------------------------------- listado
 private AuditPage page(Search s,Long viewerId,Long forcedFlight,List<Audience> audiences){
  int page=s.page()==null?0:s.page(),size=s.size()==null?DEFAULT_PAGE_SIZE:s.size();
  if(page<0)throw bad("La página no puede ser negativa");
  if(size<1||size>MAX_PAGE_SIZE)throw bad("El tamaño de página debe estar entre 1 y "+MAX_PAGE_SIZE);
  if((long)page*size>MAX_OFFSET)throw bad("La consulta supera el límite de resultados navegables ("+MAX_OFFSET+"); acote la búsqueda con filtros");
  String order=s.order()==null||s.order().isBlank()?"desc":s.order().toLowerCase(Locale.ROOT);
  if(!order.equals("asc")&&!order.equals("desc"))throw bad("El orden debe ser asc o desc");
  String type=code(s.entityType(),"El tipo de entidad es inválido"),operation=code(s.operation(),"La acción es inválida");
  if(s.from()!=null&&s.to()!=null&&s.from().isAfter(s.to()))throw bad("La fecha inicial no puede ser posterior a la final");
  ZoneId zone=clock.getZone();
  // El día civil de la zona de negocio se traduce a un intervalo UTC [inicio, inicio del día siguiente): una operación a las 23:30 locales pertenece a ese día.
  LocalDateTime from=s.from()==null?null:LocalDateTime.ofInstant(s.from().atStartOfDay(zone).toInstant(),ZoneOffset.UTC);
  LocalDateTime to=s.to()==null?null:LocalDateTime.ofInstant(s.to().plusDays(1).atStartOfDay(zone).toInstant(),ZoneOffset.UTC);
  List<Visibility> visibility=audiences.contains(Audience.ADMIN)?null:audiences.stream().map(this::visibility).toList();
  AuditQueryRepository.Filter filter=new AuditQueryRepository.Filter(forcedFlight!=null?forcedFlight:s.flightId(),s.actorId(),type,operation,s.entityId(),from,to,visibility,order.equals("asc"));
  long total=AuditDiagnostics.measure("count_repository_total",()->repo.count(filter));
  List<Row> rows=total==0||(long)page*size>=total?List.of():AuditDiagnostics.measure("page_repository_total",()->repo.page(filter,page*size,size));
  List<AuditEventView> items=AuditDiagnostics.measure("transform_sanitize_and_enrich",()->render(rows,viewerId,a->true,audiences).stream().map(r->r.view).toList());
  return new AuditPage(items,total,page,size,(int)((total+size-1)/size),order,zone.getId());
 }

 private Visibility visibility(Audience a){
  Map<String,Set<String>> m=new LinkedHashMap<>();
  AuditAccessPolicy.rules(a).forEach((type,rule)->m.put(type,rule.operations()));
  return new Visibility(m);
 }
 private static ApiException bad(String m){return new ApiException(HttpStatus.BAD_REQUEST,m);}
 private static String code(String v,String message){
  if(v==null||v.isBlank())return null;
  String t=v.trim();if(!CODE.matcher(t).matches())throw bad(message);return t.toUpperCase(Locale.ROOT);
 }
 private static String nz(String v){return v==null?"":v;}

 // ---------------------------------------------------------------- armado de vistas
 private static final class Rendered {
  AuditEventView view; List<AuditChange> changes=List.of(); boolean hasPrevious,hasNew; List<String> notes=List.of(); Result before=AuditSanitizer.NONE,after=AuditSanitizer.NONE;
 }
 private record Parsed(Row row,Audience audience,Result before,Result after){}

 /** Un evento se muestra con el primer perfil del usuario que lo permite; los demás no lo ven. */
 private List<Rendered> render(List<Row> rows,Long viewerId,java.util.function.Predicate<Audience> only,List<Audience> audiences){
  List<Parsed> parsed=new ArrayList<>();
  for(Row row:rows){
   Audience a=audiences.stream().filter(x->AuditAccessPolicy.allows(x,row.entityType(),row.operation())).findFirst().orElse(null);
   if(a==null||!only.test(a))continue;
   AuditAccessPolicy.Rule rule=AuditAccessPolicy.rule(a,row.entityType());
   parsed.add(new Parsed(row,a,AuditSanitizer.flatten(json,row.oldValues(),row.entityType(),rule.fields()),AuditSanitizer.flatten(json,row.newValues(),row.entityType(),rule.fields())));
  }
  Set<Long> userIds=new HashSet<>(),aircraftIds=new HashSet<>(),airportIds=new HashSet<>(),staffIds=new HashSet<>();
  for(Parsed p:parsed){
   for(Result r:List.of(p.before,p.after))for(AuditSanitizer.Field f:r.fields()){
    String leaf=leaf(f.path());Long id=asId(f.value());if(id==null||f.masked())continue;
    if(USER_KEYS.contains(leaf))userIds.add(id);else if(AIRCRAFT_KEYS.contains(leaf))aircraftIds.add(id);else if(AIRPORT_KEYS.contains(leaf))airportIds.add(id);
   }
   if(p.audience==Audience.DTS&&p.row.actorId()!=null&&!p.row.actorId().equals(viewerId))staffIds.add(p.row.actorId());
  }
  Map<Long,String> userNames=repo.userNames(userIds),plates=repo.aircraftPlates(aircraftIds),airports=repo.airportNames(airportIds);
  Map<Long,Set<String>> staffRoles=repo.roleCodes(staffIds);
  List<Rendered> out=new ArrayList<>();
  for(Parsed p:parsed){
   Rendered r=new Rendered();r.before=p.before;r.after=p.after;
   r.changes=changes(p,userNames,plates,airports);
   r.hasPrevious=!p.before.empty();r.hasNew=!p.after.empty();
   r.notes=notes(p);
   String op=AuditCatalog.operation(p.row.operation());
   r.view=new AuditEventView(p.row.id(),p.row.occurredAt().toInstant(ZoneOffset.UTC),actor(p,viewerId,staffRoles),p.row.flightId(),p.row.flightCode(),p.row.entityType(),AuditCatalog.entityType(p.row.entityType()),
    p.row.entityId(),p.row.operation(),op,summary(op,r.changes),!r.changes.isEmpty());
   out.add(r);
  }
  return out;
 }

 private AuditActor actor(Parsed p,Long viewerId,Map<Long,Set<String>> staffRoles){
  Row row=p.row;
  if(row.actorId()==null)return new AuditActor(null,null,null,true,"Sistema (proceso automático)");
  if(p.audience==Audience.DTS){
   if(row.actorId().equals(viewerId))return new AuditActor(row.actorId(),null,null,row.actorActive(),"Usted");
   Set<String> r=staffRoles.getOrDefault(row.actorId(),Set.of());
   String label=r.contains("OPERACIONES")||r.contains("CENTRO_OPERACIONES")?"Centro de Operaciones":r.contains("COMANDANTE")?"Comandante del vuelo":"Personal autorizado";
   return new AuditActor(null,null,null,true,label);
  }
  String name=(nz(row.actorFirstName())+" "+nz(row.actorLastName())).trim();
  String shown=name.isEmpty()?nz(row.actorUsername()):name;
  return new AuditActor(row.actorId(),row.actorUsername(),name,row.actorActive(),row.actorActive()?shown:shown+" (usuario desactivado)");
 }

 private List<AuditChange> changes(Parsed p,Map<Long,String> users,Map<Long,String> plates,Map<Long,String> airports){
  Map<String,AuditSanitizer.Field> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
  p.before.fields().forEach(f->before.put(f.path(),f));p.after.fields().forEach(f->after.put(f.path(),f));
  Set<String> paths=new LinkedHashSet<>(after.keySet());paths.addAll(before.keySet());
  List<AuditChange> out=new ArrayList<>();
  for(String path:paths){
   AuditSanitizer.Field b=before.get(path),a=after.get(path);
   String bs=b==null?null:display(path,b,users,plates,airports),as=a==null?null:display(path,a,users,plates,airports);
   boolean masked=(b!=null&&b.masked())||(a!=null&&a.masked());
   out.add(new AuditChange(path,AuditCatalog.field(path),bs,as,!Objects.equals(bs,as)||b==null||a==null,masked));
  }
  return out;
 }

 private String display(String path,AuditSanitizer.Field f,Map<Long,String> users,Map<Long,String> plates,Map<Long,String> airports){
  Object v=f.value();if(v==null)return null;
  if(v instanceof Boolean b)return b?"Sí":"No";
  if(f.masked())return String.valueOf(v);
  if(v instanceof String s&&FRACTION.matcher(s).matches())return s.substring(0,19);
  Long id=asId(v);String leaf=leaf(path);
  if(id!=null){
   Map<Long,String> source=USER_KEYS.contains(leaf)?users:AIRCRAFT_KEYS.contains(leaf)?plates:AIRPORT_KEYS.contains(leaf)?airports:null;
   if(source!=null)return source.containsKey(id)?source.get(id)+" (#"+id+")":"#"+id;
  }
  return String.valueOf(v);
 }

 private List<String> notes(Parsed p){
  List<String> n=new ArrayList<>();
  if(p.before.unreadable()||p.after.unreadable())n.add("Los valores registrados no tienen un formato legible; sólo se conserva el hecho.");
  else if(p.before.empty()&&p.after.empty()&&!p.before.dropped()&&!p.after.dropped())n.add("Este evento no registró valores asociados: sólo se conserva el hecho, quién lo realizó y cuándo.");
  else if(p.before.empty()&&!p.after.empty()&&NEEDS_PREVIOUS.contains(p.row.operation())&&!p.before.dropped())n.add("No se registró el valor anterior de este cambio; no es posible reconstruirlo.");
  if(p.before.dropped()||p.after.dropped())n.add("Algunos datos internos del evento no se muestran para su perfil.");
  if(p.before.anyMasked()||p.after.anyMasked())n.add("Se ocultaron o enmascararon datos sensibles.");
  if(p.before.truncated()||p.after.truncated())n.add("Se acortaron valores demasiado extensos; el detalle completo no se expone.");
  return n;
 }

 private static String summary(String operationLabel,List<AuditChange> changes){
  List<String> parts=new ArrayList<>();
  for(AuditChange c:changes){
   if(!c.changed()||parts.size()==3||c.after()==null&&c.before()==null)continue;
   parts.add(c.before()!=null&&c.after()!=null?c.label()+": "+c.before()+" → "+c.after():c.label()+": "+(c.after()!=null?c.after():c.before()));
  }
  String s=parts.isEmpty()?operationLabel:operationLabel+" — "+String.join("; ",parts);
  return s.length()>300?s.substring(0,299)+"…":s;
 }
 private static String leaf(String path){int i=path.lastIndexOf('.');return i<0?path:path.substring(i+1);}
 private static Long asId(Object v){
  if(v instanceof Long l)return l;
  if(v instanceof String s&&s.length()<=18&&!s.isEmpty()&&s.chars().allMatch(Character::isDigit))return Long.parseLong(s);
  return null;
 }
}
