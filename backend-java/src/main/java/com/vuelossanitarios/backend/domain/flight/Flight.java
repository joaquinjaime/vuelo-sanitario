package com.vuelossanitarios.backend.domain.flight;

import com.vuelossanitarios.backend.domain.catalog.Aircraft;
import com.vuelossanitarios.backend.domain.catalog.Airport;
import com.vuelossanitarios.backend.domain.catalog.FlightStatus;
import com.vuelossanitarios.backend.domain.catalog.FlightPriority;
import com.vuelossanitarios.backend.domain.common.BaseEntity;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Entidad central del dominio. Agrupa las tres etapas del flujo:
 * solicitud (DTS), evaluacion (Operaciones) y planificacion (Comandante),
 * mas los datos de cancelacion agregados en la migracion V2.
 */
@Entity
@Table(name = "vuelos")
public class Flight extends BaseEntity {

    @Column(name = "codigo", nullable = false, unique = true, length = 30)
    private String codigo;

    // ---- Solicitud (Direccion de Transito Sanitario) ----

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "paciente_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "solicitado_por_usuario_id", nullable = false)
    private User solicitadoPor;

    @Column(name = "fecha_solicitada", nullable = false)
    private LocalDateTime fechaSolicitada;

    @Column(name = "extrema_urgencia", nullable = false)
    private Boolean extremaUrgencia = false;

    @Column(name = "justificacion_extrema_urgencia", columnDefinition = "NVARCHAR(MAX)")
    private String justificacionExtremaUrgencia;

    @Column(name = "fecha_limite_traslado")
    private LocalDateTime fechaLimiteTraslado;

    @Column(name = "motivo_solicitud", columnDefinition = "NVARCHAR(MAX)")
    private String motivoSolicitud;

    // ---- Evaluacion (Centro de Operaciones) ----

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "estado_id", nullable = false)
    private FlightStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "prioridad_id")
    private FlightPriority priority;

    @Column(name = "ciudad_origen_solicitada", length = 100)
    private String ciudadOrigenSolicitada;

    @Column(name = "ciudad_destino_solicitada", length = 100)
    private String ciudadDestinoSolicitada;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "evaluado_por_usuario_id")
    private User evaluadoPor;

    @Column(name = "fecha_evaluacion")
    private LocalDateTime fechaEvaluacion;

    @Column(name = "motivo_rechazo", columnDefinition = "NVARCHAR(MAX)")
    private String motivoRechazo;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "aeronave_id")
    private Aircraft aircraft;

    // ---- Planificacion (Comandante) ----

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "comandante_usuario_id")
    private User comandante;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "origen_id")
    private Airport origen;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "destino_id")
    private Airport destino;

    @Column(name = "fecha_planificada_salida")
    private LocalDateTime fechaPlanificadaSalida;

    @Column(name = "fecha_planificada_llegada")
    private LocalDateTime fechaPlanificadaLlegada;

    // ---- Ejecucion ----

    @Column(name = "fecha_salida_real")
    private LocalDateTime fechaSalidaReal;

    @Column(name = "fecha_llegada_real")
    private LocalDateTime fechaLlegadaReal;

    // ---- Cancelacion (V2) ----

    @Column(name = "motivo_cancelacion", columnDefinition = "NVARCHAR(MAX)")
    private String motivoCancelacion;

    @Column(name = "fecha_cancelacion")
    private LocalDateTime fechaCancelacion;

    @ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "cancelado_por_usuario_id")
    private User canceladoPor;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
@Column(name = "fecha_actualizacion", nullable = false)
    private LocalDateTime updatedAt;

    public Flight() {
    }

    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }

    public Patient getPatient() { return patient; }
    public void setPatient(Patient patient) { this.patient = patient; }

    public User getSolicitadoPor() { return solicitadoPor; }
    public void setSolicitadoPor(User solicitadoPor) { this.solicitadoPor = solicitadoPor; }

    public LocalDateTime getFechaSolicitada() { return fechaSolicitada; }
    public void setFechaSolicitada(LocalDateTime fechaSolicitada) { this.fechaSolicitada = fechaSolicitada; }
    public Boolean getExtremaUrgencia() { return extremaUrgencia; }
    public void setExtremaUrgencia(Boolean extremaUrgencia) { this.extremaUrgencia = extremaUrgencia; }
    public String getJustificacionExtremaUrgencia() { return justificacionExtremaUrgencia; }
    public void setJustificacionExtremaUrgencia(String value) { this.justificacionExtremaUrgencia = value; }
    public LocalDateTime getFechaLimiteTraslado() { return fechaLimiteTraslado; }
    public void setFechaLimiteTraslado(LocalDateTime value) { this.fechaLimiteTraslado = value; }

    public String getMotivoSolicitud() { return motivoSolicitud; }
    public void setMotivoSolicitud(String motivoSolicitud) { this.motivoSolicitud = motivoSolicitud; }

    public FlightStatus getStatus() { return status; }
    public void setStatus(FlightStatus status) { this.status = status; }

    public FlightPriority getPriority() { return priority; }
    public void setPriority(FlightPriority priority) { this.priority = priority; }
    public String getCiudadOrigenSolicitada() { return ciudadOrigenSolicitada; }
    public void setCiudadOrigenSolicitada(String value) { ciudadOrigenSolicitada = value; }
    public String getCiudadDestinoSolicitada() { return ciudadDestinoSolicitada; }
    public void setCiudadDestinoSolicitada(String value) { ciudadDestinoSolicitada = value; }

    public User getEvaluadoPor() { return evaluadoPor; }
    public void setEvaluadoPor(User evaluadoPor) { this.evaluadoPor = evaluadoPor; }

    public LocalDateTime getFechaEvaluacion() { return fechaEvaluacion; }
    public void setFechaEvaluacion(LocalDateTime fechaEvaluacion) { this.fechaEvaluacion = fechaEvaluacion; }

    public String getMotivoRechazo() { return motivoRechazo; }
    public void setMotivoRechazo(String motivoRechazo) { this.motivoRechazo = motivoRechazo; }

    public Aircraft getAircraft() { return aircraft; }
    public void setAircraft(Aircraft aircraft) { this.aircraft = aircraft; }

    public User getComandante() { return comandante; }
    public void setComandante(User comandante) { this.comandante = comandante; }

    public Airport getOrigen() { return origen; }
    public void setOrigen(Airport origen) { this.origen = origen; }

    public Airport getDestino() { return destino; }
    public void setDestino(Airport destino) { this.destino = destino; }

    public LocalDateTime getFechaPlanificadaSalida() { return fechaPlanificadaSalida; }
    public void setFechaPlanificadaSalida(LocalDateTime fechaPlanificadaSalida) { this.fechaPlanificadaSalida = fechaPlanificadaSalida; }

    public LocalDateTime getFechaPlanificadaLlegada() { return fechaPlanificadaLlegada; }
    public void setFechaPlanificadaLlegada(LocalDateTime fechaPlanificadaLlegada) { this.fechaPlanificadaLlegada = fechaPlanificadaLlegada; }

    public LocalDateTime getFechaSalidaReal() { return fechaSalidaReal; }
    public void setFechaSalidaReal(LocalDateTime fechaSalidaReal) { this.fechaSalidaReal = fechaSalidaReal; }

    public LocalDateTime getFechaLlegadaReal() { return fechaLlegadaReal; }
    public void setFechaLlegadaReal(LocalDateTime fechaLlegadaReal) { this.fechaLlegadaReal = fechaLlegadaReal; }

    public String getMotivoCancelacion() { return motivoCancelacion; }
    public void setMotivoCancelacion(String motivoCancelacion) { this.motivoCancelacion = motivoCancelacion; }

    public LocalDateTime getFechaCancelacion() { return fechaCancelacion; }
    public void setFechaCancelacion(LocalDateTime fechaCancelacion) { this.fechaCancelacion = fechaCancelacion; }

    public User getCanceladoPor() { return canceladoPor; }
    public void setCanceladoPor(User canceladoPor) { this.canceladoPor = canceladoPor; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
