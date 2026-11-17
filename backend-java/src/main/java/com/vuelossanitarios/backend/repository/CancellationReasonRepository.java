package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.CancellationReason;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CancellationReasonRepository extends JpaRepository<CancellationReason, Long> {
 // Obtiene los motivos de cancelación activos ordenados por su orden de presentación.
 List<CancellationReason> findByActivoTrueOrderByOrdenAsc();
 // Obtiene el motivo de cancelación por su ID sólo si está activo.
 Optional<CancellationReason> findByIdAndActivoTrue(Long id);
}
