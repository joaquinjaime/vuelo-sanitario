package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.CredentialPolicy;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface CredentialPolicyRepository extends JpaRepository<CredentialPolicy,Long> {
 @Query("select p from CredentialPolicy p where p.active=true and p.role.codigo=:role order by p.id") List<CredentialPolicy> findActiveByRole(@Param("role") String role);
 List<CredentialPolicy> findAllByOrderByIdDesc();
 /** Código de la función de una política sin cargarla (para bloquear la función antes de leer la política). */
 @Query("select p.role.codigo from CredentialPolicy p where p.id=:id") Optional<String> findRoleCodeById(@Param("id") Long id);
}
