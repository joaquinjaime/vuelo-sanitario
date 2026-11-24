/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla correos_electronicos.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde AuthService,
 *   EmailVerificationService, PersonContactService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
/** Sólo los contactos vigentes (sin baja lógica) forman parte de la persona; los retirados se conservan para la trazabilidad. */
public interface EmailContactRepository extends JpaRepository<EmailContact, Long> {
 // Obtiene los correos vigentes (sin baja) de la persona, primero el principal y luego por ID.
 @Query("select e from EmailContact e where e.person.id=:personId and e.fechaBaja is null order by e.principal desc, e.id")
 List<EmailContact> findActiveByPersonId(@Param("personId") Long personId);
 /** Contactos laborales vigentes y <b>verificados</b> (I-2b) de varias personas en una sola consulta (principal primero, luego el más antiguo). */
 // Obtiene los correos laborales vigentes y verificados de las personas indicadas, ordenados por persona, principal primero y luego por ID.
 @Query("select e from EmailContact e where e.person.id in :personIds and e.tipo='LABORAL' and e.fechaBaja is null and e.fechaVerificacion is not null order by e.person.id, e.principal desc, e.id")
 List<EmailContact> findActiveLaboralByPersonIds(@Param("personIds") Collection<Long> personIds);
 /** Personas con algún correo laboral vigente sin verificar: no se entrega a Operaciones, sólo se informa que no hay un correo laboral verificado. */
 // Obtiene los IDs (sin repetir) de las personas indicadas que tienen algún correo laboral vigente sin verificar.
 @Query("select distinct e.person.id from EmailContact e where e.person.id in :personIds and e.tipo='LABORAL' and e.fechaBaja is null and e.fechaVerificacion is null")
 List<Long> personIdsWithUnverifiedLaboral(@Param("personIds") Collection<Long> personIds);
 // Cuenta los correos vigentes (sin baja) de la persona.
 @Query("select count(e) from EmailContact e where e.person.id=:personId and e.fechaBaja is null")
 long countActiveByPersonId(@Param("personId") Long personId);
 // Obtiene el correo vigente con el ID indicado sólo si pertenece a la persona.
 @Query("select e from EmailContact e where e.id=:id and e.person.id=:personId and e.fechaBaja is null")
 Optional<EmailContact> findActiveByIdAndPersonId(@Param("id") Long id,@Param("personId") Long personId);
}
