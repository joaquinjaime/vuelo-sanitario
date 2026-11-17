package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.flight.HealthStaff;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface HealthStaffRepository extends JpaRepository<HealthStaff,Long>{
 // Obtiene el personal de salud del titular indicado (sólo el activo, salvo que se pidan todos) con su persona, ordenado por apellido, nombre e ID.
 @Query("select h from HealthStaff h join fetch h.person p where h.owner.id=:ownerId and (:all=true or h.active=true) order by p.apellido, p.nombre, h.id")
 List<HealthStaff> findByOwner(@Param("ownerId") Long ownerId,@Param("all") boolean includeInactive);
 // Obtiene el integrante de personal de salud por su ID sólo si pertenece al titular indicado, con su persona.
 @Query("select h from HealthStaff h join fetch h.person where h.id=:id and h.owner.id=:ownerId") Optional<HealthStaff> findOwned(@Param("id") Long id,@Param("ownerId") Long ownerId);
 // Obtiene el integrante de personal de salud por su ID bloqueándolo para escritura (PESSIMISTIC_WRITE).
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select h from HealthStaff h where h.id=:id") Optional<HealthStaff> lockById(@Param("id") Long id);
 // Obtiene el integrante de personal de salud del titular asociado a la persona indicada.
 Optional<HealthStaff> findByOwnerIdAndPersonId(Long ownerId,Long personId);
 // Verifica si el titular ya tiene personal del mismo tipo con esa matrícula (sin distinguir mayúsculas), excluyendo opcionalmente un ID.
 @Query("select (count(h)>0) from HealthStaff h where h.owner.id=:ownerId and h.type=:type and upper(h.registration)=upper(:registration) and (:exclude is null or h.id<>:exclude)")
 boolean registrationTaken(@Param("ownerId") Long ownerId,@Param("type") String type,@Param("registration") String registration,@Param("exclude") Long exclude);
 /** Otros registros (de cualquier DTS) que usan la misma identidad: si los hay, la identidad no puede corregirse desde este catálogo. */
 // Verifica si otro registro de personal de salud (con ID distinto) usa la misma persona.
 @Query("select (count(h)>0) from HealthStaff h where h.person.id=:personId and h.id<>:exclude") boolean personSharedWithOtherStaff(@Param("personId") Long personId,@Param("exclude") Long exclude);
}
