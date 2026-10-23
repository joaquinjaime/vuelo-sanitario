package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.WeatherSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface WeatherSnapshotRepository extends JpaRepository<WeatherSnapshot, Long> {
 List<WeatherSnapshot> findByFlightIdOrderByFechaRegistroDescIdDesc(Long flightId);
}
