/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla versiones_documento_vuelo.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde DocumentService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.FlightDocument;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface FlightDocumentRepository extends JpaRepository<FlightDocument, Long> {
 // Obtiene el número de versión más alto registrado para el documento indicado.
 @Query("select max(d.numeroVersion) from FlightDocument d where d.documentItem.id=:itemId") Integer maxNumeroVersion(@Param("itemId") Long itemId);
 // Obtiene todas las versiones del documento, de la más nueva a la más antigua.
 List<FlightDocument> findByDocumentItemIdOrderByNumeroVersionDesc(Long itemId);
 // Obtiene la versión actual del documento.
 Optional<FlightDocument> findByDocumentItemIdAndEsVersionActualTrue(Long itemId);
 // Obtiene la primera versión (número de versión más bajo) del documento.
 Optional<FlightDocument> findFirstByDocumentItemIdOrderByNumeroVersionAsc(Long itemId);
 // Cuenta las versiones registradas del documento.
 long countByDocumentItemId(Long itemId);
}
