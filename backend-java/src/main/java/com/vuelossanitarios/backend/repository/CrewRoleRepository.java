package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CrewRoleRepository extends JpaRepository<CrewRole, UUID> { Optional<CrewRole> findByCodigo(String codigo); }
