package com.vuelossanitarios.backend.repository;

import com.vuelossanitarios.backend.domain.catalog.Province;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProvinceRepository extends JpaRepository<Province, UUID> {
    List<Province> findByActivoTrueOrderByNombreAsc();
}
