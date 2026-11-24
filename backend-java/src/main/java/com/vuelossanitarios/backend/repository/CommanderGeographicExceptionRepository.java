/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla excepciones_geograficas_comandante.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde FlightService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.CommanderGeographicException;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface CommanderGeographicExceptionRepository extends JpaRepository<CommanderGeographicException,Long>{
 /** Excepciones vigentes del vuelo (las de comandantes ya reemplazados quedan como historial). */
 // Obtiene las excepciones geográficas vigentes (no reemplazadas) del vuelo con comandante, autorizante y localidad del comandante,
 // de la más reciente a la más antigua por ID.
 @Query("select e from CommanderGeographicException e join fetch e.commander join fetch e.authorizedBy left join fetch e.commanderLocality where e.flight.id=:flightId and e.replacedAt is null order by e.id desc")
 List<CommanderGeographicException> findCurrentByFlightId(@Param("flightId") Long flightId);
}
