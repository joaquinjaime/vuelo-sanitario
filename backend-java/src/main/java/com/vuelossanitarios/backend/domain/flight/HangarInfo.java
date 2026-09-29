package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Información de hangar versionada para combustible y estado de preparación.
 * El checklist se resuelve como funcionalidad de interfaz/reglas, no como
 * texto JSON persistido.
 */
@Entity
@Table(name = "informacion_hangar")
public class HangarInfo extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "vuelo_id", nullable = false)
    private Flight flight;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "es_version_actual", nullable = false)
    private Boolean esVersionActual = true;

    @Column(name = "combustible_litros", precision = 10, scale = 2)
    private BigDecimal combustibleLitros;

    @Column(name = "preparacion_completa", nullable = false)
    private Boolean preparacionCompleta = false;

    @Column(name = "observaciones", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "registrado_por_usuario_id", nullable = false)
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

    public User getRegistradoPor() { return registradoPor; }
    public void setRegistradoPor(User registradoPor) { this.registradoPor = registradoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
