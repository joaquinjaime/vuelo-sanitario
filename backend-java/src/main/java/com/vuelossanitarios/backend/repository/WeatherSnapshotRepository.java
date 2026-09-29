package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.WeatherSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface WeatherSnapshotRepository extends JpaRepository<WeatherSnapshot, UUID> {}
