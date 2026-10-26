package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.Flight;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.*;
public interface FlightRepository extends JpaRepository<Flight, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select f from Flight f where f.id = :id") Optional<Flight> lockById(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_READ) @Query("select f from Flight f where f.id = :id") Optional<Flight> readLockedById(@Param("id") Long id);
    @Query("select f from Flight f where f.aircraft.id = :aircraftId and f.fechaPlanificadaSalida < :end and f.fechaPlanificadaLlegada > :start and f.estadoVuelo.codigo in ('PENDIENTE_CONFIRMACION_COMANDANTE','PENDIENTE_RESPUESTA_OPERACIONES','PLANIFICADO','EN_CURSO')")
    List<Flight> overlappingAircraft(@Param("aircraftId") Long aircraftId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    /**
     * Compromisos de una aeronave en [start, end): los vuelos cuyo intervalo planificado se superpone (misma regla que overlappingAircraft)
     * y, además, los vuelos comprometidos que ya tienen salida pero todavía no llegada (sanitarios antes de la planificación del comandante),
     * que ocupan al menos su instante de salida. Es la única consulta de disponibilidad de aeronaves para listados, asignaciones y cambios.
     */
    @Query("select f from Flight f where f.aircraft.id = :aircraftId and f.estadoVuelo.codigo in ('PENDIENTE_CONFIRMACION_COMANDANTE','PENDIENTE_RESPUESTA_OPERACIONES','PLANIFICADO','EN_CURSO') and ((f.fechaPlanificadaSalida < :end and f.fechaPlanificadaLlegada > :start) or (f.fechaPlanificadaLlegada is null and f.fechaPlanificadaSalida >= :start and f.fechaPlanificadaSalida < :end))")
    List<Flight> aircraftBusyIn(@Param("aircraftId") Long aircraftId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    @Query("select f from Flight f where f.comandante.id = :commanderId and f.fechaPlanificadaSalida < :end and f.fechaPlanificadaLlegada > :start and f.estadoVuelo.codigo in ('PENDIENTE_CONFIRMACION_COMANDANTE','PENDIENTE_RESPUESTA_OPERACIONES','PLANIFICADO','EN_CURSO')")
    List<Flight> overlappingCommander(@Param("commanderId") Long commanderId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    @Query("select f from Flight f where f.aircraft.id = :aircraftId and f.estadoVuelo.codigo in :states") List<Flight> activeAircraftAssignments(@Param("aircraftId") Long aircraftId,@Param("states") Collection<String> states);
    /** Vuelos comprometidos de todas las aeronaves en una sola consulta (listado administrativo). */
    @Query("select f from Flight f join fetch f.aircraft join fetch f.estadoVuelo where f.estadoVuelo.codigo in :states") List<Flight> committedWithAircraft(@Param("states") Collection<String> states);
    List<Flight> findByAircraftIdOrderByFechaPlanificadaSalidaDescIdDesc(Long aircraftId);
    @Query("select (count(f) > 0) from Flight f where f.comandante.id = :userId and f.estadoVuelo.codigo in :states") boolean existsOperationalCommanderAssignment(@Param("userId") Long userId,@Param("states") Collection<String> states);
    @Query("select f from Flight f join f.sanitario s where s.solicitadoPor.id=:userId") List<Flight> findSanitaryBySolicitadoPorId(@Param("userId") Long userId);
    List<Flight> findByComandanteId(Long userId);
    List<Flight> findByEstadoVueloCodigoIn(Collection<String> codes);
    boolean existsByOrigenIdOrDestinoId(Long origenId, Long destinoId);
}
