package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;import java.util.*;
/** Escritura de eventos (vía AuditService) y consultas de historial por entidad. La consulta por perfil está en {@link AuditQueryRepository}. */
public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {
 List<AuditEvent> findByEntityTypeAndEntityIdOrderByOccurredAtDesc(String type,Long id);
 Slice<AuditEvent> findByEntityTypeAndEntityIdAndOperationOrderByIdDesc(String type,Long id,String operation,Pageable pageable);
 Slice<AuditEvent> findByEntityTypeAndEntityIdAndOperationInOrderByIdDesc(String type,Long id,Collection<String> operations,Pageable pageable);
}
