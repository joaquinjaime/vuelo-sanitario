package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
public interface AircraftRepository extends JpaRepository<Aircraft, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Aircraft a where a.id = :id")
    Optional<Aircraft> lockById(@Param("id") UUID id);
    List<Aircraft> findByActivoTrueAndAeropuertoActualIdOrderByMatriculaAsc(UUID aeropuertoId);
}
