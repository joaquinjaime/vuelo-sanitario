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

import java.time.LocalDateTime;

/**
 * Coordinacion con AA2000 (Aeropuertos Argentina): slot horario,
 * contacto y estado de autorizacion. El documento de autorizacion
 * asociado se carga aparte en FlightDocument con
 * DocumentType.codigo = "AA2000". Versionado: ver nota en FlightDocument.
 */
@Entity
@Table(name = "coordinaciones_aa2000")
public class Aa2000Coordination extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "vuelo_id", nullable = false)
    private Flight flight;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "es_version_actual", nullable = false)
    private Boolean esVersionActual = true;

    @Column(name = "fecha_slot")
    private LocalDateTime fechaSlot;

    @Column(name = "contacto_aa2000", length = 150)
    private String contactoAa2000;

    /** Valores esperados (CHECK en la base): PENDIENTE, CONFIRMADO, RECHAZADO */
    @Column(name = "estado_autorizacion", nullable = false, length = 30)
    private String estadoAutorizacion = "PENDIENTE";

    @Column(name = "observaciones", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "registrado_por_usuario_id", nullable = false)
    private User registradoPor;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Aa2000Coordination() {
    }

    public Flight getFlight() { return flight; }
    public void setFlight(Flight flight) { this.flight = flight; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public Boolean getEsVersionActual() { return esVersionActual; }
    public void setEsVersionActual(Boolean esVersionActual) { this.esVersionActual = esVersionActual; }

    public LocalDateTime getFechaSlot() { return fechaSlot; }
    public void setFechaSlot(LocalDateTime fechaSlot) { this.fechaSlot = fechaSlot; }

    public String getContactoAa2000() { return contactoAa2000; }
    public void setContactoAa2000(String contactoAa2000) { this.contactoAa2000 = contactoAa2000; }

    public String getEstadoAutorizacion() { return estadoAutorizacion; }
    public void setEstadoAutorizacion(String estadoAutorizacion) { this.estadoAutorizacion = estadoAutorizacion; }

    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String observaciones) { this.observaciones = observaciones; }

    public User getRegistradoPor() { return registradoPor; }
    public void setRegistradoPor(User registradoPor) { this.registradoPor = registradoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
