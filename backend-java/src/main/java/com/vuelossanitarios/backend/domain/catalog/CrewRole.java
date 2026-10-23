package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_roles_tripulacion"))
@Table(name = "roles_tripulacion")
public class CrewRole extends BaseEntity {

    @Column(name = "codigo_rol_tripulacion", nullable = false, unique = true, length = 30)
    private String codigo;

    @Column(name = "nombre_rol_tripulacion", nullable = false, length = 100)
    private String nombre;

    public CrewRole() {
    }

    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }
}
