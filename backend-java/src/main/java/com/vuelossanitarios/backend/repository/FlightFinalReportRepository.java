package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightFinalReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightFinalReportRepository extends JpaRepository<FlightFinalReport, Long> { Optional<FlightFinalReport> findByFlightIdAndEsVersionActualTrue(Long flightId); Integer countByFlightId(Long flightId); }
