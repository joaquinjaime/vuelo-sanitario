package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.ExternalCredentialCheck;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ExternalCredentialCheckRepository extends JpaRepository<ExternalCredentialCheck,Long> {
 List<ExternalCredentialCheck> findByCredentialIdOrderByIdDesc(Long credentialId);
 Optional<ExternalCredentialCheck> findFirstByCredentialIdOrderByIdDesc(Long credentialId);
}
