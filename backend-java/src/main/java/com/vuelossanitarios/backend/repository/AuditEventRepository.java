package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;import java.util.*;
/** Escritura de eventos (vía AuditService) y consultas de historial por entidad. La consulta por perfil está en {@link AuditQueryRepository}. */
public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {
    // Obtiene los eventos de auditoría de la entidad indicada (tipo e ID), del más reciente al más antiguo.
    List<AuditEvent> findByEntityTypeAndEntityIdOrderByOccurredAtDesc(String type,Long id);
    // Obtiene una porción paginada de los eventos de auditoría de la entidad indicada con alguna de las operaciones dadas, por ID descendente.
    Slice<AuditEvent> findByEntityTypeAndEntityIdAndOperationInOrderByIdDesc(String type,Long id,Collection<String> operations,Pageable pageable);
}
