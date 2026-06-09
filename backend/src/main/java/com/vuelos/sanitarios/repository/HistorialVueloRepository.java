package com.vuelos.sanitarios.repository;

import com.vuelos.sanitarios.model.HistorialVuelo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HistorialVueloRepository extends JpaRepository<HistorialVuelo, Integer> {
    List<HistorialVuelo> findByVueloIdVueloOrderByFechaHoraModificacionDesc(Integer idVuelo);
}
