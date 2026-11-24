/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla coordinaciones_aa2000.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde
 *   Aa2000CoordinationService.
 */
package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.Aa2000Coordination;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

public interface Aa2000CoordinationRepository extends JpaRepository<Aa2000Coordination,Long> {
    // Obtiene todas las coordinaciones AA2000 del vuelo, de la más reciente a la más antigua por fecha de creación.
    List<Aa2000Coordination> findByFlightIdOrderByCreatedAtDesc(Long id);
    // Obtiene las coordinaciones AA2000 del vuelo marcadas como versión actual.
    List<Aa2000Coordination> findByFlightIdAndEsVersionActualTrue(Long id);
    // SQL Server puede elegir un escaneo de la tabla pequeña y esperar por
    // otra gestión. La clave por gestión acota ambas lecturas al grupo pedido.
    // Consulta nativa: obtiene y bloquea (UPDLOCK, ROWLOCK) la coordinación AA2000 vigente del vuelo y la gestión indicados,
    // forzando el índice uq_coordinacion_gestion_version.
    @Query(value="select * from dbo.coordinaciones_aa2000 with (updlock, rowlock, index(uq_coordinacion_gestion_version)) where id_vuelos=:flight and identificador_gestion=:group and es_version_actual=1",nativeQuery=true)
    Optional<Aa2000Coordination> lockCurrent(@Param("flight") Long flight,@Param("group") UUID group);
    // Consulta nativa sin bloqueo: obtiene la coordinación AA2000 vigente del vuelo y la gestión indicados, usando el índice uq_coordinacion_gestion_version.
    @Query(value="select * from dbo.coordinaciones_aa2000 with (index(uq_coordinacion_gestion_version)) where id_vuelos=:flight and identificador_gestion=:group and es_version_actual=1",nativeQuery=true)
    Optional<Aa2000Coordination> findByFlightIdAndGestionIdAndEsVersionActualTrue(@Param("flight") Long flight,@Param("group") UUID group);
}
