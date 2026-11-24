/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla bloqueos_documento_vuelo.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde DocumentService.
 */
package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.flight.DocumentLock;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentLockRepository extends JpaRepository<DocumentLock,Long> {
 // Obtiene el registro de bloqueo (DocumentLock) asociado al documento indicado.
 Optional<DocumentLock> findByDocumentItemId(Long itemId);
}
