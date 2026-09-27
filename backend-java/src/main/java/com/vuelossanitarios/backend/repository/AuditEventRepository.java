package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.audit.AuditEvent;
import org.springframework.data.domain.*;import org.springframework.data.jpa.repository.JpaRepository;import java.util.*;
public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {Page<AuditEvent> findByFlightIdOrderByOccurredAtDesc(UUID flightId,Pageable pageable);Page<AuditEvent> findAllByOrderByOccurredAtDesc(Pageable pageable);}
