package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.catalog.Province;
import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProvinceRepository extends JpaRepository<Province, Long> {
    List<Province> findByActivoTrueOrderByNombreAsc();
    List<Province> findAllByOrderByNombreAsc();
    boolean existsByCodigoOficialIgnoreCase(String codigoOficial);
    boolean existsByCodigoOficialIgnoreCaseAndIdNot(String codigoOficial, Long id);
    boolean existsByNombreIgnoreCase(String nombre);
    boolean existsByNombreIgnoreCaseAndIdNot(String nombre, Long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Province p where p.id=:id") Optional<Province> lockById(@Param("id") Long id);
}
