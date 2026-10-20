package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.*;

@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_localidades"))
@Table(name = "localidades")
public class Locality extends BaseEntity {
    @Column(name = "codigo_oficial", nullable = false, unique = true, length = 20)
    private String codigoOficial;
    @Column(name = "nombre_localidad", nullable = false, length = 200)
    private String nombre;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_provincias", nullable = false)
    private Province provincia;
    @Column(name = "esta_activa", nullable = false)
    private Boolean activo = true;
    public String getCodigoOficial() { return codigoOficial; }
    public void setCodigoOficial(String value) { codigoOficial = value; }
    public String getNombre() { return nombre; }
    public void setNombre(String value) { nombre = value; }
    public Province getProvincia() { return provincia; }
    public void setProvincia(Province value) { provincia = value; }
    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean value) { activo = value; }
}
