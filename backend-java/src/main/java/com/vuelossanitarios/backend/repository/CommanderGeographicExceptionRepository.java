package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.CommanderGeographicException;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface CommanderGeographicExceptionRepository extends JpaRepository<CommanderGeographicException,Long>{
 /** Excepciones vigentes del vuelo (las de comandantes ya reemplazados quedan como historial). */
 @Query("select e from CommanderGeographicException e join fetch e.commander join fetch e.authorizedBy left join fetch e.commanderLocality where e.flight.id=:flightId and e.replacedAt is null order by e.id desc")
 List<CommanderGeographicException> findCurrentByFlightId(@Param("flightId") Long flightId);
 @Query("select e from CommanderGeographicException e join fetch e.commander join fetch e.authorizedBy left join fetch e.commanderLocality where e.flight.id=:flightId order by e.id desc")
 List<CommanderGeographicException> findAllByFlightId(@Param("flightId") Long flightId);
}
