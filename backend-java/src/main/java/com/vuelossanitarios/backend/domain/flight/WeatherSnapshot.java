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
 * Snapshot de clima consultado/guardado por el Comandante. "fuente"
 * distingue si se cargo a mano (MANUAL) o vino de una API externa
 * (API_EXTERNA), que se integrara mas adelante. "datosClima" guarda
 * el JSON crudo como texto (columna NVARCHAR(MAX) con CHECK ISJSON
 * en la base).
 */
@Entity
@Table(name = "instantaneas_clima")
public class WeatherSnapshot extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "vuelo_id", nullable = false)
    private Flight flight;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "consultado_por_usuario_id", nullable = false)
    private User consultadoPor;

    @CreationTimestamp
    @Column(name = "fecha_consulta", nullable = false, updatable = false)
    private LocalDateTime fechaConsulta;

    @Column(name = "fuente", nullable = false, length = 50)
    private String fuente = "MANUAL";

    @Column(name = "proveedor_api", length = 100)
    private String proveedorApi;

    @Column(name = "datos_clima", columnDefinition = "NVARCHAR(MAX)")
    private String datosClima;

    @Column(name = "apto_para_volar")
    private Boolean aptoParaVolar;

    @Column(name = "observaciones", columnDefinition = "NVARCHAR(MAX)")
    private String observaciones;

    public WeatherSnapshot() {
    }

    public Flight getFlight() { return flight; }
    public void setFlight(Flight flight) { this.flight = flight; }

    public User getConsultadoPor() { return consultadoPor; }
    public void setConsultadoPor(User consultadoPor) { this.consultadoPor = consultadoPor; }

    public LocalDateTime getFechaConsulta() { return fechaConsulta; }
    public void setFechaConsulta(LocalDateTime fechaConsulta) { this.fechaConsulta = fechaConsulta; }

    public String getFuente() { return fuente; }
    public void setFuente(String fuente) { this.fuente = fuente; }

    public String getProveedorApi() { return proveedorApi; }
    public void setProveedorApi(String proveedorApi) { this.proveedorApi = proveedorApi; }

    public String getDatosClima() { return datosClima; }
    public void setDatosClima(String datosClima) { this.datosClima = datosClima; }

    public Boolean getAptoParaVolar() { return aptoParaVolar; }
    public void setAptoParaVolar(Boolean aptoParaVolar) { this.aptoParaVolar = aptoParaVolar; }

    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String observaciones) { this.observaciones = observaciones; }
}
