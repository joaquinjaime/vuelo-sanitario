package com.vuelos.sanitarios.dto.request;

import com.vuelos.sanitarios.enums.TipoInfoVuelo;
import jakarta.validation.constraints.NotNull;

public class InfoVueloRequest {
    @NotNull
    private TipoInfoVuelo tipo;
    private String contenido;

    public InfoVueloRequest() {}

    public InfoVueloRequest(TipoInfoVuelo tipo, String contenido) {
        this.tipo = tipo;
        this.contenido = contenido;
    }

    public TipoInfoVuelo getTipo() { return tipo; }
    public void setTipo(TipoInfoVuelo tipo) { this.tipo = tipo; }
    public String getContenido() { return contenido; }
    public void setContenido(String contenido) { this.contenido = contenido; }
}
