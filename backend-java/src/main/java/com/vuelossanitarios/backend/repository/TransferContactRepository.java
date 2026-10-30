package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.TransferContact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
/** Sólo los contactos vigentes de la solicitud; los retirados se conservan como historial. */
public interface TransferContactRepository extends JpaRepository<TransferContact, Long> {
 @Query("select c from TransferContact c where c.flight.id=:flightId and c.fechaBaja is null order by c.principal desc, c.id")
 List<TransferContact> findActiveByFlightId(@Param("flightId") Long flightId);
 @Query("select c from TransferContact c where c.id=:id and c.flight.id=:flightId and c.fechaBaja is null")
 Optional<TransferContact> findActiveByIdAndFlightId(@Param("id") Long id,@Param("flightId") Long flightId);
}
