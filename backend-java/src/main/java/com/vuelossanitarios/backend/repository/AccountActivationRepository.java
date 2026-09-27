package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.AccountActivation;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface AccountActivationRepository extends JpaRepository<AccountActivation, UUID> {
 @Query("select a from AccountActivation a join fetch a.user u join fetch u.person p where p.dni=:dni and a.usedAt is null order by a.createdAt desc") List<AccountActivation> findOpenByDni(@Param("dni") String dni);
 @Query("select a from AccountActivation a where a.user.id=:userId and a.usedAt is null") List<AccountActivation> findOpenByUserId(@Param("userId") UUID userId);
}
