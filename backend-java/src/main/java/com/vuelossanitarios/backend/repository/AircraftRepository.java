package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface AircraftRepository extends JpaRepository<Aircraft, UUID> {}
