/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla verificaciones_correo.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde EmailVerificationService.
 */
package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.person.EmailVerification;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {
 // Obtiene la verificación abierta (no usada ni invalidada) del correo indicado.
 @Query("select v from EmailVerification v where v.email.id=:emailId and v.usadaEn is null and v.invalidadaEn is null")
 Optional<EmailVerification> findOpenByEmailId(@Param("emailId") Long emailId);

 /** Códigos emitidos para el correo desde {@code since}: base de los límites de envío. */
 // Cuenta los códigos de verificación emitidos para el correo desde la fecha indicada.
 @Query("select count(v) from EmailVerification v where v.email.id=:emailId and v.creadaEn>=:since")
 long countIssuedSince(@Param("emailId") Long emailId,@Param("since") LocalDateTime since);

 // Cuenta los códigos de verificación solicitados por el usuario desde la fecha indicada.
 @Query("select count(v) from EmailVerification v where v.solicitante.id=:userId and v.creadaEn>=:since")
 long countIssuedByUserSince(@Param("userId") Long userId,@Param("since") LocalDateTime since);

 // Cuenta los códigos de verificación emitidos desde el origen (huella) indicado a partir de la fecha dada.
 @Query("select count(v) from EmailVerification v where v.origenHuella=:origin and v.creadaEn>=:since")
 long countIssuedByOriginSince(@Param("origin") String origin,@Param("since") LocalDateTime since);

 // Obtiene la fecha de emisión más reciente de un código de verificación para el correo.
 @Query("select max(v.creadaEn) from EmailVerification v where v.email.id=:emailId")
 Optional<LocalDateTime> lastIssuedAt(@Param("emailId") Long emailId);

 /** Última verificación de cada correo (para mostrar pendiente / vencido sin una consulta por correo). */
 // Obtiene la última verificación (mayor ID) de cada uno de los correos indicados.
 @Query("select v from EmailVerification v where v.email.id in :emailIds and v.id=(select max(w.id) from EmailVerification w where w.email.id=v.email.id)")
 List<EmailVerification> findLatestByEmailIds(@Param("emailIds") Collection<Long> emailIds);
}
