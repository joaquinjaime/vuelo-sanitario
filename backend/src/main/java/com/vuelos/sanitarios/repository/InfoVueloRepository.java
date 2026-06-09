package com.vuelos.sanitarios.repository;

import com.vuelos.sanitarios.enums.TipoInfoVuelo;
import com.vuelos.sanitarios.model.InfoVuelo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface InfoVueloRepository extends JpaRepository<InfoVuelo, Integer> {
    List<InfoVuelo> findByVueloIdVuelo(Integer idVuelo);
    Optional<InfoVuelo> findByVueloIdVueloAndTipo(Integer idVuelo, TipoInfoVuelo tipo);
}
