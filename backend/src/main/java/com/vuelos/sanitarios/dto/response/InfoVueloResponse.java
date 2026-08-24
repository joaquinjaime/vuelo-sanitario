package com.vuelos.sanitarios.dto.response;

import com.vuelos.sanitarios.model.InfoVuelo;

/**
 * DTO de salida para la información técnica del vuelo.
 * Nunca exponemos la entidad directamente: evita proxies lazy de Hibernate
 * en la serialización y filtra el binario del PDF (solo indicador booleano).
 */
public class InfoVueloResponse {

    private Integer idFormulario;
    private String tipo;
    private String contenido;
    private boolean tienePdf;
    private String usuarioNombre;
    private String usuarioRol;
    private java.time.LocalDateTime createdAt;
    private java.time.LocalDateTime updatedAt;

    public InfoVueloResponse() {}

    public InfoVueloResponse(Integer idFormulario, String tipo, String contenido, boolean tienePdf,
                             String usuarioNombre, String usuarioRol,
                             java.time.LocalDateTime createdAt, java.time.LocalDateTime updatedAt) {
        this.idFormulario = idFormulario;
        this.tipo = tipo;
        this.contenido = contenido;
        this.tienePdf = tienePdf;
        this.usuarioNombre = usuarioNombre;
        this.usuarioRol = usuarioRol;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static InfoVueloResponse from(InfoVuelo info) {
        String nombre = "";
        String rol = null;
        if (info.getUsuario() != null) {
            var persona = info.getUsuario().getPersona();
            if (persona != null) {
                nombre = persona.getNombre() + " " + persona.getApellido();
            }
            if (info.getUsuario().getRol() != null) {
                rol = info.getUsuario().getRol().getNombreRol().name();
            }
        }
        return new InfoVueloResponse(
                info.getIdFormulario(),
                info.getTipo() != null ? info.getTipo().name() : null,
                info.getContenido(),
                info.getPdf() != null && info.getPdf().length > 0,
                nombre,
                rol,
                info.getCreatedAt(),
                info.getUpdatedAt()
        );
    }

    public Integer getIdFormulario() { return idFormulario; }
    public void setIdFormulario(Integer idFormulario) { this.idFormulario = idFormulario; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public String getContenido() { return contenido; }
    public void setContenido(String contenido) { this.contenido = contenido; }
    public boolean isTienePdf() { return tienePdf; }
    public void setTienePdf(boolean tienePdf) { this.tienePdf = tienePdf; }
    public String getUsuarioNombre() { return usuarioNombre; }
    public void setUsuarioNombre(String usuarioNombre) { this.usuarioNombre = usuarioNombre; }
    public String getUsuarioRol() { return usuarioRol; }
    public void setUsuarioRol(String usuarioRol) { this.usuarioRol = usuarioRol; }
    public java.time.LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(java.time.LocalDateTime createdAt) { this.createdAt = createdAt; }
    public java.time.LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(java.time.LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idFormulario;
        private String tipo;
        private String contenido;
        private boolean tienePdf;
        private String usuarioNombre;
        private String usuarioRol;
        private java.time.LocalDateTime createdAt;
        private java.time.LocalDateTime updatedAt;

        public Builder idFormulario(Integer v) { this.idFormulario = v; return this; }
        public Builder tipo(String v) { this.tipo = v; return this; }
        public Builder contenido(String v) { this.contenido = v; return this; }
        public Builder tienePdf(boolean v) { this.tienePdf = v; return this; }
        public Builder usuarioNombre(String v) { this.usuarioNombre = v; return this; }
        public Builder usuarioRol(String v) { this.usuarioRol = v; return this; }
        public Builder createdAt(java.time.LocalDateTime v) { this.createdAt = v; return this; }
        public Builder updatedAt(java.time.LocalDateTime v) { this.updatedAt = v; return this; }

        public InfoVueloResponse build() {
            return new InfoVueloResponse(idFormulario, tipo, contenido, tienePdf,
                    usuarioNombre, usuarioRol, createdAt, updatedAt);
        }
    }
}
