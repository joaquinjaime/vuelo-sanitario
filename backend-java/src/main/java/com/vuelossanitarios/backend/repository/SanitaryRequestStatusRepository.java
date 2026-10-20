package com.vuelossanitarios.backend.repository;
import com.vuelossanitarios.backend.domain.catalog.SanitaryRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface SanitaryRequestStatusRepository extends JpaRepository<SanitaryRequestStatus,Long>{Optional<SanitaryRequestStatus> findByCodigo(String codigo);}
