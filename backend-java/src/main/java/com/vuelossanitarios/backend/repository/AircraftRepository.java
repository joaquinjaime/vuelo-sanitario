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
    /** Carga el aeropuerto actual en la misma consulta: los listados se serializan fuera de una sesión JPA (open-in-view=false). */
    @Query("select a from Aircraft a left join fetch a.aeropuertoActual order by a.matricula")
    List<Aircraft> findAllWithCurrentAirportOrderByMatricula();
    List<Aircraft> findByActivoTrueAndAeropuertoActualIdOrderByMatriculaAsc(UUID aeropuertoId);
    @Query("select a from Aircraft a join fetch a.aeropuertoActual ap join ap.provinciaReferencial p where a.activo=true and p.id=:provinceId order by a.matricula")
    List<Aircraft> findActiveLocatedInProvince(@Param("provinceId") UUID provinceId);
}
