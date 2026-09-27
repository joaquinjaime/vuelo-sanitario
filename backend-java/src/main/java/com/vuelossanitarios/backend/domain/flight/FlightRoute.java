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
 * Datos estructurados de la ruta de vuelo (altitud, distancia, tiempo
 * estimado). El documento/carta de navegacion asociado se carga aparte
 * en FlightDocument con DocumentType.codigo = "RUTA_VUELO". Versionado:
 * ver nota en FlightDocument.
 */
@Entity
@Table(name = "rutas_vuelo")
public class FlightRoute extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "vuelo_id", nullable = false)
    private Flight flight;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "es_version_actual", nullable = false)
    private Boolean esVersionActual = true;

    @Column(name = "altitud_pies", precision = 8, scale = 2)
    private BigDecimal altitudPies;

    @Column(name = "distancia_nm", precision = 8, scale = 2)
    private BigDecimal distanciaNm;

    @Column(name = "tiempo_estimado_minutos")
    private Integer tiempoEstimadoMinutos;

    @Column(name = "observaciones", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "creado_por_usuario_id", nullable = false)
    private User creadoPor;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public FlightRoute() {
    }

    public Flight getFlight() { return flight; }
    public void setFlight(Flight flight) { this.flight = flight; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public Boolean getEsVersionActual() { return esVersionActual; }
    public void setEsVersionActual(Boolean esVersionActual) { this.esVersionActual = esVersionActual; }

    public BigDecimal getAltitudPies() { return altitudPies; }
    public void setAltitudPies(BigDecimal altitudPies) { this.altitudPies = altitudPies; }

    public BigDecimal getDistanciaNm() { return distanciaNm; }
    public void setDistanciaNm(BigDecimal distanciaNm) { this.distanciaNm = distanciaNm; }

    public Integer getTiempoEstimadoMinutos() { return tiempoEstimadoMinutos; }
    public void setTiempoEstimadoMinutos(Integer tiempoEstimadoMinutos) { this.tiempoEstimadoMinutos = tiempoEstimadoMinutos; }

    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String observaciones) { this.observaciones = observaciones; }

    public User getCreadoPor() { return creadoPor; }
    public void setCreadoPor(User creadoPor) { this.creadoPor = creadoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
