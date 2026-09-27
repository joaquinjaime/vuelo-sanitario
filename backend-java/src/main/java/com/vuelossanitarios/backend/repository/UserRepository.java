package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.User;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface UserRepository extends JpaRepository<User, UUID> {
    @Query("select u from User u left join fetch u.userRoles ur left join fetch ur.role where u.username = :username")
    Optional<User> findWithRolesByUsername(@Param("username") String username);
    @Query("select distinct u from User u join u.userRoles ur join ur.role r where r.codigo = :role and u.activo = true")
    List<User> findActiveByRoleCode(@Param("role") String role);
    boolean existsByUsername(String username); boolean existsByEmail(String email);
}
