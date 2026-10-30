package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightRoute;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightRouteRepository extends JpaRepository<FlightRoute,Long> {
 List<FlightRoute> findByFlightIdOrderByVersionDesc(Long id);
 @EntityGraph(attributePaths="alternativo") Optional<FlightRoute> findByFlightIdAndEsVersionActualTrue(Long id);
 @EntityGraph(attributePaths="alternativo") List<FlightRoute> findByEsVersionActualTrue();
}
