package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightHealthStaff;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
/** Salvo {@link #findHistoryByFlightId}, las consultas consideran únicamente participaciones vigentes (sin baja). */
public interface FlightHealthStaffRepository extends JpaRepository<FlightHealthStaff,Long>{
 @Query("select a from FlightHealthStaff a join fetch a.staff s join fetch s.person left join fetch a.assignedBy left join fetch a.removedBy where a.flight.id=:flightId order by a.id") List<FlightHealthStaff> findHistoryByFlightId(@Param("flightId") Long flightId);
 @Query("select a from FlightHealthStaff a join fetch a.staff s join fetch s.person left join fetch a.assignedBy where a.flight.id=:flightId and a.removedAt is null order by a.id") List<FlightHealthStaff> findCurrentByFlightId(@Param("flightId") Long flightId);
 boolean existsByFlightIdAndStaffIdAndRemovedAtIsNull(Long flightId,Long staffId);
 @Query("select a from FlightHealthStaff a join fetch a.flight f where a.staff.id=:staffId and a.removedAt is null") List<FlightHealthStaff> findCurrentByStaffId(@Param("staffId") Long staffId);
}
