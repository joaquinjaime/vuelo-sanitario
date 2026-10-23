package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Información de preparación terrestre versionada por vuelo. */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_informacion_hangar"))
@Table(name = "informacion_hangar")
public class HangarInfo extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_vuelos", nullable = false)
    private Flight flight;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "es_version_actual", nullable = false)
    private Boolean esVersionActual = true;

    @Column(name = "combustible_litros", precision = 10, scale = 2)
    private BigDecimal combustibleLitros;

    @Column(name = "preparacion_completa", nullable = false)
    private Boolean preparacionCompleta = false;

    @Column(name = "observaciones_hangar", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    @Column(name = "requiere_hangar")
    private Boolean requiereHangar;
    @Column(name = "observaciones_comandante", columnDefinition = "NVARCHAR(MAX)")
    private String observacionesComandante;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_aeronave_contexto")
    private Aircraft aeronaveContexto;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_origen_contexto")
    private Airport origenContexto;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_comandante_contexto")
    private User comandanteContexto;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_usuario_registrador", nullable = false)
    private User registradoPor;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public HangarInfo() {
    }

    public Flight getFlight() { return flight; }
    public void setFlight(Flight flight) { this.flight = flight; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public Boolean getEsVersionActual() { return esVersionActual; }
    public void setEsVersionActual(Boolean esVersionActual) { this.esVersionActual = esVersionActual; }

    public BigDecimal getCombustibleLitros() { return combustibleLitros; }
    public void setCombustibleLitros(BigDecimal combustibleLitros) { this.combustibleLitros = combustibleLitros; }

    public Boolean getPreparacionCompleta() { return preparacionCompleta; }
    public void setPreparacionCompleta(Boolean preparacionCompleta) { this.preparacionCompleta = preparacionCompleta; }

    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String observaciones) { this.observaciones = observaciones; }

    public Boolean getRequiereHangar() { return requiereHangar; }
    public void setRequiereHangar(Boolean v) { requiereHangar = v; }
    public String getObservacionesComandante() { return observacionesComandante; }
    public void setObservacionesComandante(String v) { observacionesComandante = v; }
    public Aircraft getAeronaveContexto() { return aeronaveContexto; }
    public void setAeronaveContexto(Aircraft v) { aeronaveContexto = v; }
    public Airport getOrigenContexto() { return origenContexto; }
    public void setOrigenContexto(Airport v) { origenContexto = v; }
    public User getComandanteContexto() { return comandanteContexto; }
    public void setComandanteContexto(User v) { comandanteContexto = v; }

    public User getRegistradoPor() { return registradoPor; }
    public void setRegistradoPor(User registradoPor) { this.registradoPor = registradoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
