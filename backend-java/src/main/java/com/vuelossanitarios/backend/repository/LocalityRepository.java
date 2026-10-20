package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.catalog.Locality;
import java.util.*;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalityRepository extends JpaRepository<Locality, Long> {
    Optional<Locality> findByIdAndActivoTrue(Long id);
    @EntityGraph(attributePaths = "provincia")
    List<Locality> findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(Long provinciaId, String query);
}
