package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
/** Salvo {@link #findByFlightIdOrderByIdAsc}, todas las consultas consideran únicamente asignaciones vigentes (sin baja). */
public interface FlightCrewRepository extends JpaRepository<FlightCrew, Long> {
 boolean existsByFlightIdAndUserIdAndFechaBajaIsNull(Long flightId, Long userId);
 /** Historial completo del vuelo (vigentes y dadas de baja). */
 List<FlightCrew> findByFlightIdOrderByIdAsc(Long flightId);
 List<FlightCrew> findByFlightIdAndFechaBajaIsNullOrderByIdAsc(Long flightId);
 List<FlightCrew> findByUserIdAndFechaBajaIsNull(Long userId);
 @Query("select (count(fc) > 0) from FlightCrew fc where fc.user.id=:userId and fc.fechaBaja is null and fc.flight.estadoVuelo.codigo in :states") boolean existsOperationalCrewAssignment(@Param("userId") Long userId,@Param("states") Collection<String> states);
 @Query("select fc from FlightCrew fc join fetch fc.flight f where fc.fechaBaja is null and f.aircraft.id=:aircraftId and f.estadoVuelo.codigo in :states") List<FlightCrew> activeCrewOfAircraftFlights(@Param("aircraftId") Long aircraftId,@Param("states") Collection<String> states);
}
