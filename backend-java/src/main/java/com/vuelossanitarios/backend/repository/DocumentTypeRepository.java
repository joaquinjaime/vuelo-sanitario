package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.DocumentType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface DocumentTypeRepository extends JpaRepository<DocumentType, UUID> { Optional<DocumentType> findByCodigo(String codigo); }
