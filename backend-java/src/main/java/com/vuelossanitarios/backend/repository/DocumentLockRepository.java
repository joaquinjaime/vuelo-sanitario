package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.DocumentLock;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentLockRepository extends JpaRepository<DocumentLock,Long> {
 Optional<DocumentLock> findByDocumentItemId(Long itemId);
}
