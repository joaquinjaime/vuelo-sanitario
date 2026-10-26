package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.catalog.Locality;
import java.util.*;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalityRepository extends JpaRepository<Locality, Long> {
    Optional<Locality> findByIdAndActivoTrue(Long id);
    @EntityGraph(attributePaths = "provincia")
    List<Locality> findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(Long provinciaId, String query);
    @EntityGraph(attributePaths = "provincia") List<Locality> findAllByOrderByNombreAsc();
    boolean existsByCodigoOficialIgnoreCase(String codigoOficial);
    boolean existsByCodigoOficialIgnoreCaseAndIdNot(String codigoOficial,Long id);
    boolean existsByProvincia_IdAndNombreIgnoreCase(Long provinciaId,String nombre);
    boolean existsByProvincia_IdAndNombreIgnoreCaseAndIdNot(Long provinciaId,String nombre,Long id);
    long countByProvincia_IdAndActivoTrue(Long provinceId);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select l from Locality l join fetch l.provincia where l.id=:id") Optional<Locality> lockById(@Param("id") Long id);
}
