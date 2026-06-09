package com.vuelos.sanitarios.dto.response;

import java.time.LocalDateTime;

public class NotificacionResponse {
    private Integer idNotificacion;
    private Integer idVuelo;
    private String tipo;
    private String titulo;
    private String mensaje;
    private Boolean leida;
    private LocalDateTime createdAt;

    public NotificacionResponse() {}

    public NotificacionResponse(Integer idNotificacion, Integer idVuelo, String tipo, String titulo, String mensaje, Boolean leida, LocalDateTime createdAt) {
        this.idNotificacion = idNotificacion;
        this.idVuelo = idVuelo;
        this.tipo = tipo;
        this.titulo = titulo;
        this.mensaje = mensaje;
        this.leida = leida;
        this.createdAt = createdAt;
    }

    public Integer getIdNotificacion() { return idNotificacion; }
    public void setIdNotificacion(Integer idNotificacion) { this.idNotificacion = idNotificacion; }
    public Integer getIdVuelo() { return idVuelo; }
    public void setIdVuelo(Integer idVuelo) { this.idVuelo = idVuelo; }
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
        private Integer idVuelo;
        private String tipo;
        private String titulo;
        private String mensaje;
        private Boolean leida;
        private LocalDateTime createdAt;

        public Builder idNotificacion(Integer idNotificacion) { this.idNotificacion = idNotificacion; return this; }
        public Builder idVuelo(Integer idVuelo) { this.idVuelo = idVuelo; return this; }
        public Builder tipo(String tipo) { this.tipo = tipo; return this; }
        public Builder titulo(String titulo) { this.titulo = titulo; return this; }
        public Builder mensaje(String mensaje) { this.mensaje = mensaje; return this; }
        public Builder leida(Boolean leida) { this.leida = leida; return this; }
        public Builder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }

        public NotificacionResponse build() {
            return new NotificacionResponse(idNotificacion, idVuelo, tipo, titulo, mensaje, leida, createdAt);
        }
    }
}
