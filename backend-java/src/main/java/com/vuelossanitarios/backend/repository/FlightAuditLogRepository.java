/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla bitacora_vuelos.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde FlightLogService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightAuditLog;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface FlightAuditLogRepository extends JpaRepository<FlightAuditLog,Long> {
 // Obtiene una porción paginada del historial del vuelo con origen informado, del más reciente al más antiguo (fecha de ocurrencia e ID).
 @Query("select e from FlightAuditLog e where e.flight.id=:flight and e.origen is not null order by e.ocurrido desc,e.id desc")
 Slice<FlightAuditLog> history(@Param("flight") Long flight,Pageable page);
 // Verifica si ya existe un registro del historial del vuelo con el origen y el tipo indicados.
 boolean existsByFlightIdAndOrigenAndTipo(Long flight,String origin,String type);
}
