package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.CancellationReason;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CancellationReasonRepository extends JpaRepository<CancellationReason, Long> {
 List<CancellationReason> findByActivoTrueOrderByOrdenAsc();
 Optional<CancellationReason> findByIdAndActivoTrue(Long id);
}
