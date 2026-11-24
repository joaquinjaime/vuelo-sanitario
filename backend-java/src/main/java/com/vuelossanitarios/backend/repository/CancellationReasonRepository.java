/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla motivos_cancelacion.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.CancellationReason;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface CancellationReasonRepository extends JpaRepository<CancellationReason, Long> {
 // Obtiene los motivos de cancelación activos ordenados por su orden de presentación.
 List<CancellationReason> findByActivoTrueOrderByOrdenAsc();
 // Obtiene el motivo de cancelación por su ID sólo si está activo.
 Optional<CancellationReason> findByIdAndActivoTrue(Long id);
}
