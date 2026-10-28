package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.CredentialPolicy;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface CredentialPolicyRepository extends JpaRepository<CredentialPolicy,Long> {
 @Query("select p from CredentialPolicy p where p.active=true and p.role.codigo=:role order by p.id") List<CredentialPolicy> findActiveByRole(@Param("role") String role);
 List<CredentialPolicy> findAllByOrderByIdDesc();
}
