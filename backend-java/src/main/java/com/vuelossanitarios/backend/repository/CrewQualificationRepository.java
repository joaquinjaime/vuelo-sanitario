package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.CrewQualification;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Las consultas de uso corriente ven sólo clasificaciones vigentes (sin fecha de baja); el historial se pide aparte. */
public interface CrewQualificationRepository extends JpaRepository<CrewQualification,Long> {
 @Query("select count(q)>0 from CrewQualification q where q.user.id=:userId and q.role.codigo=:code and q.retiredAt is null") boolean existsByUserIdAndRoleCodigo(@Param("userId") Long userId,@Param("code") String code);
 @Query("select q from CrewQualification q where q.user.id=:userId and q.role.codigo=:code and q.retiredAt is null") Optional<CrewQualification> findByUserIdAndRoleCodigo(@Param("userId") Long userId,@Param("code") String code);
 @Query("select q from CrewQualification q join fetch q.role where q.user.id=:userId and q.retiredAt is null") List<CrewQualification> findByUserId(@Param("userId") Long userId);
 @Query("select q from CrewQualification q join fetch q.user u left join fetch u.person where q.role.codigo=:code and q.retiredAt is null") List<CrewQualification> findByRoleCodigo(@Param("code") String code);
 /** Vigentes e historial de una persona, la más reciente primero. */
 @Query("select q from CrewQualification q join fetch q.role left join fetch q.classifier left join fetch q.retiredBy where q.user.id=:userId order by q.id desc") List<CrewQualification> findAllByUserId(@Param("userId") Long userId);
}
