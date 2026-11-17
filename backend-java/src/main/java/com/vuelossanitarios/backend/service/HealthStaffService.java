package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.HealthStaffDtos.*;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Personal sanitario (médicos y enfermeros) de cada DTS. Son registros administrativos de personas, no usuarios: no tienen cuenta, contraseña, rol ni sesión, y la
 * aplicación no certifica su matrícula. Sólo el DTS que los registró los ve o modifica; sólo el DTS solicitante del vuelo los asocia a él, una vez que el horario está
 * acordado y hasta que el vuelo inicia. Retirar o sustituir no borra la participación: la da de baja y la conserva como historial.
 */
@Service
public class HealthStaffService {
 private final HealthStaffRepository staff; private final FlightHealthStaffRepository assignments; private final PersonRepository persons; private final UserRepository users;
 private final PatientRepository patients; private final FlightRepository flights; private final SanitaryFlightRepository sanitary; private final AuditService audit; private final FlightAuthorizationService access; private final Clock clock;
 public HealthStaffService(HealthStaffRepository s,FlightHealthStaffRepository a,PersonRepository p,UserRepository u,PatientRepository pa,FlightRepository f,SanitaryFlightRepository sf,AuditService audit,FlightAuthorizationService access,Clock clock){
  staff=s;assignments=a;persons=p;users=u;patients=pa;flights=f;sanitary=sf;this.audit=audit;this.access=access;this.clock=clock;
 }
 private ApiException bad(String m){return new ApiException(HttpStatus.BAD_REQUEST,m);}
 private ApiException conflict(String code,String m){return new ApiException(HttpStatus.CONFLICT,code,m,Map.of());}
 private ApiException forbidden(String m){return new ApiException(HttpStatus.FORBIDDEN,m);}
 // actor: Obtiene la cuenta de usuario por su identificador.
 private User actor(Long id){return users.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));}

 // ---------------------------------------------------------------- catálogo

 @Transactional(readOnly=true) public List<StaffView> list(Long dts,boolean includeInactive){
  Map<Long,Integer> open=new HashMap<>();
  // list: Obtiene el personal sanitario del listado del DTS (con su persona), incluyendo o no los inactivos, ordenado por apellido y nombre.
  List<HealthStaff> rows=staff.findByOwner(dts,includeInactive);
  // Obtiene las participaciones vigentes (sin baja) del profesional en vuelos, con el vuelo asociado, para contar las abiertas.
  for(HealthStaff h:rows)open.put(h.getId(),(int)assignments.findCurrentByStaffId(h.getId()).stream().filter(a->committed(a.getFlight())).count());
  return rows.stream().map(h->view(h,open.getOrDefault(h.getId(),0))).toList();
 }
 private StaffView view(HealthStaff h,int flightsOpen){
  Person p=h.getPerson();
  return new StaffView(h.getId(),p.getNombre(),p.getApellido(),p.getDni(),h.getType(),h.getRegistration(),h.isActive(),h.getVersion(),h.getCreatedAt(),h.getDeactivatedAt(),flightsOpen);
 }

 @Transactional public StaffView create(StaffInput in,Long dts){
  User owner=actor(dts);String dni=PersonIdentityService.canonicalDni(in.dni());
  if(dni.length()<6||dni.length()>10)throw bad("El DNI debe tener entre 6 y 10 dígitos");
  String registration=in.matricula().trim();
  // create: Obtiene y bloquea para escritura la persona registrada con el DNI informado.
  Person person=persons.findByDniForUpdate(dni).orElse(null);
  if(person!=null){
   // La identidad ya existe (como usuario, paciente u otro profesional): sólo se reutiliza si el nombre coincide; nunca se fusiona ni se corrige.
   if(!sameName(person.getNombre(),in.nombre())||!sameName(person.getApellido(),in.apellido()))throw new ApiException(HttpStatus.CONFLICT,"STAFF_IDENTITY_CONFLICT","No se pudo confirmar la identidad con los datos proporcionados; verifique el DNI, el nombre y el apellido",Map.of());
   // Busca si la persona ya figura en el listado de personal sanitario de este DTS.
   if(staff.findByOwnerIdAndPersonId(dts,person.getId()).isPresent())throw conflict("STAFF_ALREADY_REGISTERED","Esa persona ya figura en su listado de personal sanitario");
  }else{
   person=new Person();person.setNombre(in.nombre().trim());person.setApellido(in.apellido().trim());person.setDni(dni);
   // Guarda la nueva persona con su nombre, apellido y DNI, y la envía de inmediato a la base para detectar un alta simultánea.
   try{persons.saveAndFlush(person);}catch(DataIntegrityViolationException e){throw conflict("STAFF_IDENTITY_CONFLICT","No se pudo registrar la identidad (alta simultánea); reintente");}
  }
  // Verifica si el DTS ya tiene un profesional del mismo tipo con esa matrícula (sin distinguir mayúsculas).
  if(staff.registrationTaken(dts,in.tipoProfesional(),registration,null))throw conflict("STAFF_REGISTRATION_TAKEN","Ya existe un profesional de ese tipo con esa matrícula en su listado");
  HealthStaff h=new HealthStaff();h.setOwner(owner);h.setPerson(person);h.setType(in.tipoProfesional());h.setRegistration(registration);
  // Guarda el nuevo profesional sanitario del DTS y lo envía de inmediato a la base para detectar un alta simultánea.
  try{staff.saveAndFlush(h);}catch(DataIntegrityViolationException e){throw conflict("STAFF_ALREADY_REGISTERED","El profesional ya figura en su listado (alta simultánea)");}
  audit.record(null,owner,"HEALTH_STAFF",h.getId(),"CREATE",null,snapshot(h));
  return view(h,0);
 }

 @Transactional public StaffView update(Long id,StaffUpdate in,Long dts){
  HealthStaff h=owned(id,dts);User by=actor(dts);
  if(!Objects.equals(in.version(),h.getVersion()))throw conflict("STAFF_STALE","El registro cambió; actualice la pantalla antes de modificarlo");
  String before=snapshot(h);Person p=h.getPerson();String dni=PersonIdentityService.canonicalDni(in.dni());
  boolean identityChanged=!dni.equals(p.getDni())||!p.getNombre().equals(in.nombre().trim())||!p.getApellido().equals(in.apellido().trim());
  if(identityChanged){
   if(!isExclusive(p,h.getId()))throw new ApiException(HttpStatus.CONFLICT,"STAFF_IDENTITY_SHARED","Los datos personales pertenecen a una identidad que también usa otro registro del sistema; no pueden modificarse desde el personal sanitario",Map.of());
   if(dni.length()<6||dni.length()>10)throw bad("El DNI debe tener entre 6 y 10 dígitos");
   // update: Busca si otra persona ya está registrada con el nuevo DNI.
   if(!dni.equals(p.getDni())&&persons.findByDni(dni).isPresent())throw conflict("STAFF_IDENTITY_CONFLICT","Ya existe una persona registrada con ese DNI");
   // Guarda el nombre, el apellido y el DNI corregidos de la persona y los envía de inmediato a la base.
   p.setNombre(in.nombre().trim());p.setApellido(in.apellido().trim());p.setDni(dni);persons.saveAndFlush(p);
  }
  String registration=in.matricula().trim();
  // Verifica si otro profesional del DTS, del mismo tipo, ya tiene esa matrícula (sin distinguir mayúsculas).
  if(staff.registrationTaken(dts,in.tipoProfesional(),registration,h.getId()))throw conflict("STAFF_REGISTRATION_TAKEN","Ya existe un profesional de ese tipo con esa matrícula en su listado");
  // Obtiene las participaciones vigentes del profesional en vuelos para impedir el cambio de tipo si integra alguno comprometido.
  if(!in.tipoProfesional().equals(h.getType())&&assignments.findCurrentByStaffId(h.getId()).stream().anyMatch(a->committed(a.getFlight())))throw conflict("STAFF_IN_USE","No puede cambiarse el tipo de un profesional asignado a vuelos abiertos; retírelo primero de esos vuelos");
  h.setType(in.tipoProfesional());h.setRegistration(registration);
  // Guarda los datos actualizados del profesional y los envía de inmediato a la base (con control de versión optimista).
  try{staff.saveAndFlush(h);}catch(org.springframework.orm.ObjectOptimisticLockingFailureException e){throw conflict("STAFF_STALE","El registro cambió; actualice la pantalla antes de modificarlo");}
  audit.record(null,by,"HEALTH_STAFF",h.getId(),"UPDATE",before,snapshot(h));
  // Obtiene las participaciones vigentes del profesional en vuelos para contar las abiertas.
  return view(h,(int)assignments.findCurrentByStaffId(h.getId()).stream().filter(a->committed(a.getFlight())).count());
 }

 /** Desactivar lo saca del listado de selección sin tocar su participación histórica; se rechaza mientras esté asignado a un vuelo abierto. */
 @Transactional public StaffView setActive(Long id,ActiveRequest in,Long dts){
  HealthStaff h=owned(id,dts);User by=actor(dts);
  if(!Objects.equals(in.version(),h.getVersion()))throw conflict("STAFF_STALE","El registro cambió; actualice la pantalla antes de modificarlo");
  String before=snapshot(h);
  if(Boolean.TRUE.equals(in.activo())){if(!h.isActive()){h.reactivate();}}
  else if(h.isActive()){
   // setActive: Obtiene las participaciones vigentes del profesional en vuelos para impedir desactivarlo si integra alguno comprometido.
   List<String> open=assignments.findCurrentByStaffId(h.getId()).stream().filter(a->committed(a.getFlight())).map(a->a.getFlight().getCodigo()).sorted().toList();
   if(!open.isEmpty())throw new ApiException(HttpStatus.CONFLICT,"STAFF_IN_USE","Está asignado a vuelos abiertos ("+String.join(", ",open)+"); retírelo de esos vuelos antes de desactivarlo",Map.of("vuelos",open));
   h.deactivate(LocalDateTime.now(clock));
  }
  // Guarda el estado activo o inactivo del profesional y lo envía de inmediato a la base.
  staff.saveAndFlush(h);
  audit.record(null,by,"HEALTH_STAFF",h.getId(),h.isActive()?"REACTIVATE":"DEACTIVATE",before,snapshot(h));
  return view(h,0);
 }

 // ---------------------------------------------------------------- vuelos

 /** Personal sanitario del vuelo. Lo ven el DTS solicitante, Operaciones, Administración y el comandante principal; el DNI sólo lo ve el DTS. */
 @Transactional(readOnly=true) public List<FlightStaffView> forFlight(Long flightId,Long actorId,boolean history){
  // forFlight: Obtiene el vuelo por su identificador.
  Flight f=flights.findById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));access.mayRead(f,actorId);
  // Obtiene todas las participaciones del personal sanitario en el vuelo, incluidas las dadas de baja, con profesional, persona y responsables.
  // Obtiene sólo las participaciones vigentes del personal sanitario en el vuelo, con profesional, persona y quien las asignó.
  return (history?assignments.findHistoryByFlightId(flightId):assignments.findCurrentByFlightId(flightId)).stream().map(this::flightView).toList();
 }
 private FlightStaffView flightView(FlightHealthStaff a){
  HealthStaff h=a.getStaff();Person p=h.getPerson();
  return new FlightStaffView(a.getId(),h.getId(),p.getNombre(),p.getApellido(),h.getType(),h.getRegistration(),a.isCurrent(),a.getCreatedAt(),a.getAssignedBy()==null?null:a.getAssignedBy().getUsername(),a.getRemovedAt(),a.getRemovedBy()==null?null:a.getRemovedBy().getUsername(),a.getRemovalReason());
 }

 /** Profesionales activos del DTS que todavía no integran el vuelo, con el motivo cuando tienen otro compromiso en el mismo horario. */
 @Transactional(readOnly=true) public List<StaffCandidateView> candidates(Long flightId,Long dts){
  // candidates: Obtiene el vuelo por su identificador.
  Flight f=flights.findById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));requestedAndEditable(f,dts);
  List<StaffCandidateView> out=new ArrayList<>();
  // Obtiene el personal sanitario activo del listado del DTS (con su persona), ordenado por apellido y nombre.
  for(HealthStaff h:staff.findByOwner(dts,false)){
   // Verifica si el profesional ya tiene una participación vigente en el vuelo.
   if(assignments.existsByFlightIdAndStaffIdAndRemovedAtIsNull(flightId,h.getId()))continue;
   Optional<Flight> clash=clash(f,h);
   out.add(new StaffCandidateView(h.getId(),h.getPerson().getNombre(),h.getPerson().getApellido(),h.getType(),h.getRegistration(),clash.isEmpty(),clash.map(x->"Participa en el vuelo "+x.getCodigo()+" en un horario que se superpone").orElse(null)));
  }
  return out;
 }

 @Transactional public FlightStaffView assign(Long flightId,AssignStaff in,Long dts){
  // assign: Obtiene y bloquea para escritura la fila del vuelo.
  Flight f=flights.lockById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));requestedAndEditable(f,dts);
  FlightHealthStaff a=add(f,in.personalSanitarioId(),dts,null);
  return flightView(a);
 }

 /** Sustitución: la participación anterior se da de baja (REEMPLAZO) y se crea la nueva en la misma transacción. */
 @Transactional public FlightStaffView replace(Long flightId,Long assignmentId,AssignStaff in,Long dts){
  // replace: Obtiene y bloquea para escritura la fila del vuelo.
  Flight f=flights.lockById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));requestedAndEditable(f,dts);
  FlightHealthStaff old=current(f,assignmentId);
  if(old.getStaff().getId().equals(in.personalSanitarioId()))throw bad("Seleccione otro profesional para sustituir");
  FlightHealthStaff next=add(f,in.personalSanitarioId(),dts,old);
  return flightView(next);
 }

 @Transactional public void remove(Long flightId,Long assignmentId,Long dts){
  // remove: Obtiene y bloquea para escritura la fila del vuelo.
  Flight f=flights.lockById(flightId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Vuelo inexistente"));requestedAndEditable(f,dts);
  FlightHealthStaff a=current(f,assignmentId);User by=actor(dts);String before=snapshot(a);
  // Guarda la baja de la participación del profesional en el vuelo y la envía de inmediato a la base.
  a.remove(LocalDateTime.now(clock),by,FlightHealthStaff.REMOVAL);assignments.saveAndFlush(a);
  audit.record(f,by,"FLIGHT_HEALTH_STAFF",a.getId(),"REMOVE",before,snapshot(a));
 }

 private FlightHealthStaff add(Flight f,Long staffId,Long dts,FlightHealthStaff replaced){
  // add: Obtiene y bloquea para escritura la fila del profesional sanitario (luego se exige que pertenezca al DTS).
  HealthStaff h=staff.lockById(staffId).filter(x->x.getOwner().getId().equals(dts)).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"El profesional no figura en su listado"));
  if(!h.isActive())throw conflict("STAFF_INACTIVE","El profesional está desactivado; reactívelo para asignarlo");
  // Verifica si el profesional ya tiene una participación vigente en el vuelo.
  if(assignments.existsByFlightIdAndStaffIdAndRemovedAtIsNull(f.getId(),h.getId())&&(replaced==null||!replaced.getStaff().getId().equals(h.getId())))throw conflict("STAFF_DUPLICATE","El profesional ya integra la tripulación sanitaria del vuelo");
  Optional<Flight> clash=clash(f,h);
  if(clash.isPresent())throw new ApiException(HttpStatus.CONFLICT,"STAFF_TIME_CONFLICT","El profesional participa en el vuelo "+clash.get().getCodigo()+" en un horario que se superpone",Map.of("vueloCodigo",clash.get().getCodigo()));
  User by=actor(dts);String before=null;
  // Guarda la baja por reemplazo de la participación anterior y la envía de inmediato a la base.
  if(replaced!=null){before=snapshot(replaced);replaced.remove(LocalDateTime.now(clock),by,FlightHealthStaff.REPLACEMENT);assignments.saveAndFlush(replaced);}
  FlightHealthStaff a=new FlightHealthStaff();a.setFlight(f);a.setStaff(h);a.setAssignedBy(by);
  // Guarda la nueva participación del profesional en el vuelo y la envía de inmediato a la base para detectar un duplicado.
  try{assignments.saveAndFlush(a);}catch(DataIntegrityViolationException e){throw conflict("STAFF_DUPLICATE","El profesional ya integra la tripulación sanitaria del vuelo");}
  audit.record(f,by,"FLIGHT_HEALTH_STAFF",a.getId(),replaced==null?"CREATE":"REPLACE",before,snapshot(a));
  return a;
 }
 private FlightHealthStaff current(Flight f,Long assignmentId){
  // current: Obtiene la participación de personal sanitario por su identificador (luego se exige que sea del vuelo).
  FlightHealthStaff a=assignments.findById(assignmentId).filter(x->x.getFlight().getId().equals(f.getId())).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Participación inexistente"));
  if(!a.isCurrent())throw conflict("STAFF_ASSIGNMENT_CLOSED","La participación ya fue retirada o sustituida; actualice la tripulación sanitaria");
  return a;
 }

 // ---------------------------------------------------------------- reglas

 /** El vuelo es sanitario y del DTS; la solicitud tiene el horario acordado (APROBADO) y el vuelo todavía no inició. */
 private SanitaryFlight requestedAndEditable(Flight f,Long dts){
  // requestedAndEditable: Busca el registro de vuelo sanitario asociado al vuelo.
  SanitaryFlight s=sanitary.findByFlightId(f.getId()).orElseThrow(()->bad("Sólo los vuelos sanitarios admiten personal sanitario"));
  if(!s.getSolicitadoPor().getId().equals(dts))throw forbidden("Sólo el DTS que solicitó el traslado puede gestionar su personal sanitario");
  String request=s.getEstadoSolicitud()==null?null:s.getEstadoSolicitud().getCodigo(),state=f.getEstadoVuelo()==null?null:f.getEstadoVuelo().getCodigo();
  if(!"APROBADO".equals(request))throw new ApiException(HttpStatus.CONFLICT,"STAFF_FLIGHT_NOT_CONFIRMED","El personal sanitario se asigna cuando el horario del traslado está acordado (solicitud aprobada)",Map.of("estado",String.valueOf(request)));
  if(state!=null&&!"PLANIFICADO".equals(state)&&!"PENDIENTE_REPLANIFICACION".equals(state))throw new ApiException(HttpStatus.CONFLICT,"STAFF_FLIGHT_LOCKED","El vuelo ya inició o terminó: la tripulación sanitaria no puede modificarse",Map.of("estadoVuelo",state));
  return s;
 }
 private HealthStaff owned(Long id,Long dts){
  // owned: Busca el profesional sanitario por identificador dentro del listado del DTS, con su persona.
  if(staff.findOwned(id,dts).isEmpty()){
   // No se revela si el registro existe en el listado de otro DTS.
   throw new ApiException(HttpStatus.NOT_FOUND,"El profesional no figura en su listado");
  }
  // Obtiene y bloquea para escritura la fila del profesional sanitario.
  return staff.lockById(id).orElseThrow();
 }
 // committed: Busca el registro de vuelo sanitario del vuelo para conocer el estado de su solicitud.
 private boolean committed(Flight f){return f.getEstadoVuelo()==null?sanitary.findByFlightId(f.getId()).map(s->s.getEstadoSolicitud()!=null&&"APROBADO".equals(s.getEstadoSolicitud().getCodigo())).orElse(false):!FlightStates.TERMINAL.contains(f.getEstadoVuelo().getCodigo());}

 /** Otro vuelo abierto del profesional cuyo horario se superpone. Sólo hay conflicto cuando ambos vuelos tienen horario definido (salida; la llegada puede faltar). */
 private Optional<Flight> clash(Flight f,HealthStaff h){
  if(f.getFechaPlanificadaSalida()==null)return Optional.empty();
  // clash: Obtiene las participaciones vigentes del profesional en vuelos, con el vuelo asociado, para detectar superposiciones horarias.
  for(FlightHealthStaff a:assignments.findCurrentByStaffId(h.getId())){
   Flight other=a.getFlight();if(other.getId().equals(f.getId())||!committed(other)||other.getFechaPlanificadaSalida()==null)continue;
   if(overlaps(f,other))return Optional.of(other);
  }
  return Optional.empty();
 }
 private static LocalDateTime end(Flight f){LocalDateTime s=f.getFechaPlanificadaSalida(),e=f.getFechaPlanificadaLlegada();return e!=null&&e.isAfter(s)?e:s.plusMinutes(1);}
 static boolean overlaps(Flight a,Flight b){return a.getFechaPlanificadaSalida().isBefore(end(b))&&b.getFechaPlanificadaSalida().isBefore(end(a));}

 /** La identidad sólo es editable desde este catálogo si ninguna cuenta, paciente ni otro profesional la usan. */
 // isExclusive: Busca una cuenta de usuario asociada a la persona.
 // Busca un paciente asociado a la persona.
 // Verifica si otro registro de personal sanitario (de cualquier DTS) usa la misma persona.
 private boolean isExclusive(Person p,Long staffId){return users.findByPersonId(p.getId()).isEmpty()&&patients.findByPersonId(p.getId()).isEmpty()&&!staff.personSharedWithOtherStaff(p.getId(),staffId);}
 private static boolean sameName(String a,String b){return normalized(a).equals(normalized(b));}
 private static String normalized(String v){return Normalizer.normalize(v==null?"":v.trim(),Normalizer.Form.NFD).replaceAll("\\p{M}+","").replaceAll("\\s+"," ").toUpperCase(Locale.ROOT);}
 private String snapshot(HealthStaff h){return "{\"tipo\":\""+h.getType()+"\",\"matricula\":\""+h.getRegistration().replace("\"","")+"\",\"activo\":"+h.isActive()+"}";}
 private String snapshot(FlightHealthStaff a){return "{\"personalSanitarioId\":"+a.getStaff().getId()+",\"tipo\":\""+a.getStaff().getType()+"\""+(a.isCurrent()?"":",\"motivoBaja\":\""+a.getRemovalReason()+"\"")+"}";}
}
