package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.catalog.Locality;
import java.util.*;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalityRepository extends JpaRepository<Locality, Long> {
    // Obtiene la localidad por su ID sólo si está activa.
    Optional<Locality> findByIdAndActivoTrue(Long id);
    // Obtiene hasta 50 localidades activas de la provincia cuyo nombre contiene el texto (sin distinguir mayúsculas), con su provincia, ordenadas por nombre.
    @EntityGraph(attributePaths = "provincia")
    List<Locality> findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(Long provinciaId, String query);
    // Obtiene todas las localidades con su provincia, ordenadas por nombre.
    @EntityGraph(attributePaths = "provincia") List<Locality> findAllByOrderByNombreAsc();
    // Verifica si existe una localidad con el código oficial indicado, sin distinguir mayúsculas.
    boolean existsByCodigoOficialIgnoreCase(String codigoOficial);
    // Verifica si otra localidad (con ID distinto al indicado) ya usa el código oficial, sin distinguir mayúsculas.
    boolean existsByCodigoOficialIgnoreCaseAndIdNot(String codigoOficial,Long id);
    // Verifica si la provincia ya tiene una localidad con ese nombre, sin distinguir mayúsculas.
    boolean existsByProvincia_IdAndNombreIgnoreCase(Long provinciaId,String nombre);
    // Verifica si otra localidad (con ID distinto al indicado) de la provincia ya usa ese nombre, sin distinguir mayúsculas.
    boolean existsByProvincia_IdAndNombreIgnoreCaseAndIdNot(Long provinciaId,String nombre,Long id);
    // Obtiene la localidad por su ID bloqueándola para escritura (PESSIMISTIC_WRITE).
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select l from Locality l where l.id=:id") Optional<Locality> lockById(@Param("id") Long id);
    // Obtiene el ID de la provincia a la que pertenece la localidad indicada.
    @Query("select l.provincia.id from Locality l where l.id=:id") Optional<Long> provinceIdOf(@Param("id") Long id);
    // Busca localidades paginadas cuyo nombre o código oficial contiene el texto (sin distinguir mayúsculas), con su provincia.
    @EntityGraph(attributePaths = "provincia") @Query("select l from Locality l where lower(l.nombre) like lower(concat('%',:q,'%')) or lower(l.codigoOficial) like lower(concat('%',:q,'%'))") Page<Locality> search(@Param("q") String q,Pageable pageable);
}
