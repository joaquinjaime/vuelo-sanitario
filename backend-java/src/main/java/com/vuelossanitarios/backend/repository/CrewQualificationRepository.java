package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.CrewQualification;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CrewQualificationRepository extends JpaRepository<CrewQualification,Long> {
 boolean existsByUserIdAndRoleCodigo(Long userId,String code);
 Optional<CrewQualification> findByUserIdAndRoleCodigo(Long userId,String code);
 List<CrewQualification> findByUserId(Long userId);
}
