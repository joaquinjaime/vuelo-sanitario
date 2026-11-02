package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.CommanderLocationDtos.*;
import com.vuelossanitarios.backend.domain.catalog.Locality;
import com.vuelossanitarios.backend.domain.catalog.Province;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.repository.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ubicación operativa actual del comandante (V63). La fijan el Administrador y Centro de Operaciones; el propio comandante sólo la consulta: si pudiera
 * declararla, la restricción geográfica de la asignación dependería de lo que el comandante afirme. Cada cambio queda auditado con quién, cuándo y el
 * valor anterior, y se serializa con las asignaciones mediante el bloqueo de la cuenta del comandante.
 */
@Service public class CommanderLocationService {
 public static final int DEFAULT_LIMIT=100,MAX_LIMIT=200;
 @PersistenceContext private EntityManager em;
 private final UserRepository users; private final LocalityRepository localities; private final ProvinceRepository provinces; private final AuditService audit; private final Clock clock;
 public CommanderLocationService(UserRepository users,LocalityRepository localities,ProvinceRepository provinces,AuditService audit,Clock clock){this.users=users;this.localities=localities;this.provinces=provinces;this.audit=audit;this.clock=clock;}

 /** Comandantes con cuenta activa, con su ubicación. {@code state}: CONOCIDA, SOLO_PROVINCIA o DESCONOCIDA (vacío = todos). */
 @Transactional(readOnly=true) public CommanderLocationList list(String q,Long provinceId,String state,Integer limit){
  int max=limit==null?DEFAULT_LIMIT:Math.max(1,Math.min(MAX_LIMIT,limit));
  StringBuilder jpql=new StringBuilder("select u from User u join fetch u.person p join fetch p.commanderProfile cp left join fetch cp.provinciaActual pr left join fetch cp.localidadActual l left join fetch cp.ubicacionActualizadaPor upd join u.userRoles ur join ur.role r where r.codigo='COMANDANTE' and u.activo=true");
  String text=q==null?"":q.trim().toLowerCase(Locale.ROOT).replace("%","").replace("_","");
  if(!text.isEmpty())jpql.append(" and (lower(concat(p.apellido,' ',p.nombre)) like :q or lower(concat(p.nombre,' ',p.apellido)) like :q or lower(u.username) like :q or lower(cp.licenseNumber) like :q)");
  if(provinceId!=null)jpql.append(" and pr.id=:province");
  String filter=state==null?"":state.trim().toUpperCase(Locale.ROOT);
  switch(filter){
   case "":break;
   case "DESCONOCIDA":jpql.append(" and cp.provinciaActual is null");break;
   case "SOLO_PROVINCIA":jpql.append(" and cp.provinciaActual is not null and cp.localidadActual is null");break;
   case "CONOCIDA":jpql.append(" and cp.localidadActual is not null");break;
   default:throw new ApiException(HttpStatus.BAD_REQUEST,"Estado de ubicación no reconocido");
  }
  jpql.append(" order by p.apellido, p.nombre, u.id");
  var query=em.createQuery(jpql.toString(),User.class);
  if(!text.isEmpty())query.setParameter("q","%"+text+"%");
  if(provinceId!=null)query.setParameter("province",provinceId);
  List<User> found=query.setMaxResults(max+1).getResultList();
  return new CommanderLocationList(found.stream().limit(max).map(CommanderLocationService::row).toList(),found.size()>max);
 }

 @Transactional(readOnly=true) public CommanderLocationRow get(Long userId){
  User u=users.findWithPersonById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Comandante inexistente"));
  if(u.getPerson().getCommanderProfile()==null)throw new ApiException(HttpStatus.BAD_REQUEST,"El usuario no tiene perfil de comandante");
  return row(u);
 }

 /** Fija la localidad operativa actual (y, por derivación, su provincia). La provincia indicada debe ser la de la localidad: no se aceptan identificadores sueltos. */
 @Transactional public CommanderLocationRow update(Long userId,Long provinceId,Long localityId,String reason,Long actorId){
  User actor=users.findById(actorId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  User target=users.lockWithPersonAndRolesById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Comandante inexistente"));
  CommanderProfile profile=target.getPerson().getCommanderProfile();
  if(profile==null||target.getUserRoles().stream().noneMatch(r->"COMANDANTE".equals(r.getRole().getCodigo())))throw new ApiException(HttpStatus.BAD_REQUEST,"El usuario no tiene perfil de comandante");
  if(!Boolean.TRUE.equals(target.getActivo()))throw new ApiException(HttpStatus.CONFLICT,"La cuenta del comandante está desactivada; reactívela antes de registrar su ubicación");
  Locality next=localities.lockById(localityId).orElseThrow(()->new ApiException(HttpStatus.BAD_REQUEST,"Seleccione una localidad válida"));
  if(!Boolean.TRUE.equals(next.getActivo()))throw new ApiException(HttpStatus.BAD_REQUEST,"La localidad seleccionada está deshabilitada");
  Province province=next.getProvincia();
  if(!province.getId().equals(provinceId))throw new ApiException(HttpStatus.BAD_REQUEST,"La localidad seleccionada no pertenece a la provincia indicada");
  if(!Boolean.TRUE.equals(province.getActivo()))throw new ApiException(HttpStatus.BAD_REQUEST,"La provincia seleccionada está deshabilitada");
  String why=reason==null||reason.isBlank()?null:reason.trim();
  String before=snapshot(profile,null);
  profile.setProvinciaActual(province);profile.setLocalidadActual(next);profile.setUbicacionActualizadaEn(LocalDateTime.now(clock));profile.setUbicacionActualizadaPor(actor);
  audit.record(null,actor,"COMMANDER_PROFILE",target.getPerson().getId(),"COMMANDER_LOCATION_UPDATE",before,snapshot(profile,why));
  return row(target);
 }

 /**
  * Contrato anterior (sólo provincia): registra la provincia y deja la localidad como desconocida, de modo que el comandante no queda elegible de forma ordinaria
  * hasta que se indique su localidad. Se conserva para los clientes que todavía lo usan; la interfaz usa {@link #update}.
  */
 @Transactional public CommanderLocationRow updateProvinceOnly(Long userId,Long provinceId,Long actorId){
  User actor=users.findById(actorId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Usuario inexistente"));
  User target=users.lockWithPersonAndRolesById(userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Comandante inexistente"));
  CommanderProfile profile=target.getPerson().getCommanderProfile();
  if(profile==null)throw new ApiException(HttpStatus.BAD_REQUEST,"El usuario no tiene perfil de comandante");
  Province next=provinces.findById(provinceId).filter(Province::getActivo).orElseThrow(()->new ApiException(HttpStatus.BAD_REQUEST,"Seleccione una provincia válida"));
  String before=snapshot(profile,null);
  profile.setProvinciaActual(next);profile.setLocalidadActual(null);profile.setUbicacionActualizadaEn(null);profile.setUbicacionActualizadaPor(null);
  audit.record(null,actor,"COMMANDER_PROFILE",target.getPerson().getId(),"COMMANDER_LOCATION_UPDATE",before,snapshot(profile,"Provincia sin localidad (contrato anterior)"));
  return row(target);
 }

 static CommanderLocationRow row(User u){
  CommanderProfile cp=u.getPerson().getCommanderProfile();Province pr=cp.getProvinciaActual();Locality l=cp.getLocalidadActual();
  String state=l!=null?(Boolean.TRUE.equals(l.getActivo())?"CONOCIDA":"LOCALIDAD_DESHABILITADA"):pr!=null?"SOLO_PROVINCIA":"DESCONOCIDA";
  var by=cp.getUbicacionActualizadaPor();
  return new CommanderLocationRow(u.getId(),u.getUsername(),u.getPerson().getNombre(),u.getPerson().getApellido(),cp.getLicenseNumber(),Boolean.TRUE.equals(u.getActivo()),u.getEstadoCuenta(),
   pr==null?null:pr.getId(),pr==null?null:pr.getNombre(),l==null?null:l.getId(),l==null?null:l.getNombre(),state,cp.getUbicacionActualizadaEn(),by==null?null:by.getPerson().getNombre()+" "+by.getPerson().getApellido());
 }
 private static String snapshot(CommanderProfile p,String reason){
  return "{\"provinciaActualId\":"+idOrNull(p.getProvinciaActual()==null?null:p.getProvinciaActual().getId())+",\"provinciaActual\":"+str(p.getProvinciaActual()==null?null:p.getProvinciaActual().getNombre())
   +",\"localidadActualId\":"+idOrNull(p.getLocalidadActual()==null?null:p.getLocalidadActual().getId())+",\"localidadActual\":"+str(p.getLocalidadActual()==null?null:p.getLocalidadActual().getNombre())+(reason==null?"":",\"motivo\":"+str(reason))+"}";
 }
 private static String idOrNull(Long id){return id==null?"null":id.toString();}
 private static String str(String v){return v==null?"null":"\""+v.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t")+"\"";}
}
