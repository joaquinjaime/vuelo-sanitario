package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface RoleRepository extends JpaRepository<Role, UUID> { Optional<Role> findByCodigo(String codigo); }
