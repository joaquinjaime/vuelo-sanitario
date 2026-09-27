package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightDocumentItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface DocumentItemRepository extends JpaRepository<FlightDocumentItem, UUID> {
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select d from FlightDocumentItem d where d.id=:id") Optional<FlightDocumentItem> lockById(@Param("id") UUID id);
}
