/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla roles.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene el rol por su código.
public interface RoleRepository extends JpaRepository<Role, Long> { Optional<Role> findByCodigo(String codigo); }
