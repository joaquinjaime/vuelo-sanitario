package com.vuelos.sanitarios.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "informe_final")
public class InformeFinal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_informe")
    private Integer idInforme;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_vuelo", nullable = false)
    private Vuelo vuelo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_usuario_creador", nullable = false)
    private Usuario usuarioCreador;

    @CreationTimestamp
    @Column(name = "fecha_creacion")
    private LocalDateTime fechaCreacion;

    @Column(name = "cambios_ocurridos", columnDefinition = "TEXT")
    private String cambiosOcurridos;

    @Column(name = "ajustes_realizados", columnDefinition = "TEXT")
    private String ajustesRealizados;

    @Column(name = "observaciones_generales", columnDefinition = "TEXT")
    private String observacionesGenerales;

    @Column(name = "archivos_adjuntos", length = 255)
    private String archivosAdjuntos;

    public InformeFinal() {}

    public InformeFinal(Integer idInforme, Vuelo vuelo, Usuario usuarioCreador, LocalDateTime fechaCreacion, String cambiosOcurridos, String ajustesRealizados, String observacionesGenerales, String archivosAdjuntos) {
        this.idInforme = idInforme;
        this.vuelo = vuelo;
        this.usuarioCreador = usuarioCreador;
        this.fechaCreacion = fechaCreacion;
        this.cambiosOcurridos = cambiosOcurridos;
        this.ajustesRealizados = ajustesRealizados;
        this.observacionesGenerales = observacionesGenerales;
        this.archivosAdjuntos = archivosAdjuntos;
    }

    public Integer getIdInforme() { return idInforme; }
    public void setIdInforme(Integer idInforme) { this.idInforme = idInforme; }
    public Vuelo getVuelo() { return vuelo; }
    public void setVuelo(Vuelo vuelo) { this.vuelo = vuelo; }
    public Usuario getUsuarioCreador() { return usuarioCreador; }
    public void setUsuarioCreador(Usuario usuarioCreador) { this.usuarioCreador = usuarioCreador; }
    public LocalDateTime getFechaCreacion() { return fechaCreacion; }
    public void setFechaCreacion(LocalDateTime fechaCreacion) { this.fechaCreacion = fechaCreacion; }
    public String getCambiosOcurridos() { return cambiosOcurridos; }
    public void setCambiosOcurridos(String cambiosOcurridos) { this.cambiosOcurridos = cambiosOcurridos; }
    public String getAjustesRealizados() { return ajustesRealizados; }
    public void setAjustesRealizados(String ajustesRealizados) { this.ajustesRealizados = ajustesRealizados; }
    public String getObservacionesGenerales() { return observacionesGenerales; }
    public void setObservacionesGenerales(String observacionesGenerales) { this.observacionesGenerales = observacionesGenerales; }
    public String getArchivosAdjuntos() { return archivosAdjuntos; }
    public void setArchivosAdjuntos(String archivosAdjuntos) { this.archivosAdjuntos = archivosAdjuntos; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idInforme;
        private Vuelo vuelo;
        private Usuario usuarioCreador;
        private LocalDateTime fechaCreacion;
        private String cambiosOcurridos;
        private String ajustesRealizados;
        private String observacionesGenerales;
        private String archivosAdjuntos;

        public Builder idInforme(Integer idInforme) { this.idInforme = idInforme; return this; }
        public Builder vuelo(Vuelo vuelo) { this.vuelo = vuelo; return this; }
        public Builder usuarioCreador(Usuario usuarioCreador) { this.usuarioCreador = usuarioCreador; return this; }
        public Builder fechaCreacion(LocalDateTime fechaCreacion) { this.fechaCreacion = fechaCreacion; return this; }
        public Builder cambiosOcurridos(String cambiosOcurridos) { this.cambiosOcurridos = cambiosOcurridos; return this; }
        public Builder ajustesRealizados(String ajustesRealizados) { this.ajustesRealizados = ajustesRealizados; return this; }
        public Builder observacionesGenerales(String observacionesGenerales) { this.observacionesGenerales = observacionesGenerales; return this; }
        public Builder archivosAdjuntos(String archivosAdjuntos) { this.archivosAdjuntos = archivosAdjuntos; return this; }

        public InformeFinal build() {
            return new InformeFinal(idInforme, vuelo, usuarioCreador, fechaCreacion, cambiosOcurridos, ajustesRealizados, observacionesGenerales, archivosAdjuntos);
        }
    }
}
