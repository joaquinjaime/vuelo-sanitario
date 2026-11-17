package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightPriority;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene la prioridad de vuelo activa con el código indicado.
public interface FlightPriorityRepository extends JpaRepository<FlightPriority,Long>{Optional<FlightPriority> findByCodigoAndActivoTrue(String codigo);}
