package com.vuelos.sanitarios.model;

import com.vuelos.sanitarios.enums.NombreRol;
import jakarta.persistence.*;

@Entity
@Table(name = "roles")
public class Rol {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_rol")
    private Integer idRol;

    @Enumerated(EnumType.STRING)
    @Column(name = "nombre_rol", nullable = false, unique = true, length = 20)
    private NombreRol nombreRol;

    @Column(columnDefinition = "TEXT")
    private String descripcion;

    public Rol() {}

    public Rol(Integer idRol, NombreRol nombreRol, String descripcion) {
        this.idRol = idRol;
        this.nombreRol = nombreRol;
        this.descripcion = descripcion;
    }

    public Integer getIdRol() { return idRol; }
    public void setIdRol(Integer idRol) { this.idRol = idRol; }
    public NombreRol getNombreRol() { return nombreRol; }
    public void setNombreRol(NombreRol nombreRol) { this.nombreRol = nombreRol; }
    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idRol;
        private NombreRol nombreRol;
        private String descripcion;

        public Builder idRol(Integer idRol) { this.idRol = idRol; return this; }
        public Builder nombreRol(NombreRol nombreRol) { this.nombreRol = nombreRol; return this; }
        public Builder descripcion(String descripcion) { this.descripcion = descripcion; return this; }

        public Rol build() {
            return new Rol(idRol, nombreRol, descripcion);
        }
    }
}
