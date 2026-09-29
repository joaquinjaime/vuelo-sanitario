package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.CancellationReason;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CancellationReasonRepository extends JpaRepository<CancellationReason, UUID> {
 List<CancellationReason> findByActivoTrueOrderByOrdenAsc();
 Optional<CancellationReason> findByIdAndActivoTrue(UUID id);
}
