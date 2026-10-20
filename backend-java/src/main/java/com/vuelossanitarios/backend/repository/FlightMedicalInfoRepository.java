package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightMedicalInfo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightMedicalInfoRepository extends JpaRepository<FlightMedicalInfo, Long> { Optional<FlightMedicalInfo> findByFlightId(Long flightId); }
