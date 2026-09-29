package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.catalog.Locality;
import java.util.*;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalityRepository extends JpaRepository<Locality, UUID> {
    Optional<Locality> findByIdAndActivoTrue(UUID id);
    @EntityGraph(attributePaths = "provincia")
    List<Locality> findTop50ByProvincia_IdAndActivoTrueAndNombreContainingIgnoreCaseOrderByNombreAsc(UUID provinciaId, String query);
}
