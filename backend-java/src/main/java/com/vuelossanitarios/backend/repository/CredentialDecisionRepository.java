package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.CredentialDecision;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CredentialDecisionRepository extends JpaRepository<CredentialDecision,Long> {
 List<CredentialDecision> findByCredentialIdOrderByIdDesc(Long credentialId);
}
