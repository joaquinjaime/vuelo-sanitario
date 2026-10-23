package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.patient.Patient;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PatientRepository extends JpaRepository<Patient, Long> { Optional<Patient> findByPersonId(Long personId); }
