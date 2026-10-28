package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tripulación adicional al comandante. Las operaciones toman el bloqueo del vuelo y, ordenados, el de cada persona involucrada,
 * de modo que dos solicitudes simultáneas sobre la misma persona se serializan y la segunda ve el compromiso de la primera.
 * Retirar o reemplazar no borra la fila: registra la baja (quién, cuándo, por qué) y conserva la participación como historial.
 */
@Service
public class CrewManagementService {
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users;
 private final CrewRoleRepository roles; private final CrewQualificationRepository qualifications; private final AuditService audit; private final ProfessionalCredentialService credentials; private final NotificationService notifications; private final Clock clock;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private CommanderReportAccessService commanderAccess;
 /** Función de tripulación y lo que la elegibilidad exige para cumplirla (única fuente de esos requisitos: la usa evaluateOn y el catálogo que ve la interfaz). */
 public record RoleRule(String codigo,String asignacion,boolean requiereClasificacion,boolean requiereHabilitacionVerificada,boolean requiereLicencia,boolean requiereRolAcceso){}
 public static final Map<String,RoleRule> RULES;
 static{Map<String,RoleRule> m=new LinkedHashMap<>();
  m.put("COMANDANTE",new RoleRule("COMANDANTE","RECURSOS",true,true,true,true));m.put("COPILOTO",new RoleRule("COPILOTO","TRIPULACION",true,true,false,false));
  m.put("MEDICO",new RoleRule("MEDICO","TRIPULACION",true,true,false,false));m.put("ENFERMERO",new RoleRule("ENFERMERO","TRIPULACION",true,true,false,false));RULES=Collections.unmodifiableMap(m);}
 public record Eligibility(boolean eligible,String code,String message,java.time.LocalDate expires) {
  public ApiException conflict(Long userId,String role){return new ApiException(HttpStatus.CONFLICT,code,message,Map.of("userId",userId,"crewRoleCode",role));}
 }
 private Eligibility denied(String code,String message){return new Eligibility(false,code,message,null);}
 /** Una misma decisión se usa al seleccionar, asignar, replanificar, consultar e iniciar. */
 public Eligibility evaluate(Flight flight,User member,String code,boolean availability){
  return evaluateOn(flight,member,code,flight.getFechaPlanificadaSalida()==null?null:flight.getFechaPlanificadaSalida().toLocalDate(),availability);
 }
 public Eligibility evaluateOn(Flight flight,User member,String code,java.time.LocalDate on,boolean availability){return evaluateOn(flight,member,code,on,availability,null);}
 /** {@code aircraft} sustituye a la del vuelo cuando la operación que se evalúa la está cambiando (asignación de recursos, cambio de aeronave). */
 public Eligibility evaluateOn(Flight flight,User member,String code,java.time.LocalDate on,boolean availability,com.vuelossanitarios.backend.domain.catalog.Aircraft aircraft){
  if(!active(member))return denied("CUENTA_INACTIVA","La cuenta del tripulante no está activa");
  if(!qualifications.existsByUserIdAndRoleCodigo(member.getId(),code))return denied("CLASIFICACION_INCOMPATIBLE","Falta la clasificación administrativa para esta función");
  if("COMANDANTE".equals(code)){
   var profile=member.getPerson()==null?null:member.getPerson().getCommanderProfile();
   if(profile==null||profile.getLicenseNumber()==null||profile.getLicenseNumber().isBlank()||member.getUserRoles().stream().noneMatch(r->"COMANDANTE".equals(r.getRole().getCodigo())))return denied("PERFIL_COMANDANTE_INCOMPLETO","El comandante requiere rol de acceso y licencia registrada");
   if(commanderAccess!=null&&commanderAccess.isBlocked(member.getId()))return denied("INFORME_FINAL_VENCIDO","El comandante tiene informes finales vencidos");
  }
  var credential=credentials.assess(member,code,on,context(flight,aircraft));
  if(!credential.eligible())return new Eligibility(false,credential.code(),credential.message(),credential.expires());
  if(availability&&flight.getId()!=null){Optional<Flight> clash=conflictingFlight(flight,member);if(clash.isPresent())return denied("CONFLICTO_ASIGNACION","Tiene el vuelo "+clash.get().getCodigo()+" comprometido en un horario incompatible");}
  return new Eligibility(true,credential.code(),credential.message(),credential.expires());
 }
 /** Contexto operativo de la política de suficiencia: tipo de vuelo y categoría de la aeronave. Sin vuelo la consulta es informativa. */
 static CredentialSufficiency.Context context(Flight flight,com.vuelossanitarios.backend.domain.catalog.Aircraft aircraft){
  if(flight==null)return CredentialSufficiency.Context.ANY;
  var plane=aircraft!=null?aircraft:flight.getAircraft();
  return CredentialSufficiency.Context.of(flight.getTipoVuelo()==null?null:flight.getTipoVuelo().getCodigo(),plane==null?null:plane.getTipo());
 }
 public CrewManagementService(FlightRepository f,FlightCrewRepository c,UserRepository u,CrewRoleRepository r,CrewQualificationRepository q,AuditService a,ProfessionalCredentialService p,NotificationService n,Clock clock){flights=f;crews=c;users=u;roles=r;qualifications=q;audit=a;credentials=p;notifications=n;this.clock=clock;}
 private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}
 private ApiException conflict(String s){return new ApiException(HttpStatus.CONFLICT,s);}
 private User lockUser(Long id){return users.lockById(id).orElseThrow(()->bad("Usuario inexistente"));}
 private Flight lockFlight(Long id){return flights.lockById(id).orElseThrow(()->bad("Vuelo inexistente"));}
 private CrewRole role(String code){if(code==null||!RULES.containsKey(code))throw bad("La función indicada no admite clasificación administrativa");return roles.findByCodigo(code).orElseThrow(()->bad("Función inexistente"));}
 private void mutable(Flight f){if(f.getEstadoVuelo()==null||!FlightStates.MUTABLE_BEFORE_START.contains(f.getEstadoVuelo().getCodigo()))throw bad("El estado del vuelo no permite modificar la tripulación");}
 private void interval(Flight f){if(f.getFechaPlanificadaSalida()==null||f.getFechaPlanificadaLlegada()==null||!f.getFechaPlanificadaLlegada().isAfter(f.getFechaPlanificadaSalida()))throw bad("El vuelo requiere salida y llegada válidas para asignar tripulación");}
 private boolean committed(Flight f){return f.getEstadoVuelo()==null||!FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo());}
 /** Un vuelo sanitario recién aprobado tiene salida pero todavía no llegada: ocupa al menos su instante de salida (misma regla que la disponibilidad de aeronaves). Sin salida no hay base para un conflicto. */
 private boolean overlaps(Flight a,Flight b){
  if(b.getFechaPlanificadaSalida()==null||b.getFechaPlanificadaLlegada()==null||!b.getFechaPlanificadaLlegada().isAfter(b.getFechaPlanificadaSalida()))return true;
  LocalDateTime start=a.getFechaPlanificadaSalida();if(start==null)return false;
  LocalDateTime end=a.getFechaPlanificadaLlegada()!=null&&a.getFechaPlanificadaLlegada().isAfter(start)?a.getFechaPlanificadaLlegada():start.plusMinutes(1);
  return start.isBefore(b.getFechaPlanificadaLlegada())&&b.getFechaPlanificadaSalida().isBefore(end);
 }
 /** Primer vuelo comprometido de la persona que se superpone con f (o no tiene horario completo); vacío si está disponible. */
 private Optional<Flight> conflictingFlight(Flight f,User u){
  for(FlightCrew c:crews.findByUserIdAndFechaBajaIsNull(u.getId())){Flight other=c.getFlight();if(!Objects.equals(other.getId(),f.getId())&&committed(other)&&overlaps(f,other))return Optional.of(other);}
  for(Flight other:flights.findByComandanteId(u.getId()))if(!Objects.equals(other.getId(),f.getId())&&committed(other)&&overlaps(f,other))return Optional.of(other);
  return Optional.empty();
 }
 private boolean active(User u){return Boolean.TRUE.equals(u.getActivo())&&"ACTIVO".equals(u.getEstadoCuenta());}
 private String snapshot(FlightCrew c){return "{\"userId\":"+c.getUser().getId()+",\"crewRoleCode\":\""+c.getCrewRole().getCodigo()+"\"}";}
 private String removalSnapshot(FlightCrew c){return "{\"userId\":"+c.getUser().getId()+",\"crewRoleCode\":\""+c.getCrewRole().getCodigo()+"\",\"motivoBaja\":\""+c.getMotivoBaja()+"\"}";}
 /** Personas del vuelo (comandante incluido) que ocupan lugar en la aeronave. */
 private int crewSize(Flight f,FlightCrew excluded){
  int size=0;boolean commanderCounted=false;
  for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId())){if(excluded!=null&&Objects.equals(excluded.getId(),c.getId()))continue;size++;if(f.getComandante()!=null&&f.getComandante().getId().equals(c.getUser().getId()))commanderCounted=true;}
  return size+(f.getComandante()!=null&&!commanderCounted?1:0);
 }

 @Transactional(readOnly=true) public List<AvailableCrewView> available(Long id,String code){return candidates(id,code).stream().filter(CrewCandidateView::disponible).map(c->new AvailableCrewView(c.userId(),c.username(),c.nombre(),c.apellido(),c.crewRoleCode(),c.crewRoleName())).toList();}
 /** Personas habilitadas para la función, activas y que todavía no integran el vuelo, con el conflicto de disponibilidad cuando lo hay. */
 @Transactional(readOnly=true) public List<CrewCandidateView> candidates(Long id,String code){
  if("COMANDANTE".equals(code))throw bad("El comandante se asigna mediante recursos");
  Flight f=flights.findById(id).orElseThrow(()->bad("Vuelo inexistente"));mutable(f);interval(f);CrewRole role=role(code);
  return qualifications.findByRoleCodigo(code).stream().map(CrewQualification::getUser).filter(u->!crews.existsByFlightIdAndUserIdAndFechaBajaIsNull(id,u.getId())).map(u->{
   Eligibility result=evaluate(f,u,code,true);
   return new CrewCandidateView(u.getId(),u.getUsername(),u.getPerson().getNombre(),u.getPerson().getApellido(),role.getCodigo(),role.getNombre(),result.eligible(),result.eligible()?null:result.message());
  }).toList();
 }

 @Transactional public void assign(Long id,Crew request,Long actor){
  Flight f=lockFlight(id);mutable(f);interval(f);User member=lockUser(request.userId());CrewRole role=role(request.crewRoleCode());
  validate(f,member,role,null);
  User by=users.findById(actor).orElseThrow();FlightCrew c=new FlightCrew();c.setFlight(f);c.setUser(member);c.setCrewRole(role);c.setAsignadoPor(by);crews.saveAndFlush(c);
  audit.record(f,by,"FLIGHT_CREW",c.getId(),"CREATE",null,snapshot(c));
  notifications.createOnce(member,f,"CREW_ASSIGNED","Fue asignado como "+role.getNombre()+" al vuelo "+f.getCodigo()+" (salida "+f.getFechaPlanificadaSalida()+").","CREW_ASSIGNED:"+c.getId());
 }

 /** Reemplazo: la asignación anterior se da de baja (REEMPLAZO) y se crea una nueva; ambas permanecen en el historial. */
 @Transactional public void replace(Long id,Long crewId,Crew request,Long actor){
  Flight f=lockFlight(id);mutable(f);interval(f);
  FlightCrew old=crews.findById(crewId).filter(x->x.getFlight().getId().equals(id)).orElseThrow(()->bad("Asignación inexistente"));
  if(!old.isVigente())throw conflict("La asignación ya fue retirada o reemplazada; actualice la tripulación");
  if(f.getComandante()!=null&&f.getComandante().getId().equals(old.getUser().getId()))throw bad("El comandante se modifica mediante recursos");
  Set<Long> unique=new HashSet<>();unique.add(old.getUser().getId());unique.add(request.userId());List<Long> ids=new ArrayList<>(unique);Collections.sort(ids);
  Map<Long,User> locked=new HashMap<>();for(Long uid:ids)locked.put(uid,lockUser(uid));
  User member=locked.get(request.userId());CrewRole role=role(request.crewRoleCode());
  validate(f,member,role,old);
  User by=users.findById(actor).orElseThrow();String before=snapshot(old);boolean samePerson=old.getUser().getId().equals(member.getId());
  old.darDeBaja(LocalDateTime.now(clock),by,FlightCrew.BAJA_REEMPLAZO);crews.saveAndFlush(old);
  FlightCrew next=new FlightCrew();next.setFlight(f);next.setUser(member);next.setCrewRole(role);next.setAsignadoPor(by);crews.saveAndFlush(next);
  audit.record(f,by,"FLIGHT_CREW",next.getId(),"REPLACE",before,"{\"userId\":"+member.getId()+",\"crewRoleCode\":\""+role.getCodigo()+"\",\"reemplazaAsignacionId\":"+old.getId()+"}");
  if(samePerson)notifications.createOnce(member,f,"CREW_ASSIGNED","Su función en el vuelo "+f.getCodigo()+" cambió a "+role.getNombre()+".","CREW_ASSIGNED:"+next.getId());
  else{
   notifications.createOnce(old.getUser(),f,"CREW_REMOVED","Fue reemplazado en la tripulación del vuelo "+f.getCodigo()+".","CREW_REMOVED:"+old.getId());
   notifications.createOnce(member,f,"CREW_ASSIGNED","Fue asignado como "+role.getNombre()+" al vuelo "+f.getCodigo()+" (salida "+f.getFechaPlanificadaSalida()+").","CREW_ASSIGNED:"+next.getId());
  }
 }

 /** Retiro antes del inicio del vuelo: libera a la persona (deja de bloquear su disponibilidad) y conserva el registro. */
 @Transactional public void remove(Long id,Long crewId,Long actor){
  Flight f=lockFlight(id);mutable(f);
  FlightCrew c=crews.findById(crewId).filter(x->x.getFlight().getId().equals(id)).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Asignación de tripulación inexistente"));
  if(!c.isVigente())throw conflict("La asignación ya fue retirada o reemplazada; actualice la tripulación");
  if(f.getComandante()!=null&&f.getComandante().getId().equals(c.getUser().getId()))throw bad("El comandante debe cambiarse mediante la asignación de recursos del vuelo");
  lockUser(c.getUser().getId());User by=users.findById(actor).orElseThrow();String before=snapshot(c);
  c.darDeBaja(LocalDateTime.now(clock),by,FlightCrew.BAJA_RETIRO);crews.saveAndFlush(c);
  audit.record(f,by,"FLIGHT_CREW",c.getId(),"REMOVE",before,removalSnapshot(c));
  notifications.createOnce(c.getUser(),f,"CREW_REMOVED","Fue retirado de la tripulación del vuelo "+f.getCodigo()+".","CREW_REMOVED:"+c.getId());
 }

 private void validate(Flight f,User member,CrewRole role,FlightCrew existing){
  if("COMANDANTE".equals(role.getCodigo()))throw bad("El comandante se asigna mediante recursos");
  Eligibility eligibility=evaluate(f,member,role.getCodigo(),true);if(!eligibility.eligible())throw eligibility.conflict(member.getId(),role.getCodigo());
  if(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()).stream().anyMatch(c->c.getUser().getId().equals(member.getId())&&(existing==null||!c.getId().equals(existing.getId()))))throw conflict("El usuario ya integra la tripulación");
  if(f.getComandante()!=null&&f.getComandante().getId().equals(member.getId()))throw conflict("El usuario ya integra la tripulación como comandante");
  if(f.getAircraft()!=null&&f.getAircraft().getCapacidadTripulacion()!=null&&crewSize(f,existing)+1>f.getAircraft().getCapacidadTripulacion())throw conflict("La aeronave "+f.getAircraft().getMatricula()+" admite como máximo "+f.getAircraft().getCapacidadTripulacion()+" tripulantes");
  Optional<Flight> clash=conflictingFlight(f,member);if(clash.isPresent())throw conflict("El tripulante tiene otro compromiso incompatible ("+clash.get().getCodigo()+")");
 }
 /** Clasificaciones vigentes de la persona con su elegibilidad de hoy; con {@code history} también las retiradas (quién y cuándo clasificó, quién retiró y por qué). */
 @Transactional(readOnly=true) public List<QualificationView> qualifications(Long userId,boolean history){
  User u=users.findById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  return qualifications.findAllByUserId(userId).stream().filter(q->history||q.isVigente()).map(q->{
   String code=q.getRole().getCodigo();Eligibility e=q.isVigente()?evaluateOn(null,u,code,null,false):null;
   return new QualificationView(userId,code,q.getRole().getNombre(),q.isVigente(),q.getClassifier()==null?null:q.getClassifier().getUsername(),q.getClassifiedAt(),q.getRetiredBy()==null?null:q.getRetiredBy().getUsername(),q.getRetiredAt(),q.getRetireReason(),e==null?null:e.eligible(),e==null?null:e.code(),e==null?null:e.message(),e==null?null:e.expires());
  }).toList();
 }
 /** Idempotente: si la función ya está vigente no hace nada (no duplica ni reescribe quién y cuándo clasificó). Toma el bloqueo de la persona, el mismo que asignar y retirar. */
 @Transactional public void classify(Long userId,String code,Long actor){User u=lockUser(userId);CrewRole r=role(code);if(qualifications.existsByUserIdAndRoleCodigo(userId,code))return;CrewQualification q=new CrewQualification();q.setUser(u);q.setRole(r);q.setClassifier(users.findById(actor).orElseThrow());qualifications.saveAndFlush(q);audit.record(null,q.getClassifier(),"CREW_QUALIFICATION",q.getId(),"CREATE",null,"{\"userId\":"+userId+",\"crewRoleCode\":\""+code+"\"}");}
 /**
  * Retira la clasificación sin borrarla (V58): conserva quién la otorgó y cuándo, y registra quién la retiró, cuándo y por qué. Se rechaza (409) mientras la persona
  * tenga una asignación vigente en esa función en un vuelo no terminal —planificado o en curso incluido—, de modo que ningún vuelo queda sosteniéndose en una
  * clasificación inexistente. Bloquea a la persona antes de contar las asignaciones, igual que asignar (que bloquea vuelo → persona y relee la clasificación).
  */
 @Transactional public void unclassify(Long userId,String code,String reason,Long actor){
  lockUser(userId);role(code);CrewQualification q=qualifications.findByUserIdAndRoleCodigo(userId,code).orElseThrow(()->new ApiException(HttpStatus.CONFLICT,"CLASIFICACION_NO_VIGENTE","La persona no tiene esa clasificación vigente; actualice la pantalla",Map.of("userId",userId,"crewRoleCode",code)));
  List<String> inUse=new ArrayList<>();
  for(FlightCrew c:crews.findByUserIdAndFechaBajaIsNull(userId))if(code.equals(c.getCrewRole().getCodigo())&&committed(c.getFlight()))inUse.add(c.getFlight().getCodigo());
  if("COMANDANTE".equals(code))for(Flight f:flights.findByComandanteId(userId))if(committed(f)&&!inUse.contains(f.getCodigo()))inUse.add(f.getCodigo());
  if(!inUse.isEmpty())throw new ApiException(HttpStatus.CONFLICT,"CLASIFICACION_EN_USO","Retire primero las asignaciones activas de esta función ("+String.join(", ",inUse)+")",Map.of("userId",userId,"crewRoleCode",code,"vuelos",inUse));
  User by=users.findById(actor).orElseThrow();String why=reason==null||reason.isBlank()?CrewQualification.RETIRO_ADMINISTRATIVO:reason.trim();
  if(why.length()>200)throw bad("El motivo del retiro admite hasta 200 caracteres");
  String before="{\"userId\":"+userId+",\"crewRoleCode\":\""+code+"\"}";q.retire(LocalDateTime.now(clock),by,why);qualifications.saveAndFlush(q);
  audit.record(null,by,"CREW_QUALIFICATION",q.getId(),"RETIRE",before,"{\"userId\":"+userId+",\"crewRoleCode\":\""+code+"\",\"motivoBaja\":\""+why.replace("\\","\\\\").replace("\"","\\\"")+"\"}");
 }
}
