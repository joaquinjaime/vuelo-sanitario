package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightAuditLog;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface FlightAuditLogRepository extends JpaRepository<FlightAuditLog,Long> {
 @Query("select e from FlightAuditLog e where e.flight.id=:flight and e.origen is not null order by e.ocurrido desc,e.id desc")
 Slice<FlightAuditLog> history(@Param("flight") Long flight,Pageable page);
 boolean existsByFlightIdAndOrigenAndTipo(Long flight,String origin,String type);
}
