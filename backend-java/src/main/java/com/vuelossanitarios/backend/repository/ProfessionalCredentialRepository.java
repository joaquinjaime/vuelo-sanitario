package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.ProfessionalCredential;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface ProfessionalCredentialRepository extends JpaRepository<ProfessionalCredential,Long> {
 List<ProfessionalCredential> findByPersonIdOrderByIdDesc(Long personId);
 List<ProfessionalCredential> findByPersonIdAndRoleCodigoAndStatus(Long personId,String code,String status);
 /** Verificadas cuyo único sustento documental activo son documentos anteriores a V59 aún sin resultado limpio. */
 @Query("select c from ProfessionalCredential c where c.status='VERIFICADA' and exists (select 1 from CredentialDocument d where d.credential=c and d.retiredAt is null and d.origin='ANTERIOR_V59' and d.scanStatus<>'LIMPIO') and not exists (select 1 from CredentialDocument k where k.credential=c and k.retiredAt is null and k.scanStatus='LIMPIO') order by c.id") List<ProfessionalCredential> findVerifiedSupportedOnlyByUnscannedLegacy();
 /** Habilitaciones verificadas por función y tipo, para comprobar qué tipos reconocería una política. */
 @Query("select c.role.codigo,c.type,count(c) from ProfessionalCredential c where c.status='VERIFICADA' group by c.role.codigo,c.type") List<Object[]> countVerifiedByRoleAndType();
 boolean existsByRenewsIdAndStatusIn(Long id,java.util.Collection<String> statuses);
 @Query("select c from ProfessionalCredential c where c.status='VERIFICADA' and c.expires is not null and c.expires>=:from and c.expires<=:limit order by c.expires") List<ProfessionalCredential> findExpiringVerified(@Param("from") java.time.LocalDate from,@Param("limit") java.time.LocalDate limit);
 @Query("select count(r)>0 from ProfessionalCredential r where r.renewsId=:id and r.status='VERIFICADA' and (r.expires is null or r.expires>=:today)") boolean existsCurrentRenewal(@Param("id") Long id,@Param("today") java.time.LocalDate today);
 @Query("select u.id from User u, ProfessionalCredential c where c.id=:id and u.person.id=c.person.id") Long findOwnerUserId(@Param("id") Long id);
}
