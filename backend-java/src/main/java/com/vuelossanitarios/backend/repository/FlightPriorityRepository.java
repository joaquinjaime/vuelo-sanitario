/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla prioridades_vuelo.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightPriority;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene la prioridad de vuelo activa con el código indicado.
public interface FlightPriorityRepository extends JpaRepository<FlightPriority,Long>{Optional<FlightPriority> findByCodigoAndActivoTrue(String codigo);}
