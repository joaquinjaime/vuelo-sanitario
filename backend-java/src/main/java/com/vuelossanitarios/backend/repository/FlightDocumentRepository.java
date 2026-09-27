package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightDocument;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface FlightDocumentRepository extends JpaRepository<FlightDocument, UUID> {
 @Query("select max(d.version) from FlightDocument d where d.documentItem.id=:itemId") Integer maxVersion(@Param("itemId") UUID itemId);
 List<FlightDocument> findByDocumentItemIdOrderByVersionDesc(UUID itemId);
 Optional<FlightDocument> findByDocumentItemIdAndEsVersionActualTrue(UUID itemId);
}
