/*
 * ACCESO A BASE DE DATOS
 * Repositorio de la tabla activaciones_cuenta.
 * Trae datos: con las consultas declaradas en esta interfaz y las de JpaRepository (findById,
 *   findAll, etc.).
 * Carga o modifica datos: con save/delete de JpaRepository, usados desde AuthService.
 */
package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.AccountActivation;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface AccountActivationRepository extends JpaRepository<AccountActivation, Long> {
    // Obtiene las activaciones de cuenta no utilizadas de la persona con el DNI indicado, con usuario y persona, de la más reciente a la más antigua.
    @Query("select a from AccountActivation a join fetch a.user u join fetch u.person p where p.dni=:dni and a.usedAt is null order by a.createdAt desc") List<AccountActivation> findOpenByDni(@Param("dni") String dni);
 /** Serializa los intentos de un mismo DNI para que el límite no pueda eludirse con solicitudes concurrentes. */
    // Obtiene y bloquea para escritura (PESSIMISTIC_WRITE) las activaciones no utilizadas del DNI indicado, con usuario y persona, de la más reciente a la más antigua.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from AccountActivation a join fetch a.user u join fetch u.person p where p.dni=:dni and a.usedAt is null order by a.createdAt desc") List<AccountActivation> findOpenByDniForActivation(@Param("dni") String dni);
    // Obtiene las activaciones de cuenta aún no utilizadas del usuario indicado.
    @Query("select a from AccountActivation a where a.user.id=:userId and a.usedAt is null") List<AccountActivation> findOpenByUserId(@Param("userId") Long userId);
}
