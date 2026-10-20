package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_tipos_documento"))
@Table(name = "tipos_documento")
public class DocumentType extends BaseEntity {

    @Column(name = "codigo_tipo_documento", nullable = false, unique = true, length = 30)
    private String codigo;

    @Column(name = "nombre_tipo_documento", nullable = false, length = 100)
    private String nombre;

    public DocumentType() {
    }

    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }
}
