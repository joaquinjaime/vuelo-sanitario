package com.vuelos.sanitarios.dto.response;

import com.vuelos.sanitarios.enums.EstadoVuelo;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public class VueloResponse {
    private Integer idVuelo;
    private Integer idPeticion;
    private LocalDate fechaVuelo;
    private LocalTime horaDespegue;
    private LocalTime horaAterrizaje;
    private EstadoVuelo estado;
    private Boolean aprobacionCargada;
    private String motivoCancelacion;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String solicitanteNombre;
    private String solicitanteRol;

    public VueloResponse() {}

    public VueloResponse(Integer idVuelo, Integer idPeticion, LocalDate fechaVuelo, LocalTime horaDespegue, LocalTime horaAterrizaje, EstadoVuelo estado, Boolean aprobacionCargada, String motivoCancelacion, LocalDateTime createdAt, LocalDateTime updatedAt, String solicitanteNombre, String solicitanteRol) {
        this.idVuelo = idVuelo;
        this.idPeticion = idPeticion;
        this.fechaVuelo = fechaVuelo;
        this.horaDespegue = horaDespegue;
        this.horaAterrizaje = horaAterrizaje;
        this.estado = estado;
        this.aprobacionCargada = aprobacionCargada;
        this.motivoCancelacion = motivoCancelacion;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.solicitanteNombre = solicitanteNombre;
        this.solicitanteRol = solicitanteRol;
    }

    public Integer getIdVuelo() { return idVuelo; }
    public void setIdVuelo(Integer idVuelo) { this.idVuelo = idVuelo; }
    public Integer getIdPeticion() { return idPeticion; }
    public void setIdPeticion(Integer idPeticion) { this.idPeticion = idPeticion; }
    public LocalDate getFechaVuelo() { return fechaVuelo; }
    public void setFechaVuelo(LocalDate fechaVuelo) { this.fechaVuelo = fechaVuelo; }
    public LocalTime getHoraDespegue() { return horaDespegue; }
    public void setHoraDespegue(LocalTime horaDespegue) { this.horaDespegue = horaDespegue; }
    public LocalTime getHoraAterrizaje() { return horaAterrizaje; }
    public void setHoraAterrizaje(LocalTime horaAterrizaje) { this.horaAterrizaje = horaAterrizaje; }
    public EstadoVuelo getEstado() { return estado; }
    public void setEstado(EstadoVuelo estado) { this.estado = estado; }
    public Boolean getAprobacionCargada() { return aprobacionCargada; }
    public void setAprobacionCargada(Boolean aprobacionCargada) { this.aprobacionCargada = aprobacionCargada; }
    public String getMotivoCancelacion() { return motivoCancelacion; }
    public void setMotivoCancelacion(String motivoCancelacion) { this.motivoCancelacion = motivoCancelacion; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public String getSolicitanteNombre() { return solicitanteNombre; }
    public void setSolicitanteNombre(String solicitanteNombre) { this.solicitanteNombre = solicitanteNombre; }
    public String getSolicitanteRol() { return solicitanteRol; }
    public void setSolicitanteRol(String solicitanteRol) { this.solicitanteRol = solicitanteRol; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idVuelo;
        private Integer idPeticion;
        private LocalDate fechaVuelo;
        private LocalTime horaDespegue;
        private LocalTime horaAterrizaje;
        private EstadoVuelo estado;
        private Boolean aprobacionCargada;
        private String motivoCancelacion;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private String solicitanteNombre;
        private String solicitanteRol;

        public Builder idVuelo(Integer idVuelo) { this.idVuelo = idVuelo; return this; }
        public Builder idPeticion(Integer idPeticion) { this.idPeticion = idPeticion; return this; }
        public Builder fechaVuelo(LocalDate fechaVuelo) { this.fechaVuelo = fechaVuelo; return this; }
        public Builder horaDespegue(LocalTime horaDespegue) { this.horaDespegue = horaDespegue; return this; }
        public Builder horaAterrizaje(LocalTime horaAterrizaje) { this.horaAterrizaje = horaAterrizaje; return this; }
        public Builder estado(EstadoVuelo estado) { this.estado = estado; return this; }
        public Builder aprobacionCargada(Boolean aprobacionCargada) { this.aprobacionCargada = aprobacionCargada; return this; }
        public Builder motivoCancelacion(String motivoCancelacion) { this.motivoCancelacion = motivoCancelacion; return this; }
        public Builder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }
        public Builder updatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; return this; }
        public Builder solicitanteNombre(String solicitanteNombre) { this.solicitanteNombre = solicitanteNombre; return this; }
        public Builder solicitanteRol(String solicitanteRol) { this.solicitanteRol = solicitanteRol; return this; }

        public VueloResponse build() {
            return new VueloResponse(idVuelo, idPeticion, fechaVuelo, horaDespegue, horaAterrizaje, estado, aprobacionCargada, motivoCancelacion, createdAt, updatedAt, solicitanteNombre, solicitanteRol);
        }
    }
}
