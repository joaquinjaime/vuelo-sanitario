package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.SanitaryFlight;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene la solicitud de vuelo sanitario asociada al vuelo.
public interface SanitaryFlightRepository extends JpaRepository<SanitaryFlight,Long>{Optional<SanitaryFlight> findByFlightId(Long flightId);}
