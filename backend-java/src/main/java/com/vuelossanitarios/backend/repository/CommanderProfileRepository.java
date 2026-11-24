/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla perfiles_comandante.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde AuthService,
 *   CommanderLocationService, FlightService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.CommanderProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Verifica si existe un perfil de comandante con el número de licencia indicado, sin distinguir mayúsculas.
public interface CommanderProfileRepository extends JpaRepository<CommanderProfile,Long>{ boolean existsByLicenseNumberIgnoreCase(String licenseNumber); }
