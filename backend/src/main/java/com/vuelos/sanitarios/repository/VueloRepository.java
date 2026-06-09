package com.vuelos.sanitarios.repository;

import com.vuelos.sanitarios.enums.EstadoVuelo;
import com.vuelos.sanitarios.model.Vuelo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface VueloRepository extends JpaRepository<Vuelo, Integer> {
    List<Vuelo> findByEstado(EstadoVuelo estado);
    List<Vuelo> findByFechaVueloBetween(LocalDate desde, LocalDate hasta);

    @Query("""
        SELECT v FROM Vuelo v
        JOIN FETCH v.peticion p
        JOIN FETCH p.usuario u
        JOIN FETCH u.persona
        WHERE (:estado IS NULL OR v.estado = :estado)
        ORDER BY v.fechaVuelo DESC, v.horaDespegue DESC
    """)
    List<Vuelo> findAllFiltered(@Param("estado") EstadoVuelo estado);

    Optional<Vuelo> findByPeticionIdPeticion(Integer idPeticion);
}
