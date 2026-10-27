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
 List<Airport> findTop50ByActivoTrueAndProvinciaReferencialIdAndNombreContainingIgnoreCaseOrderByNombreAsc(Long provinciaId, String query);
 @Query("select a from Airport a left join fetch a.provinciaReferencial left join fetch a.localidad order by a.nombre") List<Airport> findAllDetailedOrderByNombre();
 long countByProvinciaReferencial_IdAndActivoTrue(Long provinceId);
 long countByLocalidad_IdAndActivoTrue(Long localityId);
 boolean existsByCodigoOaciIgnoreCase(String code);
 boolean existsByCodigoOaciIgnoreCaseAndIdNot(String code,Long id);
 boolean existsByCodigoIataIgnoreCase(String code);
 boolean existsByCodigoIataIgnoreCaseAndIdNot(String code,Long id);
 boolean existsByCodigoOficialIgnoreCase(String code);
 boolean existsByCodigoOficialIgnoreCaseAndIdNot(String code,Long id);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from Airport a left join fetch a.provinciaReferencial left join fetch a.localidad where a.id=:id") Optional<Airport> lockById(@Param("id") Long id);
 @EntityGraph(attributePaths={"provinciaReferencial","localidad"}) @Query("select a from Airport a where lower(a.nombre) like lower(concat('%',:q,'%')) or lower(coalesce(a.codigoOficial,'')) like lower(concat('%',:q,'%')) or lower(coalesce(a.codigoOaci,'')) like lower(concat('%',:q,'%')) or lower(coalesce(a.codigoIata,'')) like lower(concat('%',:q,'%'))") Page<Airport> search(@Param("q") String q,Pageable pageable);
}
