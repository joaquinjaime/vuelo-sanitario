package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.CredentialDocument;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface CredentialDocumentRepository extends JpaRepository<CredentialDocument,Long> {
 List<CredentialDocument> findByCredentialIdOrderByIdDesc(Long id);
 boolean existsByCredentialId(Long id);
 @Query("select d from CredentialDocument d where d.credential.id=:id and d.retiredAt is null order by d.id desc") List<CredentialDocument> findActiveByCredentialId(@Param("id") Long id);
 @Query("select d.credential.id from CredentialDocument d where d.id=:id") Long findCredentialId(@Param("id") Long id);
 @Query("select d from CredentialDocument d where d.retiredAt is null and d.scanStatus in :statuses and d.uploadedAt < :cutoff order by d.id") List<CredentialDocument> findPendingScans(@Param("statuses") java.util.Collection<String> statuses,@Param("cutoff") java.time.LocalDateTime cutoff,org.springframework.data.domain.Pageable page);
 boolean existsBySha256AndCredentialIdAndRetiredAtIsNull(String hash,Long credentialId);
}
