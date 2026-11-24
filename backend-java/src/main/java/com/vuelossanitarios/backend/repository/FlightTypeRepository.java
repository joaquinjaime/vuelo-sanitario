/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla tipos_vuelo.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.FlightType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene el tipo de vuelo activo con el código indicado.
// Obtiene el tipo de vuelo por su código, esté activo o no.
// Obtiene los tipos de vuelo activos ordenados por nombre.
public interface FlightTypeRepository extends JpaRepository<FlightType,Long>{Optional<FlightType> findByCodigoAndActivoTrue(String codigo); Optional<FlightType> findByCodigo(String codigo); List<FlightType> findByActivoTrueOrderByNombreAsc();}
