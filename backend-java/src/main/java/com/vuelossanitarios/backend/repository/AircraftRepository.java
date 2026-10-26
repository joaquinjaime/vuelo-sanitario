package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
public interface AircraftRepository extends JpaRepository<Aircraft, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Aircraft a where a.id = :id")
    Optional<Aircraft> lockById(@Param("id") Long id);
    /** Carga el aeropuerto actual en la misma consulta: los listados se serializan fuera de una sesión JPA (open-in-view=false). */
    @Query("select a from Aircraft a left join fetch a.aeropuertoActual order by a.matricula")
    List<Aircraft> findAllWithCurrentAirportOrderByMatricula();
    List<Aircraft> findByActivoTrueAndAeropuertoActualIdOrderByMatriculaAsc(Long aeropuertoId);
    @Query("select a from Aircraft a join fetch a.aeropuertoActual ap join ap.provinciaReferencial p where a.activo=true and p.id=:provinceId order by a.matricula")
    List<Aircraft> findActiveLocatedInProvince(@Param("provinceId") Long provinceId);
    boolean existsByMatriculaIgnoreCase(String matricula);
    boolean existsByMatriculaIgnoreCaseAndIdNot(String matricula, Long id);
    boolean existsByAeropuertoActualIdAndActivoTrue(Long aeropuertoId);
}
