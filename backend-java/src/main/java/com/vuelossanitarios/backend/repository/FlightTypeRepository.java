package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightTypeRepository extends JpaRepository<FlightType,Long>{Optional<FlightType> findByCodigoAndActivoTrue(String codigo); List<FlightType> findByActivoTrueOrderByNombreAsc();}
