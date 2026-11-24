/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla informacion_hangar.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde HangarInfoService.
 */
package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.HangarInfo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface HangarInfoRepository extends JpaRepository<HangarInfo, Long> {
    // Obtiene la versión actual de la información de hangar del vuelo.
    Optional<HangarInfo> findByFlightIdAndEsVersionActualTrue(Long flightId);
    // Obtiene todas las versiones de la información de hangar del vuelo, de la más nueva a la más antigua.
    List<HangarInfo> findByFlightIdOrderByVersionDesc(Long flightId);
}
