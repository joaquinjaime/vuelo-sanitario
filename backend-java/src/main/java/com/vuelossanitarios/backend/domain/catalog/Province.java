package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "provincias")
public class Province extends BaseEntity {
    @Column(name = "codigo_oficial", nullable = false, unique = true, length = 10)
    private String codigoOficial;
    @Column(name = "nombre", nullable = false, unique = true, length = 100)
    private String nombre;
    @Column(name = "activo", nullable = false)
    private Boolean activo = true;
    public String getCodigoOficial() { return codigoOficial; }
    public void setCodigoOficial(String value) { codigoOficial = value; }
    public String getNombre() { return nombre; }
    public void setNombre(String value) { nombre = value; }
    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean value) { activo = value; }
}
