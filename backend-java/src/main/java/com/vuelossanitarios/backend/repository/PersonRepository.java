/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla personas.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde AuthService,
 *   HealthStaffService, PatientDirectoryService, PatientService, PersonIdentityService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.Person;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface PersonRepository extends JpaRepository<Person, Long> {
 // Verifica si existe una persona con el DNI indicado.
 boolean existsByDni(String dni);
 // Obtiene la persona por su DNI.
 Optional<Person> findByDni(String dni);
 /** Serializa el mantenimiento de los contactos de una misma persona sin modificar su identidad ni su versión. */
 // Obtiene la persona por su ID bloqueándola para escritura (PESSIMISTIC_WRITE).
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select p from Person p where p.id = :id")
 Optional<Person> lockById(@Param("id") Long id);
 // Obtiene la persona por su DNI bloqueándola para escritura (PESSIMISTIC_WRITE).
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select p from Person p where p.dni = :dni")
 Optional<Person> findByDniForUpdate(@Param("dni") String dni);
}
