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
    /**
     * Aeronaves reservadas por vuelos sanitarios aprobados que todavía no tienen estado de vuelo (aeronave elegida y comandante pendiente): ocupan la aeronave en las mismas
     * condiciones que aircraftBusyIn, para que no se reserve dos veces ni se ofrezca para horarios incompatibles.
     */
    @Query("select f from Flight f where f.aircraft.id = :aircraftId and f.estadoVuelo is null and exists (select 1 from SanitaryFlight s where s.flight = f and s.estadoSolicitud.codigo = 'APROBADO') and ((f.fechaPlanificadaSalida < :end and f.fechaPlanificadaLlegada > :start) or (f.fechaPlanificadaLlegada is null and f.fechaPlanificadaSalida >= :start and f.fechaPlanificadaSalida < :end))")
    List<Flight> aircraftReservedIn(@Param("aircraftId") Long aircraftId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    @Query("select f from Flight f where f.comandante.id = :commanderId and f.fechaPlanificadaSalida < :end and f.fechaPlanificadaLlegada > :start and f.estadoVuelo.codigo in ('PENDIENTE_CONFIRMACION_COMANDANTE','PENDIENTE_RESPUESTA_OPERACIONES','PLANIFICADO','EN_CURSO')")
    List<Flight> overlappingCommander(@Param("commanderId") Long commanderId, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
    @Query("select f from Flight f where f.aircraft.id = :aircraftId and f.estadoVuelo.codigo in :states") List<Flight> activeAircraftAssignments(@Param("aircraftId") Long aircraftId,@Param("states") Collection<String> states);
    /** Vuelos comprometidos de todas las aeronaves en una sola consulta (listado administrativo). */
    @Query("select f from Flight f join fetch f.aircraft join fetch f.estadoVuelo where f.estadoVuelo.codigo in :states") List<Flight> committedWithAircraft(@Param("states") Collection<String> states);
    List<Flight> findByAircraftIdOrderByFechaPlanificadaSalidaDescIdDesc(Long aircraftId);
    @Query("select (count(f) > 0) from Flight f where f.comandante.id = :userId and f.estadoVuelo.codigo in :states") boolean existsOperationalCommanderAssignment(@Param("userId") Long userId,@Param("states") Collection<String> states);
    @Query("select f from Flight f join f.sanitario s where s.solicitadoPor.id=:userId") List<Flight> findSanitaryBySolicitadoPorId(@Param("userId") Long userId);
    /** Vuelos abiertos con comandante que llegan (según el horario planificado) a más tardar en {@code at}: base de la ubicación prevista de los comandantes (V66). */
    @Query("select f from Flight f join fetch f.comandante join fetch f.destino left join f.estadoVuelo st where f.fechaPlanificadaLlegada is not null and f.fechaPlanificadaLlegada <= :at and (st is null or st.codigo not in ('FINALIZADO','COMPLETADO','CANCELADO','RECHAZADO'))")
    List<Flight> openArrivingBy(@Param("at") LocalDateTime at);
    /** Vuelos abiertos de un comandante (sin estado, es decir con el comandante sólo reservado, incluidos). */
    @Query("select f from Flight f left join f.estadoVuelo st where f.comandante.id = :userId and (st is null or st.codigo not in ('FINALIZADO','COMPLETADO','CANCELADO','RECHAZADO'))")
    List<Flight> openOfCommander(@Param("userId") Long userId);
    List<Flight> findByComandanteId(Long userId);
    List<Flight> findByEstadoVueloCodigoIn(Collection<String> codes);
    boolean existsByOrigenIdOrDestinoId(Long origenId, Long destinoId);
}
