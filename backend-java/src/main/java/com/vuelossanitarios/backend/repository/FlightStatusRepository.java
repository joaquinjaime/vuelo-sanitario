/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla estados_vuelo.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene el estado de vuelo por su código.
public interface FlightStatusRepository extends JpaRepository<FlightStatus, Long> { Optional<FlightStatus> findByCodigo(String codigo); }
