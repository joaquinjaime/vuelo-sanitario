package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "motivos_cancelacion")
public class CancellationReason extends BaseEntity {
    @Column(name = "codigo", nullable = false, unique = true, length = 80) private String codigo;
    @Column(name = "nombre", nullable = false, length = 200) private String nombre;
    @Column(name = "descripcion", columnDefinition = "NVARCHAR(MAX)") private String descripcion;
    @Column(name = "categoria", nullable = false, length = 40) private String categoria;
    @Column(name = "activo", nullable = false) private Boolean activo = true;
    @Column(name = "orden", nullable = false) private Short orden;
    public String getCodigo(){ return codigo; } public void setCodigo(String value){ codigo=value; }
    public String getNombre(){ return nombre; } public void setNombre(String value){ nombre=value; }
    public String getDescripcion(){ return descripcion; } public void setDescripcion(String value){ descripcion=value; }
    public String getCategoria(){ return categoria; } public void setCategoria(String value){ categoria=value; }
    public Boolean getActivo(){ return activo; } public void setActivo(Boolean value){ activo=value; }
    public Short getOrden(){ return orden; } public void setOrden(Short value){ orden=value; }
}
