package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
// Obtiene el tipo de documento por su código.
public interface DocumentTypeRepository extends JpaRepository<DocumentType, Long> { Optional<DocumentType> findByCodigo(String codigo); }
