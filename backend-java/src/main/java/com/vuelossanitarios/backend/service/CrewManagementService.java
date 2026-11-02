package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.CrewRequirementDtos.*;
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
 * Tripulación de vuelo de las personas con cuenta: el comandante principal y el copiloto (V66). Un copiloto no es otro tipo de usuario: es un usuario COMANDANTE asignado por
 * Centro de Operaciones a esa función en un vuelo concreto, sin clasificación, política de suficiencia ni habilitación documentada; la licencia registrada es un dato del perfil, no una
 * autorización comprobada por la aplicación. El personal sanitario (médicos y enfermeros) no es tripulación con cuenta: lo registra y asigna el DTS ({@link HealthStaffService}).
 * Las operaciones toman el bloqueo del vuelo y, ordenados, el de cada persona involucrada, de modo que dos solicitudes simultáneas sobre la misma persona se serializan y la segunda
 * ve el compromiso de la primera. Retirar o reemplazar no borra la fila: registra la baja (quién, cuándo, por qué) y conserva la participación como historial. La regla geográfica
 * (jurisdicción del aeropuerto de salida, con la ubicación prevista por el itinerario) la decide {@link FlightService} antes de invocar estas operaciones.
 */
@Service
public class CrewManagementService {
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users;
 private final CrewRoleRepository roles; private final AuditService audit; private final NotificationService notifications; private final Clock clock;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private CommanderReportAccessService commanderAccess;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private FlightHealthStaffRepository healthStaff;
 /** Función de tripulación con cuenta y lo que la elegibilidad exige para cumplirla (única fuente de esos requisitos). */
 public record RoleRule(String codigo,String asignacion,boolean requiereLicencia,boolean requiereRolAcceso,boolean requiereInformesAlDia){}
 public static final Map<String,RoleRule> RULES;
 static{Map<String,RoleRule> m=new LinkedHashMap<>();
  m.put("COMANDANTE",new RoleRule("COMANDANTE","RECURSOS",true,true,true));
  m.put("COPILOTO",new RoleRule("COPILOTO","TRIPULACION",true,true,false));
  RULES=Collections.unmodifiableMap(m);}
 public record Eligibility(boolean eligible,String code,String message) {
  public ApiException conflict(Long userId,String role){return new ApiException(HttpStatus.CONFLICT,code,message,Map.of("userId",userId,"crewRoleCode",role));}
 }
 private Eligibility denied(String code,String message){return new Eligibility(false,code,message);}
 private static final Eligibility OK=new Eligibility(true,"ELEGIBLE","Cumple las condiciones para la función");
 public CrewManagementService(FlightRepository f,FlightCrewRepository c,UserRepository u,CrewRoleRepository r,AuditService a,NotificationService n,Clock clock){flights=f;crews=c;users=u;roles=r;audit=a;notifications=n;this.clock=clock;}
 private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}
 private ApiException conflict(String s){return new ApiException(HttpStatus.CONFLICT,s);}
 private User lockUser(Long id){return users.lockById(id).orElseThrow(()->bad("Usuario inexistente"));}
 private Flight lockFlight(Long id){return flights.lockById(id).orElseThrow(()->bad("Vuelo inexistente"));}
 private CrewRole role(String code){if(code==null||!RULES.containsKey(code))throw bad("Sólo el comandante y el copiloto se asignan como tripulación con cuenta; el personal sanitario lo asigna el DTS");return roles.findByCodigo(code).orElseThrow(()->bad("Función inexistente"));}
 private void mutable(Flight f){if(f.getEstadoVuelo()!=null&&!FlightStates.MUTABLE_BEFORE_START.contains(f.getEstadoVuelo().getCodigo()))throw bad("El estado del vuelo no permite modificar la tripulación");}
 private void departureKnown(Flight f){if(f.getFechaPlanificadaSalida()==null)throw bad("El vuelo requiere una salida definida para asignar tripulación");}
 private boolean committed(Flight f){return f.getEstadoVuelo()==null||!FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo());}
 private static boolean complete(Flight f){return f.getFechaPlanificadaSalida()!=null&&f.getFechaPlanificadaLlegada()!=null&&f.getFechaPlanificadaLlegada().isAfter(f.getFechaPlanificadaSalida());}
 /** Resultado de comparar los horarios de dos vuelos de una misma persona. INDETERMINADO: falta información para descartar el conflicto, por lo que no se confirma por omisión. */
 enum Compat { COMPATIBLE, CONFLICTO, INDETERMINADO }
 record Clash(Flight other,Compat kind){}
 /**
  * Compatibilidad horaria del vuelo evaluado {@code f} con otro vuelo {@code o} de la misma persona. Con ambos intervalos completos es la superposición [salida, llegada). Si a uno le falta
  * la llegada se usa lo que sí se sabe: un vuelo sin llegada ocupa desde su salida, de modo que el otro es compatible sólo si termina antes de que ese vuelo despegue; si la salida cae
  * dentro del otro hay conflicto; y si el vuelo sin llegada podría seguir en curso (o ambos carecen de llegada) es INDETERMINADO. Sin salida en alguno tampoco hay información.
  */
 static Compat compat(Flight f,Flight o){
  LocalDateTime fs=f.getFechaPlanificadaSalida(),os=o.getFechaPlanificadaSalida();if(fs==null||os==null)return Compat.INDETERMINADO;
  boolean fc=complete(f),oc=complete(o);
  if(fc&&oc)return fs.isBefore(o.getFechaPlanificadaLlegada())&&os.isBefore(f.getFechaPlanificadaLlegada())?Compat.CONFLICTO:Compat.COMPATIBLE;
  if(fc){ // o sin llegada
   if(!os.isBefore(f.getFechaPlanificadaLlegada()))return Compat.COMPATIBLE;
   return os.isBefore(fs)?Compat.INDETERMINADO:Compat.CONFLICTO;
  }
  if(oc){ // f sin llegada
   if(!fs.isBefore(o.getFechaPlanificadaLlegada()))return Compat.COMPATIBLE;
   return fs.isBefore(os)?Compat.INDETERMINADO:Compat.CONFLICTO;
  }
  return fs.equals(os)?Compat.CONFLICTO:Compat.INDETERMINADO;
 }
 /** Primer vuelo comprometido de la persona (como comandante o como copiloto) que no es compatible con f (conflicto o indeterminado); vacío si está disponible. */
 Optional<Clash> conflictingFlight(Flight f,User u){
  Clash indeterminate=null;
  List<Flight> others=new ArrayList<>();
  for(FlightCrew c:crews.findByUserIdAndFechaBajaIsNull(u.getId()))others.add(c.getFlight());
  others.addAll(flights.findByComandanteId(u.getId()));
  for(Flight other:others){
   if(Objects.equals(other.getId(),f.getId())||!committed(other))continue;
   Compat kind=compat(f,other);
   if(kind==Compat.CONFLICTO)return Optional.of(new Clash(other,kind));
   if(kind==Compat.INDETERMINADO&&indeterminate==null)indeterminate=new Clash(other,kind);
  }
  return Optional.ofNullable(indeterminate);
 }
 private Eligibility clash(Flight f,User u){
  Optional<Clash> clash=conflictingFlight(f,u);if(clash.isEmpty())return null;
  Flight other=clash.get().other();
  if(clash.get().kind()==Compat.INDETERMINADO)return denied("HORARIO_INDETERMINADO","No puede determinarse si el vuelo "+other.getCodigo()+" (sin horario de llegada previsto) es compatible con este. Complete la planificación de ese vuelo o libere a la persona de él");
  return denied("CONFLICTO_ASIGNACION","Tiene el vuelo "+other.getCodigo()+" comprometido en un horario incompatible");
 }
 private boolean active(User u){return Boolean.TRUE.equals(u.getActivo())&&"ACTIVO".equals(u.getEstadoCuenta());}
 private static boolean commanderAccount(User u){
  var profile=u.getPerson()==null?null:u.getPerson().getCommanderProfile();
  return profile!=null&&profile.getLicenseNumber()!=null&&!profile.getLicenseNumber().isBlank()&&u.getUserRoles().stream().anyMatch(r->"COMANDANTE".equals(r.getRole().getCodigo()));
 }
 private String snapshot(FlightCrew c){return "{\"userId\":"+c.getUser().getId()+",\"crewRoleCode\":\""+c.getCrewRole().getCodigo()+"\"}";}
 private String removalSnapshot(FlightCrew c){return "{\"userId\":"+c.getUser().getId()+",\"crewRoleCode\":\""+c.getCrewRole().getCodigo()+"\",\"motivoBaja\":\""+c.getMotivoBaja()+"\"}";}
 /** Personas del vuelo (comandante, copiloto y personal sanitario) que ocupan lugar en la aeronave. */
 private int crewSize(Flight f,FlightCrew excluded){
  int size=0;boolean commanderCounted=false;
  for(FlightCrew c:crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId())){if(excluded!=null&&Objects.equals(excluded.getId(),c.getId()))continue;size++;if(f.getComandante()!=null&&f.getComandante().getId().equals(c.getUser().getId()))commanderCounted=true;}
  if(healthStaff!=null)size+=healthStaff.findCurrentByFlightId(f.getId()).size();
  return size+(f.getComandante()!=null&&!commanderCounted?1:0);
 }

 /**
  * Una misma decisión se usa al seleccionar, asignar, replanificar, consultar e iniciar. Una cuenta activa con rol COMANDANTE y licencia registrada puede ser comandante o copiloto;
  * el comandante principal, además, no debe tener informes finales vencidos. {@code availability}: también se verifica que no tenga otro vuelo (como comandante o como copiloto) en un
  * horario incompatible. Las funciones históricas (médico y enfermero con cuenta, anteriores a V66) no se reevalúan.
  */
 public Eligibility evaluate(Flight flight,User member,String code,boolean availability){
  RoleRule rule=RULES.get(code);if(rule==null)return new Eligibility(true,"HISTORICO","Función histórica: ya no se evalúa");
  if(!active(member))return denied("CUENTA_INACTIVA","La cuenta del tripulante no está activa");
  if(!commanderAccount(member))return denied("PERFIL_COMANDANTE_INCOMPLETO","Debe ser un usuario con rol COMANDANTE y licencia registrada");
  if(rule.requiereInformesAlDia()&&commanderAccess!=null&&commanderAccess.isBlocked(member.getId()))return denied("INFORME_FINAL_VENCIDO","El comandante tiene informes finales vencidos");
  if(availability&&flight!=null&&flight.getId()!=null){Eligibility clash=clash(flight,member);if(clash!=null)return clash;}
  return OK;
 }

 private static RequirementView met(String code,String title,String message){return new RequirementView(code,title,true,"CUMPLIDO",message,null,null);}
 private static RequirementView missing(String code,String title,String state,String message,String who,String procedure){return new RequirementView(code,title,false,state,message,who,procedure);}
 /**
  * Requisitos de la función evaluados sin cortar en el primero que falta (la decisión de asignar sigue siendo {@link #evaluate}; esta lista explica cada causa y quién la resuelve).
  * Con vuelo se agrega la disponibilidad; la ubicación operativa se evalúa aparte contra el aeropuerto de salida. No escribe nada.
  */
 public List<RequirementView> requirements(Flight flight,User member,String code){
  RoleRule rule=RULES.get(code);if(rule==null)throw bad("Función inexistente");
  List<RequirementView> out=new ArrayList<>();
  if(active(member))out.add(met("CUENTA_ACTIVA","Cuenta activa","La cuenta está activa"));
  else out.add(missing("CUENTA_ACTIVA","Cuenta activa","CUENTA_INACTIVA","La cuenta del tripulante no está activa","ADMINISTRADOR","Administración → Usuarios: completar la activación de la cuenta o reactivarla."));
  if(member.getUserRoles().stream().anyMatch(r->"COMANDANTE".equals(r.getRole().getCodigo())))out.add(met("ROL_ACCESO","Rol de acceso COMANDANTE","Tiene el rol de acceso COMANDANTE"));
  else out.add(missing("ROL_ACCESO","Rol de acceso COMANDANTE","ROL_AUSENTE","La cuenta no tiene el rol de acceso COMANDANTE","ADMINISTRADOR","Administración → Usuarios: asignar el rol COMANDANTE a la cuenta."));
  var profile=member.getPerson()==null?null:member.getPerson().getCommanderProfile();
  if(profile!=null&&profile.getLicenseNumber()!=null&&!profile.getLicenseNumber().isBlank())out.add(met("LICENCIA","Licencia aeronáutica registrada","Licencia "+profile.getLicenseNumber()+" (dato del perfil, no verificado por la aplicación)"));
  else out.add(missing("LICENCIA","Licencia aeronáutica registrada","LICENCIA_AUSENTE","No tiene licencia aeronáutica registrada","ADMINISTRADOR","Administración → Usuarios: completar el perfil de comandante con su número de licencia."));
  if(rule.requiereInformesAlDia()&&commanderAccess!=null){
   if(commanderAccess.isBlocked(member.getId()))out.add(missing("INFORME_FINAL","Informes finales al día","INFORME_FINAL_VENCIDO","El comandante tiene informes finales vencidos","COMANDANTE","El comandante debe presentar los informes finales vencidos y Centro de Operaciones aprobarlos."));
   else out.add(met("INFORME_FINAL","Informes finales al día","No tiene informes finales vencidos"));
  }
  if(flight!=null&&flight.getId()!=null){
   Eligibility clash=clash(flight,member);
   if(clash!=null)out.add(missing("DISPONIBILIDAD","Disponibilidad en el horario del vuelo",clash.code(),clash.message(),"OPERACIONES","Elegir otro horario, completar la planificación del otro vuelo o liberar a la persona de él."));
   else out.add(met("DISPONIBILIDAD","Disponibilidad en el horario del vuelo","Sin vuelos superpuestos"));
  }
  return out;
 }

 /** Asigna al copiloto (la ubicación ya fue decidida por quien invoca). Se bloquean vuelo y persona; el comandante del vuelo no puede ser también su copiloto. */
 @Transactional public void assign(Long id,Crew request,Long actor){
  Flight f=lockFlight(id);mutable(f);departureKnown(f);User member=lockUser(request.userId());CrewRole role=role(request.crewRoleCode());
  validate(f,member,role,null);
  User by=users.findById(actor).orElseThrow();FlightCrew c=new FlightCrew();c.setFlight(f);c.setUser(member);c.setCrewRole(role);c.setAsignadoPor(by);crews.saveAndFlush(c);
  audit.record(f,by,"FLIGHT_CREW",c.getId(),"CREATE",null,snapshot(c));
  notifications.createOnce(member,f,"CREW_ASSIGNED","Fue asignado como "+role.getNombre()+" al vuelo "+f.getCodigo()+" (salida "+f.getFechaPlanificadaSalida()+"). No recibe tareas del comandante principal.","CREW_ASSIGNED:"+c.getId());
 }

 /** Reemplazo: la asignación anterior se da de baja (REEMPLAZO) y se crea una nueva; ambas permanecen en el historial. */
 @Transactional public void replace(Long id,Long crewId,Crew request,Long actor){
  Flight f=lockFlight(id);mutable(f);departureKnown(f);
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
  if(f.getComandante()!=null&&f.getComandante().getId().equals(member.getId()))throw conflict("El usuario ya es el comandante principal del vuelo: no puede ser también su copiloto");
  if(crews.findByFlightIdAndFechaBajaIsNullOrderByIdAsc(f.getId()).stream().anyMatch(c->c.getUser().getId().equals(member.getId())&&(existing==null||!c.getId().equals(existing.getId()))))throw conflict("El usuario ya integra la tripulación");
  if(f.getAircraft()!=null&&f.getAircraft().getCapacidadTripulacion()!=null&&crewSize(f,existing)+1>f.getAircraft().getCapacidadTripulacion())throw conflict("La aeronave "+f.getAircraft().getMatricula()+" admite como máximo "+f.getAircraft().getCapacidadTripulacion()+" tripulantes");
 }
}
