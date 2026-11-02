package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.user.User;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import java.util.*;
public interface UserRepository extends JpaRepository<User, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select u from User u where u.id=:id") Optional<User> lockById(@Param("id") Long id);
    @Query("select u from User u left join fetch u.userRoles ur left join fetch ur.role where u.username = :username")
    Optional<User> findWithRolesByUsername(@Param("username") String username);
    @Query("select u from User u left join fetch u.userRoles ur left join fetch ur.role where u.id = :id")
    Optional<User> findWithRolesById(@Param("id") Long id);
    Optional<User> findByPersonId(Long personId);
    @Query("select distinct u from User u join u.userRoles ur join ur.role r where r.codigo = :role and u.activo = true")
    List<User> findActiveByRoleCode(@Param("role") String role);
    @Query("select distinct u from User u join fetch u.person p join fetch p.commanderProfile cp join cp.provinciaActual pr join u.userRoles ur join ur.role r where r.codigo='COMANDANTE' and u.activo=true and u.estadoCuenta='ACTIVO' and pr.id=:provinceId")
    List<User> findAvailableCommandersInProvince(@Param("provinceId") Long provinceId);
    /** Comandantes activos cuya ubicación operativa actual es la localidad indicada (con su perfil, provincia y localidad ya cargados). Un comandante tiene una sola fila de rol COMANDANTE. */
    @Query("select u from User u join fetch u.person p join fetch p.commanderProfile cp left join fetch cp.provinciaActual left join fetch cp.localidadActual l left join fetch cp.ubicacionActualizadaPor join u.userRoles ur join ur.role r where r.codigo='COMANDANTE' and u.activo=true and u.estadoCuenta='ACTIVO' and l.id=:localityId order by p.apellido, p.nombre, u.id")
    List<User> findActiveCommandersInLocality(@Param("localityId") Long localityId);
    /** Comandantes activos fuera de la localidad (otra localidad, sólo provincia o sin ubicación), los de la provincia indicada primero; q (minúsculas) filtra por apellido, nombre o usuario. */
    @Query("select u from User u join fetch u.person p join fetch p.commanderProfile cp left join fetch cp.provinciaActual pr left join fetch cp.localidadActual l left join fetch cp.ubicacionActualizadaPor join u.userRoles ur join ur.role r where r.codigo='COMANDANTE' and u.activo=true and u.estadoCuenta='ACTIVO' and (l is null or l.id<>:localityId) and (:q='' or lower(concat(p.apellido,' ',p.nombre)) like concat('%',:q,'%') or lower(concat(p.nombre,' ',p.apellido)) like concat('%',:q,'%') or lower(u.username) like concat('%',:q,'%')) order by case when pr.id=:provinceId then 0 when pr.id is null then 2 else 1 end, p.apellido, p.nombre, u.id")
    List<User> findActiveCommandersOutsideLocality(@Param("localityId") Long localityId,@Param("provinceId") Long provinceId,@Param("q") String q,Pageable page);
    /** [provinciaId, localidadId, localidadActiva, cantidad] de los comandantes activos fuera de la localidad, para explicar por qué no hay candidatos ordinarios. */
    @Query("select pr.id, l.id, l.activo, count(u) from User u join u.person p join p.commanderProfile cp left join cp.provinciaActual pr left join cp.localidadActual l join u.userRoles ur join ur.role r where r.codigo='COMANDANTE' and u.activo=true and u.estadoCuenta='ACTIVO' and (l is null or l.id<>:localityId) group by pr.id, l.id, l.activo")
    List<Object[]> countActiveCommandersOutsideLocality(@Param("localityId") Long localityId);
    /** [userId, activo, estadoCuenta, personaId, nombre, apellido] sin cargar las entidades (para vistas mínimas de tripulación). */
    @Query("select u.id,u.activo,u.estadoCuenta,p.id,p.nombre,p.apellido from User u join u.person p where u.id=:id") List<Object[]> findCrewPersonRowById(@Param("id") Long id);
    boolean existsByUsername(String username);
    @Query("select count(distinct u) from User u join u.userRoles ur join ur.role r where r.codigo='ADMINISTRADOR' and u.activo=true and u.estadoCuenta='ACTIVO'") long countActiveAdministrators();
    @Query("select distinct u from User u join fetch u.person left join fetch u.userRoles ur left join fetch ur.role")
    List<User> findAllWithPersonAndRoles();
    @Query("select u from User u join fetch u.person where u.id=:id") Optional<User> findWithPersonById(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u join fetch u.person left join fetch u.userRoles ur left join fetch ur.role where u.id=:id") Optional<User> lockWithPersonAndRolesById(@Param("id") Long id);
    @Query("select u from User u join fetch u.person p where p.dni=:dni") Optional<User> findWithPersonByDni(@Param("dni") String dni);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select distinct u from User u join fetch u.userRoles ur join ur.role r where r.codigo='ADMINISTRADOR' and u.activo=true and u.estadoCuenta='ACTIVO'") List<User> lockActiveAdministrators();
}
