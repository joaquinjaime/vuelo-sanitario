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
 /** Documentos anteriores a V59 que todavía no fueron analizados con resultado (ni limpios ni rechazados) y siguen activos. */
 @Query("select d from CredentialDocument d where d.origin='ANTERIOR_V59' and d.retiredAt is null and d.scanStatus not in ('LIMPIO','RECHAZADO') order by d.id") List<CredentialDocument> findLegacyPending(org.springframework.data.domain.Pageable page);
 /** Sólo las claves de archivo: no carga entidades (cargarlas dejaría proxies sin inicializar de las habilitaciones en el contexto, con campos públicos nulos). */
 @Query("select d.key from CredentialDocument d where d.origin='ANTERIOR_V59' and d.retiredAt is null and d.scanStatus not in ('LIMPIO','RECHAZADO')") List<String> findLegacyPendingKeys();
 @Query("select d.scanStatus,count(d) from CredentialDocument d where d.origin='ANTERIOR_V59' group by d.scanStatus") List<Object[]> countLegacyByStatus();
 @Query("select count(d) from CredentialDocument d where d.origin='ANTERIOR_V59' and d.hashMoment is null") long countLegacyWithoutHash();
}
