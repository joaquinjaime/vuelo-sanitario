package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Repository;

/**
 * Listado administrativo de cuentas. Selecciona columnas (no entidades) y resuelve roles y ubicación por lote: la entidad Persona carga su perfil de
 * comandante de forma anticipada y con cientos de usuarios provocaría una consulta adicional por fila.
 */
@Repository
public class UserDirectoryRepository {
 public record Filter(String text,String role,String status){}
 public record Row(long id,String firstName,String lastName,String dni,String username,String accountState,boolean active,LocalDateTime deactivatedAt,String deactivatedBy,String deactivationReason,boolean mustChangePassword,long personId){}
 @PersistenceContext private EntityManager em;

 private List<Predicate> predicates(CriteriaBuilder cb,CriteriaQuery<?> query,Root<User> u,Join<User,?> person,Filter f){
  List<Predicate> p=new ArrayList<>();
  switch(f.status()==null?"ACTIVOS":f.status()){
   case "INACTIVOS"->p.add(cb.isFalse(u.get("activo")));
   case "PENDIENTES"->{p.add(cb.isTrue(u.get("activo")));p.add(cb.equal(u.get("estadoCuenta"),"PENDIENTE_ACTIVACION"));}
   case "TODOS"->{}
   default->p.add(cb.isTrue(u.get("activo"))); // activas y pendientes de activación
  }
  if(f.text()!=null&&!f.text().isBlank()){
   String like="%"+f.text().trim().toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
   p.add(cb.or(cb.like(cb.lower(person.get("nombre")),like,'\\'),cb.like(cb.lower(person.get("apellido")),like,'\\'),cb.like(person.<String>get("dni"),like,'\\'),cb.like(cb.lower(u.get("username")),like,'\\'),
    cb.like(cb.lower(cb.concat(cb.concat(person.<String>get("nombre")," "),person.<String>get("apellido"))),like,'\\')));
  }
  if(f.role()!=null&&!f.role().isBlank()){
   Subquery<Long> sq=query.subquery(Long.class);var ur=sq.from(com.vuelossanitarios.backend.domain.user.UserRole.class);
   sq.select(cb.literal(1L)).where(cb.equal(ur.get("user"),u),cb.equal(ur.get("role").get("codigo"),f.role()),cb.isTrue(ur.get("role").get("activo")));
   p.add(cb.exists(sq));
  }
  return p;
 }

 public long count(Filter f){
  CriteriaBuilder cb=em.getCriteriaBuilder();CriteriaQuery<Long> q=cb.createQuery(Long.class);Root<User> u=q.from(User.class);Join<User,?> person=u.join("person");
  q.select(cb.count(u)).where(predicates(cb,q,u,person,f).toArray(Predicate[]::new));
  return em.createQuery(q).getSingleResult();
 }

 /** Orden estable: apellido, nombre e identificador. */
 public List<Row> page(Filter f,int offset,int size){
  CriteriaBuilder cb=em.getCriteriaBuilder();CriteriaQuery<Tuple> q=cb.createTupleQuery();Root<User> u=q.from(User.class);Join<User,?> person=u.join("person");
  Join<User,User> by=u.join("bajaPor",JoinType.LEFT);Join<User,?> byPerson=by.join("person",JoinType.LEFT);
  q.multiselect(u.get("id").alias("id"),person.get("nombre").alias("first"),person.get("apellido").alias("last"),person.get("dni").alias("dni"),u.get("username").alias("username"),u.get("estadoCuenta").alias("state"),
   u.get("activo").alias("active"),u.get("fechaBaja").alias("at"),byPerson.get("nombre").alias("byFirst"),byPerson.get("apellido").alias("byLast"),u.get("motivoBaja").alias("reason"),u.get("debeCambiarContrasena").alias("must"),person.get("id").alias("personId"));
  q.where(predicates(cb,q,u,person,f).toArray(Predicate[]::new)).orderBy(cb.asc(cb.lower(person.get("apellido"))),cb.asc(cb.lower(person.get("nombre"))),cb.asc(u.get("id")));
  return em.createQuery(q).setFirstResult(offset).setMaxResults(size).getResultList().stream().map(t->{
   String by1=t.get("byFirst",String.class),by2=t.get("byLast",String.class);
   return new Row(t.get("id",Long.class),t.get("first",String.class),t.get("last",String.class),t.get("dni",String.class),t.get("username",String.class),t.get("state",String.class),Boolean.TRUE.equals(t.get("active",Boolean.class)),t.get("at",LocalDateTime.class),
    by1==null&&by2==null?null:((by1==null?"":by1)+" "+(by2==null?"":by2)).trim(),t.get("reason",String.class),Boolean.TRUE.equals(t.get("must",Boolean.class)),t.get("personId",Long.class));}).toList();
 }

 public Map<Long,Set<String>> roles(Collection<Long> userIds){
  Map<Long,Set<String>> out=new HashMap<>();if(userIds.isEmpty())return out;
  for(Object[] r:em.createQuery("select ur.user.id, ur.role.codigo from UserRole ur where ur.user.id in :ids and ur.role.activo=true",Object[].class).setParameter("ids",userIds).getResultList())
   out.computeIfAbsent((Long)r[0],k->new TreeSet<>()).add((String)r[1]);
  return out;
 }
 /** Provincia actual del comandante por persona. */
 public Map<Long,String> provinces(Collection<Long> personIds){
  Map<Long,String> out=new HashMap<>();if(personIds.isEmpty())return out;
  for(Object[] r:em.createQuery("select cp.person.id, pr.nombre from CommanderProfile cp join cp.provinciaActual pr where cp.person.id in :ids",Object[].class).setParameter("ids",personIds).getResultList())out.put((Long)r[0],(String)r[1]);
  return out;
 }
 public long[] counts(){
  Object[] r=em.createQuery("select sum(case when u.activo=true and u.estadoCuenta='ACTIVO' then 1 else 0 end), sum(case when u.activo=true and u.estadoCuenta='PENDIENTE_ACTIVACION' then 1 else 0 end), sum(case when u.activo=false then 1 else 0 end) from User u",Object[].class).getSingleResult();
  return new long[]{r[0]==null?0:((Number)r[0]).longValue(),r[1]==null?0:((Number)r[1]).longValue(),r[2]==null?0:((Number)r[2]).longValue()};
 }
}
