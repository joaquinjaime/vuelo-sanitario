package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.CredentialDocument;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CredentialDocumentRepository extends JpaRepository<CredentialDocument,Long> {
 List<CredentialDocument> findByCredentialIdOrderByIdDesc(Long id);
 boolean existsByCredentialId(Long id);
}
