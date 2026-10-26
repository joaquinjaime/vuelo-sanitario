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
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_rutas_vuelo"))
@Table(name = "rutas_vuelo")
public class FlightRoute extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_vuelos", nullable = false)
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

    @Column(name = "recorrido_planificado", columnDefinition = "NVARCHAR(MAX)") private String recorrido;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_aeropuerto_alternativo") private com.vuelossanitarios.backend.domain.catalog.Airport alternativo;
    @Column(name = "contexto_operativo", length = 300) private String contexto;
    public String getRecorrido(){return recorrido;} public void setRecorrido(String v){recorrido=v;}
    public com.vuelossanitarios.backend.domain.catalog.Airport getAlternativo(){return alternativo;} public void setAlternativo(com.vuelossanitarios.backend.domain.catalog.Airport v){alternativo=v;}
    public String getContexto(){return contexto;} public void setContexto(String v){contexto=v;}

    @Column(name = "observaciones_ruta", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    /** Estado de revisión de ESTA versión (ver V55); la aprobación pertenece a la versión y al contexto con que se planificó. */
    @Column(name = "estado_revision", nullable = false, length = 25) private String estadoRevision = BORRADOR;
    @Column(name = "motivo_modificacion", length = 500) private String motivoModificacion;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_usuario_presenta") private User presentadoPor;
    @Column(name = "fecha_presentacion") private LocalDateTime fechaPresentacion;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "id_usuario_revisor") private User revisadoPor;
    @Column(name = "fecha_revision") private LocalDateTime fechaRevision;
    @Column(name = "observaciones_revision", length = 1000) private String observacionesRevision;
    @Column(name = "fecha_invalidacion") private LocalDateTime fechaInvalidacion;
    @Column(name = "causa_invalidacion", length = 500) private String causaInvalidacion;

    public static final String BORRADOR = "BORRADOR", PENDIENTE_REVISION = "PENDIENTE_REVISION", APROBADA = "APROBADA",
            DEVUELTA = "DEVUELTA", REQUIERE_REVISION = "REQUIERE_REVISION", SIN_REVISION = "SIN_REVISION";

    public String getEstadoRevision() { return estadoRevision; }
    public void setEstadoRevision(String v) { estadoRevision = v; }
    public String getMotivoModificacion() { return motivoModificacion; }
    public void setMotivoModificacion(String v) { motivoModificacion = v; }
    public User getPresentadoPor() { return presentadoPor; }
    public void setPresentadoPor(User v) { presentadoPor = v; }
    public LocalDateTime getFechaPresentacion() { return fechaPresentacion; }
    public void setFechaPresentacion(LocalDateTime v) { fechaPresentacion = v; }
    public User getRevisadoPor() { return revisadoPor; }
    public void setRevisadoPor(User v) { revisadoPor = v; }
    public LocalDateTime getFechaRevision() { return fechaRevision; }
    public void setFechaRevision(LocalDateTime v) { fechaRevision = v; }
    public String getObservacionesRevision() { return observacionesRevision; }
    public void setObservacionesRevision(String v) { observacionesRevision = v; }
    public LocalDateTime getFechaInvalidacion() { return fechaInvalidacion; }
    public void setFechaInvalidacion(LocalDateTime v) { fechaInvalidacion = v; }
    public String getCausaInvalidacion() { return causaInvalidacion; }
    public void setCausaInvalidacion(String v) { causaInvalidacion = v; }

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_usuario_creador", nullable = false)
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
