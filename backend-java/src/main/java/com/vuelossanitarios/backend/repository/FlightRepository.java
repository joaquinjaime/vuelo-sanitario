package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.Flight;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.*;
public interface FlightRepository extends JpaRepository<Flight, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select f from Flight f where f.id = :id") Optional<Flight> lockById(@Param("id") UUID id);
    @Query("select f from Flight f where f.aircraft.id = :aircraftId and f.fechaPlanificadaSalida < :end and f.fechaPlanificadaLlegada > :start and f.status.codigo in ('APROBADO','PLANIFICADO','EN_CURSO')")
    List<Flight> overlappingAircraft(@Param("aircraftId") UUID aircraftId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    @Query("select f from Flight f where f.comandante.id = :commanderId and f.fechaPlanificadaSalida < :end and f.fechaPlanificadaLlegada > :start and f.status.codigo in ('APROBADO','PLANIFICADO','EN_CURSO')")
    List<Flight> overlappingCommander(@Param("commanderId") UUID commanderId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    List<Flight> findBySolicitadoPorId(UUID userId); List<Flight> findByComandanteId(UUID userId);
}
