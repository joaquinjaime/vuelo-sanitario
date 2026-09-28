package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

import java.math.BigDecimal;

@Entity
@Table(name = "aeropuertos")
public class Airport extends BaseEntity {

    @Column(name = "codigo_oficial", length = 20)
    private String codigoOficial;

    @Column(name = "codigo_oaci", unique = true, length = 4)
    private String codigoOaci;

    @Column(name = "codigo_iata", unique = true, length = 3)
    private String codigoIata;

    @Column(name = "nombre", nullable = false, length = 150)
    private String nombre;

    @Column(name = "ciudad", length = 100)
    private String ciudad;

    @Column(name = "provincia", length = 100)
    private String provincia;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "provincia_id")
    private Province provinciaReferencial;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "localidad_id")
    private Locality localidad;

    @Column(name = "tipo", length = 30)
    private String tipo;

    @Column(name = "pais", nullable = false, length = 100)
    private String pais = "Argentina";

    @Column(name = "latitud", precision = 9, scale = 6)
    private BigDecimal latitud;

    @Column(name = "longitud", precision = 9, scale = 6)
    private BigDecimal longitud;

    @Column(name = "activo", nullable = false)
    private Boolean activo = true;

    public Airport() {
    }

    public String getCodigoOficial() { return codigoOficial; }
    public void setCodigoOficial(String codigoOficial) { this.codigoOficial = codigoOficial; }

    public String getCodigoOaci() { return codigoOaci; }
    public void setCodigoOaci(String codigoOaci) { this.codigoOaci = codigoOaci; }

    public String getCodigoIata() { return codigoIata; }
    public void setCodigoIata(String codigoIata) { this.codigoIata = codigoIata; }

    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }

    public String getCiudad() { return ciudad; }
    public void setCiudad(String ciudad) { this.ciudad = ciudad; }

    public String getProvincia() { return provincia; }
    public void setProvincia(String provincia) { this.provincia = provincia; }

    public Province getProvinciaReferencial() { return provinciaReferencial; }
    public void setProvinciaReferencial(Province provinciaReferencial) { this.provinciaReferencial = provinciaReferencial; }
    public Locality getLocalidad() { return localidad; }
    public void setLocalidad(Locality localidad) { this.localidad = localidad; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }

    public String getPais() { return pais; }
    public void setPais(String pais) { this.pais = pais; }

    public BigDecimal getLatitud() { return latitud; }
    public void setLatitud(BigDecimal latitud) { this.latitud = latitud; }

    public BigDecimal getLongitud() { return longitud; }
    public void setLongitud(BigDecimal longitud) { this.longitud = longitud; }

    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean activo) { this.activo = activo; }
}
