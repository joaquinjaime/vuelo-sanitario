package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.HangarInfo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface HangarInfoRepository extends JpaRepository<HangarInfo, Long> {
    Optional<HangarInfo> findByFlightIdAndEsVersionActualTrue(Long flightId);
    List<HangarInfo> findByFlightIdOrderByVersionDesc(Long flightId);
}
