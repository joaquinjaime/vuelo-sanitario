package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AirportRepository extends JpaRepository<Airport, Long> {
 java.util.List<Airport> findTop50ByActivoTrueAndProvinciaReferencialIdAndNombreContainingIgnoreCaseOrderByNombreAsc(Long provinciaId, String query);
}
