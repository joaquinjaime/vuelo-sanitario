/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla tipos_documento.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: ningún servicio guarda ni borra con este repositorio (es de sólo
 *   lectura).
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene el tipo de documento por su código.
public interface DocumentTypeRepository extends JpaRepository<DocumentType, Long> { Optional<DocumentType> findByCodigo(String codigo); }
