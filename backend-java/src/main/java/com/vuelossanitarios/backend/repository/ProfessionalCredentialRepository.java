package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.ProfessionalCredential;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface ProfessionalCredentialRepository extends JpaRepository<ProfessionalCredential,Long> {
 List<ProfessionalCredential> findByPersonIdOrderByIdDesc(Long personId);
 List<ProfessionalCredential> findByPersonIdAndRoleCodigoAndStatus(Long personId,String code,String status);
 boolean existsByRenewsIdAndStatusIn(Long id,java.util.Collection<String> statuses);
 @Query("select c from ProfessionalCredential c where c.status='VERIFICADA' and c.expires is not null and c.expires>=:from and c.expires<=:limit order by c.expires") List<ProfessionalCredential> findExpiringVerified(@Param("from") java.time.LocalDate from,@Param("limit") java.time.LocalDate limit);
 @Query("select count(r)>0 from ProfessionalCredential r where r.renewsId=:id and r.status='VERIFICADA' and (r.expires is null or r.expires>=:today)") boolean existsCurrentRenewal(@Param("id") Long id,@Param("today") java.time.LocalDate today);
 @Query("select u.id from User u, ProfessionalCredential c where c.id=:id and u.person.id=c.person.id") Long findOwnerUserId(@Param("id") Long id);
}
