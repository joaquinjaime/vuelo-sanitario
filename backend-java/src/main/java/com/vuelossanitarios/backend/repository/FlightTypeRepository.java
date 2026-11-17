package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene el tipo de vuelo activo con el código indicado.
// Obtiene el tipo de vuelo por su código, esté activo o no.
// Obtiene los tipos de vuelo activos ordenados por nombre.
public interface FlightTypeRepository extends JpaRepository<FlightType,Long>{Optional<FlightType> findByCodigoAndActivoTrue(String codigo); Optional<FlightType> findByCodigo(String codigo); List<FlightType> findByActivoTrueOrderByNombreAsc();}
