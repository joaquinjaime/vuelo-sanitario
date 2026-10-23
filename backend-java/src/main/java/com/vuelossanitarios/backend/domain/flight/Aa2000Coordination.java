package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.user.User;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Versión de una gestión aeroportuaria declarada manualmente; no implica
 * comunicación automática ni certificación externa.
 */
@Entity
@jakarta.persistence.AttributeOverride(name="id", column=@jakarta.persistence.Column(name="id_coordinaciones_aa2000"))
@Table(name = "coordinaciones_aa2000")
public class Aa2000Coordination extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_vuelos", nullable = false)
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

    @Column(name = "observaciones_coordinacion", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    @JdbcTypeCode(SqlTypes.UUID)
    @Column(name="identificador_gestion", nullable=false, columnDefinition="uniqueidentifier")
    private UUID gestionId;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="id_aeropuerto_gestion")
    private Airport aeropuerto;
    @Column(name="finalidad_gestion",length=200) private String finalidad;
    @Column(name="descripcion_gestion",columnDefinition="NVARCHAR(MAX)") private String descripcion;
    @Column(name="canal_comunicacion",length=100) private String canal;
    @Column(name="fecha_comunicacion") private LocalDateTime fechaComunicacion;
    @Column(name="fecha_respuesta") private LocalDateTime fechaRespuesta;
    @Column(name="fuente_respuesta",length=250) private String fuenteRespuesta;
    @Column(name="referencia_externa",length=250) private String referenciaExterna;
    @Column(name="contexto_planificacion",length=500) private String contexto;
    @Column(name="motivo_cambio",length=1000) private String motivoCambio;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "id_usuario_registrador", nullable = false)
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
    public UUID getGestionId(){return gestionId;} public void setGestionId(UUID v){gestionId=v;}
    public Airport getAeropuerto(){return aeropuerto;} public void setAeropuerto(Airport v){aeropuerto=v;}
    public String getFinalidad(){return finalidad;} public void setFinalidad(String v){finalidad=v;}
    public String getDescripcion(){return descripcion;} public void setDescripcion(String v){descripcion=v;}
    public String getCanal(){return canal;} public void setCanal(String v){canal=v;}
    public LocalDateTime getFechaComunicacion(){return fechaComunicacion;} public void setFechaComunicacion(LocalDateTime v){fechaComunicacion=v;}
    public LocalDateTime getFechaRespuesta(){return fechaRespuesta;} public void setFechaRespuesta(LocalDateTime v){fechaRespuesta=v;}
    public String getFuenteRespuesta(){return fuenteRespuesta;} public void setFuenteRespuesta(String v){fuenteRespuesta=v;}
    public String getReferenciaExterna(){return referenciaExterna;} public void setReferenciaExterna(String v){referenciaExterna=v;}
    public String getContexto(){return contexto;} public void setContexto(String v){contexto=v;}
    public String getMotivoCambio(){return motivoCambio;} public void setMotivoCambio(String v){motivoCambio=v;}

    public User getRegistradoPor() { return registradoPor; }
    public void setRegistradoPor(User registradoPor) { this.registradoPor = registradoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
