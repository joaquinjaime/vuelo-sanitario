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
import java.time.OffsetDateTime;
import java.time.LocalDateTime;

/**
 * Informe final del vuelo (horas de vuelo, combustible consumido,
 * incidentes, resumen), cargado una vez que el vuelo culmino. El
 * documento asociado se carga aparte en FlightDocument con
 * DocumentType.codigo = "INFORME_FINAL". Versionado: ver nota en
 * FlightDocument.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_informes_finales_vuelo"))
@Table(name = "informes_finales_vuelo")
public class FlightFinalReport extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_vuelos", nullable = false)
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
@JoinColumn(name = "id_usuario_creador", nullable = false)
    private User creadoPor;

    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    @Column(name = "estado_revision", nullable = false, length = 40)
    private ReportReviewStatus estadoRevision = ReportReviewStatus.PRESENTADO;

    @Column(name = "motivo_devolucion", columnDefinition = "NVARCHAR(MAX)")
    private String motivoDevolucion;

    @Column(name = "fecha_revision", columnDefinition = "DATETIMEOFFSET(3)")
    private OffsetDateTime fechaRevision;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_usuario_revisor")
    private User revisor;

    /** Procedencia de la decisión: FLUJO_ACTUAL o evidencia/falta de evidencia en datos anteriores a V42. */
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    @Column(name = "origen_decision", nullable = false, length = 40)
    private ReportDecisionOrigin origenDecision = ReportDecisionOrigin.FLUJO_ACTUAL;

    @Column(name = "adjunto_nombre_original", length = 255)
    private String adjuntoNombreOriginal;

    @Column(name = "adjunto_ubicacion", length = 255)
    private String adjuntoUbicacion;

    @Column(name = "adjunto_tamanio_bytes")
    private Long adjuntoTamanioBytes;

    @Column(name = "adjunto_sha256", length = 64, columnDefinition = "CHAR(64)")
    private String adjuntoSha256;

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

    public ReportReviewStatus getEstadoRevision() { return estadoRevision; }
    public void setEstadoRevision(ReportReviewStatus x) { this.estadoRevision = x; }
    public String getMotivoDevolucion() { return motivoDevolucion; }
    public void setMotivoDevolucion(String x) { this.motivoDevolucion = x; }
    public OffsetDateTime getFechaRevision() { return fechaRevision; }
    public void setFechaRevision(OffsetDateTime x) { this.fechaRevision = x; }
    public User getRevisor() { return revisor; }
    public void setRevisor(User x) { this.revisor = x; }

    public ReportDecisionOrigin getOrigenDecision() { return origenDecision; }
    public void setOrigenDecision(ReportDecisionOrigin x) { this.origenDecision = x; }
    public String getAdjuntoNombreOriginal() { return adjuntoNombreOriginal; }
    public void setAdjuntoNombreOriginal(String x) { this.adjuntoNombreOriginal = x; }
    public String getAdjuntoUbicacion() { return adjuntoUbicacion; }
    public void setAdjuntoUbicacion(String x) { this.adjuntoUbicacion = x; }
    public Long getAdjuntoTamanioBytes() { return adjuntoTamanioBytes; }
    public void setAdjuntoTamanioBytes(Long x) { this.adjuntoTamanioBytes = x; }
    public String getAdjuntoSha256() { return adjuntoSha256; }
    public void setAdjuntoSha256(String x) { this.adjuntoSha256 = x; }
    public boolean hasAttachment() { return adjuntoUbicacion != null; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
