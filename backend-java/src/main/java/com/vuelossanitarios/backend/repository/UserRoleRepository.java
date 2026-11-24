/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla usuarios_roles.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde AuthService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserRoleRepository extends JpaRepository<UserRole, Long> {}
