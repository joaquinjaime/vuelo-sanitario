package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightStatusRepository extends JpaRepository<FlightStatus, UUID> { Optional<FlightStatus> findByCodigo(String codigo); }
