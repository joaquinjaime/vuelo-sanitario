package com.vuelos.sanitarios.repository;

import com.vuelos.sanitarios.enums.EstadoPeticion;
import com.vuelos.sanitarios.model.Peticion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface PeticionRepository extends JpaRepository<Peticion, Integer> {
    List<Peticion> findByUsuarioIdUsuario(Integer idUsuario);
    List<Peticion> findByEstado(EstadoPeticion estado);

    @Query("SELECT p FROM Peticion p JOIN FETCH p.usuario u JOIN FETCH u.persona ORDER BY p.fechaPeticion DESC")
    List<Peticion> findAllWithUsuario();
}
