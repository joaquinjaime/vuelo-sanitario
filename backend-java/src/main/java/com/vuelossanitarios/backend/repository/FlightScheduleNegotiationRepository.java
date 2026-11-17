package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.FlightScheduleNegotiation;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface FlightScheduleNegotiationRepository extends JpaRepository<FlightScheduleNegotiation,Long> {
 // Obtiene los eventos de negociación de horario del vuelo con su actor, ordenados por fecha de ocurrencia ascendente.
 @EntityGraph(attributePaths="actor") List<FlightScheduleNegotiation> findByFlightIdOrderByFechaOcurrenciaAsc(Long flightId);
 // Obtiene los eventos de negociación de horario del vuelo con su actor y el evento respondido, ordenados por fecha de ocurrencia e ID.
 @EntityGraph(attributePaths={"actor","respondida"}) List<FlightScheduleNegotiation> findByFlightIdOrderByFechaOcurrenciaAscIdAsc(Long flightId);
 // Verifica si existe algún evento de negociación que responde al evento con el ID indicado.
 boolean existsByRespondidaId(Long id);
}
