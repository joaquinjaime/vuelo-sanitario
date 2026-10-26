package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightDocument;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface FlightDocumentRepository extends JpaRepository<FlightDocument, Long> {
 @Query("select max(d.numeroVersion) from FlightDocument d where d.documentItem.id=:itemId") Integer maxNumeroVersion(@Param("itemId") Long itemId);
 List<FlightDocument> findByDocumentItemIdOrderByNumeroVersionDesc(Long itemId);
 Optional<FlightDocument> findByDocumentItemIdAndEsVersionActualTrue(Long itemId);
 Optional<FlightDocument> findFirstByDocumentItemIdOrderByNumeroVersionAsc(Long itemId);
 long countByDocumentItemId(Long itemId);
}
