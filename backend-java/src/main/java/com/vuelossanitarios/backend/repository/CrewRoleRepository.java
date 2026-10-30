package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CrewRoleRepository extends JpaRepository<CrewRole, Long> {
    Optional<CrewRole> findByCodigo(String codigo);
    /** Serializa a quienes modifican la política de las mismas funciones (alta, baja y activación por lotes), en orden de identificador. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select r from CrewRole r where r.codigo in :codes order by r.id")
    List<CrewRole> lockByCodes(@org.springframework.data.repository.query.Param("codes") Collection<String> codes);
}
