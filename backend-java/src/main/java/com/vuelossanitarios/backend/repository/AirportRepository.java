package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface AirportRepository extends JpaRepository<Airport, UUID> {}
