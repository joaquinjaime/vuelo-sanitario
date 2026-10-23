package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.FlightScheduleNegotiation;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface FlightScheduleNegotiationRepository extends JpaRepository<FlightScheduleNegotiation,Long> {
 @EntityGraph(attributePaths="actor") List<FlightScheduleNegotiation> findByFlightIdOrderByFechaOcurrenciaAsc(Long flightId);
 @EntityGraph(attributePaths={"actor","respondida"}) List<FlightScheduleNegotiation> findByFlightIdOrderByFechaOcurrenciaAscIdAsc(Long flightId);
 boolean existsByRespondidaId(Long id);
}
