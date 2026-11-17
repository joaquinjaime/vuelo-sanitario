package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightHealthStaff;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
/** Salvo {@link #findHistoryByFlightId}, las consultas consideran únicamente participaciones vigentes (sin baja). */
public interface FlightHealthStaffRepository extends JpaRepository<FlightHealthStaff,Long>{
 // Obtiene todas las participaciones de personal de salud del vuelo (vigentes y retiradas) con persona, asignador y quien la retiró, ordenadas por ID.
 @Query("select a from FlightHealthStaff a join fetch a.staff s join fetch s.person left join fetch a.assignedBy left join fetch a.removedBy where a.flight.id=:flightId order by a.id") List<FlightHealthStaff> findHistoryByFlightId(@Param("flightId") Long flightId);
 // Obtiene las participaciones vigentes de personal de salud del vuelo con persona y asignador, ordenadas por ID.
 @Query("select a from FlightHealthStaff a join fetch a.staff s join fetch s.person left join fetch a.assignedBy where a.flight.id=:flightId and a.removedAt is null order by a.id") List<FlightHealthStaff> findCurrentByFlightId(@Param("flightId") Long flightId);
 // Verifica si el integrante de personal de salud tiene una participación vigente en el vuelo.
 boolean existsByFlightIdAndStaffIdAndRemovedAtIsNull(Long flightId,Long staffId);
 // Obtiene las participaciones vigentes del integrante de personal de salud, con su vuelo cargado.
 @Query("select a from FlightHealthStaff a join fetch a.flight f where a.staff.id=:staffId and a.removedAt is null") List<FlightHealthStaff> findCurrentByStaffId(@Param("staffId") Long staffId);
}
