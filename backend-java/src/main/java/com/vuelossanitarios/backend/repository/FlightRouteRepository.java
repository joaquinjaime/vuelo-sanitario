package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightRoute;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightRouteRepository extends JpaRepository<FlightRoute,Long> {
 List<FlightRoute> findByFlightIdOrderByVersionDesc(Long id);
 Optional<FlightRoute> findByFlightIdAndEsVersionActualTrue(Long id);
 List<FlightRoute> findByEsVersionActualTrue();
}
