package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightCrew;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface FlightCrewRepository extends JpaRepository<FlightCrew, UUID> { boolean existsByFlightIdAndUserId(UUID flightId, UUID userId); }
