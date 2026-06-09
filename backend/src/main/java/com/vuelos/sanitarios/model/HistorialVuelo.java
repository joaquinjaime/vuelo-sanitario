package com.vuelos.sanitarios.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "historial_vuelo")
public class HistorialVuelo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_historial")
    private Integer idHistorial;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_vuelo", nullable = false)
    private Vuelo vuelo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_usuario_cambio", nullable = false)
    private Usuario usuarioCambio;

    @Column(nullable = false, length = 50)
    private String accion;

    @Column(name = "datos_anteriores", columnDefinition = "TEXT")
    private String datosAnteriores;

    @Column(name = "datos_nuevos", columnDefinition = "TEXT")
    private String datosNuevos;

    @CreationTimestamp
    @Column(name = "fecha_hora_modificacion")
    private LocalDateTime fechaHoraModificacion;

    @Column(columnDefinition = "TEXT")
    private String comentarios;

    public HistorialVuelo() {}

    public HistorialVuelo(Integer idHistorial, Vuelo vuelo, Usuario usuarioCambio, String accion, String datosAnteriores, String datosNuevos, LocalDateTime fechaHoraModificacion, String comentarios) {
        this.idHistorial = idHistorial;
        this.vuelo = vuelo;
        this.usuarioCambio = usuarioCambio;
        this.accion = accion;
        this.datosAnteriores = datosAnteriores;
        this.datosNuevos = datosNuevos;
        this.fechaHoraModificacion = fechaHoraModificacion;
        this.comentarios = comentarios;
    }

    public Integer getIdHistorial() { return idHistorial; }
    public void setIdHistorial(Integer idHistorial) { this.idHistorial = idHistorial; }
    public Vuelo getVuelo() { return vuelo; }
    public void setVuelo(Vuelo vuelo) { this.vuelo = vuelo; }
    public Usuario getUsuarioCambio() { return usuarioCambio; }
    public void setUsuarioCambio(Usuario usuarioCambio) { this.usuarioCambio = usuarioCambio; }
    public String getAccion() { return accion; }
    public void setAccion(String accion) { this.accion = accion; }
    public String getDatosAnteriores() { return datosAnteriores; }
    public void setDatosAnteriores(String datosAnteriores) { this.datosAnteriores = datosAnteriores; }
    public String getDatosNuevos() { return datosNuevos; }
    public void setDatosNuevos(String datosNuevos) { this.datosNuevos = datosNuevos; }
    public LocalDateTime getFechaHoraModificacion() { return fechaHoraModificacion; }
    public void setFechaHoraModificacion(LocalDateTime fechaHoraModificacion) { this.fechaHoraModificacion = fechaHoraModificacion; }
    public String getComentarios() { return comentarios; }
    public void setComentarios(String comentarios) { this.comentarios = comentarios; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idHistorial;
        private Vuelo vuelo;
        private Usuario usuarioCambio;
        private String accion;
        private String datosAnteriores;
        private String datosNuevos;
        private LocalDateTime fechaHoraModificacion;
        private String comentarios;

        public Builder idHistorial(Integer idHistorial) { this.idHistorial = idHistorial; return this; }
        public Builder vuelo(Vuelo vuelo) { this.vuelo = vuelo; return this; }
        public Builder usuarioCambio(Usuario usuarioCambio) { this.usuarioCambio = usuarioCambio; return this; }
        public Builder accion(String accion) { this.accion = accion; return this; }
        public Builder datosAnteriores(String datosAnteriores) { this.datosAnteriores = datosAnteriores; return this; }
        public Builder datosNuevos(String datosNuevos) { this.datosNuevos = datosNuevos; return this; }
        public Builder fechaHoraModificacion(LocalDateTime fechaHoraModificacion) { this.fechaHoraModificacion = fechaHoraModificacion; return this; }
        public Builder comentarios(String comentarios) { this.comentarios = comentarios; return this; }

        public HistorialVuelo build() {
            return new HistorialVuelo(idHistorial, vuelo, usuarioCambio, accion, datosAnteriores, datosNuevos, fechaHoraModificacion, comentarios);
        }
    }
}
