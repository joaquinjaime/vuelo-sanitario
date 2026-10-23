package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.ProfessionalCredential;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface ProfessionalCredentialRepository extends JpaRepository<ProfessionalCredential,Long> {
 List<ProfessionalCredential> findByPersonIdOrderByIdDesc(Long personId);
 List<ProfessionalCredential> findByPersonIdAndRoleCodigoAndStatus(Long personId,String code,String status);
 @Query("select u.id from User u, ProfessionalCredential c where c.id=:id and u.person.id=c.person.id") Long findOwnerUserId(@Param("id") Long id);
}
