package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.CrewQualification;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

public interface CrewQualificationRepository extends JpaRepository<CrewQualification,Long> {
 boolean existsByUserIdAndRoleCodigo(Long userId,String code);
 Optional<CrewQualification> findByUserIdAndRoleCodigo(Long userId,String code);
 List<CrewQualification> findByUserId(Long userId);
 @EntityGraph(attributePaths={"user","user.person"}) List<CrewQualification> findByRoleCodigo(String code);
}
