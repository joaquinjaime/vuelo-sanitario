package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import jakarta.persistence.criteria.Expression;
import org.springframework.stereotype.Repository;

/**
 * Consultas de sólo lectura sobre {@code eventos_auditoria}. Selecciona columnas (no entidades) con una sola consulta por página
 * —actor y vuelo se resuelven con LEFT JOIN— y resuelve las referencias a personas, aeronaves y aeropuertos por lote, sin N+1.
 */
@Repository
public class AuditQueryRepository {
 /** Condición de visibilidad de un perfil: para cada tipo de entidad, las operaciones visibles (null = todas). */
 public record Visibility(Map<String,Set<String>> operationsByType){}
 /** {@code visibility} nulo = sin restricción de perfil (administrador). Las fechas son UTC; {@code to} es exclusivo. */
 public record Filter(Long flightId,Long actorId,String entityType,String operation,Long entityId,LocalDateTime from,LocalDateTime to,List<Visibility> visibility,boolean ascending){}
 public record Row(long id,LocalDateTime occurredAt,Long flightId,String flightCode,Long actorId,String actorUsername,String actorFirstName,String actorLastName,boolean actorActive,
                   String entityType,Long entityId,String operation,String oldValues,String newValues){}
 public record ActorRow(long id,String username,String firstName,String lastName,boolean active){}

 @PersistenceContext private EntityManager em;

 private List<Predicate> predicates(CriteriaBuilder cb,Root<AuditEvent> r,Filter f){
  List<Predicate> p=new ArrayList<>();
  if(f.flightId()!=null)p.add(cb.equal(r.get("flight").get("id"),f.flightId()));
  if(f.actorId()!=null)p.add(cb.equal(r.get("actor").get("id"),f.actorId()));
  if(f.entityType()!=null)p.add(cb.equal(r.get("entityType"),f.entityType()));
  if(f.operation()!=null)p.add(cb.equal(r.get("operation"),f.operation()));
  if(f.entityId()!=null)p.add(cb.equal(r.get("entityId"),f.entityId()));
  if(f.from()!=null)p.add(cb.greaterThanOrEqualTo(r.<LocalDateTime>get("occurredAt"),f.from()));
  if(f.to()!=null)p.add(cb.lessThan(r.<LocalDateTime>get("occurredAt"),f.to()));
  if(f.visibility()!=null){
   List<Predicate> any=new ArrayList<>();
   for(Visibility v:f.visibility())for(Map.Entry<String,Set<String>> e:v.operationsByType().entrySet()){
    Predicate type=cb.equal(r.get("entityType"),e.getKey());
    any.add(e.getValue()==null?type:cb.and(type,r.get("operation").in(e.getValue())));
   }
   p.add(any.isEmpty()?cb.disjunction():cb.or(any.toArray(Predicate[]::new)));
  }
  return p;
 }

 public long count(Filter f){
  CriteriaBuilder cb=em.getCriteriaBuilder();CriteriaQuery<Long> q=cb.createQuery(Long.class);Root<AuditEvent> r=q.from(AuditEvent.class);
  q.select(cb.count(r)).where(predicates(cb,r,f).toArray(Predicate[]::new));
  return em.createQuery(q).getSingleResult();
 }

 /** Orden estable: fecha y, ante igualdad, identificador (ambos en la misma dirección). */
 public List<Row> page(Filter f,int offset,int size){
  CriteriaBuilder cb=em.getCriteriaBuilder();CriteriaQuery<Tuple> q=select(cb);Root<AuditEvent> r=(Root<AuditEvent>)q.getRoots().iterator().next();
  q.where(predicates(cb,r,f).toArray(Predicate[]::new));
  q.orderBy(f.ascending()?List.of(cb.asc(r.get("occurredAt")),cb.asc(r.get("id"))):List.of(cb.desc(r.get("occurredAt")),cb.desc(r.get("id"))));
  return em.createQuery(q).setFirstResult(offset).setMaxResults(size).getResultList().stream().map(this::row).toList();
 }

 public Optional<Row> find(long id){
  CriteriaBuilder cb=em.getCriteriaBuilder();CriteriaQuery<Tuple> q=select(cb);Root<AuditEvent> r=(Root<AuditEvent>)q.getRoots().iterator().next();
  q.where(cb.equal(r.get("id"),id));
  return em.createQuery(q).getResultList().stream().findFirst().map(this::row);
 }

 private CriteriaQuery<Tuple> select(CriteriaBuilder cb){
  CriteriaQuery<Tuple> q=cb.createTupleQuery();Root<AuditEvent> r=q.from(AuditEvent.class);
  Join<Object,Object> flight=r.join("flight",JoinType.LEFT),actor=r.join("actor",JoinType.LEFT),person=actor.join("person",JoinType.LEFT);
  q.multiselect(r.get("id").alias("id"),r.get("occurredAt").alias("at"),flight.get("id").alias("flightId"),flight.get("codigo").alias("flightCode"),actor.get("id").alias("actorId"),
   actor.get("username").alias("username"),person.get("nombre").alias("first"),person.get("apellido").alias("last"),actor.get("activo").alias("active"),
   r.get("entityType").alias("type"),r.get("entityId").alias("entityId"),r.get("operation").alias("op"),r.get("oldValues").alias("old"),r.get("newValues").alias("new"));
  return q;
 }

 private Row row(Tuple t){
  Boolean active=t.get("active",Boolean.class);
  return new Row(t.get("id",Long.class),t.get("at",LocalDateTime.class),t.get("flightId",Long.class),t.get("flightCode",String.class),t.get("actorId",Long.class),t.get("username",String.class),
   t.get("first",String.class),t.get("last",String.class),active==null||active,t.get("type",String.class),t.get("entityId",Long.class),t.get("op",String.class),t.get("old",String.class),t.get("new",String.class));
 }

 // ----- resolución por lote de referencias que los eventos guardan como identificadores -----
 public Map<Long,String> userNames(Collection<Long> ids){
  Map<Long,String> out=new HashMap<>();if(ids.isEmpty())return out;
  for(Object[] r:em.createQuery("select u.id, p.nombre, p.apellido from User u join u.person p where u.id in :ids",Object[].class).setParameter("ids",ids).getResultList())
   out.put((Long)r[0],((String)r[1]+" "+(String)r[2]).trim());
  return out;
 }
 public Map<Long,String> aircraftPlates(Collection<Long> ids){
  Map<Long,String> out=new HashMap<>();if(ids.isEmpty())return out;
  for(Object[] r:em.createQuery("select a.id, a.matricula from Aircraft a where a.id in :ids",Object[].class).setParameter("ids",ids).getResultList())out.put((Long)r[0],(String)r[1]);
  return out;
 }
 public Map<Long,String> airportNames(Collection<Long> ids){
  Map<Long,String> out=new HashMap<>();if(ids.isEmpty())return out;
  for(Object[] r:em.createQuery("select a.id, a.nombre, a.codigoIata from Airport a where a.id in :ids",Object[].class).setParameter("ids",ids).getResultList())
   out.put((Long)r[0],r[2]==null||((String)r[2]).isBlank()?(String)r[1]:r[1]+" ("+r[2]+")");
  return out;
 }
 /** Códigos de rol de cada usuario (para etiquetar al personal ante un DTS sin revelar su identidad). */
 public Map<Long,Set<String>> roleCodes(Collection<Long> userIds){
  Map<Long,Set<String>> out=new HashMap<>();if(userIds.isEmpty())return out;
  for(Object[] r:em.createQuery("select ur.user.id, ur.role.codigo from UserRole ur where ur.user.id in :ids",Object[].class).setParameter("ids",userIds).getResultList())
   out.computeIfAbsent((Long)r[0],k->new java.util.HashSet<>()).add((String)r[1]);
  return out;
 }

 // ----- opciones de filtro (sólo administración) -----
 public List<ActorRow> actors(String search,int offset,int limit){
  CriteriaBuilder cb=em.getCriteriaBuilder(); CriteriaQuery<Tuple> q=cb.createTupleQuery();
  Root<AuditEvent> e=q.from(AuditEvent.class); Join<Object,Object> a=e.join("actor",JoinType.INNER); Join<Object,Object> p=a.join("person",JoinType.LEFT);
  q.multiselect(a.get("id").alias("id"),a.get("username").alias("username"),p.get("nombre").alias("first"),p.get("apellido").alias("last"),a.get("activo").alias("active"),cb.lower(p.get("apellido")).alias("sortLast"),cb.lower(p.get("nombre")).alias("sortFirst")).distinct(true);
  if(search!=null&&!search.isBlank()){
   String term="%"+search.trim().toLowerCase(java.util.Locale.ROOT)+"%";
   q.where(cb.or(cb.like(cb.lower(a.get("username")),term),cb.like(cb.lower(p.get("nombre")),term),cb.like(cb.lower(p.get("apellido")),term),cb.like(cb.lower(cb.concat(cb.concat(p.get("nombre")," "),p.get("apellido"))),term)));
  }
  q.orderBy(cb.asc(cb.lower(p.get("apellido"))),cb.asc(cb.lower(p.get("nombre"))),cb.asc(a.get("id")));
  return em.createQuery(q).setFirstResult(offset).setMaxResults(limit).getResultList().stream().map(t->{Boolean active=t.get("active",Boolean.class);return new ActorRow(t.get("id",Long.class),t.get("username",String.class),t.get("first",String.class),t.get("last",String.class),active==null||active);}).toList();
 }
 public List<String> entityTypes(){return em.createQuery("select distinct e.entityType from AuditEvent e order by e.entityType",String.class).getResultList();}
 public List<String> operations(){return em.createQuery("select distinct e.operation from AuditEvent e order by e.operation",String.class).getResultList();}
}
