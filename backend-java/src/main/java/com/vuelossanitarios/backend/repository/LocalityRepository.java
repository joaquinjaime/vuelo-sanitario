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
    Optional<Locality> findByIdAndActivoTrue(Long id);
    @EntityGraph(attributePaths = "provincia")
    List<Locality> findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(Long provinciaId, String query);
    @EntityGraph(attributePaths = "provincia") List<Locality> findAllByOrderByNombreAsc();
    boolean existsByCodigoOficialIgnoreCase(String codigoOficial);
    boolean existsByCodigoOficialIgnoreCaseAndIdNot(String codigoOficial,Long id);
    boolean existsByProvincia_IdAndNombreIgnoreCase(Long provinciaId,String nombre);
    boolean existsByProvincia_IdAndNombreIgnoreCaseAndIdNot(Long provinciaId,String nombre,Long id);
    long countByProvincia_IdAndActivoTrue(Long provinceId);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select l from Locality l where l.id=:id") Optional<Locality> lockById(@Param("id") Long id);
    @Query("select l.provincia.id from Locality l where l.id=:id") Optional<Long> provinceIdOf(@Param("id") Long id);
    @EntityGraph(attributePaths = "provincia") @Query("select l from Locality l where lower(l.nombre) like lower(concat('%',:q,'%')) or lower(l.codigoOficial) like lower(concat('%',:q,'%'))") Page<Locality> search(@Param("q") String q,Pageable pageable);
}
