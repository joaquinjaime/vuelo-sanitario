package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.User;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import java.util.*;
public interface UserRepository extends JpaRepository<User, Long> {
    // Obtiene el usuario por su ID bloqueándolo para escritura (PESSIMISTIC_WRITE).
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select u from User u where u.id=:id") Optional<User> lockById(@Param("id") Long id);
    // Obtiene el usuario por nombre de usuario con sus roles cargados (left join fetch).
    @Query("select u from User u left join fetch u.userRoles ur left join fetch ur.role where u.username = :username")
    Optional<User> findWithRolesByUsername(@Param("username") String username);
    // Obtiene el usuario por su ID con sus roles cargados (left join fetch).
    @Query("select u from User u left join fetch u.userRoles ur left join fetch ur.role where u.id = :id")
    Optional<User> findWithRolesById(@Param("id") Long id);
    // Obtiene el usuario asociado a la persona indicada.
    Optional<User> findByPersonId(Long personId);
    // Obtiene los usuarios activos (sin repetir) que tienen el rol con el código indicado.
    @Query("select distinct u from User u join u.userRoles ur join ur.role r where r.codigo = :role and u.activo = true")
    List<User> findActiveByRoleCode(@Param("role") String role);
    /** Cuentas activas con rol COMANDANTE (con o sin perfil y ubicación), para que la administración revise sus requisitos; q (minúsculas) filtra por apellido, nombre o usuario. */
    // Obtiene, paginadas, las cuentas activas con estado ACTIVO y rol COMANDANTE con persona, perfil y provincia actual;
    // si q no está vacío filtra por apellido, nombre o usuario; ordena por apellido, nombre e ID.
    @Query("select u from User u join fetch u.person p left join fetch p.commanderProfile cp left join fetch cp.provinciaActual join u.userRoles ur join ur.role r where r.codigo='COMANDANTE' and u.activo=true and u.estadoCuenta='ACTIVO' and (:q='' or lower(concat(p.apellido,' ',p.nombre)) like concat('%',:q,'%') or lower(concat(p.nombre,' ',p.apellido)) like concat('%',:q,'%') or lower(u.username) like concat('%',:q,'%')) order by p.apellido, p.nombre, u.id")
    List<User> findActiveCommanderAccounts(@Param("q") String q,Pageable page);
    /** [userId, activo, estadoCuenta, personaId, nombre, apellido] sin cargar las entidades (para vistas mínimas de tripulación). */
    // Obtiene sólo los datos mínimos [ID, activo, estado de cuenta, ID de persona, nombre, apellido] del usuario indicado.
    @Query("select u.id,u.activo,u.estadoCuenta,p.id,p.nombre,p.apellido from User u join u.person p where u.id=:id") List<Object[]> findCrewPersonRowById(@Param("id") Long id);
    // Verifica si existe un usuario con el nombre de usuario indicado.
    boolean existsByUsername(String username);
    // Cuenta los usuarios activos con estado ACTIVO que tienen el rol ADMINISTRADOR.
    @Query("select count(distinct u) from User u join u.userRoles ur join ur.role r where r.codigo='ADMINISTRADOR' and u.activo=true and u.estadoCuenta='ACTIVO'") long countActiveAdministrators();
    // Obtiene todos los usuarios (sin repetir) con su persona y sus roles cargados.
    @Query("select distinct u from User u join fetch u.person left join fetch u.userRoles ur left join fetch ur.role")
    List<User> findAllWithPersonAndRoles();
    // Obtiene el usuario por su ID con su persona cargada.
    @Query("select u from User u join fetch u.person where u.id=:id") Optional<User> findWithPersonById(@Param("id") Long id);
    // Obtiene el usuario por su ID con persona y roles, bloqueándolo para escritura (PESSIMISTIC_WRITE).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u join fetch u.person left join fetch u.userRoles ur left join fetch ur.role where u.id=:id") Optional<User> lockWithPersonAndRolesById(@Param("id") Long id);
    // Obtiene el usuario con su persona cargada a partir del DNI.
    @Query("select u from User u join fetch u.person p where p.dni=:dni") Optional<User> findWithPersonByDni(@Param("dni") String dni);
    // Obtiene y bloquea para escritura (PESSIMISTIC_WRITE) los administradores activos con estado ACTIVO, con sus roles.
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select distinct u from User u join fetch u.userRoles ur join ur.role r where r.codigo='ADMINISTRADOR' and u.activo=true and u.estadoCuenta='ACTIVO'") List<User> lockActiveAdministrators();
}
