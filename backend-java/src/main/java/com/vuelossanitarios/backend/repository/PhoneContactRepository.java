package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.PhoneContact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
/** Sólo los contactos vigentes (sin baja lógica) forman parte de la persona; los retirados se conservan para la trazabilidad. */
public interface PhoneContactRepository extends JpaRepository<PhoneContact, Long> {
 @Query("select p from PhoneContact p where p.person.id=:personId and p.fechaBaja is null order by p.principal desc, p.id")
 List<PhoneContact> findActiveByPersonId(@Param("personId") Long personId);
 /** Contactos laborales vigentes y validados con un país (I-2b) de varias personas en una sola consulta (principal primero, luego el más antiguo). */
 @Query("select p from PhoneContact p where p.person.id in :personIds and p.tipo='LABORAL' and p.fechaBaja is null and p.codigoPais is not null order by p.person.id, p.principal desc, p.id")
 List<PhoneContact> findActiveLaboralByPersonIds(@Param("personIds") Collection<Long> personIds);
 /** Personas con algún teléfono laboral vigente que aún no se validó con un país (dato anterior a V54): no se entrega a Operaciones, sólo se informa que existe. */
 @Query("select distinct p.person.id from PhoneContact p where p.person.id in :personIds and p.tipo='LABORAL' and p.fechaBaja is null and p.codigoPais is null")
 List<Long> personIdsWithUnvalidatedLaboral(@Param("personIds") Collection<Long> personIds);
 @Query("select count(p) from PhoneContact p where p.person.id=:personId and p.fechaBaja is null")
 long countActiveByPersonId(@Param("personId") Long personId);
 @Query("select p from PhoneContact p where p.id=:id and p.person.id=:personId and p.fechaBaja is null")
 Optional<PhoneContact> findActiveByIdAndPersonId(@Param("id") Long id,@Param("personId") Long personId);
}
