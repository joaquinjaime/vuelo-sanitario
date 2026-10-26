package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.EmailContact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
/** Sólo los contactos vigentes (sin baja lógica) forman parte de la persona; los retirados se conservan para la trazabilidad. */
public interface EmailContactRepository extends JpaRepository<EmailContact, Long> {
 @Query("select e from EmailContact e where e.person.id=:personId and e.fechaBaja is null order by e.principal desc, e.id")
 List<EmailContact> findActiveByPersonId(@Param("personId") Long personId);
 /** Contactos laborales vigentes y <b>verificados</b> (I-2b) de varias personas en una sola consulta (principal primero, luego el más antiguo). */
 @Query("select e from EmailContact e where e.person.id in :personIds and e.tipo='LABORAL' and e.fechaBaja is null and e.fechaVerificacion is not null order by e.person.id, e.principal desc, e.id")
 List<EmailContact> findActiveLaboralByPersonIds(@Param("personIds") Collection<Long> personIds);
 /** Personas con algún correo laboral vigente sin verificar: no se entrega a Operaciones, sólo se informa que no hay un correo laboral verificado. */
 @Query("select distinct e.person.id from EmailContact e where e.person.id in :personIds and e.tipo='LABORAL' and e.fechaBaja is null and e.fechaVerificacion is null")
 List<Long> personIdsWithUnverifiedLaboral(@Param("personIds") Collection<Long> personIds);
 @Query("select count(e) from EmailContact e where e.person.id=:personId and e.fechaBaja is null")
 long countActiveByPersonId(@Param("personId") Long personId);
 @Query("select e from EmailContact e where e.id=:id and e.person.id=:personId and e.fechaBaja is null")
 Optional<EmailContact> findActiveByIdAndPersonId(@Param("id") Long id,@Param("personId") Long personId);
}
