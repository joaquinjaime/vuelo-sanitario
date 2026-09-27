package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.*;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface FinalReportObligationRepository extends JpaRepository<FinalReportObligation,UUID>{
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select o from FinalReportObligation o where o.id=:id") Optional<FinalReportObligation> lockById(@Param("id") UUID id);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select o from FinalReportObligation o where o.flight.id=:flightId and o.current=true") Optional<FinalReportObligation> lockCurrentByFlightId(@Param("flightId") UUID flightId);
 Optional<FinalReportObligation> findByFlightIdAndCurrentTrue(UUID flightId);
 List<FinalReportObligation> findByCommanderIdAndCurrentTrueOrderByDueAtAsc(UUID commanderId);
 List<FinalReportObligation> findByStatusAndCurrentTrueOrderByPresentedAtAsc(FinalReportStatus status);
 boolean existsByCommanderIdAndCurrentTrueAndStatusInAndDueAtLessThanEqual(UUID commanderId, Collection<FinalReportStatus> statuses, OffsetDateTime now);
}
