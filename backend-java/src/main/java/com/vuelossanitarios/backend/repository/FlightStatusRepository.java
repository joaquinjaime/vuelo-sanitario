package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene el estado de vuelo por su código.
public interface FlightStatusRepository extends JpaRepository<FlightStatus, Long> { Optional<FlightStatus> findByCodigo(String codigo); }
