package com.vuelos.sanitarios.repository;

import com.vuelos.sanitarios.model.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.Optional;

public interface UsuarioRepository extends JpaRepository<Usuario, Integer> {
    Optional<Usuario> findByUsername(String username);
    boolean existsByUsername(String username);

    @Query("SELECT u FROM Usuario u JOIN u.rol r WHERE r.nombreRol = :rol")
    java.util.List<Usuario> findByRolNombre(com.vuelos.sanitarios.enums.NombreRol rol);
}
