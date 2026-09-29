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
 * Registro meteorológico manual. Una futura integración puede añadir una
 * fuente externa sin convertir este registro operativo en un payload de API.
 */
@Entity
@Table(name = "instantaneas_clima")
public class WeatherSnapshot extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "vuelo_id", nullable = false)
    private Flight flight;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "registrado_por_usuario_id", nullable = false)
    private User registradoPor;

    @CreationTimestamp
    @Column(name = "fecha_registro", nullable = false, updatable = false)
    private LocalDateTime fechaRegistro;

    @Column(name = "condiciones", columnDefinition = "NVARCHAR(MAX)")
    private String condiciones;

    @Column(name = "favorable")
    private Boolean favorable;

    @Column(name = "observaciones", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    public WeatherSnapshot() {
    }

    public Flight getFlight() { return flight; }
    public void setFlight(Flight flight) { this.flight = flight; }

    public User getRegistradoPor() { return registradoPor; }
    public void setRegistradoPor(User registradoPor) { this.registradoPor = registradoPor; }

    public LocalDateTime getFechaRegistro() { return fechaRegistro; }
    public void setFechaRegistro(LocalDateTime fechaRegistro) { this.fechaRegistro = fechaRegistro; }
    public String getCondiciones() { return condiciones; }
    public void setCondiciones(String value) { condiciones = value; }
    public Boolean getFavorable() { return favorable; }
    public void setFavorable(Boolean value) { favorable = value; }

    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String observaciones) { this.observaciones = observaciones; }
}
