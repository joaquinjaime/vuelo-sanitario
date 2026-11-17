package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightDocumentItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface DocumentItemRepository extends JpaRepository<FlightDocumentItem, Long> {
 // Obtiene los documentos activos del vuelo, del más reciente al más antiguo por fecha de creación.
 List<FlightDocumentItem> findByFlightIdAndActivoTrueOrderByCreatedAtDesc(Long flightId);
 // Obtiene los documentos dados de baja del vuelo, ordenados por fecha de baja descendente.
 List<FlightDocumentItem> findByFlightIdAndActivoFalseOrderByFechaBajaDesc(Long flightId);
 // Verifica si el vuelo ya tiene un documento activo con el mismo nombre, sin distinguir mayúsculas.
 boolean existsByFlightIdAndActivoTrueAndNombreDocumentoIgnoreCase(Long flightId, String nombreDocumento);
 // Obtiene el documento del vuelo por su ID bloqueando su fila para escritura (PESSIMISTIC_WRITE).
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select d from FlightDocumentItem d where d.id=:id") Optional<FlightDocumentItem> lockById(@Param("id") Long id);
}
