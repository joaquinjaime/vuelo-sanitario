package com.vuelos.sanitarios.repository;

import com.vuelos.sanitarios.model.InformeFinal;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface InformeFinalRepository extends JpaRepository<InformeFinal, Integer> {
    Optional<InformeFinal> findByVueloIdVuelo(Integer idVuelo);
    boolean existsByVueloIdVuelo(Integer idVuelo);
}
