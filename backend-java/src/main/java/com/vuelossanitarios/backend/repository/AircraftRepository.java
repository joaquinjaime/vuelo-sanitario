/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla aeronaves.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde AircraftAdminService,
 *   FlightService.
 */
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
    // Obtiene la aeronave por su ID bloqueando su fila para escritura (PESSIMISTIC_WRITE).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Aircraft a where a.id = :id")
    Optional<Aircraft> lockById(@Param("id") Long id);
    /** Carga el aeropuerto actual en la misma consulta: los listados se serializan fuera de una sesión JPA (open-in-view=false). */
    // Obtiene todas las aeronaves con su aeropuerto actual (left join fetch), ordenadas por matrícula.
    @Query("select a from Aircraft a left join fetch a.aeropuertoActual order by a.matricula")
    List<Aircraft> findAllWithCurrentAirportOrderByMatricula();
    // Obtiene las aeronaves activas cuyo aeropuerto actual pertenece a la provincia indicada, con ese aeropuerto cargado, ordenadas por matrícula.
    @Query("select a from Aircraft a join fetch a.aeropuertoActual ap join ap.provinciaReferencial p where a.activo=true and p.id=:provinceId order by a.matricula")
    List<Aircraft> findActiveLocatedInProvince(@Param("provinceId") Long provinceId);
    // Verifica si existe una aeronave con la matrícula indicada, sin distinguir mayúsculas.
    boolean existsByMatriculaIgnoreCase(String matricula);
    // Verifica si otra aeronave (con ID distinto al indicado) ya usa la matrícula, sin distinguir mayúsculas.
    boolean existsByMatriculaIgnoreCaseAndIdNot(String matricula, Long id);
}
