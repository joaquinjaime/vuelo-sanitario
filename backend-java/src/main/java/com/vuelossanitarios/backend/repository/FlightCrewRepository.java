package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface FlightCrewRepository extends JpaRepository<FlightCrew, UUID> {
 boolean existsByFlightIdAndUserId(UUID flightId, UUID userId);
 @Query("select (count(fc) > 0) from FlightCrew fc where fc.user.id=:userId and fc.flight.status.codigo in :states") boolean existsOperationalCrewAssignment(@Param("userId") UUID userId,@Param("states") Collection<String> states);
}
