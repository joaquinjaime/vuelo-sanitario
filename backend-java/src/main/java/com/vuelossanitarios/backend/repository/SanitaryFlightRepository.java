/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla vuelos_sanitarios.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde FlightService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene la solicitud de vuelo sanitario asociada al vuelo.
public interface SanitaryFlightRepository extends JpaRepository<SanitaryFlight,Long>{Optional<SanitaryFlight> findByFlightId(Long flightId);}
