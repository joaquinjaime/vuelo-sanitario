package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightRoute;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightRouteRepository extends JpaRepository<FlightRoute,Long> {
 // Obtiene todas las versiones de la ruta del vuelo, de la más nueva a la más antigua.
 List<FlightRoute> findByFlightIdOrderByVersionDesc(Long id);
 // Obtiene la versión actual de la ruta del vuelo, cargando su alternativo.
 @EntityGraph(attributePaths="alternativo") Optional<FlightRoute> findByFlightIdAndEsVersionActualTrue(Long id);
 // Obtiene la versión actual de las rutas de todos los vuelos, cargando su alternativo.
 @EntityGraph(attributePaths="alternativo") List<FlightRoute> findByEsVersionActualTrue();
}
