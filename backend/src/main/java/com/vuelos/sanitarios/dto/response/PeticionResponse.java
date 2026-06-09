package com.vuelos.sanitarios.dto.response;

import com.vuelos.sanitarios.enums.EstadoPeticion;

import java.time.LocalDate;
import java.time.LocalTime;

public class PeticionResponse {
    private Integer idPeticion;
    private LocalDate fechaPeticion;
    private LocalTime horaDespegueSolicitada;
    private EstadoPeticion estado;
    private String prioridad;
    private String observaciones;
    private String solicitanteNombre;
    private Integer idVuelo;

    public PeticionResponse() {}

    public PeticionResponse(Integer idPeticion, LocalDate fechaPeticion, LocalTime horaDespegueSolicitada, EstadoPeticion estado, String prioridad, String observaciones, String solicitanteNombre, Integer idVuelo) {
        this.idPeticion = idPeticion;
        this.fechaPeticion = fechaPeticion;
        this.horaDespegueSolicitada = horaDespegueSolicitada;
        this.estado = estado;
        this.prioridad = prioridad;
        this.observaciones = observaciones;
        this.solicitanteNombre = solicitanteNombre;
        this.idVuelo = idVuelo;
    }

    public Integer getIdPeticion() { return idPeticion; }
    public void setIdPeticion(Integer idPeticion) { this.idPeticion = idPeticion; }
    public LocalDate getFechaPeticion() { return fechaPeticion; }
    public void setFechaPeticion(LocalDate fechaPeticion) { this.fechaPeticion = fechaPeticion; }
    public LocalTime getHoraDespegueSolicitada() { return horaDespegueSolicitada; }
    public void setHoraDespegueSolicitada(LocalTime horaDespegueSolicitada) { this.horaDespegueSolicitada = horaDespegueSolicitada; }
    public EstadoPeticion getEstado() { return estado; }
    public void setEstado(EstadoPeticion estado) { this.estado = estado; }
    public String getPrioridad() { return prioridad; }
    public void setPrioridad(String prioridad) { this.prioridad = prioridad; }
    public String getObservaciones() { return observaciones; }
    public void setObservaciones(String observaciones) { this.observaciones = observaciones; }
    public String getSolicitanteNombre() { return solicitanteNombre; }
    public void setSolicitanteNombre(String solicitanteNombre) { this.solicitanteNombre = solicitanteNombre; }
    public Integer getIdVuelo() { return idVuelo; }
    public void setIdVuelo(Integer idVuelo) { this.idVuelo = idVuelo; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idPeticion;
        private LocalDate fechaPeticion;
        private LocalTime horaDespegueSolicitada;
        private EstadoPeticion estado;
        private String prioridad;
        private String observaciones;
        private String solicitanteNombre;
        private Integer idVuelo;

        public Builder idPeticion(Integer idPeticion) { this.idPeticion = idPeticion; return this; }
        public Builder fechaPeticion(LocalDate fechaPeticion) { this.fechaPeticion = fechaPeticion; return this; }
        public Builder horaDespegueSolicitada(LocalTime horaDespegueSolicitada) { this.horaDespegueSolicitada = horaDespegueSolicitada; return this; }
        public Builder estado(EstadoPeticion estado) { this.estado = estado; return this; }
        public Builder prioridad(String prioridad) { this.prioridad = prioridad; return this; }
        public Builder observaciones(String observaciones) { this.observaciones = observaciones; return this; }
        public Builder solicitanteNombre(String solicitanteNombre) { this.solicitanteNombre = solicitanteNombre; return this; }
        public Builder idVuelo(Integer idVuelo) { this.idVuelo = idVuelo; return this; }

        public PeticionResponse build() {
            return new PeticionResponse(idPeticion, fechaPeticion, horaDespegueSolicitada, estado, prioridad, observaciones, solicitanteNombre, idVuelo);
        }
    }
}
