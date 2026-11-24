/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla aeropuertos.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde CatalogController,
 *   GeographicCatalogService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
public interface AirportRepository extends JpaRepository<Airport, Long> {
 // Obtiene hasta 50 aeropuertos activos de la provincia indicada cuyo nombre contiene el texto (sin distinguir mayúsculas), ordenados por nombre.
 List<Airport> findTop50ByActivoTrueAndProvinciaReferencialIdAndNombreContainingIgnoreCaseOrderByNombreAsc(Long provinciaId, String query);
 // Obtiene todos los aeropuertos con su provincia y su localidad (left join fetch), ordenados por nombre.
 @Query("select a from Airport a left join fetch a.provinciaReferencial left join fetch a.localidad order by a.nombre") List<Airport> findAllDetailedOrderByNombre();
 // Verifica si existe un aeropuerto con el código OACI indicado, sin distinguir mayúsculas.
 boolean existsByCodigoOaciIgnoreCase(String code);
 // Verifica si otro aeropuerto (con ID distinto al indicado) ya usa el código OACI, sin distinguir mayúsculas.
 boolean existsByCodigoOaciIgnoreCaseAndIdNot(String code,Long id);
 // Verifica si existe un aeropuerto con el código IATA indicado, sin distinguir mayúsculas.
 boolean existsByCodigoIataIgnoreCase(String code);
 // Verifica si otro aeropuerto (con ID distinto al indicado) ya usa el código IATA, sin distinguir mayúsculas.
 boolean existsByCodigoIataIgnoreCaseAndIdNot(String code,Long id);
 // Verifica si existe un aeropuerto con el código oficial indicado, sin distinguir mayúsculas.
 boolean existsByCodigoOficialIgnoreCase(String code);
 // Verifica si otro aeropuerto (con ID distinto al indicado) ya usa el código oficial, sin distinguir mayúsculas.
 boolean existsByCodigoOficialIgnoreCaseAndIdNot(String code,Long id);
 /** Sin joins: el bloqueo alcanza sólo la fila del aeropuerto (la provincia y la localidad se bloquean antes y por separado, en el orden provincia → localidad → aeropuerto). */
 // Obtiene el aeropuerto por su ID bloqueando sólo su fila para escritura (PESSIMISTIC_WRITE).
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from Airport a where a.id=:id") Optional<Airport> lockById(@Param("id") Long id);
 /** Lectura sin bloqueo de los padres actuales (provincia, localidad) para decidir el orden de bloqueo. */
 // Obtiene, sin bloqueo, los IDs de la provincia y la localidad actuales del aeropuerto indicado.
 @Query("select a.provinciaReferencial.id, a.localidad.id from Airport a where a.id=:id") List<Object[]> parentIds(@Param("id") Long id);
 // Busca aeropuertos paginados cuyo nombre o código oficial, OACI o IATA contiene el texto (sin distinguir mayúsculas), con provincia y localidad.
 @EntityGraph(attributePaths={"provinciaReferencial","localidad"}) @Query("select a from Airport a where lower(a.nombre) like lower(concat('%',:q,'%')) or lower(coalesce(a.codigoOficial,'')) like lower(concat('%',:q,'%')) or lower(coalesce(a.codigoOaci,'')) like lower(concat('%',:q,'%')) or lower(coalesce(a.codigoIata,'')) like lower(concat('%',:q,'%'))") Page<Airport> search(@Param("q") String q,Pageable pageable);
}
