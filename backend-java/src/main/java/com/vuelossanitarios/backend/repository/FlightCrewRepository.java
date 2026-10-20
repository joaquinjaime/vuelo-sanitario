package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface FlightCrewRepository extends JpaRepository<FlightCrew, Long> {
 boolean existsByFlightIdAndUserId(Long flightId, Long userId);
 List<FlightCrew> findByFlightIdOrderByIdAsc(Long flightId);
 List<FlightCrew> findByUserId(Long userId);
 @Query("select (count(fc) > 0) from FlightCrew fc where fc.user.id=:userId and fc.flight.estadoVuelo.codigo in :states") boolean existsOperationalCrewAssignment(@Param("userId") Long userId,@Param("states") Collection<String> states);
}
