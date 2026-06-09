package com.vuelos.sanitarios.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "notificacion")
public class Notificacion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_notificacion")
    private Integer idNotificacion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario usuario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_vuelo")
    private Vuelo vuelo;

    @Column(nullable = false, length = 50)
    private String tipo;

    @Column(nullable = false, length = 200)
    private String titulo;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String mensaje;

    @Column(nullable = false)
    private Boolean leida;

    @CreationTimestamp
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    public Notificacion() {}

    public Notificacion(Integer idNotificacion, Usuario usuario, Vuelo vuelo, String tipo, String titulo, String mensaje, Boolean leida, LocalDateTime createdAt) {
        this.idNotificacion = idNotificacion;
        this.usuario = usuario;
        this.vuelo = vuelo;
        this.tipo = tipo;
        this.titulo = titulo;
        this.mensaje = mensaje;
        this.leida = leida;
        this.createdAt = createdAt;
    }

    public Integer getIdNotificacion() { return idNotificacion; }
    public void setIdNotificacion(Integer idNotificacion) { this.idNotificacion = idNotificacion; }
    public Usuario getUsuario() { return usuario; }
    public void setUsuario(Usuario usuario) { this.usuario = usuario; }
    public Vuelo getVuelo() { return vuelo; }
    public void setVuelo(Vuelo vuelo) { this.vuelo = vuelo; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public String getTitulo() { return titulo; }
    public void setTitulo(String titulo) { this.titulo = titulo; }
    public String getMensaje() { return mensaje; }
    public void setMensaje(String mensaje) { this.mensaje = mensaje; }
    public Boolean getLeida() { return leida; }
    public void setLeida(Boolean leida) { this.leida = leida; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idNotificacion;
        private Usuario usuario;
        private Vuelo vuelo;
        private String tipo;
        private String titulo;
        private String mensaje;
        private Boolean leida;
        private LocalDateTime createdAt;

        public Builder idNotificacion(Integer idNotificacion) { this.idNotificacion = idNotificacion; return this; }
        public Builder usuario(Usuario usuario) { this.usuario = usuario; return this; }
        public Builder vuelo(Vuelo vuelo) { this.vuelo = vuelo; return this; }
        public Builder tipo(String tipo) { this.tipo = tipo; return this; }
        public Builder titulo(String titulo) { this.titulo = titulo; return this; }
        public Builder mensaje(String mensaje) { this.mensaje = mensaje; return this; }
        public Builder leida(Boolean leida) { this.leida = leida; return this; }
        public Builder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }

        public Notificacion build() {
            return new Notificacion(idNotificacion, usuario, vuelo, tipo, titulo, mensaje, leida, createdAt);
        }
    }
}
