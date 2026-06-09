package com.vuelos.sanitarios.dto.request;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalTime;

public class PeticionRequest {

    @NotNull
    @Future
    private LocalDate fechaVuelo;

    @NotNull
    private LocalTime horaDespegueSolicitada;

    private String prioridad;
    private String observaciones;

    public PeticionRequest() {}

    public PeticionRequest(LocalDate fechaVuelo, LocalTime horaDespegueSolicitada, String prioridad, String observaciones) {
        this.fechaVuelo = fechaVuelo;
        this.horaDespegueSolicitada = horaDespegueSolicitada;
        this.prioridad = prioridad;
        this.observaciones = observaciones;
    }

    public LocalDate getFechaVuelo() { return fechaVuelo; }
    public void setFechaVuelo(LocalDate fechaVuelo) { this.fechaVuelo = fechaVuelo; }
    public LocalTime getHoraDespegueSolicitada() { return horaDespegueSolicitada; }
    public void setHoraDespegueSolicitada(LocalTime horaDespegueSolicitada) { this.horaDespegueSolicitada = horaDespegueSolicitada; }
    public String getPrioridad() { return prioridad; }
    public void setPrioridad(String prioridad) { this.prioridad = prioridad; }
    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String observaciones) { this.observaciones = observaciones; }
}
