package com.vuelos.sanitarios.dto.request;

import jakarta.validation.constraints.NotBlank;

public class CancelarVueloRequest {
    @NotBlank(message = "El motivo de cancelación es obligatorio")
    private String motivoCancelacion;

    public CancelarVueloRequest() {}

    public CancelarVueloRequest(String motivoCancelacion) {
        this.motivoCancelacion = motivoCancelacion;
    }

    public String getMotivoCancelacion() { return motivoCancelacion; }
    public void setMotivoCancelacion(String motivoCancelacion) { this.motivoCancelacion = motivoCancelacion; }
}
