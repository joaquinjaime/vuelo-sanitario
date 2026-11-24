/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla obligaciones_informe_final.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde
 *   FinalReportWorkflowService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.*;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface FinalReportObligationRepository extends JpaRepository<FinalReportObligation,Long>{
 // Obtiene la obligación de informe final por su ID bloqueándola para escritura (PESSIMISTIC_WRITE).
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select o from FinalReportObligation o where o.id=:id") Optional<FinalReportObligation> lockById(@Param("id") Long id);
 // Obtiene y bloquea para escritura (PESSIMISTIC_WRITE) la obligación de informe final vigente del vuelo.
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select o from FinalReportObligation o where o.flight.id=:flightId and o.current=true") Optional<FinalReportObligation> lockCurrentByFlightId(@Param("flightId") Long flightId);
 // Obtiene, sin bloqueo, la obligación de informe final vigente del vuelo.
 Optional<FinalReportObligation> findByFlightIdAndCurrentTrue(Long flightId);
 // Obtiene las obligaciones de informe final vigentes del comandante, ordenadas por vencimiento ascendente.
 List<FinalReportObligation> findByCommanderIdAndCurrentTrueOrderByDueAtAsc(Long commanderId);
 // Obtiene las obligaciones de informe final vigentes en el estado indicado, ordenadas por fecha de presentación ascendente.
 List<FinalReportObligation> findByStatusAndCurrentTrueOrderByPresentedAtAsc(FinalReportStatus status);
 // Obtiene las obligaciones de informe final vigentes en cualquiera de los estados indicados, ordenadas por vencimiento ascendente.
 List<FinalReportObligation> findByStatusInAndCurrentTrueOrderByDueAtAsc(Collection<FinalReportStatus> statuses);
 // Verifica si el comandante tiene alguna obligación vigente en los estados indicados con vencimiento igual o anterior al instante dado.
 boolean existsByCommanderIdAndCurrentTrueAndStatusInAndDueAtLessThanEqual(Long commanderId, Collection<FinalReportStatus> statuses, OffsetDateTime now);
}
