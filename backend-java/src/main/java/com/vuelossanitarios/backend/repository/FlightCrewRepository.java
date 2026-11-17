package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
/** Salvo {@link #findByFlightIdOrderByIdAsc}, todas las consultas consideran únicamente asignaciones vigentes (sin baja). */
public interface FlightCrewRepository extends JpaRepository<FlightCrew, Long> {
 /** Personas de la tripulación vigente (sin cargar entidades) en una sola consulta. */
 // Obtiene como filas CrewPersonRow (sin cargar entidades) la tripulación vigente del vuelo con usuario, persona y función, ordenada por ID de asignación.
 @Query("select new com.vuelossanitarios.backend.repository.CrewPersonRow(fc.id,u.id,u.activo,u.estadoCuenta,p.id,p.nombre,p.apellido,r.codigo,r.nombre) from FlightCrew fc join fc.user u join u.person p join fc.crewRole r where fc.flight.id=:flightId and fc.fechaBaja is null order by fc.id") List<CrewPersonRow> findCurrentPeopleByFlightId(@Param("flightId") Long flightId);
 /** Tripulación vigente de todos los vuelos en los estados indicados, en una sola consulta (la simulación de políticas examina todos los vuelos abiertos). */
 // Obtiene las asignaciones vigentes de tripulación de los vuelos en los estados indicados, con vuelo, usuario y función cargados, ordenadas por ID.
 @Query("select fc from FlightCrew fc join fetch fc.flight f join fetch fc.user join fetch fc.crewRole where fc.fechaBaja is null and f.estadoVuelo.codigo in :states order by fc.id") List<FlightCrew> activeCrewOfFlightsInStates(@Param("states") Collection<String> states);
 /** Asignaciones vigentes de copiloto en vuelos abiertos que llegan a más tardar en {@code at} (ubicación prevista, V66). */
 // Obtiene las asignaciones vigentes de copiloto en vuelos sin estado o no FINALIZADO, COMPLETADO, CANCELADO ni RECHAZADO,
 // cuya llegada planificada es igual o anterior al instante dado; carga vuelo, usuario y destino.
 @Query("select fc from FlightCrew fc join fetch fc.flight f join fetch fc.user join fetch f.destino left join f.estadoVuelo st where fc.fechaBaja is null and fc.crewRole.codigo='COPILOTO' and f.fechaPlanificadaLlegada is not null and f.fechaPlanificadaLlegada <= :at and (st is null or st.codigo not in ('FINALIZADO','COMPLETADO','CANCELADO','RECHAZADO'))") List<FlightCrew> openCopilotArrivingBy(@Param("at") java.time.LocalDateTime at);
 // Verifica si el usuario tiene una asignación vigente en la tripulación del vuelo.
 boolean existsByFlightIdAndUserIdAndFechaBajaIsNull(Long flightId, Long userId);
 /** Historial completo del vuelo (vigentes y dadas de baja). */
 // Obtiene todas las asignaciones de tripulación del vuelo (vigentes y dadas de baja), ordenadas por ID.
 List<FlightCrew> findByFlightIdOrderByIdAsc(Long flightId);
 // Obtiene las asignaciones vigentes de tripulación del vuelo, ordenadas por ID.
 List<FlightCrew> findByFlightIdAndFechaBajaIsNullOrderByIdAsc(Long flightId);
 // Obtiene las asignaciones vigentes de tripulación del usuario.
 List<FlightCrew> findByUserIdAndFechaBajaIsNull(Long userId);
 // Verifica si el usuario tiene alguna asignación vigente de tripulación en vuelos cuyo estado está entre los indicados.
 @Query("select (count(fc) > 0) from FlightCrew fc where fc.user.id=:userId and fc.fechaBaja is null and fc.flight.estadoVuelo.codigo in :states") boolean existsOperationalCrewAssignment(@Param("userId") Long userId,@Param("states") Collection<String> states);
 // Obtiene las asignaciones vigentes de tripulación, con su vuelo, de los vuelos de la aeronave cuyo estado está entre los indicados.
 @Query("select fc from FlightCrew fc join fetch fc.flight f where fc.fechaBaja is null and f.aircraft.id=:aircraftId and f.estadoVuelo.codigo in :states") List<FlightCrew> activeCrewOfAircraftFlights(@Param("aircraftId") Long aircraftId,@Param("states") Collection<String> states);
}
