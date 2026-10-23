package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_estados_vuelo"))
@Table(name = "estados_vuelo")
public class FlightStatus extends BaseEntity {

    @Column(name = "codigo_estado_vuelo", nullable = false, unique = true, length = 50)
    private String codigo;

    @Column(name = "nombre_estado_vuelo", nullable = false, length = 100)
    private String nombre;

    @Column(name = "orden", nullable = false)
    private Short orden;

    public FlightStatus() {
    }

    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }

    public Short getOrden() { return orden; }
    public void setOrden(Short orden) { this.orden = orden; }
}
