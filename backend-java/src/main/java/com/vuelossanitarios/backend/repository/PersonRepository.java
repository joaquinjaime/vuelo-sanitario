package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.Person;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface PersonRepository extends JpaRepository<Person, Long> {
 boolean existsByDni(String dni);
 Optional<Person> findByDni(String dni);
 /** Serializa el mantenimiento de los contactos de una misma persona sin modificar su identidad ni su versión. */
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select p from Person p where p.id = :id")
 Optional<Person> lockById(@Param("id") Long id);
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select p from Person p where p.dni = :dni")
 Optional<Person> findByDniForUpdate(@Param("dni") String dni);
}
