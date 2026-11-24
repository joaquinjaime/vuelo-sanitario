/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla roles_tripulacion.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.CrewRole;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CrewRoleRepository extends JpaRepository<CrewRole, Long> {
    // Obtiene la función de tripulación por su código.
    Optional<CrewRole> findByCodigo(String codigo);
    /** Serializa a quienes modifican la política de las mismas funciones (alta, baja y activación por lotes), en orden de identificador. */
    // Obtiene y bloquea para escritura (PESSIMISTIC_WRITE) las funciones de tripulación con los códigos indicados, ordenadas por ID.
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select r from CrewRole r where r.codigo in :codes order by r.id")
    List<CrewRole> lockByCodes(@org.springframework.data.repository.query.Param("codes") Collection<String> codes);
}
