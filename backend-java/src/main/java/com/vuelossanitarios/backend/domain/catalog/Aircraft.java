package com.vuelossanitarios.backend.domain.catalog;

import com.vuelossanitarios.backend.domain.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "aeronaves")
public class Aircraft extends BaseEntity {

    @Column(name = "matricula", nullable = false, unique = true, length = 20)
    private String matricula;

    @Column(name = "modelo", nullable = false, length = 100)
    private String modelo;

    @Column(name = "tipo", nullable = false, length = 50)
    private String tipo;

    @Column(name = "capacidad_pacientes", nullable = false)
    private Short capacidadPacientes = 1;

    @Column(name = "capacidad_tripulacion", nullable = false)
    private Short capacidadTripulacion = 2;

    @Column(name = "equipamiento_medico", columnDefinition = "NVARCHAR(MAX)")
    private String equipamientoMedico;

    @Column(name = "activo", nullable = false)
    private Boolean activo = true;

    /** Aeropuerto físico en el que se encuentra mientras no ejecuta un vuelo. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "aeropuerto_actual_id")
    private Airport aeropuertoActual;

    @CreationTimestamp
@Column(name = "fecha_creacion", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Aircraft() {
    }

    public String getMatricula() { return matricula; }
    public void setMatricula(String matricula) { this.matricula = matricula; }

    public String getModelo() { return modelo; }
    public void setModelo(String modelo) { this.modelo = modelo; }

    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }

    public Short getCapacidadPacientes() { return capacidadPacientes; }
    public void setCapacidadPacientes(Short capacidadPacientes) { this.capacidadPacientes = capacidadPacientes; }

    public Short getCapacidadTripulacion() { return capacidadTripulacion; }
    public void setCapacidadTripulacion(Short capacidadTripulacion) { this.capacidadTripulacion = capacidadTripulacion; }

    public String getEquipamientoMedico() { return equipamientoMedico; }
    public void setEquipamientoMedico(String equipamientoMedico) { this.equipamientoMedico = equipamientoMedico; }

    public Boolean getActivo() { return activo; }
    public void setActivo(Boolean activo) { this.activo = activo; }

    public Airport getAeropuertoActual() { return aeropuertoActual; }
    public void setAeropuertoActual(Airport aeropuertoActual) { this.aeropuertoActual = aeropuertoActual; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
