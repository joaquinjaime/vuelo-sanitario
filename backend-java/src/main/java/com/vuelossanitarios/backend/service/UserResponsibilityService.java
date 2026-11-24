/*
 * ACCESO A BASE DE DATOS
 * Trae datos de: vuelos, estados_vuelo, vuelos_tripulantes, obligaciones_informe_final,
 *   vuelos_sanitarios.
 * Carga o modifica datos en: bloqueos_documento_vuelo (vence los bloqueos del usuario al darlo de
 *   baja).
 * Detecta los impedimentos para dar de baja a un usuario o quitarle un rol.
 */
package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.AuthDtos.Blocker;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Responsabilidades operativas vigentes de un usuario: lo que impide darlo de baja o quitarle un rol sin dejar vuelos, informes o solicitudes
 * en un estado inconsistente. Los vuelos terminados, cancelados o completados no bloquean nada. Nunca resuelve conflictos por su cuenta:
 * no cancela vuelos ni elimina asignaciones, sólo informa cuáles son.
 */
@Service
public class UserResponsibilityService {
 /** Estados de vuelo en los que la participación del comandante o la tripulación sigue siendo necesaria. */
 public static final Set<String> OPERATIONAL_STATES=Set.of("APROBADO","PENDIENTE_CONFIRMACION_COMANDANTE","PENDIENTE_RESPUESTA_OPERACIONES","PLANIFICADO","EN_CURSO");
 static final int MAX_LISTED=20;
 @PersistenceContext private EntityManager em; private final Clock clock;
 public UserResponsibilityService(Clock clock){this.clock=clock;}

 /** Impedimentos para dar de baja a la cuenta; vacío si puede desactivarse. */
 @Transactional(readOnly=true)
 public List<Blocker> deactivationBlockers(Long userId){
  List<Blocker> out=new ArrayList<>();
  commanderFlights(userId,out);crewFlights(userId,out);pendingReports(userId,out);pendingRequests(userId,out);
  return out;
 }

 /** Impedimentos para retirar el rol indicado. Los roles sin responsabilidad exclusiva (operaciones, administración) se controlan aparte. */
 @Transactional(readOnly=true)
 public List<Blocker> roleRemovalBlockers(Long userId,String role){
  List<Blocker> out=new ArrayList<>();
  if("COMANDANTE".equals(role)){commanderFlights(userId,out);pendingReports(userId,out);}
  else if("DTS".equals(role))pendingRequests(userId,out);
  return out;
 }

 /** Lanza 409 con la lista de impedimentos (vuelos incluidos) cuando existen. */
 public void requireNone(List<Blocker> blockers,String code,String message){
  if(blockers.isEmpty())return;
  throw new ApiException(HttpStatus.CONFLICT,code,message,Map.of("impedimentos",blockers));
 }

 /** Libera los bloqueos de edición documental que la cuenta mantiene: vencen ya y otro usuario puede recuperarlos sin esperar el plazo. */
 @Transactional
 public int releaseDocumentLocks(Long userId){
  LocalDateTime now=LocalDateTime.ofInstant(clock.instant(),ZoneOffset.UTC);
  // Vence en este instante todos los bloqueos de edición documental vigentes del usuario mediante una actualización masiva y devuelve cuántos se liberaron
  return em.createQuery("update DocumentLock l set l.expiresAt=:now where l.owner.id=:id and l.expiresAt>:now").setParameter("now",now).setParameter("id",userId).executeUpdate();
 }

 private void commanderFlights(Long userId,List<Blocker> out){
  // commanderFlights: Obtiene ID, código y estado de hasta 20 vuelos en estados operativos en los que el usuario es comandante, ordenados por ID
  for(Object[] r:em.createQuery("select f.id, f.codigo, f.estadoVuelo.codigo from Flight f where f.comandante.id=:id and f.estadoVuelo.codigo in :states order by f.id",Object[].class).setParameter("id",userId).setParameter("states",OPERATIONAL_STATES).setMaxResults(MAX_LISTED).getResultList())
   out.add(new Blocker("COMANDANTE_ASIGNADO",(Long)r[0],(String)r[1],"Comandante asignado al vuelo "+r[1]+" ("+String.valueOf(r[2]).replace('_',' ')+")"));
 }
 private void crewFlights(Long userId,List<Blocker> out){
  // crewFlights: Obtiene ID de vuelo, código y rol de hasta 20 asignaciones de tripulación vigentes del usuario en vuelos en estados operativos, ordenadas por vuelo
  for(Object[] r:em.createQuery("select fc.flight.id, fc.flight.codigo, fc.crewRole.codigo from FlightCrew fc where fc.user.id=:id and fc.fechaBaja is null and fc.flight.estadoVuelo.codigo in :states order by fc.flight.id",Object[].class).setParameter("id",userId).setParameter("states",OPERATIONAL_STATES).setMaxResults(MAX_LISTED).getResultList())
   out.add(new Blocker("TRIPULANTE_ASIGNADO",(Long)r[0],(String)r[1],"Tripulante ("+r[2]+") del vuelo "+r[1]));
 }
 /** Protegido para que las pruebas sobre H2 (sin DATETIMEOFFSET) puedan omitir esta consulta; se verifica en SQL Server real. */
 protected void pendingReports(Long userId,List<Blocker> out){
  // pendingReports: Obtiene ID y código de hasta 20 vuelos con obligación de informe final vigente del comandante en estado PENDIENTE o DEVUELTO, ordenados por vuelo
  for(Object[] r:em.createQuery("select o.flight.id, o.flight.codigo from FinalReportObligation o where o.commander.id=:id and o.current=true and o.status in :states order by o.flight.id",Object[].class)
    .setParameter("id",userId).setParameter("states",List.of(com.vuelossanitarios.backend.domain.flight.FinalReportStatus.PENDIENTE,com.vuelossanitarios.backend.domain.flight.FinalReportStatus.DEVUELTO)).setMaxResults(MAX_LISTED).getResultList())
   out.add(new Blocker("INFORME_FINAL_PENDIENTE",(Long)r[0],(String)r[1],"Informe final pendiente de presentar o corregir del vuelo "+r[1]));
 }
 private void pendingRequests(Long userId,List<Blocker> out){
  // pendingRequests: Obtiene ID y código de hasta 20 solicitudes sanitarias del usuario que esperan su respuesta a una contrapropuesta (PENDIENTE_RESPUESTA_DTS), ordenadas por vuelo
  for(Object[] r:em.createQuery("select s.flight.id, s.flight.codigo from SanitaryFlight s where s.solicitadoPor.id=:id and s.estadoSolicitud.codigo='PENDIENTE_RESPUESTA_DTS' order by s.flight.id",Object[].class).setParameter("id",userId).setMaxResults(MAX_LISTED).getResultList())
   out.add(new Blocker("RESPUESTA_DTS_PENDIENTE",(Long)r[0],(String)r[1],"La solicitud "+r[1]+" espera su respuesta a una contrapropuesta de horario"));
 }
}
