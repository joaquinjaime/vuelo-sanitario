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
 * Informe final del vuelo (horas de vuelo, combustible consumido,
 * incidentes, resumen), cargado una vez que el vuelo culmino. El
 * documento asociado se carga aparte en FlightDocument con
 * DocumentType.codigo = "INFORME_FINAL". Versionado: ver nota en
 * FlightDocument.
 */
@Entity
@Table(name = "informes_finales_vuelo")
public class FlightFinalReport extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "vuelo_id", nullable = false)
    private Flight flight;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "es_version_actual", nullable = false)
    private Boolean esVersionActual = true;

    @Column(name = "horas_vuelo", precision = 5, scale = 2)
    private BigDecimal horasVuelo;

    @Column(name = "combustible_consumido_litros", precision = 10, scale = 2)
    private BigDecimal combustibleConsumidoLitros;

    @Column(name = "incidentes", columnDefinition = "NVARCHAR(MAX)")
    private String incidentes;

    @Column(name = "resumen", columnDefinition = "NVARCHAR(MAX)")
    private String resumen;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "creado_por_usuario_id", nullable = false)
    private User creadoPor;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public FlightFinalReport() {
    }

    public Flight getFlight() { return flight; }
    public void setFlight(Flight flight) { this.flight = flight; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public Boolean getEsVersionActual() { return esVersionActual; }
    public void setEsVersionActual(Boolean esVersionActual) { this.esVersionActual = esVersionActual; }

    public BigDecimal getHorasVuelo() { return horasVuelo; }
    public void setHorasVuelo(BigDecimal horasVuelo) { this.horasVuelo = horasVuelo; }

    public BigDecimal getCombustibleConsumidoLitros() { return combustibleConsumidoLitros; }
    public void setCombustibleConsumidoLitros(BigDecimal combustibleConsumidoLitros) { this.combustibleConsumidoLitros = combustibleConsumidoLitros; }

    public String getIncidentes() { return incidentes; }
    public void setIncidentes(String incidentes) { this.incidentes = incidentes; }

    public String getResumen() { return resumen; }
    public void setResumen(String resumen) { this.resumen = resumen; }

    public User getCreadoPor() { return creadoPor; }
    public void setCreadoPor(User creadoPor) { this.creadoPor = creadoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
