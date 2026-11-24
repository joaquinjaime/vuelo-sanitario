/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla informacion_medica_vuelo.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde FlightService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightMedicalInfo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene la información médica del vuelo.
public interface FlightMedicalInfoRepository extends JpaRepository<FlightMedicalInfo, Long> { Optional<FlightMedicalInfo> findByFlightId(Long flightId); }
