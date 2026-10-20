package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.FlightDtos.*;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import com.vuelossanitarios.backend.domain.flight.*;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CrewManagementService {
 private final FlightRepository flights; private final FlightCrewRepository crews; private final UserRepository users;
 private final CrewRoleRepository roles; private final CrewQualificationRepository qualifications; private final AuditService audit; private final ProfessionalCredentialService credentials;
 public CrewManagementService(FlightRepository f,FlightCrewRepository c,UserRepository u,CrewRoleRepository r,CrewQualificationRepository q,AuditService a,ProfessionalCredentialService p){flights=f;crews=c;users=u;roles=r;qualifications=q;audit=a;credentials=p;}
 private ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}
 private ApiException conflict(String s){return new ApiException(HttpStatus.CONFLICT,s);}
 private User lockUser(Long id){return users.lockById(id).orElseThrow(()->bad("Usuario inexistente"));}
 private Flight lockFlight(Long id){return flights.lockById(id).orElseThrow(()->bad("Vuelo inexistente"));}
 private CrewRole role(String code){if(!Set.of("COMANDANTE","COPILOTO","MEDICO","ENFERMERO").contains(code))throw bad("La función indicada no admite clasificación administrativa");return roles.findByCodigo(code).orElseThrow(()->bad("Función inexistente"));}
 private void mutable(Flight f){if(f.getEstadoVuelo()==null||!Set.of("PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PLANIFICADO","PENDIENTE_REPLANIFICACION").contains(f.getEstadoVuelo().getCodigo()))throw bad("El estado del vuelo no permite modificar la tripulación");}
 private void interval(Flight f){if(f.getFechaPlanificadaSalida()==null||f.getFechaPlanificadaLlegada()==null||!f.getFechaPlanificadaLlegada().isAfter(f.getFechaPlanificadaSalida()))throw bad("El vuelo requiere salida y llegada válidas para asignar tripulación");}
 private boolean committed(Flight f){return f.getEstadoVuelo()==null||!Set.of("FINALIZADO","COMPLETADO","CANCELADO","RECHAZADO").contains(f.getEstadoVuelo().getCodigo());}
 private boolean overlaps(Flight a,Flight b){return b.getFechaPlanificadaSalida()==null||b.getFechaPlanificadaLlegada()==null||!b.getFechaPlanificadaLlegada().isAfter(b.getFechaPlanificadaSalida())||(a.getFechaPlanificadaSalida().isBefore(b.getFechaPlanificadaLlegada())&&b.getFechaPlanificadaSalida().isBefore(a.getFechaPlanificadaLlegada()));}
 private boolean available(Flight f,User u){
  for(FlightCrew c:crews.findByUserId(u.getId())){Flight other=c.getFlight();if(!Objects.equals(other.getId(),f.getId())&&committed(other)&&overlaps(f,other))return false;}
  for(Flight other:flights.findByComandanteId(u.getId()))if(!Objects.equals(other.getId(),f.getId())&&committed(other)&&overlaps(f,other))return false;
  return true;
 }
 private boolean active(User u){return Boolean.TRUE.equals(u.getActivo())&&"ACTIVO".equals(u.getEstadoCuenta());}
 private String snapshot(FlightCrew c){return "{\"userId\":"+c.getUser().getId()+",\"crewRoleCode\":\""+c.getCrewRole().getCodigo()+"\"}";}
 @Transactional(readOnly=true) public List<AvailableCrewView> available(Long id,String code){if("COMANDANTE".equals(code))throw bad("El comandante se asigna mediante recursos");Flight f=flights.findById(id).orElseThrow(()->bad("Vuelo inexistente"));mutable(f);interval(f);CrewRole role=role(code);return users.findAllWithPersonAndRoles().stream().filter(this::active).filter(u->qualified(u,code,f.getFechaPlanificadaLlegada().toLocalDate())).filter(u->!crews.existsByFlightIdAndUserId(id,u.getId())).filter(u->available(f,u)).map(u->new AvailableCrewView(u.getId(),u.getUsername(),u.getPerson().getNombre(),u.getPerson().getApellido(),role.getCodigo(),role.getNombre())).toList();}
 @Transactional public void assign(Long id,Crew request,Long actor){Flight f=lockFlight(id);mutable(f);interval(f);User member=lockUser(request.userId());CrewRole role=role(request.crewRoleCode());validate(f,member,role,null);FlightCrew c=new FlightCrew();c.setFlight(f);c.setUser(member);c.setCrewRole(role);c.setAsignadoPor(users.findById(actor).orElseThrow());crews.saveAndFlush(c);audit.record(f,c.getAsignadoPor(),"FLIGHT_CREW",c.getId(),"CREATE",null,snapshot(c));}
 @Transactional public void replace(Long id,Long crewId,Crew request,Long actor){Flight f=lockFlight(id);mutable(f);interval(f);FlightCrew c=crews.findById(crewId).filter(x->x.getFlight().getId().equals(id)).orElseThrow(()->bad("Asignación inexistente"));if(f.getComandante()!=null&&f.getComandante().getId().equals(c.getUser().getId()))throw bad("El comandante se modifica mediante recursos");Set<Long> unique=new HashSet<>();unique.add(c.getUser().getId());unique.add(request.userId());List<Long> ids=new ArrayList<>(unique);Collections.sort(ids);Map<Long,User> locked=new HashMap<>();for(Long uid:ids)locked.put(uid,lockUser(uid));User member=locked.get(request.userId());CrewRole role=role(request.crewRoleCode());validate(f,member,role,c);String before=snapshot(c);c.setUser(member);c.setCrewRole(role);c.setAsignadoPor(users.findById(actor).orElseThrow());audit.record(f,c.getAsignadoPor(),"FLIGHT_CREW",c.getId(),"UPDATE",before,snapshot(c));}
 private void validate(Flight f,User member,CrewRole role,FlightCrew existing){if("COMANDANTE".equals(role.getCodigo()))throw bad("El comandante se asigna mediante recursos");if(!active(member))throw bad("El tripulante debe tener una cuenta activa");if(!qualified(member,role.getCodigo(),f.getFechaPlanificadaLlegada().toLocalDate()))throw bad("Se requiere clasificación y habilitación profesional verificada y vigente para esta función");if(crews.findByFlightIdOrderByIdAsc(f.getId()).stream().anyMatch(c->c.getUser().getId().equals(member.getId())&&(existing==null||!c.getId().equals(existing.getId()))))throw conflict("El usuario ya integra la tripulación");if(!available(f,member))throw conflict("El tripulante tiene otro compromiso incompatible");}
 public boolean qualified(User u,String code,java.time.LocalDate date){return qualifications.existsByUserIdAndRoleCodigo(u.getId(),code)&&credentials.sufficient(u,code,date);}
 @Transactional(readOnly=true) public List<QualificationView> qualifications(Long userId){return qualifications.findByUserId(userId).stream().map(q->new QualificationView(userId,q.getRole().getCodigo(),q.getRole().getNombre())).toList();}
 @Transactional public void classify(Long userId,String code,Long actor){User u=lockUser(userId);CrewRole r=role(code);if(qualifications.existsByUserIdAndRoleCodigo(userId,code))return;CrewQualification q=new CrewQualification();q.setUser(u);q.setRole(r);q.setClassifier(users.findById(actor).orElseThrow());qualifications.saveAndFlush(q);audit.record(null,q.getClassifier(),"CREW_QUALIFICATION",q.getId(),"CREATE",null,"{\"userId\":"+userId+",\"crewRoleCode\":\""+code+"\"}");}
 @Transactional public void unclassify(Long userId,String code,Long actor){lockUser(userId);CrewQualification q=qualifications.findByUserIdAndRoleCodigo(userId,code).orElseThrow(()->bad("Clasificación inexistente"));if(crews.findByUserId(userId).stream().anyMatch(c->code.equals(c.getCrewRole().getCodigo())&&committed(c.getFlight())))throw conflict("Retire primero las asignaciones activas de esta función");audit.record(null,users.findById(actor).orElseThrow(),"CREW_QUALIFICATION",q.getId(),"DELETE","{\"userId\":"+userId+",\"crewRoleCode\":\""+code+"\"}",null);qualifications.delete(q);}
}
