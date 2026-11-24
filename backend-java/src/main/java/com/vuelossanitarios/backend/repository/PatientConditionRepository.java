/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla condiciones_paciente.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.PatientCondition;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PatientConditionRepository extends JpaRepository<PatientCondition,Long>{
 // Obtiene las condiciones de paciente activas ordenadas por su orden de presentación.
 List<PatientCondition> findByActivoTrueOrderByOrdenAsc();
 // Obtiene la condición de paciente activa con el código indicado.
 Optional<PatientCondition> findByCodigoAndActivoTrue(String codigo);
}
