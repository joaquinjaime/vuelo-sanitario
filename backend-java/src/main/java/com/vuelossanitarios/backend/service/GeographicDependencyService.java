package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.dto.GeographicCatalogDtos.DependencyView;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Clasifica las referencias a provincias, localidades y aeropuertos. Una referencia es VIGENTE cuando una baja lógica dejaría inconsistente una
 * operación abierta (vuelo no terminal, ruta vigente de un vuelo abierto, solicitud sanitaria abierta, aeronave activa ubicada allí, jerarquía activa)
 * y es HISTÓRICA cuando sólo documenta lo ocurrido (vuelos y solicitudes cerrados, versiones de ruta anteriores, hangar, aeronaves inactivas,
 * perfiles de comandante): se conserva con su clave foránea y no impide la baja. Fuente única de esa clasificación para listados y bajas.
 */
@Service public class GeographicDependencyService {
 private static final List<String> TERMINAL=List.copyOf(FlightStates.TERMINAL);
 private static final List<String> OPEN_REQUEST=List.of("SOLICITADO","PENDIENTE_RESPUESTA_DTS","APROBADO");
 private static final Map<String,String> LABELS=Map.of(
  "AERONAVES_ACTIVAS","aeronaves activas ubicadas allí","VUELOS_VIGENTES","vuelos vigentes que lo usan como origen o destino","RUTAS_ALTERNATIVAS_VIGENTES","rutas vigentes que lo usan como alternativo",
  "COORDINACIONES_VIGENTES","coordinaciones aeroportuarias vigentes de vuelos abiertos","LOCALIDADES_ACTIVAS","localidades activas","AEROPUERTOS_ACTIVOS","aeropuertos activos","SOLICITUDES_VIGENTES","solicitudes sanitarias abiertas");
 /** Referencias que existen por jerarquía administrativa: se informan con otro código de conflicto que las operativas. */
 public static final Set<String> HIERARCHY=Set.of("LOCALIDADES_ACTIVAS","AEROPUERTOS_ACTIVOS");
 @PersistenceContext private EntityManager em;

 private Map<Long,Long> grouped(String jpql,Collection<Long> ids){
  var q=em.createQuery(jpql,Object[].class).setParameter("ids",ids);
  if(jpql.contains(":terminal"))q.setParameter("terminal",TERMINAL);
  if(jpql.contains(":open"))q.setParameter("open",OPEN_REQUEST);
  Map<Long,Long> out=new HashMap<>();for(Object[] row:q.getResultList())out.merge(((Number)row[0]).longValue(),((Number)row[1]).longValue(),Long::sum);return out;
 }
 private static long get(Map<Long,Long> m,Long id){return m.getOrDefault(id,0L);}
 private static void put(Map<String,Long> m,String key,long v){if(v>0)m.put(key,v);}
 private static DependencyView view(Map<String,Long> vigentes,Map<String,Long> historicas){
  if(vigentes.isEmpty())return new DependencyView(true,null,Map.of(),Map.copyOf(historicas));
  StringJoiner s=new StringJoiner("; ");vigentes.forEach((k,v)->s.add(v+" "+LABELS.get(k)));
  return new DependencyView(false,"No puede desactivarse: "+s,Map.copyOf(vigentes),Map.copyOf(historicas));
 }

 /** Aeropuertos: aeronaves, vuelos (origen/destino), rutas alternativas, coordinaciones AA2000 y hangar. */
 @Transactional(readOnly=true) public Map<Long,DependencyView> airports(Collection<Long> ids){
  Map<Long,DependencyView> out=new HashMap<>();if(ids.isEmpty())return out;
  Map<Long,Long> aircraftActive=grouped("select a.aeropuertoActual.id,count(a) from Aircraft a where a.aeropuertoActual.id in :ids and a.activo=true group by a.aeropuertoActual.id",ids),
   aircraftInactive=grouped("select a.aeropuertoActual.id,count(a) from Aircraft a where a.aeropuertoActual.id in :ids and (a.activo=false or a.activo is null) group by a.aeropuertoActual.id",ids),
   openOrigin=grouped("select f.origen.id,count(f) from Flight f left join f.estadoVuelo e where f.origen.id in :ids and (e is null or e.codigo not in :terminal) group by f.origen.id",ids),
   openDestination=grouped("select f.destino.id,count(f) from Flight f left join f.estadoVuelo e where f.destino.id in :ids and (e is null or e.codigo not in :terminal) group by f.destino.id",ids),
   closedOrigin=grouped("select f.origen.id,count(f) from Flight f join f.estadoVuelo e where f.origen.id in :ids and e.codigo in :terminal group by f.origen.id",ids),
   closedDestination=grouped("select f.destino.id,count(f) from Flight f join f.estadoVuelo e where f.destino.id in :ids and e.codigo in :terminal group by f.destino.id",ids),
   alternateAll=grouped("select r.alternativo.id,count(r) from FlightRoute r where r.alternativo.id in :ids group by r.alternativo.id",ids),
   alternateOpen=grouped("select r.alternativo.id,count(r) from FlightRoute r join r.flight f left join f.estadoVuelo e where r.alternativo.id in :ids and r.esVersionActual=true and (e is null or e.codigo not in :terminal) group by r.alternativo.id",ids),
   coordinationAll=grouped("select c.aeropuerto.id,count(c) from Aa2000Coordination c where c.aeropuerto.id in :ids group by c.aeropuerto.id",ids),
   coordinationOpen=grouped("select c.aeropuerto.id,count(c) from Aa2000Coordination c join c.flight f left join f.estadoVuelo e where c.aeropuerto.id in :ids and c.esVersionActual=true and (e is null or e.codigo not in :terminal) group by c.aeropuerto.id",ids),
   hangar=grouped("select h.origenContexto.id,count(h) from HangarInfo h where h.origenContexto.id in :ids group by h.origenContexto.id",ids);
  for(Long id:ids){
   Map<String,Long> current=new LinkedHashMap<>(),history=new LinkedHashMap<>();
   put(current,"AERONAVES_ACTIVAS",get(aircraftActive,id));put(current,"VUELOS_VIGENTES",get(openOrigin,id)+get(openDestination,id));
   put(current,"RUTAS_ALTERNATIVAS_VIGENTES",get(alternateOpen,id));put(current,"COORDINACIONES_VIGENTES",get(coordinationOpen,id));
   put(history,"AERONAVES_INACTIVAS",get(aircraftInactive,id));put(history,"VUELOS_HISTORICOS",get(closedOrigin,id)+get(closedDestination,id));
   put(history,"VERSIONES_RUTA_HISTORICAS",get(alternateAll,id)-get(alternateOpen,id));put(history,"COORDINACIONES_HISTORICAS",get(coordinationAll,id)-get(coordinationOpen,id));put(history,"REGISTROS_HANGAR",get(hangar,id));
   out.put(id,view(current,history));
  }
  return out;
 }

 /** Localidades: aeropuertos asociados y solicitudes sanitarias (origen/destino solicitados). */
 @Transactional(readOnly=true) public Map<Long,DependencyView> localities(Collection<Long> ids){
  Map<Long,DependencyView> out=new HashMap<>();if(ids.isEmpty())return out;
  Map<Long,Long> airportsActive=grouped("select a.localidad.id,count(a) from Airport a where a.localidad.id in :ids and a.activo=true group by a.localidad.id",ids),
   airportsInactive=grouped("select a.localidad.id,count(a) from Airport a where a.localidad.id in :ids and (a.activo=false or a.activo is null) group by a.localidad.id",ids),
   originAll=grouped("select s.localidadOrigenSolicitada.id,count(s) from SanitaryFlight s where s.localidadOrigenSolicitada.id in :ids group by s.localidadOrigenSolicitada.id",ids),
   destinationAll=grouped("select s.localidadDestinoSolicitada.id,count(s) from SanitaryFlight s where s.localidadDestinoSolicitada.id in :ids group by s.localidadDestinoSolicitada.id",ids),
   originOpen=grouped("select s.localidadOrigenSolicitada.id,count(s) from SanitaryFlight s join s.flight f left join f.estadoVuelo e where s.localidadOrigenSolicitada.id in :ids and s.estadoSolicitud.codigo in :open and (e is null or e.codigo not in :terminal) group by s.localidadOrigenSolicitada.id",ids),
   destinationOpen=grouped("select s.localidadDestinoSolicitada.id,count(s) from SanitaryFlight s join s.flight f left join f.estadoVuelo e where s.localidadDestinoSolicitada.id in :ids and s.estadoSolicitud.codigo in :open and (e is null or e.codigo not in :terminal) group by s.localidadDestinoSolicitada.id",ids);
  for(Long id:ids){
   Map<String,Long> current=new LinkedHashMap<>(),history=new LinkedHashMap<>();
   put(current,"AEROPUERTOS_ACTIVOS",get(airportsActive,id));put(current,"SOLICITUDES_VIGENTES",get(originOpen,id)+get(destinationOpen,id));
   put(history,"AEROPUERTOS_INACTIVOS",get(airportsInactive,id));put(history,"SOLICITUDES_CERRADAS",get(originAll,id)+get(destinationAll,id)-get(originOpen,id)-get(destinationOpen,id));
   out.put(id,view(current,history));
  }
  return out;
 }

 /** Provincias: la jerarquía activa bloquea; localidades y aeropuertos inactivos y perfiles de comandante se conservan. */
 @Transactional(readOnly=true) public Map<Long,DependencyView> provinces(Collection<Long> ids){
  Map<Long,DependencyView> out=new HashMap<>();if(ids.isEmpty())return out;
  Map<Long,Long> localitiesActive=grouped("select l.provincia.id,count(l) from Locality l where l.provincia.id in :ids and l.activo=true group by l.provincia.id",ids),
   localitiesInactive=grouped("select l.provincia.id,count(l) from Locality l where l.provincia.id in :ids and (l.activo=false or l.activo is null) group by l.provincia.id",ids),
   airportsActive=grouped("select a.provinciaReferencial.id,count(a) from Airport a where a.provinciaReferencial.id in :ids and a.activo=true group by a.provinciaReferencial.id",ids),
   airportsInactive=grouped("select a.provinciaReferencial.id,count(a) from Airport a where a.provinciaReferencial.id in :ids and (a.activo=false or a.activo is null) group by a.provinciaReferencial.id",ids),
   commanders=grouped("select p.provinciaActual.id,count(p) from CommanderProfile p where p.provinciaActual.id in :ids group by p.provinciaActual.id",ids);
  for(Long id:ids){
   Map<String,Long> current=new LinkedHashMap<>(),history=new LinkedHashMap<>();
   put(current,"LOCALIDADES_ACTIVAS",get(localitiesActive,id));put(current,"AEROPUERTOS_ACTIVOS",get(airportsActive,id));
   put(history,"LOCALIDADES_INACTIVAS",get(localitiesInactive,id));put(history,"AEROPUERTOS_INACTIVOS",get(airportsInactive,id));put(history,"PERFILES_COMANDANTE",get(commanders,id));
   out.put(id,view(current,history));
  }
  return out;
 }

 /** Códigos de los vuelos abiertos que usan el aeropuerto como origen o destino (para explicar el bloqueo a un administrador). */
 @Transactional(readOnly=true) public List<String> openFlightCodes(Long airportId,int max){
  return em.createQuery("select distinct f.codigo from Flight f left join f.estadoVuelo e where (f.origen.id=:id or f.destino.id=:id) and (e is null or e.codigo not in :terminal) order by f.codigo",String.class)
   .setParameter("id",airportId).setParameter("terminal",TERMINAL).setMaxResults(max).getResultList();
 }
}
