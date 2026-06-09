package com.vuelos.sanitarios.dto.response;

import java.time.LocalDateTime;

public class HistorialResponse {
    private Integer idHistorial;
    private String accion;
    private String datosAnteriores;
    private String datosNuevos;
    private LocalDateTime fechaHoraModificacion;
    private String comentarios;
    private String usuarioNombre;
    private String usuarioRol;

    public HistorialResponse() {}

    public HistorialResponse(Integer idHistorial, String accion, String datosAnteriores, String datosNuevos, LocalDateTime fechaHoraModificacion, String comentarios, String usuarioNombre, String usuarioRol) {
        this.idHistorial = idHistorial;
        this.accion = accion;
        this.datosAnteriores = datosAnteriores;
        this.datosNuevos = datosNuevos;
        this.fechaHoraModificacion = fechaHoraModificacion;
        this.comentarios = comentarios;
        this.usuarioNombre = usuarioNombre;
        this.usuarioRol = usuarioRol;
    }

    public Integer getIdHistorial() { return idHistorial; }
    public void setIdHistorial(Integer idHistorial) { this.idHistorial = idHistorial; }
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
    public String getUsuarioNombre() { return usuarioNombre; }
    public void setUsuarioNombre(String usuarioNombre) { this.usuarioNombre = usuarioNombre; }
    public String getUsuarioRol() { return usuarioRol; }
    public void setUsuarioRol(String usuarioRol) { this.usuarioRol = usuarioRol; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idHistorial;
        private String accion;
        private String datosAnteriores;
        private String datosNuevos;
        private LocalDateTime fechaHoraModificacion;
        private String comentarios;
        private String usuarioNombre;
        private String usuarioRol;

        public Builder idHistorial(Integer idHistorial) { this.idHistorial = idHistorial; return this; }
        public Builder accion(String accion) { this.accion = accion; return this; }
        public Builder datosAnteriores(String datosAnteriores) { this.datosAnteriores = datosAnteriores; return this; }
        public Builder datosNuevos(String datosNuevos) { this.datosNuevos = datosNuevos; return this; }
        public Builder fechaHoraModificacion(LocalDateTime fechaHoraModificacion) { this.fechaHoraModificacion = fechaHoraModificacion; return this; }
        public Builder comentarios(String comentarios) { this.comentarios = comentarios; return this; }
        public Builder usuarioNombre(String usuarioNombre) { this.usuarioNombre = usuarioNombre; return this; }
        public Builder usuarioRol(String usuarioRol) { this.usuarioRol = usuarioRol; return this; }

        public HistorialResponse build() {
            return new HistorialResponse(idHistorial, accion, datosAnteriores, datosNuevos, fechaHoraModificacion, comentarios, usuarioNombre, usuarioRol);
        }
    }
}
