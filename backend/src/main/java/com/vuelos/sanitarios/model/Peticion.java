package com.vuelos.sanitarios.model;

import com.vuelos.sanitarios.enums.EstadoPeticion;
import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "peticion")
public class Peticion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_peticion")
    private Integer idPeticion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario usuario;

    @Column(name = "fecha_peticion", nullable = false)
    private LocalDate fechaPeticion;

    @Column(name = "hora_despegue_solicitada", nullable = false)
    private LocalTime horaDespegueSolicitada;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EstadoPeticion estado;

    @Column(length = 20)
    private String prioridad;

    @Column(columnDefinition = "TEXT")
    private String observaciones;

    @ManyToMany
    @JoinTable(
        name = "peticion_persona",
        joinColumns = @JoinColumn(name = "id_peticion"),
        inverseJoinColumns = @JoinColumn(name = "id_persona")
    )
    private List<Persona> personas = new ArrayList<>();

    @OneToOne(mappedBy = "peticion", fetch = FetchType.LAZY)
    private Vuelo vuelo;

    public Peticion() {}

    public Peticion(Integer idPeticion, Usuario usuario, LocalDate fechaPeticion, LocalTime horaDespegueSolicitada, EstadoPeticion estado, String prioridad, String observaciones, List<Persona> personas, Vuelo vuelo) {
        this.idPeticion = idPeticion;
        this.usuario = usuario;
        this.fechaPeticion = fechaPeticion;
        this.horaDespegueSolicitada = horaDespegueSolicitada;
        this.estado = estado;
        this.prioridad = prioridad;
        this.observaciones = observaciones;
        this.personas = personas;
        this.vuelo = vuelo;
    }

    public Integer getIdPeticion() { return idPeticion; }
    public void setIdPeticion(Integer idPeticion) { this.idPeticion = idPeticion; }
    public Usuario getUsuario() { return usuario; }
    public void setUsuario(Usuario usuario) { this.usuario = usuario; }
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
    public List<Persona> getPersonas() { return personas; }
    public void setPersonas(List<Persona> personas) { this.personas = personas; }
    public Vuelo getVuelo() { return vuelo; }
    public void setVuelo(Vuelo vuelo) { this.vuelo = vuelo; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idPeticion;
        private Usuario usuario;
        private LocalDate fechaPeticion;
        private LocalTime horaDespegueSolicitada;
        private EstadoPeticion estado;
        private String prioridad;
        private String observaciones;
        private List<Persona> personas = new ArrayList<>();
        private Vuelo vuelo;

        public Builder idPeticion(Integer idPeticion) { this.idPeticion = idPeticion; return this; }
        public Builder usuario(Usuario usuario) { this.usuario = usuario; return this; }
        public Builder fechaPeticion(LocalDate fechaPeticion) { this.fechaPeticion = fechaPeticion; return this; }
        public Builder horaDespegueSolicitada(LocalTime horaDespegueSolicitada) { this.horaDespegueSolicitada = horaDespegueSolicitada; return this; }
        public Builder estado(EstadoPeticion estado) { this.estado = estado; return this; }
        public Builder prioridad(String prioridad) { this.prioridad = prioridad; return this; }
        public Builder observaciones(String observaciones) { this.observaciones = observaciones; return this; }
        public Builder personas(List<Persona> personas) { this.personas = personas; return this; }
        public Builder vuelo(Vuelo vuelo) { this.vuelo = vuelo; return this; }

        public Peticion build() {
            return new Peticion(idPeticion, usuario, fechaPeticion, horaDespegueSolicitada, estado, prioridad, observaciones, personas, vuelo);
        }
    }
}
