package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.patient.Patient;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PatientRepository extends JpaRepository<Patient, Long> {
 // Obtiene el paciente asociado a la persona indicada.
 Optional<Patient> findByPersonId(Long personId);
 // Obtiene el paciente con su persona cargada a partir del DNI.
 @Query("select p from Patient p join fetch p.person x where x.dni = :dni")
 Optional<Patient> findWithPersonByDni(@Param("dni") String dni);
 // Busca pacientes paginados cuyo nombre y apellido en minúsculas coinciden con los patrones LIKE indicados, con su persona,
 // ordenados por apellido, nombre e ID.
 @Query("select p from Patient p join fetch p.person x where lower(x.nombre) like :nombre and lower(x.apellido) like :apellido order by lower(x.apellido), lower(x.nombre), p.id")
 Slice<Patient> searchByName(@Param("nombre") String nombre,@Param("apellido") String apellido,Pageable pageable);
}
