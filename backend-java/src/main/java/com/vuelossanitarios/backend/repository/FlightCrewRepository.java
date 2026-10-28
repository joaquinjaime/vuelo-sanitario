package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
/** Salvo {@link #findByFlightIdOrderByIdAsc}, todas las consultas consideran únicamente asignaciones vigentes (sin baja). */
public interface FlightCrewRepository extends JpaRepository<FlightCrew, Long> {
 /** Personas de la tripulación vigente (sin cargar entidades) en una sola consulta. */
 @Query("select new com.vuelossanitarios.backend.repository.CrewPersonRow(fc.id,u.id,u.activo,u.estadoCuenta,p.id,p.nombre,p.apellido,r.codigo,r.nombre) from FlightCrew fc join fc.user u join u.person p join fc.crewRole r where fc.flight.id=:flightId and fc.fechaBaja is null order by fc.id") List<CrewPersonRow> findCurrentPeopleByFlightId(@Param("flightId") Long flightId);
 /** Tripulación vigente de todos los vuelos en los estados indicados, en una sola consulta (la simulación de políticas examina todos los vuelos abiertos). */
 @Query("select fc from FlightCrew fc join fetch fc.flight f join fetch fc.user join fetch fc.crewRole where fc.fechaBaja is null and f.estadoVuelo.codigo in :states order by fc.id") List<FlightCrew> activeCrewOfFlightsInStates(@Param("states") Collection<String> states);
 boolean existsByFlightIdAndUserIdAndFechaBajaIsNull(Long flightId, Long userId);
 /** Historial completo del vuelo (vigentes y dadas de baja). */
 List<FlightCrew> findByFlightIdOrderByIdAsc(Long flightId);
 List<FlightCrew> findByFlightIdAndFechaBajaIsNullOrderByIdAsc(Long flightId);
 List<FlightCrew> findByUserIdAndFechaBajaIsNull(Long userId);
 @Query("select (count(fc) > 0) from FlightCrew fc where fc.user.id=:userId and fc.fechaBaja is null and fc.flight.estadoVuelo.codigo in :states") boolean existsOperationalCrewAssignment(@Param("userId") Long userId,@Param("states") Collection<String> states);
 @Query("select fc from FlightCrew fc join fetch fc.flight f where fc.fechaBaja is null and f.aircraft.id=:aircraftId and f.estadoVuelo.codigo in :states") List<FlightCrew> activeCrewOfAircraftFlights(@Param("aircraftId") Long aircraftId,@Param("states") Collection<String> states);
}
