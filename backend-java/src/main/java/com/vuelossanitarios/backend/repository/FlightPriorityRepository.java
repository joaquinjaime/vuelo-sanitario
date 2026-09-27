package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightPriority;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightPriorityRepository extends JpaRepository<FlightPriority,UUID>{Optional<FlightPriority> findByCodigoAndActivoTrue(String codigo);}
