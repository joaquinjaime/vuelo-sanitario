package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightFinalReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene la versión actual del informe final del vuelo.
// Cuenta las versiones de informe final registradas para el vuelo.
// Obtiene todas las versiones del informe final del vuelo, de la más nueva a la más antigua.
public interface FlightFinalReportRepository extends JpaRepository<FlightFinalReport, Long> { Optional<FlightFinalReport> findByFlightIdAndEsVersionActualTrue(Long flightId); Integer countByFlightId(Long flightId); List<FlightFinalReport> findByFlightIdOrderByVersionDesc(Long flightId); }
