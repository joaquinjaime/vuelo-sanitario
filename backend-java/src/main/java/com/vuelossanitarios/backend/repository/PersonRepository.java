package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.person.Person;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PersonRepository extends JpaRepository<Person, UUID> { boolean existsByDni(String dni); }
