/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla provincias.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde GeographicCatalogService.
 */
package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.catalog.Province;
import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ProvinceRepository extends JpaRepository<Province, Long> {
    // Obtiene las provincias activas ordenadas por nombre.
    List<Province> findByActivoTrueOrderByNombreAsc();
    // Obtiene todas las provincias ordenadas por nombre.
    List<Province> findAllByOrderByNombreAsc();
    // Verifica si existe una provincia con el código oficial indicado, sin distinguir mayúsculas.
    boolean existsByCodigoOficialIgnoreCase(String codigoOficial);
    // Verifica si otra provincia (con ID distinto al indicado) ya usa el código oficial, sin distinguir mayúsculas.
    boolean existsByCodigoOficialIgnoreCaseAndIdNot(String codigoOficial, Long id);
    // Verifica si existe una provincia con el nombre indicado, sin distinguir mayúsculas.
    boolean existsByNombreIgnoreCase(String nombre);
    // Verifica si otra provincia (con ID distinto al indicado) ya usa el nombre, sin distinguir mayúsculas.
    boolean existsByNombreIgnoreCaseAndIdNot(String nombre, Long id);
    // Obtiene la provincia por su ID bloqueándola para escritura (PESSIMISTIC_WRITE).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Province p where p.id=:id") Optional<Province> lockById(@Param("id") Long id);
    // Busca provincias paginadas cuyo nombre o código oficial contiene el texto (sin distinguir mayúsculas).
    @Query("select p from Province p where lower(p.nombre) like lower(concat('%',:q,'%')) or lower(p.codigoOficial) like lower(concat('%',:q,'%'))") Page<Province> search(@Param("q") String q,Pageable pageable);
}
