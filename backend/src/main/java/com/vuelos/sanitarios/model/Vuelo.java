package com.vuelos.sanitarios.model;

import com.vuelos.sanitarios.enums.EstadoVuelo;
import jakarta.persistence.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "vuelo")
public class Vuelo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_vuelo")
    private Integer idVuelo;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_peticion", nullable = false)
    private Peticion peticion;

    @Column(name = "fecha_vuelo", nullable = false)
    private LocalDate fechaVuelo;

    @Column(name = "hora_despegue", nullable = false)
    private LocalTime horaDespegue;

    @Column(name = "hora_aterrizaje")
    private LocalTime horaAterrizaje;

    @Column(name = "hora_cancelacion")
    private LocalTime horaCancelacion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EstadoVuelo estado;

    @Column(name = "motivo_cancelacion", length = 255)
    private String motivoCancelacion;

    @Column(name = "aprobacion_cargada")
    private Boolean aprobacionCargada;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @ManyToMany
    @JoinTable(
        name = "vuelo_persona",
        joinColumns = @JoinColumn(name = "id_vuelo"),
        inverseJoinColumns = @JoinColumn(name = "id_persona")
    )
    private List<Persona> personas = new ArrayList<>();

    @OneToMany(mappedBy = "vuelo", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private List<HistorialVuelo> historial = new ArrayList<>();

    @OneToMany(mappedBy = "vuelo", fetch = FetchType.LAZY, cascade = CascadeType.ALL)
    private List<InfoVuelo> infoVuelos = new ArrayList<>();

    @OneToOne(mappedBy = "vuelo", fetch = FetchType.LAZY)
    private InformeFinal informeFinal;

    public Vuelo() {}

    public Vuelo(Integer idVuelo, Peticion peticion, LocalDate fechaVuelo, LocalTime horaDespegue, LocalTime horaAterrizaje, LocalTime horaCancelacion, EstadoVuelo estado, String motivoCancelacion, Boolean aprobacionCargada, LocalDateTime createdAt, LocalDateTime updatedAt, List<Persona> personas, List<HistorialVuelo> historial, List<InfoVuelo> infoVuelos, InformeFinal informeFinal) {
        this.idVuelo = idVuelo;
        this.peticion = peticion;
        this.fechaVuelo = fechaVuelo;
        this.horaDespegue = horaDespegue;
        this.horaAterrizaje = horaAterrizaje;
        this.horaCancelacion = horaCancelacion;
        this.estado = estado;
        this.motivoCancelacion = motivoCancelacion;
        this.aprobacionCargada = aprobacionCargada;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.personas = personas;
        this.historial = historial;
        this.infoVuelos = infoVuelos;
        this.informeFinal = informeFinal;
    }

    public Integer getIdVuelo() { return idVuelo; }
    public void setIdVuelo(Integer idVuelo) { this.idVuelo = idVuelo; }
    public Peticion getPeticion() { return peticion; }
    public void setPeticion(Peticion peticion) { this.peticion = peticion; }
    public LocalDate getFechaVuelo() { return fechaVuelo; }
    public void setFechaVuelo(LocalDate fechaVuelo) { this.fechaVuelo = fechaVuelo; }
    public LocalTime getHoraDespegue() { return horaDespegue; }
    public void setHoraDespegue(LocalTime horaDespegue) { this.horaDespegue = horaDespegue; }
    public LocalTime getHoraAterrizaje() { return horaAterrizaje; }
    public void setHoraAterrizaje(LocalTime horaAterrizaje) { this.horaAterrizaje = horaAterrizaje; }
    public LocalTime getHoraCancelacion() { return horaCancelacion; }
    public void setHoraCancelacion(LocalTime horaCancelacion) { this.horaCancelacion = horaCancelacion; }
    public EstadoVuelo getEstado() { return estado; }
    public void setEstado(EstadoVuelo estado) { this.estado = estado; }
    public String getMotivoCancelacion() { return motivoCancelacion; }
    public void setMotivoCancelacion(String motivoCancelacion) { this.motivoCancelacion = motivoCancelacion; }
    public Boolean getAprobacionCargada() { return aprobacionCargada; }
    public void setAprobacionCargada(Boolean aprobacionCargada) { this.aprobacionCargada = aprobacionCargada; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public List<Persona> getPersonas() { return personas; }
    public void setPersonas(List<Persona> personas) { this.personas = personas; }
    public List<HistorialVuelo> getHistorial() { return historial; }
    public void setHistorial(List<HistorialVuelo> historial) { this.historial = historial; }
    public List<InfoVuelo> getInfoVuelos() { return infoVuelos; }
    public void setInfoVuelos(List<InfoVuelo> infoVuelos) { this.infoVuelos = infoVuelos; }
    public InformeFinal getInformeFinal() { return informeFinal; }
    public void setInformeFinal(InformeFinal informeFinal) { this.informeFinal = informeFinal; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Integer idVuelo;
        private Peticion peticion;
        private LocalDate fechaVuelo;
        private LocalTime horaDespegue;
        private LocalTime horaAterrizaje;
        private LocalTime horaCancelacion;
        private EstadoVuelo estado;
        private String motivoCancelacion;
        private Boolean aprobacionCargada;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private List<Persona> personas = new ArrayList<>();
        private List<HistorialVuelo> historial = new ArrayList<>();
        private List<InfoVuelo> infoVuelos = new ArrayList<>();
        private InformeFinal informeFinal;

        public Builder idVuelo(Integer idVuelo) { this.idVuelo = idVuelo; return this; }
        public Builder peticion(Peticion peticion) { this.peticion = peticion; return this; }
        public Builder fechaVuelo(LocalDate fechaVuelo) { this.fechaVuelo = fechaVuelo; return this; }
        public Builder horaDespegue(LocalTime horaDespegue) { this.horaDespegue = horaDespegue; return this; }
        public Builder horaAterrizaje(LocalTime horaAterrizaje) { this.horaAterrizaje = horaAterrizaje; return this; }
        public Builder horaCancelacion(LocalTime horaCancelacion) { this.horaCancelacion = horaCancelacion; return this; }
        public Builder estado(EstadoVuelo estado) { this.estado = estado; return this; }
        public Builder motivoCancelacion(String motivoCancelacion) { this.motivoCancelacion = motivoCancelacion; return this; }
        public Builder aprobacionCargada(Boolean aprobacionCargada) { this.aprobacionCargada = aprobacionCargada; return this; }
        public Builder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }
        public Builder updatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; return this; }
        public Builder personas(List<Persona> personas) { this.personas = personas; return this; }
        public Builder historial(List<HistorialVuelo> historial) { this.historial = historial; return this; }
        public Builder infoVuelos(List<InfoVuelo> infoVuelos) { this.infoVuelos = infoVuelos; return this; }
        public Builder informeFinal(InformeFinal informeFinal) { this.informeFinal = informeFinal; return this; }

        public Vuelo build() {
            return new Vuelo(idVuelo, peticion, fechaVuelo, horaDespegue, horaAterrizaje, horaCancelacion, estado, motivoCancelacion, aprobacionCargada, createdAt, updatedAt, personas, historial, infoVuelos, informeFinal);
        }
    }
}
