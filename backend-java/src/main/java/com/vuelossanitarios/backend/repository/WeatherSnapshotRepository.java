/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla instantaneas_clima.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde FlightService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.WeatherSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface WeatherSnapshotRepository extends JpaRepository<WeatherSnapshot, Long> {
 // Obtiene los registros meteorológicos del vuelo, del más reciente al más antiguo por fecha de registro e ID.
 List<WeatherSnapshot> findByFlightIdOrderByFechaRegistroDescIdDesc(Long flightId);
}
