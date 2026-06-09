package com.vuelos.sanitarios.repository;

import com.vuelos.sanitarios.model.Notificacion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface NotificacionRepository extends JpaRepository<Notificacion, Integer> {
    List<Notificacion> findByUsuarioIdUsuarioOrderByCreatedAtDesc(Integer idUsuario);
    List<Notificacion> findByUsuarioIdUsuarioAndLeidaFalse(Integer idUsuario);
    long countByUsuarioIdUsuarioAndLeidaFalse(Integer idUsuario);
}
