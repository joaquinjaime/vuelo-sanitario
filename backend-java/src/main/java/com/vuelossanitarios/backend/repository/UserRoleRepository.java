package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.UserRole;
import com.vuelossanitarios.backend.domain.user.UserRoleId;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserRoleRepository extends JpaRepository<UserRole, UserRoleId> {}
